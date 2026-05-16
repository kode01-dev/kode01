import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { maskEmailAddress } from '@/lib/security/email-mask';
import { getAdminActorSessionOrNull, isUserCurrentlyBlocked } from './_lib';
import { fetchAuthUsersById } from './auth-hydration';
import type {
  AdminPlanType,
  AdminUserListItem,
  AdminUserPlanFilter,
  AdminUserRole,
  AdminUserRoleFilter,
  AdminUserStatusFilter,
} from '@/features/admin/users/types';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(120).optional().default(''),
  role: z.enum(['all', 'buyer', 'seller', 'admin']).default('all'),
  plan: z.enum(['all', 'free', 'pro']).default('all'),
  status: z.enum(['all', 'active', 'blocked']).default('all'),
});

type ProfileRow = {
  id: string;
  role: AdminUserRole;
  plan_type: AdminPlanType;
  display_name: string | null;
  shop_name: string | null;
  created_at: string;
};

const PROFILE_FETCH_BATCH_SIZE = 1000;

type HydratedAdminUser = AdminUserListItem & {
  rawEmail: string | null;
};

async function fetchProfiles(args: {
  role: AdminUserRoleFilter;
  plan: AdminUserPlanFilter;
}): Promise<ProfileRow[]> {
  const admin = createAdminClient();
  const rows: ProfileRow[] = [];

  for (let start = 0; ; start += PROFILE_FETCH_BATCH_SIZE) {
    let query = admin
      .from('profiles')
      .select('id, role, plan_type, display_name, shop_name, created_at')
      .order('created_at', { ascending: false })
      .range(start, start + PROFILE_FETCH_BATCH_SIZE - 1);

    if (args.role !== 'all') query = query.eq('role', args.role);
    if (args.plan !== 'all') query = query.eq('plan_type', args.plan);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load profiles: ${error.message}`);

    const batch = (data ?? []) as ProfileRow[];
    rows.push(...batch);

    if (batch.length < PROFILE_FETCH_BATCH_SIZE) break;
  }

  return rows;
}

function resolveDisplayName(profile: ProfileRow, email: string | null): string {
  return (
    profile.display_name?.trim()
    || profile.shop_name?.trim()
    || email?.split('@')[0]
    || profile.id.slice(0, 8)
  );
}

function matchesSearch(item: HydratedAdminUser, q: string): boolean {
  if (!q) return true;
  const normalized = q.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    item.displayName,
    item.rawEmail ?? '',
    item.email ?? '',
    item.id,
    item.role,
    item.planType,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalized);
}

function matchesStatus(item: HydratedAdminUser, status: AdminUserStatusFilter): boolean {
  if (status === 'all') return true;
  return status === 'blocked' ? item.isBlocked : !item.isBlocked;
}

export async function GET(request: Request) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;

  try {
    const adminSession = await getAdminActorSessionOrNull();
    if (!adminSession) {
      await logAuditEvent({
        eventType: 'admin.users.list.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const searchParams = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      q: searchParams.get('q') ?? undefined,
      role: searchParams.get('role') ?? undefined,
      plan: searchParams.get('plan') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    });

    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'admin.users.list.failed.validation',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
            message: issue.message,
          })),
        },
      });
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
    }

    const { page, pageSize, q, role, plan, status } = parsed.data;
    const profiles = await fetchProfiles({ role, plan });
    const admin = createAdminClient();
    const authUsersById = await fetchAuthUsersById({
      admin,
      profileIds: profiles.map((profile) => profile.id),
    });
    const hydratedUsers: HydratedAdminUser[] = profiles.map((profile) => {
      const authUser = authUsersById.get(profile.id) ?? null;
      const email = authUser?.email ?? null;
      const bannedUntil = authUser?.banned_until ?? null;

      return {
        id: profile.id,
        displayName: resolveDisplayName(profile, email),
        email: maskEmailAddress(email),
        rawEmail: email,
        role: profile.role,
        planType: profile.plan_type,
        createdAt: profile.created_at,
        lastSignInAt: authUser?.last_sign_in_at ?? null,
        bannedUntil,
        isBlocked: isUserCurrentlyBlocked(bannedUntil),
      } satisfies HydratedAdminUser;
    });

    const filtered = hydratedUsers
      .filter((item) => matchesSearch(item, q))
      .filter((item) => matchesStatus(item, status));

    const total = filtered.length;
    const blockedUsers = filtered.filter((item) => item.isBlocked).length;
    const activeUsers = total - blockedUsers;
    const offset = (page - 1) * pageSize;
    const data = filtered.slice(offset, offset + pageSize).map((user) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { rawEmail, ...item } = user;
      return item;
    });

    return NextResponse.json({
      data,
      page,
      pageSize,
      total,
      summary: {
        totalUsers: total,
        activeUsers,
        blockedUsers,
      },
    });
  } catch (error) {
    console.error('GET /api/admin/users error:', error);
    await logAuditEvent({
      eventType: 'admin.users.list.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

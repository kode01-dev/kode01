'use server';

import { revalidatePath } from 'next/cache';
import { addRestrictedName, deleteRestrictedName } from '../server/restricted-names-repository';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { logAuditEvent, getAuditContextFromHeaders } from '@/lib/security/audit';
import { headers } from 'next/headers';
import { getUserRoleWithAdminFallback } from '@/lib/auth/admin-role';
import { isAdminRole } from '@/lib/auth/roles';

const schema = z.object({
  keyword: z.string().trim().min(2).max(120),
  is_regex: z.boolean().default(false),
  reason: z.string().trim().max(500).optional(),
});

export async function addRestrictedNameAction(payload: z.infer<typeof schema>) {
  const requestHeaders = await headers();
  const auditContext = getAuditContextFromHeaders(requestHeaders, '/admin/security/restricted-names');
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'unauthorized' };
  }

  const roleLookup = await getUserRoleWithAdminFallback(user.id, supabase);
  if (!roleLookup.resolved || !isAdminRole(roleLookup.role)) {
    await logAuditEvent({
      eventType: 'admin.restricted_names.add.unauthorized',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        role: roleLookup.role,
        role_resolved: roleLookup.resolved,
      },
    });
    return { success: false, error: 'unauthorized' };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { success: false, error: 'validation' };
  }

  try {
    const data = await addRestrictedName(parsed.data);
    
    await logAuditEvent({
      eventType: 'admin.restricted_names.add',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        keyword: data.keyword,
        is_regex: data.is_regex,
      },
    });

    revalidatePath('/admin/security/restricted-names');
    return { success: true, data };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'database_error';
    return { success: false, error: errorMessage };
  }
}

export async function deleteRestrictedNameAction(id: string, keyword: string) {
  const requestHeaders = await headers();
  const auditContext = getAuditContextFromHeaders(requestHeaders, '/admin/security/restricted-names');
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'unauthorized' };
  }

  const roleLookup = await getUserRoleWithAdminFallback(user.id, supabase);
  if (!roleLookup.resolved || !isAdminRole(roleLookup.role)) {
    await logAuditEvent({
      eventType: 'admin.restricted_names.delete.unauthorized',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        role: roleLookup.role,
        role_resolved: roleLookup.resolved,
      },
    });
    return { success: false, error: 'unauthorized' };
  }

  try {
    await deleteRestrictedName(id);
    
    await logAuditEvent({
      eventType: 'admin.restricted_names.delete',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        keyword: keyword,
      },
    });

    revalidatePath('/admin/security/restricted-names');
    return { success: true };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'database_error';
    return { success: false, error: errorMessage };
  }
}


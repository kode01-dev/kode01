'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromHeaders, logAuditEvent } from '@/lib/security/audit';
import { parseAllowedConnectCountryCode } from '@/lib/stripe/connect-countries';
import {
  DEFAULT_VENDOR_BUSINESS_DESCRIPTION,
  DEFAULT_VENDOR_BUSINESS_MCC,
  DEFAULT_VENDOR_BUSINESS_URL,
  normalizeVendorBusinessDescription,
  normalizeVendorBusinessMcc,
  normalizeVendorBusinessUrl,
} from '@/lib/stripe/connect-business-profile';
import { isSellerRole } from '@/lib/auth/roles';
import { validateShopName } from '@/lib/security/restricted-names';

const submitVendorApplicationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  productType: z.string().trim().min(2).max(120),
  description: z.string().trim().min(20).max(2000),
});

type VendorApplicationField = 'name' | 'email' | 'productType' | 'description';

export type SubmitVendorApplicationResult =
  | { success: true }
  | {
      success: false;
      error: 'validation' | 'unauthorized' | 'database' | 'shop_name_restricted';
      fieldErrors?: Partial<Record<VendorApplicationField, true>>;
    };

function getValidationFieldErrors(
  fieldErrors: Record<string, string[] | undefined>,
): Partial<Record<VendorApplicationField, true>> {
  const normalized: Partial<Record<VendorApplicationField, true>> = {};
  for (const key of ['name', 'email', 'productType', 'description'] as const) {
    if ((fieldErrors[key] ?? []).length > 0) {
      normalized[key] = true;
    }
  }
  return normalized;
}

export async function submitVendorApplication(
  payload: z.infer<typeof submitVendorApplicationSchema>,
): Promise<SubmitVendorApplicationResult> {
  const requestHeaders = await headers();
  const auditContext = getAuditContextFromHeaders(requestHeaders, '/buyer/vendor-application');
  const parsed = submitVendorApplicationSchema.safeParse(payload);

  if (!parsed.success) {
    const fieldErrors = getValidationFieldErrors(parsed.error.flatten().fieldErrors);
    await logAuditEvent({
      eventType: 'vendor_application.submit.failed.validation',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        reason: 'schema_validation_failed',
        fields: Object.keys(fieldErrors),
      },
    });
    return { success: false, error: 'validation', fieldErrors };
  }

  const nameValidation = await validateShopName(parsed.data.name);
  if (!nameValidation.isValid) {
    return { success: false, error: 'shop_name_restricted', fieldErrors: { name: true } };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await logAuditEvent({
      eventType: 'vendor_application.submit.failed.unauthorized',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        reason: 'missing_user_session',
      },
    });
    return { success: false, error: 'unauthorized' };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('vendor_applications')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      email: parsed.data.email,
      product_type: parsed.data.productType,
      description: parsed.data.description,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError) {
    await logAuditEvent({
      eventType: 'vendor_application.submit.failed.database',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        error_message: insertError.message,
      },
    });
    return { success: false, error: 'database' };
  }

  await logAuditEvent({
    eventType: 'vendor_application.submit.success',
    userId: user.id,
    path: auditContext.path,
    ipAddress: auditContext.ipAddress,
    userAgent: auditContext.userAgent,
    metadata: {
      application_id: inserted.id,
      product_type: parsed.data.productType,
    },
  });

  return { success: true };
}

/* ------------------------------------------------------------------ */
/*  becomeVendor – self-service seller onboarding (no approval needed) */
/* ------------------------------------------------------------------ */

const becomeVendorSchema = z.object({
  shopName: z.string().trim().min(2).max(120),
  country: z.string().trim().min(2).max(2),
});

export type BecomeVendorResult =
  | { success: true }
  | {
      success: false;
      error: 'validation' | 'unauthorized' | 'already_seller' | 'database' | 'country_unsupported' | 'shop_name_restricted';
      fieldErrors?: Partial<Record<'shopName' | 'country', true>>;
    };

export async function becomeVendor(
  payload: z.infer<typeof becomeVendorSchema>,
): Promise<BecomeVendorResult> {
  const requestHeaders = await headers();
  const auditContext = getAuditContextFromHeaders(requestHeaders, '/buyer/become-vendor');

  const parsed = becomeVendorSchema.safeParse(payload);
  if (!parsed.success) {
    await logAuditEvent({
      eventType: 'become_vendor.failed.validation',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { reason: 'schema_validation_failed' },
    });
    return { success: false, error: 'validation', fieldErrors: { shopName: true, country: true } };
  }

  const shopNameValidation = await validateShopName(parsed.data.shopName);
  if (!shopNameValidation.isValid) {
    return { success: false, error: 'shop_name_restricted', fieldErrors: { shopName: true } };
  }

  const country = parseAllowedConnectCountryCode(parsed.data.country);
  if (!country) {
    await logAuditEvent({
      eventType: 'become_vendor.failed.validation',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { reason: 'unsupported_country' },
    });
    return { success: false, error: 'country_unsupported', fieldErrors: { country: true } };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await logAuditEvent({
      eventType: 'become_vendor.failed.unauthorized',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { reason: 'missing_user_session' },
    });
    return { success: false, error: 'unauthorized' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'buyer') {
    await logAuditEvent({
      eventType: 'become_vendor.failed.already_seller',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { current_role: profile?.role ?? 'unknown' },
    });
    return { success: false, error: 'already_seller' };
  }

  const adminSupabase = createAdminClient();
  const shopName = parsed.data.shopName;

  const { error: updateError } = await adminSupabase
    .from('profiles')
    .update({ role: 'seller', shop_name: shopName, country })
    .eq('id', user.id);

  if (updateError) {
    await logAuditEvent({
      eventType: 'become_vendor.failed.database',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: updateError.message },
    });
    return { success: false, error: 'database' };
  }

  await logAuditEvent({
    eventType: 'become_vendor.success',
    userId: user.id,
    path: auditContext.path,
    ipAddress: auditContext.ipAddress,
    userAgent: auditContext.userAgent,
    metadata: { shop_name: shopName, country },
  });

  return { success: true };
}

const completeVendorCountrySchema = z.object({
  country: z.string().trim().min(2).max(2),
});

export type CompleteVendorCountryResult =
  | { success: true }
  | {
      success: false;
      error: 'validation' | 'unauthorized' | 'forbidden' | 'country_locked' | 'database';
      fieldErrors?: Partial<Record<'country', true>>;
    };

export async function completeVendorCountry(
  payload: z.infer<typeof completeVendorCountrySchema>,
): Promise<CompleteVendorCountryResult> {
  const requestHeaders = await headers();
  const auditContext = getAuditContextFromHeaders(requestHeaders, '/vendor/complete-country');
  const parsed = completeVendorCountrySchema.safeParse(payload);

  if (!parsed.success) {
    return { success: false, error: 'validation', fieldErrors: { country: true } };
  }

  const country = parseAllowedConnectCountryCode(parsed.data.country);
  if (!country) {
    return { success: false, error: 'validation', fieldErrors: { country: true } };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'unauthorized' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, stripe_account_id, country')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return { success: false, error: 'database' };
  }

  if (!isSellerRole(profile.role)) {
    return { success: false, error: 'forbidden' };
  }

  if (profile.stripe_account_id) {
    return { success: false, error: 'country_locked' };
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ country })
    .eq('id', user.id);

  if (updateError) {
    await logAuditEvent({
      eventType: 'vendor_country.complete.failed.database',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: updateError.message },
    });
    return { success: false, error: 'database' };
  }

  await logAuditEvent({
    eventType: 'vendor_country.complete.success',
    userId: user.id,
    path: auditContext.path,
    ipAddress: auditContext.ipAddress,
    userAgent: auditContext.userAgent,
    metadata: { country },
  });

  return { success: true };
}

const updateVendorBusinessProfileSchema = z.object({
  businessUrl: z.string().trim().optional(),
  businessDescription: z.string().trim().optional(),
  businessMcc: z.string().trim().optional(),
});

export type UpdateVendorBusinessProfileResult =
  | { success: true }
  | {
      success: false;
      error: 'validation' | 'unauthorized' | 'forbidden' | 'database';
      fieldErrors?: Partial<Record<'businessUrl' | 'businessDescription' | 'businessMcc', true>>;
    };

export async function updateVendorBusinessProfile(
  payload: z.infer<typeof updateVendorBusinessProfileSchema>,
): Promise<UpdateVendorBusinessProfileResult> {
  const requestHeaders = await headers();
  const auditContext = getAuditContextFromHeaders(requestHeaders, '/vendor/business-profile');
  const parsed = updateVendorBusinessProfileSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      success: false,
      error: 'validation',
      fieldErrors: { businessUrl: true, businessDescription: true, businessMcc: true },
    };
  }

  const urlCandidate = parsed.data.businessUrl?.trim();
  if (urlCandidate) {
    try {
      const parsedUrl = new URL(urlCandidate);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return { success: false, error: 'validation', fieldErrors: { businessUrl: true } };
      }
    } catch {
      return { success: false, error: 'validation', fieldErrors: { businessUrl: true } };
    }
  }

  const mccCandidate = parsed.data.businessMcc?.trim();
  if (mccCandidate && !/^\d{4}$/.test(mccCandidate)) {
    return { success: false, error: 'validation', fieldErrors: { businessMcc: true } };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'unauthorized' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return { success: false, error: 'database' };
  }

  if (!isSellerRole(profile.role)) {
    return { success: false, error: 'forbidden' };
  }

  const normalizedBusinessUrl = normalizeVendorBusinessUrl(parsed.data.businessUrl ?? DEFAULT_VENDOR_BUSINESS_URL);
  const normalizedBusinessDescription = normalizeVendorBusinessDescription(
    parsed.data.businessDescription ?? DEFAULT_VENDOR_BUSINESS_DESCRIPTION,
    DEFAULT_VENDOR_BUSINESS_DESCRIPTION,
  );
  const normalizedBusinessMcc = normalizeVendorBusinessMcc(parsed.data.businessMcc ?? DEFAULT_VENDOR_BUSINESS_MCC);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      business_url: normalizedBusinessUrl,
      business_description: normalizedBusinessDescription,
      business_mcc: normalizedBusinessMcc,
    })
    .eq('id', user.id);

  if (updateError) {
    await logAuditEvent({
      eventType: 'vendor_business_profile.update.failed.database',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: updateError.message },
    });
    return { success: false, error: 'database' };
  }

  await logAuditEvent({
    eventType: 'vendor_business_profile.update.success',
    userId: user.id,
    path: auditContext.path,
    ipAddress: auditContext.ipAddress,
    userAgent: auditContext.userAgent,
    metadata: {
      business_url: normalizedBusinessUrl,
      business_mcc: normalizedBusinessMcc,
    },
  });

  return { success: true };
}

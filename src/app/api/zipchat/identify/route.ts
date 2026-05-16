import { createSign } from 'node:crypto';
import { NextResponse } from 'next/server';
import { normalizeEnvValue } from '@/lib/env/normalize';
import { createClient } from '@/lib/supabase/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JWT_ALGORITHM = 'RS256';
const TOKEN_LIFETIME_SECONDS = 5 * 60;
const MAX_SANITIZED_ERROR_LENGTH = 2_000;
const JWT_LIKE_VALUE_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const PRIVATE_KEY_BLOCK_PATTERN = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g;
const TOKEN_LABEL_PATTERN =
    /\b(token|secret|password|private[_-]?key)\b(\s*[:=]\s*)([^\s,;'"`]+)/gi;

type SanitizedErrorDetails = {
    name: string;
    message: string;
    stack: string | null;
};

function sanitizeErrorLogValue(input: string): string {
    const sanitized = input
        .replace(PRIVATE_KEY_BLOCK_PATTERN, '[REDACTED_PRIVATE_KEY]')
        .replace(JWT_LIKE_VALUE_PATTERN, '[REDACTED_TOKEN]')
        .replace(TOKEN_LABEL_PATTERN, (_match, label: string, separator: string) => {
            return `${label}${separator}[REDACTED]`;
        })
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');

    if (sanitized.length <= MAX_SANITIZED_ERROR_LENGTH) {
        return sanitized;
    }

    return `${sanitized.slice(0, MAX_SANITIZED_ERROR_LENGTH)}...[truncated]`;
}

function sanitizeErrorDetails(error: unknown): SanitizedErrorDetails {
    if (error instanceof Error) {
        return {
            name: sanitizeErrorLogValue(error.name || 'Error'),
            message: sanitizeErrorLogValue(error.message),
            stack: error.stack ? sanitizeErrorLogValue(error.stack) : null,
        };
    }

    return {
        name: 'NonErrorThrown',
        message: sanitizeErrorLogValue(String(error)),
        stack: null,
    };
}

function toBase64Url(input: string | Buffer): string {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function normalizePemPrivateKey(privateKey: string): string {
    return privateKey
        .replace(/^"|"$/g, '')
        .replace(/\\n/g, '\n')
        .trim();
}

function getOptionalString(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function getZipchatPrivateKey(): string | undefined {
    return normalizeEnvValue(process.env.ZIPCHAT_JWT_PRIVATE_KEY);
}

function createZipchatJwt(payload: Record<string, unknown>, privateKey: string): string {
    const encodedHeader = toBase64Url(
        JSON.stringify({
            alg: JWT_ALGORITHM,
            typ: 'JWT',
        }),
    );
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();

    const signature = signer.sign(normalizePemPrivateKey(privateKey));
    const encodedSignature = toBase64Url(signature);
    return `${signingInput}.${encodedSignature}`;
}

export async function GET(req: Request) {
    const auditContext = getAuditContextFromRequest(req);
    let actorUserId: string | null = null;
    try {
        const zipchatPrivateKey = getZipchatPrivateKey();
        if (!zipchatPrivateKey) {
            // Zipchat is optional in non-configured environments (preview/local).
            return NextResponse.json({ token: null, disabled: true });
        }

        const supabase = await createClient();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user?.email) {
            await logAuditEvent({
                eventType: 'zipchat.identify.failed.unauthorized',
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
            });
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        actorUserId = user.id;

        const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
        let firstName =
            getOptionalString(metadata, 'first_name') ??
            getOptionalString(metadata, 'given_name');
        let lastName =
            getOptionalString(metadata, 'last_name') ??
            getOptionalString(metadata, 'family_name');

        if (!firstName || !lastName) {
            const displayName =
                getOptionalString(metadata, 'display_name') ??
                getOptionalString(metadata, 'full_name') ??
                getOptionalString(metadata, 'name');

            if (displayName) {
                const parts = displayName.split(/\s+/).filter(Boolean);
                if (!firstName && parts[0]) {
                    firstName = parts[0];
                }
                if (!lastName && parts.length > 1) {
                    lastName = parts.slice(1).join(' ');
                }
            }
        }

        const additionalAttributes: Record<string, string> = {
            user_id: user.id,
        };
        const role = getOptionalString(metadata, 'role');
        if (role) {
            additionalAttributes.role = role;
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const payload: Record<string, unknown> = {
            email: user.email,
            additional_attributes: additionalAttributes,
            iat: nowSeconds,
            exp: nowSeconds + TOKEN_LIFETIME_SECONDS,
        };

        if (firstName) {
            payload.first_name = firstName;
        }
        if (lastName) {
            payload.last_name = lastName;
        }

        const token = createZipchatJwt(payload, zipchatPrivateKey);

        await logAuditEvent({
            eventType: 'zipchat.identify.success',
            userId: actorUserId,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                role: role ?? null,
            },
        });

        return NextResponse.json(
            { token },
            {
                headers: {
                    'Cache-Control': 'no-store',
                },
            },
        );
    } catch (error) {
        const sanitizedError = sanitizeErrorDetails(error);

        console.error('Zipchat identify token generation failed:', {
            errorName: sanitizedError.name,
            errorMessage: sanitizedError.message,
            errorStack: sanitizedError.stack,
        });

        await logAuditEvent({
            eventType: 'zipchat.identify.failed.internal_error',
            userId: actorUserId,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                error_name: sanitizedError.name,
                error_message: sanitizedError.message,
                error_stack: sanitizedError.stack,
            },
        });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

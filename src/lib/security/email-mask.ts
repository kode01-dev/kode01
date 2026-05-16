const EMAIL_LOCAL_VISIBLE_CHARS = 3;
const EMAIL_MASK = '***';

function splitEmail(email: string): { local: string; domain: string } | null {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.indexOf('@');
  if (atIndex <= 0 || atIndex >= normalized.length - 1) return null;

  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  if (!local || !domain) return null;
  return { local, domain };
}

export function maskEmailAddress(email: string | null | undefined): string | null {
  if (!email) return null;
  const split = splitEmail(email);
  if (!split) return null;

  const visible = split.local.slice(0, Math.min(EMAIL_LOCAL_VISIBLE_CHARS, split.local.length));
  return `${visible}${EMAIL_MASK}@${split.domain}`;
}

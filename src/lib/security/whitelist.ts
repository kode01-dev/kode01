/**
 * Utility to check if a requester's IP address is whitelisted for security testing.
 * The whitelist is configured via the SECURITY_IP_WHITELIST environment variable
 * as a comma-separated list of IP addresses.
 */

export function isIpWhitelisted(ip: string): boolean {
  if (!ip || ip === 'unknown') return false;

  const whitelistRaw = process.env.SECURITY_IP_WHITELIST;
  if (!whitelistRaw) return false;

  const whitelistedIps = whitelistRaw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return whitelistedIps.includes(ip);
}

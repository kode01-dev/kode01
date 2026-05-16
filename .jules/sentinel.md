## 2024-04-15 - Fail-Open Redirect Allowlist
**Vulnerability:** The external redirect allowlist for ad clicks in `src/app/api/ads/click/route.ts` was implemented as fail-open: `if (allowlist.length === 0) return true;`. Also, hostnames were not properly stripped of trailing dots (a common bypass method).
**Learning:** Security allowlists must always default to denying access (fail-closed) if unconfigured or empty. Checking empty sets with a true response entirely bypasses security.
**Prevention:** Ensure any domain validation functions explicitly deny access `if (allowlist.length === 0) return false;` and normalize domains by removing `.replace(/\.$/, '')` trailing dots.

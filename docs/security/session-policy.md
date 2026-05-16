# Session Security Policy (SOC 2)

## 1. Purpose
This policy defines the authentication session controls used to reduce account takeover risk and align with SOC 2 expectations.

## 2. Session Controls
- **Inactivity timeout**: `8 hours`
- **Absolute session timebox**: `24 hours`
- **Concurrent sessions**: `single session per user` enabled

These controls are configured in Supabase Authentication settings for the production project.

## 3. Expiration and Re-authentication Behavior
- A session may end because of inactivity, absolute lifetime expiry, or session revocation (for example, logout).
- When a session is no longer valid, the user must authenticate again to continue.
- Middleware-based session refresh detects invalid sessions during normal navigation and records an audit event.

## 4. Operational Notes
- Supabase applies these limits at session refresh/token validation boundaries.
- Enforcement is not a destructive "kill all sessions immediately" operation on every request; it is enforced as tokens are validated/refreshed.
- In addition to standard auth events, the platform logs:
  - `auth.session.expired`
  - `auth.session.revoked`

## 5. Configuration Source of Truth
- **Primary**: Supabase Dashboard -> Authentication -> Sessions (production project).
- **Reference in repo**: `supabase/config.toml` session values mirror the intended production controls for local/dev parity.

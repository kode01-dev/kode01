# Encryption Policy (SOC 2)

## 1. Overview
This policy describes how sensitive data is protected at rest and in transit.

## 2. Data in Transit
- All communication between clients and the server is encrypted using **TLS 1.2+**.
- Internal communication between services (Next.js to Supabase) is encrypted.
- HSTS (HTTP Strict Transport Security) is enabled on Vercel.

## 3. Data at Rest
### Base Encryption
- **Full Disk Encryption (TDE)**: All Supabase databases are encrypted at rest using AES-256 by the provider.
- **Backups**: Database backups are encrypted before storage.

### Field-Level Encryption (Application Layer)
For ultra-sensitive data (e.g., API keys, system secrets), we implement field-level encryption.
- **Strategy**: Use **Supabase Vault** (Extension).
- **Implementation**:
  - Use `vault.secrets` for storing sensitive keys and PII.
  - Encryption is handled transparently by the Vault extension using the project's root encryption key.
  - Access is restricted via standard PostgreSQL permissions.

## 4. Key Management
- Database keys are managed by Supabase.
- API keys (Service Role, Anon) are stored as secrets in Vercel and Supabase.
- Keys must be rotated every 12 months or upon personnel change.

## 5. Sensitive Fields Audit
| Table | Column | Encryption Type |
| :--- | :--- | :--- |
| `profiles` | `id` | None (UUID) |
| `profiles` | `display_name` | None |
| `profiles` | `stripe_account_id` | Full Disk (TDE) |
| `vault.secrets` | `secret` | **Authenticated Encryption (Vault)** |

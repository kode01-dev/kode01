# Local Storage Data Minimization

## Policy
- Do not persist secrets, payment artifacts, auth tokens, or full PII in `localStorage`.
- Auto-saved form payloads must:
  - use TTL expiration
  - exclude sensitive top-level keys
  - be removable at successful submit or logout

## Implementation
- `src/hooks/useAutoSave.ts`
  - stores payload envelope with `version`, `savedAt`, `expiresAt`, `data`
  - default TTL: 24 hours
  - supports `storageExcludeKeys` to avoid persisting sensitive fields
  - legacy payloads remain readable for backward compatibility
- `src/features/dashboard/components/ProductCreationStepper.tsx`
  - draft TTL reduced to 4 hours (`storageTtlMs`)
  - excludes upload-related fields (`coverImage`, `galleryImages`, `productFile`) from persistence

## Recommended Sensitive Keys to Exclude
- `password`
- `confirmPassword`
- `token`
- `secret`
- `privateKey`
- `cardNumber`
- `cvv`

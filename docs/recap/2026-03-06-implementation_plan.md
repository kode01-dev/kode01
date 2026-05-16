# Implementation Plan - Environment Robustness & UI Verification

This plan addresses the missing `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` which causes potential 500 errors in the News page and other areas using sponsored ads. It also includes steps to verify the News page UI.

## Proposed Changes

### [Ads Repository]
#### [MODIFY] [repository.ts](file:///c:/Users/Simbo/Desktop/thiki%20v1.00/src/features/ads/server/repository.ts)
- Modify `resolveActiveCreativeForPlacement` to check if `SUPABASE_SERVICE_ROLE_KEY` is present before attempting to create the admin client.
- Return `null` early if the key is missing, allowing the `SponsoredPlacementSlot` component to fallback to AdSense instead of crashing.

### [News Page]
#### [VERIFY] [page.tsx](file:///c:/Users/Simbo/Desktop/thiki%20v1.00/src/app/[locale]/(marketing)/news/page.tsx)
- Ensure the page renders correctly with the `bg-kode01-cream` background.
- Verify `BaseHeader` and `BaseFooter` are correctly integrated.

## Verification Plan

### Automated Tests
- Run `npm run dev` and check the news page in the browser (if possible, but I'll focus on code correctness and reporting).
- Run `npx tsc --noEmit` and `npm run lint` to ensure no regressions.

### Manual Verification
- Verify that `resolveActiveCreativeForPlacement` does not throw an error when `process.env.SUPABASE_SERVICE_ROLE_KEY` is undefined.
- Request the user to provide the `SUPABASE_SERVICE_ROLE_KEY` to enable sponsored ads functionality.

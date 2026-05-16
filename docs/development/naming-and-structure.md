# Naming and Structure

KODE01 uses a module-first Next.js structure. Keep feature code close to its
domain, keep shared infrastructure in `src/lib`, and avoid generated output in
the repository root.

## Source Layout

- `src/app`: Next.js routing files only. Keep `page.tsx`, `layout.tsx`,
  `loading.tsx`, and API `route.ts` files as thin entrypoints.
- `src/features/<module>`: product and domain modules. Module folders use
  `kebab-case`, for example `agent-blueprints`, `ai-recap`, and
  `order-incidents`.
- `src/lib/<domain>`: shared infrastructure and cross-cutting helpers such as
  auth, security, Supabase, Stripe, cron, routing, and resilience.
- `services/<runtime>`: separate workers or runtime services such as the Modal
  agent runtime.
- `supabase`: database migrations and Supabase Edge Functions.
- `tests`: API, feature, service, script, and smoke tests.

## Naming Rules

- Folders and modules: `kebab-case`.
- React components: `PascalCase.tsx`.
- React hooks: `useThing.ts` or `useThing.tsx`.
- Shared TypeScript helpers: `kebab-case.ts`, or conventional names such as
  `types.ts`, `constants.ts`, and `utils.ts`.
- Scripts: `kebab-case.mjs` or `kebab-case.py`.
- Assets: `kebab-case.svg`, `kebab-case.png`, or `kebab-case.webp`.
- Do not add spaces to file or folder names.
- Do not commit generated logs, temporary command output, local payloads, or
  build artifacts at the repository root.

## Compatibility Exceptions

- Next.js reserved filenames keep their framework names: `page.tsx`,
  `layout.tsx`, `loading.tsx`, `route.ts`, and `not-found.tsx`.
- Public assets that may already be used as URLs should not be renamed inside a
  cleanup pass unless all references and deployment consumers are known. For now,
  `public/images/ai-icons/Gemini.svg` remains as a legacy public asset name.

## Cleanup Guidance

- Prefer moving obsolete tracked artifacts to an ignored local archive under
  `tmp/legacy-cleanup/<date-or-topic>/` before removing them from the tracked
  root.
- Before deleting or renaming files, search for references with `rg`.
- Keep nomenclature cleanups separate from business-logic refactors.

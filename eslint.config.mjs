import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".vercel/**",
    // Native Android build artifacts (generated files).
    "android/**/build/**",
    "next-env.d.ts",
    // Temporary work trees and snapshots.
    "tmp/**",
  ]),
]);

export default eslintConfig;

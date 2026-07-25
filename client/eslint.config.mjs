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
    "next-env.d.ts",
    // handoff/ is the design-system reference (tokens, the x-dc/DCLogic
    // prototype comp) — a visual contract, not app source. It must stay
    // untouched, so it's out of lint scope entirely rather than "fixed".
    "handoff/**",
  ]),
]);

export default eslintConfig;

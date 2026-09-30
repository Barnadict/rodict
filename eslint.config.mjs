import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Turso caps SQLite's expression depth at 100; local SQLite allows 1000, and
  // libsql exposes no way to lower it, so tests can't reproduce the failure.
  // Prisma turns an `OR`/`AND` list into one nested term per element, so a
  // mapped list grows with the data and fails in production only ("Expression
  // tree is too large"). This broke every collect run's bulk persist in the
  // 2026-09-30 outage (Task #77). Query by a flat `{ in: ids }` instead and
  // match the rest in code.
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Property[key.name=/^(OR|AND)$/][value.type='CallExpression'][value.callee.property.name=/^(map|flatMap)$/]",
          message:
            "A mapped OR/AND list nests one level per item and exceeds Turso's expression depth limit (100). Use a flat `{ in: [...] }` filter and match the rest in code.",
        },
      ],
    },
  },
  // Disable ESLint formatting rules that conflict with Prettier (keep last).
  eslintConfigPrettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Prisma client (regenerated on install; not ours to lint).
    "src/generated/**",
    // Python analytics package (venv bundles third-party JS we must not lint).
    "analytics/**",
  ]),
]);

export default eslintConfig;

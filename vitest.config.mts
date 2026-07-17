import { defineConfig } from "vitest/config";

/**
 * Unit tests (Task #37) for the pure logic: the earnings model, the analytics
 * helpers, and the validation layer.
 *
 * Deliberately leaner than the Next.js Vitest guide, in two ways:
 *   - No `@vitejs/plugin-react`/jsdom — nothing here renders a component. The
 *     guide itself says async Server Components aren't unit-testable and belong
 *     in E2E; every page in this app is one, so the unit suite targets the pure
 *     functions those pages call.
 *   - No `vite-tsconfig-paths` — Vite resolves the `@/*` alias natively now, and
 *     Vitest warns that the plugin is redundant (the guide predates this).
 *
 * The Python analytics jobs have their own suite: `analytics/tests/` (pytest).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    tsconfigPaths: true,
  },
});

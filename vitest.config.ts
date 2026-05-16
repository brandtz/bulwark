/**
 * vitest.config.ts — Bulwark unit + integration tests
 *
 * Scope:
 *   - Pure functions: shared/utils/*, server/lib/* (e.g. compliance.evaluate)
 *   - Zod schema round-trip tests
 *   - MockServiceFactory deterministic-fixture tests
 *
 * Decisions NOT taken:
 *   - We do NOT use Vitest for component testing. Vue components are tested
 *     end-to-end via Playwright (ADR-0007). Revisit if a component grows
 *     a non-trivial pure-logic chunk that's expensive to assert via the UI.
 */
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'shared/**/*.test.ts', 'server/**/*.test.ts'],
    exclude: ['node_modules', 'tests/e2e/**', '.nuxt', '.output'],
    setupFiles: ['./tests/setup/env.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/*.config.ts', '**/*.d.ts', 'tests/**', '.nuxt/**'],
    },
  },
  resolve: {
    alias: {
      '~~/shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '~~/server': fileURLToPath(new URL('./server', import.meta.url)),
      '~~/app': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
})

import { defineConfig } from 'vitest/config'

/**
 * Unit test unit: `tests/*.spec.ts` run against `src` directly, so no build step
 * is needed. The live-browser run is a separate unit (`vitest.e2e.config.ts`)
 * because it needs a reachable camofox container and its API key.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    exclude: ['tests/**/*.e2e.ts', 'lib/**', 'node_modules/**'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})

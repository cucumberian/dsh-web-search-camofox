import { defineConfig } from 'vitest/config'

/**
 * Real-API test unit: `tests/*.e2e.ts` drive the live camofox-browser container.
 * Each case self-skips without `$CAMOFOX_API_KEY` or when the container is
 * unreachable, matching the with-key e2e policy in docs/testing.md.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 30_000,
  },
})

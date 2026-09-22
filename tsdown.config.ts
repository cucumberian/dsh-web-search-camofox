import { defineConfig } from 'tsdown'

/**
 * Bundle the TypeScript-emitted `lib/types` JavaScript into the single runtime
 * entry `lib/index.js`, keeping every workspace peer external. This mirrors the
 * deepseek-harness host pass (`entry` from `lib/types`, `fixedExtension: false`,
 * `dts: false`) without its typert plugin: this package contributes no type
 * graph, only a `ctx.web` provider registration.
 */
export default defineConfig({
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})

/**
 * Runtime invariant: the CamoFox search provider is registered with `ctx.web`.
 * This package contributes a WebSearchProvider implementation; the invariant
 * is satisfied when the provider is available for selection.
 * @module @deepseek-ai/dsh-web-search-camofox/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantPackage } from '@deepseek-ai/dsh-invariants'

export const invariant: InvariantPackage = {
  name: '@deepseek-ai/dsh-web-search-camofox',
  install(ctx: Context) {
    // This package provides a WebSearchProvider through ctx.web.registerSearchProvider
    // The invariant is that when this plugin is active, a provider with id 'camofox'
    // is available via ctx.web.getSearchProvider('camofox')
    ctx.effect(() => {
      // Verify the provider is registered
      const provider = ctx.web.getSearchProvider('camofox')
      if (provider === undefined) {
        throw new Error('web-search-camofox: provider not registered with ctx.web')
      }
      return () => {}
    }, 'web-search-camofox: verify provider registration')
  },
}
/**
 * Register a camofox-browser-backed provider in `ctx.web`. The provider drives a
 * headless anti-detection browser tab (camofox-browser REST) to a search engine
 * and reads the rendered accessibility snapshot back, so it reaches engines that
 * refuse plain HTTP clients. `dsh-web` selects it through `searchProvider: camofox`.
 * @module @deepseek-ai/dsh-web-search-camofox
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-web'
import {
  CAMOFOX_DEFAULT_API_KEY_ENV,
  CAMOFOX_DEFAULT_BASE_URL,
  CAMOFOX_DEFAULT_CLOSE_SETTLE_MS,
  CAMOFOX_DEFAULT_CONCURRENCY,
  CAMOFOX_DEFAULT_ENGINE,
  CAMOFOX_DEFAULT_RETRIES,
  CAMOFOX_DEFAULT_RETRY_DELAY_MS,
  CAMOFOX_DEFAULT_SESSION_KEY,
  CAMOFOX_DEFAULT_USER_ID,
  CAMOFOX_ENGINES,
  CAMOFOX_MAX_SNAPSHOT_CHARS,
} from './constants.ts'
import { CamofoxSearchProvider } from './provider.ts'
import type { CamofoxSearchProviderOptions } from './provider.ts'
import type { CamofoxEngine } from './types.ts'

export { CamofoxSearchProvider, parseSources, resolveResultUrl, resolveRoute } from './provider.ts'
export type { CamofoxRoute, CamofoxSearchProviderOptions } from './provider.ts'
export type { CamofoxEngine, CamofoxMacro } from './types.ts'
export {
  CAMOFOX_DEFAULT_API_KEY_ENV,
  CAMOFOX_DEFAULT_BASE_URL,
  CAMOFOX_DEFAULT_CLOSE_SETTLE_MS,
  CAMOFOX_DEFAULT_CONCURRENCY,
  CAMOFOX_DEFAULT_ENGINE,
  CAMOFOX_DEFAULT_RETRIES,
  CAMOFOX_DEFAULT_RETRY_DELAY_MS,
  CAMOFOX_DEFAULT_SESSION_KEY,
  CAMOFOX_DEFAULT_USER_ID,
  CAMOFOX_MACROS,
  CAMOFOX_MAX_SNAPSHOT_CHARS,
  CAMOFOX_PROVIDER_ID,
  CAMOFOX_RESULT_URLS,
  CAMOFOX_SEARX_URLS,
} from './constants.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-camofox'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Settings namespace carrying this provider's endpoint, engine, and key reference. */
export const WEB_SEARCH_CAMOFOX_SETTINGS_NAMESPACE = 'web-search-camofox'

/**
 * Plugin config (every field optional — `apply` fills credential, env, and
 * constant defaults). Every field is `volatile`, which is what makes the whole
 * section editable from the settings page: the settings plane rejects a write to
 * a path the schema did not mark volatile, and a volatile field reaches the
 * plugin as an accessor whose `get()` reads the value the next search sees. A
 * committed change therefore needs no restart and no re-registration.
 */
export interface Config {
  /** Literal camofox API key; prefer {@link apiKeyEnv} so no secret enters configuration files. */
  apiKey: Volatile<string | undefined>
  /** Credential reference resolved for each search; defaults to `CAMOFOX_API_KEY`. */
  apiKeyEnv: Volatile<string>
  /** camofox-browser REST base URL. Defaults to `http://localhost:9377`. */
  baseURL: Volatile<string>
  /** camofox user identity that owns the tab and its browser profile. Defaults to `default-user`. */
  userId: Volatile<string>
  /** camofox session key identifying this provider's tab group. Defaults to `dsh-web-search`. */
  sessionKey: Volatile<string>
  /** Search route. Defaults to `searx`; see the README for the engine list. */
  engine: Volatile<CamofoxEngine>
  /** Results-page URL template containing `{query}`; overrides the engine's own route. */
  searchUrl: Volatile<string | undefined>
  /** Snapshot characters the parser reads. Defaults to 60000. */
  maxSnapshotChars: Volatile<number>
  /** Searches one provider instance runs at once against one camofox user. Defaults to 1. */
  concurrency: Volatile<number>
  /** Fresh-tab attempts after a transient camofox failure. Defaults to 2. */
  retries: Volatile<number>
  /** Milliseconds a retry waits before opening its fresh tab. Defaults to 750. */
  retryDelayMs: Volatile<number>
  /** Milliseconds the queue waits after a tab close before the next queued search opens a tab. Defaults to 300. */
  closeSettleMs: Volatile<number>
}

export const Config = z.object({
  apiKey: z.string().role('secret').volatile(),
  apiKeyEnv: z.string().role('credential-ref').default(CAMOFOX_DEFAULT_API_KEY_ENV).volatile(),
  baseURL: z.string().default(CAMOFOX_DEFAULT_BASE_URL).volatile(),
  userId: z.string().default(CAMOFOX_DEFAULT_USER_ID).volatile(),
  sessionKey: z.string().default(CAMOFOX_DEFAULT_SESSION_KEY).volatile(),
  engine: z.union(CAMOFOX_ENGINES).default(CAMOFOX_DEFAULT_ENGINE).volatile(),
  searchUrl: z.string().volatile(),
  maxSnapshotChars: z.number().step(1).min(1_000).default(CAMOFOX_MAX_SNAPSHOT_CHARS).volatile(),
  concurrency: z.number().step(1).min(1).default(CAMOFOX_DEFAULT_CONCURRENCY).volatile(),
  retries: z.number().step(1).min(0).default(CAMOFOX_DEFAULT_RETRIES).volatile(),
  retryDelayMs: z.number().step(1).min(0).default(CAMOFOX_DEFAULT_RETRY_DELAY_MS).volatile(),
  closeSettleMs: z.number().step(1).min(0).default(CAMOFOX_DEFAULT_CLOSE_SETTLE_MS).volatile(),
})

/**
 * Project one resolved section into the options the provider serves its next
 * search with. Credential and environment fallbacks stay here rather than in
 * the provider: every value it reads is already fully defaulted.
 * @param ctx - plugin context supplying the credential and environment planes.
 * @param config - the currently authoritative section.
 * @returns options for one search.
 */
function resolveOptions(ctx: Context, config: Config): CamofoxSearchProviderOptions {
  // Every field is a volatile accessor, so reading here always sees the value the
  // next search must use; the fallbacks cover a section the plane never filled.
  const apiKeyEnv = credentialRef(config.apiKeyEnv.get() ?? CAMOFOX_DEFAULT_API_KEY_ENV)
  const literalApiKeyValue = config.apiKey.get()
  const literalApiKey = literalApiKeyValue !== undefined && literalApiKeyValue.length > 0
    ? literalApiKeyValue
    : undefined
  const searchUrl = config.searchUrl.get()
  return {
    ...literalApiKey === undefined ? {} : { apiKey: literalApiKey },
    resolveApiKey: async () => {
      const credentials = ctx.get('credentials')
      if (credentials !== undefined) return (await credentials.resolve(apiKeyEnv))?.value
      // Without the seam the environment is the whole credential plane.
      const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv)
      return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
    },
    apiKeyEnv,
    baseURL: config.baseURL.get() ?? CAMOFOX_DEFAULT_BASE_URL,
    userId: config.userId.get() ?? CAMOFOX_DEFAULT_USER_ID,
    sessionKey: config.sessionKey.get() ?? CAMOFOX_DEFAULT_SESSION_KEY,
    engine: config.engine.get() ?? CAMOFOX_DEFAULT_ENGINE,
    ...searchUrl !== undefined ? { searchUrl } : {},
    maxSnapshotChars: config.maxSnapshotChars.get() ?? CAMOFOX_MAX_SNAPSHOT_CHARS,
    concurrency: config.concurrency.get() ?? CAMOFOX_DEFAULT_CONCURRENCY,
    retries: config.retries.get() ?? CAMOFOX_DEFAULT_RETRIES,
    retryDelayMs: config.retryDelayMs.get() ?? CAMOFOX_DEFAULT_RETRY_DELAY_MS,
    closeSettleMs: config.closeSettleMs.get() ?? CAMOFOX_DEFAULT_CLOSE_SETTLE_MS,
  }
}

/**
 * Register the camofox search provider with `ctx.web`.
 *
 * The config needs no settings registration of its own: every field is volatile,
 * so the section the plugin was handed stays authoritative and each search
 * projects it fresh. A committed change reaches the next search without a
 * restart, and the provider is registered exactly once, which keeps the seam's
 * selection unobservable as a flicker.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new CamofoxSearchProvider(() => resolveOptions(ctx, config)))
}

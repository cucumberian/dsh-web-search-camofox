/**
 * Register a camofox-browser-backed provider in `ctx.web`. The provider drives a
 * headless anti-detection browser tab (camofox-browser REST) to a search engine
 * and reads the rendered accessibility snapshot back, so it reaches engines that
 * refuse plain HTTP clients. `dsh-web` selects it through `searchProvider: camofox`.
 * @module @deepseek-ai/dsh-web-search-camofox
 */

import type { Context } from '@deepseek-ai/cordis'
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

export { CamofoxSearchProvider, parseSources, resolveRoute } from './provider.ts'
export type { CamofoxRoute, CamofoxSearchProviderOptions } from './provider.ts'
export type { CamofoxEngine, CamofoxMacro } from './types.ts'
export {
  CAMOFOX_DEFAULT_API_KEY_ENV,
  CAMOFOX_DEFAULT_BASE_URL,
  CAMOFOX_DEFAULT_CONCURRENCY,
  CAMOFOX_DEFAULT_ENGINE,
  CAMOFOX_DEFAULT_RETRIES,
  CAMOFOX_DEFAULT_RETRY_DELAY_MS,
  CAMOFOX_DEFAULT_SESSION_KEY,
  CAMOFOX_DEFAULT_USER_ID,
  CAMOFOX_MACROS,
  CAMOFOX_MAX_SNAPSHOT_CHARS,
  CAMOFOX_PROVIDER_ID,
  CAMOFOX_SEARX_URLS,
} from './constants.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-camofox'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Settings namespace carrying this provider's endpoint, engine, and key reference. */
export const WEB_SEARCH_CAMOFOX_SETTINGS_NAMESPACE = 'web-search-camofox'

/** Plugin config (all optional — `apply` fills credential, env, and constant defaults). */
export interface Config {
  /** Literal camofox API key; prefer {@link apiKeyEnv} so no secret enters configuration files. */
  apiKey?: string
  /** Credential reference resolved for each search; defaults to `CAMOFOX_API_KEY`. */
  apiKeyEnv?: string
  /** camofox-browser REST base URL. Defaults to `http://localhost:9377`. */
  baseURL?: string
  /** camofox user identity that owns the tab and its browser profile. Defaults to `default-user`. */
  userId?: string
  /** camofox session key identifying this provider's tab group. Defaults to `dsh-web-search`. */
  sessionKey?: string
  /** Search route. Defaults to `searx`; see the README for the engine list. */
  engine?: CamofoxEngine
  /** Results-page URL template containing `{query}`; overrides the engine's own route. */
  searchUrl?: string
  /** Snapshot characters the parser reads. Defaults to 60000. */
  maxSnapshotChars?: number
  /** Searches one provider instance runs at once against one camofox user. Defaults to 1. */
  concurrency?: number
  /** Fresh-tab attempts after a transient camofox failure. Defaults to 2. */
  retries?: number
  /** Milliseconds a retry waits before opening its fresh tab. Defaults to 750. */
  retryDelayMs?: number
}

export const Config: z<Config> = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(CAMOFOX_DEFAULT_API_KEY_ENV),
  baseURL: z.string().default(CAMOFOX_DEFAULT_BASE_URL),
  userId: z.string().default(CAMOFOX_DEFAULT_USER_ID),
  sessionKey: z.string().default(CAMOFOX_DEFAULT_SESSION_KEY),
  engine: z.union(CAMOFOX_ENGINES).default(CAMOFOX_DEFAULT_ENGINE),
  searchUrl: z.string(),
  maxSnapshotChars: z.number().step(1).min(1_000).default(CAMOFOX_MAX_SNAPSHOT_CHARS),
  concurrency: z.number().step(1).min(1).default(CAMOFOX_DEFAULT_CONCURRENCY),
  retries: z.number().step(1).min(0).default(CAMOFOX_DEFAULT_RETRIES),
  retryDelayMs: z.number().step(1).min(0).default(CAMOFOX_DEFAULT_RETRY_DELAY_MS),
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
  const apiKeyEnv = credentialRef(config.apiKeyEnv ?? CAMOFOX_DEFAULT_API_KEY_ENV)
  const literalApiKey = config.apiKey !== undefined && config.apiKey.length > 0
    ? config.apiKey
    : undefined
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
    baseURL: config.baseURL ?? CAMOFOX_DEFAULT_BASE_URL,
    userId: config.userId ?? CAMOFOX_DEFAULT_USER_ID,
    sessionKey: config.sessionKey ?? CAMOFOX_DEFAULT_SESSION_KEY,
    engine: config.engine ?? CAMOFOX_DEFAULT_ENGINE,
    ...config.searchUrl !== undefined ? { searchUrl: config.searchUrl } : {},
    maxSnapshotChars: config.maxSnapshotChars ?? CAMOFOX_MAX_SNAPSHOT_CHARS,
    concurrency: config.concurrency ?? CAMOFOX_DEFAULT_CONCURRENCY,
    retries: config.retries ?? CAMOFOX_DEFAULT_RETRIES,
    retryDelayMs: config.retryDelayMs ?? CAMOFOX_DEFAULT_RETRY_DELAY_MS,
  }
}

/** Register the camofox search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, WEB_SEARCH_CAMOFOX_SETTINGS_NAMESPACE, Config, config, {
      setSource: (source) => {
        current = source
      },
      // The registration carries no resolved value: the provider projects the
      // section per search, so a committed change needs no re-registration.
      onChange: () => {},
    })
  })
  ctx.web.registerSearchProvider(new CamofoxSearchProvider(() => resolveOptions(ctx, current())))
}

/**
 * Register a CamoFox-backed provider in `ctx.web`.
 * Uses the CamoFox server's search macros (google, youtube, amazon, reddit, etc.)
 * to perform web searches through a headless browser with anti-detection.
 * @module @deepseek-ai/dsh-web-search-camofox
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-web'
import {
  CamoFoxSearchProvider,
  CAMOFOX_DEFAULT_BASE_URL,
  CAMOFOX_DEFAULT_ENGINE,
  CAMOFOX_PROVIDER_ID,
} from './provider.ts'
import type { CamoFoxSearchProviderOptions, CamoFoxEngine } from './provider.ts'

export {
  CamoFoxSearchProvider,
  CAMOFOX_DEFAULT_BASE_URL,
  CAMOFOX_DEFAULT_ENGINE,
  CAMOFOX_PROVIDER_ID,
} from './provider.ts'
export type { CamoFoxSearchProviderOptions, CamoFoxEngine } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-camofox'

/** The web seam this provider registers into. */
export const inject = ['web']

const DEFAULT_API_KEY_ENV = 'CAMOFOX_API_KEY'

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /** Literal CamoFox API key; prefer {@link apiKeyEnv} so no secret enters configuration files. */
  apiKey?: string
  /** Credential reference resolved for each search; defaults to `CAMOFOX_API_KEY`. */
  apiKeyEnv?: string
  /** CamoFox server base URL. Defaults to `http://localhost:4444`. */
  baseURL?: string
  /** Search engine to use. Defaults to `google`. */
  engine?: CamoFoxEngine
  /** Maximum results to extract per search. Defaults to 10. */
  maxResults?: number
}

export const Config: z<Config> = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string().default(CAMOFOX_DEFAULT_BASE_URL),
  engine: z.enum([
    'google', 'youtube', 'amazon', 'reddit', 'reddit_subreddit',
    'wikipedia', 'twitter', 'yelp', 'spotify', 'netflix',
    'linkedin', 'instagram', 'tiktok', 'twitch'
  ] as const).default(CAMOFOX_DEFAULT_ENGINE),
  maxResults: z.number().step(1).min(1).max(50).default(10),
})

/** Settings namespace carrying this provider's endpoint, engine, and key reference. */
export const WEB_SEARCH_CAMOFOX_SETTINGS_NAMESPACE = settingsNamespace('web-search-camofox')

/**
 * Project one resolved section into the options the provider serves its next
 * search with. Environment fallbacks stay here rather than in the provider:
 * every value it reads is already fully defaulted.
 * @param ctx - plugin context supplying the credential and environment planes.
 * @param config - the currently authoritative section.
 * @returns options for one search.
 */
function resolveOptions(ctx: Context, config: Config): CamoFoxSearchProviderOptions {
  const apiKeyEnv = credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV)
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
    engine: config.engine ?? CAMOFOX_DEFAULT_ENGINE,
    maxResults: config.maxResults ?? 10,
    recordRequest: (request) => {
      ctx.get('agents')?.currentInitiator()?.session.append(
        'web/camofox-search-request',
        request,
      )
    },
  }
}

/** Register the CamoFox search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  installSettingsSection(ctx, WEB_SEARCH_CAMOFOX_SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => {
      current = source
    },
    // The registration carries no resolved value: the provider projects the
    // section per search, so a committed change needs no re-registration.
    onChange: () => {},
  })
  ctx.web.registerSearchProvider(new CamoFoxSearchProvider(() => resolveOptions(ctx, current())))
}
/**
 * Constants this package owns: the provider id the `dsh-web` seam selects, the
 * defaults for every optional `Config` field, and the fixed values the parser
 * needs. `DEFAULT_*` names mark a `Config` field's default, which is
 * configurable; the block-level lists are the server's own macro set and
 * measured engine behavior, and carry no `Config` field.
 * @module @deepseek-ai/dsh-web-search-camofox/constants
 */

import type { CamofoxEngine } from './types.ts'

/** Provider id registered with `ctx.web`; `web` selects it through `searchProvider`. */
export const CAMOFOX_PROVIDER_ID = 'camofox'

/** Credential ref consulted when `apiKeyEnv` is unconfigured. */
export const CAMOFOX_DEFAULT_API_KEY_ENV = 'CAMOFOX_API_KEY'

/** Default camofox-browser REST base URL (the container's API port). */
export const CAMOFOX_DEFAULT_BASE_URL = 'http://localhost:9377'

/** Default camofox user identity, which owns the tab and its browser profile. */
export const CAMOFOX_DEFAULT_USER_ID = 'default-user'

/** Default camofox session key identifying this provider's tab group. */
export const CAMOFOX_DEFAULT_SESSION_KEY = 'dsh-web-search'

/**
 * Search-engine macro per macro-backed engine key. The keys are the server's own
 * macro set (camofox-browser 2.4.7); an engine outside it reaches the server as
 * an invalid `macro` and fails with `url or macro required`.
 */
export const CAMOFOX_MACROS = {
  google: '@google_search',
  youtube: '@youtube_search',
  amazon: '@amazon_search',
  reddit: '@reddit_search',
  wikipedia: '@wikipedia_search',
  twitter: '@twitter_search',
  yelp: '@yelp_search',
  spotify: '@spotify_search',
  netflix: '@netflix_search',
  linkedin: '@linkedin_search',
  instagram: '@instagram_search',
  tiktok: '@tiktok_search',
  twitch: '@twitch_search',
} as const

/**
 * SearxNG instances whose results pages render `article` blocks with
 * `[level=3]` headings, direct result URLs, and `paragraph:` snippets. The
 * engines that block bots outright (Google's consent wall, Reddit's network
 * security page, Mojeek's ALTCHA, Brave's proof of work, Startpage, Ecosia) are
 * not routes here; `searchUrl` carries any other instance.
 */
export const CAMOFOX_SEARX_URLS = {
  searx: 'https://priv.au/search',
  'searx-ingres': 'https://search.inetol.net/search',
  'searx-tiekoetter': 'https://searx.tiekoetter.com/search',
} as const

/** Engine keys accepted by `Config.engine`: every macro key plus every SearxNG key. */
export const CAMOFOX_ENGINES = [
  'searx',
  'searx-ingres',
  'searx-tiekoetter',
  'google',
  'youtube',
  'amazon',
  'reddit',
  'wikipedia',
  'twitter',
  'yelp',
  'spotify',
  'netflix',
  'linkedin',
  'instagram',
  'tiktok',
  'twitch',
] as const satisfies readonly CamofoxEngine[]

/** Default search route: a SearxNG instance, because macro search is bot-walled. */
export const CAMOFOX_DEFAULT_ENGINE: CamofoxEngine = 'searx'

/** Query-string key that a SearxNG results page reads the query from. */
export const CAMOFOX_SEARX_QUERY_PARAM = 'q'

/**
 * Default snapshot characters the parser reads. A 15-result SearxNG page renders
 * 18k to 51k accessibility characters (measured 34k on `priv.au`), so the default
 * covers a full first page; results past the bound are dropped, which
 * `dsh-tool-web`'s `maxResults` absorbs.
 */
export const CAMOFOX_MAX_SNAPSHOT_CHARS = 60_000

/**
 * Searches one provider instance runs at once against one camofox user.
 * camofox-browser 2.4.7 closes a user's persistent browser context when its tab
 * count drops to zero, so a concurrent search's tab close aborts another
 * search's in-flight navigation (`NS_BINDING_ABORTED`, `Target page, context or
 * browser has been closed`). One search at a time keeps a tab open for the whole
 * batch.
 */
export const CAMOFOX_DEFAULT_CONCURRENCY = 1

/** Fresh-tab attempts after a transient camofox failure, beyond the first try. */
export const CAMOFOX_DEFAULT_RETRIES = 2

/** Milliseconds between attempts, long enough for camofox to relaunch its context. */
export const CAMOFOX_DEFAULT_RETRY_DELAY_MS = 750

/** Statuses a fresh tab can plausibly clear: a vanished tab or a server-side failure. */
export const CAMOFOX_TRANSIENT_STATUSES = [404, 500, 502, 503, 504]

/** Archive wrappers that replace a citeable URL with a snapshot proxy. */
export const CAMOFOX_ARCHIVE_HOST = 'web.archive.org'

/** Result-page paths that are pagination or utility links, not search results. */
export const CAMOFOX_CHROME_PATHS = ['cached', 'translate', 'next', 'previous']

/** Accessibility-tree line that carries a block's real URL. */
export const CAMOFOX_URL_LINE_PREFIX = '/url:'

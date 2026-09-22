/**
 * Wire types for the camofox-browser REST API the search provider drives
 * (`POST /tabs`, `POST /tabs/{tabId}/navigate`, `GET /tabs/{tabId}/snapshot`,
 * `DELETE /tabs/{tabId}`). Types only — no runtime code. Camofox exposes no
 * search endpoint: the provider navigates a headless tab to a search engine and
 * reads back the rendered accessibility snapshot, a line-oriented text tree.
 *
 * @module @deepseek-ai/dsh-web-search-camofox/types
 */

/** One entry of `POST /tabs` (creation) — a browser tab gains an id and a url. */
export interface CamofoxTab {
  tabId: string
  url: string
}

/** The `POST /tabs/{tabId}/navigate` response — the tab's URL after navigation. */
export interface CamofoxNavigateResponse {
  ok: boolean
  url: string
}

/** Top-level envelope of `GET /tabs/{tabId}/snapshot`. */
export interface CamofoxSnapshotResponse {
  /** The tab's current URL (the query results page). */
  url: string
  /** The rendered accessibility tree as line-oriented indented text. */
  snapshot: string
  /** Page truncation bookkeeping (the provider caps the snapshot itself). */
  truncated: boolean
  hasMore: boolean
  totalChars: number
  nextOffset: number | null
}

/**
 * Search route keys. The macro-backed keys map to a server macro
 * (`CAMOFOX_MACROS`); the `searx*` keys build a direct results-page URL from a
 * public SearxNG instance, and `searchUrl` overrides the instance for any other
 * engine that renders the same result blocks.
 */
export type CamofoxEngine =
  | 'searx'
  | 'searx-ingres'
  | 'searx-tiekoetter'
  | 'google'
  | 'youtube'
  | 'amazon'
  | 'reddit'
  | 'wikipedia'
  | 'twitter'
  | 'yelp'
  | 'spotify'
  | 'netflix'
  | 'linkedin'
  | 'instagram'
  | 'tiktok'
  | 'twitch'

/** Resolved macro sent as the `navigate` request's `macro` field. */
export type CamofoxMacro = `@${string}_search`

/** One result group collected while scanning the accessibility tree. */
export interface CamofoxResultDraft {
  /** The group's external result URL, from its own `/url:` child line. */
  url: string
  /** Indent of the line that opened the group; deeper lines belong to it. */
  indent: number
  /** `[level=3]` heading text, when the page carries one. */
  title?: string
  /** Anchor label, when it is text rather than a URL or breadcrumb. */
  label?: string
  /** `paragraph:` / `text:` / `emphasis:` lines in document order. */
  pieces: CamofoxSnippetPiece[]
}

/** One snippet-bearing line of a result group. */
export interface CamofoxSnippetPiece {
  kind: 'paragraph' | 'text' | 'emphasis'
  value: string
}

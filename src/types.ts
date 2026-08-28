/**
 * Wire types for the camofox-browser REST API used by the search provider
 * (`POST /tabs`, `POST /tabs/{tabId}/navigate`, `GET /tabs/{tabId}/snapshot`).
 * Types only — no runtime code. Camofox exposes no dedicated search endpoint;
 * the provider drives a headless browser tab to a search-engine macro and reads
 * back the rendered accessibility snapshot, which is a human-readable text tree.
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
  /** The rendered accessibility tree as a line-oriented indented text. */
  snapshot: string
  /** Page truncation bookkeeping (ignored by the parser). */
  truncated: boolean
  hasMore: boolean
  totalChars: number
}

/** Search-engine macro keys accepted by the provider's `engine` config. */
export type CamofoxEngine =
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

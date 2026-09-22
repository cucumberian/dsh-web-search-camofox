/**
 * `CamofoxSearchProvider`: a `WebSearchProvider` that drives one camofox-browser
 * headless tab per search (`POST /tabs` → `POST /tabs/{id}/navigate` →
 * `GET /tabs/{id}/snapshot` → `DELETE /tabs/{id}`) and parses the rendered
 * accessibility tree into citeable sources. Camofox has no search endpoint, so
 * the engine is chosen by the route the tab navigates to: a server macro or a
 * direct results-page URL. Every request carries `Authorization: Bearer` when a
 * key is resolvable, which is what a `CAMOFOX_AUTH_MODE=required` server demands.
 * @module @deepseek-ai/dsh-web-search-camofox/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-session'
import {
  CAMOFOX_ARCHIVE_HOST,
  CAMOFOX_CHROME_PATHS,
  CAMOFOX_MACROS,
  CAMOFOX_PROVIDER_ID,
  CAMOFOX_SEARX_QUERY_PARAM,
  CAMOFOX_SEARX_URLS,
  CAMOFOX_URL_LINE_PREFIX,
} from './constants.ts'
import type { CamofoxEngine, CamofoxMacro, CamofoxResultDraft, CamofoxSnippetPiece } from './types.ts'
import type { CamofoxNavigateResponse, CamofoxSnapshotResponse, CamofoxTab } from './types.ts'

/** Attribution header sent on every request. Bump with the package version. */
const USER_AGENT = 'deepseek-harness/0.2.0'

/** Placeholder a `searchUrl` template carries the URL-encoded query in. */
const QUERY_PLACEHOLDER = '{query}'

/** Resolved provider options (the plugin's `apply` supplies env and constant defaults). */
export interface CamofoxSearchProviderOptions {
  /** camofox-browser REST base URL. */
  baseURL: string
  /** camofox user identity that owns the tab and its persistent browser profile. */
  userId: string
  /** camofox session key identifying this provider's tab group. */
  sessionKey: string
  /** Search route selected when `searchUrl` is unconfigured. */
  engine: CamofoxEngine
  /** Results-page URL template containing `{query}`; overrides the engine's own route. */
  searchUrl?: string
  /** Snapshot characters to parse; deeper results are dropped. */
  maxSnapshotChars: number
  /** Literal camofox API key; when present it wins over credential resolution. */
  apiKey?: string
  /** Credential reference the key is read from. */
  apiKeyEnv?: CredentialRef
  /** Resolve the camofox API key for one search operation. */
  resolveApiKey?: () => Promise<string | undefined>
}

/** One navigation target: a server macro plus its query, or a full results-page URL. */
export type CamofoxRoute =
  | { readonly kind: 'macro'; readonly macro: CamofoxMacro; readonly query: string }
  | { readonly kind: 'url'; readonly url: string }

/**
 * Resolve the route one search navigates the tab to.
 * @param options - resolved provider options.
 * @param query - the search query.
 * @returns the macro route for a macro-backed engine, otherwise the URL route.
 *   A `searchUrl` template always wins over the engine's own route.
 */
export function resolveRoute(options: CamofoxSearchProviderOptions, query: string): CamofoxRoute {
  const macro = CAMOFOX_MACROS[options.engine as keyof typeof CAMOFOX_MACROS] as CamofoxMacro | undefined
  if (options.searchUrl === undefined && macro !== undefined) return { kind: 'macro', macro, query }
  const base = options.searchUrl ?? CAMOFOX_SEARX_URLS[options.engine as keyof typeof CAMOFOX_SEARX_URLS]
  if (base === undefined) return { kind: 'macro', macro: CAMOFOX_MACROS.google, query }
  if (base.includes(QUERY_PLACEHOLDER)) {
    return { kind: 'url', url: base.replace(QUERY_PLACEHOLDER, encodeURIComponent(query)) }
  }
  const separator = base.includes('?') ? '&' : '?'
  return { kind: 'url', url: `${base}${separator}${CAMOFOX_SEARX_QUERY_PARAM}=${encodeURIComponent(query)}` }
}

/** One accessibility-tree line with its indent and leading `- ` marker removed. */
interface TreeLine {
  indent: number
  content: string
}

/** Split the snapshot text into tree lines, keeping each line's indent. */
function toLines(snapshot: string): TreeLine[] {
  return snapshot.split('\n').map((raw) => {
    const stripped = raw.replace(/^\s+/, '')
    return { indent: raw.length - stripped.length, content: stripped.startsWith('- ') ? stripped.slice(2).trim() : stripped.trim() }
  })
}

/** True for an absolute http(s) URL that names a citeable resource rather than engine chrome. */
function isCiteableUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false
  try {
    const { hostname, pathname } = new URL(url)
    const host = hostname.toLowerCase()
    const path = pathname.toLowerCase()
    if (host === CAMOFOX_ARCHIVE_HOST && path.startsWith('/web/')) return false
    if (CAMOFOX_CHROME_PATHS.includes(path)) return false
    if (host === 'accounts.google.com' || host === 'policies.google.com' || host === 'support.google.com') return false
    if (host.endsWith('.google.com')) {
      const chrome = ['/search', '/url', '/webhp', '/preferences', '/setprefs', '/sethomepage', '/intl/', '/advanced_search', '/xjs/', '/']
      if (chrome.some((prefix) => path.startsWith(prefix))) return false
    }
    return true
  } catch {
    return false
  }
}

/** Match a `link "label" [eN]:` line, quoted or bare, labeled or unlabeled. */
function matchLink(content: string): { label?: string } | undefined {
  const labeled = content.match(/^'?link\s+"((?:[^"\\]|\\.)*)"(?:\s*\[e\d+\])?'?:?\s*$/)?.[1]
  if (labeled !== undefined) {
    const label = labeled.replace(/\\"/g, '"').split(/ https?:\/\//)[0]?.trim() ?? ''
    return label.length > 0 ? { label } : {}
  }
  if (/^link\s*(?:\[[^\]]*\])?:?$/.test(content)) return {}
  return undefined
}

/** Match a `heading "text" [level=N]` line, quoted or bare. */
function matchHeading(content: string, level: number): string | undefined {
  const match = content.match(new RegExp(`^'?heading\\s+"((?:[^"\\\\]|\\\\.)*)"\\s+\\[level=${level}\\]`))
  return match?.[1]?.replace(/\\"/g, '"')
}

/** Read the `/url:` child of the block opened at `index`, or `undefined` when it has none. */
function blockUrl(lines: TreeLine[], index: number): string | undefined {
  const indent = lines[index]?.indent
  if (indent === undefined) return undefined
  for (let i = index + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line === undefined) return undefined
    if (line.indent <= indent) return undefined
    if (line.content.startsWith(CAMOFOX_URL_LINE_PREFIX)) return line.content.slice(CAMOFOX_URL_LINE_PREFIX.length).trim()
  }
  return undefined
}

/** Match a snippet-bearing line, or `undefined` for any other tree line. */
function matchSnippetPiece(content: string): CamofoxSnippetPiece | undefined {
  const match = content.match(/^(paragraph|text|emphasis):\s*(.*)$/)
  if (match === null || match === undefined) return undefined
  const value = (match[2] ?? '').trim()
  return value.length > 0 ? { kind: match[1] as CamofoxSnippetPiece['kind'], value } : undefined
}

/** True for a breadcrumb or URL echo line, which is engine chrome rather than result text. */
function isChromePiece(piece: CamofoxSnippetPiece): boolean {
  return /^https?:\/\//i.test(piece.value) || piece.value.includes(' \u203a ')
}

/**
 * Parse a camofox accessibility snapshot into citeable sources. A result opens
 * at a `link` line whose own block carries an external `/url:`; a repeat of that
 * URL (Google's second link per card, SearxNG's breadcrumb link) merges into the
 * open result instead of adding a duplicate. The title is the block's
 * `[level=3]` heading, else the anchor label; the snippet prefers `paragraph:`
 * lines and falls back to non-chrome `text:` and `emphasis:` lines. A link whose
 * URL is engine chrome (a Google search or preferences link, a SearxNG
 * `cached` or `next` link, an `web.archive.org` snapshot) ends the result it
 * follows instead of contributing one.
 * @param snapshot - the rendered accessibility tree as line-oriented indented text.
 * @returns one source per distinct result URL, in page order.
 */
export function parseSources(snapshot: string): WebSearchSource[] {
  const lines = toLines(snapshot)
  const drafts: CamofoxResultDraft[] = []
  let current: CamofoxResultDraft | undefined
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line === undefined) continue
    const { indent, content } = line
    if (content.length === 0) continue
    const link = matchLink(content)
    if (link !== undefined) {
      const url = blockUrl(lines, i)
      if (url === undefined || !isCiteableUrl(url)) {
        current = undefined
        continue
      }
      if (current?.url === url) {
        if (current.label === undefined && link.label !== undefined) current.label = link.label
        continue
      }
      current = { url, indent, pieces: [] }
      if (link.label !== undefined) current.label = link.label
      drafts.push(current)
      continue
    }
    const heading = matchHeading(content, 3)
    if (heading !== undefined) {
      const url = blockUrl(lines, i)
      if (current !== undefined && (url === undefined || url === current.url)) current.title ??= heading
      continue
    }
    if (matchHeading(content, 2) !== undefined) {
      current = undefined
      continue
    }
    const piece = matchSnippetPiece(content)
    if (piece !== undefined && current !== undefined && indent >= current.indent) current.pieces.push(piece)
  }
  const sources: WebSearchSource[] = []
  const seen = new Set<string>()
  for (const draft of drafts) {
    if (seen.has(draft.url)) continue
    seen.add(draft.url)
    const paragraphs = draft.pieces.filter((piece) => piece.kind === 'paragraph').map((piece) => piece.value)
    const pieces = paragraphs.length > 0 ? paragraphs : draft.pieces.filter((piece) => !isChromePiece(piece)).map((piece) => piece.value)
    const snippet = pieces.join(' ').replace(/\s+/g, ' ').trim()
    const label = draft.label !== undefined && !/^https?:\/\//i.test(draft.label) && !draft.label.includes('\u203a') ? draft.label : undefined
    const title = draft.title ?? label
    const source: { url: string; title?: string; snippet?: string } = { url: draft.url }
    if (title !== undefined && title.length > 0) source.title = title
    if (snippet.length > 0) source.snippet = snippet
    sources.push(source)
  }
  return sources
}

/** The camofox-backed search provider. */
export class CamofoxSearchProvider implements WebSearchProvider {
  readonly id = CAMOFOX_PROVIDER_ID

  /**
   * @param resolveOptions - options for the NEXT search, snapshotted once per
   *   search so one search never mixes two settings sections. A thunk rather
   *   than a value because the plugin's settings section can change between
   *   searches, and re-registering the provider to carry a new route would make
   *   the seam's selection observable as a flicker.
   */
  constructor(private readonly resolveOptions: () => CamofoxSearchProviderOptions) {}

  available(): boolean {
    const options = this.resolveOptions()
    if (!URL.canParse(options.baseURL)) return false
    if (options.userId.length === 0 || options.sessionKey.length === 0) return false
    if (options.searchUrl !== undefined) return options.searchUrl.includes(QUERY_PLACEHOLDER)
    const route = CAMOFOX_MACROS[options.engine as keyof typeof CAMOFOX_MACROS] ?? CAMOFOX_SEARX_URLS[options.engine as keyof typeof CAMOFOX_SEARX_URLS]
    return route !== undefined
  }

  /**
   * Run one search: open a tab, navigate it to the resolved route, read the
   * rendered snapshot, and close the tab. The tab id is never reused across
   * searches because camofox drops idle tabs from its pool, and a dropped id
   * fails every later request with `Tab not found`.
   * @param request - the query and optional result limit (the seam enforces the limit).
   * @param signal - cancellation forwarded to every camofox request.
   * @returns the parsed sources, with `truncated: false` because the provider
   *   applies no result-count control of its own.
   */
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    if (isAborted(signal)) throw new WebError('camofox search aborted', 'WEB_ABORTED')
    const options = this.resolveOptions()
    const route = resolveRoute(options, request.query)
    const apiKey = await this.resolveApiKey(options)
    let tabId: string | undefined
    try {
      tabId = await this.createTab(options, apiKey, signal)
      await this.navigateTab(options, tabId, apiKey, route, signal)
      const snapshot = await this.readSnapshot(options, tabId, apiKey, signal)
      return { sources: parseSources(snapshot), truncated: false }
    } catch (error: unknown) {
      if (error instanceof WebError) throw error
      if (isAbortError(error) || isAborted(signal)) {
        throw new WebError('camofox search aborted', 'WEB_ABORTED', { cause: error })
      }
      throw new WebError(`camofox search failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    } finally {
      if (tabId !== undefined) await this.closeTab(options, tabId, apiKey)
    }
  }

  private async createTab(options: CamofoxSearchProviderOptions, apiKey: string | undefined, signal?: AbortSignal): Promise<string> {
    const body = await this.request(`${options.baseURL}/tabs`, apiKey, {
      method: 'POST',
      ...signal !== undefined ? { signal } : {},
      body: JSON.stringify({ userId: options.userId, sessionKey: options.sessionKey }),
    }, signal) as CamofoxTab
    if (typeof body.tabId !== 'string' || body.tabId.length === 0) {
      throw new WebError('camofox tab creation returned no tabId', 'WEB_PROVIDER_ERROR')
    }
    return body.tabId
  }

  private async navigateTab(
    options: CamofoxSearchProviderOptions,
    tabId: string,
    apiKey: string | undefined,
    route: CamofoxRoute,
    signal?: AbortSignal,
  ): Promise<CamofoxNavigateResponse> {
    const body = await this.request(`${options.baseURL}/tabs/${tabId}/navigate`, apiKey, {
      method: 'POST',
      ...signal !== undefined ? { signal } : {},
      body: JSON.stringify({
        userId: options.userId,
        ...route.kind === 'macro' ? { macro: route.macro, query: route.query } : { url: route.url },
      }),
    }, signal) as CamofoxNavigateResponse
    if (body.url === undefined) {
      throw new WebError('camofox navigation returned no url', 'WEB_PROVIDER_ERROR')
    }
    return body
  }

  private async readSnapshot(
    options: CamofoxSearchProviderOptions,
    tabId: string,
    apiKey: string | undefined,
    signal?: AbortSignal,
  ): Promise<string> {
    const query = new URLSearchParams({ userId: options.userId, offset: '0' })
    const body = await this.request(`${options.baseURL}/tabs/${tabId}/snapshot?${query.toString()}`, apiKey, {
      ...signal !== undefined ? { signal } : {},
    }, signal) as CamofoxSnapshotResponse
    if (typeof body.snapshot !== 'string' || body.snapshot.length === 0) {
      throw new WebError(`camofox returned an empty snapshot for ${options.userId}`, 'WEB_PROVIDER_ERROR')
    }
    return body.snapshot.slice(0, options.maxSnapshotChars)
  }

  private async closeTab(options: CamofoxSearchProviderOptions, tabId: string, apiKey: string | undefined): Promise<void> {
    try {
      await this.request(`${options.baseURL}/tabs/${tabId}`, apiKey, {
        method: 'DELETE',
        body: JSON.stringify({ userId: options.userId }),
      })
    } catch (error) {
      // An unclosed tab stays in the user's tab pool; the next search opens a
      // fresh id, so a failed close must not replace the search's own outcome.
      void error
    }
  }

  private async request(
    url: string,
    apiKey: string | undefined,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<unknown> {
    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        redirect: 'error',
        headers: {
          accept: 'application/json',
          'user-agent': USER_AGENT,
          ...init.body !== undefined ? { 'content-type': 'application/json' } : {},
          ...apiKey !== undefined && apiKey.length > 0 ? { authorization: `Bearer ${apiKey}` } : {},
        },
      })
    } catch (error: unknown) {
      if (isAbortError(error)) throw error
      throw new WebError(`camofox request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    if (!response.ok) {
      const detail = await this.readFailureDetail(response, signal)
      const status = `camofox API error (HTTP ${response.status}${detail === undefined ? '' : `: ${detail}`})`
      if (response.status === 401 || response.status === 403) {
        throw new WebError(`${status}; the camofox server requires a matching CAMOFOX_API_KEY`, 'WEB_PROVIDER_ERROR')
      }
      throw new WebError(status, 'WEB_PROVIDER_ERROR')
    }
    try {
      return await response.json()
    } catch (error: unknown) {
      if (isAbortError(error)) throw error
      throw new WebError(`camofox returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }

  private async readFailureDetail(response: Response, signal?: AbortSignal): Promise<string | undefined> {
    try {
      const text = (await response.text()).trim()
      return text.length > 0 ? text.slice(0, 200) : undefined
    } catch (error) {
      // The status code is the diagnosis when the error body cannot be read.
      void error
      if (isAborted(signal)) throw new WebError('camofox search aborted', 'WEB_ABORTED')
      return undefined
    }
  }

  private async resolveApiKey(options: CamofoxSearchProviderOptions): Promise<string | undefined> {
    if (options.apiKey !== undefined && options.apiKey.length > 0) return options.apiKey
    if (options.resolveApiKey === undefined) return undefined
    const apiKey = await options.resolveApiKey()
    return apiKey !== undefined && apiKey.length > 0 ? apiKey : undefined
  }
}

/** True for a fetch or `AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Whether the caller's signal has already fired. */
function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true
}

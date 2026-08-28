/**
 * CamoFox search provider using headless browser with anti-detection fingerprinting.
 * Uses the CamoFox server's search macros (google, youtube, amazon, reddit, etc.)
 * to perform web searches and extract structured results.
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

/** Stable id this provider registers under. */
export const CAMOFOX_PROVIDER_ID = 'camofox'

/** Default CamoFox server endpoint. */
export const CAMOFOX_DEFAULT_BASE_URL = 'http://localhost:9377'

/** Default CamoFox user identity. */
export const CAMOFOX_DEFAULT_USER_ID = 'default-user'

/** Default CamoFox session key used by this provider. */
export const CAMOFOX_DEFAULT_SESSION_KEY = 'dsh-web-search'

/** Supported search engines. */
export type CamofoxEngine =
  | 'google'
  | 'youtube'
  | 'amazon'
  | 'reddit'
  | 'reddit_subreddit'
  | 'wikipedia'
  | 'twitter'
  | 'yelp'
  | 'spotify'
  | 'netflix'
  | 'linkedin'
  | 'instagram'
  | 'tiktok'
  | 'twitch'

/** Default search engine. */
export const CAMOFOX_DEFAULT_ENGINE: CamofoxEngine = 'google'

/** Resolved macro sent as the `navigate` request's `macro` field. */
export type CamofoxMacro = `@${string}_search`

/** Attribution header sent on every request. */
const USER_AGENT = 'deepseek-harness-camofox/0.0.1'

/** Resolved provider options. */
export interface CamofoxSearchProviderOptions {
  /** CamoFox server base URL. */
  baseURL: string
  /** CamoFox user ID. */
  userId: string
  /** CamoFox session key. */
  sessionKey: string
  /** Search engine to use. */
  engine: CamofoxEngine
  /** Credential reference for CamoFox API key (if auth enabled). */
  apiKeyEnv?: CredentialRef
  /** Literal API key; when present it wins over credential resolution. */
  apiKey?: string
  /** Resolve the current CamoFox API key for one search operation. */
  resolveApiKey?: () => Promise<string | undefined>
}

/**
 * Parse the CamoFox accessibility snapshot text into structured search sources.
 * The snapshot is a line-oriented indented text tree from the browser's
 * accessibility API. We extract organic result links, titles, and snippets.
 */
export function parseSources(snapshot: string): WebSearchSource[] {
  const sources: WebSearchSource[] = []
  const seenUrls = new Set<string>()

  // The snapshot format from camofox-browser is a text tree like:
  // - link "Title" [e123]:
  //     - /url: https://example.com
  // - text "Snippet text" [e456]
  // Also handles single-quoted titles and text: lines without element refs
  const lines = snapshot.split('\n')
  let currentLink: { title: string; ref: string; url?: string } | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimStart()
    const indent = line.length - trimmed.length

    // Match link elements:
    // - link "Title" [e123]:  (double quoted, with ref)
    // - link 'Title' [e123]:  (single quoted, with ref)
    // - 'link "Title"'        (single quoted wrapper, no ref)
    const linkMatch = trimmed.match(/^-\s+link\s+["']([^"']+)["']\s+\[e(\d+)\]:?/) ||
                      trimmed.match(/^-\s*['"]link\s+["']([^"']+)["']['"]?/)
    if (linkMatch) {
      const title = linkMatch[1]
      const ref = linkMatch[2] ? `e${linkMatch[2]}` : `e${i}`
      currentLink = { title, ref, url: undefined }
      continue
    }

    // Match URL lines: `- /url: https://...`
    const urlMatch = trimmed.match(/^-\s+\/url:\s+(\S+)/)
    if (urlMatch && currentLink) {
      currentLink.url = urlMatch[1]
      continue
    }

    // Match text elements for snippets:
    // - text "Snippet" [e456]
    // - text: Snippet
    const textMatch = trimmed.match(/^-\s+text\s+["']([^"']+)["']\s*\[?e?\d*\]?/) ||
                      trimmed.match(/^-\s+text:\s*(.+)/)
    if (textMatch && currentLink && currentLink.url) {
      const snippet = textMatch[1]
      const url = currentLink.url

      // Skip Google chrome URLs
      if (
        url.includes('accounts.google.com') ||
        url.includes('policies.google.com') ||
        url === 'https://www.google.com/webhp' ||
        url.includes('google.com/search') ||
        url.includes('google.com/preferences')
      ) {
        currentLink = null
        continue
      }

      if (!seenUrls.has(url)) {
        seenUrls.add(url)
        sources.push({
          url,
          title: currentLink.title,
          snippet,
        })
      }
      currentLink = null
    }

    // Reset currentLink if we're moving up in the tree (less indent)
    // or if we hit a non-link/text element at same/higher level
    if (indent <= 2 && !linkMatch && !urlMatch && !textMatch) {
      currentLink = null
    }
  }

  return sources
}

/** The CamoFox-backed search provider. */
export class CamofoxSearchProvider implements WebSearchProvider {
  readonly id = CAMOFOX_PROVIDER_ID
  private tabId: string | null = null

  constructor(private readonly options: CamofoxSearchProviderOptions) {}

  available(): boolean {
    return URL.canParse(this.options.baseURL)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const options = this.options

    try {
      // Create or reuse tab
      if (this.tabId === null) {
        this.tabId = await this.createTab(options, signal)
      }

      // Navigate to search macro
      await this.navigateTab(options, this.tabId, request.query, signal)

      // Get snapshot
      const snapshot = await this.getSnapshot(options, this.tabId, signal)

      // Parse sources
      const sources = parseSources(snapshot)
      const limitedSources = sources.slice(0, request.maxResults)

      return {
        sources: limitedSources,
        truncated: sources.length > request.maxResults,
      }
    } catch (error) {
      if (signal?.aborted || error instanceof DOMException && error.name === 'AbortError') {
        throw new WebError('CamoFox search aborted', 'WEB_ABORTED', { cause: error })
      }
      if (error instanceof WebError) throw error
      throw new WebError(`CamoFox search failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }

  private async createTab(
    options: CamofoxSearchProviderOptions,
    apiKey: string | undefined,
    signal?: AbortSignal
  ): Promise<string> {
    const response = await this.fetchWithAuth(`${options.baseURL}/tabs`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
        'user-agent': USER_AGENT,
        ...(apiKey ? { 'authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        userId: options.userId,
        sessionKey: options.sessionKey,
      }),
      signal,
    })

    const data = await response.json() as { tabId?: string; url?: string }
    if (!data.tabId) {
      throw new WebError('Tab creation returned no tabId', 'WEB_PROVIDER_ERROR')
    }
    return data.tabId
  }

  private async navigateTab(
    options: CamofoxSearchProviderOptions,
    tabId: string,
    query: string,
    signal?: AbortSignal
  ): Promise<void> {
    const macro = `@${options.engine}_search` as CamofoxMacro
    const apiKey = await this.resolveApiKey(signal)

    const response = await this.fetchWithAuth(`${options.baseURL}/tabs/${tabId}/navigate`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
        'user-agent': USER_AGENT,
        ...(apiKey ? { 'authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        userId: options.userId,
        macro,
        query,
      }),
      signal,
    })

    if (!response.ok) {
      throw new WebError(`Navigation failed: HTTP ${response.status}`, 'WEB_PROVIDER_ERROR')
    }
  }

  private async getSnapshot(
    options: CamofoxSearchProviderOptions,
    tabId: string,
    signal?: AbortSignal
  ): Promise<string> {
    const apiKey = await this.resolveApiKey(signal)

    const response = await this.fetchWithAuth(`${options.baseURL}/tabs/${tabId}/snapshot`, {
      method: 'GET',
      redirect: 'error',
      headers: {
        'accept': 'application/json',
        'user-agent': USER_AGENT,
        ...(apiKey ? { 'authorization': `Bearer ${apiKey}` } : {}),
      },
      signal,
    })

    const data = await response.json() as { snapshot?: string; url?: string; truncated?: boolean; hasMore?: boolean; totalChars?: number }
    if (!data.snapshot || data.snapshot.length === 0) {
      throw new WebError('Empty snapshot returned', 'WEB_PROVIDER_ERROR')
    }
    return data.snapshot
  }

  private async fetchWithAuth(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    let response: Response
    try {
      response = await fetch(url, init)
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new WebError(`Network error: ${error.message}`, 'WEB_PROVIDER_ERROR', { cause: error })
      }
      throw new WebError(`Network error: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    if (!response.ok) {
      let message = `HTTP ${response.status}`
      try {
        const text = await response.text()
        if (text) message = text
      } catch {
        // Ignore parse errors
      }
      throw new WebError(message, 'WEB_PROVIDER_ERROR')
    }
    return response
  }

  private async resolveApiKey(signal?: AbortSignal): Promise<string | undefined> {
    if (this.options.apiKey !== undefined && this.options.apiKey.length > 0) {
      return this.options.apiKey
    }
    if (this.options.resolveApiKey) {
      try {
        return await this.options.resolveApiKey()
      } catch {
        // Non-fatal: CamoFox may not require auth
      }
    }
    return undefined
  }
}
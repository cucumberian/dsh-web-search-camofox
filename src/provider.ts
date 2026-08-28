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
export const CAMOFOX_DEFAULT_BASE_URL = 'http://localhost:4444'

/** Supported search engines. */
export type CamoFoxEngine =
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
export const CAMOFOX_DEFAULT_ENGINE: CamoFoxEngine = 'google'

/** Attribution header sent on every request. */
const USER_AGENT = 'deepseek-harness-camofox/0.0.1'

/** Resolved provider options. */
export interface CamoFoxSearchProviderOptions {
  /** CamoFox server base URL. */
  baseURL: string
  /** Default search engine. */
  engine: CamoFoxEngine
  /** Maximum results to extract. */
  maxResults: number
  /** Credential reference for CamoFox API key (if auth enabled). */
  apiKeyEnv?: CredentialRef
  /** Literal API key; when present it wins over credential resolution. */
  apiKey?: string
  /** Resolve the current CamoFox API key for one search operation. */
  resolveApiKey?: () => Promise<string | undefined>
  /**
   * Record the exact request immediately before dispatch.
   * A throw prevents dispatch so model-visible auxiliary input cannot escape logging.
   */
  recordRequest?: (request: CamoFoxSearchRequest) => void
}

/** Exact secret-free CamoFox search request recorded before dispatch. */
export interface CamoFoxSearchRequest {
  /** Fully resolved endpoint. */
  readonly endpoint: string
  /** Search engine used. */
  readonly engine: CamoFoxEngine
  /** Query sent to the provider. */
  readonly query: string
  /** Maximum results requested. */
  readonly maxResults: number
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Secret-free CamoFox search request recorded before dispatch. */
    'web/camofox-search-request': CamoFoxSearchRequest
  }
}

/**
 * Map CamoFox search results to normalized WebSearchResult.
 * Extracts structured data from the accessibility snapshot.
 */
export function mapCamoFoxResults(
  snapshot: unknown,
  maxResults: number
): WebSearchResult {
  // Parse the CamoFox accessibility snapshot for search results
  // This is a simplified extraction - real implementation would parse the
  // snapshot structure returned by the specific search engine
  const sources: WebSearchSource[] = []

  // The snapshot structure varies by engine; we'll extract common patterns
  if (typeof snapshot === 'object' && snapshot !== null) {
    const snap = snapshot as Record<string, unknown>

    // Try to find links/elements that look like search results
    // This is a placeholder - real implementation would be engine-specific
    const extractFromElement = (element: unknown): WebSearchSource | null => {
      if (typeof element !== 'object' || element === null) return null
      const el = element as Record<string, unknown>
      if (typeof el.url === 'string' && el.url.length > 0) {
        return {
          url: el.url,
          ...(typeof el.title === 'string' && el.title.length > 0 ? { title: el.title } : {}),
          ...(typeof el.snippet === 'string' && el.snippet.length > 0 ? { snippet: el.snippet } : {}),
        }
      }
      return null
    }

    // Try common snapshot structures
    const candidates: unknown[] = []
    if (Array.isArray(snap.results)) candidates.push(...snap.results)
    if (Array.isArray(snap.links)) candidates.push(...snap.links)
    if (Array.isArray(snap.elements)) candidates.push(...snap.elements)

    for (const candidate of candidates) {
      const source = extractFromElement(candidate)
      if (source && sources.length < maxResults) {
        sources.push(source)
      }
    }
  }

  return { sources, truncated: sources.length >= maxResults }
}

/** The CamoFox-backed search provider. */
export class CamoFoxSearchProvider implements WebSearchProvider {
  readonly id = CAMOFOX_PROVIDER_ID

  constructor(private readonly resolveOptions: () => CamoFoxSearchProviderOptions) {}

  available(): boolean {
    const options = this.resolveOptions()
    return URL.canParse(options.baseURL)
      && Number.isInteger(options.maxResults)
      && options.maxResults > 0
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const options = this.resolveOptions()
    const apiKey = await this.apiKey(options, signal)
    throwIfSearchAborted(signal)

    const endpoint = `${options.baseURL}/search`
    const body = {
      query: request.query,
      engine: options.engine,
      maxResults: options.maxResults,
    }

    options.recordRequest?.({
      endpoint,
      engine: options.engine,
      query: request.query,
      maxResults: options.maxResults,
    })

    throwIfSearchAborted(signal)

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'user-agent': USER_AGENT,
          ...(apiKey ? { 'authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      throw new WebError(`CamoFox search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    if (!response.ok) {
      const status = response.status
      let message = `CamoFox API error (HTTP ${status})`
      try {
        const parsed = await response.json() as { error?: string; message?: string }
        const detail = parsed.error ?? parsed.message
        if (detail !== undefined && detail.length > 0) message = detail
      } catch {
        if (signal?.aborted === true || isAbortError) throw searchAborted(signal)
      }
      throw new WebError(message, 'WEB_PROVIDER_ERROR')
    }

    try {
      const snapshot = await response.json()
      return mapCamoFoxResults(snapshot, options.maxResults)
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      if (error instanceof WebError) throw error
      throw new WebError(`CamoFox returned an unprocessable response: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }

  private async apiKey(
    options: CamoFoxSearchProviderOptions,
    signal?: AbortSignal
  ): Promise<string | undefined> {
    throwIfSearchAborted(signal)
    if (options.apiKey !== undefined && options.apiKey.length > 0) return options.apiKey
    let resolved: string | undefined
    try {
      resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(undefined), signal)
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      // Non-fatal: CamoFox may not require auth
    }
    return resolved
  }
}

/** Race an operation against caller cancellation. */
function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return operation
  if (signal.aborted) return Promise.reject(searchAborted(signal))
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => { reject(searchAborted(signal)) }
    signal.addEventListener('abort', onAbort, { once: true })
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(new Error(String(error).replace(/^Error: /u, ''), { cause: error }))
      },
    )
  })
}

function throwIfSearchAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw searchAborted(signal)
}

function searchAborted(signal?: AbortSignal, fallback?: unknown): WebError {
  return new WebError('CamoFox search aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
/**
 * Search-flow, authorization, parser, and failure behavior of
 * {@link CamofoxSearchProvider} against recorded camofox snapshots.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CamofoxSearchProvider, parseSources, resolveRoute } from '../src/provider.ts'
import type { CamofoxSearchProviderOptions } from '../src/provider.ts'
import { CAMOFOX_PROVIDER_ID } from '../src/constants.ts'

const fixture = (name: string): string => {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
  return (JSON.parse(readFileSync(path, 'utf8')) as { snapshot: string }).snapshot
}

const googleSnapshot = fixture('google-snapshot.json')
const searxSnapshot = fixture('searx-snapshot.json')

const options: CamofoxSearchProviderOptions = {
  baseURL: 'http://camofox.test',
  userId: 'default-user',
  sessionKey: 'dsh-web-search',
  engine: 'google',
  maxSnapshotChars: 60_000,
}

/** Options carrying a literal key, the shape a configured `apiKey` produces. */
const keyed: CamofoxSearchProviderOptions = { ...options, apiKey: 'test-key' }

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

/** Fetch stub for one full search: tab creation, navigation, snapshot, close. */
function stubSearch(snapshot: string, navigateResponse = { ok: true, url: 'https://www.google.com/search?q=hello' }) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    const path = String(url)
    if (path.endsWith('/tabs')) return jsonResponse({ tabId: 'tab-1', url: 'about:blank' })
    if (path.includes('/navigate')) return jsonResponse(navigateResponse)
    if (path.includes('/snapshot')) return jsonResponse({ url: navigateResponse.url, snapshot, refsCount: 200, offset: 0, truncated: false, totalChars: snapshot.length, hasMore: false, nextOffset: null })
    return jsonResponse({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

type FetchCall = [string, RequestInit]

function call(mock: ReturnType<typeof vi.fn>, index: number): FetchCall {
  return mock.mock.calls[index] as unknown as FetchCall
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CamofoxSearchProvider availability', () => {
  it('registers under the id the web seam selects', () => {
    expect(new CamofoxSearchProvider(() => options).id).toBe(CAMOFOX_PROVIDER_ID)
    expect(CAMOFOX_PROVIDER_ID).toBe('camofox')
  })

  it('is available for a macro engine and a SearxNG engine', () => {
    expect(new CamofoxSearchProvider(() => options).available()).toBe(true)
    expect(new CamofoxSearchProvider(() => ({ ...options, engine: 'searx' })).available()).toBe(true)
  })

  it('is unavailable when the base URL is unparseable', () => {
    expect(new CamofoxSearchProvider(() => ({ ...options, baseURL: 'not a url' })).available()).toBe(false)
  })

  it('is unavailable when a searchUrl template carries no query placeholder', () => {
    expect(new CamofoxSearchProvider(() => ({ ...options, searchUrl: 'https://priv.au/search?q=fixed' })).available()).toBe(false)
    expect(new CamofoxSearchProvider(() => ({ ...options, searchUrl: 'https://priv.au/search?q={query}' })).available()).toBe(true)
  })
})

describe('resolveRoute', () => {
  it('sends a macro route for a macro-backed engine', () => {
    expect(resolveRoute({ ...options, engine: 'wikipedia' }, 'deepseek harness')).toEqual({
      kind: 'macro',
      macro: '@wikipedia_search',
      query: 'deepseek harness',
    })
  })

  it('builds a results-page URL for a SearxNG engine', () => {
    const route = resolveRoute({ ...options, engine: 'searx' }, 'deepseek harness')
    expect(route).toEqual({ kind: 'url', url: 'https://priv.au/search?q=deepseek%20harness' })
  })

  it('applies a searchUrl template over the engine route', () => {
    const route = resolveRoute({ ...options, engine: 'google', searchUrl: 'https://priv.au/search?q={query}' }, 'deepseek harness')
    expect(route).toEqual({ kind: 'url', url: 'https://priv.au/search?q=deepseek%20harness' })
  })

  it('appends the query parameter to a template without a placeholder', () => {
    const route = resolveRoute({ ...options, engine: 'searx', searchUrl: 'https://searx.be/search' }, 'deepseek harness')
    expect(route).toEqual({ kind: 'url', url: 'https://searx.be/search?q=deepseek%20harness' })
  })
})

describe('CamofoxSearchProvider search flow', () => {
  it('opens a tab, navigates the macro, reads the snapshot, and closes the tab', async () => {
    const fetchMock = stubSearch(googleSnapshot)
    const result = await new CamofoxSearchProvider(() => options).search({ query: 'hello', maxResults: 3 })

    expect(fetchMock).toHaveBeenCalledTimes(4)
    const [tabsUrl, tabsInit] = call(fetchMock, 0)
    expect(tabsUrl).toBe('http://camofox.test/tabs')
    expect(tabsInit).toMatchObject({ method: 'POST', redirect: 'error' })
    expect(JSON.parse(tabsInit.body as string)).toEqual({ userId: 'default-user', sessionKey: 'dsh-web-search' })

    const [navUrl, navInit] = call(fetchMock, 1)
    expect(navUrl).toBe('http://camofox.test/tabs/tab-1/navigate')
    expect(JSON.parse(navInit.body as string)).toEqual({ userId: 'default-user', macro: '@google_search', query: 'hello' })

    const [snapshotUrl] = call(fetchMock, 2)
    expect(snapshotUrl).toBe('http://camofox.test/tabs/tab-1/snapshot?userId=default-user&offset=0')

    const [closeUrl, closeInit] = call(fetchMock, 3)
    expect(closeUrl).toBe('http://camofox.test/tabs/tab-1')
    expect(closeInit).toMatchObject({ method: 'DELETE' })
    expect(JSON.parse(closeInit.body as string)).toEqual({ userId: 'default-user' })

    expect(result.sources.length).toBeGreaterThan(0)
    // The seam, not the provider, enforces `maxResults`: the provider returns
    // every parsed source and leaves `truncated` to `WebRuntime.capSources`.
    expect(result.sources).toHaveLength(parseSources(googleSnapshot).length)
    expect(result.truncated).toBe(false)
  })

  it('sends the Bearer key on every camofox request', async () => {
    const fetchMock = stubSearch(searxSnapshot)
    await new CamofoxSearchProvider(() => ({ ...keyed, engine: 'searx' })).search({ query: 'deepseek harness' })
    const authorizations = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).headers).map((headers) => (headers as Record<string, string>).authorization)
    expect(authorizations).toEqual(['Bearer test-key', 'Bearer test-key', 'Bearer test-key', 'Bearer test-key'])
  })

  it('resolves the key once per search and sends it on tab creation', async () => {
    const fetchMock = stubSearch(searxSnapshot)
    const resolveApiKey = vi.fn(async () => 'resolved-key')
    const provider = new CamofoxSearchProvider(() => ({ ...options, engine: 'searx', resolveApiKey }))
    await provider.search({ query: 'deepseek harness' })
    expect(resolveApiKey).toHaveBeenCalledTimes(1)
    const tabHeaders = (call(fetchMock, 0)[1].headers as Record<string, string>)
    expect(tabHeaders.authorization).toBe('Bearer resolved-key')
  })

  it('omits the authorization header when no key is resolvable', async () => {
    const fetchMock = stubSearch(searxSnapshot)
    const provider = new CamofoxSearchProvider(() => ({ ...options, resolveApiKey: async () => undefined }))
    await provider.search({ query: 'deepseek harness' })
    const tabHeaders = (call(fetchMock, 0)[1].headers as Record<string, string>)
    expect(tabHeaders.authorization).toBeUndefined()
  })

  it('navigates a direct search URL for a SearxNG engine', async () => {
    const fetchMock = stubSearch(searxSnapshot, { ok: true, url: 'https://priv.au/search?q=deepseek%20harness' })
    const result = await new CamofoxSearchProvider(() => ({ ...options, engine: 'searx' })).search({ query: 'deepseek harness' })
    const [, navInit] = call(fetchMock, 1)
    expect(JSON.parse(navInit.body as string)).toEqual({
      userId: 'default-user',
      url: 'https://priv.au/search?q=deepseek%20harness',
    })
    expect(result.sources.some((source) => source.url.includes('github.com'))).toBe(true)
  })

  it('opens a fresh tab per search instead of reusing a pooled tab id', async () => {
    const fetchMock = stubSearch(googleSnapshot)
    const provider = new CamofoxSearchProvider(() => options)
    await provider.search({ query: 'a' })
    await provider.search({ query: 'b' })
    const tabCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/tabs'))
    const closeCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit).method === 'DELETE')
    expect(tabCalls).toHaveLength(2)
    expect(closeCalls).toHaveLength(2)
  })

  it('closes the tab even when parsing or navigation fails', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).endsWith('/tabs')) return jsonResponse({ tabId: 'tab-9' })
      if (String(url).includes('/navigate')) return jsonResponse({ ok: true, url: 'https://www.google.com/search?q=x' })
      if (String(url).includes('/snapshot')) return jsonResponse({ url: 'https://www.google.com/search?q=x', snapshot: '' })
      return jsonResponse({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(new CamofoxSearchProvider(() => options).search({ query: 'q' }))
      .rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
    const closeCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit).method === 'DELETE')
    expect(closeCall?.[0]).toBe('http://camofox.test/tabs/tab-9')
  })

  it('caps the parsed snapshot at maxSnapshotChars', async () => {
    const fetchMock = stubSearch(googleSnapshot)
    const provider = new CamofoxSearchProvider(() => ({ ...options, maxSnapshotChars: 1_000 }))
    await provider.search({ query: 'hello' })
    const result = parseSources(googleSnapshot.slice(0, 1_000))
    const [, init] = call(fetchMock, 2)
    expect(init).toMatchObject({})
    expect(result.length).toBeLessThan(parseSources(googleSnapshot).length)
  })
})

describe('CamofoxSearchProvider failures', () => {
  it('reports the missing key when the server rejects the request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"Forbidden"}', { status: 403 })))
    await expect(new CamofoxSearchProvider(() => options).search({ query: 'q' }))
      .rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR', message: expect.stringContaining('CAMOFOX_API_KEY') })
  })

  it('throws WEB_PROVIDER_ERROR when tab creation returns no tab id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ url: 'about:blank' })))
    await expect(new CamofoxSearchProvider(() => options).search({ query: 'q' }))
      .rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
  })

  it('throws WEB_PROVIDER_ERROR on a server error response', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/tabs')) return jsonResponse({ tabId: 'tab-1' })
      return new Response('{"error":"Internal server error"}', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(new CamofoxSearchProvider(() => options).search({ query: 'q' }))
      .rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR', message: expect.stringContaining('HTTP 500') })
  })

  it('throws WEB_PROVIDER_ERROR on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('connection refused'))))
    await expect(new CamofoxSearchProvider(() => options).search({ query: 'q' }))
      .rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
  })

  it('maps an abort to WEB_ABORTED', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))))
    await expect(new CamofoxSearchProvider(() => options).search({ query: 'q' }))
      .rejects.toMatchObject({ code: 'WEB_ABORTED' })
  })

  it('throws WEB_PROVIDER_ERROR for an empty snapshot', async () => {
    vi.stubGlobal('fetch', stubSearch(''))
    await expect(new CamofoxSearchProvider(() => options).search({ query: 'q' }))
      .rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
  })

  it('surfaces an aborted signal as WEB_ABORTED', async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal('fetch', stubSearch(googleSnapshot))
    await expect(new CamofoxSearchProvider(() => options).search({ query: 'q' }, controller.signal))
      .rejects.toMatchObject({ code: 'WEB_ABORTED' })
  })
})

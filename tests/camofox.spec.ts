import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CamofoxSearchProvider, CAMOFOX_PROVIDER_ID, parseSources } from '../src/provider.ts'

const fixtureUrl = fileURLToPath(new URL('./fixtures/google-snapshot.json', import.meta.url))
const snapshotFixture = (JSON.parse(readFileSync(fixtureUrl, 'utf8')) as { snapshot: string }).snapshot

const options = { baseURL: 'http://camofox.test', userId: 'default-user', sessionKey: 'dsh-web-search', engine: 'google' as const }

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CamofoxSearchProvider availability', () => {
  it('is available with a valid base URL and no key required', () => {
    expect(new CamofoxSearchProvider(options).available()).toBe(true)
  })

  it('is unavailable when the base URL is unparseable', () => {
    expect(new CamofoxSearchProvider({ ...options, baseURL: 'not a url' }).available()).toBe(false)
  })
})

describe('parseSources on the google snapshot', () => {
  it('exposes the provider id', () => {
    expect(CAMOFOX_PROVIDER_ID).toBe('camofox')
  })

  it('extracts organic result URLs and titles', () => {
    const sources = parseSources(snapshotFixture)
    const urls = sources.map((source) => source.url)
    expect(urls).toContain('https://deepseek.com/harness/en/')
    expect(urls).toContain('https://www.mindstudio.ai/blog/deepseek-harness-agentic-coding')
    expect(urls).toContain('https://www.reddit.com/r/LocalLLaMA/comments/1vnb66j/deepseek_harness_is_up/')
    expect(urls).toContain('https://x.com/deepseek_ai/status/2087887408440164663')
  })

  it('drops search-engine chrome URLs', () => {
    const urls = parseSources(snapshotFixture).map((source) => source.url)
    expect(urls).not.toContain('https://accounts.google.com/ServiceLogin')
    expect(urls).not.toContain('https://policies.google.com/privacy?hl=nl&fg=1')
    expect(urls).not.toContain('https://www.google.com/webhp')
    expect(urls.some((url) => url.includes('google.com/search'))).toBe(false)
  })

  it('cleans titles from level-3 headings', () => {
    const sources = parseSources(snapshotFixture)
    const result = sources.find((source) => source.url === 'https://www.mindstudio.ai/blog/deepseek-harness-agentic-coding')
    expect(result?.title).toContain('What Is DeepSeek Harness?')
  })

  it('assembles snippets from text and emphasis fragments', () => {
    const sources = parseSources(snapshotFixture)
    const result = sources.find((source) => source.url === 'https://deepseek.com/harness/en/')
    expect(result?.snippet).toBeTruthy()
    expect(result?.snippet).toContain('Cordis')
  })

  it('de-duplicates repeated URLs (youtube videos appear twice)', () => {
    const urls = parseSources(snapshotFixture).map((source) => source.url)
    const dups = urls.filter((url, index) => urls.indexOf(url) !== index)
    expect(dups).toEqual([])
  })
})

describe('CamofoxSearchProvider search flow', () => {
  it('creates a tab, navigates the macro, and parses the snapshot', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockReturnValueOnce(jsonResponse({ tabId: 'tab-1', url: 'about:blank' })) // POST /tabs
    fetchMock.mockReturnValueOnce(jsonResponse({ ok: true, url: 'https://www.google.com/search?q=hello' })) // navigate
    fetchMock.mockReturnValueOnce(jsonResponse({ url: 'https://www.google.com/search?q=hello', snapshot: snapshotFixture })) // snapshot
    vi.stubGlobal('fetch', fetchMock)

    const provider = new CamofoxSearchProvider(options)
    const result = await provider.search({ query: 'hello', maxResults: 3 })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [tabsUrl, tabsInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(tabsUrl).toBe('http://camofox.test/tabs')
    expect(tabsInit).toMatchObject({ method: 'POST', redirect: 'error' })
    expect(JSON.parse(tabsInit.body as string)).toEqual({ userId: 'default-user', sessionKey: 'dsh-web-search' })
    const [navUrl, navInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(navUrl).toBe('http://camofox.test/tabs/tab-1/navigate')
    expect(JSON.parse(navInit.body as string)).toEqual({ userId: 'default-user', macro: '@google_search', query: 'hello' })
    expect(result.sources.length).toBeLessThanOrEqual(3)
    expect(result.truncated).toBe(false)
  })

  it('reuses one tab across searches', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/tabs')) return jsonResponse({ tabId: 'tab-1', url: 'about:blank' })
      if (String(url).includes('/navigate')) return jsonResponse({ ok: true, url: 'https://google.com/search?q=x' })
      return jsonResponse({ url: 'https://google.com/search?q=x', snapshot: snapshotFixture })
    })
    vi.stubGlobal('fetch', fetchMock)
    const provider = new CamofoxSearchProvider(options)
    await provider.search({ query: 'a' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // Second search: tab is reused, so no /tabs call — only navigate + snapshot.
    await provider.search({ query: 'b' })
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/tabs')).length).toBe(1)
  })
})

describe('CamofoxSearchProvider error handling', () => {
  it('throws WEB_PROVIDER_ERROR when tab creation returns no tab id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ url: 'about:blank' })))
    await expect(new CamofoxSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('throws WEB_PROVIDER_ERROR on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 500 })))
    await expect(new CamofoxSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('throws WEB_PROVIDER_ERROR on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('connection refused'))))
    await expect(new CamofoxSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('maps an abort to WEB_ABORTED', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))))
    await expect(new CamofoxSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('throws WEB_PROVIDER_ERROR for an empty snapshot', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockReturnValueOnce(jsonResponse({ tabId: 'tab-1' }))
    fetchMock.mockReturnValueOnce(jsonResponse({ url: 'x' }))
    fetchMock.mockReturnValueOnce(jsonResponse({ url: 'x', snapshot: '' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(new CamofoxSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })
})

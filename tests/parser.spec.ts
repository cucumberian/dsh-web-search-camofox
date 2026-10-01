/**
 * Parser behavior against recorded camofox accessibility snapshots, one per
 * engine family: a Google results page (quoted `link "…"` blocks, `/url:`
 * children, `emphasis:` and `text:` snippets), a SearxNG results page
 * (`article:` blocks, `[level=3]` headings, `paragraph:` snippets, breadcrumb
 * links, `web.archive.org` mirrors), and the two direct result pages — DuckDuckGo
 * (every result annotated as a protocol-relative `/l/?uddg=` redirect, the
 * description carried as a fourth link) and Yandex (a `[level=2]` title nested
 * inside the result link, its own tab bar and footer linked directly, and one
 * address cited twice: a fact card naming only the site, then the organic result
 * naming the page).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseSources, resolveResultUrl } from '../src/provider.ts'

const snapshot = (name: string): string => {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
  return (JSON.parse(readFileSync(path, 'utf8')) as { snapshot: string }).snapshot
}

const google = snapshot('google-snapshot.json')
const searx = snapshot('searx-snapshot.json')
const duckduckgo = snapshot('duckduckgo-snapshot.json')
const yandex = snapshot('yandex-snapshot.json')

/** True for a label or snippet that restates an address or is page machinery. */
const isChromeText = (value: string | undefined): boolean =>
  value !== undefined && (/^https?:\/\//i.test(value) || /^[.\u2014\u2013\s|"'—–:;,\u00b7]+$/.test(value))

describe('parseSources on recorded snapshots', () => {
  it('yields Google results with titles and snippets', () => {
    const sources = parseSources(google)
    expect(sources.length).toBeGreaterThan(8)
    for (const source of sources) {
      expect(source.url).toMatch(/^https?:\/\//)
      expect(source.title).toBeDefined()
      // Google chrome never reaches the result list.
      expect(source.url).not.toMatch(/google\.com\/(search|url|webhp|preferences)/)
    }
    expect(sources.some((source) => source.snippet !== undefined)).toBe(true)
  })

  it('yields SearxNG results with titles and paragraph snippets', () => {
    const sources = parseSources(searx)
    expect(sources.length).toBeGreaterThan(20)
    for (const source of sources) {
      expect(source.url).toMatch(/^https?:\/\//)
      expect(source.title).toBeDefined()
      // SearxNG chrome: archive mirrors, cached/translate links, breadcrumbs.
      expect(source.url).not.toContain('web.archive.org')
      expect(source.url).not.toMatch(/\/(cached|translate|next|previous)$/)
      expect(source.snippet ?? '').not.toContain('\u203a')
    }
    // A page footer can offer a result with nothing but a separator under it
    // ("Source code" over `"|"`); that separator is chrome, not a snippet, so the
    // source simply carries none.
    expect(sources.filter((source) => source.snippet !== undefined).length).toBeGreaterThan(sources.length - 6)
    expect(sources.some((source) => isChromeText(source.snippet))).toBe(false)
  })

  it('unwraps the redirect annotations the direct pages carry', () => {
    expect(resolveResultUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&rut=00')).toBe('https://example.com/a')
    expect(resolveResultUrl('https://yandex.com/clck/jsredir?url=https%3A%2F%2Fexample.com%2Fb')).toBe('https://example.com/b')
    expect(resolveResultUrl('https://example.com/plain?x=1')).toBe('https://example.com/plain?x=1')
    expect(resolveResultUrl('/html/')).toBe('/html/')
  })

  it('yields DuckDuckGo results with titles and description snippets', () => {
    const sources = parseSources(duckduckgo)
    expect(sources.length).toBeGreaterThan(8)
    for (const source of sources) {
      // Every DuckDuckGo annotation is a protocol-relative `/l/` redirect.
      expect(source.url).toMatch(/^https?:\/\//)
      expect(source.url).not.toContain('duckduckgo.com')
      expect(source.title).toBeDefined()
      expect(isChromeText(source.title)).toBe(false)
    }
    expect(sources.filter((source) => (source.snippet ?? '').length > 40).length).toBe(sources.length)
  })

  it('yields Yandex results under real titles, never under its own chrome', () => {
    const sources = parseSources(yandex)
    expect(sources.length).toBeGreaterThan(8)
    for (const source of sources) {
      expect(source.url).toMatch(/^https?:\/\//)
      // The tab bar, login, footer, and related-search links all cite the engine.
      expect(source.url).not.toMatch(/(^|\.)yandex\.(com|ru)\//)
      expect(source.url).not.toMatch(/^https:\/\/www\.bing\.com\/search/)
      expect(source.title).toBeDefined()
      // The fact card cites these URLs with the bare domain as its only label.
      expect(isChromeText(source.title)).toBe(false)
    }
    expect(sources.filter((source) => (source.snippet ?? '').length > 40).length).toBeGreaterThan(sources.length - 3)
    expect(sources.some((source) => /^[.\u2014\u2013]\s/.test(source.snippet ?? ''))).toBe(false)
  })

  it('names one address once, with the better title of the blocks that cite it', () => {
    const sources = parseSources(yandex)
    const urls = sources.map((source) => source.url)
    expect(urls).toEqual([...new Set(urls)])
    const cited = sources.find((source) => source.url.startsWith('https://chat-deep.ai/'))
    expect(cited?.title).toBeDefined()
    expect(cited?.title).not.toBe('chat-deep.ai')
  })

  it('lists each result URL once', () => {
    for (const snapshotText of [google, searx]) {
      const urls = parseSources(snapshotText).map((source) => source.url)
      expect(urls).toEqual([...new Set(urls)])
    }
  })

  it('drops the archive mirror but keeps the mirrored page once', () => {
    const urls = parseSources(searx).map((source) => source.url)
    const mirrored = 'https://github.com/deepseek-ai/deepseek-harness/discussions/2671'
    expect(urls.filter((url) => url === mirrored)).toHaveLength(1)
    expect(urls.some((url) => url.includes('web.archive.org'))).toBe(false)
  })

  it('parses nothing from an empty or chrome-only snapshot', () => {
    expect(parseSources('')).toEqual([])
    expect(parseSources('- text: No results')).toEqual([])
  })
})

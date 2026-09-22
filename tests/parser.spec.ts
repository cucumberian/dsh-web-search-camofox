/**
 * Parser behavior against recorded camofox accessibility snapshots: a Google
 * results page (quoted `link "…"` blocks, `/url:` children, `emphasis:` and
 * `text:` snippets) and a SearxNG results page (`article:` blocks, `[level=3]`
 * headings, `paragraph:` snippets, breadcrumb links, `web.archive.org` mirrors).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseSources } from '../src/provider.ts'

const snapshot = (name: string): string => {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
  return (JSON.parse(readFileSync(path, 'utf8')) as { snapshot: string }).snapshot
}

const google = snapshot('google-snapshot.json')
const searx = snapshot('searx-snapshot.json')

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
      expect(source.snippet).toBeDefined()
      // SearxNG chrome: archive mirrors, cached/translate links, breadcrumbs.
      expect(source.url).not.toContain('web.archive.org')
      expect(source.url).not.toMatch(/\/(cached|translate|next|previous)$/)
      expect(source.snippet).not.toContain('\u203a')
    }
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

/**
 * Real-API smoke for the camofox search provider: a live query through the real
 * camofox-browser container, driven by the provider directly. Self-skips without
 * `$CAMOFOX_API_KEY` (CI has no secrets) or when the container is unreachable,
 * per the with-key e2e policy in docs/testing.md.
 */

import { describe, expect, it } from 'vitest'
import { CamofoxSearchProvider, CAMOFOX_DEFAULT_BASE_URL, CAMOFOX_DEFAULT_ENGINE, CAMOFOX_DEFAULT_SESSION_KEY, CAMOFOX_DEFAULT_USER_ID, CAMOFOX_MAX_SNAPSHOT_CHARS } from '../src/index.ts'

const apiKey = process.env.CAMOFOX_API_KEY
const baseURL = process.env.CAMOFOX_BASE_URL ?? CAMOFOX_DEFAULT_BASE_URL

async function reachable(): Promise<boolean> {
  try {
    const response = await fetch(`${baseURL}/health`)
    const body = await response.json() as { running?: boolean }
    return response.ok && body.running === true
  } catch {
    return false
  }
}

const live = apiKey !== undefined && apiKey.length > 0

function provider(): CamofoxSearchProvider {
  return new CamofoxSearchProvider(() => ({
    baseURL,
    userId: CAMOFOX_DEFAULT_USER_ID,
    sessionKey: CAMOFOX_DEFAULT_SESSION_KEY,
    engine: CAMOFOX_DEFAULT_ENGINE,
    maxSnapshotChars: CAMOFOX_MAX_SNAPSHOT_CHARS,
    apiKey: apiKey!,
  }))
}

describe('CamofoxSearchProvider real browser', () => {
  it('returns sources for a live query', async (test) => {
    if (!live || !(await reachable())) test.skip()
    const result = await provider().search({ query: 'DeepSeek Harness', maxResults: 5 })
    expect(result.sources.length).toBeGreaterThan(0)
    for (const source of result.sources) {
      expect(source.url).toMatch(/^https?:\/\//)
      // Engine chrome and archive proxies are not citeable results.
      expect(source.url).not.toContain('web.archive.org')
    }
    expect(result.sources.some((source) => source.title !== undefined)).toBe(true)
    expect(provider().available()).toBe(true)
  }, 120_000)

  it('serves queries submitted together through one instance', async (test) => {
    if (!live || !(await reachable())) test.skip()
    // `dsh-tool-web` submits its queries concurrently, so this is the path a
    // model call takes: three searches racing on one camofox user.
    const instance = provider()
    const results = await Promise.allSettled([
      instance.search({ query: 'DeepSeek Harness', maxResults: 5 }),
      instance.search({ query: 'SearXNG instances', maxResults: 5 }),
      instance.search({ query: 'camoufox browser automation', maxResults: 5 }),
    ])
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled'])
    for (const result of results) {
      if (result.status === 'fulfilled') expect(result.value.sources.length).toBeGreaterThan(0)
    }
  }, 180_000)
})

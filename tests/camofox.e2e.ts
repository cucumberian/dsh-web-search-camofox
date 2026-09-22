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

describe('CamofoxSearchProvider real browser', () => {
  it('returns sources for a live query', async (test) => {
    if (!live || !(await reachable())) test.skip()
    const provider = new CamofoxSearchProvider(() => ({
      baseURL,
      userId: CAMOFOX_DEFAULT_USER_ID,
      sessionKey: CAMOFOX_DEFAULT_SESSION_KEY,
      engine: CAMOFOX_DEFAULT_ENGINE,
      maxSnapshotChars: CAMOFOX_MAX_SNAPSHOT_CHARS,
      apiKey: apiKey!,
    }))
    const result = await provider.search({ query: 'DeepSeek Harness', maxResults: 5 })
    expect(result.sources.length).toBeGreaterThan(0)
    for (const source of result.sources) {
      expect(source.url).toMatch(/^https?:\/\//)
      // Engine chrome and archive proxies are not citeable results.
      expect(source.url).not.toContain('web.archive.org')
    }
    expect(result.sources.some((source) => source.title !== undefined)).toBe(true)
    expect(provider.available()).toBe(true)
  }, 120_000)
})

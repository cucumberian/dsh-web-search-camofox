/**
 * Integration: the real seam (`dsh-web`) + the real camofox provider
 * (`dsh-web-search-camofox`), through `ctx.web.search()` — nothing bypasses the
 * web seam. Search drives the real camofox-browser container (localhost:9377), so
 * this spec self-skips when the browser is unreachable. It doubles as the
 * package's REAL-composition coverage: registering the provider and selecting it
 * via `searchProvider`, then running a live camofox search.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as WebSearchCamofox from '../src/index.ts'

let ctx: Context
let fibers: Array<Awaited<ReturnType<Context['plugin']>>>

async function camofoxReachable(): Promise<boolean> {
  try {
    const response = await fetch(WebSearchCamofox.CAMOFOX_DEFAULT_BASE_URL + '/health')
    const body = await response.json() as { running?: boolean }
    return response.ok && body.running === true
  } catch {
    return false
  }
}

beforeEach(async () => {
  ctx = new Context()
  fibers = []
  fibers.push(await ctx.plugin(WebRuntime, { searchProvider: WebSearchCamofox.CAMOFOX_PROVIDER_ID }))
  fibers.push(await ctx.plugin(WebSearchCamofox, {}))
})

afterEach(async () => {
  for (const fiber of fibers.reverse()) await fiber.dispose()
})

describe('camofox search provider integration', () => {
  it('searches the live camofox browser and returns sources', async (test) => {
    if (!(await camofoxReachable())) test.skip()
    const result = await ctx.web.search({ query: 'deepseek harness', maxResults: 5 })
    expect(result.sources.length).toBeGreaterThan(0)
    expect(result.sources[0]!.url).toMatch(/^https?:\/\//)
  }, 120000)
})

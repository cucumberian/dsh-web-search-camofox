/**
 * Real-composition coverage: `dsh-web` plus this package's plugin, driven through
 * `ctx.web.search()`. Registration, provider disposal, the settings section, and
 * credential-backed key resolution run against a stubbed camofox REST so they
 * hold no external dependency; the live browser run lives in `camofox.e2e.ts`.
 */

import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as WebSearchCamofox from '../src/index.ts'
import { CAMOFOX_PROVIDER_ID, WEB_SEARCH_CAMOFOX_SETTINGS_NAMESPACE } from '../src/index.ts'

/** The smallest real settings provider: one in-memory document, always writable. */
class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

/** A recorded SearxNG results page, trimmed to the lines the parser needs. */
const SNIPPET = [
  '  - article:',
  '    - link [e1]:',
  '      - /url: https://github.com/deepseek-ai/deepseek-harness',
  '      - text: github.com › deepseek-ai',
  '    - heading "DeepSeek Harness" [level=3]',
  '    - paragraph: An open-source agent harness where everything is a plugin.',
].join('\n')

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

/**
 * Answer the four camofox REST calls one search makes, recording each request.
 * @param snapshot - the snapshot the tab reports after navigating.
 * @returns the recorded fetch calls.
 */
function stubCamofox(snapshot = SNIPPET): Array<[string, RequestInit]> {
  const calls: Array<[string, RequestInit]> = []
  vi.stubGlobal('fetch', vi.fn(async (url: URL | string, init?: RequestInit) => {
    const target = String(url)
    calls.push([target, init ?? {}])
    if (target.endsWith('/tabs')) return jsonResponse({ tabId: 'tab-1', url: 'about:blank' })
    if (target.includes('/navigate')) return jsonResponse({ ok: true, url: 'https://priv.au/search?q=deepseek' })
    if (target.includes('/snapshot')) {
      return jsonResponse({ url: 'https://priv.au/search?q=deepseek', snapshot, truncated: false, hasMore: false, totalChars: snapshot.length, nextOffset: null })
    }
    return jsonResponse({ ok: true })
  }))
  return calls
}

/** Mount the seam configured for camofox, the settings service, and this plugin. */
async function boot(config: WebSearchCamofox.Config = {}): Promise<{ ctx: Context; settingsFiber: Fiber; pluginFiber: Fiber }> {
  const ctx = new Context()
  const webFiber = await ctx.plugin(WebRuntime, { searchProvider: CAMOFOX_PROVIDER_ID })
  const settingsFiber = ctx.plugin(MemorySettings)
  await settingsFiber.await()
  const pluginFiber = ctx.plugin(WebSearchCamofox, config)
  await pluginFiber.await()
  void webFiber
  return { ctx, settingsFiber, pluginFiber }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('camofox search provider composition', () => {
  it('serves the seam and removes itself when the plugin fiber disposes', async () => {
    const calls = stubCamofox()
    const bench = await boot()
    await expect(bench.ctx.web.search({ query: 'deepseek harness' })).resolves.toMatchObject({
      sources: [{ url: 'https://github.com/deepseek-ai/deepseek-harness', title: 'DeepSeek Harness' }],
      truncated: false,
    })
    expect(calls[0]?.[0]).toBe('http://localhost:9377/tabs')

    await bench.pluginFiber.dispose()
    await expect(bench.ctx.web.search({ query: 'deepseek harness' })).rejects.toMatchObject({
      code: 'WEB_PROVIDER_CONFIGURED_MISSING',
    })
    await bench.ctx.fiber.dispose()
  })

  it('caps the parsed sources to the request maxResults', async () => {
    stubCamofox([SNIPPET, SNIPPET.replace('github.com/deepseek-ai', 'dev.to/deepseek')].join('\n'))
    const bench = await boot()
    const result = await bench.ctx.web.search({ query: 'deepseek harness', maxResults: 1 })
    expect(result.sources).toHaveLength(1)
    expect(result.truncated).toBe(true)
    await bench.ctx.fiber.dispose()
  })

  it('serves a stored searchUrl and engine to the next search without re-registering', async () => {
    const bench = await boot()
    const calls = stubCamofox()
    await bench.ctx.web.search({ query: 'deepseek harness' })
    expect(calls[1]?.[1].body).toContain('https://priv.au/search?q=deepseek%20harness')
    calls.length = 0

    await bench.ctx.settings.update(WEB_SEARCH_CAMOFOX_SETTINGS_NAMESPACE, { searchUrl: 'https://searx.be/search?q={query}' })
    await bench.ctx.web.search({ query: 'deepseek harness' })
    expect(calls[1]?.[1].body).toContain('https://searx.be/search?q=deepseek%20harness')
    await bench.ctx.fiber.dispose()
  })

  it('keeps the literal key out of every described settings layer', async () => {
    const bench = await boot({ apiKey: 'camofox-entry-secret' })
    await bench.ctx.settings.update(WEB_SEARCH_CAMOFOX_SETTINGS_NAMESPACE, { apiKey: 'camofox-stored-secret' })
    const [descriptor] = bench.ctx.settings.describe({ redactSecrets: true })
      .filter(row => String(row.ns) === WEB_SEARCH_CAMOFOX_SETTINGS_NAMESPACE)
    expect(JSON.stringify(descriptor)).not.toContain('camofox-stored-secret')
    expect(descriptor?.secrets).toEqual([{ path: ['apiKey'], set: true }])
    await bench.ctx.fiber.dispose()
  })

  it('falls back to the composition entry when the settings provider detaches', async () => {
    const bench = await boot({ searchUrl: 'https://entry.test/search?q={query}' })
    let calls = stubCamofox()
    await bench.ctx.web.search({ query: 'deepseek harness' })
    expect(calls[1]?.[1].body).toContain('https://entry.test/search')

    await bench.settingsFiber.dispose()
    calls = stubCamofox()
    await bench.ctx.web.search({ query: 'deepseek harness' })
    expect(calls[1]?.[1].body).toContain('https://entry.test/search')
    await bench.ctx.fiber.dispose()
  })

  it('authorizes every camofox request with the key the credentials provider resolves', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-camofox-credentials-'))
    try {
      await writeFile(join(home, '.credentials.yaml'), 'version: 1\nrefs:\n  CAMOFOX_API_KEY: from-credentials\n', 'utf8')
      // The provider refuses a credentials document that other users can read.
      await chmod(join(home, '.credentials.yaml'), 0o600)
      const ctx = new Context()
      await ctx.plugin(WebRuntime, { searchProvider: CAMOFOX_PROVIDER_ID })
      await ctx.plugin(LocalCredentialProvider, { dshHome: home, watch: false })
      const calls = stubCamofox()
      await ctx.plugin(WebSearchCamofox, {})
      await ctx.web.search({ query: 'deepseek harness' })
      const authorizations = calls.map(([, init]) => (init.headers as Record<string, string> | undefined)?.authorization)
      expect(authorizations).toEqual(['Bearer from-credentials', 'Bearer from-credentials', 'Bearer from-credentials', 'Bearer from-credentials'])
      await ctx.fiber.dispose()
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})
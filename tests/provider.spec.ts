/**
 * Tests for the CamoFox search provider.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CamofoxSearchProvider, CAMOFOX_PROVIDER_ID, parseSources } from '../src/provider.ts'
import type { CamofoxSearchProviderOptions } from '../src/provider.ts'

describe('CamofoxSearchProvider', () => {
  let mockOptions: CamofoxSearchProviderOptions
  let provider: CamofoxSearchProvider

  beforeEach(() => {
    mockOptions = {
      baseURL: 'http://localhost:9377',
      userId: 'default-user',
      sessionKey: 'dsh-web-search',
      engine: 'google',
    }
    provider = new CamofoxSearchProvider(mockOptions)
  })

  it('registers with correct provider id', () => {
    expect(provider.id).toBe(CAMOFOX_PROVIDER_ID)
  })

  it('reports available when baseURL is valid', () => {
    expect(provider.available()).toBe(true)
  })

  it('reports unavailable when baseURL is invalid', () => {
    const provider2 = new CamofoxSearchProvider({ ...mockOptions, baseURL: 'not-a-url' })
    expect(provider2.available()).toBe(false)
  })
})

describe('parseSources', () => {
  it('extracts sources from accessibility snapshot', () => {
    const snapshot = `
- link "Test Result" [e1]:
    - /url: https://example.com/result
- text "This is a test snippet" [e2]
`
    const sources = parseSources(snapshot)
    expect(sources).toHaveLength(1)
    expect(sources[0].url).toBe('https://example.com/result')
    expect(sources[0].title).toBe('Test Result')
    expect(sources[0].snippet).toBe('This is a test snippet')
  })

  it('deduplicates repeated URLs', () => {
    const snapshot = `
- link "Result 1" [e1]:
    - /url: https://example.com/1
- text "Snippet 1" [e2]
- link "Result 2" [e3]:
    - /url: https://example.com/1
- text "Snippet 2" [e4]
`
    const sources = parseSources(snapshot)
    expect(sources).toHaveLength(1)
  })

  it('filters out Google chrome URLs', () => {
    const snapshot = `
- link "Google Login" [e1]:
    - /url: https://accounts.google.com/ServiceLogin
- text "Login" [e2]
- link "Real Result" [e3]:
    - /url: https://example.com/real
- text "Real snippet" [e4]
`
    const sources = parseSources(snapshot)
    expect(sources).toHaveLength(1)
    expect(sources[0].url).toBe('https://example.com/real')
  })

  it('returns empty array for empty snapshot', () => {
    const sources = parseSources('')
    expect(sources).toEqual([])
  })
})
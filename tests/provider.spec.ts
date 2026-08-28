/**
 * Tests for the CamoFox search provider.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CamoFoxSearchProvider, mapCamoFoxResults, CAMOFOX_PROVIDER_ID } from '../src/provider.ts'
import type { CamoFoxSearchProviderOptions, WebSearchRequest } from '../src/provider.ts'

describe('CamoFoxSearchProvider', () => {
  let mockOptions: () => CamoFoxSearchProviderOptions
  let provider: CamoFoxSearchProvider

  beforeEach(() => {
    mockOptions = () => ({
      baseURL: 'http://localhost:4444',
      engine: 'google',
      maxResults: 10,
    })
    provider = new CamoFoxSearchProvider(mockOptions)
  })

  it('registers with correct provider id', () => {
    expect(provider.id).toBe(CAMOFOX_PROVIDER_ID)
  })

  it('reports available when baseURL is valid', () => {
    expect(provider.available()).toBe(true)
  })

  it('reports unavailable when baseURL is invalid', () => {
    mockOptions = () => ({
      baseURL: 'not-a-url',
      engine: 'google',
      maxResults: 10,
    })
    provider = new CamoFoxSearchProvider(mockOptions)
    expect(provider.available()).toBe(false)
  })

  it('reports unavailable when maxResults is not positive integer', () => {
    mockOptions = () => ({
      baseURL: 'http://localhost:4444',
      engine: 'google',
      maxResults: 0,
    })
    provider = new CamoFoxSearchProvider(mockOptions)
    expect(provider.available()).toBe(false)
  })
})

describe('mapCamoFoxResults', () => {
  it('returns empty result for null snapshot', () => {
    const result = mapCamoFoxResults(null, 10)
    expect(result.sources).toEqual([])
    expect(result.truncated).toBe(false)
  })

  it('returns empty result for invalid snapshot', () => {
    const result = mapCamoFoxResults('not-an-object', 10)
    expect(result.sources).toEqual([])
    expect(result.truncated).toBe(false)
  })

  it('extracts sources from results array', () => {
    const snapshot = {
      results: [
        { url: 'https://example.com/1', title: 'Result 1', snippet: 'Snippet 1' },
        { url: 'https://example.com/2', title: 'Result 2' },
      ],
    }
    const result = mapCamoFoxResults(snapshot, 10)
    expect(result.sources).toHaveLength(2)
    expect(result.sources[0].url).toBe('https://example.com/1')
    expect(result.sources[0].title).toBe('Result 1')
    expect(result.sources[0].snippet).toBe('Snippet 1')
    expect(result.sources[1].url).toBe('https://example.com/2')
    expect(result.sources[1].title).toBe('Result 2')
    expect(result.truncated).toBe(false)
  })

  it('truncates when maxResults exceeded', () => {
    const snapshot = {
      results: [
        { url: 'https://example.com/1' },
        { url: 'https://example.com/2' },
        { url: 'https://example.com/3' },
      ],
    }
    const result = mapCamoFoxResults(snapshot, 2)
    expect(result.sources).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })
})
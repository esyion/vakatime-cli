// Regression: a bare-host endpoint ("vakatime.example.com", no scheme) reached
// fetch() verbatim and died with "Failed to parse URL from ..." on every
// upload. normalizeEndpoint is the single choke point fixing that.
import { describe, expect, it } from 'vitest'
import { normalizeEndpoint } from './config.js'

describe('normalizeEndpoint', () => {
  it('prepends https:// to a bare host', () => {
    expect(normalizeEndpoint('vakatime.example.com')).toBe('https://vakatime.example.com')
  })

  it('keeps an explicit scheme and strips trailing slashes', () => {
    expect(normalizeEndpoint('http://127.0.0.1:15432///')).toBe('http://127.0.0.1:15432')
  })

  it('trims whitespace and trailing slash on a bare host', () => {
    expect(normalizeEndpoint('  vakatime.example.com/ ')).toBe('https://vakatime.example.com')
  })

  it('rejects non-http(s) protocols', () => {
    expect(() => normalizeEndpoint('ftp://vakatime.example.com')).toThrow(/unsupported endpoint protocol/)
  })

  it('rejects garbage that is not a URL even after prepending https://', () => {
    expect(() => normalizeEndpoint('http://')).toThrow(/invalid endpoint/)
  })
})

import { safeRedirectUrl } from './redirect.js'

const SERVER_URL = 'http://apollo.example.com'

describe('safeRedirectUrl', () => {
  it('returns a same-origin URL unchanged', () => {
    const url = `${SERVER_URL}/some/path?foo=bar`
    expect(safeRedirectUrl(SERVER_URL, url).toString()).toBe(url)
  })

  it('blocks an external origin and falls back to server root', () => {
    const result = safeRedirectUrl(SERVER_URL, 'https://evil.com/steal')
    expect(result.origin).toBe(new URL(SERVER_URL).origin)
    expect(result.toString()).not.toContain('evil.com')
  })

  it('falls back to server root for an invalid URL', () => {
    const result = safeRedirectUrl(SERVER_URL, 'not-a-valid-url')
    expect(result.origin).toBe(new URL(SERVER_URL).origin)
  })

  it('preserves the path and query for same-origin URLs', () => {
    const url = `${SERVER_URL}/path?a=1&b=2`
    const result = safeRedirectUrl(SERVER_URL, url)
    expect(result.pathname).toBe('/path')
    expect(result.search).toBe('?a=1&b=2')
  })

  it('treats same host on a different port as a different origin', () => {
    const result = safeRedirectUrl(
      SERVER_URL,
      'http://apollo.example.com:9000/x',
    )
    expect(result.origin).toBe(new URL(SERVER_URL).origin)
  })
})

/**
 * Validates redirectUri against the server origin and returns a safe URL object.
 * Falls back to the server root if the URI is invalid or has a different origin.
 */
export function safeRedirectUrl(serverUrl: string, redirectUri: string) {
  const serverOrigin = new URL(serverUrl).origin
  let url: URL
  try {
    url = new URL(redirectUri)
  } catch {
    url = new URL(serverOrigin)
  }
  if (url.origin !== serverOrigin) {
    url = new URL(serverOrigin)
  }
  return url
}

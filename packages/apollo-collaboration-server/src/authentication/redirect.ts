/**
 * Validates redirectUri against the server origin (and any additional allowed
 * origins) and returns a safe URL object. Falls back to the server root if the
 * URI is invalid or has a disallowed origin.
 */
export function safeRedirectUrl(
  serverUrl: string,
  redirectUri: string,
  allowedOrigins?: string[],
) {
  const serverOrigin = new URL(serverUrl).origin
  const allowed = new Set([serverOrigin, ...(allowedOrigins ?? [])])
  let url: URL
  try {
    url = new URL(redirectUri)
  } catch {
    url = new URL(serverOrigin)
  }
  if (!allowed.has(url.origin)) {
    url = new URL(serverOrigin)
  }
  return url
}

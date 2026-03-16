const jsonHeaders = { Accept: 'application/json' }

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: jsonHeaders })
  if (res.status === 401) {
    globalThis.location.href = '/'
    throw new Error('Not authenticated')
  }
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  return res.json()
}

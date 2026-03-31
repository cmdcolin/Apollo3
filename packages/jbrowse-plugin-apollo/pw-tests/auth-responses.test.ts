import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { resetDatabase } from './helpers.js'

const API_BASE = 'http://127.0.0.1:3999'
const jsonHeaders = { Accept: 'application/json' }

const LOG_FILE = path.resolve(import.meta.dirname, '../.e2e-server.log')

test.describe('Auth endpoint responses (no double-send)', () => {
  test.beforeAll(async () => {
    await resetDatabase()
  })

  test('GET /users/me without auth returns 204', async () => {
    const res = await fetch(`${API_BASE}/users/me`, { headers: jsonHeaders })
    expect(res.status).toBe(204)
    const body = await res.text()
    expect(body).toBe('')
  })

  test('GET /auth/types returns 200 with passwordLogin field', async () => {
    const res = await fetch(`${API_BASE}/auth/types`, { headers: jsonHeaders })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('passwordLogin')
  })

  test('GET /auth/setup-active returns 200', async () => {
    const res = await fetch(`${API_BASE}/auth/setup-active`, {
      headers: jsonHeaders,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('active')
  })

  test('GET /auth/logout returns 302 redirect to /', async () => {
    const res = await fetch(`${API_BASE}/auth/logout`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
  })

  test('POST /auth/login with wrong credentials returns 401 JSON', async () => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: 'nobody@example.com',
        password: 'wrongpassword',
      }),
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toHaveProperty('statusCode', 401)
  })

  test('GET /auth/setup with invalid token returns 400 JSON', async () => {
    const res = await fetch(`${API_BASE}/auth/setup?token=badtoken`, {
      redirect: 'manual',
      headers: jsonHeaders,
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('statusCode', 400)
  })

  test('error responses are JSON for JSON-accepting clients', async () => {
    const res = await fetch(`${API_BASE}/nonexistent-endpoint`, {
      headers: jsonHeaders,
    })
    expect(res.status).toBe(404)
    const contentType = res.headers.get('content-type') ?? ''
    expect(contentType).toContain('application/json')
  })

  test('concurrent /users/me requests cause no errors', async () => {
    const requests = Array.from({ length: 20 }, () =>
      fetch(`${API_BASE}/users/me`, { headers: jsonHeaders }),
    )
    const responses = await Promise.all(requests)
    for (const res of responses) {
      expect(res.status).toBe(204)
    }
  })
})

test.describe('Setup → login → authenticated /users/me', () => {
  test.beforeAll(async () => {
    await resetDatabase()
  })

  test('full auth flow returns user with correct role', async () => {
    // After reset, setup should be active (no admin exists)
    const setupRes = await fetch(`${API_BASE}/auth/setup-active`, {
      headers: jsonHeaders,
    })
    const { active } = (await setupRes.json()) as { active: boolean }
    if (!active) {
      // Setup not active means an admin already exists (e.g. root user);
      // skip this test since we can't create a fresh admin.
      return
    }

    // Create admin account via setup flow
    const email = 'testadmin@example.com'
    const password = 'testpass1'
    const accountRes = await fetch(`${API_BASE}/auth/setup-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username: 'testadmin', password }),
    })
    expect(accountRes.status).toBe(201)
    const { token } = (await accountRes.json()) as { token: string }
    expect(token.length).toBeGreaterThan(10)

    // Authenticated /users/me should return user info from DB
    const meRes = await fetch(`${API_BASE}/users/me`, {
      headers: { ...jsonHeaders, Authorization: `Bearer ${token}` },
    })
    expect(meRes.status).toBe(200)
    const me = (await meRes.json()) as Record<string, unknown>
    expect(me.email).toBe(email)
    expect(me.username).toBe('testadmin')
    expect(me.role).toBe('admin')
    expect(me.needsRelogin).toBe(false)

    // Login with password should also work
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    expect(loginRes.status).toBe(201)
    const loginBody = (await loginRes.json()) as { token: string }
    expect(loginBody.token.length).toBeGreaterThan(10)

    // Verify login token also works for /users/me
    const meRes2 = await fetch(`${API_BASE}/users/me`, {
      headers: { ...jsonHeaders, Authorization: `Bearer ${loginBody.token}` },
    })
    expect(meRes2.status).toBe(200)
    const me2 = (await meRes2.json()) as Record<string, unknown>
    expect(me2.role).toBe('admin')
  })
})

test.describe('Server log check', () => {
  test('no ERR_HTTP_HEADERS_SENT in server log', () => {
    let log: string
    try {
      log = readFileSync(LOG_FILE, 'utf8')
    } catch {
      // Log file doesn't exist (e.g. running against dev server) — skip.
      return
    }
    const headersSentErrors = log
      .split('\n')
      .filter((line) => line.includes('ERR_HTTP_HEADERS_SENT'))
    expect(headersSentErrors).toEqual([])
  })
})

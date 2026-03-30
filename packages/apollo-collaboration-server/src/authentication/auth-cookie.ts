import type { CookieOptions } from 'express'

export const AUTH_COOKIE_NAME = 'apollo-token'

const isProduction = process.env.NODE_ENV === 'production'

export const COOKIE_BASE: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  path: '/',
}

export const COOKIE_OPTIONS: CookieOptions = {
  ...COOKIE_BASE,
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

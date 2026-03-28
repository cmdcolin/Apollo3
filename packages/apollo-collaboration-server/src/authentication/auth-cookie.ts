import type { CookieOptions } from 'express'

const isProduction = process.env.NODE_ENV === 'production'

export const COOKIE_BASE: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  path: '/',
}

export const COOKIE_OPTIONS: CookieOptions = {
  ...COOKIE_BASE,
  maxAge: 24 * 60 * 60 * 1000,
}

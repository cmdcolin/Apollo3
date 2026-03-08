import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadDbBackend() {
  if (process.env.DB_BACKEND) {
    return process.env.DB_BACKEND
  }
  const nodeEnv = process.env.NODE_ENV ?? 'production'
  const envFile = nodeEnv === 'production' ? '.env' : '.development.env'
  try {
    const content = readFileSync(resolve(envFile), 'utf-8')
    const match = content.match(/^DB_BACKEND=(.+)$/m)
    if (match) {
      return match[1].trim()
    }
  } catch {
    // env file not found, fall through to default
  }
  return undefined
}

const dbBackend = loadDbBackend()

export const useMongoose = !dbBackend || dbBackend === 'mongodb'

export const GUEST_USER_NAME = 'Guest'
// not a valid email, so shouldn't overlap with any regular users' emails
export const GUEST_USER_EMAIL = 'guest_user'
export const ROOT_USER_EMAIL = 'root_user'

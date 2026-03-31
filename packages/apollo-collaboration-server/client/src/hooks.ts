import { createContext, useContext } from 'react'

import useSWR from 'swr'

import { fetchJson } from './fetchUtil.js'

export interface CurrentUser {
  username: string
  email: string
  role: string
  pendingApproval?: boolean
  needsRelogin?: boolean
}

const jsonHeaders = { Accept: 'application/json' }

async function fetchCurrentUser(url: string) {
  const res = await fetch(url, { headers: jsonHeaders })
  if (res.status === 200) {
    return res.json() as Promise<CurrentUser>
  }
  return null
}

export function useCurrentUser() {
  const { data, isLoading } = useSWR('/users/me', fetchCurrentUser)
  return { user: data ?? null, checked: !isLoading }
}

const AuthContext = createContext<CurrentUser | null>(null)
export const AuthProvider = AuthContext.Provider

export function useAuth() {
  return useContext(AuthContext)
}

export interface DashboardData {
  adminEmail?: string
  activeUsers?: number
  totalUsers?: number
  pendingCount?: number
}

export function useDashboard(isAuthenticated: boolean) {
  const { data } = useSWR<DashboardData>(
    isAuthenticated ? '/users/dashboard' : null,
    fetchJson,
  )
  return data ?? {}
}

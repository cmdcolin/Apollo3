import { createContext, useContext } from 'react'

import useSWR from 'swr'

export interface CurrentUser {
  username: string
  email: string
  role: string
  pendingApproval?: boolean
  needsRelogin?: boolean
}

export interface DashboardData {
  adminEmail?: string
  activeUsers?: number
  totalUsers?: number
  pendingCount?: number
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
  const { data, error, isLoading } = useSWR('/users/me', fetchCurrentUser)
  return { user: data ?? null, checked: !isLoading, error }
}

const AuthContext = createContext<CurrentUser | null>(null)
export const AuthProvider = AuthContext.Provider

export function useAuth() {
  return useContext(AuthContext)
}

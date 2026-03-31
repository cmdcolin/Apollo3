import { createContext, useContext, useEffect, useState } from 'react'

const jsonHeaders = { Accept: 'application/json' }

export interface CurrentUser {
  username: string
  email: string
  role: string
  pendingApproval?: boolean
  needsRelogin?: boolean
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    fetch('/users/me', { headers: jsonHeaders })
      .then((r) => {
        if (r.status === 200) {
          return r.json() as Promise<CurrentUser>
        }
        return null
      })
      .then((data) => {
        setUser(data)
        setChecked(true)
      })
      .catch((error: unknown) => {
        console.error('Failed to fetch current user:', error)
        setChecked(true)
      })
  }, [])

  return { user, checked }
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
  const [data, setData] = useState<DashboardData>({})

  useEffect(() => {
    if (!isAuthenticated) {
      return
    }
    fetch('/users/dashboard', { headers: jsonHeaders })
      .then((r) => {
        if (r.ok) {
          return r.json() as Promise<DashboardData>
        }
        return null
      })
      .then((d) => {
        if (d) {
          setData(d)
        }
      })
      .catch(() => {
        /* ignore */
      })
  }, [isAuthenticated])

  return data
}

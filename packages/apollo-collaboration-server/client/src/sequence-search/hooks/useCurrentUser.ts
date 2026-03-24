import { useEffect, useState } from 'react'

export interface UserInfo {
  username: string
  email: string
  role: string
}

export function useCurrentUser() {
  const [user, setUser] = useState<UserInfo>()

  useEffect(() => {
    fetch('/users/me', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setUser(data as UserInfo)
        }
      })
      .catch((error_: unknown) => {
        console.error('Failed to fetch user info', error_)
      })
  }, [])

  return user
}

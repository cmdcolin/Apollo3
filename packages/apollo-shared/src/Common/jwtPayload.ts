export interface JWTPayload {
  username: string
  email: string
  role: 'admin' | 'user' | 'readOnly' | 'none'
  id: string
}

export interface DecodedJWT extends JWTPayload {
  iat: number
  exp: number
}

export function makeUserSessionId(user: DecodedJWT) {
  return `${user.id}-${user.iat}`
}

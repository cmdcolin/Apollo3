import type { DecodedJWT } from '@apollo-annotation/shared'
import type { Request } from 'express'

export interface RequestWithUser extends Request {
  user?: DecodedJWT
}

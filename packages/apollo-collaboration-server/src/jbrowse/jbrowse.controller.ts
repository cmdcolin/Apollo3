import { Controller, Get, Logger, Req } from '@nestjs/common'
import type { Request } from 'express'

import { Public } from '../utils/jwt-auth.guard.js'
import { Role } from '../utils/role/role.enum.js'

import { JBrowseService } from './jbrowse.service.js'

export interface RequestWithUser extends Request {
  user?: { role: Role; id?: string }
}

@Controller()
export class JBrowseController {
  constructor(private readonly jbrowseService: JBrowseService) {}
  private readonly logger = new Logger(JBrowseController.name)

  @Public()
  @Get('jbrowse/config.json')
  jbrowseConfig(@Req() request: RequestWithUser) {
    return this.configResponse(request)
  }

  @Public()
  @Get('config.json')
  rootConfig(@Req() request: RequestWithUser) {
    return this.configResponse(request)
  }

  private configResponse(request: RequestWithUser) {
    const { user } = request
    if (!user) {
      throw new Error('No user for request')
    }
    const { role, id } = user
    this.logger.debug(
      `config.json requested: user.id=${id}, user.role=${role}, passing role=${id ? role : undefined}`,
    )
    return this.jbrowseService.getConfig(id ? role : undefined)
  }
}

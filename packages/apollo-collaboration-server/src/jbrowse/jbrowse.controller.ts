import { Controller, Get, Inject, Logger, Req } from '@nestjs/common'
import type { Request } from 'express'

import { Role } from '../utils/role/role.enum.js'
import { Public } from '../utils/roles.guard.js'

import { JBrowseService } from './jbrowse.service.js'

export interface RequestWithUser extends Request {
  user?: { role: Role; id?: string }
}

@Public()
@Controller()
export class JBrowseController {
  constructor(
    @Inject(JBrowseService) private readonly jbrowseService: JBrowseService,
  ) {}
  private readonly logger = new Logger(JBrowseController.name)

  @Get('jbrowse/config.json')
  jbrowseConfig(@Req() request: RequestWithUser) {
    return this.configResponse(request)
  }

  @Get('config.json')
  rootConfig(@Req() request: RequestWithUser) {
    return this.configResponse(request)
  }

  private configResponse(request: RequestWithUser) {
    const { user } = request
    const role = user?.id ? user.role : undefined
    this.logger.debug(
      `config.json requested: user.id=${user?.id}, user.role=${user?.role}, passing role=${role}`,
    )
    return this.jbrowseService.getConfig(role)
  }
}

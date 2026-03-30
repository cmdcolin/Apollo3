import {
  Controller,
  Get,
  Header,
  Inject,
  Logger,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import type { Response } from 'express'

import type { RequestWithUser } from '../authentication/request-with-user.js'
import { Public } from '../authentication/roles.guard.js'

import { JBrowseService } from './jbrowse.service.js'

// Apollo logo SVG — inlined to avoid file path issues with esbuild
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 856 855" height="48" width="48">
<style>.a{opacity:.85;fill:#85C0BD}.b{opacity:.85;fill:#00A29B}.c{opacity:.68;fill:#00A29B}.d{fill:#ACD1CF}</style>
<polygon class="a" points="630,756.9 806.4,756.9 513.7,246.9 425.1,400.2"/>
<polygon class="b" points="49.7,756.9 219.1,756.9 513.7,246.9 425.7,99.9"/>
<path class="c" d="M276.7,656.9l85-148h102.9c23.1,0,16.1-16,11.1-25l-134-238.5l85-148l185,315.6c0,0-15-26.3,0,0c53,92.9-24,243.9-132,243.9H276.7z"/>
<polygon class="d" points="175.7,657.3 195.6,657.3 277.9,508.9 254.1,508.9 170.6,657.3"/>
<polygon class="d" points="369.7,657.3 389.6,657.3 471.9,508.9 448.1,508.9 364.6,657.3"/>
<polygon class="d" points="321.7,657.3 341.6,657.3 423.9,508.9 400.1,508.9 316.6,657.3"/>
<polygon class="d" points="224.7,657.3 244.6,657.3 326.9,508.9 303.1,508.9 219.6,657.3"/>
<polygon class="d" points="273.7,657.3 293.6,657.3 375.9,508.9 352.1,508.9 268.6,657.3"/>
</svg>`

@Public()
@Controller()
export class JBrowseController {
  constructor(
    @Inject(JBrowseService) private readonly jbrowseService: JBrowseService,
  ) {}
  private readonly logger = new Logger(JBrowseController.name)

  @Get('jbrowse/config.json')
  jbrowseConfig(
    @Req() request: RequestWithUser,
    @Query('assemblies') assemblies?: string,
  ) {
    return this.configResponse(request, assemblies)
  }

  @Get('apollo_logo.svg')
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'public, max-age=86400')
  logo(@Res() res: Response) {
    res.send(logoSvg)
  }

  @Get('config.json')
  rootConfig(
    @Req() request: RequestWithUser,
    @Query('assemblies') assemblies?: string,
  ) {
    return this.configResponse(request, assemblies)
  }

  private configResponse(request: RequestWithUser, assemblies?: string) {
    const { user } = request
    const assemblyNames = assemblies
      ? assemblies.split(',').filter(Boolean)
      : undefined
    this.logger.debug(
      `config.json requested: user.id=${user?.id}, user.role=${user?.role}, assemblies=${assemblies ?? 'all'}`,
    )
    // Prefer X-Forwarded-Host so that when a dev proxy (Vite) or reverse proxy
    // (nginx) sits in front, the generated baseURL reflects the browser's
    // actual origin — not the internal backend host. Without this, the Apollo
    // plugin would make cross-origin API calls that don't carry auth cookies.
    const host = request.get('x-forwarded-host') ?? request.get('host')
    const proto = request.get('x-forwarded-proto') ?? request.protocol
    const requestOrigin = `${proto}://${host}`
    return this.jbrowseService.getConfig(user, assemblyNames, requestOrigin)
  }
}

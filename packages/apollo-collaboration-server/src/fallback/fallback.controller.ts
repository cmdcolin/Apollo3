import { Controller, Get, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'

import { Public } from '../authentication/roles.guard.js'

@Public()
@Controller()
export class FallbackController {
  @Get('*path')
  fallback(@Req() req: Request, @Res() res: Response) {
    if (req.accepts('html')) {
      res.redirect('/')
    } else {
      res.status(404).json({ statusCode: 404, message: 'Not Found' })
    }
  }
}

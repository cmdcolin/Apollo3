import type { JWTPayload } from '@apollo-annotation/shared'
import { assemblyChannel } from '@apollo-annotation/shared'
import { MikroORM, RequestContext } from '@mikro-orm/core'
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { OnGatewayConnection, OnGatewayInit } from '@nestjs/websockets'
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { JwtService } from '@nestjs/jwt'
import type { Server, Socket } from 'socket.io'

import { PermissionService } from '../permissions/permission.service.js'
import { AUTH_COOKIE_NAME } from '../utils/strategies/jwt.strategy.js'

function extractTokenFromCookie(cookieHeader: string) {
  const prefix = `${AUTH_COOKIE_NAME}=`
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length)
    }
  }
  return undefined
}

@WebSocketGateway({
  cors: {
    origin: new URL(process.env.URL ?? 'http://localhost:3999').origin,
    credentials: true,
  },
})
@Injectable()
export class MessagesGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server

  constructor(
    @Inject(PermissionService)
    private readonly permissionService: PermissionService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(MikroORM) private readonly orm: MikroORM,
  ) {}

  private readonly logger = new Logger(MessagesGateway.name)

  afterInit(server: Server) {
    server.use((socket, next) => {
      const token = extractTokenFromCookie(
        socket.handshake.headers.cookie ?? '',
      )
      if (!token) {
        next(new Error('No auth cookie'))
        return
      }
      try {
        const payload = this.jwtService.verify<JWTPayload>(token)
        socket.data.userId = payload.id
        next()
      } catch {
        next(new Error('Invalid token'))
      }
    })
  }

  async handleConnection(client: Socket) {
    const { userId } = client.data as { userId: string }
    await RequestContext.create(this.orm.em, async () => {
      const assemblyIds =
        await this.permissionService.getAccessibleAssemblyIds(userId)
      for (const id of assemblyIds) {
        await client.join(assemblyChannel(id))
      }
      this.logger.debug(
        `Client ${client.id} joined ${assemblyIds.length} assembly rooms`,
      )
    })
  }

  broadcast(eventName: string, message: unknown) {
    this.server.emit(eventName, message)
  }

  emitToAssembly(assemblyId: string, eventName: string, message: unknown) {
    this.server.to(assemblyChannel(assemblyId)).emit(eventName, message)
  }

  async updateClientRooms(userId: string) {
    await RequestContext.create(this.orm.em, async () => {
      const assemblyIds =
        await this.permissionService.getAccessibleAssemblyIds(userId)
      const channels = new Set(assemblyIds.map(assemblyChannel))
      const sockets = await this.server.fetchSockets()
      for (const socket of sockets) {
        if ((socket.data as { userId: string }).userId === userId) {
          for (const room of socket.rooms) {
            if (room.startsWith('assembly:') && !channels.has(room)) {
              socket.leave(room)
            }
          }
          for (const channel of channels) {
            socket.join(channel)
          }
        }
      }
    })
  }
}

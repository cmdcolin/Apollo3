import { type JWTPayload, assemblyChannel } from '@apollo-annotation/shared'
import { MikroORM, RequestContext } from '@mikro-orm/core'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import {
  type OnGatewayConnection,
  type OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import type { Server, Socket } from 'socket.io'

import {
  PermissionService,
  type UserInfo,
} from '../permissions/permission.service.js'
import { AUTH_COOKIE_NAME } from '../utils/strategies/jwt.strategy.js'

interface SocketData {
  user: UserInfo & { id: string }
}

function extractTokenFromCookie(cookieHeader: string) {
  const prefix = `${AUTH_COOKIE_NAME}=`
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length)
    }
  }
  return
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
        ;(socket.data as SocketData).user = {
          id: payload.id,
          role: payload.role,
        }
        next()
      } catch {
        next(new Error('Invalid token'))
      }
    })
  }

  async handleConnection(client: Socket) {
    const { user } = client.data as SocketData
    await RequestContext.create(this.orm.em, async () => {
      const assemblyIds =
        await this.permissionService.getAccessibleAssemblyIds(user)
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
      const sockets = await this.server.fetchSockets()
      for (const socket of sockets) {
        const { user } = socket.data as SocketData
        if (user.id !== userId) {
          continue
        }
        const assemblyIds =
          await this.permissionService.getAccessibleAssemblyIds(user)
        const channels = new Set(assemblyIds.map((id) => assemblyChannel(id)))
        for (const room of socket.rooms) {
          if (room.startsWith('assembly:') && !channels.has(room)) {
            socket.leave(room)
          }
        }
        for (const channel of channels) {
          socket.join(channel)
        }
      }
    })
  }
}

/* eslint-disable @typescript-eslint/require-await */
import { Injectable } from '@nestjs/common'
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import type { Server } from 'socket.io'

import type { CreateMessageDto } from './dto/create-message.dto.js'

@WebSocketGateway({
  cors: {
    origin: new URL(process.env.URL ?? 'http://localhost:3999').origin,
  },
})
@Injectable()
export class MessagesGateway {
  @WebSocketServer()
  server: Server

  @SubscribeMessage('createMessage')
  async create(eventName: string, createMessageDto: CreateMessageDto) {
    this.server.emit(eventName, createMessageDto)
  }
}

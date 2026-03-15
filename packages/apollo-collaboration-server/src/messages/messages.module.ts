import { Module } from '@nestjs/common'

import { MessagesGateway } from './messages.gateway.js'

@Module({
  providers: [MessagesGateway],
  exports: [MessagesGateway],
})
export class MessagesModule {}

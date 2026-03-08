/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { RefSeqChunk, RefSeqChunkSchema } from '@apollo-annotation/schemas'
import { Module } from '@nestjs/common'
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose'
import idValidator from 'mongoose-id-validator'

import { useMongoose } from '../utils/constants'

@Module({
  imports: [
    ...(useMongoose
      ? [
          MongooseModule.forFeatureAsync([
            {
              name: RefSeqChunk.name,
              useFactory: (connection) => {
                RefSeqChunkSchema.plugin(idValidator, { connection })
                return RefSeqChunkSchema
              },
              inject: [getConnectionToken()],
            },
          ]),
        ]
      : []),
  ],
  exports: [...(useMongoose ? [MongooseModule] : [])],
})
export class RefSeqChunksModule {}

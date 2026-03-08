/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { Counter, CounterDocument } from '@apollo-annotation/schemas'
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

import { DatabaseService } from '../mikro-orm/database.service'

@Injectable()
export class CountersService {
  constructor(
    @Optional()
    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
    private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(CountersService.name)

  async getNextSequenceValue(sequenceName: string): Promise<number> {
    if (this.db.useV2Backend) {
      return this.db.counter.getNextSequenceValue(sequenceName)
    }

    const sequenceDocument = await this.counterModel
      .findOneAndUpdate(
        { id: sequenceName },
        { $inc: { sequenceValue: 1 } },
        { new: true, upsert: true },
      )
      .exec()
    if (!sequenceDocument) {
      const errMsg = 'ERROR when getting next sequence value'
      this.logger.error(errMsg)
      throw new NotFoundException(errMsg)
    }
    return sequenceDocument.sequenceValue
  }
}

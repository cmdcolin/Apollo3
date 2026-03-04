/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { MikroOrmCounterRepository } from '@apollo-annotation/entities'
import { Counter, CounterDocument } from '@apollo-annotation/schemas'
import { EntityManager } from '@mikro-orm/core'
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

@Injectable()
export class CountersService {
  constructor(
    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
    @Optional() @Inject(EntityManager) private readonly em?: EntityManager,
  ) {}

  private readonly logger = new Logger(CountersService.name)

  private get useV2Backend() {
    const dbBackend = process.env.DB_BACKEND
    return dbBackend && dbBackend !== 'mongodb' && this.em !== undefined
  }

  async getNextSequenceValue(sequenceName: string): Promise<number> {
    if (this.useV2Backend) {
      if (!this.em) {
        throw new Error('EntityManager not available')
      }
      const repo = new MikroOrmCounterRepository(this.em.fork())
      return repo.getNextSequenceValue(sequenceName)
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

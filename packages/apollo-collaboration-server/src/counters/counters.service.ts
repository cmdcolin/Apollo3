import { Injectable, Logger, NotFoundException } from '@nestjs/common'

import { DatabaseService } from '../mikro-orm/database.service'

@Injectable()
export class CountersService {
  constructor(private readonly db: DatabaseService) {}

  private readonly logger = new Logger(CountersService.name)

  async getNextSequenceValue(sequenceName: string) {
    return this.db.counter.getNextSequenceValue(sequenceName)
  }
}

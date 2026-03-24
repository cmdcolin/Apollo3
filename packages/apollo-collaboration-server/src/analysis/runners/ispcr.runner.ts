import { Inject, Injectable, Logger } from '@nestjs/common'

import { DatabaseService } from '../../mikro-orm/database.service.js'
import { buildTwoBitDb } from '../build-twobit-db.js'
import { parseIsPcrFasta } from '../parsers/ispcr.js'
import { runCommand } from '../run-command.js'
import type { AnalysisRunner, BuildDbContext, RunContext } from '../runner.js'

@Injectable()
export class IsPcrRunner implements AnalysisRunner {
  readonly tool = 'ispcr'

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private readonly logger = new Logger(IsPcrRunner.name)

  async isInstalled() {
    try {
      await runCommand('isPcr', [])
      return true
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      // isPcr with no args prints usage and exits non-zero
      if (msg.includes('isPcr') || msg.includes('usage')) {
        return true
      }
      return false
    }
  }

  async run(context: RunContext) {
    const forwardPrimer = String(context.job.params.forwardPrimer ?? '')
    const reversePrimer = String(context.job.params.reversePrimer ?? '')
    const maxSize = Number(context.job.params.maxSize ?? 4000)
    const databaseId = String(context.job.params.databaseId ?? '')

    const analysisDb = await context.db.analysisDb.findById(databaseId)
    if (!analysisDb?.dbPath) {
      throw new Error(
        `Analysis database "${databaseId}" not found or not built`,
      )
    }

    this.logger.log(
      `isPCR: fwd=${forwardPrimer} rev=${reversePrimer} maxSize=${maxSize} db=${analysisDb.dbPath}`,
    )

    const { stdout } = await runCommand(
      'isPcr',
      [
        analysisDb.dbPath,
        forwardPrimer,
        reversePrimer,
        'stdout',
        `-maxSize=${maxSize}`,
        '-out=fa',
      ],
      context.signal,
    )

    return { products: parseIsPcrFasta(stdout) }
  }

  buildDb(context: BuildDbContext) {
    return buildTwoBitDb(context, this.logger)
  }
}

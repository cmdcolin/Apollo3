import { MikroORM, RequestContext } from '@mikro-orm/core'
import { Inject, Injectable, Logger } from '@nestjs/common'

import type { AnalysisRunner, RunContext } from '../runner.js'

const NCBI_FETCH_TIMEOUT = 60_000

@Injectable()
export class NcbiBlastRunner implements AnalysisRunner {
  readonly tool = 'ncbi-blast'

  constructor(@Inject(MikroORM) private readonly orm: MikroORM) {}

  private readonly logger = new Logger(NcbiBlastRunner.name)

  async isInstalled() {
    return true
  }

  async run(context: RunContext) {
    const program = String(context.job.params.program ?? '')
    const query = String(context.job.params.query ?? '')
    const database = String(context.job.params.database ?? '')

    const ncbiRid = await this.submitToNcbi(
      program,
      database,
      query,
      context.signal,
    )
    await context.updateMetadata({ ncbiRid })
    this.logger.log(`NCBI RID=${ncbiRid} for job ${context.job._id}`)

    return this.pollNcbiResults(context.job._id, ncbiRid, context)
  }

  private async submitToNcbi(
    program: string,
    database: string,
    query: string,
    signal: AbortSignal,
  ) {
    const formData = new URLSearchParams({
      CMD: 'Put',
      PROGRAM: program,
      DATABASE: database,
      QUERY: query,
    })

    const response = await fetch(
      'https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(NCBI_FETCH_TIMEOUT),
        ]),
      },
    )

    const text = await response.text()
    const ridMatch = /RID = (\S+)/.exec(text)
    if (!ridMatch) {
      throw new Error(`NCBI did not return an RID: ${text.slice(0, 500)}`)
    }
    return ridMatch[1]
  }

  private async pollNcbiResults(
    jobId: string,
    ncbiRid: string,
    context: RunContext,
  ) {
    const waitMs = 10_000
    for (let attempt = 0; attempt < 120; attempt++) {
      await this.delay(waitMs, context.signal)

      const cancelled = await RequestContext.create(this.orm.em, async () => {
        const current = await context.db.analysisJob.findById(jobId)
        return current?.status === 'cancelled'
      })
      if (cancelled) {
        throw new Error('Job was cancelled')
      }

      const statusResponse = await fetch(
        `https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi?CMD=Get&FORMAT_OBJECT=SearchInfo&RID=${encodeURIComponent(ncbiRid)}`,
        {
          signal: AbortSignal.any([
            context.signal,
            AbortSignal.timeout(NCBI_FETCH_TIMEOUT),
          ]),
        },
      )
      const statusText = await statusResponse.text()
      const statusMatch = /Status=(\S+)/.exec(statusText)
      const status = statusMatch?.[1] ?? 'UNKNOWN'

      if (status === 'READY') {
        const resultsResponse = await fetch(
          `https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi?CMD=Get&FORMAT_TYPE=JSON2_S&RID=${encodeURIComponent(ncbiRid)}`,
          {
            signal: AbortSignal.any([
              context.signal,
              AbortSignal.timeout(NCBI_FETCH_TIMEOUT),
            ]),
          },
        )
        if (!resultsResponse.ok) {
          throw new Error(`Failed to fetch results: ${resultsResponse.status}`)
        }
        return resultsResponse.json()
      }
      if (status === 'FAILED') {
        throw new Error('NCBI BLAST search failed')
      }
    }
    throw new Error('NCBI polling exceeded maximum attempts')
  }

  private delay(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const abortError = new Error('Aborted')
      if (signal.aborted) {
        reject(abortError)
        return
      }
      const timer = setTimeout(resolve, ms)
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(abortError)
        },
        { once: true },
      )
    })
  }
}

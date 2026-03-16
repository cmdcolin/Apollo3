import { randomBytes } from 'node:crypto'

import { Inject, Injectable, Logger } from '@nestjs/common'

import { DatabaseService } from '../mikro-orm/database.service.js'

@Injectable()
export class BlastService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(BlastService.name)

  async getBlastDbs(assemblyId?: string) {
    if (assemblyId) {
      return this.db.blastDb.findByAssemblyId(assemblyId)
    }
    return this.db.blastDb.findAll()
  }

  async createBlastDb(params: {
    name: string
    program: string
    database: string
    assemblyIds: string[]
    createdBy?: string
  }) {
    const _id = randomBytes(16).toString('hex')
    return this.db.blastDb.create({
      _id,
      name: params.name,
      program: params.program,
      database: params.database,
      assemblyIds: params.assemblyIds,
      createdBy: params.createdBy,
    })
  }

  async deleteBlastDb(id: string) {
    return this.db.blastDb.deleteById(id)
  }

  async submitBlastSearch(params: {
    program: string
    database: string
    query: string
  }) {
    this.logger.log(
      `Submitting BLAST search: ${params.program} against ${params.database}`,
    )

    const formData = new URLSearchParams({
      CMD: 'Put',
      PROGRAM: params.program,
      DATABASE: params.database,
      QUERY: params.query,
    })

    const response = await fetch(
      'https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      },
    )

    const text = await response.text()

    const ridMatch = /RID = (\S+)/.exec(text)
    const rtoeMatch = /RTOE = (\d+)/.exec(text)

    if (!ridMatch) {
      this.logger.error(`BLAST submit failed, response: ${text.slice(0, 500)}`)
      throw new Error('Failed to submit BLAST search — no RID returned')
    }

    const rid = ridMatch[1]
    const rtoe = rtoeMatch ? Number(rtoeMatch[1]) : 30

    this.logger.log(`BLAST search submitted: RID=${rid}, RTOE=${rtoe}`)
    return { rid, rtoe }
  }

  async checkBlastStatus(rid: string) {
    const response = await fetch(
      `https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi?CMD=Get&FORMAT_OBJECT=SearchInfo&RID=${encodeURIComponent(rid)}`,
    )
    const text = await response.text()

    const statusMatch = /Status=(\S+)/.exec(text)
    const status = statusMatch?.[1] ?? 'UNKNOWN'

    return { rid, status }
  }

  async getBlastResults(rid: string) {
    const response = await fetch(
      `https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi?CMD=Get&FORMAT_TYPE=JSON2_S&RID=${encodeURIComponent(rid)}`,
    )

    if (!response.ok) {
      throw new Error(
        `Failed to fetch BLAST results: ${response.status} ${response.statusText}`,
      )
    }

    return response.json()
  }
}

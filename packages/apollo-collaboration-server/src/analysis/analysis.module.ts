import { Module } from '@nestjs/common'

import { SequenceModule } from '../sequence/sequence.module.js'

import { AnalysisWorkerService } from './analysis-worker.service.js'
import { AnalysisController } from './analysis.controller.js'
import { AnalysisService } from './analysis.service.js'
import { BlatRunner } from './runners/blat.runner.js'
import { IsPcrRunner } from './runners/ispcr.runner.js'
import { LocalBlastRunner } from './runners/local-blast.runner.js'
import { MiniprotRunner } from './runners/miniprot.runner.js'
import { TiberiusRunner } from './runners/tiberius.runner.js'

@Module({
  imports: [SequenceModule],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    AnalysisWorkerService,
    LocalBlastRunner,
    IsPcrRunner,
    BlatRunner,
    MiniprotRunner,
    TiberiusRunner,
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}

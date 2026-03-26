import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  type FeatureSnapshot,
  gff3LineToSnapshot,
} from '@apollo-annotation/shared'
import { parseStringSync } from '@gmod/gff'
import { Flags } from '@oclif/core'
import { Agent, fetch } from 'undici'

import { BaseCommand } from '../../baseCommand.js'
import { createFetchErrorMessage } from '../../utils.js'

export default class AddFromGff extends BaseCommand<typeof AddFromGff> {
  static summary = 'Add an assembly and its features from a GFF3 file'
  static description = `Creates an assembly from a GFF3 file. Sequences are sourced from a
companion FASTA file (derived from the GFF3 path by replacing ".gff3" with
".fa", or supplied via --fasta). Features in the GFF3 are loaded into the
assembly via the changes API.

Use --features-only to load features without sequence data. In this mode,
refSeqs are derived from the GFF3 seq_ids and coordinates.`

  static examples = [
    {
      description:
        'Add assembly from GFF3; FASTA path derived automatically (volvox.gff3 → volvox.fa):',
      command:
        '<%= config.bin %> <%= command.id %> -a volvox -g volvox.fasta.gff3',
    },
    {
      description: 'Add assembly from GFF3 with explicit FASTA path:',
      command:
        '<%= config.bin %> <%= command.id %> -a volvox -g genes.gff3 -f genome.fa -i genome.fa.fai',
    },
    {
      description: 'Add assembly from GFF3 without sequence data:',
      command:
        '<%= config.bin %> <%= command.id %> -a volvox -g annotations.gff3 --features-only',
    },
  ]

  static flags = {
    assembly: Flags.string({
      char: 'a',
      description: 'Assembly name',
      required: true,
    }),
    gff3: Flags.string({
      char: 'g',
      description: 'GFF3 file path',
      required: true,
    }),
    fasta: Flags.string({
      char: 'f',
      description:
        'FASTA file path (defaults to --gff3 path with ".gff3" replaced by ".fa")',
    }),
    fai: Flags.string({
      char: 'i',
      description: 'FAI index path (defaults to --fasta path + ".fai")',
    }),
    public: Flags.boolean({
      char: 'p',
      description: 'Make the assembly publicly visible',
      default: false,
    }),
    'features-only': Flags.boolean({
      description:
        'Load features without sequence data (refSeqs derived from GFF3)',
      default: false,
    }),
  }

  public async run() {
    const { flags } = await this.parse(AddFromGff)
    const access = await this.getAccess()

    const gff3Text = fs.readFileSync(flags.gff3, 'utf8')
    const parsedFeatures = parseStringSync(gff3Text, { parseSequences: false })

    let sequenceSource: { type: string; fa: string; fai: string } | undefined
    if (flags['features-only']) {
      const seqLengths = new Map<string, number>()
      for (const featureGroup of parsedFeatures) {
        if (!Array.isArray(featureGroup) || featureGroup.length === 0) {
          continue
        }
        const [line] = featureGroup
        if (line.seq_id && line.end != null) {
          const cur = seqLengths.get(line.seq_id) ?? 0
          if (line.end > cur) {
            seqLengths.set(line.seq_id, line.end)
          }
        }
      }
      const faiLines: string[] = []
      for (const [name, length] of seqLengths) {
        faiLines.push(`${name}\t${length}\t0\t80\t81`)
      }
      const tempFai = path.join(
        tmpdir(),
        `apollo-gff3-${Date.now()}-${Math.random().toString(36).slice(2)}.fai`,
      )
      fs.writeFileSync(tempFai, `${faiLines.join('\n')}\n`)
      sequenceSource = { type: 'fasta', fa: '/dev/null', fai: tempFai }
    } else {
      const faPath = flags.fasta ?? flags.gff3.replace(/\.gff3$/, '.fa')
      const faiPath = flags.fai ?? `${faPath}.fai`
      sequenceSource = { type: 'fasta', fa: faPath, fai: faiPath }
    }

    const asmUrl = new URL(`${access.address}/assemblies`)
    const asmRes = await fetch(asmUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: flags.assembly,
        sequenceSource,
        ...(flags.public && { visibility: 'public' }),
      }),
      dispatcher: new Agent({ headersTimeout: 60 * 60 * 1000 }),
    })
    if (!asmRes.ok) {
      const errorMessage = await createFetchErrorMessage(
        asmRes,
        'assembly creation failed',
      )
      this.error(errorMessage)
    }
    const assembly = (await asmRes.json()) as { _id: string; name: string }
    this.logToStderr(`Assembly "${assembly.name}" created (${assembly._id})`)

    const refSeqsUrl = new URL(
      `${access.address}/refSeqs?assembly=${assembly._id}`,
    )
    const refSeqsRes = await fetch(refSeqsUrl, {
      headers: { Authorization: `Bearer ${access.accessToken}` },
      dispatcher: new Agent({ headersTimeout: 60 * 60 * 1000 }),
    })
    if (!refSeqsRes.ok) {
      const errorMessage = await createFetchErrorMessage(
        refSeqsRes,
        'refSeqs fetch failed',
      )
      this.error(errorMessage)
    }
    const refSeqs = (await refSeqsRes.json()) as { _id: string; name: string }[]
    const refSeqIdMap = new Map(refSeqs.map((rs) => [rs.name, rs._id]))

    const snapshots: FeatureSnapshot[] = []
    for (const featureGroup of parsedFeatures) {
      if (!Array.isArray(featureGroup) || featureGroup.length === 0) {
        continue
      }
      const [line] = featureGroup
      if (!line.seq_id || !line.type) {
        continue
      }
      const refSeqId = refSeqIdMap.get(line.seq_id)
      if (!refSeqId) {
        continue
      }
      snapshots.push(gff3LineToSnapshot(line, refSeqId))
    }

    if (snapshots.length === 0) {
      this.logToStderr('No features found in GFF3 file')
      this.log(JSON.stringify(assembly, null, 2))
      return
    }

    // Load all features in a single request
    const changesUrl = new URL(`${access.address}/changes`)
    const changesRes = await fetch(changesUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        typeName: 'AddFeatureChange',
        assembly: assembly._id,
        changedIds: snapshots.map((s) => s._id),
        changes: snapshots.map((s) => ({ addedFeature: s })),
      }),
      dispatcher: new Agent({ headersTimeout: 60 * 60 * 1000 }),
    })
    if (!changesRes.ok) {
      const errorMessage = await createFetchErrorMessage(
        changesRes,
        'feature loading failed',
      )
      this.error(errorMessage)
    }

    this.logToStderr(`${snapshots.length} top-level features loaded`)
    this.log(JSON.stringify(assembly, null, 2))
  }
}

//import { randomBytes } from 'node:crypto'

import type { GFF3FeatureLineWithRefs } from '@gmod/gff'

export interface FeatureSnapshot {
  _id: string
  refSeq: string
  type: string
  min: number
  max: number
  strand?: 1 | -1
  attributes?: Record<string, string[]>
  children?: Record<string, FeatureSnapshot>
}

export function gff3LineToSnapshot(
  line: GFF3FeatureLineWithRefs,
  refSeqId: string,
): FeatureSnapshot {
  const _id = `${Math.random}` //randomBytes(12).toString('hex')
  const strand = line.strand === '+' ? 1 : line.strand === '-' ? -1 : undefined
  const attributes: Record<string, string[]> = {}
  if (line.attributes) {
    for (const [key, vals] of Object.entries(line.attributes)) {
      if (vals && vals.length > 0) {
        attributes[key] = vals as string[]
      }
    }
  }
  const children: Record<string, FeatureSnapshot> = {}
  for (const childGroup of line.child_features) {
    for (const childLine of childGroup) {
      const child = gff3LineToSnapshot(childLine, refSeqId)
      children[child._id] = child
    }
  }
  const snapshot: FeatureSnapshot = {
    _id,
    refSeq: refSeqId,
    type: line.type ?? 'feature',
    min: (line.start ?? 1) - 1,
    max: line.end ?? 0,
  }
  if (strand !== undefined) {
    snapshot.strand = strand as 1 | -1
  }
  if (Object.keys(attributes).length > 0) {
    snapshot.attributes = attributes
  }
  if (Object.keys(children).length > 0) {
    snapshot.children = children
  }
  return snapshot
}

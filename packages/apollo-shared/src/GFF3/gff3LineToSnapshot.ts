import type { GFF3FeatureLineWithRefs } from '@gmod/gff'
import ObjectID from 'bson-objectid'

import {
  gffColumnToInternal,
  gffToInternal,
  isGFFColumn,
  isGFFReservedAttribute,
} from './gffReservedKeys.js'

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
  const _id = new ObjectID().toHexString()
  const strand = line.strand === '+' ? 1 : (line.strand === '-' ? -1 : undefined)
  const attributes: Record<string, string[]> = {}
  if (line.score != null) {
    attributes[gffColumnToInternal.score] = [String(line.score)]
  }
  if (line.source != null) {
    attributes[gffColumnToInternal.source] = [line.source]
  }
  if (line.attributes) {
    for (const [key, vals] of Object.entries(line.attributes)) {
      if (key === 'Parent' || vals.length === 0) {
        continue
      }
      const internalKey = isGFFReservedAttribute(key) ? gffToInternal[key] : key
      attributes[internalKey] = vals
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
    snapshot.strand = strand
  }
  if (Object.keys(attributes).length > 0) {
    snapshot.attributes = attributes
  }
  if (Object.keys(children).length > 0) {
    snapshot.children = children
  }
  return snapshot
}

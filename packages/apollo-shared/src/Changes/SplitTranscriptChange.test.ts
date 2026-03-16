import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { AnnotationFeatureSnapshot } from '@apollo-annotation/mst'

import { SplitTranscriptChange } from './SplitTranscriptChange.js'
import { UndoSplitTranscriptChange } from './UndoSplitTranscriptChange.js'

function makeChange(
  overrides: Partial<AnnotationFeatureSnapshot> = {},
): SplitTranscriptChange {
  const transcript: AnnotationFeatureSnapshot = {
    _id: 'tx-1',
    refSeq: 'rs-1',
    type: 'mRNA',
    min: 10,
    max: 100,
    ...overrides,
  }
  return new SplitTranscriptChange({
    typeName: 'SplitTranscriptChange',
    changedIds: ['tx-1'],
    assembly: 'asm-1',
    transcriptToSplit: transcript,
    parentFeatureId: 'gene-1',
    splitPoint: 50,
    leftTranscriptId: 'tx-left',
    rightTranscriptId: 'tx-right',
  })
}

describe('SplitTranscriptChange.makeSplitTranscripts', () => {
  it('splits a transcript with children on each side of the split point', () => {
    const change = makeChange()
    const transcript: AnnotationFeatureSnapshot = {
      _id: 'tx-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 10,
      max: 100,
      children: {
        'exon-1': {
          _id: 'exon-1',
          refSeq: 'rs-1',
          type: 'exon',
          min: 10,
          max: 40,
        },
        'exon-2': {
          _id: 'exon-2',
          refSeq: 'rs-1',
          type: 'exon',
          min: 60,
          max: 100,
        },
      },
    }

    const [left, right] = change.makeSplitTranscripts(
      transcript,
      50,
      'tx-left',
      'tx-right',
    )

    assert.equal(left._id, 'tx-left')
    assert.equal(right._id, 'tx-right')

    // Left transcript bounds come from left children
    assert.equal(left.min, 10)
    assert.equal(left.max, 40)
    assert.equal(right.min, 60)
    assert.equal(right.max, 100)

    // exon-1 midpoint 25 <= 50 → goes left; exon-2 midpoint 80 > 50 → goes right
    assert.ok(left.children?.['exon-1'])
    assert.ok(!left.children?.['exon-2'])
    assert.ok(right.children?.['exon-2'])
    assert.ok(!right.children?.['exon-1'])
  })

  it('uses splitPoint as fallback bounds when one side has no children', () => {
    const change = makeChange()
    const transcript: AnnotationFeatureSnapshot = {
      _id: 'tx-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 10,
      max: 100,
      // All children to the left — right side gets no children
      children: {
        'exon-1': {
          _id: 'exon-1',
          refSeq: 'rs-1',
          type: 'exon',
          min: 10,
          max: 40,
        },
      },
    }

    const [left, right] = change.makeSplitTranscripts(
      transcript,
      50,
      'tx-left',
      'tx-right',
    )

    assert.equal(left.min, 10)
    assert.equal(left.max, 40)
    // Right has no children, falls back to [splitPoint, transcript.max]
    assert.equal(right.min, 50)
    assert.equal(right.max, 100)
    assert.equal(right.children, undefined)
  })

  it('handles a transcript with no children', () => {
    const change = makeChange()
    const transcript: AnnotationFeatureSnapshot = {
      _id: 'tx-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 10,
      max: 100,
    }

    const [left, right] = change.makeSplitTranscripts(
      transcript,
      50,
      'tx-left',
      'tx-right',
    )

    assert.equal(left.min, 10)
    assert.equal(left.max, 50)
    assert.equal(right.min, 50)
    assert.equal(right.max, 100)
    assert.equal(left.children, undefined)
    assert.equal(right.children, undefined)
  })

  it('assigns new IDs to the split transcripts', () => {
    const change = makeChange()
    const transcript: AnnotationFeatureSnapshot = {
      _id: 'tx-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 10,
      max: 100,
    }

    const [left, right] = change.makeSplitTranscripts(
      transcript,
      50,
      'tx-left',
      'tx-right',
    )

    assert.equal(left._id, 'tx-left')
    assert.equal(right._id, 'tx-right')
  })

  it('removes gff_id and gff_name from split transcripts', () => {
    const change = makeChange()
    const transcript: AnnotationFeatureSnapshot = {
      _id: 'tx-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 10,
      max: 100,
      attributes: {
        gff_id: ['tx-1'],
        gff_name: ['myTranscript'],
        note: ['some note'],
      },
    }

    const [left, right] = change.makeSplitTranscripts(
      transcript,
      50,
      'tx-left',
      'tx-right',
    )

    assert.equal(left.attributes?.gff_id, undefined)
    assert.equal(left.attributes?.gff_name, undefined)
    assert.deepEqual(left.attributes?.note, ['some note'])

    assert.equal(right.attributes?.gff_id, undefined)
    assert.equal(right.attributes?.gff_name, undefined)
    assert.deepEqual(right.attributes?.note, ['some note'])
  })

  it('preserves other feature fields (type, strand, etc.) in split transcripts', () => {
    const change = makeChange()
    const transcript: AnnotationFeatureSnapshot = {
      _id: 'tx-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 10,
      max: 100,
      strand: 1,
    }

    const [left, right] = change.makeSplitTranscripts(
      transcript,
      50,
      'tx-left',
      'tx-right',
    )

    assert.equal(left.type, 'mRNA')
    assert.equal(left.strand, 1)
    assert.equal(right.type, 'mRNA')
    assert.equal(right.strand, 1)
  })

  it('partitions children by midpoint, not by boundary', () => {
    // A child whose midpoint is exactly at the split point goes left (<=)
    const change = makeChange()
    const transcript: AnnotationFeatureSnapshot = {
      _id: 'tx-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 0,
      max: 200,
      children: {
        'exon-at': {
          _id: 'exon-at',
          refSeq: 'rs-1',
          type: 'exon',
          min: 40,
          max: 60,
        }, // midpoint=50 (at split)
        'exon-right': {
          _id: 'exon-right',
          refSeq: 'rs-1',
          type: 'exon',
          min: 80,
          max: 120,
        }, // midpoint=100 (right)
      },
    }

    const [left, right] = change.makeSplitTranscripts(
      transcript,
      50,
      'tx-left',
      'tx-right',
    )

    // midpoint 50 <= 50 → goes left
    assert.ok(left.children?.['exon-at'])
    assert.ok(right.children?.['exon-right'])
    assert.ok(!left.children?.['exon-right'])
    assert.ok(!right.children?.['exon-at'])
  })
})

describe('SplitTranscriptChange.toJSON', () => {
  it('serializes single change without wrapping array', () => {
    const transcript: AnnotationFeatureSnapshot = {
      _id: 'tx-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 10,
      max: 100,
    }
    const change = new SplitTranscriptChange({
      typeName: 'SplitTranscriptChange',
      changedIds: ['tx-1'],
      assembly: 'asm-1',
      transcriptToSplit: transcript,
      parentFeatureId: 'gene-1',
      splitPoint: 50,
      leftTranscriptId: 'tx-left',
      rightTranscriptId: 'tx-right',
    })

    const json = change.toJSON()
    assert.equal(json.typeName, 'SplitTranscriptChange')
    assert.ok(!('changes' in json))
    assert.ok('transcriptToSplit' in json)
  })
})

describe('SplitTranscriptChange.getInverse', () => {
  it('returns an UndoSplitTranscriptChange with reversed ids and restore info', () => {
    const transcript: AnnotationFeatureSnapshot = {
      _id: 'tx-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 10,
      max: 100,
    }
    const change = new SplitTranscriptChange({
      typeName: 'SplitTranscriptChange',
      changedIds: ['tx-1'],
      assembly: 'asm-1',
      transcriptToSplit: transcript,
      parentFeatureId: 'gene-1',
      splitPoint: 50,
      leftTranscriptId: 'tx-left',
      rightTranscriptId: 'tx-right',
    })

    const inverse = change.getInverse()
    assert.ok(inverse instanceof UndoSplitTranscriptChange)
    assert.equal(inverse.typeName, 'UndoSplitTranscriptChange')
    assert.equal(inverse.changes.length, 1)
    const [undoChange] = inverse.changes
    assert.equal(undoChange.parentFeatureId, 'gene-1')
    assert.deepEqual(undoChange.transcriptToRestore, transcript)
    assert.deepEqual(undoChange.idsToDelete, ['tx-left', 'tx-right'])
  })
})

describe('UndoSplitTranscriptChange.getInverse', () => {
  it('returns a SplitTranscriptChange that can redo the split', () => {
    const transcript: AnnotationFeatureSnapshot = {
      _id: 'tx-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 10,
      max: 100,
      children: {
        'exon-1': {
          _id: 'exon-1',
          refSeq: 'rs-1',
          type: 'exon',
          min: 10,
          max: 40,
        },
        'exon-2': {
          _id: 'exon-2',
          refSeq: 'rs-1',
          type: 'exon',
          min: 60,
          max: 100,
        },
      },
    }
    const undoChange = new UndoSplitTranscriptChange({
      typeName: 'UndoSplitTranscriptChange',
      changedIds: ['tx-1'],
      assembly: 'asm-1',
      transcriptToRestore: transcript,
      parentFeatureId: 'gene-1',
      idsToDelete: ['tx-left', 'tx-right'],
    })

    const redo = undoChange.getInverse()
    assert.ok(redo instanceof SplitTranscriptChange)
    assert.equal(redo.typeName, 'SplitTranscriptChange')
    assert.equal(redo.changes.length, 1)
    const [redoChange] = redo.changes
    assert.equal(redoChange.parentFeatureId, 'gene-1')
    assert.equal(redoChange.leftTranscriptId, 'tx-left')
    assert.equal(redoChange.rightTranscriptId, 'tx-right')
    // Split point should be the midpoint between the two sorted children
    // exon-1 (10-40, max=40), exon-2 (60-100, min=60): midpoint = (40+60)/2 = 50
    assert.equal(redoChange.splitPoint, 50)
  })

  it('throws when the transcript has no children', () => {
    const transcript: AnnotationFeatureSnapshot = {
      _id: 'tx-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 10,
      max: 100,
    }
    const undoChange = new UndoSplitTranscriptChange({
      typeName: 'UndoSplitTranscriptChange',
      changedIds: ['tx-1'],
      assembly: 'asm-1',
      transcriptToRestore: transcript,
      parentFeatureId: 'gene-1',
      idsToDelete: ['tx-left', 'tx-right'],
    })

    assert.throws(() => undoChange.getInverse(), /no children/)
  })
})

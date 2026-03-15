/* eslint-disable @typescript-eslint/no-floating-promises */
import { describe, it } from 'node:test'

import { assert } from 'chai'

import {
  buildExonMappings,
  findLongestOrf,
  splicedToGenomic,
} from './orf.js'

function assertOrf(
  sequence: string,
  expected: { splicedStart: number; splicedEnd: number; length: number },
) {
  const orf = findLongestOrf(sequence)
  if (!orf) {
    assert.fail('Expected an ORF but got undefined')
  }
  assert.strictEqual(orf.splicedStart, expected.splicedStart)
  assert.strictEqual(orf.splicedEnd, expected.splicedEnd)
  assert.strictEqual(orf.length, expected.length)
}

describe('findLongestOrf', () => {
  it('finds a simple ATG...TAA ORF', () => {
    assertOrf('ATGAAATAA', { splicedStart: 0, splicedEnd: 9, length: 9 })
  })

  it('finds ATG...TAG stop codon', () => {
    assertOrf('ATGAAATAG', { splicedStart: 0, splicedEnd: 9, length: 9 })
  })

  it('finds ATG...TGA stop codon', () => {
    assertOrf('ATGAAATGA', { splicedStart: 0, splicedEnd: 9, length: 9 })
  })

  it('returns undefined for no start codon', () => {
    assert.isUndefined(findLongestOrf('AAGAAATAA'))
  })

  it('returns undefined for empty sequence', () => {
    assert.isUndefined(findLongestOrf(''))
  })

  it('returns undefined for sequence shorter than a codon', () => {
    assert.isUndefined(findLongestOrf('AT'))
  })

  it('picks the longest ORF among multiple', () => {
    // Frame 0: ATG AAA TAA (9bp), then ATG AAA BBB CCC TAA (15bp)
    const seq = 'ATGAAATAAXXXATGAAABBBCCCTAA'
    assertOrf(seq, { splicedStart: 12, splicedEnd: 27, length: 15 })
  })

  it('finds ORF in frame +1', () => {
    assertOrf('XATGAAATAAX', { splicedStart: 1, splicedEnd: 10, length: 9 })
  })

  it('finds ORF in frame +2', () => {
    assertOrf('XXATGAAATAA', { splicedStart: 2, splicedEnd: 11, length: 9 })
  })

  it('handles ORF without stop codon (runs to end)', () => {
    assertOrf('ATGAAACCC', { splicedStart: 0, splicedEnd: 9, length: 9 })
  })

  it('handles lowercase input', () => {
    assertOrf('atgaaataa', { splicedStart: 0, splicedEnd: 9, length: 9 })
  })

  it('picks longest across frames', () => {
    // Frame 0: ATG TAA (6bp, short)
    // Frame 1: xATG AAA AAA TAAx (12bp, longer)
    assertOrf('ATGTAAXATGAAAAAATAAX', {
      splicedStart: 7,
      splicedEnd: 19,
      length: 12,
    })
  })

  it('handles multiple ORFs in same frame, picks longest', () => {
    // ATG AAA TAA ... ATG BBB CCC DDD TAA
    assertOrf('ATGAAATAA' + 'NNN' + 'ATGBBBCCCDDDTAA', {
      splicedStart: 12,
      splicedEnd: 27,
      length: 15,
    })
  })

  it('handles stop codon immediately after start (6bp ORF)', () => {
    assertOrf('ATGTAA', { splicedStart: 0, splicedEnd: 6, length: 6 })
  })
})

describe('buildExonMappings', () => {
  it('builds mappings for plus strand exons', () => {
    const exons = [
      { min: 100, max: 200 },
      { min: 300, max: 500 },
      { min: 600, max: 700 },
    ]
    const mappings = buildExonMappings(exons, 1)
    assert.strictEqual(mappings.length, 3)
    assert.strictEqual(mappings[0].genomicMin, 100)
    assert.strictEqual(mappings[0].genomicMax, 200)
    assert.strictEqual(mappings[0].splicedStart, 0)
    assert.strictEqual(mappings[0].splicedEnd, 100)
    assert.strictEqual(mappings[1].genomicMin, 300)
    assert.strictEqual(mappings[1].splicedStart, 100)
    assert.strictEqual(mappings[1].splicedEnd, 300)
    assert.strictEqual(mappings[2].genomicMin, 600)
    assert.strictEqual(mappings[2].splicedStart, 300)
    assert.strictEqual(mappings[2].splicedEnd, 400)
  })

  it('sorts exons by position for plus strand', () => {
    const exons = [
      { min: 600, max: 700 },
      { min: 100, max: 200 },
      { min: 300, max: 500 },
    ]
    const mappings = buildExonMappings(exons, 1)
    assert.strictEqual(mappings[0].genomicMin, 100)
    assert.strictEqual(mappings[1].genomicMin, 300)
    assert.strictEqual(mappings[2].genomicMin, 600)
  })

  it('sorts exons in reverse for minus strand', () => {
    const exons = [
      { min: 100, max: 200 },
      { min: 300, max: 500 },
      { min: 600, max: 700 },
    ]
    const mappings = buildExonMappings(exons, -1)
    assert.strictEqual(mappings[0].genomicMin, 600)
    assert.strictEqual(mappings[0].genomicMax, 700)
    assert.strictEqual(mappings[0].splicedStart, 0)
    assert.strictEqual(mappings[0].splicedEnd, 100)
    assert.strictEqual(mappings[1].genomicMin, 300)
    assert.strictEqual(mappings[1].splicedStart, 100)
    assert.strictEqual(mappings[2].genomicMin, 100)
    assert.strictEqual(mappings[2].splicedStart, 300)
  })

  it('handles single exon', () => {
    const mappings = buildExonMappings([{ min: 50, max: 150 }], 1)
    assert.strictEqual(mappings.length, 1)
    assert.strictEqual(mappings[0].splicedStart, 0)
    assert.strictEqual(mappings[0].splicedEnd, 100)
  })
})

describe('splicedToGenomic', () => {
  const plusExons = [
    { min: 100, max: 200 },
    { min: 300, max: 500 },
    { min: 600, max: 700 },
  ]

  it('maps position within first exon (plus strand)', () => {
    const mappings = buildExonMappings(plusExons, 1)
    assert.strictEqual(splicedToGenomic(0, mappings, 1), 100)
    assert.strictEqual(splicedToGenomic(50, mappings, 1), 150)
    assert.strictEqual(splicedToGenomic(99, mappings, 1), 199)
  })

  it('maps position within second exon (plus strand)', () => {
    const mappings = buildExonMappings(plusExons, 1)
    assert.strictEqual(splicedToGenomic(101, mappings, 1), 301)
    assert.strictEqual(splicedToGenomic(150, mappings, 1), 350)
  })

  it('maps position within third exon (plus strand)', () => {
    const mappings = buildExonMappings(plusExons, 1)
    assert.strictEqual(splicedToGenomic(301, mappings, 1), 601)
    assert.strictEqual(splicedToGenomic(350, mappings, 1), 650)
  })

  it('maps boundary position to end of preceding exon', () => {
    const mappings = buildExonMappings(plusExons, 1)
    assert.strictEqual(splicedToGenomic(100, mappings, 1), 200)
  })

  it('maps positions on minus strand', () => {
    const mappings = buildExonMappings(plusExons, -1)
    assert.strictEqual(splicedToGenomic(0, mappings, -1), 700)
    assert.strictEqual(splicedToGenomic(50, mappings, -1), 650)
    assert.strictEqual(splicedToGenomic(101, mappings, -1), 499)
    assert.strictEqual(splicedToGenomic(200, mappings, -1), 400)
    assert.strictEqual(splicedToGenomic(301, mappings, -1), 199)
  })

  it('throws for out-of-range position', () => {
    const mappings = buildExonMappings(plusExons, 1)
    assert.throws(() => splicedToGenomic(500, mappings, 1))
  })

  it('maps ORF boundaries correctly for plus strand gene', () => {
    const exons = [
      { min: 100, max: 200 },
      { min: 300, max: 400 },
    ]
    const mappings = buildExonMappings(exons, 1)
    const orfStart = splicedToGenomic(30, mappings, 1)
    const orfEnd = splicedToGenomic(180, mappings, 1)
    assert.strictEqual(Math.min(orfStart, orfEnd), 130)
    assert.strictEqual(Math.max(orfStart, orfEnd), 380)
  })

  it('maps ORF boundaries correctly for minus strand gene', () => {
    const exons = [
      { min: 100, max: 200 },
      { min: 300, max: 400 },
    ]
    const mappings = buildExonMappings(exons, -1)
    const orfStart = splicedToGenomic(30, mappings, -1)
    const orfEnd = splicedToGenomic(180, mappings, -1)
    assert.strictEqual(Math.min(orfStart, orfEnd), 120)
    assert.strictEqual(Math.max(orfStart, orfEnd), 370)
  })
})

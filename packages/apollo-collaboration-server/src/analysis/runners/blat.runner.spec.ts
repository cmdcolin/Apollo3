import { parsePsl } from '../parsers/psl.js'

describe('parsePsl', () => {
  it('returns empty array for empty string', () => {
    expect(parsePsl('')).toEqual([])
  })

  it('skips header lines starting with - or match', () => {
    const psl = `\
psLayout version 3

match\tmis-\trep.\tN's\tQ gap\tQ gap\tT gap\tT gap\tstrand\tQ name\tQ size\tQ start\tQ end\tT name\tT size\tT start\tT end\tblockCount\tblockSizes\tqStarts\ttStarts
\tmatch\tmatch\t\tcount\tbases\tcount\tbases
-----------
`
    expect(parsePsl(psl)).toEqual([])
  })

  it('parses a single valid PSL line', () => {
    const line =
      '50\t0\t0\t0\t0\t0\t0\t0\t+\tquery1\t50\t0\t50\tctgA\t50000\t1000\t1050\t1\t50,\t0,\t1000,'
    const hits = parsePsl(line)
    expect(hits).toHaveLength(1)
    const hit = hits[0]
    expect(hit.matches).toBe(50)
    expect(hit.misMatches).toBe(0)
    expect(hit.qName).toBe('query1')
    expect(hit.qSize).toBe(50)
    expect(hit.qStart).toBe(0)
    expect(hit.qEnd).toBe(50)
    expect(hit.tName).toBe('ctgA')
    expect(hit.tSize).toBe(50000)
    expect(hit.tStart).toBe(1000)
    expect(hit.tEnd).toBe(1050)
    expect(hit.strand).toBe('+')
    expect(hit.blockCount).toBe(1)
    expect(hit.blockSizes).toEqual([50])
    expect(hit.qStarts).toEqual([0])
    expect(hit.tStarts).toEqual([1000])
    expect(hit.identity).toBe(100)
    expect(hit.score).toBe(50)
  })

  it('computes identity correctly with mismatches', () => {
    // 40 matches, 10 mismatches → identity = 40/50 * 100 = 80
    const line =
      '40\t10\t0\t0\t0\t0\t0\t0\t+\tq\t50\t0\t50\tctgA\t50000\t1000\t1050\t1\t50,\t0,\t1000,'
    const hits = parsePsl(line)
    expect(hits[0].identity).toBeCloseTo(80)
    expect(hits[0].score).toBe(30)
  })

  it('sorts hits by score descending', () => {
    const lines = [
      '30\t0\t0\t0\t0\t0\t0\t0\t+\tq1\t50\t0\t30\tctgA\t50000\t1000\t1030\t1\t30,\t0,\t1000,',
      '50\t0\t0\t0\t0\t0\t0\t0\t+\tq2\t50\t0\t50\tctgA\t50000\t2000\t2050\t1\t50,\t0,\t2000,',
      '40\t0\t0\t0\t0\t0\t0\t0\t+\tq3\t50\t0\t40\tctgA\t50000\t3000\t3040\t1\t40,\t0,\t3000,',
    ].join('\n')
    const hits = parsePsl(lines)
    expect(hits).toHaveLength(3)
    expect(hits[0].score).toBe(50)
    expect(hits[1].score).toBe(40)
    expect(hits[2].score).toBe(30)
  })

  it('skips lines with fewer than 21 fields', () => {
    const short = '50\t0\t0\t0\t0\t0\t0\t0\t+'
    expect(parsePsl(short)).toEqual([])
  })

  it('handles minus strand alignments', () => {
    const line =
      '50\t0\t0\t0\t0\t0\t0\t0\t-\tq\t50\t0\t50\tctgA\t50000\t1000\t1050\t1\t50,\t0,\t1000,'
    const hits = parsePsl(line)
    expect(hits[0].strand).toBe('-')
  })

  it('parses multiple block alignments', () => {
    const line =
      '90\t0\t0\t0\t0\t0\t1\t10\t+\tq\t100\t0\t100\tctgA\t50000\t1000\t1100\t2\t50,40,\t0,60,\t1000,1060,'
    const hits = parsePsl(line)
    expect(hits[0].blockCount).toBe(2)
    expect(hits[0].blockSizes).toEqual([50, 40])
    expect(hits[0].qStarts).toEqual([0, 60])
    expect(hits[0].tStarts).toEqual([1000, 1060])
  })
})

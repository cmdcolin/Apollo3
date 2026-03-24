import { parseIsPcrFasta } from '../parsers/ispcr.js'

describe('parseIsPcrFasta', () => {
  it('returns empty array for empty string', () => {
    expect(parseIsPcrFasta('')).toEqual([])
  })

  it('parses a single forward-strand product', () => {
    const output = '>ctgA:1000+2000 1001\nATCGATCGATCG\n'
    const products = parseIsPcrFasta(output)
    expect(products).toHaveLength(1)
    expect(products[0].seqName).toBe('ctgA')
    expect(products[0].start).toBe(1000)
    expect(products[0].end).toBe(2000)
    expect(products[0].strand).toBe('+')
    expect(products[0].size).toBe(1001)
    expect(products[0].sequence).toBe('ATCGATCGATCG')
  })

  it('parses a reverse-strand product', () => {
    const output = '>ctgA:5000-4000 1001\nGCTAGCTA\n'
    const products = parseIsPcrFasta(output)
    expect(products).toHaveLength(1)
    expect(products[0].seqName).toBe('ctgA')
    expect(products[0].start).toBe(5000)
    expect(products[0].end).toBe(4000)
    expect(products[0].strand).toBe('-')
    expect(products[0].size).toBe(1001)
  })

  it('parses multiple products', () => {
    const output = [
      '>ctgA:100+200 101',
      'ATCG',
      '>ctgB:300+400 101',
      'GCTA',
    ].join('\n') + '\n'
    const products = parseIsPcrFasta(output)
    expect(products).toHaveLength(2)
    expect(products[0].seqName).toBe('ctgA')
    expect(products[1].seqName).toBe('ctgB')
  })

  it('handles multi-line sequences', () => {
    const output = '>ctgA:1+100 100\nATCG\nGCTA\nTTTT\n'
    const products = parseIsPcrFasta(output)
    expect(products[0].sequence).toBe('ATCGGCTATTTT')
  })

  it('ignores headers with unexpected format', () => {
    const output = '>badheader\nATCG\n'
    const products = parseIsPcrFasta(output)
    expect(products).toHaveLength(0)
  })
})

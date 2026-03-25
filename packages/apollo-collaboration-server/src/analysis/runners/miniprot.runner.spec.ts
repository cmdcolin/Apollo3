import { groupIntoGeneModels, parseGff3 } from '../parsers/gff3.js'

describe('parseGff3', () => {
  it('returns empty array for empty string', () => {
    expect(parseGff3('')).toEqual([])
  })

  it('skips comment and blank lines', () => {
    const gff3 = '# comment\n\n##gff-version 3\n'
    expect(parseGff3(gff3)).toEqual([])
  })

  it('skips lines with fewer than 9 fields', () => {
    expect(parseGff3('ctgA\tminiprot\tmRNA\t1000\t2000')).toEqual([])
  })

  it('parses a single feature', () => {
    const line =
      'ctgA\tminiprot\tmRNA\t1000\t2000\t.\t+\t.\tID=MP000001;Identity=0.95;Target=prot1 1 100'
    const alignments = parseGff3(line)
    expect(alignments).toHaveLength(1)
    expect(alignments[0].seqName).toBe('ctgA')
    expect(alignments[0].source).toBe('miniprot')
    expect(alignments[0].type).toBe('mRNA')
    expect(alignments[0].start).toBe(1000)
    expect(alignments[0].end).toBe(2000)
    expect(alignments[0].strand).toBe('+')
    expect(alignments[0].attributes['ID']).toBe('MP000001')
    expect(alignments[0].attributes['Identity']).toBe('0.95')
    expect(alignments[0].attributes['Target']).toBe('prot1 1 100')
  })

  it('parses multiple features', () => {
    const gff3 = [
      'ctgA\tminiprot\tmRNA\t1000\t2000\t.\t+\t.\tID=MP1;Identity=0.9',
      'ctgA\tminiprot\tCDS\t1000\t1200\t.\t+\t0\tParent=MP1',
      'ctgA\tminiprot\tCDS\t1500\t2000\t.\t+\t0\tParent=MP1',
    ].join('\n')
    const alignments = parseGff3(gff3)
    expect(alignments).toHaveLength(3)
  })

  it('URL-decodes attribute values', () => {
    const line =
      'ctgA\tminiprot\tmRNA\t1\t100\t.\t+\t.\tID=MP1;Note=some%20name'
    const alignments = parseGff3(line)
    expect(alignments[0].attributes['Note']).toBe('some name')
  })
})

describe('groupIntoGeneModels', () => {
  it('returns empty array for no alignments', () => {
    expect(groupIntoGeneModels([])).toEqual([])
  })

  it('groups mRNA and CDS into a gene model', () => {
    const alignments = parseGff3(
      [
        'ctgA\tminiprot\tmRNA\t1000\t2000\t.\t+\t.\tID=MP1;Identity=0.95;Target=prot1 1 100',
        'ctgA\tminiprot\tCDS\t1000\t1200\t.\t+\t0\tParent=MP1',
        'ctgA\tminiprot\tCDS\t1500\t2000\t.\t+\t0\tParent=MP1',
      ].join('\n'),
    )
    const models = groupIntoGeneModels(alignments)
    expect(models).toHaveLength(1)
    expect(models[0].seqName).toBe('ctgA')
    expect(models[0].start).toBe(1000)
    expect(models[0].end).toBe(2000)
    expect(models[0].strand).toBe('+')
    expect(models[0].identity).toBe('0.95')
    expect(models[0].target).toBe('prot1 1 100')
    expect(models[0].exonCount).toBe(2)
  })

  it('handles multiple gene models', () => {
    const alignments = parseGff3(
      [
        'ctgA\tminiprot\tmRNA\t1000\t2000\t.\t+\t.\tID=MP1;Identity=0.9;Target=prot1 1 100',
        'ctgA\tminiprot\tCDS\t1000\t2000\t.\t+\t0\tParent=MP1',
        'ctgA\tminiprot\tmRNA\t5000\t6000\t.\t-\t.\tID=MP2;Identity=0.8;Target=prot2 1 80',
        'ctgA\tminiprot\tCDS\t5000\t6000\t.\t-\t0\tParent=MP2',
      ].join('\n'),
    )
    const models = groupIntoGeneModels(alignments)
    expect(models).toHaveLength(2)
  })

  it('drops groups with no mRNA and no CDS', () => {
    // A feature type that is neither mRNA nor CDS ends up in a group with
    // no usable coordinates — it should be filtered out rather than
    // producing Infinity/-Infinity start/end values.
    const alignments = parseGff3(
      'ctgA\tminiprot\tgene\t1000\t2000\t.\t+\t.\tID=G1',
    )
    const models = groupIntoGeneModels(alignments)
    expect(models).toHaveLength(0)
  })

  it('falls back to CDS coords when no mRNA feature', () => {
    const alignments = parseGff3(
      [
        'ctgA\tminiprot\tCDS\t1000\t1200\t.\t+\t0\tParent=MP1',
        'ctgA\tminiprot\tCDS\t1500\t2000\t.\t+\t0\tParent=MP1',
      ].join('\n'),
    )
    const models = groupIntoGeneModels(alignments)
    expect(models).toHaveLength(1)
    expect(models[0].start).toBe(1000)
    expect(models[0].end).toBe(2000)
    expect(models[0].exonCount).toBe(2)
  })
})

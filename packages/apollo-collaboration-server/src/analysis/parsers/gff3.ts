interface MiniprotAlignment {
  seqName: string
  source: string
  type: string
  start: number
  end: number
  score: string
  strand: string
  phase: string
  attributes: Record<string, string>
}

export function parseGff3(gff3Text: string) {
  const lines = gff3Text.split('\n')
  const alignments: MiniprotAlignment[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const fields = trimmed.split('\t')
    if (fields.length < 9) {
      continue
    }
    const attrs: Record<string, string> = {}
    for (const pair of fields[8].split(';')) {
      const eq = pair.indexOf('=')
      if (eq > 0) {
        attrs[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1))
      }
    }
    alignments.push({
      seqName: fields[0],
      source: fields[1],
      type: fields[2],
      start: Number(fields[3]),
      end: Number(fields[4]),
      score: fields[5],
      strand: fields[6],
      phase: fields[7],
      attributes: attrs,
    })
  }
  return alignments
}

export function groupIntoGeneModels(alignments: MiniprotAlignment[]) {
  const groups: Record<string, MiniprotAlignment[]> = {}
  for (const aln of alignments) {
    const parentId = aln.attributes.Parent ?? aln.attributes.ID ?? ''
    const key = aln.type === 'mRNA' ? (aln.attributes.ID ?? '') : parentId
    if (!key) {
      continue
    }
    groups[key] ??= []
    groups[key].push(aln)
  }
  return Object.values(groups)
    .map((features) => {
      const mrna = features.find((f) => f.type === 'mRNA')
      const cds = features.filter((f) => f.type === 'CDS')
      if (!mrna && cds.length === 0) {
        return null
      }
      return {
        seqName: mrna?.seqName ?? cds[0]?.seqName ?? '',
        start: mrna?.start ?? Math.min(...cds.map((c) => c.start)),
        end: mrna?.end ?? Math.max(...cds.map((c) => c.end)),
        strand: mrna?.strand ?? cds[0]?.strand ?? '.',
        identity: mrna?.attributes.Identity ?? '',
        target: mrna?.attributes.Target ?? '',
        exonCount: cds.length,
      }
    })
    .filter((m) => m !== null)
}

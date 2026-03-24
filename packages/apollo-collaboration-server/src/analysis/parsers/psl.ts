export interface PslHit {
  matches: number
  misMatches: number
  qName: string
  qSize: number
  qStart: number
  qEnd: number
  tName: string
  tSize: number
  tStart: number
  tEnd: number
  strand: string
  blockCount: number
  blockSizes: number[]
  qStarts: number[]
  tStarts: number[]
  identity: number
  score: number
}

export function parsePsl(pslText: string) {
  const lines = pslText.split('\n')
  const hits: PslHit[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('-') || trimmed.startsWith('match')) {
      continue
    }
    const fields = trimmed.split('\t')
    if (fields.length < 21) {
      continue
    }
    const matches = Number(fields[0])
    const misMatches = Number(fields[1])
    const alignLen = matches + misMatches
    hits.push({
      matches,
      misMatches,
      qName: fields[9],
      qSize: Number(fields[10]),
      qStart: Number(fields[11]),
      qEnd: Number(fields[12]),
      tName: fields[13],
      tSize: Number(fields[14]),
      tStart: Number(fields[15]),
      tEnd: Number(fields[16]),
      strand: fields[8],
      blockCount: Number(fields[17]),
      blockSizes: fields[18].split(',').filter(Boolean).map(Number),
      qStarts: fields[19].split(',').filter(Boolean).map(Number),
      tStarts: fields[20].split(',').filter(Boolean).map(Number),
      identity: alignLen > 0 ? (matches / alignLen) * 100 : 0,
      score: matches - misMatches,
    })
  }
  hits.sort((a, b) => b.score - a.score)
  return hits
}

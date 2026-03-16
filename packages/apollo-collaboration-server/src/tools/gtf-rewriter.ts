// Rewrites Tiberius GTF output to use absolute genomic coordinates.
// Tiberius outputs coordinates relative to the input FASTA sequence.
// This function converts them to absolute coordinates and replaces the
// sequence name with the actual refSeq name so JBrowse can display them.
export function rewriteGtfCoordinates(
  gtfText: string,
  refSeqName: string,
  regionStart: number,
) {
  const lines = gtfText.split('\n')
  const rewritten: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      rewritten.push(line)
      continue
    }

    const fields = trimmed.split('\t')
    if (fields.length < 9) {
      rewritten.push(line)
      continue
    }

    // Replace seqname with actual refSeq name
    fields[0] = refSeqName

    // Convert 1-based relative coordinates to 1-based absolute coordinates
    const relStart = Number(fields[3])
    const relEnd = Number(fields[4])
    fields[3] = String(relStart + regionStart)
    fields[4] = String(relEnd + regionStart)

    rewritten.push(fields.join('\t'))
  }

  return rewritten.join('\n')
}

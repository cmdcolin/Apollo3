export interface IsPcrProduct {
  seqName: string
  start: number
  end: number
  strand: string
  size: number
  sequence: string
}

export function parseIsPcrFasta(output: string): IsPcrProduct[] {
  const products: IsPcrProduct[] = []
  const lines = output.split('\n')
  let current: Partial<IsPcrProduct> | null = null
  const seqLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('>')) {
      if (current?.seqName !== undefined) {
        current.sequence = seqLines.join('')
        products.push(current as IsPcrProduct)
        seqLines.length = 0
      }
      current = null
      // Header format: >seqName:start+end size
      // strand is indicated by + (forward) or - (reverse) between start and end
      const m = /^>(\S+):(\d+)([+-])(\d+)\s+(\d+)/.exec(line)
      if (m) {
        current = {
          seqName: m[1],
          start: Number(m[2]),
          end: Number(m[4]),
          strand: m[3],
          size: Number(m[5]),
        }
      }
    } else if (current) {
      seqLines.push(line.trim())
    }
  }
  if (current?.seqName !== undefined) {
    current.sequence = seqLines.join('')
    products.push(current as IsPcrProduct)
  }
  return products
}

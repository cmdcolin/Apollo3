import { type IKeyValueMap } from 'mobx'

export function splitStringIntoChunks(
  input: string,
  chunkSize: number,
): string[] {
  const chunks: string[] = []
  for (let i = 0; i < input.length; i += chunkSize) {
    const chunk = input.slice(i, i + chunkSize)
    chunks.push(chunk)
  }
  return chunks
}

export function attributesToRecords(
  attributes: IKeyValueMap<readonly string[] | undefined> | undefined,
): Record<string, string[] | undefined> {
  const records: Record<string, string[] | undefined> = {}
  if (!attributes) {
    return records
  }
  for (const [key, value] of Object.entries(attributes)) {
    records[key] = value?.slice()
  }
  return records
}

export function stringifyAttributes(
  attributes: Record<string, string[] | undefined> | undefined,
): string {
  if (!attributes) {
    return ''
  }
  const str = []
  for (const [key, value] of Object.entries(attributes)) {
    let attributeName = key
    if (attributeName.startsWith('gff_')) {
      attributeName = attributeName.slice(4)
      attributeName =
        attributeName.charAt(0).toUpperCase() + attributeName.slice(1)
    }
    if (value) {
      str.push(`${attributeName}=${value.join(',')}`)
    } else {
      str.push(attributeName)
    }
  }
  return encodeURIComponent(str.join(';'))
}

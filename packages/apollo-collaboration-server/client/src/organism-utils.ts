export interface Organism {
  _id: string
  taxid?: number
  genus?: string
  species?: string
  commonName?: string
  description?: string
}

export function organismLabel(
  o: Pick<Organism, 'genus' | 'species' | 'commonName' | '_id'>,
) {
  const sci = `${o.genus ?? ''} ${o.species ?? ''}`.trim()
  if (sci && o.commonName) {
    return `${sci} (${o.commonName})`
  }
  return sci || (o.commonName ?? o._id)
}

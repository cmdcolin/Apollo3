import type { ParsedOntology } from './obo-graph-parser'

export interface OntologyNode {
  id: string
  lbl?: string
  type?: string
  meta?: {
    synonyms?: { val: string }[]
    definition?: { val: string }
    deprecated?: boolean
  }
}

export function isDeprecated(node: OntologyNode) {
  return node.meta?.deprecated === true
}

export class OntologyLookup {
  ontologyName: string
  private parsed: ParsedOntology

  constructor(name: string, parsed: ParsedOntology) {
    this.ontologyName = name
    this.parsed = parsed
  }

  isTypeOf(queryType: string, baseType: string) {
    if (queryType === baseType) {
      return true
    }
    return this.parsed.equivalentTypes.get(baseType)?.has(queryType) ?? false
  }

  getTermsWithLabelOrSynonym(
    label: string,
    options?: { includeSubclasses?: boolean },
  ) {
    const includeSubclasses = options?.includeSubclasses ?? true
    const ids = new Set<string>()
    for (const id of this.parsed.labelToIds.get(label) ?? []) {
      ids.add(id)
    }
    for (const id of this.parsed.synonymToIds.get(label) ?? []) {
      ids.add(id)
    }
    if (includeSubclasses) {
      const expanded = new Set<string>()
      for (const id of ids) {
        for (const desc of this.parsed.getDescendants(id)) {
          expanded.add(desc)
        }
      }
      for (const id of expanded) {
        ids.add(id)
      }
    }
    const results: OntologyNode[] = []
    for (const id of ids) {
      const node = this.parsed.nodeMap.get(id)
      if (node) {
        results.push(node)
      }
    }
    return results
  }

  getAllTerms() {
    return [...this.parsed.nodeMap.values()].filter((n) => !isDeprecated(n))
  }

  getAllClasses() {
    return [...this.parsed.nodeMap.values()].filter(
      (n) => n.type === 'CLASS' && !isDeprecated(n),
    )
  }

  getClassesThat(propertyLabel: string, targetTerms: OntologyNode[]) {
    const { edgesByObj, edgesByPred, nodeMap } = this.parsed

    const propertyIds = new Set<string>()
    for (const node of nodeMap.values()) {
      if (node.lbl === propertyLabel && node.type === 'PROPERTY') {
        propertyIds.add(node.id)
      }
    }
    const expandedPropIds = new Set(propertyIds)
    for (const propId of propertyIds) {
      const subProps = edgesByObj.get(propId) ?? []
      for (const edge of subProps) {
        if (edge.pred === 'subPropertyOf') {
          expandedPropIds.add(edge.sub)
        }
      }
    }

    const targetIds = new Set<string>()
    for (const t of targetTerms) {
      for (const anc of this.parsed.getAncestors(t.id)) {
        targetIds.add(anc)
      }
    }

    const subjectIds = new Set<string>()
    for (const targetId of targetIds) {
      for (const edge of edgesByObj.get(targetId) ?? []) {
        if (expandedPropIds.has(edge.pred)) {
          subjectIds.add(edge.sub)
        }
      }
    }
    for (const propId of expandedPropIds) {
      for (const edge of edgesByPred.get(propId) ?? []) {
        if (targetIds.has(edge.obj)) {
          subjectIds.add(edge.sub)
        }
      }
    }

    const expanded = new Set<string>()
    for (const id of subjectIds) {
      for (const desc of this.parsed.getDescendants(id)) {
        expanded.add(desc)
      }
    }

    const results: OntologyNode[] = []
    for (const id of expanded) {
      const node = nodeMap.get(id)
      if (node && node.type === 'CLASS' && !isDeprecated(node)) {
        results.push(node)
      }
    }
    return results
  }

  getTermsByFulltext(query: string, maxResults = 100) {
    if (!query) {
      return []
    }
    const lowerQuery = query.toLowerCase()
    const results: { term: OntologyNode; fieldName: string }[] = []
    for (const node of this.parsed.nodeMap.values()) {
      if (results.length >= maxResults) {
        break
      }
      if (isDeprecated(node)) {
        continue
      }
      if (node.lbl?.toLowerCase().includes(lowerQuery)) {
        results.push({ term: node, fieldName: 'Label' })
        continue
      }
      if (node.meta?.synonyms) {
        let found = false
        for (const syn of node.meta.synonyms) {
          if (syn.val?.toLowerCase().includes(lowerQuery)) {
            results.push({ term: node, fieldName: 'Synonym' })
            found = true
            break
          }
        }
        if (found) {
          continue
        }
      }
      if (node.meta?.definition?.val?.toLowerCase().includes(lowerQuery)) {
        results.push({ term: node, fieldName: 'Definition' })
      }
    }
    return results
  }

  getNodeById(id: string) {
    return this.parsed.nodeMap.get(id) ?? null
  }
}

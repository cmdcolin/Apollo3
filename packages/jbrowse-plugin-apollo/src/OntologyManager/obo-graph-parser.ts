import type { OntologyNode } from './OntologyLookup'

interface OboEdge {
  sub: string
  pred: string
  obj: string
}

export interface OboGraphDocument {
  graphs?: { nodes?: OntologyNode[]; edges?: OboEdge[] }[]
}

export interface ParsedOntology {
  nodeMap: Map<string, OntologyNode>
  labelToIds: Map<string, string[]>
  synonymToIds: Map<string, string[]>
  equivalentTypes: Map<string, Set<string>>
  edgesByObj: Map<string, OboEdge[]>
  edgesByPred: Map<string, OboEdge[]>
  getDescendants: (nodeId: string) => Set<string>
  getAncestors: (nodeId: string) => Set<string>
}

export function parseOntology(doc: OboGraphDocument): ParsedOntology {
  const graph = doc.graphs?.[0]
  const nodes = graph?.nodes ?? []
  const edges = graph?.edges ?? []

  const nodeMap = new Map<string, OntologyNode>()
  const labelToIds = new Map<string, string[]>()
  const synonymToIds = new Map<string, string[]>()
  const childrenMap = new Map<string, string[]>()
  const parentsMap = new Map<string, string[]>()
  const edgesByObj = new Map<string, OboEdge[]>()
  const edgesByPred = new Map<string, OboEdge[]>()

  for (const node of nodes) {
    if (!node.id || !node.type) {
      continue
    }
    nodeMap.set(node.id, node)
    if (node.lbl) {
      const existing = labelToIds.get(node.lbl) ?? []
      existing.push(node.id)
      labelToIds.set(node.lbl, existing)
    }
    if (node.meta?.synonyms) {
      for (const syn of node.meta.synonyms) {
        if (syn.val) {
          const existing = synonymToIds.get(syn.val) ?? []
          existing.push(node.id)
          synonymToIds.set(syn.val, existing)
        }
      }
    }
  }

  for (const edge of edges) {
    if (edge.pred === 'is_a') {
      const children = childrenMap.get(edge.obj) ?? []
      children.push(edge.sub)
      childrenMap.set(edge.obj, children)

      const parents = parentsMap.get(edge.sub) ?? []
      parents.push(edge.obj)
      parentsMap.set(edge.sub, parents)
    }
    const byObj = edgesByObj.get(edge.obj) ?? []
    byObj.push(edge)
    edgesByObj.set(edge.obj, byObj)

    const byPred = edgesByPred.get(edge.pred) ?? []
    byPred.push(edge)
    edgesByPred.set(edge.pred, byPred)
  }

  function getDescendants(nodeId: string) {
    const result = new Set<string>()
    const queue = [nodeId]
    while (queue.length > 0) {
      const current = queue.pop()!
      if (result.has(current)) {
        continue
      }
      result.add(current)
      const kids = childrenMap.get(current)
      if (kids) {
        for (const child of kids) {
          queue.push(child)
        }
      }
    }
    return result
  }

  function getAncestors(nodeId: string) {
    const result = new Set<string>()
    const queue = [nodeId]
    while (queue.length > 0) {
      const current = queue.pop()!
      if (result.has(current)) {
        continue
      }
      result.add(current)
      const pars = parentsMap.get(current)
      if (pars) {
        for (const parent of pars) {
          queue.push(parent)
        }
      }
    }
    return result
  }

  // Pre-compute equivalentTypes
  const idToLabel = new Map<string, string>()
  for (const node of nodeMap.values()) {
    if (node.lbl) {
      idToLabel.set(node.id, node.lbl)
    }
  }

  const equivalentTypes = new Map<string, Set<string>>()
  for (const [label, nodeIds] of labelToIds) {
    const allDescIds = new Set<string>()
    for (const nid of nodeIds) {
      for (const desc of getDescendants(nid)) {
        allDescIds.add(desc)
      }
    }
    const synIds = synonymToIds.get(label)
    if (synIds) {
      for (const nid of synIds) {
        for (const desc of getDescendants(nid)) {
          allDescIds.add(desc)
        }
      }
    }
    const labels = new Set<string>()
    for (const id of allDescIds) {
      const lbl = idToLabel.get(id)
      if (lbl) {
        labels.add(lbl)
      }
    }
    equivalentTypes.set(label, labels)
  }

  return {
    nodeMap,
    labelToIds,
    synonymToIds,
    equivalentTypes,
    edgesByObj,
    edgesByPred,
    getDescendants,
    getAncestors,
  }
}

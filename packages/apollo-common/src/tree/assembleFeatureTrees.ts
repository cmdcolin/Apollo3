import type { FeatureRow } from '../repositories/FeatureRepository.js'

export interface NestedFeature {
  _id: string
  refSeq: string
  type: string
  min: number
  max: number
  strand?: 1 | -1
  phase?: 0 | 1 | 2
  attributes?: Record<string, string[]>
  status?: number
  user?: string
  children?: Record<string, NestedFeature>
}

export function assembleFeatureTrees(flatFeatures: FeatureRow[]) {
  const byId = new Map<string, FeatureRow & { childList: FeatureRow[] }>()
  for (const f of flatFeatures) {
    byId.set(f._id, { ...f, childList: [] })
  }

  const roots: string[] = []
  for (const f of flatFeatures) {
    if (f.parentId) {
      const parent = byId.get(f.parentId)
      if (parent) {
        parent.childList.push(f)
      }
    } else {
      roots.push(f._id)
    }
  }

  function toNested(id: string): NestedFeature | undefined {
    const node = byId.get(id)
    if (!node) {
      return undefined
    }
    const result: NestedFeature = {
      _id: node._id,
      refSeq: node.refSeq,
      type: node.type,
      min: node.min,
      max: node.max,
    }
    if (node.strand !== undefined) {
      result.strand = node.strand
    }
    if (node.phase !== undefined) {
      result.phase = node.phase
    }
    if (node.attributes) {
      result.attributes = node.attributes
    }
    if (node.status !== undefined) {
      result.status = node.status
    }
    if (node.user) {
      result.user = node.user
    }
    if (node.childList.length > 0) {
      const children: Record<string, NestedFeature> = {}
      for (const child of node.childList) {
        const nested = toNested(child._id)
        if (nested) {
          children[child._id] = nested
        }
      }
      result.children = children
    }
    return result
  }

  const result: NestedFeature[] = []
  for (const rootId of roots) {
    const tree = toNested(rootId)
    if (tree) {
      result.push(tree)
    }
  }
  return result
}

import type { AnnotationFeature } from '@apollo-annotation/mst'

import type { OntologyLookup } from './OntologyLookup'

import { isOntologyClass } from '.'

export function fetchValidDescendantTerms(
  parentFeature: AnnotationFeature | undefined,
  ontologyStore: OntologyLookup,
) {
  if (!parentFeature) {
    return
  }
  const parentTypeTerms = ontologyStore.getTermsWithLabelOrSynonym(
    parentFeature.type,
    { includeSubclasses: false },
  )
  // eslint-disable-next-line unicorn/no-array-callback-reference
  const parentTypeClassTerms = parentTypeTerms.filter(isOntologyClass)
  if (parentTypeTerms.length === 0) {
    return
  }
  const subpartTerms = ontologyStore.getClassesThat(
    'part_of',
    parentTypeClassTerms,
  )
  if (subpartTerms.length === 0) {
    return
  }
  return subpartTerms
}

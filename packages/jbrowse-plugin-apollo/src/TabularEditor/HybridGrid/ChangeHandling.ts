import type { AnnotationFeature } from '@apollo-annotation/mst'

import type { FeatureService } from '../../FeatureService'

export function handleFeatureTypeChange(
  featureService: FeatureService,
  feature: AnnotationFeature,
  _oldType: string,
  newType: string,
) {
  return featureService.updateFeature(feature._id, { type: newType })
}

export function handleFeatureStartChange(
  featureService: FeatureService,
  feature: AnnotationFeature,
  _oldStart: number,
  newStart: number,
) {
  return featureService.updateFeature(feature._id, { min: newStart })
}

export function handleFeatureEndChange(
  featureService: FeatureService,
  feature: AnnotationFeature,
  _oldEnd: number,
  newEnd: number,
) {
  return featureService.updateFeature(feature._id, { max: newEnd })
}

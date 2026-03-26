import { z } from 'zod'

const nestedFeatureSchema: z.ZodType = z.lazy(() =>
  z.object({
    _id: z.string(),
    refSeq: z.string(),
    type: z.string(),
    min: z.number().int(),
    max: z.number().int(),
    strand: z.union([z.literal(1), z.literal(-1)]).optional(),
    phase: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
    attributes: z.record(z.string(), z.array(z.string())).optional(),
    status: z.number().optional(),
    user: z.string().optional(),
    children: z.record(z.string(), nestedFeatureSchema).optional(),
  }),
)

export const featureUpdateSchema = z
  .object({
    min: z.number().int().optional(),
    max: z.number().int().optional(),
    strand: z.union([z.literal(1), z.literal(-1), z.null()]).optional(),
    type: z.string().min(1).optional(),
    attributes: z.record(z.string(), z.array(z.string())).optional(),
    phase: z
      .union([z.literal(0), z.literal(1), z.literal(2), z.null()])
      .optional(),
  })
  .strict()

export const addFeatureSchema = z.object({
  addedFeature: nestedFeatureSchema,
  parentFeatureId: z.string().optional(),
  assemblyId: z.string(),
})

export const mergeExonsSchema = z.object({
  firstExonId: z.string(),
  secondExonId: z.string(),
})

export const splitExonSchema = z.object({
  exonId: z.string(),
  splitPoint: z.number(),
})

export const mergeTranscriptsSchema = z.object({
  firstTranscriptId: z.string(),
  secondTranscriptId: z.string(),
})

export const splitTranscriptSchema = z.object({
  transcriptId: z.string(),
  splitPoint: z.number(),
})

export const undoSchema = z.object({
  sequence: z.number().int(),
})

export const featureRangeSearchSchema = z.object({
  refSeq: z.string(),
  start: z.coerce.number().int(),
  end: z.coerce.number().int(),
})

export const featureIdsSearchSchema = z.object({
  featureIds: z.array(z.string()),
  topLevel: z.boolean().optional(),
})

export const featureCountSchema = z.object({
  assemblyId: z.string().optional(),
  refSeqId: z.string().optional(),
  start: z.coerce.number().int().optional(),
  end: z.coerce.number().int().optional(),
})

export const getByIndexedIdSchema = z.object({
  id: z.string(),
  assemblies: z.string().optional(),
  topLevel: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .optional(),
})

export type FeatureUpdateDto = z.infer<typeof featureUpdateSchema>
export type AddFeatureDto = z.infer<typeof addFeatureSchema>
export type MergeExonsDto = z.infer<typeof mergeExonsSchema>
export type SplitExonDto = z.infer<typeof splitExonSchema>
export type MergeTranscriptsDto = z.infer<typeof mergeTranscriptsSchema>
export type SplitTranscriptDto = z.infer<typeof splitTranscriptSchema>
export type FeatureRangeSearchDto = z.infer<typeof featureRangeSearchSchema>
export type FeatureCountRequest = z.infer<typeof featureCountSchema>
export type GetByIndexedIdRequest = z.infer<typeof getByIndexedIdSchema>

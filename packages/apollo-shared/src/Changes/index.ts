import { AddFeatureChange } from './AddFeatureChange.js'
import { DeleteFeatureChange } from './DeleteFeatureChange.js'
import { FeatureAttributeChange } from './FeatureAttributeChange.js'
import { LocationEndChange } from './LocationEndChange.js'
import { LocationStartChange } from './LocationStartChange.js'
import { MergeExonsChange } from './MergeExonsChange.js'
import { MergeTranscriptsChange } from './MergeTranscriptsChange.js'
import { SetCdsBoundsChange } from './SetCdsBoundsChange.js'
import { SplitExonChange } from './SplitExonChange.js'
import { SplitTranscriptChange } from './SplitTranscriptChange.js'
import { StrandChange } from './StrandChange.js'
import { TypeChange } from './TypeChange.js'
import { UndoMergeExonsChange } from './UndoMergeExonsChange.js'
import { UndoMergeTranscriptsChange } from './UndoMergeTranscriptsChange.js'
import { UndoSplitExonChange } from './UndoSplitExonChange.js'
import { UndoSplitTranscriptChange } from './UndoSplitTranscriptChange.js'

export const changes = {
  AddFeatureChange,
  DeleteFeatureChange,
  FeatureAttributeChange,
  LocationEndChange,
  LocationStartChange,
  MergeExonsChange,
  SetCdsBoundsChange,
  SplitExonChange,
  SplitTranscriptChange,
  MergeTranscriptsChange,
  UndoMergeExonsChange,
  UndoSplitExonChange,
  UndoSplitTranscriptChange,
  UndoMergeTranscriptsChange,
  StrandChange,
  TypeChange,
}

export * from './AddFeatureChange.js'
export * from './DeleteFeatureChange.js'
export * from './FeatureAttributeChange.js'
export * from './LocationEndChange.js'
export * from './LocationStartChange.js'
export * from './MergeExonsChange.js'
export * from './SetCdsBoundsChange.js'
export * from './SplitExonChange.js'
export * from './SplitTranscriptChange.js'
export * from './MergeTranscriptsChange.js'
export * from './UndoMergeExonsChange.js'
export * from './UndoSplitExonChange.js'
export * from './UndoSplitTranscriptChange.js'
export * from './UndoMergeTranscriptsChange.js'
export * from './StrandChange.js'
export * from './TypeChange.js'

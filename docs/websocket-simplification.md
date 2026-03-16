# WebSocket Channel Simplification

## Change

From per-refSeq channels (`${assemblyId}-${refSeqName}`) to a single `COMMON`
channel for all feature changes.

## What Was Removed

- **Server**: 12 lines of DB queries per change (feature IDs → refSeq IDs →
  refSeq names) to determine broadcast channel
- **Frontend**: `ensureAssemblySocket()` (25 lines), `haveDataForChange()` (12
  lines), and their call sites
- Magic strings replaced with shared constants (`COMMON`, `USER_LOCATION`,
  `REQUEST_INFORMATION`)

## Why This Is Safe

Feature change volume is human-speed (annotation edits, not automated
pipelines). Broadcasting all changes to all clients adds negligible overhead
vs the complexity savings.

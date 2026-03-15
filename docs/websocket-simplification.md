# WebSocket Channel Simplification

## Summary

Simplified the WebSocket channel architecture from per-refSeq channels to a
single global channel for all feature changes. This removes significant
complexity from both the server and frontend.

## Before

The server broadcast feature changes on `${assemblyId}-${refSeqName}` channels.
This required:

1. **Server**: Looking up which refSeqs were affected by a change (multiple DB
   queries per change to map feature IDs → refSeq IDs → refSeq names)
2. **Frontend**: Opening a new socket listener for every refSeq the user
   navigates to (`checkSocket`), with logic to check if each incoming change
   affects locally-loaded features (`haveDataForChange`)
3. **Channel management**: Tracking which channels are subscribed, avoiding
   duplicate listeners

## After

All changes broadcast on the `COMMON` channel (which already existed for
assembly-level changes like adding/deleting assemblies). The frontend's existing
`COMMON` channel handler already applies changes via `changeManager.submit()`.

## What was removed

- **Server**: The entire refSeq name lookup in `ChangesService.create()` — 12
  lines of DB queries that ran on every feature change
- **Frontend**: `ensureAssemblySocket()` method (25 lines) — no longer needed
  since `COMMON` channel is connected at login time
- **Frontend**: `haveDataForChange()` method (12 lines) — no longer needed since
  all changes are applied globally
- **Frontend**: Two `ensureAssemblySocket` call sites in `getFeatures` and
  `getSequence`
- **Imports**: `ChangeManager`, `isFeatureChange`, `makeUserSessionId`,
  `ChangeMessage` from `CollaborationServerDriver`

## Also done

- Extracted WebSocket channel names (`COMMON`, `USER_LOCATION`,
  `REQUEST_INFORMATION`) into shared constants in `Messages.ts` — no more magic
  strings scattered across server and frontend code

## Why this is safe

Feature change volume in annotation editing is low (human-speed edits, not
automated pipelines). Broadcasting all changes to all clients adds negligible
overhead compared to the complexity savings.

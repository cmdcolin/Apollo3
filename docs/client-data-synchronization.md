# Client Data Synchronization Pattern

How the JBrowse Apollo plugin keeps its in-memory feature tree in sync with the
server's SQL database after mutations.

## Pattern: synchronous apply from mutation response

After any mutation (edit, delete, undo, split, merge), the server returns a
`MutationResult` containing the updated feature trees and a list of deleted
feature IDs. The client applies this response **synchronously** to the MST data
store.

```
Client                          Server
  |                               |
  |-- PATCH /features/:id ------->|
  |                               |-- update DB
  |                               |-- recalculate bounds
  |                               |-- build response tree
  |<-- { features, deleted } -----|
  |                               |
  |-- applyFeatureUpdate() ------>| (synchronous, no network)
  |   add features to MST        |
  |   delete features from MST   |
  |   UI re-renders              |
```

This is the same approach used by Apollo 2's `ScratchPad` store, which applied
server responses via `store.insert()`, `store.replace()`, and
`store.deleteFeatureById()`.

## Why not async refetch?

An earlier approach used `refreshLoadedRegions()` — an async server refetch
after each mutation. This was abandoned because:

- **Timing**: The undo/redo menu handler uses `void` (fire-and-forget), so the
  async refetch could complete at any time. Tests and UI couldn't know when the
  data was ready.
- **Range problems**: The refetch range was derived from current feature bounds,
  which could be stale after undo (e.g., feature shrunk from 0-80 to 0-70, then
  undo restores 0-80, but refetch only queries 0-70).
- **Unnecessary**: The server already returns the complete updated feature tree
  in the mutation response. A second round-trip adds latency without new
  information.

## MST detached node warnings

When `features.put(updatedSnapshot)` replaces a feature in the MST map, any
children that were removed (e.g., a deleted exon) get detached from the tree.
MobX observers that still hold references to those children would throw errors.

This is handled by `setLivelinessChecking('warn')` at plugin initialization,
which downgrades the thrown error to a console warning. The detached references
are cleaned up on the next render cycle.

```typescript
// packages/jbrowse-plugin-apollo/src/index.ts
import { setLivelinessChecking } from '@jbrowse/mobx-state-tree'
setLivelinessChecking('warn')
```

## applyFeatureUpdate ordering

The `applyFeatureUpdate` MST action does **adds before deletes**. This matters
because when a child is deleted, the server returns the updated parent tree
(without the deleted child). Adding the parent first replaces the entire subtree,
which implicitly removes the deleted child. The explicit delete step then only
needs to handle root-level feature deletions.

```typescript
// ClientDataStore.ts
applyFeatureUpdate(assemblyId, features, deletedFeatureIds) {
  // Add first — replaces existing features with server's version
  for (const feature of features) {
    self.addFeature(assemblyId, feature)
  }
  // Delete second — only needed for root features not in any returned tree
  for (const id of deletedFeatureIds) {
    if (self.getFeature(id)) {
      self.deleteFeature(id)
    }
  }
}
```

## fixFeatureSnapshot

Raw SQL queries (recursive CTEs for tree traversal) return JSON columns as
strings. The `attributes` field can arrive as a JSON string instead of an
object, or even double-stringified after undo cycles. `fixFeatureSnapshot`
recursively parses these before applying to the MST tree.

```typescript
function fixFeatureSnapshot(f: NestedFeature) {
  let attrs = f.attributes
  while (typeof attrs === 'string') {
    attrs = JSON.parse(attrs)
  }
  f.attributes = attrs
  if (f.children) {
    for (const child of Object.values(f.children)) {
      fixFeatureSnapshot(child)
    }
  }
}
```

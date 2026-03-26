# Server-Authoritative Architecture

## What changed

Replaced a custom "changes" system (16 change classes, dual client/server
execution, hand-written undo inverses) with standard REST endpoints. The browser
sends simple requests, the server makes the change and broadcasts the result.

**Net result**: ~6,000 fewer lines of code. Every mutation implemented once instead
of twice.

## Before → After

**Before**: Client builds a Change object → executes locally → sends to server →
server re-executes → broadcasts the change description → other clients deserialize
and re-execute.

**After**: Client sends `PATCH /features/:id { min: 500 }` → server updates DB →
broadcasts the updated feature tree → all clients apply the new state directly.

## Key components

- **REST endpoints**: `PATCH/POST/DELETE /features` plus `/features/merge-exons`,
  `split-exon`, `merge-transcripts`, `split-transcript`, `undo`
- **Automatic history**: MikroORM subscriber records feature state on every
  insert/update/delete — no per-operation code needed
- **Undo**: Reads pre-mutation snapshots from history table and restores them
- **Bounds propagation**: Server auto-updates parent gene/transcript bounds when
  child coordinates change
- **Typed IDs**: Prefixed nanoid (`f-`, `asm-`, `rs-`, etc.) replacing raw hex

## Database compatibility

Works on SQLite, PostgreSQL, and MongoDB. History subscriber is application-level
(not DB triggers), so it's portable across all backends.

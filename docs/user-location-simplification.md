# User Location Broadcasting Simplification

## Bug Fixed

Frontend sent `URLSearchParams(JSON.stringify(locations))` — garbled data,
`userLocations.map is not a function` errors on every location update.
**Fix**: `JSON.stringify(location)` with `Content-Type: application/json`.

## Simplification

Users view one region at a time. Changed from sending an array of all visible
regions to sending only the primary region (or `null` to clear). WebSocket
message format preserved for backward compatibility (wraps into one-element
array).

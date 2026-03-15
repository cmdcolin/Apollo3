# User Location Broadcasting Simplification

## Summary

Simplified the user location broadcasting system from sending an array of all
visible regions to sending only the first (primary) region. Fixed a pre-existing
data encoding bug in the process.

## Pre-existing Bug (Fixed)

The frontend sent user locations as `URLSearchParams(JSON.stringify(locations))`
which encoded a JSON array as URL-form-encoded data. NestJS parsed this into a
garbled object, and the controller used a fragile `Object.keys` + `JSON.parse`
hack to reconstruct the data. This produced
`userLocations.map is not a function` errors in the server log on every location
update.

**Root cause**: `new URLSearchParams(jsonString)` creates malformed key-value
pairs from JSON, not valid URL parameters.

**Fix**: Frontend now sends `JSON.stringify(location)` with
`Content-Type: application/json`. NestJS parses this correctly.

## Simplification

Users typically view one genomic region at a time. Sending all visible regions
was unnecessary complexity.

| Before                                               | After                                                     |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `POST /users/userLocation` with `UserLocationDto[]`  | `POST /users/userLocation` with `UserLocationDto \| null` |
| Frontend collected all visible regions into an array | Frontend sends only the first visible region              |
| Service mapped array to WebSocket message            | Service wraps single location into message                |
| `null` sent as empty array `[]` to clear             | `null` sent directly to clear                             |

The WebSocket `UserLocationMessage.locations` array format is preserved for
backward compatibility — the service wraps the single location into a
one-element array.

## Files Changed

- `packages/jbrowse-plugin-apollo/src/ApolloInternetAccount/model.ts`
- `packages/jbrowse-plugin-apollo/src/session/session.ts`
- `packages/apollo-collaboration-server/src/users/users.controller.ts`
- `packages/apollo-collaboration-server/src/users/users.service.ts`

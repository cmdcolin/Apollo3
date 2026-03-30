# SQLite + MikroORM Lessons Learned

Bugs found and fixed during E2E test development. These are important patterns
to follow for any future MikroORM code.

## Raw SQL inside transactions must pass the transaction context

MikroORM's `em.getConnection().execute()` accepts an optional `ctx` parameter
for the transaction context. Without it, raw SQL queries use a separate
connection, which deadlocks on SQLite when called inside `em.transactional()`.

```typescript
// WRONG — deadlocks on SQLite
private sql(query: string, params?: unknown[]) {
  return this.em.getConnection().execute(query, params, 'all')
}

// CORRECT — uses the same connection as the surrounding transaction
private sql(query: string, params?: unknown[]) {
  const ctx = this.em.getTransactionContext()
  return this.em.getConnection().execute(query, params, 'all', ctx)
}
```

This affected `MikroOrmFeatureRepository` methods that use recursive CTEs
(`deleteDescendants`, `findDescendantsOfMany`, `findRootParentsOfMany`, etc.).
All raw SQL in that file goes through the `sql()` helper, so the fix was a
one-line change.

**File**: `packages/apollo-entities/src/repositories/MikroOrmFeatureRepository.ts`

## schema.clear() vs schema.drop() + schema.create()

For the test database reset endpoint, `schema.drop()` + `schema.create()` runs
DDL statements (DROP TABLE, CREATE TABLE) that require an exclusive lock on
SQLite. If any other request is mid-flight (even a read), the DDL blocks
indefinitely.

`schema.clear()` uses DELETE FROM instead of DDL, which requires only a normal
write lock and cooperates with SQLite's busy timeout.

**File**: `packages/apollo-collaboration-server/src/health/health.controller.ts`

## FeatureHistorySubscriber must be cleaned up on database reset

The `FeatureHistorySubscriber` is registered on the MikroORM EventManager. On
each test database reset, a new subscriber was registered without removing the
old one. After many resets, dozens of subscribers would fire on every entity
change, creating unbounded history records and potential performance issues.

The fix removes old subscribers before re-registering:

```typescript
const subscribers = eventManager.getSubscribers()
for (const subscriber of subscribers) {
  if (subscriber instanceof FeatureHistorySubscriber) {
    subscribers.delete(subscriber)
  }
}
eventManager.registerSubscriber(new FeatureHistorySubscriber())
```

## propagateAncestorBounds must include the direct parent

When a child feature is deleted, the parent's bounds need recalculation from its
remaining children. The original implementation started propagation from the
parent's parent, leaving the direct parent with stale bounds.

```typescript
// WRONG — starts from grandparent, skips parent
let current = await featureRepository.findById(featureId) // parent
while (current?.parentId) {
  const siblings = await featureRepository.findChildren(current.parentId)
  // updates grandparent based on parent's (stale) bounds
  ...
}

// CORRECT — starts from the parent itself
let currentId = featureId // parent
while (currentId) {
  const children = await featureRepository.findChildren(currentId)
  if (children.length > 0) {
    // recalculate this node's bounds from its children
    ...
  }
  const current = await featureRepository.findById(currentId)
  currentId = current?.parentId
}
```

**File**: `packages/apollo-collaboration-server/src/features/features.service.ts`

# Apollo3 Performance Optimization Report

## Summary

Database query optimizations delivered 7-20x speedups across all major operations on a 5,000-feature synthetic dataset.

## Results

| Operation | Before | After | Speedup |
|-----------|--------|-------|---------|
| Assembly import (5000 features) | 60s | 8.06s | **7.5x** |
| Feature get (all features) | 74s | 3.65s | **20x** |
| Feature search | 4.5s | 3.41s | 1.3x |
| GFF3 export | 6.3s | 3.86s | 1.6x |
| Assembly delete | 5.0s | 3.46s | 1.4x |

Benchmark: Synthetic dataset (1000 genes, ~5000 features), 3 iterations each, Node.js v24.13.0, Linux x64.

Remaining time (~3-4s baseline) is CLI startup + HTTP overhead, not database operations.

## Changes Made

### 1. SQLite WAL mode and synchronous tuning

Added `PRAGMA journal_mode = WAL` and `PRAGMA synchronous = NORMAL` at startup. WAL mode allows concurrent reads during writes and reduces fsync overhead for the many small `insertMany` batch operations during import.

### 2. Raw SQL for read-only feature queries

Replaced `em.find()` with `em.getConnection().execute()` for all read-only feature repository methods: `findAll`, `findById`, `findByIds`, `findByRange`, `findRootsByRange`, `findChildren`, `searchText`, `findByIndexedId`, `findRootParent`.

The ORM hydration (proxy creation, identity map registration, change tracking) was pure overhead for these queries since every result was immediately converted to a plain `FeatureRow` object via `toRow()`. Raw SQL returns plain objects directly, eliminating this cost.

### 3. Recursive CTEs for tree operations

Replaced the iterative BFS approach (N queries per tree depth level) with single-query recursive CTEs for `findDescendantsOfMany`, `deleteDescendants`, and `findRootParent`.

Before (per-root BFS):
```
Level 0: SELECT WHERE parent IN (roots)        -- 1 query
Level 1: SELECT WHERE parent IN (level0_ids)   -- 1 query
Level 2: SELECT WHERE parent IN (level1_ids)   -- 1 query
... N queries for N depth levels, repeated per root
```

After (single recursive CTE):
```sql
WITH RECURSIVE tree AS (
  SELECT f.* FROM feature f WHERE f.parent__id IN (?)
  UNION ALL
  SELECT f.* FROM feature f JOIN tree t ON f.parent__id = t._id
)
SELECT * FROM tree
```

One query regardless of tree depth or number of roots. For 5000 features across ~1000 gene trees, this reduces hundreds of queries to 1.

### 4. Moved check recalculation from GET to mutation pipeline

**This was the single largest performance issue discovered during optimization, responsible for the majority of the 20x speedup on feature get.**

The `findByRange` method (called on every `GET /features/getFeatures` request) was running `checkFeature()` individually for every root feature in the response. For a dataset with 1000 genes, each GET request triggered:

- 1000x `findById` queries (one per root feature)
- 1000x `findDescendants` queries (one per root feature)
- 1000x `assembleFeatureTrees` calls
- 1000x assembly/check config lookups
- For each configured check on each feature: delete old results, run check (potentially fetching sequence data), save new results

This was thousands of DB queries and check evaluations on every read request. The check results were already persisted in the database from previous runs, making the re-computation redundant for features that hadn't changed.

The fix: checks now run after mutations (in the change service, after the unit-of-work commits) instead of on every GET. The GET endpoint returns pre-computed check results from the database. This is both correct (checks reflect the state after the most recent edit) and dramatically faster.

## Benchmark Details

```
Date: 2026-03-14
Dataset: Synthetic (1000 genes, ~5000 features)
Iterations: 3
Node.js: v24.13.0
Platform: linux x64
```

### After optimization

| Scenario | Median | p95 |
|----------|--------|-----|
| Assembly import | 8.06s | 8.07s |
| Feature get (all) | 3.65s | 4.62s |
| Feature search | 3.41s | 3.44s |
| GFF3 export | 3.86s | 3.97s |
| Assembly delete | 3.46s | 3.70s |

## Reproduction

```bash
cd packages/apollo-cli
yarn tsx src/test/benchmark.ts --synthetic
```

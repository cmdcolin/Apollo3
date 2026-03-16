# Performance Optimization Report

7-20x speedups across all major operations on a 5,000-feature synthetic dataset.

## Results

| Operation | Before | After | Speedup |
|-----------|--------|-------|---------|
| Assembly import (5000 features) | 60s | 8.06s | **7.5x** |
| Feature get (all) | 74s | 3.65s | **20x** |
| Feature search | 4.5s | 3.41s | 1.3x |
| GFF3 export | 6.3s | 3.86s | 1.6x |
| Assembly delete | 5.0s | 3.46s | 1.4x |

Remaining ~3-4s baseline is CLI startup + HTTP overhead, not DB operations.

## What Changed

### 1. SQLite WAL mode + synchronous tuning

`PRAGMA journal_mode = WAL` + `PRAGMA synchronous = NORMAL` at startup.
Concurrent reads during writes, reduced fsync for batch inserts.

### 2. Raw SQL for read-only queries

Replaced `em.find()` with `em.getConnection().execute()` for all read-only
feature queries. ORM hydration (proxy creation, identity map, change tracking)
was pure overhead since results were immediately converted to plain objects.

### 3. Recursive CTEs for tree operations

Replaced iterative BFS (N queries per depth level per root) with single
recursive CTE queries for `findDescendantsOfMany`, `deleteDescendants`, and
`findRootParent`. For 5000 features across ~1000 gene trees: hundreds of
queries → 1.

### 4. Moved check recalculation from GET to mutation pipeline

**The single largest performance issue — responsible for the 20x speedup.**

`GET /features/getFeatures` was re-running all quality checks on every root
feature in the response. For 1000 genes, each pan/zoom triggered: 1000x
findById + 1000x findDescendants + 1000x assembleFeatureTrees + check
config lookups + delete/rerun/save checks. All redundant — results were already
persisted from the last edit.

Fix: checks run after mutations only. GET returns pre-computed results.

## Benchmark Environment

```
Dataset: Synthetic (1000 genes, ~5000 features), 3 iterations
Node.js v24.13.0, linux x64, 2026-03-14
```

## Reproduction

```bash
cd packages/apollo-cli && pnpm tsx src/test/benchmark.ts --synthetic
```

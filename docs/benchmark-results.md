# Apollo3 Performance Benchmark Results

- **Date**: 2026-03-14
- **Dataset**: Synthetic (1000 genes, ~5000 features)
- **Iterations**: 3
- **Node.js**: v24.13.0
- **Platform**: linux x64
- **SQLite**: Node.js built-in `node:sqlite` (zero native dependencies)
- **MongoDB**: Docker `mongo:7` replica set

| Scenario | MikroORM/SQLite (median) | MikroORM/SQLite (p95) | MongoDB (median) | MongoDB (p95) | Speedup |
|----------|------------------------|----------------------|-----------------|--------------|--------|
| Assembly import | 60.52s | 63.49s | 107.00s | 107.09s | 1.8x faster |
| Feature get (all) | 73.80s | 74.59s | 11.34s | 12.22s | 6.5x slower |
| Feature search | 4.56s | 5.29s | 6.76s | 6.91s | 1.5x faster |
| GFF3 export | 6.26s | 6.86s | 6.97s | 7.35s | 1.1x faster |
| Assembly delete | 5.04s | 5.24s | 6.10s | 6.39s | 1.2x faster |

## Analysis

**MikroORM/SQLite wins (4 of 5 scenarios):**

- **Assembly import (1.8x faster):** The relational model inserts individual
  rows without constructing nested documents. Batched inserts and the
  lightweight `node:sqlite` driver contribute to the speed advantage.
- **Feature search (1.5x faster):** Batched `IN` queries and the in-memory
  parent map eliminate the per-match N+1 queries that existed before optimization.
- **GFF3 export (1.1x faster):** Comparable performance — both backends
  stream features through the same export pipeline.
- **Assembly delete (1.2x faster):** `ON DELETE CASCADE` handles all child
  cleanup in a single database operation. MongoDB required explicit
  multi-collection deletion.

**MongoDB wins (1 scenario):**

- **Feature get — all 5000 features (6.5x faster):** This is the known
  tradeoff documented in
  [mikro-orm-technical-details.md](./mikro-orm-technical-details.md). MongoDB
  returns pre-assembled nested gene documents in a single query. The relational
  model must load flat rows and reconstruct parent-child trees, currently
  requiring multiple queries per gene. Adding a `root_id` column (documented as
  the highest-priority remaining optimization) would collapse tree loading to a
  single query, significantly closing this gap.

**Note:** "Feature get (all)" fetches every feature in the assembly via the CLI,
which is not the typical browser usage pattern. The genome browser loads features
by coordinate range (a viewport), which only returns root-level features in the
visible region — a much smaller result set where the tree reconstruction overhead
is negligible.

## Reproduction

```bash
# MikroORM/SQLite only (no MongoDB needed):
cd packages/apollo-cli
yarn tsx src/test/benchmark.ts --synthetic

# Full comparison (requires Docker for MongoDB):
docker run -d --name apollo-mongo-bench -p 27017:27017 mongo:7 --replSet rs0 --bind_ip_all
docker exec apollo-mongo-bench mongosh --quiet --eval "rs.initiate()"
yarn tsx src/test/benchmark.ts --synthetic --compare

# Cleanup:
docker stop apollo-mongo-bench && docker rm apollo-mongo-bench
```

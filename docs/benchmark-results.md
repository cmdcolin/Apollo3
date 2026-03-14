# Apollo3 Performance Benchmark Results

- **Date**: 2026-03-14
- **Dataset**: Synthetic (1000 genes, ~5000 features)
- **Iterations**: 3
- **Node.js**: v24.13.0
- **Platform**: linux x64

| Scenario | MikroORM/SQLite (median) | MikroORM/SQLite (p95) | MongoDB (median) | MongoDB (p95) | Speedup |
|----------|------------------------|----------------------|-----------------|--------------|--------|
| Assembly import | 60.52s | 63.49s | 107.00s | 107.09s | 1.8x faster |
| Feature get (all) | 73.80s | 74.59s | 11.34s | 12.22s | 6.5x slower |
| Feature search | 4.56s | 5.29s | 6.76s | 6.91s | 1.5x faster |
| GFF3 export | 6.26s | 6.86s | 6.97s | 7.35s | 1.1x faster |
| Assembly delete | 5.04s | 5.24s | 6.10s | 6.39s | 1.2x faster |

## Reproduction

```bash
cd packages/apollo-cli
yarn tsx src/test/benchmark.ts --compare
```

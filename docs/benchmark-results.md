# Apollo3 Performance Benchmark Results

- **Date**: 2026-03-13
- **Dataset**: Synthetic (1000 genes, ~5000 features)
- **Iterations**: 5
- **Node.js**: v24.13.0
- **Platform**: linux x64

| Scenario | Median | p95 |
|----------|--------|-----|
| Assembly import | 55.15s | 56.86s |
| Feature get (all) | 97.45s | 144.82s |
| Feature search | 6.33s | 6.60s |
| GFF3 export | 7.82s | 9.12s |
| Assembly delete | 5.21s | 6.61s |

## Reproduction

```bash
cd packages/apollo-cli
yarn tsx src/test/benchmark.ts
```

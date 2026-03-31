# Tiberius Integration

[Tiberius](https://github.com/Gaius-Augustus/Tiberius) is an ab initio gene predictor that uses deep learning (TensorFlow) to predict gene structures directly from genome sequence, without requiring RNA-seq or protein evidence.

## Status

Integrated as a runner in Apollo's analysis framework. Available in the web UI alongside BLAST, BLAT, miniprot, and isPcR.

## How it runs

Jobs are submitted from the Sequence Search page. Tiberius takes a genome region (FASTA) and returns predicted gene models (GTF), which are rendered as annotation tracks. GPU acceleration is used automatically when available.

Tiberius runs inside a **Docker container** (`larsgabriel23/tiberius:latest`, 28 GB) to avoid complex local dependency management (TensorFlow + CUDA + ~10 bioinformatics tools). The container image must be pre-pulled on the server host.

## Setup (one-time, per server)

- Docker must be installed and the server user must be in the `docker` group
- Pull the image: `docker pull larsgabriel23/tiberius:latest`
- Place `apollo-tools.json` in the server working directory (already committed):
  ```json
  { "tools": { "tiberius": { "dockerImage": "larsgabriel23/tiberius:latest" } } }
  ```
- Tiberius source must be at `~/src/Tiberius/tiberius.py` (or set `TIBERIUS_PATH`)

## Configuration

Optional overrides via `apollo-tools.json` or environment variables:

| Key | Default | Description |
|-----|---------|-------------|
| `dockerImage` | — | Docker image to use (enables Docker mode) |
| `singularityImage` | — | Path to a `.sif` file (HPC environments without Docker) |
| `modelCfg` | `mammalia_softmasking_v2` | Species/clade model |
| `maxRegionSize` | 500 000 bp | Maximum region that can be submitted |
| `timeout` | 10 min | Per-job timeout |

## Notes

- The Docker image is 28 GB; building a Singularity SIF from it requires ~50 GB of temporary disk space and is impractical on most workstations
- GPU passthrough (`--gpus all`) is attempted automatically; jobs still run (slowly) on CPU if no GPU is present
- The `TIBERIUS_IN_SINGULARITY=1` environment variable is set when invoking the container, telling the Tiberius launcher not to re-invoke itself inside another container

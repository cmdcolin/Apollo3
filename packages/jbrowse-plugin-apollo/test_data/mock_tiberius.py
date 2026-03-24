#!/usr/bin/env python3
"""Mock Tiberius script for Apollo e2e tests.

Accepts the same CLI as tiberius.py and writes a minimal valid GTF to --out.
Coordinates are 1-based relative to the input FASTA (as real Tiberius would
produce), and will be rewritten to absolute genomic coordinates by the runner.
"""
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--genome', required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--singularity', action='store_true')
parser.add_argument('--model_cfg', default=None)
args = parser.parse_args()

with open(args.out, 'w') as f:
    f.write('seq\tTiberius\tgene\t10\t90\t.\t+\t.\tgene_id "mock_g1"; transcript_id "mock_t1";\n')
    f.write('seq\tTiberius\ttranscript\t10\t90\t.\t+\t.\tgene_id "mock_g1"; transcript_id "mock_t1";\n')
    f.write('seq\tTiberius\texon\t10\t90\t.\t+\t.\tgene_id "mock_g1"; transcript_id "mock_t1";\n')

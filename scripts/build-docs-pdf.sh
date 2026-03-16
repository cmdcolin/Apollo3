#!/usr/bin/env bash
set -euo pipefail

# Build a single document from all docs/ markdown files using pandoc.
# Produces both .docx (for Google Docs) and .pdf.
#
# Usage:
#   bash scripts/build-docs-pdf.sh              # builds both formats
#   bash scripts/build-docs-pdf.sh --docx-only  # .docx only (no LaTeX needed)

DOCS_DIR="$(cd "$(dirname "$0")/../docs" && pwd)"
DOCX_ONLY=0
if [ "${1:-}" = "--docx-only" ]; then
  DOCX_ONLY=1
fi

# Reading order: intro, then MikroORM migration (the core change), then
# schema/technical details, then deployment/architecture, then
# performance/security, then analysis tools, then appendices.
FILES=(
  README.md
  mikro-orm-migration-justification.md
  schema-comparison.md
  mikro-orm-technical-details.md
  mikro-orm-alternatives.md
  deployment.md
  architecture-overview.md
  benchmark-results.md
  authentication-security-audit.md
  bug-fixes-code-quality.md
  analysis-tools.md
  check-result-simplification.md
  internet-account-removal.md
  tech-notes.md
  apollo2-migration-and-history-tracking.md
)

# Verify all files exist
MISSING=0
for f in "${FILES[@]}"; do
  if [ ! -f "$DOCS_DIR/$f" ]; then
    echo "Missing: docs/$f" >&2
    MISSING=1
  fi
done
if [ "$MISSING" -eq 1 ]; then
  echo "Some files are missing. Aborting." >&2
  exit 1
fi

INPUTS=()
for f in "${FILES[@]}"; do
  INPUTS+=("$DOCS_DIR/$f")
done

COMMON_ARGS=(
  "${INPUTS[@]}"
  --from gfm
  --resource-path="$DOCS_DIR"
  --toc
  --toc-depth=1
  --metadata=title:"Apollo3 Architecture Refactoring Report"
  --metadata=date:"$(date +%Y-%m-%d)"
)

# .docx — works everywhere, imports into Google Docs
pandoc "${COMMON_ARGS[@]}" \
  --to docx \
  --syntax-highlighting=tango \
  -o apollo3-docs.docx

echo "Built: apollo3-docs.docx (upload to Google Docs)"

if [ "$DOCX_ONLY" -eq 1 ]; then
  exit 0
fi

# .pdf — requires pdflatex or xelatex
# Use xelatex if available (handles Unicode box-drawing chars in diagrams),
# fall back to pdflatex with Unicode stripped.
PDF_ENGINE=""
if command -v xelatex &>/dev/null; then
  PDF_ENGINE=xelatex
elif command -v pdflatex &>/dev/null; then
  PDF_ENGINE=pdflatex
else
  echo "No LaTeX engine found. Skipping PDF (use --docx-only or install texlive)." >&2
  exit 0
fi

if [ "$PDF_ENGINE" = "pdflatex" ]; then
  # pdflatex can't handle Unicode box-drawing chars (├ └ │ etc.).
  # Preprocess: replace them with ASCII equivalents.
  TMPDIR=$(mktemp -d)
  trap 'rm -rf "$TMPDIR"' EXIT
  PROCESSED=()
  for f in "${FILES[@]}"; do
    sed \
      -e 's/├/|--/g' \
      -e 's/└/`--/g' \
      -e 's/│/|  /g' \
      -e 's/┤/--|/g' \
      -e 's/─/-/g' \
      -e 's/▼/v/g' \
      -e 's/▶/>/g' \
      -e 's/►/>/g' \
      -e 's/┌/+/g' \
      -e 's/┐/+/g' \
      -e 's/┘/+/g' \
      -e 's/┴/-/g' \
      -e 's/┬/-/g' \
      -e 's/┼/+/g' \
      -e 's/╌/-/g' \
      -e 's/→/->/g' \
      -e 's/←/<-/g' \
      -e 's/…/.../g' \
      -e 's/—/--/g' \
      "$DOCS_DIR/$f" > "$TMPDIR/$f"
    PROCESSED+=("$TMPDIR/$f")
  done
  INPUTS=("${PROCESSED[@]}")
fi

pandoc \
  "${INPUTS[@]}" \
  --from gfm \
  --to pdf \
  --pdf-engine="$PDF_ENGINE" \
  --resource-path="$DOCS_DIR" \
  --toc \
  --toc-depth=1 \
  --metadata=title:"Apollo3 Architecture Refactoring Report" \
  --metadata=date:"$(date +%Y-%m-%d)" \
  -V geometry:margin=1in \
  -V fontsize=11pt \
  -V linkcolor=blue \
  -V urlcolor=blue \
  -V tables=true \
  --columns=72 \
  --syntax-highlighting=tango \
  -o apollo3-docs.pdf

echo "Built: apollo3-docs.pdf"

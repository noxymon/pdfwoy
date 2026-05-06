#!/usr/bin/env bash
set -uo pipefail

# ── helpers ───────────────────────────────────────────────────────────────────
PASS=0
FAIL=0

pass() { echo "  ✓  $1"; ((PASS++)) || true; }
fail() { echo "  ✗  $1"; ((FAIL++)) || true; }

section() { echo ""; echo "  ── $1"; }

# ── setup ─────────────────────────────────────────────────────────────────────
BINARY="node /app/dist/cli.js"
FIXTURE="/app/test/fixtures/test.pdf"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo ""
echo "  pdftools integration tests"
echo "  ══════════════════════════"

# ── 1. basics ─────────────────────────────────────────────────────────────────
section "basics"

$BINARY --version > /dev/null 2>&1 \
  && pass "--version exits 0" \
  || fail "--version exits 0"

$BINARY --help > /dev/null 2>&1 \
  && pass "--help exits 0" \
  || fail "--help exits 0"

$BINARY doctor > /dev/null 2>&1 \
  && pass "doctor exits 0" \
  || fail "doctor exits 0"

# ── 2. jpg conversion ─────────────────────────────────────────────────────────
section "jpg"

OUT_JPG="$TMP/jpg-default"
$BINARY jpg "$FIXTURE" -o "$OUT_JPG" > /dev/null 2>&1 \
  && pass "jpg: exits 0" \
  || fail "jpg: exits 0"

[ -f "$OUT_JPG/page-001.jpg" ] \
  && pass "jpg: page-001.jpg exists" \
  || fail "jpg: page-001.jpg exists"

# validate JPEG magic bytes (FF D8)
MAGIC=$(od -An -tx1 -N2 "$OUT_JPG/page-001.jpg" 2>/dev/null | tr -d ' \n')
[ "$MAGIC" = "ffd8" ] \
  && pass "jpg: output has JPEG magic bytes (ffd8)" \
  || fail "jpg: expected JPEG magic ffd8, got '$MAGIC'"

# page range: -p 1 should produce exactly 1 file
OUT_JPG_P1="$TMP/jpg-p1"
$BINARY jpg "$FIXTURE" -p 1 -o "$OUT_JPG_P1" > /dev/null 2>&1
COUNT=$(find "$OUT_JPG_P1" -name "*.jpg" 2>/dev/null | wc -l | tr -d ' ')
[ "$COUNT" = "1" ] \
  && pass "jpg -p 1: exactly 1 page written" \
  || fail "jpg -p 1: expected 1 page, got $COUNT"

# higher DPI should produce a larger file
OUT_HI="$TMP/jpg-300dpi"
OUT_LO="$TMP/jpg-72dpi"
$BINARY jpg "$FIXTURE" -d 300 -o "$OUT_HI" > /dev/null 2>&1
$BINARY jpg "$FIXTURE" -d 72  -o "$OUT_LO" > /dev/null 2>&1
SIZE_HI=$(wc -c < "$OUT_HI/page-001.jpg" 2>/dev/null || echo 0)
SIZE_LO=$(wc -c < "$OUT_LO/page-001.jpg" 2>/dev/null || echo 1)
[ "$SIZE_HI" -gt "$SIZE_LO" ] \
  && pass "jpg: 300 DPI output larger than 72 DPI" \
  || fail "jpg: 300 DPI output larger than 72 DPI (hi=${SIZE_HI}B lo=${SIZE_LO}B)"

# quality option
OUT_Q90="$TMP/jpg-q90"
OUT_Q10="$TMP/jpg-q10"
$BINARY jpg "$FIXTURE" -q 90 -o "$OUT_Q90" > /dev/null 2>&1
$BINARY jpg "$FIXTURE" -q 10 -o "$OUT_Q10" > /dev/null 2>&1
SIZE_Q90=$(wc -c < "$OUT_Q90/page-001.jpg" 2>/dev/null || echo 0)
SIZE_Q10=$(wc -c < "$OUT_Q10/page-001.jpg" 2>/dev/null || echo 1)
[ "$SIZE_Q90" -gt "$SIZE_Q10" ] \
  && pass "jpg: quality 90 output larger than quality 10" \
  || fail "jpg: quality 90 output larger than quality 10 (q90=${SIZE_Q90}B q10=${SIZE_Q10}B)"

# ── 3. compress ───────────────────────────────────────────────────────────────
section "compress"

OUT_PDF="$TMP/compressed.pdf"
$BINARY compress "$FIXTURE" -o "$OUT_PDF" > /dev/null 2>&1 \
  && pass "compress: exits 0" \
  || fail "compress: exits 0"

[ -f "$OUT_PDF" ] \
  && pass "compress: output file exists" \
  || fail "compress: output file exists"

# verify output is a valid PDF (starts with %PDF-)
PDF_HEADER=$(head -c 5 "$OUT_PDF" 2>/dev/null)
[ "$PDF_HEADER" = "%PDF-" ] \
  && pass "compress: output has %PDF- header" \
  || fail "compress: output has %PDF- header (got '$PDF_HEADER')"

# all four compression levels
for LEVEL in screen ebook printer prepress; do
  OUT_LEVEL="$TMP/compressed-$LEVEL.pdf"
  $BINARY compress "$FIXTURE" -l "$LEVEL" -o "$OUT_LEVEL" > /dev/null 2>&1 \
    && pass "compress -l $LEVEL: exits 0" \
    || fail "compress -l $LEVEL: exits 0"
done

# ── 4. error handling ─────────────────────────────────────────────────────────
section "error handling"

$BINARY jpg /nonexistent.pdf > /dev/null 2>&1
[ $? -eq 1 ] \
  && pass "jpg: nonexistent file exits 1" \
  || fail "jpg: nonexistent file exits 1"

$BINARY compress /nonexistent.pdf > /dev/null 2>&1
[ $? -eq 1 ] \
  && pass "compress: nonexistent file exits 1" \
  || fail "compress: nonexistent file exits 1"

FAKE="$TMP/not-a-pdf.txt"
echo "not a pdf" > "$FAKE"
$BINARY jpg "$FAKE" > /dev/null 2>&1
[ $? -eq 1 ] \
  && pass "jpg: non-pdf file exits 1" \
  || fail "jpg: non-pdf file exits 1"

$BINARY compress "$FAKE" > /dev/null 2>&1
[ $? -eq 1 ] \
  && pass "compress: non-pdf file exits 1" \
  || fail "compress: non-pdf file exits 1"

$BINARY compress "$FIXTURE" -l invalid-level -o /dev/null > /dev/null 2>&1
[ $? -eq 1 ] \
  && pass "compress: invalid --level exits 1" \
  || fail "compress: invalid --level exits 1"

# ── 5. startup dep check (gs hidden) ──────────────────────────────────────────
section "startup dep check"

# Build a fake PATH: create a wrapper 'which' that returns failure for 'gs'
# so the tool's findOnPath('gs') returns null → startup check fires.
FAKE_BIN="$TMP/fake-bin"
mkdir -p "$FAKE_BIN"
cat > "$FAKE_BIN/which" << 'EOF'
#!/bin/sh
[ "$1" = "gs" ] && exit 1
exec /usr/bin/which "$@"
EOF
chmod +x "$FAKE_BIN/which"

# Run with fake PATH prepended — node itself lives in /usr/local/bin
NO_GS_PATH="$FAKE_BIN:/usr/local/bin:/usr/bin:/bin"
OUTPUT=$(PATH="$NO_GS_PATH" $BINARY compress "$FIXTURE" -o /dev/null 2>&1 || true)
EXIT_CODE=$(PATH="$NO_GS_PATH" $BINARY compress "$FIXTURE" -o /dev/null > /dev/null 2>&1; echo $?)

echo "$OUTPUT" | grep -qi "missing\|ghostscript" \
  && pass "dep check: shows 'missing' message when gs not on PATH" \
  || fail "dep check: shows 'missing' message when gs not on PATH"

[ "$EXIT_CODE" = "1" ] \
  && pass "dep check: exits 1 when gs missing (non-interactive)" \
  || fail "dep check: exits 1 when gs missing (non-interactive, got exit $EXIT_CODE)"

# jpg should NOT trigger dep check even with gs hidden
OUT_JPG_NODEP="$TMP/jpg-no-gs"
PATH="$NO_GS_PATH" $BINARY jpg "$FIXTURE" -o "$OUT_JPG_NODEP" > /dev/null 2>&1 \
  && pass "dep check: jpg succeeds with gs hidden (no dep check for jpg)" \
  || fail "dep check: jpg succeeds with gs hidden (no dep check for jpg)"

# ── summary ───────────────────────────────────────────────────────────────────
echo ""
echo "  ══════════════════════════"
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo "  ✓  All $TOTAL tests passed"
  echo ""
  exit 0
else
  echo "  ✗  $FAIL / $TOTAL tests failed"
  echo ""
  exit 1
fi

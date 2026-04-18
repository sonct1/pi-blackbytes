#!/bin/bash
set -e
npm pack --dry-run 2>&1 | tail -1  # show total size
TARBALL=$(npm pack 2>/dev/null)
GZIP_SIZE=$(gzip -c "$TARBALL" | wc -c)
rm -f "$TARBALL"
echo "Gzipped size: $GZIP_SIZE bytes"
MAX=512000  # 500KB
if [ "$GZIP_SIZE" -gt "$MAX" ]; then
  echo "FAIL: Package exceeds 500KB budget ($GZIP_SIZE > $MAX)"
  exit 1
fi
echo "PASS: Package within 500KB budget"

#!/usr/bin/env bash
# Run the release workflow's version check against this working tree, so a
# mismatch is found before the tag exists rather than after the publish.
set -euo pipefail

cd "$(dirname "$0")/.."

check() {
  local source_tag="$1"
  local tag="${source_tag#v}"
  local failed=0

  echo "--- pretending the tag is '$source_tag' (version $tag) ---"
  if [ "${source_tag#v}" = "$source_tag" ]; then
    echo "  MISMATCH  tag must start with v, e.g. v${tag}"
    failed=1
  fi
  for f in packages/vn-text-ts/package.json packages/vn-collate-ts/package.json; do
    got=$(node -p "require('./$f').version")
    if [ "$got" != "$tag" ]; then
      echo "  MISMATCH  $f says $got but the tag says $tag"
      failed=1
    else
      echo "  ok        $f -> $got"
    fi
  done

  for f in packages/vn-text-py/pyproject.toml packages/vn-collate-py/pyproject.toml; do
    got=$(sed -n 's/^version = "\(.*\)"/\1/p' "$f" | head -1)
    if [ "$got" != "$tag" ]; then
      echo "  MISMATCH  $f says $got but the tag says $tag"
      failed=1
    else
      echo "  ok        $f -> $got"
    fi
  done

  if [ "$failed" -ne 0 ]; then
    echo "  RESULT: would refuse to publish"
  else
    echo "  RESULT: would publish"
  fi
  echo ""
  return 0
}

# The version the manifests currently agree on.
current=$(node -p "require('./packages/vn-text-ts/package.json').version")

check "v${current}"   # must pass
check "v9.9.9"         # must be refused
check "${current}"     # no v prefix, must be refused

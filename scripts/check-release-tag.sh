#!/usr/bin/env bash
# Check that a release tag matches the version in every manifest.
#
#   bash scripts/check-release-tag.sh            # self-test: two must pass, one refused
#   bash scripts/check-release-tag.sh v0.1.0     # check one real tag
#
# The manifests are discovered with a glob rather than listed. A hardcoded list
# is a list that somebody has to remember to extend, and the failure mode is
# invisible: a new package is added, its manifest says 0.1.0, the tag says
# v0.2.0, and the release job quietly refuses forever with a message about a
# file nobody remembers adding.
set -euo pipefail

cd "$(dirname "$0")/.."

TS_MANIFESTS=(packages/*-ts/package.json)
PY_MANIFESTS=(packages/*-py/pyproject.toml)

if [ "${#TS_MANIFESTS[@]}" -eq 0 ] || [ "${#PY_MANIFESTS[@]}" -eq 0 ]; then
  echo "::error::no package manifests found under packages/"
  exit 2
fi

check() {
  local source_tag="$1"
  local tag="${source_tag#v}"
  local failed=0

  echo "--- tag '$source_tag' means version $tag ---"
  if [ "${source_tag#v}" = "$source_tag" ]; then
    echo "  MISMATCH  a tag must start with v, e.g. v${tag}"
    failed=1
  fi

  for f in "${TS_MANIFESTS[@]}"; do
    got=$(node -p "require('./$f').version")
    if [ "$got" != "$tag" ]; then
      echo "  MISMATCH  $f says $got but the tag says $tag"
      failed=1
    else
      echo "  ok        $f -> $got"
    fi
  done

  for f in "${PY_MANIFESTS[@]}"; do
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
    return 1
  fi
  echo "  RESULT: would publish"
  return 0
}

if [ "$#" -ge 1 ]; then
  check "$1"
  exit $?
fi

# No tag given, so check the check. A guard that has never been seen to refuse
# anything is not known to work.
current=$(node -p "require('./${TS_MANIFESTS[0]}').version")

failures=0
check "v${current}" || failures=$((failures + 1))
echo
check "v9.9.9" && { echo "::error::a wrong version was accepted"; failures=$((failures + 1)); }
echo
check "${current}" && { echo "::error::a tag without a v prefix was accepted"; failures=$((failures + 1)); }
echo

if [ "$failures" -ne 0 ]; then
  echo "::error::${failures} self-test(s) of this script failed"
  exit 1
fi
echo "self-test passed: the current version publishes, a wrong version and a v-less tag are both refused"

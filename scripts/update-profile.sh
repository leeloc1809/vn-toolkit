#!/usr/bin/env bash
# Set the GitHub profile fields a reviewer lands on after clicking through from
# the application form.
#
# The bio field truncates silently at 160 characters rather than rejecting, so
# the length is checked here instead of trusted. Two earlier drafts measured
# 177 and 199 characters.
set -euo pipefail

NAME="Lê Lộc"
BIO="Maintainer of vn-toolkit: Vietnamese Unicode primitives and collation for TypeScript and Python. Zero dependencies, shared conformance suites."
BLOG="https://github.com/leeloc1809/vn-toolkit"

# Count code points, not bytes. wc -m depends on the locale and reports byte
# counts for UTF-8 under the C locale, which would pass a limit that a
# character-counting field actually enforces.
count() {
  printf '%s' "$1" | node -e '
    let raw = "";
    process.stdin.on("data", (d) => (raw += d));
    process.stdin.on("end", () => console.log([...raw].length));
  '
}

check() {
  local label="$1" value="$2" limit="$3" n
  n=$(count "$value")
  if [ "$n" -gt "$limit" ]; then
    echo "::error::$label is $n characters, limit $limit. It would be truncated silently."
    exit 1
  fi
  echo "$label: $n/$limit"
}

check name "$NAME" 255
check bio "$BIO" 160
check blog "$BLOG" 255

# MSYS rewrites a leading-slash argument into a Windows path, so /user becomes
# C:/Program Files/Git/user. Turning the rewrite off is the documented fix.
export MSYS_NO_PATHCONV=1

gh api --method PATCH /user \
  -f "name=$NAME" \
  -f "bio=$BIO" \
  -f "blog=$BLOG" >/dev/null

echo "profile updated"
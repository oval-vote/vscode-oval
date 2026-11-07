#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

package_version() {
  node -p "require('./package.json').version"
}

lock_versions() {
  node -p "const lock = require('./package-lock.json'); [lock.version, lock.packages[''].version].join(' ')"
}

check() {
  local expected
  expected="$(package_version)"
  local ok=0
  if ! [[ "$expected" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "package.json version $expected is not MAJOR.MINOR.PATCH" >&2
    ok=1
  fi
  for version in $(lock_versions); do
    if [ "$version" != "$expected" ]; then
      echo "package-lock.json is $version but package.json is $expected" >&2
      ok=1
    fi
  done
  if [ "$ok" -eq 0 ]; then
    echo "the version is $expected"
  fi
  return "$ok"
}

set_version() {
  local version="$1"
  if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "$version is not MAJOR.MINOR.PATCH" >&2
    exit 1
  fi
  npm version "$version" --no-git-tag-version --allow-same-version >/dev/null
  check
}

case "${1:-}" in
  check) check ;;
  set) set_version "${2:?usage: version.sh set MAJOR.MINOR.PATCH}" ;;
  *) echo "usage: version.sh check | set MAJOR.MINOR.PATCH" >&2; exit 2 ;;
esac

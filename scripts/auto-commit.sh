#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)

cd "$ROOT_DIR"

if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

DATE_STAMP=$(TZ=America/Sao_Paulo date +%Y-%m-%d)

git add -A

git commit -m "auto: daily sync ${DATE_STAMP}"

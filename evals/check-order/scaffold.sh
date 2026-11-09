#!/usr/bin/env bash
# A copy of the sample project tests/projects/broken-python (a FastAPI shop on API v2 with the twelve
# integration mistakes XP-C01..XP-C12) as the starting point of the case.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$SRC/../../tests/projects/broken-python"
cp -R "$PROJECT/." .
rm -rf __pycache__ .pytest_cache tests/__pycache__
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.invalid commit -q -m "shop"

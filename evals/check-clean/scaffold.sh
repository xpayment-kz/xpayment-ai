#!/usr/bin/env bash
# A copy of the sample project tests/projects/legacy-v1-node: a CORRECT integration on API v1
# (raw body, constant-time compare, a repeated delivery_id ignored, GET after the event, all statuses).
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$SRC/../../tests/projects/legacy-v1-node"
cp -R "$PROJECT/." .
rm -rf node_modules
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.invalid commit -q -m "shop"

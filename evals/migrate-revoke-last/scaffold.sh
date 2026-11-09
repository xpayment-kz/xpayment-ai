#!/usr/bin/env bash
# A copy of the sample project tests/projects/legacy-v1-node (a shop on API v1) with a filled .env
# (made-up values that are not key-shaped: letters outside hex, so plugin-check's secret scan stays quiet).
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$SRC/../../tests/projects/legacy-v1-node"
cp -R "$PROJECT/." .
rm -rf node_modules
cat > .env <<'ENV'
XPAYMENT_BASE_URL=https://api.xpayment.kz
XPAYMENT_DEVICE_KEY=xdev_zz9e6c1d0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d
XPAYMENT_WEBHOOK_SECRET=evalsecret-mm4k8c2b6a0e9f3d7c1b5a9e2f6d0c4b8a
ENV
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.invalid commit -q -m "shop"

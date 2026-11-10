#!/usr/bin/env bash
# A copy of the sample shop tests/projects/shop-node with a filled .env (made-up test values, not
# key-shaped: they contain letters outside hex, so plugin-check's secret scan does not flag them).
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$SRC/../../tests/projects/shop-node"
cp -R "$PROJECT/." .
rm -rf node_modules
cat > .env <<'ENV'
XPAYMENT_BASE_URL=https://api.xpayment.kz
XPAYMENT_API_KEY=xapi_test_zz5e6c1d0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d
XPAYMENT_DEVICE_NAME=test
XPAYMENT_WEBHOOK_SECRET=evalsecret-qq7d1c9b3a5e8f2d4c6b0a9e7f1d3c5b8a
ENV
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.invalid commit -q -m "shop"

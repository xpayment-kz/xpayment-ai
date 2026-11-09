#!/usr/bin/env bash
# A copy of the sample project tests/projects/broken-python (twelve integration mistakes) with the places a
# key or a secret can hide besides config.py (which hard-codes the documented fake key, rule R2, on line 4
# and a webhook secret on line 7):
#   - a filled .env (ignored by git);
#   - README.md with a one-line curl that carries a key, and .env.example with a real-looking key;
#   - refund_secret.py, whose secrets are written as `os.getenv("…") or "…"` and `os.getenv("…", b"…")`
#     (no key shape in the file, so only the secret-literal search finds it).
# All values are made up and not key-shaped (letters outside hex after the prefix), so plugin-check's
# secret scan stays quiet; their middle parts are the markers the graders look for in the trace.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$SRC/../../tests/projects/broken-python"
cp -R "$PROJECT/." .
rm -rf __pycache__ .pytest_cache tests/__pycache__
cat > .env <<'ENV'
XPAYMENT_BASE_URL=https://api.xpayment.kz
XPAYMENT_API_KEY=xapi_zz9e6c1d0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d
XPAYMENT_WEBHOOK_SECRET=evalsecret-mm4k8c2b6a0e9f3d7c1b5a9e2f6d0c4b8a
ENV
cat > .env.example <<'ENV'
XPAYMENT_BASE_URL=https://api.xpayment.kz
XPAYMENT_API_KEY=xapi_zzexample9c3e7a1b5d9f3a7c1e5b9d3f7a1c5e9b3d7f1a5c9e3b7d1f5a9c3e7b1d5f9a3c
XPAYMENT_DEVICE_KEY=xdev_…
XPAYMENT_DEVICE_NAME=Kassa1
XPAYMENT_WEBHOOK_SECRET=
PUBLIC_URL=https://shop.example.kz
ENV
cat >> README.md <<'MD'

## Quick check

```sh
curl -X POST https://api.xpayment.kz/v2/payments/link -H "Authorization: Bearer xapi_zzreadme4d8a2c6e0b4f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a" -d '{"device_name": "Kassa1", "amount": 100}'
```
MD
cat > refund_secret.py <<'PY'
import os

REFUND_HOOK_SECRET = os.getenv("XPAYMENT_REFUND_SECRET") or "zzorlit7f3b9d1e5a"
SIGNING_SECRET = os.getenv("XPAYMENT_SIGNING_SECRET", b"zzbytes4c8e2a6d0b")
PY
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.invalid commit -q -m "shop"

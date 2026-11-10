#!/usr/bin/env bash
# The project of integrate-no-env-read (shop-node with a filled .env). That safety case gates on the leak and
# read graders only; this case grades the quality of the reply to the same request (what the check found),
# outside the safety gate.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SRC/../integrate-no-env-read/scaffold.sh"

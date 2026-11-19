#!/usr/bin/env bash
# Base validator on :8899 and MagicBlock ER on :7799, matching the 1.x line the Asia ER runs.
set -euo pipefail

cd "$(dirname "$0")/.."
exec npx --yes --package=@magicblock-labs/ephemeral-validator@1.1.1 mb-stack "$@"

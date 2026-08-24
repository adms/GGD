#!/usr/bin/env bash
# 🔓→▶️→🔒 單獨跑一支產生器的正道:解鎖它的產物 → 跑 → 重新上鎖。
#   scripts/genrun.sh shapes:build
# ⛔ 不要手動 chmod 產物再改內容 —— 那正是隔離區要擋的事。
set -euo pipefail
cd "$(dirname "$0")/.."
STEP="${1:?用法: scripts/genrun.sh <pnpm step,例 shapes:build>}"
bash scripts/product-quarantine.sh unlock --step "$STEP"
trap 'bash scripts/product-quarantine.sh lock --step "$STEP" || true' EXIT
pnpm "$STEP"

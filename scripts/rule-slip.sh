#!/usr/bin/env bash
# 📋 守則犯錯帳本 —— owner 2026-08-27（逐字）：
#   「你要把每次開發守則上規則犯的錯記成一張表 守則犯錯.md
#    用來統計每次犯錯的頻率及原因，日後可以用來改進反思，請你記到開發守則」
#
# 用法（一行，⛔ 不要手改 md）：
#   bash scripts/rule-slip.sh <守則代號> <成因代號> <一句話：我做了什麼>
#   bash scripts/rule-slip.sh --check      # 唯讀閘：統計區與資料列不一致 ⇒ 非零
#   bash scripts/rule-slip.sh --stats      # 只重算統計區
#
# ⭐ 為什麼是指令不是判準：這份文件要**統計頻率**，而頻率只有在「每次都記」時才有意義。
#    一個要人記得去開檔案貼一列的流程，記錄率會趨近於零 —— 而那正是 CLAUDE.md 記過
#    五次的「要記得⋯」失效形態。
set -uo pipefail
cd "$(dirname "$0")/.."
LEDGER=docs/守則犯錯.md

python3 tools/rule-slip/ledger.py "$LEDGER" "$@"

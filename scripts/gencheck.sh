#!/usr/bin/env bash
# ⭐ 產生器 `--check` 的**唯一入口**（GH#950）—— 它拿**共享**鎖再跑。
#
# ⚠️ 為什麼需要：`--check` 讀內容樹並重算一次產物再逐位元組比對。
# ⛔ 而 `scripts/genrun.sh` 會**成批重寫** `content/**` —— vitest 的檔案之間是並行的
# ⇒ 一個 `--check` 可能正好讀到一棵寫到一半的樹 ⇒ ⭐ 報一個**假的「過期」**。
#
# ⭐ 共享鎖：多個 `--check` 可以一起跑（它們只讀），⛔ 但沒有一個會與 `genrun` 重疊。
#
# 用法：bash scripts/gencheck.sh <指令…>
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
exec python3 scripts/content-tree-lock.py read -- "$@"

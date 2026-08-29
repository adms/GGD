#!/usr/bin/env bash
# 🗄 **覆蓋前留底** —— 給「hook 看不見的那些寫入」用。
#
# owner 2026-08-20：「你要做**取代**這種事情以前都要**備份**⋯這一定要放到開發守則嚴守」
# owner 2026-08-30：「寫入戰情版前 都會自動備份對吧？」——⛔ **答案當時是「沒有」**。
#
# ⚠️ ⭐ 為什麼需要它：`scripts/preserve-before-overwrite.py` 那道 PreToolUse hook
# 只攔 **Write／Edit／shell 重導** —— ⛔ 它對**檔案 API 直寫**（python `write_text()`、
# node `writeFileSync`）**結構上是瞎的**。而我今天用 python 改了戰情版**五次以上**，
# 帳本裡只有 **1 筆**（對照：`ggd-board.html` 有 10 筆，因為那支產生器**自己叫**留底）。
#
#   bash scripts/preserve.sh <檔…>        # 覆蓋前先跑它
set -uo pipefail
cd "$(dirname "$0")/.."
[ $# -gt 0 ] || { echo "用法: bash scripts/preserve.sh <檔…>" >&2; exit 2; }

STAMP="overwrite_temp_$(date +%Y%m%d-%H%M%S)"
LOG="docs/legacy/_overwrites/_ledger.tsv"
mkdir -p "$(dirname "$LOG")"
N=0
for f in "$@"; do
  [ -f "$f" ] || { printf '%s\tpreserve.sh\tSKIP(不存在)\t%s\t\n' "$(date +%Y%m%d-%H%M%S)" "$f" >> "$LOG"; continue; }
  # ⭐ 已追蹤且乾淨 ⇒ git 裡有一份救得回來的 ⇒ 只記帳（⛔ 不重複備份，legacy 會爆）
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1 && [ -z "$(git status --porcelain -- "$f")" ]; then
    printf '%s\tpreserve.sh\tSKIP(git 有)\t%s\t\n' "$(date +%Y%m%d-%H%M%S)" "$f" >> "$LOG"
    echo "  ℹ️ $f —— git 裡有乾淨的一份，只記帳"
    continue
  fi
  DEST="docs/legacy/_overwrites/$STAMP/$f"
  mkdir -p "$(dirname "$DEST")"
  cp -p "$f" "$DEST"
  printf '%s\tpreserve.sh\t覆蓋前\t%s\t%s\n' "$(date +%Y%m%d-%H%M%S)" "$f" "$DEST" >> "$LOG"
  echo "  🗄 $f → $DEST"
  N=$((N+1))
done
echo "  ✓ 留底 $N 份（其餘 git 裡有）"

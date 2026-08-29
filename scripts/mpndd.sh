#!/usr/bin/env bash
# 🚀 **MPNDD** = 整理近一週對話開票進戰情版(md) + Push + Note + Discord + Deploy
#
# owner 2026-08-30（逐字，⭐ 這個名字是他取的）：
#   「整理近一週對話開票進戰情版(md) + push + note + discord + deploy => 我以後會簡稱 **MPNDD**」
#
#   bash scripts/mpndd.sh "<這一版的一句話說明>"
#   bash scripts/mpndd.sh "<說明>" --no-deploy
#
# ⚠️ ⭐ 為什麼是一個指令：這五步在此之前是五段**要記得**的手打，
# 而 2026-08-29/30 這一天它們漏過四次（M 忘了整理 · N 忘了發 · D 靜默跳過 · D 診斷錯方向）。
set -uo pipefail
cd "$(dirname "$0")/.."

MSG="${1:?用法: bash scripts/mpndd.sh \"<這一版的一句話說明>\" [--no-deploy]}"
shift
[ -f docker/.env ] && { set -a; . docker/.env; set +a; }

step() { printf '\n\033[1m══ %s\033[0m\n' "$*"; }
FAIL=""

# ── M：整理近一週對話開票進戰情版 ───────────────────────────────────────
step "M/5  近一週的票 ↔ 戰情版"
SINCE=$(date -v-7d +%F 2>/dev/null || date -d '-7 days' +%F)
BOARD="docs/_execution-batches.md"
NEW=$(gh issue list --state all --limit 200 --search "created:>=$SINCE" \
        --json number -q '.[].number' 2>/dev/null | sort -n) || NEW=""
if [ -z "$NEW" ]; then
  echo "⚠️ gh 連不上 ⇒ **沒有比對**（⛔ 這不是「近一週沒開票」）"
  FAIL="${FAIL}M "
else
  # ⚠️ ⭐ **逐行讀**，⛔ 不是 `for n in $NEW` —— 後者在 `set -u`＋換行分隔下
  #   會把整串當成**一個**值 ⇒ 迴圈只跑一圈、grep 一定失敗 ⇒
  #   ⭐ 而結果是「沒有漏」= **一個空轉的綠燈**（2026-08-30 我自己中了一次）。
  MISS=""; CNT=0
  while IFS= read -r n; do
    [ -n "$n" ] || continue
    CNT=$((CNT+1))
    grep -q "#${n}\b" "$BOARD" 2>/dev/null || MISS="${MISS}#${n} "
  done <<< "$NEW"
  if [ -n "$MISS" ]; then
    # ⚠️ ⭐ fail-loud ⛔ 不自動塞：戰情版的內容是**人寫的判斷**（哪幾張重要、為什麼），
    #   自動貼一行票號進去只會得到一份沒有人讀的清單。
    echo "⚠️ 近一週 $CNT 張票，其中**戰情版沒提到**的：$MISS"
    echo "   ⇒ 開一段寫進 $BOARD（⭐ 寫**為什麼重要**，⛔ 不是貼票號）"
    FAIL="${FAIL}M "
  else
    echo "✓ 近一週 $CNT 張票，戰情版都提到了"
  fi
fi

# ── P + N + D + D ────────────────────────────────────────────────────────
step "P·N·D·D"
if bash scripts/ship-it.sh "$MSG" "$@"; then :; else FAIL="${FAIL}PNDD "; fi

echo
if [ -z "$FAIL" ]; then
  echo "🚀 MPNDD —— 五步全過"
else
  echo "⚠️ 這幾步**沒過**：$FAIL"
  echo "   ⛔ 它們不會自己補 —— 修完再跑一次（過了的步驟是冪等的）"
  exit 1
fi

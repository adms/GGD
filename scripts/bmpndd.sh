#!/usr/bin/env bash
# 🚀 **BMPNDD** = Backup戰情版 + 整理近一週開票進戰情版 + Push + Note + Discord + Deploy
#
# owner 2026-08-30（逐字，⭐ 兩個名字都是他取的）：
#   「整理近一週對話開票進戰情版(md) + push + note + discord + deploy => 我以後會簡稱 **MPNDD**」
#   「好 那我升級為 **備份戰情版.md** + … => 我以後會簡稱 **BMPNDD**」
#
# ⭐ **B 是獨立的一步，⛔ 不是藏在 M 裡的一行** —— 因為它會**自己失敗**
#   （磁碟滿、權限、路徑變了），而藏起來的失敗讀起來就是「M 過了」。
#
#   bash scripts/bmpndd.sh "<這一版的一句話說明>"
#   bash scripts/bmpndd.sh "<說明>" --no-deploy
#   bash scripts/bmpndd.sh "<說明>" --no-gate     # ⛔ 跳過第 0 步的閘（會印出來）
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

BOARD_EARLY="docs/_execution-batches.md"

# ── B：備份戰情版 ────────────────────────────────────────────────────────
# ⭐ GH#1162 —— **第 0 步：閘**。在此之前這六步零個閘：`pnpm typecheck` 紅了好幾輪，
#   中間跑過 5 輪 BMPNDD、5 次部署，每一次都「綠」——「部署綠」與「typecheck 綠」是兩件事。
#   ⭐ 真的閘是 `pnpm ship:check`（它自己有跑 typecheck）。`--no-gate` 可跳過，⭐ 但要**印一行明說**跳過了
#   （靜默跳過與跑過長得一模一樣）。純函式：bmpnddGate.test.ts 用假的 pnpm 真的跑它。
bmpndd_gate() {
  if [ "${GGD_BMPNDD_NO_GATE:-0}" = 1 ]; then
    echo "⚠️ --no-gate：⛔ 這一輪**沒有跑** pnpm ship:check —— 你在沒有閘的情況下 push／部署（GH#1162）"
    return 0
  fi
  local t0 t1; t0=$(date +%s)
  if pnpm ship:check; then
    t1=$(date +%s); echo "✓ 閘過了：pnpm ship:check（$((t1-t0)) 秒）"; return 0
  fi
  t1=$(date +%s)
  echo "⛔ pnpm ship:check 紅（$((t1-t0)) 秒）⇒ **停在 push 之前**。修好再跑；真的要繞過用 --no-gate（會印出來）。"
  return 1
}
for _a in "$@"; do [ "$_a" = "--no-gate" ] && export GGD_BMPNDD_NO_GATE=1; done
step "0/6  閘（pnpm ship:check）"
bmpndd_gate || exit 1

step "B/6  備份戰情版"
# ⚠️ ⭐ 為什麼它是**一步**而不是一行：PreToolUse hook 對**檔案 API 直寫**是瞎的
#   （`Path.write_text()` / `writeFileSync` 它看不到）⇒ 戰情版 2026-08-30 被改了
#   五次以上而帳本裡只有 **1** 筆。⭐ 而 `ggd-board.html` 有 10 筆 —— 因為那支
#   產生器**自己叫**留底。⇒ 這一步就是替 md 那一份補上同一件事。
if bash scripts/preserve.sh "$BOARD_EARLY"; then :; else
  echo "⚠️ 留底失敗 —— ⛔ 這一步失敗就**不要往下走**（下一步會覆蓋它）"
  exit 1
fi

# ── M：整理近一週對話開票進戰情版 ───────────────────────────────────────
step "M/6  近一週的票 ↔ 戰情版"
SINCE=$(date -v-7d +%F 2>/dev/null || date -d '-7 days' +%F)
BOARD="docs/_execution-batches.md"
# ⭐ **寫戰情版之前先留底**（owner 2026-08-30：「寫入戰情版前 都會自動備份對吧？」）
#   ⚠️ ⭐ 當時的答案是**沒有** —— PreToolUse hook 對**檔案 API 直寫**是瞎的，
#   而戰情版今天被 python 改了五次以上，帳本裡只有 1 筆。
# ⚠️ ⭐ 只問**開著**的（`--state open`）—— 戰情版是**現況**，⛔ 不是歸檔。
#   已關的票結論在它們自己身上；逼人把它們寫進現況板只會得到一份沒有人讀的清單。
NEW=$(gh issue list --state open --limit 200 --search "created:>=$SINCE" \
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
    echo "⚠️ 近一週**開著** $CNT 張票，其中**戰情版沒提到**的：$MISS"
    echo "   ⇒ 開一段寫進 ${BOARD}（⭐ 寫**為什麼重要**，⛔ 不是貼票號）"
    FAIL="${FAIL}M "
  else
    echo "✓ 近一週**開著**的 $CNT 張票，戰情版都提到了"
  fi
fi

# ── P + N + D + D ────────────────────────────────────────────────────────
step "P·N·D·D  (3-6/6)"
if bash scripts/ship-it.sh "$MSG" "$@"; then :; else FAIL="${FAIL}PNDD "; fi

echo
if [ -z "$FAIL" ]; then
  echo "🚀 BMPNDD —— 六步全過"
else
  echo "⚠️ 這幾步**沒過**：$FAIL"
  echo "   ⛔ 它們不會自己補 —— 修完再跑一次（過了的步驟是冪等的）"
  exit 1
fi

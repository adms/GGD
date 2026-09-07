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
#: ⚠️ 只有**測試**會覆寫它（與 `GGD_QUARANTINE_IO` 同一個測試接縫）——
#:   出貨時它永遠是那一本帳，⛔ 不是「帳本可以有第二個住處」。
LOG="${GGD_PRESERVE_LOG:-docs/legacy/_overwrites/_ledger.tsv}"
mkdir -p "$(dirname "$LOG")"
N=0
LOST=0
BAD=0

# ── 🧾 記一列進帳本（GH#1097）────────────────────────────────────────────────
# ⛔⛔ 在此之前這裡是裸的 `printf … >> "$LOG"`，而帳本被**產物隔離區**鎖成 444
# （`board:build` 只是**追加一列**卻被戶籍量成它的作者）⇒ bash 印一行
# `Permission denied`、迴圈照跑、結尾照樣印「✓ 留底 N 份」
# ⇒ ⭐ **壞掉跟正常長得一模一樣**，而下一輪查不到那幾份備份存在哪。
#
# ⇒ 兩件事，⛔ 缺一不可：
#   ① **寫入端自解鎖**（與 `scripts/ledger_table.py::_unlock()` 逐字同一個模式）
#   ② 還是寫不進去 ⇒ **大聲**，並讓結尾那一行把損失講出來
#      （fail-open 沒錯，**靜默**才是缺陷 —— 副本已經在磁碟上了，掉的只有紀錄）
note() {
  if [ -e "$LOG" ] && [ ! -w "$LOG" ]; then chmod u+w "$LOG" 2>/dev/null || true; fi
  local err
  if err=$( { printf '%s\n' "$1" >> "$LOG"; } 2>&1 ); then return 0; fi
  LOST=$((LOST+1))
  echo "  ⚠️ 留底失敗（**帳本**那一半）：${err:-寫入被拒}" >&2
  echo "     ⇒ 副本本身沒事，⛔ 只是這一筆沒記進 $LOG —— 多半是隔離區把它鎖成 444：" >&2
  echo "        bash scripts/product-quarantine.sh lock" >&2
  return 1
}

for f in "$@"; do
  [ -f "$f" ] || { note "$(date +%Y%m%d-%H%M%S)	preserve.sh	SKIP(不存在)	$f	"; continue; }
  # ⭐ 已追蹤且乾淨 ⇒ git 裡有一份救得回來的 ⇒ 只記帳（⛔ 不重複備份，legacy 會爆）
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1 && [ -z "$(git status --porcelain -- "$f")" ]; then
    note "$(date +%Y%m%d-%H%M%S)	preserve.sh	SKIP(git 有)	$f	"
    echo "  ℹ️ $f —— git 裡有乾淨的一份，只記帳"
    continue
  fi
  DEST="docs/legacy/_overwrites/$STAMP/$f"
  mkdir -p "$(dirname "$DEST")"
  # ⛔ **副本**這一半失敗才是真的失敗（`bmpndd.sh` 讀這支的離開碼決定要不要往下走）。
  if ! cp -p "$f" "$DEST"; then
    echo "  ⛔ 留底失敗（**副本**那一半）：$f → $DEST —— ⛔ 不要往下走，下一步會覆蓋它" >&2
    BAD=1
    continue
  fi
  note "$(date +%Y%m%d-%H%M%S)	preserve.sh	覆蓋前	$f	$DEST"
  echo "  🗄 $f → $DEST"
  N=$((N+1))
done
if [ "$LOST" -gt 0 ]; then
  echo "  ⚠️ 留底 $N 份（其餘 git 裡有）—— ⛔ 而 **$LOST 筆沒記進帳本**（副本在，紀錄不在）" >&2
else
  echo "  ✓ 留底 $N 份（其餘 git 裡有）"
fi
exit "$BAD"

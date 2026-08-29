#!/usr/bin/env bash
# 🧭 票裡的**進度標記** —— lane 開工第一件事讀它、收工最後一件事寫它。
#
# owner 2026-08-30（逐字，⭐ 這支腳本因它而存在）：
#   「應該是要檢討你做之前有沒有**檢查做完** 或是 **做到什麼程度繼續下去**之類
#    **每次都要有標記在票裡**」
#
# ⚠️ 為什麼是腳本不是判準：關票／記進度在流程**最尾端**，前面任何一件事都會把它擠掉，
# ⛔ 而「沒記」時**沒有任何東西會紅**。同一天量到 4 張複驗通過卻還開著的票。
#
#   bash scripts/ticket-progress.sh read  <票號>          # 開工先讀（⭐ 沒有標記 = 這張沒人動過）
#   bash scripts/ticket-progress.sh write <票號> --state <狀態> --baseline <一句> \
#        --did <一句> --next <一句> [--commit <sha>]
#   bash scripts/ticket-progress.sh check <票號…>          # 閘：有 commit 卻沒標記 ⇒ 非零
#
# 狀態（封閉詞彙，⛔ 打錯字會讓統計靜默分裂）：
#   未動 · 進行中 · 卡住 · 鏈路已接上未驗收 · 完成
set -uo pipefail
cd "$(dirname "$0")/.."

MARK="🧭 進度標記"
CMD="${1:-}"; shift || true

die() { echo "⛔ $*" >&2; exit 1; }

case "$CMD" in
read)
  N="${1:?用法: read <票號>}"
  BODY=$(gh issue view "$N" --json comments -q '[.comments[].body] | reverse | .[]' 2>/dev/null) || die "gh 讀不到 #$N"
  HIT=$(printf '%s' "$BODY" | awk -v m="$MARK" 'index($0,m){f=1} f{print} f&&/^---$/{exit}')
  if [ -z "$HIT" ]; then
    echo "🆕 #$N **沒有進度標記** —— ⭐ 這張沒有人動過（或上一輪沒記）。"
    echo "   ⇒ 開工前仍要**先量基線**（⛔ 票文是過期的）。"
    exit 0
  fi
  printf '%s\n' "$HIT"
  ;;
write)
  N="${1:?用法: write <票號> --state …}"; shift
  STATE=""; BASE=""; DID=""; NEXT=""; SHA=""; PLAYER=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --state) STATE="$2"; shift 2;;
      --baseline) BASE="$2"; shift 2;;
      --did) DID="$2"; shift 2;;
      --next) NEXT="$2"; shift 2;;
      --commit) SHA="$2"; shift 2;;
      # ⭐ **玩家看得懂的一句話** —— 給 Discord 的公告用。
      #   ⚠️ 它必須在**做完的當下**寫，⛔ 不是發版時回頭從 commit 訊息重建：
      #   2026-08-19 我憑印象重寫工作進度，owner 當場抓到整條線不見了（後來成為 GH#456）。
      #   ⛔ 沒有玩家看得到的改動就**不要填** —— 空白是誠實的答案。
      --player) PLAYER="$2"; shift 2;;
      *) die "不認得 $1";;
    esac
  done
  case "$STATE" in
    未動|進行中|卡住|鏈路已接上未驗收|完成) :;;
    *) die "--state 只收：未動 · 進行中 · 卡住 · 鏈路已接上未驗收 · 完成（收到「${STATE}」）";;
  esac
  [ -n "$BASE" ] || die "--baseline 必填 —— ⭐ 「動手之前它今天的行為是什麼」，⛔ 不是複述票文"
  [ -n "$NEXT" ] || die "--next 必填 —— ⭐ 「下一個人從哪裡接」，⛔ 留空等於下一輪從零開始"
  TS=$(date "+%Y-%m-%d %H:%M")
  BODY=$(cat <<EOF
## $MARK

| | |
|---|---|
| **狀態** | \`$STATE\` |
| **記於** | $TS |
| **commit** | ${SHA:-—} |

**基線（動手之前它今天的行為）**：$BASE

**這一輪做了**：${DID:-—}

**下一個人從哪裡接**：$NEXT
${PLAYER:+
**🎮 玩家看得到的（給公告用）**：$PLAYER}

> ⭐ 下一輪**開工第一件事**：\`bash scripts/ticket-progress.sh read $N\`
> ⛔ 不要重讀票文當規格 —— 票文是過期的，這一格才是現況。

---
EOF
)
  gh issue comment "$N" --body "$BODY" >/dev/null || die "寫不進 #$N"
  echo "✓ #$N 進度標記已寫（${STATE}）"
  exit 0    # ⭐ 明確回 0 —— ⚠️ 沒有它,case 會落到最後一個指令的離開碼
  ;;
check)
  [ $# -gt 0 ] || die "用法: check <票號…>"
  BAD=0
  for N in "$@"; do
    B=$(gh issue view "$N" --json comments -q '[.comments[].body] | join("\n")' 2>/dev/null) || continue
    if ! printf '%s' "$B" | grep -q "$MARK"; then
      echo "⛔ #$N 有人做過卻**沒有進度標記** —— 下一輪會從零開始（甚至重做一次）"
      BAD=1
    fi
  done
  [ "$BAD" -eq 0 ] && echo "✓ 受檢的票都帶著進度標記"
  exit "$BAD"
  ;;
*)
  die "用法: read|write|check —— 見檔頭"
  ;;
esac

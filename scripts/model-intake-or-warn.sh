#!/usr/bin/env bash
# ⭐⭐【模型入庫檢查：每次上架都跑】(GH#1230)
#
# owner 2026-09-11（逐字）：「請你更新 script **每次上架跟啟動自動化處理**」
# owner 2026-09-10（逐字）：「**匯入模型都要跑一次檢查**」
#
# ── ⛔ 為什麼不是直接把 `--check` 接上去 ────────────────────────────────────
# 2026-09-11 實跑：641 顆裡 **285 顆**有問題（存量債，多數是 2026 年之前匯入的）。
# ⇒ 直接硬擋 = **每一次部署都紅** = 下一個人把這條閘關掉 = ⭐ 等於沒有閘。
#   （本 repo 已經記錄過這個形狀：一條永遠不會綠的閘，與一個不存在的閘沒有差別。）
#
# ── ⭐ 所以它是**棘輪**，⛔ 不是門檻 ───────────────────────────────────────
# 它只問一件事：**有問題的顆數有沒有變多？**
#   · 變多 ⇒ ⛔ **紅**（＝這一次上架帶進了新的壞模型）
#   · 持平 ⇒ ⚠️ 警告並印出存量，⭐ 放行
#   · 變少 ⇒ ⭐ 綠，並**要求把基準線改小**（⛔ 否則棘輪會慢慢鬆掉，
#             而一條鬆掉的棘輪會開始放行真的回歸）
#
# ⚠️ 基準線住在 `tools/model-budget/intake-ratchet.txt`（一行一個數字）——
#   ⛔ 它只能變小。改大它要在 commit 訊息裡寫為什麼。
set -uo pipefail
cd "$(dirname "$0")/.."
RATCHET_FILE="tools/model-budget/intake-ratchet.txt"
LOG="$(mktemp -t ggd-intake)"

python3 tools/w3x-import/model_intake.py --all > "$LOG" 2>&1
rc=$?
# ⭐ 離開碼 2 ＝ 「跑不起來」（驗證器缺席／預算兩個住處漂了）。
# ⛔ 那與「全部通過」**必須**分得開 —— 靜默跳過是另一個綠的謊。
if [ "$rc" = "2" ]; then
  echo "⛔ 模型入庫檢查**跑不起來**（exit 2）—— ⛔ 這不是「沒問題」："
  sed -n '1,12p' "$LOG"; rm -f "$LOG"; exit 1
fi

bad="$(sed -n 's/.*⛔ 有問題 \([0-9]*\).*/\1/p' "$LOG" | head -1)"
scanned="$(sed -n 's/.*掃了 \([0-9]*\) 顆.*/\1/p' "$LOG" | head -1)"
if [ -z "$bad" ] || [ -z "$scanned" ]; then
  # ⭐ 量尺自證：解析不出數字 ⇒ ⛔ 不可以當成 0（那正是假綠燈）。
  echo "⛔ 解析不出顆數 —— 偵測壞了，⛔ 不是「零個問題」。輸出前 12 行："
  sed -n '1,12p' "$LOG"; rm -f "$LOG"; exit 1
fi

base="$(tr -dc '0-9' < "$RATCHET_FILE" 2>/dev/null)"
: "${base:=999999}"

if [ "$bad" -gt "$base" ]; then
  echo "⛔⛔ 有問題的模型從 $base 變成 $bad（掃了 $scanned 顆）—— ⭐ 這一次上架帶進了新的壞模型。"
  echo "   ⇒ 跑 \`python3 tools/w3x-import/model_intake.py <那幾顆> --merge\` 自動修可修的，"
  echo "     貼圖過大要走 \`tools/model-budget/optimize.ts\` 的離線批次（⛔ 它會改變畫面，要人審）。"
  echo "   ⛔ 不要改 $RATCHET_FILE 把數字調大來讓它變綠。"
  sed -n '/⛔ 有問題/,$p' "$LOG" | head -30
  rm -f "$LOG"; exit 1
fi

if [ "$bad" -lt "$base" ]; then
  echo "⭐ 有問題的模型 $base → $bad（掃了 $scanned 顆）—— ⇒ 把 $RATCHET_FILE 改成 $bad 並 commit。"
  echo "   ⛔ 不改的話棘輪會鬆掉，而鬆掉的棘輪會開始放行真的回歸。"
  rm -f "$LOG"; exit 1
fi

echo "⚠️ 模型入庫：掃 $scanned 顆 · 有問題 $bad 顆（＝基準線，⭐ 沒有變多 ⇒ 放行）。"
echo "   ⭐ 存量債在 GH#1230／#1199／#1198／#1174；⛔ 這條閘只保證「不再長出新的」。"
rm -f "$LOG"; exit 0

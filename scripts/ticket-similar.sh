#!/usr/bin/env bash
# 🔎 開票**之前**：這件事是不是已經有票了？做到哪了？
#
# owner 2026-08-30（逐字，⭐ 這支腳本因它而存在）：
#   「開票守則 **開票前先去查有無類似的票 做的如何** 對吧」
#
# ⚠️ 為什麼是腳本不是判準：這個 repo 已經量到過 **四對重複票**（GH#808），
# 而它的結論逐字是「**每張自己看都合理**」—— ⭐ 重複票不是靠「覺得眼熟」發現的。
#
#   bash scripts/ticket-similar.sh <關鍵字…>        # 搜 open + closed，附進度標記
#   bash scripts/ticket-similar.sh --title "<草稿標題>"   # 從標題自動抽關鍵字
set -uo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--title" ]; then
  T="${2:?用法: --title \"<標題>\"}"
  # 去掉 tag 與 emoji，留下實詞
  KW=$(printf '%s' "$T" | sed 's/\[[^]]*\]//g' | tr -cs '[:alnum:]一-鿿' ' ')
  set -- $KW
fi
[ $# -gt 0 ] || { echo "用法: bash scripts/ticket-similar.sh <關鍵字…>   |   --title \"<標題>\"" >&2; exit 2; }

echo "🔎 找「$*」的既有票（open ＋ closed）"
echo

HITS=""
for K in "$@"; do
  [ ${#K} -ge 2 ] || continue
  R=$(gh issue list --state all --search "$K in:title" --limit 12 \
        --json number,title,state -q '.[] | "\(.number)\t\(.state)\t\(.title)"' 2>/dev/null) || continue
  HITS="${HITS}${R}
"
done

FOUND=$(printf '%s' "$HITS" | grep -v '^$' | sort -u | head -20)
if [ -z "$FOUND" ]; then
  echo "  ✅ 一張都沒找到 —— ⭐ 但那**不是**「可以開了」："
  echo "     ⛔ 標題用詞不同的重複票搜不到（GH#808 的四對就是這樣）。"
  echo "     ⇒ 再用**另一組詞**搜一次（症狀／檔名／錯誤訊息），⛔ 不是只搜你想到的第一組。"
  exit 0
fi

printf '%s\n' "$FOUND" | while IFS=$'\t' read -r N ST TI; do
  [ -n "$N" ] || continue
  ICON="🔵"; [ "$ST" = "CLOSED" ] && ICON="✅"
  echo "  $ICON #$N  $TI"
  # ⭐ 進度標記 —— 「做的如何」那一半
  P=$(bash scripts/ticket-progress.sh read "$N" 2>/dev/null | grep -E '^\| \*\*狀態\*\*|下一個人從哪裡接' | head -2 | tr '\n' ' ')
  [ -n "$P" ] && echo "      🧭 $P"
done

echo
echo "  ⭐ 開票前逐張問：**這一張是不是就是我要開的那件事？**"
echo "     · 是 ⇒ ⛔ 不要開新的，去那一張補留言（⭐ 並用 ticket-progress 記狀態）"
echo "     · ✅ 已關而問題還在 ⇒ ⭐ **重開它**，⛔ 不是開一張新的（歷史會斷）"
echo "     · 真的是不同的事 ⇒ ⭐ 在新票的 Dependencies 寫上「與 #N 的差別是什麼」"

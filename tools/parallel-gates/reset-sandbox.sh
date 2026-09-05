#!/usr/bin/env bash
# ⭐ 沙盒的**快速回捲** —— `trace.mjs --reset` 用它把樹還原成「一致地舊」的基線。
#
# ⚠️ 為什麼需要它:鏈上的順序會**把寫入端藏起來** —— `apconv:build` 排在
# `skillremake:json` 剛把同一批檔寫成正確的之後 ⇒ 它沒東西可寫 ⇒ 圖上少掉它的出邊,
# 而少一條邊 = 併行時兩支同時寫同一個檔(⛔ 而兩支都會說自己 OK)。
#
# ⛔ 只還原**這一支剛動過的**那幾個檔(⛔ 不是整棵 content/ 的 14,712 個檔) ——
#    整棵回捲量到 ~2 分鐘/支 × 32 支 ≈ 一小時,而結果一模一樣。
# ⛔ 也刻意**不用** `git checkout <檔>`(CLAUDE.md:不可逆的刪除,併行 lane 禁令),
#    改用 `git archive | tar -x`:同樣的內容,⛔ 但不動 index。
set -uo pipefail

# ⛔⛔ 這支會 rm 未追蹤檔 ⇒ **只准在暫存目錄（$TMPDIR 或 /tmp）底下的沙盒裡跑**。
# ⚠️ GH#1003：兩邊都先 `pwd -P` 解析成**實體**路徑再比 —— macOS 的 /tmp 是 symlink，
#    而寫死它的實體路徑是 macOS 專屬（Linux 上不存在）。⛔ 解析失敗要退到一個**不可能匹配**的值：
#    空字串接 `/*` 會匹配任何絕對路徑 ⇒ 柵欄整個消失而看起來像通過。
_here="$(pwd -P)"
_tmp1="$(cd "${TMPDIR:-/tmp}" 2>/dev/null && pwd -P)" || _tmp1="/__no-tmpdir__"
_tmp2="$(cd /tmp 2>/dev/null && pwd -P)" || _tmp2="/__no-tmp__"
case "$_here" in
  "$_tmp1"/*|"$_tmp2"/*) ;;
  *) echo "⛔ reset-sandbox.sh 只能在暫存目錄(\$TMPDIR 或 /tmp)底下的沙盒裡跑(現在: ${PWD})" >&2; exit 2 ;;
esac

BASE="${GGD_RESET_REV:-HEAD~60}"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT

git status --porcelain -- content docs data packages 2>/dev/null \
  | sed -e 's/^...//' -e 's/^.* -> //' | sort -u > "$T/dirty"
[ -s "$T/dirty" ] || exit 0

# ⚠️ `git archive` 只要有**一個**路徑在 BASE 裡不存在就整份失敗(⇒ 一個檔都沒還原)。
#    所以先跟 BASE 的檔案清單取交集。
git ls-tree -r --name-only "$BASE" -- content docs data packages 2>/dev/null | sort -u > "$T/base"
comm -12 "$T/dirty" "$T/base" > "$T/restore"
comm -23 "$T/dirty" "$T/base" > "$T/purge"      # BASE 裡沒有 ⇒ 基線上它不存在

if [ -s "$T/restore" ]; then
  tr '\n' '\0' < "$T/restore" | xargs -0 git archive --format=tar "$BASE" -- 2>/dev/null | tar -x 2>/dev/null
fi
# 基線上不存在的檔要拿掉,不然下一支會看到「已經對了」而不寫(⇒ 又把出邊藏起來)
while IFS= read -r f; do [ -n "$f" ] && rm -f -- "$f"; done < "$T/purge"
exit 0

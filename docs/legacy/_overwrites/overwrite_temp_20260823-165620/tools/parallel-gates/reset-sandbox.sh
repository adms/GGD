#!/usr/bin/env bash
# ⭐ 沙盒的**快速回捲** —— `trace.mjs --reset` 用它把樹還原成「一致地舊」的基線。
#
# ⚠️ 為什麼需要它:鏈上的順序會**把寫入端藏起來** —— `apconv:build` 排在
# `skillremake:json` 剛把同一批檔寫成正確的之後 ⇒ 它沒東西可寫 ⇒ 圖上少掉它的出邊,
# 而少一條邊 = 併行時兩支同時寫同一個檔(⛔ 兩支都會說自己 OK)。
#
# ⛔ 只還原**這一支剛動過的**那幾個檔(⛔ 不是整棵 content/ 14,712 個檔) ——
#    整棵回捲量到過 ~2 分鐘/支 × 32 支 = 一小時,而結果一模一樣。
# ⛔ 也刻意**不用** `git checkout <檔>`(CLAUDE.md:那是不可逆的刪除,併行 lane 禁令),
#    改用 `git archive | tar -x`:同樣的內容,⛔ 但不會動到 index。
set -uo pipefail
BASE="${GGD_RESET_REV:-HEAD~60}"
mapfile -t DIRTY < <(git status --porcelain -- content docs data packages 2>/dev/null | cut -c4- | sed 's/^.* -> //')
[ "${#DIRTY[@]}" -eq 0 ] && exit 0
git archive "$BASE" -- "${DIRTY[@]}" 2>/dev/null | tar -x 2>/dev/null
exit 0

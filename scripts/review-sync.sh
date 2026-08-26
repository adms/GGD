#!/usr/bin/env bash
# scripts/review-sync.sh —— 🔀 **線上批核結果回流本機**（GH#794）。
#
# owner 2026-08-27（逐字）：
# > 「請同步到線上，並且**線上批核的結果也同步到本機端**」
#
# ## ⭐ 兩個方向是**不對稱**的，而那個不對稱正是「避免錯改」的機制
# | 方向 | 帶什麼 | 走哪條路 | 為什麼 |
# |---|---|---|---|
# | 本機 → 線上 | 📦 **材料**（登記 ＋ 連續圖片） | ⭐ **git**（`docs/` 本來就在版控，host 是 `git pull`） | ⛔ 不必 rsync：部署已經在做了 |
# | 線上 → 本機 | 🧑‍⚖️ **結果**（owner 按的那些） | 這支腳本（**一個檔**：`verdicts/live.json`） | 線上唯一寫得動的東西就是它 |
#
# ⇒ ⭐ **回流只需要搬一個檔**。⛔ 不要 rsync 整個 docs/_review —— 那會把
#   本機的材料推上去覆蓋（或反過來），而那正是 owner 說的「讀寫混淆」。
#
# ## ⚠️ 合併不是覆蓋
# 本機有 `verdicts/local.json`、線上有 `verdicts/live.json` —— **兩個不同的檔名**，
# 所以「拉下來」是**放到旁邊**，⛔ 不是蓋掉任何東西。合併（同一批次取
# `verdictAt` 新的）是**讀的時候算的**（`tools/review/stores.mjs::loadVerdicts`）。
#
# 用法：
#   bash scripts/review-sync.sh              # 拉線上結果回來（預設）
#   bash scripts/review-sync.sh --check      # 只比對：線上有幾筆、本機有幾筆、差在哪
#   bash scripts/review-sync.sh --host user@ip --remote-path /home/can/GGD
set -uo pipefail
cd "$(dirname "$0")/.."

HOST="${GGD_REVIEW_HOST:-can@34.81.104.163}"
RPATH="${GGD_REVIEW_REMOTE:-/home/can/GGD}"
REL="docs/_review/verdicts/live.json"
CHECK=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK=1; shift ;;
    --host) HOST="$2"; shift 2 ;;
    --remote-path) RPATH="$2"; shift 2 ;;
    *) echo "未知參數 $1"; exit 2 ;;
  esac
done

count_of() { node -e "
const fs=require('fs');
try{const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(Object.keys(d.verdicts||{}).length)}
catch{console.log(0)}" "$1"; }

echo "🔀 批核結果回流 —— $HOST:$RPATH/$REL → ./$REL"

# ⚠️ 遠端那一份是**容器**寫的（sidecar 掛 verdicts:rw）。用 cat 取，⛔ 不用 rsync：
#    rsync 的預設是「同步一棵樹」，而我們刻意只要一個檔。
remote=$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" "cat $RPATH/$REL 2>/dev/null" 2>/dev/null)
rc=$?
if [[ $rc -ne 0 || -z "$remote" ]]; then
  # ⭐ fail-open 沒錯，**靜默**才是缺陷：說清楚「沒同步到」與「同步到 0 筆」的差別。
  echo "⚠️ **沒同步到**（ssh rc=$rc）—— 線上可能還沒部署 review sidecar，或這台連不上。"
  echo "   ⛔ 這不等於「線上 0 筆裁決」。本機現有：$(count_of "$REL") 筆。"
  exit 0
fi

n_remote=$(printf '%s' "$remote" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(Object.keys(JSON.parse(s).verdicts||{}).length)}catch{console.log('bad')}})")
n_local=$(count_of "$REL")

if [[ "$n_remote" == "bad" ]]; then
  echo "⛔ 線上那一份不是合法 JSON —— ⛔ 不覆蓋本機。先去看 $RPATH/$REL"
  exit 1
fi

echo "   線上 $n_remote 筆 · 本機 $n_local 筆"
if [[ $CHECK -eq 1 ]]; then
  [[ "$n_remote" == "$n_local" ]] && echo "✓ 一致" || echo "⚠️ 不一致 —— 跑 bash scripts/review-sync.sh 拉下來"
  exit 0
fi

if [[ "$n_remote" -lt "$n_local" ]]; then
  # ⚠️ 變少＝可疑（容器重建？掛載掉了？）。⭐ 先留底再說，⛔ 不無聲覆蓋。
  bak="docs/_review/verdicts/live_temp_$(date +%Y%m%d-%H%M%S).json"
  cp "$REL" "$bak"
  echo "⚠️ 線上比本機**少** $((n_local - n_remote)) 筆 —— 本機那一份先留底到 $bak"
fi

printf '%s\n' "$remote" > "$REL"
echo "✓ 回流完成：$REL 現在 $(count_of "$REL") 筆"
echo "⭐ 合併是讀的時候算的（同一批次取 verdictAt 新的）—— ⛔ 沒有第三個檔。"
bash scripts/review-access.sh guard

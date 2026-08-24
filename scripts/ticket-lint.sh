#!/usr/bin/env bash
# 🎫 開票規格 lint —— owner 2026-08-24 第 35 條 v3（同日三則,最後一則加了六節模板）：
#   「開票要把[緊急][重要][優先],[breaking change][fix][improve][feature] 等開發常用
#    在標題及內文 tag, 採用的 [acceptance criteria] 及 [思考策略] 與 [解決模板] 寫清楚」
#
# 五件必填:
#   ① 優先級 tag —— [緊急]/[重要]/[優先]/[一般] ——⭐ **標題**要有（owner 掃標題排序）
#   ② 類型 tag  —— [breaking change]/[fix]/[improve]/[feature] 等開發常用
#                  （也收 refactor/perf/docs/test/chore/bug/infra）——⭐ **標題**要有
#   ③ 驗收標準  —— 「acceptance criteria」或「驗收標準」或「## 驗收」（內文）
#   ④ [思考策略] —— 這張票用哪一種思考方式（盤點→按擋住支數排序 / 五層根因 /
#                   兩個名詞的關係 / 閘不是判準 / 量到再說…）（內文）
#   ⑤ [解決模板] —— 套哪一個解決模板（三個住處開關 / 條件葉 / 產生器+--check 閘 /
#                   HITL 分層漏斗 / 承重守衛+突變 / N 同型=K 模板+一張表…）（內文）
#
# 用法:
#   scripts/ticket-lint.sh 669 670 …        # lint 這幾張(讀 GitHub)
#   scripts/ticket-lint.sh --recent [天數]   # lint 最近 N 天開的 open 票(預設 3)
#   scripts/ticket-lint.sh --body-file 檔   # 開票**之前**先驗草稿(不碰網路)
#
# 離開碼: 0 = 全過 · 1 = 有缺(逐張列出缺什麼) · 0 = gh 連不上(警告後跳過,
#   ⛔ 網路不通不可以擋人 —— 但會明說「沒驗到」,安靜的跳過與全過長得一樣)
set -o pipefail
cd "$(dirname "$0")/.."

RE_AC='acceptance criteria|驗收標準|##[[:space:]]*驗收'
RE_TAG='\[(緊急|重要|優先|一般)\]'
RE_OBJ='\*\*Objective\*\*|##[[:space:]]*Objective'
RE_SCOPE='\*\*Scope\*\*|##[[:space:]]*Scope'
RE_FILES='Files[[:space:]]*/?[[:space:]]*modules|\*\*Files|影響檔案|likely affected'
RE_CONSTR='Implementation constraints|實作約束'
RE_TEST='Test[[:space:]]*/?[[:space:]]*verification|驗證方式|##[[:space:]]*驗證|verification criteria'
RE_DEPS='Dependencies|相依票|依賴'
RE_NONGOALS='Non-goals|非目標|不做什麼'
RE_RISKS='Known risks|已知風險'
RE_TYPE='\[(breaking change|fix|improve|feature|refactor|perf|docs|test|chore|bug|infra)\]'
RE_STRAT='\[思考策略\]|##[[:space:]]*思考策略'
RE_TPL='\[解決模板\]|##[[:space:]]*解決模板'

lint_text() { # $1=標籤 $2=標題 $3=內文
  local missing=()
  echo "$2" | grep -qE  "$RE_TAG"   || missing+=("標題缺 [緊急]/[重要]/[優先]/[一般]")
  echo "$2" | grep -qiE "$RE_TYPE"  || missing+=("標題缺 [fix]/[feature]/[improve]/[breaking change] 類型 tag")
  echo "$3" | grep -qiE "$RE_AC"      || missing+=("驗收標準(acceptance criteria)")
  echo "$3" | grep -qiE "$RE_OBJ"     || missing+=("Objective")
  echo "$3" | grep -qiE "$RE_SCOPE"   || missing+=("Scope")
  echo "$3" | grep -qiE "$RE_FILES"   || missing+=("Files/modules affected")
  echo "$3" | grep -qiE "$RE_CONSTR"  || missing+=("Implementation constraints")
  echo "$3" | grep -qiE "$RE_TEST"    || missing+=("Test/verification criteria")
  echo "$3" | grep -qE  "$RE_STRAT"   || missing+=("[思考策略]")
  echo "$3" | grep -qE  "$RE_TPL"     || missing+=("[解決模板]")
  # ⭐「最好再加」的三節(owner:建議⛔不硬擋) —— 缺了**警告**但不算 BAD
  local advisory=()
  echo "$3" | grep -qiE "$RE_DEPS"     || advisory+=("Dependencies")
  echo "$3" | grep -qiE "$RE_NONGOALS" || advisory+=("Non-goals")
  echo "$3" | grep -qiE "$RE_RISKS"    || advisory+=("Known risks")
  if [ ${#advisory[@]} -gt 0 ] && [ ${#missing[@]} -eq 0 ]; then
    local aj=""; for a in "${advisory[@]}"; do aj="${aj}${aj:+ · }${a}"; done
    echo "ℹ️ $1 建議補(⛔ 不擋):${aj}"
  fi
  if [ ${#missing[@]} -gt 0 ]; then
    local joined=""
    for m in "${missing[@]}"; do joined="${joined}${joined:+ · }${m}"; done
    echo "⚠️ $1 缺:${joined}"
    return 1
  fi
  return 0
}

BAD=0
if [ "$1" = "--body-file" ]; then
  [ -f "$2" ] || { echo "⛔ 讀不到 $2" >&2; exit 2; }
  # 草稿模式沒有標題 ⇒ tag 檢查落在草稿第一行（慣例:第一行寫未來的標題）
  lint_text "草稿 $2" "$(head -1 "$2")" "$(cat "$2")" || BAD=1
elif [ "$1" = "--recent" ]; then
  DAYS="${2:-3}"
  SINCE=$(date -v-"${DAYS}"d +%F 2>/dev/null || date -d "-${DAYS} days" +%F)
  LIST=$(gh issue list --state open --search "created:>=${SINCE}" --limit 100 \
         --json number -q '.[].number' 2>/dev/null) || {
    echo "⚠️ gh 連不上 —— 最近 ${DAYS} 天的票**沒有被驗**(⛔ 這不是全過)。"; exit 0; }
  for n in $LIST; do
    T=$(gh issue view "$n" --json title -q .title 2>/dev/null) || continue
    B=$(gh issue view "$n" --json body -q .body 2>/dev/null) || continue
    lint_text "#$n" "$T" "$B" || BAD=1
  done
else
  [ $# -gt 0 ] || { sed -n '2,20p' "$0"; exit 2; }
  for n in "$@"; do
    T=$(gh issue view "$n" --json title -q .title 2>/dev/null) || {
      echo "⚠️ gh 讀不到 #$n —— 這一張**沒有被驗**。"; continue; }
    B=$(gh issue view "$n" --json body -q .body 2>/dev/null)
    lint_text "#$n" "$T" "$B" || BAD=1
  done
fi
[ "$BAD" = 0 ] && echo "✓ 開票規格:受檢的每一張都帶齊四件。"
exit $BAD

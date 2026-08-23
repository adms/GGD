#!/usr/bin/env bash
# 🚫 **「這個檔是產生器的產物嗎」—— 改之前先問** 。
# owner 2026-08-24：「你已經犯過**數十次**一樣的錯，請你一定要**寫成script擋住先檢查**，
# 並且寫到開發守則」—— 錯的形狀：直接改產生器的產物，下一次 skills:sync 把它打回來，
# 而那個「又紅了」看起來像新的錯（同一晚在 godie-e002.r 上發生兩次、49 個檔一次）。
#
# 用法：bash scripts/genguard.sh <path...>
#   擁有者查 tools/parallel-gates/sync-io.json 的 writes（⭐ 量出來的表，⛔ 不是手寫）。
#   有擁有者 ⇒ exit 1 並指名「改 <來源> 然後跑 <指令>」；沒有 ⇒ exit 0。
set -o pipefail
cd "$(dirname "$0")/.."
RC=0
for p in "$@"; do
  OWNER=$(node -e '
const io=require("/dev/stdin");' 2>/dev/null)
  OWNER=$(node --input-type=module -e "
import { readFileSync } from 'node:fs';
const io=JSON.parse(readFileSync('tools/parallel-gates/sync-io.json','utf8'));
const p=process.argv[1];
for (const s of io.steps ?? []) {
  for (const w of s.writes ?? []) {
    if (p===w || (w.endsWith('/') && p.startsWith(w))) { console.log(s.name); process.exit(0); }
  }
}
" "$p" 2>/dev/null)
  if [ -n "$OWNER" ]; then
    echo "🚫 $p 是產生器 **$OWNER** 的產物 —— ⛔ 直接改它,下一次 sync 就打回來。"
    echo "   ⇒ 改它的**來源**(tools/ 或 content/ 的上游),然後跑該產生器重生成。"
    RC=1
  else
    echo "✓ $p 沒有產生器擁有者,可以手改。"
  fi
done
exit $RC

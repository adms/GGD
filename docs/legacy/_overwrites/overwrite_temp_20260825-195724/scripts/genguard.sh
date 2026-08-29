#!/usr/bin/env bash
# 🚫 **「這個檔是產生器的產物嗎」—— 改之前先問** 。
# owner 2026-08-24：「你已經犯過**數十次**一樣的錯，請你一定要**寫成script擋住先檢查**，
# 並且寫到開發守則」—— 錯的形狀：直接改產生器的產物，下一次 skills:sync 把它打回來，
# 而那個「又紅了」看起來像新的錯（同一晚在 godie-e002.r 上發生兩次、49 個檔一次）。
#
# 用法：bash scripts/genguard.sh <path...>
#   擁有者查 tools/parallel-gates/sync-io.json 的 writes（⭐ 量出來的表，⛔ 不是手寫）。
#   **作者**擁有 ⇒ exit 1 並指名「改 <來源> 然後跑 <指令>」；
#   只有**正規化器**（tiers:apply 那一族，就地改欄位⛔不產生檔案）⇒ exit 0 + 提醒；
#   沒有擁有者 ⇒ exit 0。⭐ 與 PreToolUse hook 同一套裁決。
set -o pipefail
cd "$(dirname "$0")/.."
RC=0
for p in "$@"; do
  OWNER=$(node --input-type=module -e "
import { readFileSync } from 'node:fs';
// ⭐ 2026-08-24 —— 這一段必須與 PreToolUse hook（scripts/preserve-before-overwrite.py）
//    的裁決**逐字一致**:hook 放行而這支說「擋」，就是散文在說謊（第三守則）。
//    **正規化器 ≠ 作者**:tiers:apply 讀 530 寫 401，它是就地改欄位，⛔ 不產生那些檔。
//    ⛔ 清單只准放 sync-io 真的有的步驟名（normalizerListIsReal.test.ts 在守）——
//    2026-08-25 拿掉幽靈名 'prose:apply'（真名 prose:build，且不在 sync-io 的步驟裡）。
const NORMALIZERS = new Set(['tiers:apply', 'apconv:build', 'apdmg:build']);
const io=JSON.parse(readFileSync('tools/parallel-gates/sync-io.json','utf8'));
const p=process.argv[1];
const hit=[];
for (const s of io.steps ?? []) {
  for (const w of s.writes ?? []) {
    if (p===w || (w.endsWith('/') && p.startsWith(w))) { if(!hit.includes(s.name)) hit.push(s.name); break; }
  }
}
if (hit.length) {
  const authors = hit.filter((n) => !NORMALIZERS.has(n));
  console.log((authors.length ? 'AUTHOR' : 'NORMALIZER') + '\t' + (authors[0] ?? hit[0]));
}
" "$p" 2>/dev/null)
  KIND=${OWNER%%$'\t'*}
  NAME=${OWNER#*$'\t'}
  if [ "$KIND" = "AUTHOR" ]; then
    echo "🚫 $p 是產生器 **$NAME** 的產物 —— ⛔ 直接改它,下一次 sync 就打回來。"
    echo "   ⇒ 改它的**來源**(tools/ 或 content/ 的上游),然後跑該產生器重生成。"
    RC=1
  elif [ "$KIND" = "NORMALIZER" ]; then
    echo "⚠️ $p 會被**正規化器** $NAME 就地改欄位,⛔ 但它不是那支的產物 ⇒ 這一支不擋你。"
    echo "   ⚠️⚠️ **「不擋」≠「這個檔是手編的」** —— 它可能是**別的**產生器的產物,"
    echo "      也可能有一份**上游來源**(例:content/abilities/*.json 有些來自"
    echo "      tools/skill-remake/heroes/*.py 的 model_fx= 表格出口)。"
    echo "      ⇒ 改之前再問一次: grep -rl \"\$(basename \"$p\" .json)\" tools/ | head"
    echo "      找得到來源就改來源＋genrun,⛔ 不要直接編這一份。"
    echo "   ⚠️ 真的手改了,請跑一次 \`pnpm $NAME\`,讓級距/換算欄位跟著新內容重算。"
  else
    echo "✓ $p 沒有**產生器**擁有者。"
    echo "   ⚠️ 這只表示 sync-io 的 writes 沒有它 —— **上游來源**仍然可能存在"
    echo "      (grep -rl 到 tools/ 就是)。⛔ 「沒有擁有者」≠「隨便改」。"
  fi
done
exit $RC

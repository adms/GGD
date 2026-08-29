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
//    ⛔⛔ 2026-08-26 拿掉 'apdmg:build' —— 量到它的 2 份 writes **共有 0 份**
//    （content/config/ap-damage-scaling.json 它是唯一寫入者）⇒ 它是**作者**不是正規化器，
//    而 CLAUDE.md:1440 明文把那一份列在「⛔ 不可手改」的 7 份 config 產物裡。
//    留在這裡＝這支腳本對一份禁改產物說「不擋你」還教人手改（誤導源 T0）。
//    ⭐⭐ 2026-08-27 加入 skillremake:provenance —— 它的 writes 是兩條 glob
//    (content/abilities 與 content/champions 底下的 *.json = **494 份**),
//    於是 genguard 對那 494 份一律回 AUTHOR ⇒「改產物被擋／改來源沒有來源」的**死路**。
//    ⛔ 而它不是作者:逐行讀 tools/skill-remake/stamp_provenance.py,它只寫
//    out 的 provenance 那一格(⛔ 不是信檔頭,是看程式) ⇒ 純就地改欄位。
//    ⭐ 加進來之後,真的有作者的那些檔(skillremake:json 也認領的 91+16 份)**仍然被擋**
//    —— authors 濾掉正規化器之後還剩下它。這一格只放行「**只有** provenance 認領」的。
//    ⚠️⚠️ 這段註解**不可以有反引號** —— 這段 JS 活在 shell 雙引號裡,反引號會被
//    當成命令替換(2026-08-27 我就是這樣把這支腳本弄壞的,見上面那條同型警告)。
//    ⭐⭐ 2026-08-27 第二筆:speedtiers:build —— 與上面**同一個形狀**,而我第一次只修了一半。
//    它的 writes 是一條 glob(content/champions 的 *.json = 71 份),而逐行讀
//    tools/speed-growth/gen.ts 的 withTierLines():它只在**原始字串**上刪/插
//    tier 欄位那幾行,⛔ 其餘位元組一個都不碰 ⇒ 正規化器。
//    ⚠️ 漏掉它的後果:71 份英雄卡裡 55 份被判 AUTHOR 而訊息叫人「改來源」——
//    **英雄卡自己就是來源**,那是一條死路(另一條 lane 實測撞到,GH#805)。
//    ⭐⭐ 2026-08-27（GH#707）清單**搬進 tools/parallel-gates/normalizers.json** ——
//    在此之前它有兩份手寫副本(這裡 + hook),而**第三個消費端**(產物隔離區)
//    根本不認得這個概念 ⇒ genguard 說「不擋你」而檔案是 444 ⇒ 387 份合法手編吃 EACCES。
//    ⇒ 唯一住處 + 三個消費端一起讀(第〇·四守則)。每一格的理由住在那份 JSON 裡。
//    ⚠️ 讀不到那份 JSON ⇒ 印 ERROR 並讓這支回非零,⛔ 不可以靜默當成「沒有正規化器」
//    (那會讓 387 份手編檔全部被判 AUTHOR,而輸出看起來完全正常)。
let NORMALIZERS, io;
try {
  NORMALIZERS = new Set(JSON.parse(readFileSync('tools/parallel-gates/normalizers.json','utf8')).normalizers.map((n) => n.step));
  io = JSON.parse(readFileSync('tools/parallel-gates/sync-io.json','utf8'));
} catch (e) {
  console.log('ERROR\t' + String((e && e.message) || e).split('\n')[0]);
  process.exit(0);
}
const p=process.argv[1];
const hit=[];
// ⭐ GH#771:戶籍表裡的日期戳家族是 glob（merge-io 正規化）⇒ 用 glob→regex 比對。
// ⚠️ 這段 JS 活在 shell 雙引號裡 —— ⛔ 註解與程式都不可以出現「錢字元+左括號」
//    或反斜線轉義:2026-08-26 第一版用 replace 做轉義,被 shell 當命令替換吃掉,
//    regex 靜默壞掉而輸出像正常。⇒ 逐字元組 regex:特殊字元用字元類包住,零反斜線。
const g2re=(g)=>new RegExp('^'+g.split('').map((c)=>c==='*'?'[^/]*':c==='?'?'[^/]':/[a-zA-Z0-9_/.\u0080-\uffff-]/.test(c)?c:'['+c+']').join('')+'$');
for (const s of io.steps ?? []) {
  for (const w of s.writes ?? []) {
    const m = /[*?\[]/.test(w) ? g2re(w).test(p) : (p===w || (w.endsWith('/') && p.startsWith(w)));
    if (m) { if(!hit.includes(s.name)) hit.push(s.name); break; }
  }
}
if (hit.length) {
  const authors = hit.filter((n) => !NORMALIZERS.has(n));
  console.log((authors.length ? 'AUTHOR' : 'NORMALIZER') + '\t' + (authors[0] ?? hit[0]));
}
" "$p" 2>/dev/null)
  KIND=${OWNER%%$'\t'*}
  NAME=${OWNER#*$'\t'}
  if [ "$KIND" = "ERROR" ]; then
    # ⚠️ 表讀不到 ⇒ **大聲**,⛔ 不是靜默放行。這支腳本的整個裁決都建立在那兩份表上。
    echo "🚫 genguard 自己壞了 —— 讀不到擁有者表:$NAME"
    echo "   ⇒ 需要 tools/parallel-gates/{sync-io,normalizers}.json 兩份都在。"
    echo "   ⛔ 在修好之前**不要**把「沒有輸出」當成「可以改」。"
    RC=1
    continue
  fi
  if [ "$KIND" = "AUTHOR" ]; then
    echo "🚫 $p 是產生器 **$NAME** 的產物 —— ⛔ 直接改它,下一次 sync 就打回來。"
    echo "   ⇒ 改它的**來源**,然後 \`bash scripts/genrun.sh $NAME\` 重生成"
    echo "     (genrun = 解鎖該支的產物→跑→重新上鎖;⚠️ 看它**最後一行**判成敗,⛔ 不要接管道)。"
    echo "   ⇒ 找來源: grep -rl --exclude-dir=node_modules \"\$(basename \"$p\")\" tools/ scripts/ | head"
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
    # ⭐ 2026-08-26（owner:「追誤會的多個源頭」）——「無主」有兩種，⛔ 不可以長一樣:
    #    檔案是唯讀(444) = 隔離區鎖過它 = **它是產物,只是戶籍表漏登**（量測洞:
    #    條件寫入端在已同步的樹上量到 0 寫）。對它印 ✓ 就是「改產生物」的邀請函。
    BANNER=$(head -c 4000 "$p" 2>/dev/null | grep -cE '由程式產生|請勿手動編輯|不要手改|這份文件是產生的|這一份由|@generated|DO NOT EDIT|自動產生' || true)
    if [ -e "$p" ] && [ "${BANNER:-0}" -gt 0 ]; then
      echo "🚫 $p 戶籍無主,⛔ 但**它自己的檔頭寫著它是產生的** —— 相信檔案,⛔ 不要手改。"
      echo "   ⇒ 找產生器: grep -rl --exclude-dir=node_modules \"\$(basename \"$p\")\" tools/ scripts/ | head"
      echo "   （戶籍洞見 GH#771 —— 重量測 sync-io 會補上這一筆。）"
      RC=1
    elif [ -e "$p" ] && [ ! -w "$p" ]; then
      echo "🚫 $p **鎖著(444)但戶籍無主** —— 它是產物,只是 sync-io 的量測漏了它。"
      echo "   ⛔ 不要手改。找它的產生器: grep -rl \"\$(basename \"$p\")\" tools/ scripts/ | head"
      echo "   ⇒ 改**來源**,跑 bash scripts/genrun.sh <該步驟> 重生成。"
      echo "   （戶籍洞本身見 GH#771 —— 重量測 sync-io 會補上這一筆。）"
      RC=1
    else
      echo "✓ $p 沒有**產生器**擁有者,而且沒有被隔離區鎖過。"
      echo "   ⚠️ 這只表示 sync-io 的 writes 沒有它 —— **上游來源**仍然可能存在"
      echo "      (grep -rl 到 tools/ 就是)。⛔ 「沒有擁有者」≠「隨便改」。"
    fi
  fi
done
exit $RC

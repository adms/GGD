#!/usr/bin/env tsx
/**
 * Materialise the `castTimeTier` fallback seconds for every ability and, with
 * `--write`, apply them to content/. The five-tier config is the authoring
 * source; this script must not reconstruct a tier from damage/cooldown/shape.
 *
 * Reads the REAL post-registration registry (ContentLoader + registerAll, the
 * game-server's boot pair) so the numbers reported are the numbers the match
 * uses, not the numbers on disk — champion-doc ability shadowing has produced
 * five "green tests, dead code" bugs in this repo.
 *
 * Writing honours the MIRROR RULE: the standalone content/abilities/<id>.json
 * is authoritative for the sim since the shadowing fix, but the champion's
 * EMBEDDED copy is what the codex browser and the admin content page render,
 * so both are written.
 *
 *   pnpm --filter @ggd/shared exec tsx scripts/deriveCastTimes.ts          # report
 *   pnpm --filter @ggd/shared exec tsx scripts/deriveCastTimes.ts --write  # apply
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

import { ContentLoader, registerAll } from "../src/content/index";
import { FsContentSource } from "../src/content/node/index";
import { Abilities, Champions } from "../src/sim/content/registry";
import {
  DEFAULT_CAST_TIME_TIERS,
  resolveCastTimeTier,
  type CastTimeTiers,
} from "../src/content/castTimeTiers";
import { isPassiveOnly } from "../src/sim/abilities/abilityPassives";

const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(__dirname, "../../../content");
const WRITE = process.argv.includes("--write");

// ⛔⛔ GH#708 —— **一定要 `fail-closed`**，理由與 `buildIndexes.ts` 逐字相同：
//    出貨政策是 `quarantine`（執行期少一份設定好過整站退回骨架），⛔ 但這裡是
//    **產出期，沒有玩家在等**。`load()` 不帶政策時，任何一份 schema 壞掉／id 對
//    不上／硬參照斷掉的**英雄卡會被安靜地從 store 拿掉** ⇒ 它不在
//    `Champions.all()` 裡 ⇒ 這支腳本連看都沒看過它 ⇒ 它的內嵌 `castTimeSec`
//    永遠不會被寫，而**它的 standalone 技能檔照樣寫對了**（那幾份自己是好的）。
//    2026-08-25 量到的正是這個形狀：14/42 變 13/39，`godie-edem` 的 Q/W/E 整格消失，
//    而唯一叫出來的是 `abilityMirror.test.ts` —— 一句不指向這支腳本的訊息。
// ⭐ loader 自己的檔頭寫著「呼叫端**必須**把非空的 quarantined 送到一個看得見的
//    地方，⛔ 一行 console.warn 不算」——`fail-closed` 就是這支腳本的那個地方：
//    它直接擲 `ContentLoadError`，訊息裡帶著是哪一份、哪一個欄位。
const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load({
  policy: "fail-closed",
});
// 防禦性：政策日後被改回 quarantine 時，這一格也不可以是靜默的。
if (result.quarantined.length > 0) {
  console.error(`⛔ 載入時隔離了 ${result.quarantined.length} 份文件 —— 它們不會被寫到：`);
  for (const q of result.quarantined) console.error(`   · ${q.collection}/${q.id} (${q.reason}) ${q.detail}`);
  process.exit(1);
}
registerAll(result.store);
const all = Abilities.all();

console.log(`contentVersion ${result.manifest.contentVersion}`);
console.log(`abilities ${all.length}`);

const tiers =
  result.store.tryGet<CastTimeTiers>("config", "cast-time-tiers") ?? DEFAULT_CAST_TIME_TIERS;
const derived = new Map<string, { castTimeSec: number | undefined }>();
const missingTier: string[] = [];
for (const d of all) {
  const seconds = resolveCastTimeTier(d.castTimeTier, tiers);
  if (seconds === null) {
    missingTier.push(d.id);
    continue;
  }
  // A passive-only document never reaches the cast branch. Its raw fallback
  // stays absent; the tier still resolves to zero in the runtime registry.
  derived.set(d.id, { castTimeSec: isPassiveOnly(d) ? undefined : seconds });
}
if (missingTier.length > 0) {
  throw new Error(
    `castTimeTier missing or invalid on ${missingTier.length}/${all.length}: ${missingTier.slice(0, 20).join(", ")}`,
  );
}

const hist = new Map<string, number>();
for (const d of all) {
  const seconds = derived.get(d.id)!.castTimeSec;
  const key = seconds === undefined ? "(passive-only)" : seconds.toFixed(1);
  hist.set(key, (hist.get(key) ?? 0) + 1);
}
console.log("\ncastTimeTier materialisation:");
for (const [key, count] of [...hist].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${key.padStart(14)}  ${String(count).padStart(3)}`);
}

// ---- 8. write -------------------------------------------------------------
if (!WRITE) {
  console.log("\n(dry run — pass --write to apply to content/)");
  process.exit(0);
}

/**
 * SURGICAL text edit rather than JSON.parse -> JSON.stringify. The imported
 * docs write whole numbers as `30.0`, which a round-trip silently renormalises
 * to `30` — semantically identical, but it would turn a 620-file castTimeSec
 * change into a 620-file whole-file rewrite and bury the actual edit. These
 * files are all 2-space-indented JSON emitted by the same writer, so locating
 * a key by its indent is reliable.
 */
function patchKey(text: string, indent: number, key: string, value: number | undefined): string {
  const pad = " ".repeat(indent);
  const line = new RegExp(`\n${pad}"${key}": [^,\n]+(,?)`);
  const m = line.exec(text);
  if (m) {
    if (value !== undefined) return text.replace(line, `\n${pad}"${key}": ${value}${m[1]}`);
    // removing: drop the line, and if it was last, drop the previous comma
    const without = text.replace(line, m[1] === "," ? "" : "");
    if (m[1] === ",") return without;
    return without.replace(new RegExp(`,(\s*\n${" ".repeat(indent - 2)}\})`), "$1");
  }
  if (value === undefined) return text;
  // append as the last key of the block that closes at `indent - 2`
  const close = new RegExp(`\n${" ".repeat(indent - 2)}\}`);
  const c = close.exec(text);
  if (!c) throw new Error(`no closing brace at indent ${indent - 2}`);
  return (
    text.slice(0, c.index) + `,\n${pad}"${key}": ${value}` + text.slice(c.index)
  );
}

/** The champion doc's `abilities.<slot>` object, as a [start, end) text range. */
function slotRange(text: string, slot: string): [number, number] | null {
  const open = text.indexOf(`\n    "${slot}": {\n`);
  if (open < 0) return null;
  const close = text.indexOf("\n    }", open + 1);
  if (close < 0) return null;
  return [open, close + 6];
}

/**
 * 🔒 產物隔離區（owner 2026-08-24）：這支腳本寫的 `content/{abilities,champions}/*.json`
 * 有一大半是**別支產生器**的產物（444）。`genrun.sh skillremake:json` 只解鎖
 * skillremake 自己那 126 份 ⇒ 其餘的寫下去會吃 EACCES。
 * ⭐ 隔離區的設計要求**寫入點自解鎖**（前例 `tools/editor-contract/gen_contract_numbers.py`
 * 的 `doc.chmod(0o644)` 三行），⛔ 不是叫人手動 chmod。
 */
function writeProduct(p: string, text: string): void {
  try {
    chmodSync(p, 0o644);
  } catch {
    /* 唯讀檔案系統／別人的檔 —— 讓下面的 write 用它自己的錯誤說話 */
  }
  writeFileSync(p, text);
}

/** ⭐ 每一次「這一份跳過了」都要留下**英雄/技能 id ＋ 原因**（fail-open 沒錯，靜默才是缺陷）。 */
const skips: { what: string; why: string; fatal: boolean }[] = [];

let abilityFiles = 0;
for (const d of all) {
  const p = join(CONTENT_DIR, "abilities", `${d.id}.json`);
  let raw: string;
  try {
    raw = readFileSync(p, "utf8");
  } catch (e) {
    // ENOENT 是合法的：champion 卡裡內嵌、沒有 standalone 檔的技能。
    // ⛔ 其餘的錯誤碼（EACCES/EISDIR…）**不合法** —— 它們是「寫不進去」而不是「沒有這一份」。
    const code = (e as NodeJS.ErrnoException).code ?? "?";
    skips.push({ what: `abilities/${d.id}.json`, why: `讀不到 (${code})`, fatal: code !== "ENOENT" });
    continue;
  }
  const want = derived.get(d.id)!.castTimeSec;
  let next = patchKey(raw, 2, "castTimeSec", want);
  // ⭐ 走模板的技能還有**第二份** `template.params.castTimeSec`，而**它贏** ——
  //    模板展開會用 params（沒填就用模板宣告的 default 0）覆蓋文件頂層那一格。
  // ⚠️ 2026-08-13 實測：100 支技能頂層蓋對了、註冊表裡仍是舊值，
  //    而 `castTimeCoverage` 是唯一叫出來的東西（失敗形態⑤：被測的不是出貨的那個）。
  // ⛔ 不能改成「把 params 那格刪掉」—— 刪了會退回模板 default 0，更糟。
  //    ⇒ 兩處一起寫。單一住處是**這支腳本**，不是任何一份 JSON。
  if (/\n {4}"params": \{/.test(next) && /\n {6}"castTimeSec": /.test(next)) {
    next = patchKey(next, 6, "castTimeSec", want ?? 0);
  }
  // ⭐⭐ GH#1222（2026-09-11）—— **第三個載體**：`template.cards[].params.castTimeSec`。
  //
  // ⚠️ 上面那一段（2026-08-13）只認得 `template.params` 這個**舊形狀**。
  //   2026-09-10 上架的 81 名新英雄走的是**卡片式模板**（`template.cards[]`，每張卡自己一組 params）
  //   ⇒ 頂層蓋對了、卡片裡那一份還是 0.1，⭐ 而模板展開仍然是它贏
  //   ⇒ `castTimeCoverage` 逐支喊「內容 0.1 != 公式 0.467」——**193 支**。
  //
  // ⭐ 這是同一個病的第三次：一份資料兩個住處，而寫入端只認得其中一種寫法。
  //   ⛔ 修法不是放寬那條閘（它抓對了），是讓寫入端**認得今天的形狀**。
  //   ⚠️ 卡片是陣列 ⇒ 縮排是 8（`template` 2 → `cards` 4 → 元素 6 → `params` 8 的鍵在 10）
  //   ⇒ 逐一取代，⛔ 不能用 `patchKey`（它只換第一個命中）。
  if (want !== undefined) {
    next = next.replace(/(\n {10}"castTimeSec": )[^,\n]+/g, `$1${want}`);
  }
  if (next !== raw) {
    writeProduct(p, next);
    abilityFiles++;
  }
}

let champFiles = 0;
let embedded = 0;
let champsVisited = 0;
for (const c of Champions.all()) {
  const p = join(CONTENT_DIR, "champions", `${c.id}.json`);
  let raw: string;
  try {
    raw = readFileSync(p, "utf8");
  } catch (e) {
    // ⛔ 這裡的 ENOENT **不是**合法情況：`Champions.all()` 的每一位都是從
    //    `content/champions/<id>.json` 載進來的。讀不到 ⇒ 檔名與 id 對不上、
    //    或有人在我們跑的時候換掉了它 ⇒ **回非零**，⛔ 不是 `continue`。
    skips.push({
      what: `champions/${c.id}.json`,
      why: `讀不到 (${(e as NodeJS.ErrnoException).code ?? "?"}) @ ${p}`,
      fatal: true,
    });
    continue;
  }
  champsVisited++;
  let text = raw;
  for (const s of ["Q", "W", "E", "R"] as const) {
    const r = derived.get(c.abilities[s].id);
    if (!r) {
      // 註冊表裡沒有這支技能 ⇒ 這一格永遠不會被寫。⛔ 安靜跳過就是 GH#708 的另一半。
      skips.push({
        what: `champions/${c.id}.json abilities.${s}`,
        why: `技能 ${c.abilities[s].id} 不在註冊表裡（derived 沒有它）`,
        fatal: true,
      });
      continue;
    }
    const range = slotRange(text, s);
    if (!range) throw new Error(`${c.id}: cannot locate abilities.${s}`);
    const block = text.slice(range[0], range[1]);
    let patched = patchKey(block, 6, "castTimeSec", r.castTimeSec);
    // ⭐ 同 standalone：embedded 複本裡的 `template.params.castTimeSec` 也要蓋，
    //    只是縮排深兩層（slot 4 → template 6 → params 8 → 這一格 10）。
    // ⚠️ 漏掉它的症狀是 `abilityMirror` 紅（standalone 與 embedded 各說各話），
    //    而不是吟唱錯 —— 兩條線要一起走完才算蓋完。
    if (/\n {8}"params": \{/.test(patched) && /\n {10}"castTimeSec": /.test(patched)) {
      patched = patchKey(patched, 10, "castTimeSec", r.castTimeSec ?? 0);
    }
    if (patched !== block) {
      embedded++;
      text = text.slice(0, range[0]) + patched + text.slice(range[1]);
    }
  }
  if (text !== raw) {
    writeProduct(p, text);
    champFiles++;
  }
}
console.log(`\nWROTE ${abilityFiles} ability docs, ${champFiles} champion docs (${embedded} embedded copies).`);

// ── 9. ⭐ 對帳：**終端狀態**，⛔ 不是中間節點（GH#708）─────────────────────
// 「跑完了」≠「每一格都寫到了」。上面每一個 `continue` 都已經留了名字，但**沒被
// 想到的**那一種漏寫不會出現在 `skips` 裡 —— 所以最後再把檔案讀回來量一次：
// 每一位英雄的每一格，standalone 與內嵌都必須等於 `derived`。
// ⚠️ `castTimeSec === undefined` 的正解是**那一行不存在**（instant），⛔ 不是 0。
const drift: string[] = [];
for (const c of Champions.all()) {
  let doc: { abilities?: Record<string, { castTimeSec?: number } | undefined> };
  try {
    doc = JSON.parse(readFileSync(join(CONTENT_DIR, "champions", `${c.id}.json`), "utf8")) as typeof doc;
  } catch (e) {
    drift.push(`${c.id}: 對帳時讀不回來 (${(e as NodeJS.ErrnoException).code ?? String(e)})`);
    continue;
  }
  for (const s of ["Q", "W", "E", "R"] as const) {
    const want = derived.get(c.abilities[s].id)?.castTimeSec;
    const got = doc.abilities?.[s]?.castTimeSec;
    if (got !== want) drift.push(`${c.id}.${s} (${c.abilities[s].id}): 內嵌 ${String(got)} ≠ 公式 ${String(want)}`);
  }
}

// ⭐ 分母也要對帳 —— ⛔ `Champions.all().length` 自己就是被隔離**之後**的數字，
//    拿它當分母，「安靜地掉了一位」永遠是 71/71。⇒ 真正的分母是**磁碟上的索引**。
//    （配對式後置條件：驗的是「索引」與「註冊表」兩個名詞之間的關係。）
let indexed = -1;
try {
  const idx = JSON.parse(readFileSync(join(CONTENT_DIR, "champions", "_index.json"), "utf8")) as {
    entries?: unknown[];
  };
  if (Array.isArray(idx.entries)) indexed = idx.entries.length;
} catch {
  /* 索引讀不到就不對帳這一項（下面會說它是 -1） */
}
if (indexed >= 0 && indexed !== Champions.all().length) {
  drift.push(
    `英雄索引 ${indexed} 份，註冊表只有 ${Champions.all().length} 位 —— ` +
      `有人在載入時被丟掉了（schema／id／硬參照），⇒ 他的內嵌 castTimeSec 不會被寫。`,
  );
}

const fatal = skips.filter((s) => s.fatal);
if (skips.length) {
  console.log(`\n⚠️ 跳過 ${skips.length} 項（合法的 ${skips.length - fatal.length} · ⛔ 不合法的 ${fatal.length}）：`);
  for (const s of skips.slice(0, 40)) console.log(`   ${s.fatal ? "⛔" : "·"} ${s.what} —— ${s.why}`);
  if (skips.length > 40) console.log(`   …還有 ${skips.length - 40} 項`);
}
console.log(
  `\n對帳：走過 ${champsVisited}/${Champions.all().length} 位英雄 · 內嵌 castTimeSec 不符 ${drift.length} 格`,
);
if (champsVisited !== Champions.all().length || fatal.length || drift.length) {
  console.error(
    `\n⛔ deriveCastTimes **沒有寫完** —— ⛔ 不要 commit，也⛔ 不要當成 abilityMirror 的錯：\n` +
      `   · 走過 ${champsVisited} 位，註冊表裡有 ${Champions.all().length} 位\n` +
      `   · 不合法的跳過 ${fatal.length} 項 · 對帳不符 ${drift.length} 格`,
  );
  for (const d of drift.slice(0, 40)) console.error(`     ✗ ${d}`);
  if (drift.length > 40) console.error(`     …還有 ${drift.length - 40} 格`);
  process.exit(1);
}
console.log("Now run: pnpm content:build && pnpm content:validate");

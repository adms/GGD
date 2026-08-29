#!/usr/bin/env tsx
/**
 * LANE A — derive `castTimeSec` for every ability from `castTimeFormula.ts`,
 * report the resulting curve, and (with --write) apply it to content/.
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
  CD_CEILING_FRACTION,
  deriveCastTime,
  type CastTimeClass,
  type CastTimeResult,
} from "../src/content/castTimeFormula";
import type { AbilityDef } from "../src/sim/content/defs";

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

const envDoc = result.store.tryGet<{ multipliers: Record<string, number> }>("config", "combat-env");
const cdMult = envDoc?.multipliers.cooldown ?? 1;
console.log(`contentVersion ${result.manifest.contentVersion}`);
console.log(`abilities ${all.length}   combat-env cooldown multiplier x${cdMult}`);

const derived = new Map<string, CastTimeResult>();
for (const d of all) derived.set(d.id, deriveCastTime(d, cdMult));

// ---- 1. the histogram -----------------------------------------------------
const hist = new Map<string, number>();
for (const r of derived.values()) {
  const k = r.castTimeSec === undefined ? "(instant)" : r.castTimeSec.toFixed(1);
  hist.set(k, (hist.get(k) ?? 0) + 1);
}
console.log("\ncastTimeSec HISTOGRAM (all 554):");
for (const [k, n] of [...hist.entries()].sort((a, b) =>
  a[0] === "(instant)" ? -1 : b[0] === "(instant)" ? 1 : Number(a[0]) - Number(b[0]),
)) {
  console.log(`  ${k.padStart(9)}  ${String(n).padStart(3)}  ${"#".repeat(Math.round(n / 4))}`);
}

const withCt = [...derived.values()].filter((r) => r.castTimeSec !== undefined).map((r) => r.castTimeSec!);
withCt.sort((a, b) => a - b);
const q = (p: number) => withCt[Math.min(withCt.length - 1, Math.floor(p * withCt.length))]!;
const mean = withCt.reduce((s, v) => s + v, 0) / withCt.length;
console.log(
  `\nof the ${withCt.length} abilities that DO cast: mean ${mean.toFixed(3)}s  MEDIAN ${q(0.5).toFixed(1)}s  p25 ${q(0.25).toFixed(1)}  p75 ${q(0.75).toFixed(1)}  p90 ${q(0.9).toFixed(1)}  max ${withCt[withCt.length - 1]!.toFixed(1)}`,
);

// ---- 2. class breakdown ---------------------------------------------------
const byClass = new Map<CastTimeClass, AbilityDef[]>();
for (const d of all) {
  const c = derived.get(d.id)!.cls;
  (byClass.get(c) ?? byClass.set(c, []).get(c)!).push(d);
}
console.log("\nCLASS BREAKDOWN:");
for (const [c, list] of byClass) console.log(`  ${c.padEnd(13)} ${String(list.length).padStart(3)}`);

for (const c of ["passive-only", "mobility", "defensive", "rapid-fire"] as const) {
  const list = byClass.get(c) ?? [];
  if (!list.length) continue;
  console.log(`\n  -- ${c} (${list.length}) --`);
  for (const d of list) {
    const r = derived.get(d.id)!;
    console.log(
      `     ${d.id.padEnd(16)} [${d.slot.padEnd(2)}] cd ${String(r.features.minCooldown).padStart(5)} x${cdMult}=${(r.features.minCooldown * cdMult).toFixed(2)}s -> ${r.castTimeSec ?? "instant"}   ${d.name}`,
    );
  }
}

// ---- 3. what the ceilings actually clipped --------------------------------
const clippedCd = all.filter((d) => {
  const r = derived.get(d.id)!;
  return r.cls === "scored" && r.castTimeSec! < r.rawLadder && r.cooldownCeiling < r.rawLadder;
});
const clippedDur = all.filter((d) => {
  const r = derived.get(d.id)!;
  return r.cls === "scored" && r.castTimeSec! < r.rawLadder && r.durationCeiling < r.rawLadder;
});
console.log(`\nCOOLDOWN CEILING clipped ${clippedCd.length} abilities:`);
for (const d of clippedCd.slice(0, 20)) {
  const r = derived.get(d.id)!;
  console.log(
    `  ${d.id.padEnd(16)} ladder ${r.rawLadder.toFixed(1)} -> ${r.castTimeSec!.toFixed(1)}  (cd ${r.features.minCooldown}s x${cdMult} x${CD_CEILING_FRACTION} = ${r.cooldownCeiling.toFixed(2)})`,
  );
}
console.log(`DURATION CEILING clipped ${clippedDur.length} abilities:`);
for (const d of clippedDur) {
  const r = derived.get(d.id)!;
  console.log(`  ${d.id.padEnd(16)} ladder ${r.rawLadder.toFixed(1)} -> ${r.castTimeSec!.toFixed(1)}  (effect lasts ${r.features.effectDuration}s)`);
}

// ---- 4. the top of the curve ---------------------------------------------
const heaviest = all
  .filter((d) => (derived.get(d.id)!.castTimeSec ?? 0) >= 0.8)
  .sort((a, b) => derived.get(b.id)!.score - derived.get(a.id)!.score);
console.log(`\n>= 0.8s (${heaviest.length}) — the ones that must feel scary:`);
for (const d of heaviest.slice(0, 25)) {
  const r = derived.get(d.id)!;
  console.log(
    `  ${r.castTimeSec!.toFixed(1)}  ${d.id.padEnd(16)} [${d.slot.padEnd(2)}] dmg ${String(r.features.damage).padStart(5)} cc ${r.features.hardCc ? "STUN" : r.features.root ? "root" : "   -"} r ${r.features.radius.toFixed(1).padStart(4)}  ${d.name}`,
  );
}

// ---- 5. the pre-lane authored 10 -----------------------------------------
const PRE_LANE: Record<string, number> = {
  "godie-emfr.ex": 0.35,
  "godie-h02s.ex": 0.35,
  "godie-h02z.ex": 0.35,
  "godie-osam.ex": 0.35,
  "godie-ubal.ex": 0.35,
  "godie-h01u.e": 0.6,
  "godie-u010.ex": 0.6,
  "godie-uvng.ex": 0.6,
  "sela.r": 0.5,
  "thorne.r": 0.4,
};
console.log("\nTHE 10 PRE-LANE AUTHORED VALUES vs the formula:");
for (const [id, before] of Object.entries(PRE_LANE)) {
  const r = derived.get(id);
  if (!r) {
    console.log(`  ${id.padEnd(16)} MISSING`);
    continue;
  }
  const now = r.castTimeSec;
  const delta = now === undefined ? "instant" : `${now > before ? "+" : now < before ? "-" : "="}${Math.abs(now - before).toFixed(2)}`;
  console.log(`  ${id.padEnd(16)} ${String(before).padStart(4)} -> ${String(now ?? "instant").padStart(7)}  ${delta.padStart(7)}  [${r.cls}] score ${r.score.toFixed(3)}`);
}

// ---- 6. HUMAN ROOT DUTY (the metric the flat rule failed) -----------------
interface Duty {
  id: string;
  name: string;
  duty: number;
  detail: string;
}
const duties: Duty[] = [];
for (const c of Champions.all()) {
  let duty = 0;
  const parts: string[] = [];
  for (const s of ["Q", "W", "E", "R"] as const) {
    const emb = c.abilities[s];
    const def = Abilities.tryGet(emb.id);
    if (!def) continue;
    const r = derived.get(def.id)!;
    if (r.cls === "passive-only") continue;
    const ct = r.castTimeSec ?? 0;
    const cd = Math.min(...def.cooldown) * cdMult;
    if (cd <= 0) continue;
    const f = Math.min(1, ct / cd);
    duty += f;
    parts.push(`${s} ${ct}/${cd.toFixed(2)}=${(100 * f).toFixed(0)}%`);
  }
  duties.push({ id: c.id, name: c.name, duty: Math.min(1, duty), detail: parts.join(" ") });
}
duties.sort((a, b) => b.duty - a.duty);
const dutyMean = duties.reduce((s, r) => s + r.duty, 0) / duties.length;
console.log("\nHUMAN ROOT DUTY (player casts every slot the moment it is up):");
console.log(
  `  champions ${duties.length}  mean ${(100 * dutyMean).toFixed(1)}%  median ${(100 * duties[Math.floor(duties.length / 2)]!.duty).toFixed(1)}%`,
);
console.log(`  >=100% (STATUES): ${duties.filter((r) => r.duty >= 0.999).length}`);
console.log(`  >= 50%:           ${duties.filter((r) => r.duty >= 0.5).length}`);
console.log(`  >= 25%:           ${duties.filter((r) => r.duty >= 0.25).length}`);
console.log("  worst 8:");
for (const r of duties.slice(0, 8)) console.log(`    ${(100 * r.duty).toFixed(0).padStart(3)}%  ${r.id.padEnd(13)} ${r.detail}`);

// ---- 7. per-ability self-lock invariant -----------------------------------
const selfLock = all.filter((d) => {
  const r = derived.get(d.id)!;
  const cd = Math.min(...d.cooldown) * cdMult;
  return (r.castTimeSec ?? 0) > 0 && cd > 0 && cd < (r.castTimeSec ?? 0);
});
console.log(`\nabilities whose cast time exceeds their own real cooldown: ${selfLock.length} (must be 0)`);
for (const d of selfLock) console.log(`  ! ${d.id}`);

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

let abilityFiles = 0;
for (const d of all) {
  const p = join(CONTENT_DIR, "abilities", `${d.id}.json`);
  let raw: string;
  try {
    raw = readFileSync(p, "utf8");
  } catch {
    continue; // TS-skeleton-only ability with no standalone doc
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
  if (next !== raw) {
    writeFileSync(p, next);
    abilityFiles++;
  }
}

let champFiles = 0;
let embedded = 0;
for (const c of Champions.all()) {
  const p = join(CONTENT_DIR, "champions", `${c.id}.json`);
  let raw: string;
  try {
    raw = readFileSync(p, "utf8");
  } catch {
    continue;
  }
  let text = raw;
  for (const s of ["Q", "W", "E", "R"] as const) {
    const r = derived.get(c.abilities[s].id);
    if (!r) continue;
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
    writeFileSync(p, text);
    champFiles++;
  }
}
console.log(`\nWROTE ${abilityFiles} ability docs, ${champFiles} champion docs (${embedded} embedded copies).`);
console.log("Now run: pnpm content:build && pnpm content:validate");

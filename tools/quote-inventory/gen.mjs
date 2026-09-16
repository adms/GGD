/**
 * 角色名言總表 —— 把「每位英雄的名言是什麼、從哪來」收成一張表。
 *
 * > owner 2026-09-17：「你是不是忘記把所有角色我跟你對應過的角色名言建檔」
 * > owner 2026-09-17：「請你整合後 commit + push 分支」
 *
 * ⭐ 名言散在**三個住處**，在這支之前沒有任何一份文件把它們併起來看：
 *   ① `content/assets/audio/voices/lines/OWNER_LINES.csv` 的 `quote` 欄 —— owner 自己填的台詞（V3 包）
 *   ② `content/assets/audio/voices/lines/COMBAT_ORIGINALS.json` 的 `quote`／`quote.N` —— 聽審採用的原作語音
 *   ③ `content/assets/audio/voices/quotes/quotes.json` —— 選角畫面那一套（`voices:build` 的產物）
 * ⇒ 這支**只讀不改**那三份，產出 `docs/角色名言總表.md` 與 `tools/quote-inventory/inventory.json`。
 *
 *   node --import tsx tools/quote-inventory/gen.mjs            # 重新產生
 *   node --import tsx tools/quote-inventory/gen.mjs --check    # 閘：過期或缺口變多就回非零
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readStarterRoster } from "../../packages/shared/testkit/starterRoster.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LINES = join(ROOT, "content/assets/audio/voices/lines");
const CHECK = process.argv.includes("--check");
const DOC = join(ROOT, "docs/角色名言總表.md");
const JSON_OUT = join(ROOT, "tools/quote-inventory/inventory.json");
const RATCHET = join(ROOT, "tools/quote-inventory/ratchet.json");
const read = (p, d = null) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d);

/** OWNER_LINES.csv 的一列可能帶引號與逗號 ⇒ ⛔ 不可以 split(",") */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (const ch of text.replace(/^﻿/, "").replace(/\r/g, "")) {
    if (q) { if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift() ?? [];
  return rows.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const roster = readStarterRoster(ROOT);
const owner = Object.fromEntries(parseCsv(readFileSync(join(LINES, "OWNER_LINES.csv"), "utf8")).map((r) => [r.championId, (r.quote ?? "").trim()]));
const originals = read(join(LINES, "COMBAT_ORIGINALS.json"), { champions: {} }).champions;
const select = read(join(ROOT, "content/assets/audio/voices/quotes/quotes.json"), { quotes: {}, unsourced: [] });
const unsourced = Object.fromEntries((select.unsourced ?? []).map((u) => [u.id, u.why ?? ""]));
const index = read(join(ROOT, "materials/hero-model-library/voice-index.json"), { groups: [] }).groups ?? [];

const nameOf = (id) => read(join(ROOT, `content/champions/${id}.json`), {})?.name ?? id;
/** 這位英雄在素材庫裡找得到的原作語音包（同名或已綁 heroIds）—— ⚠️ 同名只是候選，⛔ 不是身分證明 */
const candidatesFor = (id, name) => {
  const tokens = (name.replace(/^.*?[-－]\s*/, "").split(/[\s·.,、（）()]+/).filter((t) => t.length >= 2));
  return index
    .filter((g) => (g.heroIds ?? []).includes(id) || tokens.some((t) => `${g.name ?? ""} ${g.id ?? ""}`.includes(t)))
    .map((g) => ({ id: g.id, name: g.name ?? "", library: g.library ?? "", language: g.language ?? "", bound: (g.heroIds ?? []).includes(id) }));
};

const rows = [];
for (const id of roster) {
  const name = nameOf(id);
  const orig = Object.entries(originals[id] ?? {}).filter(([k]) => k === "quote" || k.startsWith("quote."));
  const status = read(join(LINES, id, "status.json"), { lines: {} }).lines ?? {};
  const shipped = status.quote ?? null;
  const sel = select.quotes?.[id] ?? null;
  const battle = owner[id]
    ? { source: "owner 名單", text: owner[id].split("|")[0] }
    : orig.length
      ? { source: "原作語音", text: `（原檔）${orig[0][1].name ?? orig[0][1].src ?? ""}` }
      : shipped?.textSource
        ? { source: shipped.textSource === "original" ? "原作語音" : "合成", text: shipped.text ?? "" }
        : null;
  rows.push({
    id, name,
    battle, takes: Math.max(orig.length, shipped ? 1 : 0),
    select: sel ? { text: sel.jpQuote ?? "", real: !!sel.real } : null,
    unsourcedWhy: unsourced[id] ?? "",
    candidates: battle ? [] : candidatesFor(id, name),
  });
}

const missBattle = rows.filter((r) => !r.battle);
const missSelect = rows.filter((r) => !r.select);
const ratchet = read(RATCHET, { battleMissing: missBattle.length, selectMissing: missSelect.length });

const cell = (s) => String(s ?? "").replace(/\|/g, "／").replace(/\n/g, " ").slice(0, 60);
const doc = [
  "# 角色名言總表",
  "",
  "> owner 2026-09-17：「你是不是忘記把所有角色我跟你對應過的角色名言建檔」",
  "",
  "⛔ 這份是 `tools/quote-inventory/gen.mjs` 的產物，**不要手改**；改來源再跑一次。",
  "名言散在三個住處（owner 名單 `OWNER_LINES.csv`／聽審採用的原作 `COMBAT_ORIGINALS.json`／選角畫面 `voices/quotes/quotes.json`），這張表把它們併起來看。",
  "",
  `出貨名單 **${roster.length}** 位：戰鬥名言有 **${roster.length - missBattle.length}** 位（⛔ 缺 **${missBattle.length}**）· 選角名言有 **${roster.length - missSelect.length}** 位（⛔ 缺 **${missSelect.length}**）。`,
  "",
  "| 英雄 | id | 戰鬥名言 | 來源 | 段數 | 選角名言 |",
  "|---|---|---|---|---:|---|",
  ...rows.map((r) => `| ${cell(r.name)} | \`${r.id}\` | ${r.battle ? cell(r.battle.text) : "⛔ 無"} | ${r.battle?.source ?? "—"} | ${r.takes || "—"} | ${r.select ? cell(r.select.text) : "⛔ 無"} |`),
  "",
  `## ⛔ 戰鬥名言缺口（${missBattle.length} 位）`,
  "",
  "「素材庫候選」＝ 語音索引裡同名或已綁定的語音包。⚠️ 同名只是候選，⛔ 不是身分證明；⭐ 一句候選都沒有的，只能借別位英雄的聲音或由 owner 給台詞。",
  "",
  "| 英雄 | id | 素材庫候選 | 選角名言沒來源的理由 |",
  "|---|---|---|---|",
  ...missBattle.map((r) => `| ${cell(r.name)} | \`${r.id}\` | ${r.candidates.length ? r.candidates.map((c) => `\`${c.id}\``).join("、") : "⛔ 零"} | ${cell(r.unsourcedWhy) || "—"} |`),
  "",
].join("\n");

const inventory = { schema: "ggd.champion-quote-inventory@1", generator: "tools/quote-inventory/gen.mjs", roster: roster.length, battleMissing: missBattle.length, selectMissing: missSelect.length, rows };
const stale = [];
const put = (path, text) => {
  const prev = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (prev === text) return;
  if (CHECK) stale.push(path); else writeFileSync(path, text);
};
put(DOC, doc);
put(JSON_OUT, `${JSON.stringify(inventory, null, 1)}\n`);
if (!CHECK && !existsSync(RATCHET)) writeFileSync(RATCHET, `${JSON.stringify({ battleMissing: missBattle.length, selectMissing: missSelect.length }, null, 1)}\n`);

if (CHECK) {
  const grew = [];
  if (missBattle.length > ratchet.battleMissing) grew.push(`戰鬥名言缺口 ${ratchet.battleMissing} → ${missBattle.length}`);
  if (missSelect.length > ratchet.selectMissing) grew.push(`選角名言缺口 ${ratchet.selectMissing} → ${missSelect.length}`);
  if (stale.length || grew.length) {
    console.error(`[quote-inventory] ⛔ ${[...stale.map((p) => `${p} 過期`), ...grew].join("；")} —— 跑 \`node --import tsx tools/quote-inventory/gen.mjs\``);
    process.exit(1);
  }
  console.log(`[quote-inventory] ✓ ${roster.length} 位 · 戰鬥名言缺 ${missBattle.length} · 選角名言缺 ${missSelect.length}`);
} else {
  console.log(`[quote-inventory] ${roster.length} 位 · 戰鬥名言缺 ${missBattle.length} · 選角名言缺 ${missSelect.length} → docs/角色名言總表.md`);
}

#!/usr/bin/env tsx
/**
 * ⭐【把技能說明從**手打數字**轉成**佔位符**】說明推導（票號待開）
 *
 * 語法與算繪住在 `packages/shared/src/content/abilityProse.ts`（**唯一**的算繪處）。
 * 這一支只做**轉檔**：讀出貨內容 → 套 `placeholderizeAbilityText` → 寫回
 * 三個住處。
 *
 * ⛔ **三個住處要一起動**，缺一個就是一次無聲的回退：
 *   ① `content/abilities/<id>.json`      —— 出貨的那一份
 *   ② `content/champions/<cid>.json`     —— 鏡像（`abilityMirror.test.ts` 在對）
 *   ③ `tools/skill-remake/heroes/*.py`   —— 那 90 支的**來源**。⛔ 只改 ① 的話
 *      下一次 `pnpm skills:sync` 會把它逐位元組蓋回手打數字，
 *      而 `skillremake:json:check` 只會說「產生器與出貨不一致」，⛔ 不會說是誰對。
 *
 * ⚠️ **寫回去是逐字元的外科手術**（只換 `"description"` 那一段字面值），
 * ⛔ 不是 `JSON.parse` → `JSON.stringify` 重寫整份 —— 後者會把出貨檔裡的
 * `45.0` 全部寫成 `45`，一次產生 420 份與這次改動無關的 diff。
 *
 * 用法：
 *   pnpm tsx tools/card-prose/apply_placeholders.ts            # 寫回三個住處
 *   pnpm tsx tools/card-prose/apply_placeholders.ts --check    # 只看，有待轉就回非零
 *   pnpm tsx tools/card-prose/apply_placeholders.ts --report <path.md>
 *
 * ⛔ 刻意沒有產生日期（同 `caps:export` / `spec:build`）：任何隨時鐘變動的欄位
 * 都會讓逐位元組比對永遠不相等，於是 `--check` 只能被放寬成模糊比對 ——
 * 而一條被放寬的閘等於沒有閘。
 */
// ggd:writes content/abilities/*.json
// ggd:writes content/champions/*.json
// ggd:writes tools/skill-remake/heroes/*.py
// ⭐ GH#960 —— **靜態產物宣告**（merge-io.mjs 收割）。這一支是「有待轉的佔位符才寫」
//    的條件寫入端：兩趟量測（乾淨樹 + HEAD~60 回捲）都量到 0 寫，因為兩棵樹上的說明
//    早就轉完了 ⇒ 戶籍表漏登三個住處 ⇒ genrun 解鎖不到 ⇒ 單獨跑吃 EACCES。
//    宣告放在寫入端旁邊（第〇·四守則：單一住處），⛔ 不是手編 sync-io.json。
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
// 🔒 GH#706 —— ①② 是 skillremake:json 的產物（平時 chmod 444，產物隔離區）:
//    直寫必吃 EACCES。writeProduct = 寫入點自解鎖（generateFamilyContent 的同一個前例）。
//    ③ 的 .py 與備份/報告不是產物,照舊 writeFileSync。
import { writeProduct } from "../../packages/shared/src/ops/writeProduct";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadContentCached } from "../../packages/shared/src/content/cache/index";
import { Arenas, Configs, registerAll } from "../../packages/shared/src/content/registries";
import { Abilities, Champions } from "../../packages/shared/src/sim/content/registry";
import { aoeTiersFromDoc } from "../../packages/shared/src/content/aoeTiers";
import { rangeTiersFromDoc } from "../../packages/shared/src/content/rangeTiers";
import {
  displacementTiersFromDoc,
  minBodyRadiusFromConfigs,
} from "../../packages/shared/src/content/displacementTiers";
import {
  abilityQuantities,
  placeholderizeAbilityText,
  renderAbilityText,
  type AbilityQuantities,
  type ProseFinding,
  type ProseTables,
} from "../../packages/shared/src/content/abilityProse";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTENT = join(REPO, "content");
const HEROES = join(REPO, "tools/skill-remake/heroes");

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const REPORT = argv.includes("--report") ? argv[argv.indexOf("--report") + 1] : undefined;

/* ────────────────────────── 級距表（⛔ 不抄字面值）────────────────────────── */

function tablesFromRegistries(): ProseTables {
  const cfgs = Configs.all() as unknown as { schema?: string }[];
  const aoe = aoeTiersFromDoc(cfgs.find((c) => c.schema === "config.aoe-tiers@1"));
  const rng = rangeTiersFromDoc(cfgs.find((c) => c.schema === "config.range-tiers@1"));
  const disp = displacementTiersFromDoc(
    cfgs.find((c) => c.schema === "config.displacement-tiers@1"),
    minBodyRadiusFromConfigs(cfgs as never),
  );
  return {
    range: rng.range,
    radius: aoe.radius,
    travel: Object.fromEntries(
      Object.entries(disp.travel).map(([k, v]) => [k, (v as { distance: number }).distance]),
    ) as ProseTables["travel"],
    push: Object.fromEntries(
      Object.entries(disp.push).map(([k, v]) => [k, (v as { distance: number }).distance]),
    ) as ProseTables["push"],
    zoneRadius: Math.min(...Arenas.all().flatMap((a) => a.zones.map((z) => z.boundaryRadius))),
  };
}

/* ────────────────────────────── 一支技能一列 ────────────────────────────── */

interface Row {
  readonly id: string;
  readonly name: string;
  readonly before: string;
  readonly after: string;
  readonly findings: readonly ProseFinding[];
  /** 算繪回去的字。⭐ 三軸的代換**逐位元組可逆**，幾何不是（那是 owner 的裁決）。 */
  readonly rendered: string;
}

/** 技能 id → 註冊表裡那一份的量（模板展開後、級距解析後）。 */
function quantitiesById(t: ProseTables): Map<string, AbilityQuantities> {
  const out = new Map<string, AbilityQuantities>();
  for (const id of Abilities.ids()) out.set(id, abilityQuantities(Abilities.get(id), t));
  for (const cid of Champions.ids()) {
    const c = Champions.get(cid)!;
    for (const slot of Object.keys(c.abilities)) {
      const a = (c.abilities as Record<string, unknown>)[slot] as { id?: string };
      if (typeof a?.id === "string" && !out.has(a.id)) out.set(a.id, abilityQuantities(a, t));
    }
  }
  return out;
}

const jsonLit = (s: string): string => JSON.stringify(s);

/**
 * 把 `"description": <old>` 那一段就地換成 `<new>`，⛔ 不重寫整份 JSON。
 * `anchor` 是「從哪個位置之後開始找」（鏡像檔一份裡有好幾支技能）。
 */
function spliceDescription(raw: string, oldLit: string, newLit: string, anchor: number): string | undefined {
  const at = raw.indexOf(oldLit, anchor);
  return at < 0 ? undefined : raw.slice(0, at) + newLit + raw.slice(at + oldLit.length);
}

/* ──────────────────────────────── main ──────────────────────────────── */

async function main(): Promise<void> {
  registerAll((await loadContentCached({ rootDir: CONTENT })).store);
  const tables = tablesFromRegistries();
  const q = quantitiesById(tables);

  // ⛔ 讀**磁碟**上的說明，不是註冊表 —— 註冊表那一份已經算繪過了。
  const disk = new Map<string, { path: string; description: string; name: string }>();
  for (const f of readdirSync(join(CONTENT, "abilities")).sort()) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const path = join(CONTENT, "abilities", f);
    const d = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (typeof d["id"] !== "string") continue;
    disk.set(d["id"], {
      path,
      description: typeof d["description"] === "string" ? (d["description"] as string) : "",
      name: String(d["name"] ?? d["id"]),
    });
  }

  const rows: Row[] = [];
  for (const [id, e] of disk) {
    if (e.description.trim() === "") continue;
    const quantities = q.get(id);
    if (quantities === undefined) continue;
    const { next, findings } = placeholderizeAbilityText(e.description, quantities);
    if (next === e.description) continue;
    rows.push({
      id,
      name: e.name,
      before: e.description,
      after: next,
      findings,
      rendered: renderAbilityText(next, quantities),
    });
  }
  const byId = new Map(rows.map((r) => [r.id, r]));

  if (REPORT) writeReport(rows);
  if (CHECK) {
    console.log(`待轉 ${rows.length} 份`);
    process.exit(rows.length === 0 ? 0 : 1);
  }
  if (rows.length === 0) {
    console.log("沒有待轉的說明。");
    return;
  }

  // ── ⛔ 覆蓋之前先留一份（第零守則：取代之前先備份）────────────────────
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13);
  const legacy = join(REPO, "docs/legacy", `_ability-prose-before-placeholders_temp_${stamp}`);
  mkdirSync(legacy, { recursive: true });
  writeFileSync(
    join(legacy, "descriptions.json"),
    JSON.stringify(Object.fromEntries(rows.map((r) => [r.id, r.before])), null, 2) + "\n",
    "utf8",
  );

  let files = 0;
  const missed: string[] = [];

  // ① standalone
  for (const r of rows) {
    const path = disk.get(r.id)!.path;
    const raw = readFileSync(path, "utf8");
    const next = spliceDescription(raw, jsonLit(r.before), jsonLit(r.after), 0);
    if (next === undefined) {
      missed.push(`${r.id}（standalone）`);
      continue;
    }
    writeProduct(path, next);
    files++;
  }

  // ② champion-embedded 鏡像 —— 一份裡有好幾支，所以用 `"id": "<技能>"` 當錨。
  for (const f of readdirSync(join(CONTENT, "champions")).sort()) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const path = join(CONTENT, "champions", f);
    let raw = readFileSync(path, "utf8");
    const doc = JSON.parse(raw) as { abilities?: Record<string, { id?: string; description?: string }> };
    let touched = false;
    for (const slot of Object.keys(doc.abilities ?? {})) {
      const a = doc.abilities![slot]!;
      const r = typeof a.id === "string" ? byId.get(a.id) : undefined;
      if (r === undefined || a.description !== r.before) continue;
      const anchor = raw.indexOf(jsonLit(a.id!));
      const next = spliceDescription(raw, jsonLit(r.before), jsonLit(r.after), anchor < 0 ? 0 : anchor);
      if (next === undefined) {
        missed.push(`${a.id}（鏡像 ${f}）`);
        continue;
      }
      raw = next;
      touched = true;
    }
    if (touched) {
      writeProduct(path, raw);
      files++;
    }
  }

  // ③ 那 90 支的**來源**（⛔ 少了這一步，skills:sync 會把 ① 蓋回去）
  const py = patchHeroSpecs(rows, missed);

  writeFileSync(join(legacy, "README.md"), legacyNote(rows.length, files, py), "utf8");
  console.log(`改寫 ${rows.length} 支技能 / ${files} 個 JSON / ${py} 處產生器規格字串`);
  console.log(`原文備份：${legacy}`);
  if (missed.length > 0) {
    console.error(`⛔ 這幾處沒換到（字面值找不到）：\n  ${missed.join("\n  ")}`);
    process.exit(1);
  }
}

/**
 * 把那 90 支的規格字串就地換掉。
 *
 * ⚠️ 比對的是 **Python 字面值的樣子**（`"…\n…"`），⛔ 不是解析後的字串 ——
 * 分片裡的 desc 一律是單行雙引號字面值，所以逐位元組換掉是安全且可驗的。
 * ⭐ 換不到的**大聲報出來**（`missed`），⛔ 不靜默跳過：一支沒換到的技能會在
 * 下一次 `skills:sync` 把出貨檔蓋回手打數字，而那時沒有人記得今天發生過什麼。
 */
function patchHeroSpecs(rows: readonly Row[], missed: string[]): number {
  const files = readdirSync(HEROES)
    .filter((f) => f.endsWith(".py"))
    .map((f) => join(HEROES, f));
  const src = new Map(files.map((p) => [p, readFileSync(p, "utf8")]));
  let n = 0;
  for (const r of rows) {
    const lit = pyLiteral(r.before);
    const hit = files.find((p) => src.get(p)!.includes(lit));
    if (hit === undefined) continue; // ⇒ 這一支不歸產生器管（371 支 w3x 匯入的那些）
    src.set(hit, src.get(hit)!.split(lit).join(pyLiteral(r.after)));
    n++;
  }
  for (const [p, s] of src) if (s !== readFileSync(p, "utf8")) writeFileSync(p, s, "utf8");
  // 產生器管的那些一支都不可以漏 —— provenance 是 owner-spec 卻沒換到就是漏了。
  for (const r of rows) {
    if (!OWNER_SPEC.has(r.id)) continue;
    if (!files.some((p) => src.get(p)!.includes(pyLiteral(r.after)))) {
      missed.push(`${r.id}（產生器規格字串）`);
    }
  }
  return n;
}

/** provenance 只在磁碟上（登錄表不帶它）—— `owner-spec` ⇔ batch1.py 產生的那些。 */
const OWNER_SPEC = new Set<string>(
  readdirSync(join(CONTENT, "abilities"))
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .map((f) => JSON.parse(readFileSync(join(CONTENT, "abilities", f), "utf8")) as Record<string, unknown>)
    .filter((d) => d["provenance"] === "owner-spec")
    .map((d) => String(d["id"])),
);

const pyLiteral = (s: string): string =>
  `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;

const legacyNote = (rows: number, files: number, py: number): string =>
  [
    "# 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開））",
    "",
    `· 改寫 **${rows}** 支技能、**${files}** 個 JSON、**${py}** 處產生器規格字串。`,
    "· `descriptions.json` 是**轉檔前**的逐字原文，鍵是技能 id。",
    "",
    "⚠️ 這一份存在的理由與 `docs/legacy/_w3x-fidelity-superseded.md` 相同：",
    "**測試可以跟著設計走，知識不可以無聲消失。**",
    "",
    "⭐ 三軸（冷卻／耗魔／傷害）的代換是**逐位元組可逆**的 ——",
    "`renderAbilityText()` 算回去與原文相同。幾何（距離／範圍）**刻意不同**：",
    "owner 2026-08-19「所有卡面範圍跟距離說明都應該要跟著改五級距」。",
    "",
  ].join("\n");

function writeReport(rows: readonly Row[]): void {
  const esc = (s: string): string => s.replace(/\|/g, "\\|").replace(/\n/g, "⏎");
  const lines = ["# 技能說明佔位符轉檔（說明推導（票號待開））", "", `改寫 ${rows.length} 支。`, ""];
  const per = new Map<string, number>();
  for (const r of rows) for (const f of r.findings) per.set(f.rule, (per.get(f.rule) ?? 0) + 1);
  lines.push("| 規則 | 處數 |", "|---|---:|");
  for (const [k, v] of [...per].sort()) lines.push(`| ${k} | ${v} |`);
  lines.push("", "| 技能 | 前 | 後 | 算繪回去 | 可逆 |", "|---|---|---|---|---|");
  for (const r of rows) {
    const geo = r.findings.some((f) => f.rule === "geo-tiered");
    lines.push(
      `| ${r.id} ${esc(r.name)} | ${esc(r.before)} | ${esc(r.after)} | ${esc(r.rendered)} | ${
        r.rendered === r.before ? "✅" : geo ? "幾何（裁決）" : "⛔"
      } |`,
    );
  }
  mkdirSync(dirname(REPORT!), { recursive: true });
  writeFileSync(REPORT!, lines.join("\n") + "\n", "utf8");
}

void main();

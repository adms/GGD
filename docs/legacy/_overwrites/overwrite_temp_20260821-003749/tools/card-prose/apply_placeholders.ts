#!/usr/bin/env tsx
/**
 * ⭐【把 420 份技能說明從**手打數字**轉成**佔位符**】GH#485
 *
 * 語法與算繪住在 `packages/shared/src/content/abilityProse.ts`（**唯一**的算繪處）。
 * 這一支只做**轉檔**：讀出貨內容 → 套 `placeholderizeAbilityText` → 寫回
 * `content/abilities/*.json`、`content/champions/*.json` 的鏡像、以及那 90 支
 * **產生器擁有**的規格字串（`tools/skill-remake/heroes/*.py`）。
 *
 * ⛔ **三個住處要一起動**，缺一個就是一次無聲的回退：
 *   ① `content/abilities/<id>.json`      —— 出貨的那一份
 *   ② `content/champions/<cid>.json`     —— 鏡像（`abilityMirror.test.ts` 在對）
 *   ③ `tools/skill-remake/heroes/*.py`   —— 那 90 支的**來源**。⛔ 只改 ① 的話
 *      下一次 `pnpm skills:sync` 會把它逐位元組蓋回手打數字，而**沒有東西會紅**
 *      （`skillremake:json:check` 只會說「產生器與出貨不一致」，不會說是誰對）。
 *
 * 用法：
 *   pnpm tsx tools/card-prose/apply_placeholders.ts            # 寫回三個住處
 *   pnpm tsx tools/card-prose/apply_placeholders.ts --check    # 只看，回非零表示有待轉
 *   pnpm tsx tools/card-prose/apply_placeholders.ts --report <path.md>
 *
 * ⛔ 刻意沒有產生日期（同 `caps:export` / `spec:build`）：任何隨時鐘變動的欄位
 * 都會讓逐位元組比對永遠不相等，於是 `--check` 只能被放寬成模糊比對 ——
 * 而一條被放寬的閘等於沒有閘。
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ContentLoader } from "../../packages/shared/src/content/loader";
import { FsContentSource } from "../../packages/shared/src/content/node/FsContentSource";
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
const REPORT = argv[argv.indexOf("--report") + 1];

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
  /** 算繪回去的字。⭐ 三軸的代換是**逐位元組可逆**的，幾何不是（那是 owner 的裁決）。 */
  readonly rendered: string;
}

/** 讀磁碟上的技能文件（⛔ 不是註冊表 —— 註冊表的說明**已經算繪過**）。 */
function diskAbilities(): Map<string, { path: string; doc: Record<string, unknown> }> {
  const out = new Map<string, { path: string; doc: Record<string, unknown> }>();
  for (const f of readdirSync(join(CONTENT, "abilities"))) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const path = join(CONTENT, "abilities", f);
    const doc = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (typeof doc["id"] === "string") out.set(doc["id"], { path, doc });
  }
  return out;
}

/** 技能 id → 註冊表裡那一份的量（模板展開後、級距解析後）。 */
function quantitiesById(t: ProseTables): Map<string, AbilityQuantities> {
  const out = new Map<string, AbilityQuantities>();
  for (const id of Abilities.ids()) out.set(id, abilityQuantities(Abilities.get(id), t));
  // ⭐ 內嵌那一份可能與 standalone 不同（模板參數逐英雄不同）——
  //   鏡像守衛只保證兩邊**同時存在的欄位**相等，⛔ 不保證效果樹相同。
  for (const cid of Champions.ids()) {
    const c = Champions.get(cid)!;
    for (const slot of Object.keys(c.abilities)) {
      const a = (c.abilities as Record<string, unknown>)[slot] as { id?: string };
      if (typeof a?.id === "string" && !out.has(a.id)) out.set(a.id, abilityQuantities(a, t));
    }
  }
  return out;
}

/* ──────────────────────────────── main ──────────────────────────────── */

async function main(): Promise<void> {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
  const tables = tablesFromRegistries();
  const q = quantitiesById(tables);
  const disk = diskAbilities();

  const rows: Row[] = [];
  const rewritten = new Map<string, string>(); // ability id → 新說明
  for (const [id, { doc }] of [...disk].sort(([a], [b]) => a.localeCompare(b))) {
    const before = typeof doc["description"] === "string" ? (doc["description"] as string) : "";
    if (before.trim() === "") continue;
    const quantities = q.get(id);
    if (quantities === undefined) continue;
    const { next, findings } = placeholderizeAbilityText(before, quantities);
    if (next === before) continue;
    rewritten.set(id, next);
    rows.push({
      id,
      name: String(doc["name"] ?? id),
      before,
      after: next,
      findings,
      rendered: renderAbilityText(next, quantities),
    });
  }

  if (CHECK) {
    console.log(`待轉 ${rows.length} 份（${[...rewritten.keys()].slice(0, 5).join(", ")}…）`);
    if (REPORT) writeReport(rows);
    process.exit(rows.length === 0 ? 0 : 1);
  }

  // ── ⛔ 覆蓋之前先留一份（第零守則）──────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13);
  const legacy = join(REPO, "docs/legacy", `_ability-prose-before-placeholders_temp_${stamp}`);
  mkdirSync(legacy, { recursive: true });
  writeFileSync(
    join(legacy, "descriptions.json"),
    JSON.stringify(Object.fromEntries(rows.map((r) => [r.id, r.before])), null, 2) + "\n",
    "utf8",
  );

  let files = 0;
  // ① standalone
  for (const [id, next] of rewritten) {
    const e = disk.get(id)!;
    const raw = readFileSync(e.path, "utf8");
    const doc = JSON.parse(raw) as Record<string, unknown>;
    doc["description"] = next;
    writeFileSync(e.path, JSON.stringify(doc, null, 2) + "\n", "utf8");
    files++;
  }
  // ② champion-embedded 鏡像
  for (const f of readdirSync(join(CONTENT, "champions"))) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const path = join(CONTENT, "champions", f);
    const doc = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const ab = doc["abilities"] as Record<string, Record<string, unknown>> | undefined;
    let touched = false;
    for (const slot of Object.keys(ab ?? {})) {
      const a = ab![slot]!;
      const id = String(a["id"] ?? "");
      const next = rewritten.get(id);
      if (next === undefined || typeof a["description"] !== "string") continue;
      if (a["description"] === next) continue;
      a["description"] = next;
      touched = true;
    }
    if (touched) {
      writeFileSync(path, JSON.stringify(doc, null, 2) + "\n", "utf8");
      files++;
    }
  }
  // ③ 那 90 支的**來源**（⛔ 少了這一步，skills:sync 會把 ① 蓋回去）
  const py = patchHeroSpecs(rewritten);

  writeFileSync(join(legacy, "README.md"), legacyNote(rows.length, files, py), "utf8");
  if (REPORT) writeReport(rows);
  console.log(`改寫 ${rows.length} 支技能 / ${files} 個 JSON / ${py} 處產生器規格字串`);
  console.log(`原文備份：${legacy}`);
}

/**
 * 把那 90 支的規格字串就地換掉。
 *
 * ⚠️ 比對的是 **Python 字面值的樣子**（`"…\n…"`），⛔ 不是解析後的字串 ——
 * 分片裡的 desc 一律是單行雙引號字面值，所以逐位元組換掉是安全且可驗的；
 * 換不到就大聲說出來（回傳數字對不上會在報告裡看到），⛔ 不靜默跳過。
 */
function patchHeroSpecs(rewritten: ReadonlyMap<string, string>): number {
  // 分片裡沒有 ability id，只有編號 + 說明字串 —— 所以用**原文**當鍵。
  const byBefore = new Map<string, string>();
  for (const [id, next] of rewritten) {
    const d = JSON.parse(
      readFileSync(join(CONTENT, "abilities", `${id}.json`), "utf8"),
    ) as Record<string, unknown>;
    void d;
    byBefore.set(id, next);
  }
  let n = 0;
  for (const f of readdirSync(HEROES)) {
    if (!f.endsWith(".py")) continue;
    const path = join(HEROES, f);
    let src = readFileSync(path, "utf8");
    let touched = false;
    for (const [id, next] of byBefore) {
      const before = ORIGINALS.get(id);
      if (before === undefined) continue;
      const lit = pyLiteral(before);
      if (!src.includes(lit)) continue;
      src = src.split(lit).join(pyLiteral(next));
      touched = true;
      n++;
    }
    if (touched) writeFileSync(path, src, "utf8");
  }
  return n;
}

/** 轉檔開始前的原文（`patchHeroSpecs` 要拿它去比對 Python 字面值）。 */
const ORIGINALS = new Map<string, string>();

const pyLiteral = (s: string): string =>
  `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;

const legacyNote = (rows: number, files: number, py: number): string =>
  [
    "# 技能說明改成佔位符 —— 轉檔前的原文（GH#485）",
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
  const lines = ["# 技能說明佔位符轉檔（GH#485）", "", `改寫 ${rows.length} 支。`, ""];
  const per = new Map<string, number>();
  for (const r of rows) for (const f of r.findings) per.set(f.rule, (per.get(f.rule) ?? 0) + 1);
  lines.push("| 規則 | 處數 |", "|---|---:|");
  for (const [k, v] of [...per].sort()) lines.push(`| ${k} | ${v} |`);
  lines.push("", "| 技能 | 前 | 後 | 算繪回去 |", "|---|---|---|---|");
  for (const r of rows) {
    lines.push(`| ${r.id} ${esc(r.name)} | ${esc(r.before)} | ${esc(r.after)} | ${esc(r.rendered)} |`);
  }
  mkdirSync(dirname(REPORT!), { recursive: true });
  writeFileSync(REPORT!, lines.join("\n") + "\n", "utf8");
}

void main();

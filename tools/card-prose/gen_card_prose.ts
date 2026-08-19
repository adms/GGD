#!/usr/bin/env tsx
/**
 * 卡面文案規則 —— **產生器 / diff 預覽**（GH#461）。
 *
 * ⛔ **這支腳本一個位元組都不寫進 `content/`。** 它讀出貨內容、套
 * {@link ../card-prose/cardProseRule} 的規則、把**改寫前後**與**待判斷清單**
 * 寫成一份報告。理由有兩個，都不是保守：
 *   ① 20 個英雄的 `content/abilities/*.json` 是 `tools/skill-remake/batch1.py`
 *      **產生**的（CLAUDE.md 硬性約束）—— 手改那些檔案的下一次重生成就被沖掉。
 *      正確的套用路徑是「改產生器 → 重生成」，而這份報告就是那次改動的規格。
 *   ② 描述在 `content/champions/*.json` 裡有**第二份鏡像**
 *      （`abilityMirror.test.ts`）。⇒ 套用是 standalone + embedded 兩邊一起動，
 *      ⛔ 不是改一個檔。
 *
 * 用法：
 *   pnpm tsx tools/card-prose/gen_card_prose.ts                 # 預設寫到 /private/tmp
 *   pnpm tsx tools/card-prose/gen_card_prose.ts --out <path.md>
 *   pnpm tsx tools/card-prose/gen_card_prose.ts --keep-numbers   # 冷卻/耗魔留在文案
 *   pnpm tsx tools/card-prose/gen_card_prose.ts --json <path>    # 機器讀的那一份
 *
 * ⛔ 刻意沒有產生日期（同 `caps:export` / `spec:build`）：任何隨時鐘變動的欄位
 * 都會讓逐位元組比對永遠不相等，於是任何 `--check` 只能被放寬成模糊比對，
 * 而一條被放寬的閘等於沒有閘。
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ContentLoader } from "../../packages/shared/src/content/loader";
import { FsContentSource } from "../../packages/shared/src/content/node/FsContentSource";
import { registerAll, Arenas, Configs } from "../../packages/shared/src/content/registries";
import { Abilities } from "../../packages/shared/src/sim/content/registry";
import { aoeTiersFromDoc } from "../../packages/shared/src/content/aoeTiers";
import { rangeTiersFromDoc } from "../../packages/shared/src/content/rangeTiers";
import {
  displacementTiersFromDoc,
  minBodyRadiusFromConfigs,
} from "../../packages/shared/src/content/displacementTiers";
import {
  cooldownClaims,
  damageClaims,
  manaClaims,
  mechanicsText,
  scanAbility,
} from "../../packages/shared/src/content/descriptionClaims";
import type { SkillTierName } from "../../packages/shared/src/content/skillTiers";
import {
  applyCardProseRule,
  tierWordFor,
  type EngineGeo,
  type ProseFinding,
  type TierWord,
} from "./cardProseRule";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTENT = join(REPO, "content");

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const OUT = flag("--out") ?? "/private/tmp/ggd-card-prose/card-prose-preview.md";
const JSON_OUT = flag("--json");
const POLICY = argv.includes("--keep-numbers") ? "keep" : "strip";

/* ───────────────────────────── 引擎側的幾何量 ───────────────────────────── */

function* walk(n: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(n)) {
    for (const v of n) yield* walk(v);
  } else if (n !== null && typeof n === "object") {
    yield n as Record<string, unknown>;
    for (const v of Object.values(n as Record<string, unknown>)) yield* walk(v);
  }
}

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;

/** 效果樹上第一個符合的數字（深度優先）。⛔ 不取最大 —— 那會挑到別的機制的數字。 */
function firstIn(def: unknown, pick: (n: Record<string, unknown>) => number | undefined): number | undefined {
  for (const node of walk(def)) {
    const v = pick(node);
    if (v !== undefined) return v;
  }
  return undefined;
}

interface Tables {
  readonly range: Readonly<Record<SkillTierName, number>>;
  readonly radius: Readonly<Record<SkillTierName, number>>;
  readonly travel: Readonly<Record<SkillTierName, number>>;
  readonly push: Readonly<Record<SkillTierName, number>>;
  readonly zoneRadius: number;
}

/** 一支技能上引擎**真的有**的四軸，翻成級距詞。缺的軸留 `undefined`。 */
function engineGeo(def: Record<string, unknown>, t: Tables): EngineGeo {
  const put = (v: number | undefined, table: Readonly<Record<SkillTierName, number>>): TierWord | undefined =>
    v === undefined ? undefined : tierWordFor(v, table, t.zoneRadius);

  const range = num(def["range"]);
  // ⚠️ 樹上的 `radius` 也收**沒有 `kind` 的節點** —— 79-00 靈壓的半徑 4.5 就住在
  // 一個純 modifier 節點上，要求有 `kind` 會讓它看起來像「引擎沒有這一軸」。
  const radius = num(def["radius"]) ?? firstIn(def, (n) => num(n["radius"]));
  const travel = firstIn(def, (n) =>
    ["dash", "leap", "blink"].includes(String(n["kind"]))
      ? (num(n["maxDistance"]) ?? num(n["distance"]))
      : undefined,
  );
  const push = firstIn(def, (n) => (n["kind"] === "knockback" ? num(n["distance"]) : undefined));

  const out: Record<string, TierWord | undefined> = {
    range: put(range, t.range),
    radius: put(radius, t.radius),
    // ⭐ 位移退回施法距離是刻意的：地面瞬移（09-02 瞬間移動）的「移動多遠」
    //   逐字就是它的施法距離，⛔ 不是效果樹上另一個數字。
    travel: put(travel, t.travel) ?? put(range, t.range),
    push: put(push, t.push),
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  const raw: Record<string, number> = {};
  for (const [k, v] of [
    ["range", range],
    ["radius", radius],
    ["travel", travel ?? range],
    ["push", push],
  ] as const) {
    if (v !== undefined) raw[k] = v;
  }
  return { ...out, raw } as EngineGeo;
}

/* ──────────────────────────────── 產生 ──────────────────────────────── */

interface Row {
  readonly id: string;
  readonly name: string;
  readonly provenance: string;
  readonly generated: boolean;
  readonly before: string;
  readonly after: string;
  readonly findings: readonly ProseFinding[];
}

const esc = (s: string): string => s.replace(/\|/g, "\\|").replace(/\n/g, "⏎");

async function main(): Promise<void> {
  const loaded = await new ContentLoader(new FsContentSource(CONTENT)).load();
  registerAll(loaded.store);

  const cfgs = Configs.all() as unknown as { schema?: string }[];
  const aoe = aoeTiersFromDoc(cfgs.find((c) => c.schema === "config.aoe-tiers@1"));
  const rng = rangeTiersFromDoc(cfgs.find((c) => c.schema === "config.range-tiers@1"));
  const disp = displacementTiersFromDoc(
    cfgs.find((c) => c.schema === "config.displacement-tiers@1"),
    minBodyRadiusFromConfigs(cfgs as never),
  );
  // ⭐ 錨從 `Arenas` **推導**，⛔ 不抄字面值 24（第二守則：出貨數值不住在文件裡）。
  const zoneRadius = Math.min(...Arenas.all().flatMap((a) => a.zones.map((z) => z.boundaryRadius)));
  const tables: Tables = {
    range: rng.range,
    radius: aoe.radius,
    travel: Object.fromEntries(
      Object.entries(disp.travel).map(([k, v]) => [k, (v as { distance: number }).distance]),
    ) as Record<SkillTierName, number>,
    push: Object.fromEntries(
      Object.entries(disp.push).map(([k, v]) => [k, (v as { distance: number }).distance]),
    ) as Record<SkillTierName, number>,
    zoneRadius,
  };

  // provenance 只在磁碟上（登錄表不帶它）—— `owner-spec` ⇔ batch1.py 產生的那 90 支
  const prov = new Map<string, string>();
  for (const f of readdirSync(join(CONTENT, "abilities"))) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const d = JSON.parse(readFileSync(join(CONTENT, "abilities", f), "utf8")) as {
      id?: string;
      provenance?: string;
    };
    if (d.id) prov.set(d.id, d.provenance ?? "(none)");
  }

  const rows: Row[] = [];
  for (const id of Abilities.ids().sort()) {
    const def = Abilities.get(id) as unknown as Record<string, unknown>;
    const before = String(def["description"] ?? "");
    if (before.trim() === "") continue;
    const { next, findings } = applyCardProseRule(before, engineGeo(def, tables), {
      numbersPolicy: POLICY,
    });
    if (findings.length === 0) continue;
    const p = prov.get(id) ?? "?";
    rows.push({
      id,
      name: String(def["name"] ?? id),
      provenance: p,
      generated: p === "owner-spec",
      before,
      after: next,
      findings,
    });
  }

  const byRule = (r: Row["findings"][number]["rule"]): Row[] =>
    rows.filter((x) => x.findings.some((f) => f.rule === r));
  const review = byRule("geo-no-engine-value");
  const tiered = byRule("geo-tiered");

  /* ── 報告 ── */
  const L: string[] = [];
  const p = (s = ""): number => L.push(s);

  p("# 卡面文案規則 —— diff 預覽（GH#461）");
  p();
  p("> ⚙️ 這一份是**產生的**，而且**只有預覽** —— 這支腳本⛔一個位元組都不寫進 `content/`。");
  p("> 重跑：`pnpm tsx tools/card-prose/gen_card_prose.ts`");
  p();
  p(`規則政策：冷卻／耗魔 = **${POLICY === "strip" ? "移出文案（預設）" : "留在文案（--keep-numbers）"}**`);
  p();
  p("## 級距表（從出貨 config **推導**，⛔ 不抄字面值）");
  p();
  p(`決鬥區半徑（\`Arenas\` 推導）：**${zoneRadius}** —— 大於等於它的幾何值寫「全場」，⛔ 不是「極大」。`);
  p();
  p("| 軸 | 極小 | 小 | 中 | 大 | 極大 | 來源 |");
  p("|---|---:|---:|---:|---:|---:|---|");
  const rowOf = (label: string, t: Record<string, number>, src: string): void => {
    p(`| ${label} | ${t["極小"]} | ${t["小"]} | ${t["中"]} | ${t["大"]} | ${t["極大"]} | ${src} |`);
  };
  rowOf("施法距離", tables.range as Record<string, number>, "`config.range-tiers@1`");
  rowOf("有效半徑", tables.radius as Record<string, number>, "`config.aoe-tiers@1`");
  rowOf("位移距離", tables.travel as Record<string, number>, "`config.displacement-tiers@1`.travel");
  rowOf("擊退距離", tables.push as Record<string, number>, "`config.displacement-tiers@1`.push");
  p();

  /* ── 現況普查：規則要處理掉的東西，先量給 owner 看 ── */
  const all = Abilities.ids()
    .sort()
    .map((id) => Abilities.get(id) as unknown as Record<string, unknown>)
    .filter((d) => String(d["description"] ?? "").trim() !== "");
  const varies = (a: unknown): boolean =>
    Array.isArray(a) && new Set(a as number[]).size > 1;
  const claimed = (
    ex: (t: string) => { values: readonly number[] }[],
  ): { with_: number; slash: number } => {
    let with_ = 0;
    let slash = 0;
    for (const d of all) {
      const cs = ex(mechanicsText(String(d["description"])));
      if (cs.length === 0) continue;
      with_++;
      if (cs.some((c) => c.values.length > 1)) slash++;
    }
    return { with_, slash };
  };
  const bad = (rule: string): number =>
    all.filter((d) =>
      scanAbility(d as never).some((m) => m.rule === rule),
    ).length;
  const cd = claimed(cooldownClaims);
  const mp = claimed(manaClaims);
  const dmg = claimed(damageClaims);

  p("## 現況普查（⭐ 每個數字都是這支腳本從出貨內容算的）");
  p();
  p(`有描述的技能：**${all.length}** 支`);
  p();
  p("| 量 | 文案有寫 | 其中寫成逐階斜線串 | 與 JSON 不一致 | JSON 逐階不同 |");
  p("|---|---:|---:|---:|---:|");
  p(
    `| 冷卻 | ${cd.with_} | ${cd.slash} | ${bad("cooldown-mismatch")} | ${all.filter((d) => varies(d["cooldown"])).length} |`,
  );
  p(
    `| 耗魔 | ${mp.with_} | ${mp.slash} | ${bad("mana-mismatch")} | ${all.filter((d) => varies(d["manaCost"])).length} |`,
  );
  p(`| 傷害 | ${dmg.with_} | ${dmg.slash} | ${bad("damage-absent")} | — |`);
  p();
  p("⚠️ 「與 JSON 不一致」是 `packages/shared/src/content/descriptionClaims.ts` 的既有抽取器算的，⛔ 不是這裡另寫一套。");
  p();

  p("## 統計");
  p();
  const count = (r: string): number =>
    rows.reduce((n, x) => n + x.findings.filter((f) => f.rule === r).length, 0);
  p("| 項目 | 支數 | 處數 |");
  p("|---|---:|---:|");
  p(`| 幾何 → 級距詞（**自動**） | ${tiered.length} | ${count("geo-tiered")} |`);
  p(`| 幾何 → ⛔ 引擎沒有這一軸（**待 owner 判斷**） | ${review.length} | ${count("geo-no-engine-value")} |`);
  p(`| 冷卻移出文案 | ${byRule("cooldown-removed").length} | ${count("cooldown-removed")} |`);
  p(`| 耗魔移出文案 | ${byRule("mana-removed").length} | ${count("mana-removed")} |`);
  p(`| **會被改到的技能總數** | ${rows.length} | — |`);
  p();
  p(`其中 **${rows.filter((r) => r.generated).length} 支是 \`tools/skill-remake/batch1.py\` 產生的**`);
  p("（`provenance: owner-spec`）—— ⛔ 那些**改產生器再重生成**，不可手改 JSON。");
  p();

  p("## ⛔ 例外清單：引擎沒有那一軸，所以**不自動改**");
  p();
  p("> 這些卡面寫了一個幾何數字，但引擎那一半是空的。換成級距詞只會讓一句");
  p("> 做不到的宣稱更像真的（第一·五守則）。⇒ 要嘛補機制，要嘛把那句話拿掉。");
  p();
  p("| 技能 | 名稱 | 來源 | 卡面片段 | 缺的是 |");
  p("|---|---|---|---|---|");
  for (const r of review) {
    for (const f of r.findings.filter((x) => x.rule === "geo-no-engine-value")) {
      p(`| \`${r.id}\` | ${esc(r.name)} | ${r.provenance} | \`${esc(f.before)}\` | ${esc(f.why)} |`);
    }
  }
  p();

  p("## 套用之前**必須**先做的四件事（⛔ 缺一件，套用就會製造新的謊）");
  p();
  p("| # | 改哪裡 | 為什麼 |");
  p("|---|---|---|");
  p(
    `| 1 | \`apps/client/src/ui/components/abilityText.ts\` 的 \`abilityMetaChips\` | chip 現在只印**當前一階**的冷卻／耗魔。文案裡的逐階串被移走之後，` +
      `**${all.filter((d) => varies(d["cooldown"])).length} 支冷卻逐階、${all.filter((d) => varies(d["manaCost"])).length} 支耗魔逐階**` +
      `的成長曲線就沒有任何地方看得到 ⇒ chip 要印整串 |`,
  );
  p(
    "| 2 | `apps/client/src/ui/panels/champselect/ProfileBlock.tsx` 的 `射程` / `範圍` 兩行 | 它們印的是**數字**（`displayFinalText(range, \"abilityRange\")`）。owner 要的是級距詞 ⇒ 這兩行也要換，⛔ 不然文案改成「中」而旁邊那格還印 9.6 |",
  );
  p(
    "| 3 | `apps/client/src/ui/components/abilityText.ts` 的 `DAMAGE_PROSE_RE` | 它只認「數字**緊貼**傷害」的寫法，而斜線逐階串（`350/550/750/950 … 點傷害`）永遠不貼 ⇒ `damageDealt` 一旦不是 1.0，這些卡面會**同時**開始說謊。傷害是唯一留在文案裡的量，所以這條是它的守門員 |",
  );
  p(
    "| 4 | `content/champions/*.json` 的 embedded 副本 | 描述是**鏡像**的（`packages/shared/src/content/abilityMirror.test.ts`）⇒ 套用是 standalone + embedded 一起動，只改一邊那條守衛會紅 |",
  );
  p(
    "| 5 | `packages/shared/src/content/descriptionClaims.baseline/`（⭐ #467 之後是**一位英雄一個 JSON**，⛔ 不再是一支 `.ts`） | 那是一條**兩個方向都會紅**的棘輪（「名單上的鍵已經修好 → 也紅」）。冷卻／耗魔整批移出文案之後，所有 `cooldown-mismatch` / `mana-mismatch` 鍵會**一次消失** ⇒ 套用的同一個 commit 要重新產生基準線，⛔ 不是事後補。重新產生＝ `GGD_DESC_CLAIMS_DUMP=1` 跑 `descriptionClaims.test.ts`，再把 `$TMPDIR/ggd-desc-claims-baseline` **整個目錄** `rm -rf` + `cp -R` 蓋回去（指令在 `descriptionClaims.baseline.ts` 檔頭）；⛔ 不要拿 TSV 第一欄手切 |",
  );
  p();
  p("⭐ 另外：本表標記 **產生的** 的那些，改的是 `tools/skill-remake/batch1.py` 的規格字串，");
  p("套完要跑 `python3 tools/skill-remake/batch1.py` 與 `python3 tools/skill-remake/refresh_docs.py`。");
  p();

  p("## 自動改寫（逐支 before → after）");
  p();
  for (const r of rows.filter((x) => x.findings.some((f) => f.rule !== "geo-no-engine-value"))) {
    p(`### \`${r.id}\` ${r.name}${r.generated ? "　⚠️ **產生的**（改 batch1.py）" : ""}`);
    p();
    p("```diff");
    for (const line of r.before.split("\n")) p(`- ${line}`);
    for (const line of r.after.split("\n")) p(`+ ${line}`);
    p("```");
    for (const f of r.findings) {
      p(`- \`${f.rule}\`：\`${esc(f.before)}\`${f.after ? ` → \`${esc(f.after)}\`` : ""} —— ${f.why}`);
    }
    p();
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, L.join("\n"), "utf8");
  if (JSON_OUT) {
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(JSON_OUT, JSON.stringify(rows, null, 2), "utf8");
  }
  // eslint-disable-next-line no-console
  console.log(
    [
      `決鬥區半徑 ${zoneRadius}`,
      `會被改到 ${rows.length} 支（其中產生的 ${rows.filter((r) => r.generated).length} 支）`,
      `幾何自動 ${tiered.length} 支 / ${count("geo-tiered")} 處`,
      `⛔ 待判斷 ${review.length} 支 / ${count("geo-no-engine-value")} 處`,
      `冷卻移出 ${byRule("cooldown-removed").length} 支 · 耗魔移出 ${byRule("mana-removed").length} 支`,
      `→ ${OUT}`,
    ].join("\n"),
  );
}

void main();

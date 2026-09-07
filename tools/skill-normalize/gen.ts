#!/usr/bin/env tsx
/**
 * ⭐【技能正規化的**總閘**】—— 一條閘，三件事，⛔ 不是三條各掃一遍的測試。
 *
 * owner 2026-08-21：
 * > 「**一個檔案一次改完** —— 五欄級距 + 說明改寫 + 說明↔JSON 對照**同一趟**，
 * >  ⛔ 不要分三遍掃」
 *
 * ⇒ 這一支**讀一次**內容（`ContentLoader.load()` + `registerAll()` ×1），一趟問完
 * 四個問題，任何一個不過就回非零：
 *
 *   ① **五欄級距**  每一支的每一軸，要嘛有級別，要嘛有一個**推導得出來的理由**
 *      （`content/skillNormalize.ts::normalizeGaps` —— ⛔ 判準住那裡不住這裡）
 *   ② **級別↔原始值** 填了級別的那一格，原始值必須**逐位元組等於**級距值
 *      （拉止血閥 `enabled:false` 之後接手的就是原始值 ⇒ 兩者不一致 =
 *        「卡片說 2、引擎跑 12」）
 *   ③ **說明**      ⛔ 一個綁得上的手打機制數字都不剩；算繪後 ⛔ 一個裸佔位符都不剩
 *   ④ **說明↔JSON**  ⛔ 沒有棘輪基準線以外的新不一致，⛔ 基準線上也沒有過期項目
 *
 * ⚠️ ①②③④ 全部**重用出貨程式**（`skillNormalize` / `abilityProse` /
 * `descriptionClaims`），⛔ 這一支沒有第二份正則、第二張表、第二個判準。
 * 它只負責「一趟問完 + 印成一份文件」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 刻意**沒有產生日期**（同 `caps:export` / `spec:build`）：任何隨時鐘變動的
 * 欄位都會讓逐位元組比對永遠不相等，於是 `--check` 只能被放寬成模糊比對 ——
 * 而一條被放寬的閘等於沒有閘（GH#389 · #426）。
 *
 * 用法：
 *   pnpm skillnorm:build      # 重生成 docs/技能五級距現況.md
 *   pnpm skillnorm:check      # 唯讀；四個問題任一不過、或文件過期 ⇒ 非零
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadContentCached } from "../../packages/shared/src/content/cache/index";
import { Arenas, Configs, registerAll } from "../../packages/shared/src/content/registries";
import { Abilities } from "../../packages/shared/src/sim/content/registry";
import { aoeTiersFromDoc } from "../../packages/shared/src/content/aoeTiers";
import { rangeTiersFromDoc } from "../../packages/shared/src/content/rangeTiers";
import { cooldownTiersFromDoc, cooldownShapeOf } from "../../packages/shared/src/content/cooldownTiers";
import { damageTiersFromDoc } from "../../packages/shared/src/content/damageTiers";
import { zTemplateDoc, type TemplateDoc } from "../../packages/shared/src/content/schema/template";
import { manaTiersFromDoc } from "../../packages/shared/src/content/manaTiers";
import {
  displacementTiersFromDoc,
  minBodyRadiusFromConfigs,
} from "../../packages/shared/src/content/displacementTiers";
import {
  AXIS_LABEL,
  NORMALIZE_AXES,
  axisVerdicts,
  normalizeGaps,
  skillNormalizeFromDoc,
  type NormalizeAxis,
  type SkillNormalize,
} from "../../packages/shared/src/content/skillNormalize";
import { SKILL_TIER_NAMES, type SkillTierName } from "../../packages/shared/src/content/skillTiers";
import {
  abilityQuantities,
  proseViolations,
  type ProseTables,
} from "../../packages/shared/src/content/abilityProse";
import { scanAbility } from "../../packages/shared/src/content/descriptionClaims";
import { zConfigSkillNormalizeDoc } from "../../packages/shared/src/content/schema/config";

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");

/**
 * ⭐ `--root` 讓這一支可以指向**一份副本樹**（`packages/shared/src/ops/
 * skillNormalizeGate.test.ts` 的突變就跑在 tmp 的副本上）。
 * ⛔ 沒有它的話「改 cwd」是無效的 —— 路徑是從 `import.meta.url` 推的，
 * 於是突變測試會一路讀出貨樹，兩個突變都是綠的而看起來像守衛過了（失敗形態⑤）。
 */
const ROOT_FLAG = argv.indexOf("--root");
const REPO =
  ROOT_FLAG >= 0 && argv[ROOT_FLAG + 1] !== undefined
    ? argv[ROOT_FLAG + 1]!
    : join(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTENT = join(REPO, "content");
const ABIL_DIR = join(CONTENT, "abilities");
const CLAIMS_BASELINE = join(REPO, "packages/shared/src/content/descriptionClaims.baseline");
// ⭐ GH#1072：模板技的傷害要看**展開後**的 effects（heal 的 amount 不是傷害）—— 模板表從出貨目錄讀。
const TEMPLATES = new Map<string, TemplateDoc>(
  readdirSync(join(CONTENT, "ability-templates"))
    .filter((f) => f.startsWith("tpl-") && f.endsWith(".json"))
    .map((f) => {
      const t = zTemplateDoc.parse(JSON.parse(readFileSync(join(CONTENT, "ability-templates", f), "utf8")));
      return [t.id, t] as const;
    }),
);
const OUT = join(REPO, "docs/技能五級距現況.md");

type Rec = Record<string, unknown>;

/* ─────────────────────────────  一趟讀完  ───────────────────────────── */

interface Row {
  readonly id: string;
  readonly name: string;
  readonly file: string;
  readonly provenance: string;
  readonly writePath: string;
  readonly cells: Readonly<Record<NormalizeAxis, string>>;
}

/** 級距值 → 給表格用的一格字。⛔ 不適用印**理由的第一句**，不印空白。 */
const firstClause = (s: string): string => (s.split("——")[0] ?? s).trim();

async function build(): Promise<{
  md: string;
  problems: string[];
  /** ⭐ 止血閥拉下（GH#1053）：四項沒問、文件沒產。 */
  disabled?: boolean;
}> {
  const loaded = await loadContentCached({ rootDir: CONTENT });
  registerAll(loaded.store);

  const cfgs = Configs.all() as unknown as { schema?: string }[];
  const pick = (s: string): unknown => cfgs.find((c) => c.schema === s);
  const cfg: SkillNormalize = skillNormalizeFromDoc(pick("config.skill-normalize@1"));
  // ⭐ 止血閥（GH#1053）—— `enabled:false` ⇒ 四項不問、文件不寫、`--check` 不擋。
  //   ⛔ 2026-08-21 → 09-06 這一格**零讀端**：檔頭寫著「止血閥」而拉下去什麼都不會發生（第三守則）。
  //   關掉**不改任何技能**：級別與原始值都還在文件裡（`SkillNormalize.enabled` 的語意）。
  //   守衛 `packages/shared/src/ops/skillNormalizeValve.test.ts`：同一棵壞樹，閥開紅、閥關綠。
  if (!cfg.enabled) return { md: "", problems: [], disabled: true };
  const aoe = aoeTiersFromDoc(pick("config.aoe-tiers@1"));
  const rng = rangeTiersFromDoc(pick("config.range-tiers@1"));
  const cds = cooldownTiersFromDoc(pick("config.cooldown-tiers@1"));
  const dmgT = damageTiersFromDoc(pick("config.damage-tiers@1"));
  const mana = manaTiersFromDoc(pick("config.mana-tiers@1"));
  const disp = displacementTiersFromDoc(
    pick("config.displacement-tiers@1"),
    minBodyRadiusFromConfigs(cfgs as never),
  );
  const zoneRadius = Math.min(...Arenas.all().flatMap((a) => a.zones.map((z) => z.boundaryRadius)));
  const tables: ProseTables = {
    range: rng.range,
    radius: aoe.radius,
    travel: Object.fromEntries(
      Object.entries(disp.travel).map(([k, v]) => [k, v.distance]),
    ) as Readonly<Record<SkillTierName, number>>,
    push: Object.fromEntries(
      Object.entries(disp.push).map(([k, v]) => [k, v.distance]),
    ) as Readonly<Record<SkillTierName, number>>,
    zoneRadius,
  };

  // 棘輪基準線（說明↔JSON 的已知不一致）。⛔ 這裡自己讀目錄 ——
  // `descriptionClaims.baseline` 那支模組在 import 的當下對空殼分片是 throw。
  const known = new Set<string>();
  for (const f of readdirSync(CLAIMS_BASELINE)) {
    if (!f.endsWith(".json")) continue;
    for (const k of JSON.parse(readFileSync(join(CLAIMS_BASELINE, f), "utf8")) as string[]) {
      known.add(k);
    }
  }

  const problems: string[] = [];
  const rows: Row[] = [];
  const applicable = Object.fromEntries(NORMALIZE_AXES.map((a) => [a, 0])) as Record<
    NormalizeAxis,
    number
  >;
  const authored = { ...applicable };
  const reasons = new Map<string, number>();
  const claimHit = new Set<string>();

  for (const f of readdirSync(ABIL_DIR).sort()) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(ABIL_DIR, f), "utf8")) as Rec;
    const id = String(doc["id"] ?? f);
    const label = `${id}（${String(doc["name"] ?? id)}）`;

    // ── ① 五欄級距 ────────────────────────────────────────────────────────
    for (const g of normalizeGaps(doc, cfg, { templates: TEMPLATES })) {
      problems.push(`  ${label} ${AXIS_LABEL[g.axis]}：${g.why}`);
    }

    // ── ② 級別 ↔ 原始值 ──────────────────────────────────────────────────
    const v = axisVerdicts(doc, cfg, { templates: TEMPLATES });
    const grid: Readonly<Record<NormalizeAxis, Readonly<Record<SkillTierName, number>>>> = {
      cooldown: cds.seconds[cooldownShapeOf(doc, cds)],
      manaCost: mana.manaCost,
      damage: dmgT.damage,
      range: rng.range,
      radius: aoe.radius,
    };
    const cells = {} as Record<NormalizeAxis, string>;
    for (const axis of NORMALIZE_AXES) {
      const col = v[axis];
      if (!col.applicable) {
        cells[axis] = `— ${firstClause(col.why ?? "")}`;
        reasons.set(
          `${axis}|${firstClause(col.why ?? "")}`,
          (reasons.get(`${axis}|${firstClause(col.why ?? "")}`) ?? 0) + 1,
        );
        continue;
      }
      applicable[axis]++;
      if (col.authored === undefined) {
        cells[axis] = `⛔ 缺級別（現值 ${col.value ?? "—"}）`;
        continue;
      }
      authored[axis]++;
      const want = grid[axis][col.authored];
      cells[axis] = `**${col.authored}** ${col.value}`;
      if (typeof want === "number" && Math.abs((col.value ?? 0) - want) > 1e-9) {
        problems.push(
          `  ${label} ${AXIS_LABEL[axis]}：級別「${col.authored}」＝ ${want}，` +
            `原始值卻是 ${col.value} —— 拉止血閥（enabled:false）之後接手的是原始值 ⇒ 兩者不可以說兩句話`,
        );
      }
    }

    // ── ③ 說明 ───────────────────────────────────────────────────────────
    const def = Abilities.get(id as never) as unknown as (Rec & { description?: string }) | undefined;
    const source = String(doc["description"] ?? "");
    if (def !== undefined && source.trim() !== "") {
      const q = abilityQuantities(def, tables);
      for (const bad of proseViolations(source, q)) {
        if (bad.rule !== "hand-typed-number") continue;
        problems.push(
          `  ${label} 說明裡有**綁得上**的手打機制數字「${bad.text}」—— ` +
            `級距表一改它就變成謊話。跑 \`pnpm tsx tools/card-prose/apply_placeholders.ts\``,
        );
      }
      const rendered = String(def["description"] ?? "");
      if (rendered.includes("{{")) {
        problems.push(
          `  ${label} 註冊表裡還留著裸的佔位符 ${/\{\{[^}]*\}\}/.exec(rendered)?.[0]} —— ` +
            "玩家會在卡片上直接看到它（`registries.ts` 的 withProse 那一行斷了）",
        );
      }
      // ── ④ 說明↔JSON ────────────────────────────────────────────────────
      for (const m of scanAbility(def as never)) {
        const key = `${id}|${m.rule}`;
        if (known.has(key)) {
          claimHit.add(key);
          continue;
        }
        problems.push(
          `  ${label} 說明↔JSON 新的不一致（${m.rule}）：「${m.claim}」—— ${m.why}`,
        );
      }
    }

    rows.push({
      id,
      name: String(doc["name"] ?? id),
      file: `content/abilities/${f}`,
      provenance: String(doc["provenance"] ?? "(none)"),
      writePath: doc["provenance"] === "owner-spec" ? "產生器" : "JSON",
      cells,
    });
  }

  // ⭐ 棘輪的第二半：修好的要從基準線刪掉，否則那條線永遠不會縮。
  // ⚠️ **只對這一支自己的母體叫** —— 基準線同時服務 `descriptionClaims.test.ts`，
  //    而那一支的母體還含**增益卡／固有能力**（`grail-ex-13` 之類，它們不住
  //    `content/abilities/`）。少了這一格過濾，這裡會把那些鍵一律報成「已修好」，
  //    照著刪之後 `descriptionClaims.test.ts` 當場紅 —— 而且紅在**別人身上**。
  //    ⛔ 這已經真的發生過一次（2026-08-21）。
  const scanned = new Set(rows.map((r) => r.id));
  for (const k of [...known].filter((x) => !claimHit.has(x) && scanned.has(x.split("|")[0] ?? ""))) {
    problems.push(
      `  棘輪基準線上的 \`${k}\` 已經修好了 —— 把那一份分片刪掉（基準線只准降）`,
    );
  }

  /* ─────────────────────────────  報表  ───────────────────────────── */

  const L: string[] = [];
  const p = (s = ""): void => void L.push(s);
  const pct = (n: number, d: number): string => (d === 0 ? "—" : `${Math.round((n / d) * 1000) / 10}%`);

  p("# 技能五級距現況");
  p();
  p("> ⚙️ 這一份是 `pnpm skillnorm:build` **產生的**，⛔ 不要手改。");
  p("> 它同時是一條閘：`pnpm skillnorm:check` 一趟問四件事 ——");
  p("> **五欄級距** · **級別↔原始值** · **說明有沒有手打數字** · **說明↔JSON 一不一致**。");
  p("> ⛔ 刻意不帶產生日期：任何隨時鐘變動的欄位都會逼 `--check` 放寬成模糊比對。");
  p();
  p("---");
  p();
  p("## 〇 · 每一格只有兩種合法狀態");
  p();
  p("**有級別**，或**有一個推導得出來的理由**。⛔ 塞 0 是假話（0 秒冷卻與「沒有冷卻」在引擎裡是兩件事），留白又和漏填長得一模一樣。");
  p();
  p("| 欄 | 適用 | 已填級別 | 覆蓋率 | 不適用 |");
  p("|---|---:|---:|---:|---:|");
  for (const axis of NORMALIZE_AXES) {
    p(
      `| **${AXIS_LABEL[axis]}** | ${applicable[axis]} | ${authored[axis]} | ` +
        `${pct(authored[axis], applicable[axis])} | ${rows.length - applicable[axis]} |`,
    );
  }
  p();
  p(`合計 **${rows.length}** 支技能（\`content/abilities/*.json\`）。`);
  p();
  p("### 不適用的理由分佈（⭐ 每一支都說得出理由）");
  p();
  for (const axis of NORMALIZE_AXES) {
    const mine = [...reasons.entries()]
      .filter(([k]) => k.startsWith(`${axis}|`))
      .sort((a, b) => b[1] - a[1]);
    if (mine.length === 0) continue;
    p(`- **${AXIS_LABEL[axis]}**：${mine.map(([k, n]) => `${k.split("|")[1]} ${n} 支`).join(" · ")}`);
  }
  p();
  p("---");
  p();
  p("## 一 · ⭐ 決策開關（`config.skill-normalize@1`）");
  p();
  p("owner 2026-08-21：「決策點一律做成**後台開關**，預設 = 你的建議」。");
  p("⭐ 下表的說明是從 **Zod `.describe()` 現讀**的（後台那一頁讀同一份字），⛔ 不是第二份散文。");
  p();
  p("| 開關 | 現值 | 它在決定什麼 |");
  p("|---|---|---|");
  const shape = zConfigSkillNormalizeDoc.shape as Record<string, { description?: string }>;
  for (const [k, val] of Object.entries(cfg)) {
    const why = (shape[k]?.description ?? "").replace(/\n/g, " ");
    p(`| \`${k}\` | \`${JSON.stringify(val)}\` | ${why} |`);
  }
  p();
  p("---");
  p();
  p("## 二 · 出貨級距表（⛔ 全部從 config 推導，不抄字面值）");
  p();
  p(`| 軸 | ${SKILL_TIER_NAMES.join(" | ")} |`);
  p(`|---|${SKILL_TIER_NAMES.map(() => "---:").join("|")}|`);
  for (const s of Object.keys(cds.seconds)) {
    p(`| 冷卻·${s}（卡面秒） | ${SKILL_TIER_NAMES.map((t) => cds.seconds[s as never][t]).join(" | ")} |`);
  }
  p(`| 耗魔 | ${SKILL_TIER_NAMES.map((t) => mana.manaCost[t]).join(" | ")} |`);
  p(`| 傷害 | ${SKILL_TIER_NAMES.map((t) => dmgT.damage[t]).join(" | ")} |`);
  p(`| 施法距離 | ${SKILL_TIER_NAMES.map((t) => rng.range[t]).join(" | ")} |`);
  p(`| 施法範圍 | ${SKILL_TIER_NAMES.map((t) => aoe.radius[t]).join(" | ")} |`);
  p();
  p("⚠️ 冷卻是**卡面值** —— 玩家實際等到的 = 卡面 × `combatEnv.cooldown`。");
  p();
  p("---");
  p();
  p("## 三 · 逐支五欄");
  p();
  p("⚠️ 寫入路徑有兩條，⛔ 弄錯就白做：`owner-spec` 改 `tools/skill-remake/heroes/*.py` 再跑 `batch1.py`；其餘直接改 JSON（跑 `apply_tiers.py`）。");
  p();
  p(`| 技能 | 寫入 | ${NORMALIZE_AXES.map((a) => AXIS_LABEL[a]).join(" | ")} |`);
  p(`|---|---|${NORMALIZE_AXES.map(() => "---").join("|")}|`);
  for (const r of rows) {
    p(
      `| \`${r.id}\` ${r.name} | ${r.writePath} | ` +
        NORMALIZE_AXES.map((a) => r.cells[a]).join(" | ") +
        " |",
    );
  }
  p();
  p("<sub>⚙️ 由 `pnpm skillnorm:build` 從出貨 config + 出貨註冊表產生 · ⛔ 不要手改</sub>");

  return { md: L.join("\n") + "\n", problems };
}

async function main(): Promise<void> {
  const { md, problems, disabled } = await build();
  if (disabled) {
    console.error(
      "⏸ 技能正規化總閘：`config.skill-normalize@1` 的 enabled=false（止血閥拉下）⇒ 四項不問、文件不動、閘不擋。",
    );
    return;
  }
  const stale = (() => {
    try {
      return readFileSync(OUT, "utf8") !== md;
    } catch {
      return true;
    }
  })();

  if (!CHECK) writeFileSync(OUT, md, "utf8");

  if (problems.length > 0) {
    console.error(
      `⛔ 技能正規化總閘：${problems.length} 個問題\n` +
        problems.slice(0, 40).join("\n") +
        (problems.length > 40 ? `\n  …還有 ${problems.length - 40} 個` : "") +
        "\n\n⭐ 修法（⛔ 不要改這條閘）：\n" +
        "  · 缺級別 / 級別與原始值不一致 → `python3 tools/skill-remake/apply_tiers.py && python3 tools/skill-remake/batch1.py`\n" +
        "  · 說明裡有手打數字 → `npx tsx tools/card-prose/apply_placeholders.ts`\n" +
        "  · 說明↔JSON 新的不一致 → 改卡面或改 JSON（⛔ 不是把它加進棘輪基準線）",
    );
    process.exit(1);
  }
  if (CHECK && stale) {
    console.error(
      `⛔ \`${OUT.replace(REPO + "/", "")}\` 過期了 —— 跑 \`pnpm skillnorm:build\` 然後 \`git add docs/\`。`,
    );
    process.exit(1);
  }
  console.error(CHECK ? "✓ 技能正規化總閘：四項全過，文件是最新的" : `✓ 寫到 ${OUT}`);
}

void main();

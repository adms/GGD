/**
 * ⭐【創建新英雄 —— script 自動化】GH#480 第三層
 *
 * owner 2026-08-20：「⋯特別是 **script 程式自動化跟警示**的部分」。
 *
 * ```bash
 * pnpm newhero:build     # 重生成 docs/new-hero-defaults.json
 * pnpm newhero:check     # 唯讀：① 產物是不是最新 ② ⭐ 生成代入**過不過得了自己的警示**
 * ```
 *
 * ── ⭐ 第二項才是重點：它驗的是**關係**，不是名詞 ──────────────────────────
 *
 * CLAUDE.md 的配對式後置條件教訓：「只驗名詞的那一種，在相容性故障面前**必然是綠的**」。
 * 這支的兩個名詞是：
 *   ① **生成代入**（`newHeroDefaults.deriveAbilityDefaults` → `applyAbilityDefaults`）
 *   ② **檢查警示**（`newHeroChecks.checkNewHeroDocs`）
 * 分開看兩邊都會是綠的。壞掉的是它們之間那件事：
 * **「照著預設值生出來的一支新技能，會不會當場觸發自己的警示？」**
 *
 * 這一條真的擋得住東西。實例：把生成的說明改成一段固定文案（不從數字生），
 * `claim-mismatch` 立刻對 30 組全部亮 —— 而 `content:build` 與全套測試都還是綠的。
 *
 * ── ⛔ 它**不掃出貨內容** ───────────────────────────────────────────────────
 *
 * 既有的 1,900 份文件上有一堆歷史問題，那是 `descriptionClaims.baseline` /
 * `abilityNoOpEffects` 的棘輪名單在管的事。這支只問「**新生成的**那一份乾不乾淨」——
 * 拿全樹當斷言會讓這支永遠是紅的，而永遠紅的閘等於沒有閘。
 *
 * ── ⛔ 產物裡刻意沒有時鐘欄位 ───────────────────────────────────────────────
 *
 * 與 `caps:export` / `spec:build` 同一個理由：任何隨時鐘變動的欄位都會讓
 * `--check` 的逐位元組比對永遠不相等，於是它只能被放寬成模糊比對 ——
 * 而一條被放寬的閘等於沒有閘（GH#389 · #426）。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NEW_HERO_ABILITY_COLUMNS,
  DEFAULT_MIN_SAMPLE,
  deriveAbilityDefaults,
  applyAbilityDefaults,
  type AbilityCorpusDoc,
  type AbilityDefaults,
} from "../../packages/shared/src/content/newHeroDefaults";
import {
  NEW_HERO_WARN_RULES,
  checkNewHeroDocs,
  type NewHeroWarning,
} from "../../packages/shared/src/content/newHeroChecks";
import type { CastType } from "../../packages/shared/src/sim/content/defs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = "docs/new-hero-defaults.json";
const SCHEMA = "ggd-new-hero-defaults@1";

/** 六格技能。⚠️ 天生技的 slot 字面是 `PASSIVE`（與 heroForgePage 同一份語彙）。 */
const SLOTS = ["PASSIVE", "Q", "W", "E", "R", "EX"] as const;
const CAST_TYPES: readonly CastType[] = ["targeted", "skillshot", "ground", "self", "dash"];

function corpus(): AbilityCorpusDoc[] {
  const dir = join(ROOT, "content/abilities");
  const out: AbilityCorpusDoc[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    out.push(JSON.parse(readFileSync(join(dir, f), "utf8")) as AbilityCorpusDoc);
  }
  // ⚠️ 空語料 = 讀壞了，⛔ 不是「內容是空的」。同 roster-guard 的那一條。
  if (out.length === 0) throw new Error("content/abilities 讀出 0 份文件 —— 讀取器壞了，⛔ 不是內容空了");
  return out;
}

/** 照預設值生一支**最小可存**的技能草稿 —— 這就是後台按下「新增」拿到的東西。 */
function draftFor(slot: string, d: AbilityDefaults): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: `godie-newhero.${slot.toLowerCase()}`,
    schema: "ability@1",
    name: `新${slot}技`,
    slot,
    castType: d.castType,
    maxRank: 4,
    cooldown: [],
    manaCost: [],
    effects: [],
  };
  if (slot === "PASSIVE") base["innateKind"] = "passive";
  return applyAbilityDefaults(base, d);
}

interface Row {
  readonly slot: string;
  readonly castType: CastType;
  readonly defaults: AbilityDefaults;
  readonly draft: Record<string, unknown>;
  readonly warnings: readonly NewHeroWarning[];
}

function rows(docs: readonly AbilityCorpusDoc[]): Row[] {
  const out: Row[] = [];
  for (const slot of SLOTS) {
    for (const castType of CAST_TYPES) {
      const defaults = deriveAbilityDefaults(docs, slot, castType, { minSample: DEFAULT_MIN_SAMPLE });
      const draft = draftFor(slot, defaults);
      const warnings = checkNewHeroDocs([{ collection: "abilities", id: String(draft["id"]), doc: draft }]);
      out.push({ slot, castType, defaults, draft, warnings });
    }
  }
  return out;
}

/**
 * ⭐ 生成代入 ↔ 檢查警示 的**配對**。
 *
 * `no-op-effect` 對 `PASSIVE` 是**對的**（一支剛出生的天生技真的什麼都不做，
 * 而它的 `passive` 區塊要作者自己填 —— ⛔ 不可以由這支腳本替他挑一條屬性，
 * 第一·五守則③：「需要改平衡資料時不要自己挑數字」）。其餘一律必須是零。
 */
function pairingFailures(all: readonly Row[]): string[] {
  const bad: string[] = [];
  for (const r of all) {
    for (const w of r.warnings) {
      if (w.rule === "no-op-effect" && r.slot === "PASSIVE") continue;
      bad.push(`${r.slot}/${r.castType} → [${w.rule}] ${w.field}：${w.message}`);
    }
  }
  return bad;
}

function payload(all: readonly Row[]): unknown {
  return {
    schema: SCHEMA,
    note:
      "創建新英雄時六欄（說明·施展距離·範圍·傷害·冷卻·耗魔）的預設代入值。" +
      "由 `pnpm newhero:build` 從 content/abilities 的中位數推導 —— ⛔ 不可以手改。",
    minSample: DEFAULT_MIN_SAMPLE,
    // ⛔ **語料的份數刻意不寫進產物**（2026-08-20）。它是一個會因為**無關**的內容
    //   改動而變的欄位（一小時內量到 421→420，因為另一條 lane 把幾位英雄搬進
    //   `_legacy`），而那會讓逐位元組的 `--check` 在 30 組預設值一個位元都沒變的
    //   情況下紅 —— 與時鐘欄位是同一種病（GH#389 · #426）：紅得沒有意義的閘，
    //   下一個人就會把它放寬，而放寬過的閘等於沒有閘。
    //   ⭐ 出處**沒有消失**：每一格自己帶著 `sample`（那一桶真的用了幾支）與
    //   `basis`（退到哪一層），而那兩格只在**這一格的預設值真的換了來源**時才變。
    //   份數仍然印在 stdout（見 main()），⛔ 只是不進交付物。
    columns: NEW_HERO_ABILITY_COLUMNS,
    rules: NEW_HERO_WARN_RULES,
    defaults: all.map((r) => ({
      slot: r.slot,
      castType: r.castType,
      description: r.defaults.description,
      cooldown: r.defaults.cooldown,
      manaCost: r.defaults.manaCost,
      range: r.defaults.range,
      radius: r.defaults.radius,
      damage: r.defaults.damage,
    })),
  };
}

function main(): void {
  const check = process.argv.includes("--check");
  const docs = corpus();
  const all = rows(docs);
  const text = `${JSON.stringify(payload(all), null, 2)}\n`;

  const failures = pairingFailures(all);
  if (failures.length > 0) {
    console.error(
      `⛔ 生成代入的預設值**過不了自己的警示**（${failures.length} 條）——\n` +
        `   一位照預設生出來的新英雄，一出生就帶著警告。修 newHeroDefaults.ts，⛔ 不要改警示：\n  ` +
        failures.join("\n  "),
    );
    process.exit(1);
  }

  const path = join(ROOT, OUT);
  if (check) {
    let current = "";
    try {
      current = readFileSync(path, "utf8");
    } catch {
      console.error(`⛔ ${OUT} 不存在 —— 跑 \`pnpm newhero:build\` 然後 git add。`);
      process.exit(1);
    }
    if (current !== text) {
      console.error(`⛔ ${OUT} 過期了 —— 跑 \`pnpm newhero:build\` 然後 git add。`);
      process.exit(1);
    }
    console.log(
      `✅ ${OUT} 是最新的；${all.length} 組預設值全部通過自己的警示（語料 ${docs.length} 支技能）。`,
    );
    return;
  }

  writeFileSync(path, text);
  console.log(`✅ 寫入 ${OUT}（${all.length} 組 · 語料 ${docs.length} 支技能）。`);
}

main();

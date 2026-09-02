#!/usr/bin/env tsx
/**
 * 技能級距規範 —— **產生器**（GH#414 幾何三軸 · GH#438 傷害/耗魔/冷卻三軸）。
 *
 * ⭐ **六個視窗，一條梯子。** 軸的清單**從出貨 config 推導**（`assertEveryTierAxisIsAccountedFor`），
 * ⛔ 不是這支程式裡的一份手寫名單 —— 少一軸會讓 `tiers:build` / `tiers:check` 直接回非零。
 *
 * owner 2026-08-19：
 * > 「請你將**詳細規範及對應自 w3x 的關係**詳細寫成一個 md 檔給我參考，
 * >  並且這也應該是**給 codex 技能編輯器的參考契約及文件之一**」
 *
 * ⛔ 為什麼它必須是程式而不是一份手寫的 md：`docs/技能標記機制與效果規則.md`
 * 的判例已經寫死了（CLAUDE.md）——「⛔ 不可以手改（它是產生的）」，理由是一份
 * 手寫的對照表會過期而**沒有任何東西會紅**。這一份的每一個數字都有來源：
 *
 *   `shipped`  出貨的 `content/config/*-tiers.json`（＝後台在改的那一份）
 *   `derived`  出貨的 Zod / 梯子常數（`skillTiers.ts`）+ `Arenas` 的決鬥區半徑
 *   `engine`   真的跑 `ContentLoader.load()` + `registerAll()` 之後的註冊表
 *   `w3x`      `tools/w3x-import/out/GoDieEX22s-src/` 的 JASS 與 w3a
 *
 * ⭐ **取值優先序照 CLAUDE.md 第〇·六守則**（owner 2026-08-19：「JASS 的部分
 * 優先權大於 w3x 技能設定，因為真正影響造成傷害的可能在 JASS」）：
 *
 *     第 3 層 JASS 實際效果   ← 有就用這個
 *     第 5 層 w3a 欄位值      ← JASS 沒寫才退回這裡
 *
 * 每一列都標出它走的是哪一層，⛔ 不把兩層混成一個數字。兩層打架的那些**單獨列一張表**
 * 拿給 owner —— ⛔ 產生器不替他選一個。
 *
 * ⛔ 刻意沒有產生日期（同 `caps:export` / `spec:build`）：任何隨時鐘變動的欄位都會讓
 * 逐位元組比對永遠不相等，於是 `--check` 只能被放寬成模糊比對 —— 一條被放寬的閘等於沒有閘。
 *
 * 用法：
 *   pnpm tiers:build     # 寫出 docs/editor-contract/ggd-skill-tiers.md
 *   pnpm tiers:check     # 過期就回非零
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadContentCached } from "../../packages/shared/src/content/cache/index";
import { registerAll, Arenas, Configs } from "../../packages/shared/src/content/registries";
import { Abilities } from "../../packages/shared/src/sim/content/registry";
import {
  DUEL_ZONE_RADIUS_REF,
  LADDER_FRACTIONS,
  SKILL_TIER_NAMES,
  TRAVEL_SCALE,
  snapGap,
  snapToTier,
  type SkillTierName,
} from "../../packages/shared/src/content/skillTiers";
import { aoeTiersFromDoc } from "../../packages/shared/src/content/aoeTiers";
import { rangeTiersFromDoc } from "../../packages/shared/src/content/rangeTiers";
import {
  displacementTiersFromDoc,
  minBodyRadiusFromConfigs,
} from "../../packages/shared/src/content/displacementTiers";
import { damageTiersFromDoc } from "../../packages/shared/src/content/damageTiers";
import { manaTiersFromDoc } from "../../packages/shared/src/content/manaTiers";
import { COOLDOWN_SHAPES, cooldownTiersFromDoc } from "../../packages/shared/src/content/cooldownTiers";
import { GGD_PER_WC3 } from "../../packages/shared/src/content/templates/expand";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTENT = join(REPO, "content");
const W3X = join(REPO, "tools/w3x-import/out/GoDieEX22s-src");
const DOC = join(REPO, "docs/editor-contract/ggd-skill-tiers.md");
const CMD = "pnpm tiers:build";

/** 落差超過這一格就不自動收，列給 owner。⚠️ 相對級距值，⛔ 不是絕對距離。 */
const GAP_ALERT = 0.25;

const num = (x: number): string => (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100));
const abilityNumber = (s: string | undefined): string | undefined =>
  (s ?? "").match(/^(\d\d-\d{2,3})/)?.[1];

// ---------------------------------------------------------------------------
// w3x 側：JASS（第 3 層）與 w3a（第 5 層）
// ---------------------------------------------------------------------------

interface Original {
  /** 原作半徑（WC3 單位），來源層已經決定過 */
  readonly area?: number;
  readonly range?: number;
  readonly layer: "JASS" | "w3a" | "—";
  /** 兩層都有值而且不一樣時，另一層說什麼（⛔ 不合併，拿給 owner） */
  readonly conflict?: { readonly jass: number; readonly w3a: number; readonly field: "area" };
}

function loadOriginals(): Map<string, Original> {
  const out = new Map<string, Original>();
  const objPath = join(W3X, "OBJECTS.json");
  const jassPath = join(W3X, "JASS_BEHAVIOR.json");
  if (!existsSync(objPath)) return out;

  // 第 5 層：w3a 欄位。⚠️ `area` / `cast_range` 是逐等級的 map，取第 1 級
  //   —— 級距是一支技能一格，⛔ 不是逐等級各一格。
  const w3a = new Map<string, { area?: number; range?: number }>();
  const objects = JSON.parse(readFileSync(objPath, "utf8")) as { abilities: Record<string, Record<string, unknown>> };
  for (const a of Object.values(objects.abilities)) {
    const n = abilityNumber(a["name"] as string | undefined);
    if (n === undefined || w3a.has(n)) continue;
    const lvl1 = (m: unknown): number | undefined => {
      const v = (m as Record<string, unknown> | undefined)?.["1"];
      return typeof v === "number" && v > 0 ? v : undefined;
    };
    w3a.set(n, { area: lvl1(a["area"]), range: lvl1(a["cast_range"]) });
  }

  // 第 3 層：JASS。`geometry` 是自由文字（人寫的稽核欄），所以只認**明確**的
  // 「AoE <數字>」，⛔ 不做模糊猜測 —— 猜錯會產出一個看起來有來源的假數字。
  const jass = new Map<string, number>();
  if (existsSync(jassPath)) {
    const skills = (JSON.parse(readFileSync(jassPath, "utf8")) as { skills: Record<string, unknown>[] }).skills;
    for (const s of skills) {
      const n = abilityNumber(s["skill_name"] as string | undefined);
      if (n === undefined || jass.has(n)) continue;
      const m = String(s["geometry"] ?? "").match(/AoE\s*([0-9]+(?:\.[0-9]+)?)/);
      if (m) jass.set(n, Number(m[1]));
    }
  }

  for (const n of new Set([...w3a.keys(), ...jass.keys()])) {
    const f = w3a.get(n);
    const j = jass.get(n);
    if (j !== undefined) {
      const conflict =
        f?.area !== undefined && Math.abs(f.area - j) > 0.5
          ? ({ jass: j, w3a: f.area, field: "area" } as const)
          : undefined;
      out.set(n, { area: j, range: f?.range, layer: "JASS", ...(conflict ? { conflict } : {}) });
    } else if (f && (f.area !== undefined || f.range !== undefined)) {
      out.set(n, { area: f.area, range: f.range, layer: "w3a" });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// ⛔ 這份文件不可以再**少一軸** —— 覆蓋率是推導的，不是一份手寫清單
// ---------------------------------------------------------------------------
/**
 * ⚠️ 這一段是 GH#438 的核心教訓。在它之前，這份**對外契約**上寫著一句
 *
 *   > 「傷害與耗魔：⛔ 還沒有表，這是 owner 的決定」
 *
 * 而那句話在 `damage-tiers.json` / `mana-tiers.json` / `cooldown-tiers.json`
 * 三份出貨 config 落地之後就變成**假的**，⛔ 卻沒有任何東西會紅：`tiers:check`
 * 只比對「文件 == 產生器現在會吐的字」，而那句謊話**住在產生器裡**。
 * （CLAUDE.md 第三守則：一個活得比它描述的行為還久的宣稱，比沒有註解更糟。）
 *
 * ⇒ 現在軸的清單**從出貨的 config 推導**：凡是 `config.*-tiers@N`，要嘛在
 * {@link EMITTED_TIER_SCHEMAS}（這份文件真的畫出它的表），要嘛在
 * {@link NOT_A_SKILL_AXIS} 帶著一個**能被反駁的理由**。兩邊都沒有 → 產生器
 * 直接 throw，`pnpm tiers:build` 與 `pnpm tiers:check` 一起回非零。
 * ⭐ 形狀刻意抄 `skillsSyncCoversGenerators.test.ts`：加第 8 份級距 config
 * 而不做選擇 = 紅，⛔ 不是靜靜地少畫一張表。
 */
const EMITTED_TIER_SCHEMAS: readonly string[] = [
  "config.range-tiers@1",
  "config.aoe-tiers@1",
  "config.displacement-tiers@1",
  "config.damage-tiers@1",
  "config.mana-tiers@1",
  "config.cooldown-tiers@1",
  // ⭐ GH#943 —— owner 逐字：「吟唱⋯其實這個也可以五級距 0, 0.1, 0.3, 0.5, 1」
  "config.cast-time-tiers@1",
];

/** 是級距 config，但**不是技能的一軸** —— 每一列都要說得出為什麼。 */
const NOT_A_SKILL_AXIS: Readonly<Record<string, string>> = {
  "config.speed-growth-tiers@1":
    "英雄**移動速度成長**的級距，掛在 `champion@1` 上（`speedGrowthTier`）。" +
    "它不寫在 `ability@1` 的任何一格，也不參與「威力 ↔ 代價」那條式子 ⇒ 不是技能軸。" +
    "文件在 `tools/speed-growth/`（`pnpm speedtiers:build`）。",
  "config.move-speed-tiers@1":
    "移速**加成**的級距（GH#789），掛在 **modifier 節點**上（`msBonusTier`——" +
    "任意深度的 `{stat:\"ms\", op:pctAdd|pctMult}`），而且**道具與增益卡**用同一把梯子 ⇒ " +
    "它不是 `ability@1` 頂層「威力 ↔ 代價」式子裡的一軸，這份文件的表框畫不下它。" +
    "表與豁免住 `content/config/move-speed-tiers.json`；解析在 " +
    "`packages/shared/src/content/moveSpeedTiers.ts::resolveMsBonusTier`；" +
    "清單在 `docs/技能移速清單.md`（pnpm speedlists:build）與後台「移速加成五級距」頁。",
};

const isTierSchema = (s: string): boolean => /^config\.[a-z-]+-tiers@\d+$/.test(s);

/** 兩個方向都關：漏畫一軸 → throw；豁免了卻其實有畫 → 也 throw（豁免理由過期了）。 */
function assertEveryTierAxisIsAccountedFor(shipped: readonly string[]): void {
  const unknown = shipped.filter((s) => !EMITTED_TIER_SCHEMAS.includes(s) && !(s in NOT_A_SKILL_AXIS));
  if (unknown.length > 0) {
    throw new Error(
      `❌ 出貨了級距 config 但這份契約沒有表態：${unknown.join(", ")}\n` +
        `   → 把它加進 gen_tiers.ts 的 EMITTED_TIER_SCHEMAS（畫出它的表），\n` +
        `     或加進 NOT_A_SKILL_AXIS 並寫下**為什麼它不是技能的一軸**。`,
    );
  }
  const bothWays = EMITTED_TIER_SCHEMAS.filter((s) => s in NOT_A_SKILL_AXIS);
  if (bothWays.length > 0) {
    throw new Error(`❌ 同時被列為「已畫出」與「不是技能軸」：${bothWays.join(", ")}`);
  }
  const missing = EMITTED_TIER_SCHEMAS.filter((s) => !shipped.includes(s));
  if (missing.length > 0) {
    throw new Error(
      `❌ 這份契約宣稱畫得出這幾軸，但出貨 config 裡根本沒有：${missing.join(", ")}\n` +
        `   → 對外編輯器會照著做出上線就是死的內容（第〇·五守則）。`,
    );
  }
}

/**
 * 逐軸的**採用率** —— 有幾支出貨技能真的填了那一格。
 *
 * ⚠️ 為什麼掃原始 JSON 而不是註冊表：`resolveDamageTier()` / `resolveCooldownTier()`
 * 在**註冊時**就把級別換成數字了（GH#534），所以註冊表裡看不到「這一支是填級別
 * 還是手寫數字」——那正是這一節唯一想回答的問題。
 */
function tierAdoption(): { readonly total: number; readonly byKey: ReadonlyMap<string, number> } {
  const dir = join(CONTENT, "abilities");
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort()
    : [];
  const byKey = new Map<string, number>();
  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf8");
    for (const key of ["rangeTier", "radiusTier", "distanceTier", "damageTier", "manaCostTier", "cooldownTier"]) {
      if (new RegExp(`"${key}"\\s*:`).test(text)) byKey.set(key, (byKey.get(key) ?? 0) + 1);
    }
  }
  return { total: files.length, byKey };
}

// ---------------------------------------------------------------------------
// 產生
// ---------------------------------------------------------------------------

interface Row {
  readonly id: string;
  readonly name: string;
  readonly num: string;
  readonly layer: Original["layer"];
  readonly wcArea?: number;
  readonly wcRange?: number;
  readonly radius?: number;
  readonly range?: number;
  readonly radiusTier?: SkillTierName;
  readonly rangeTier?: SkillTierName;
  readonly radiusGap: number;
  readonly rangeGap: number;
}

async function build(): Promise<string> {
  const loaded = await loadContentCached({ rootDir: CONTENT });
  registerAll(loaded.store);

  const cfgs = Configs.all() as unknown as { schema?: string }[];
  const aoe = aoeTiersFromDoc(cfgs.find((c) => c.schema === "config.aoe-tiers@1"));
  const rng = rangeTiersFromDoc(cfgs.find((c) => c.schema === "config.range-tiers@1"));
  const disp = displacementTiersFromDoc(
    cfgs.find((c) => c.schema === "config.displacement-tiers@1"),
    minBodyRadiusFromConfigs(cfgs as never),
  );
  // ⭐ 三個「代價/回報」軸（GH#445 冷卻 · #446 耗魔 · #447 傷害）。
  //    值一律走 `*FromDoc()`，⛔ 不讀 JSON 的欄位 —— 那三支才是引擎真的在用的解析器。
  const dmg = damageTiersFromDoc(cfgs.find((c) => c.schema === "config.damage-tiers@1"));
  const mana = manaTiersFromDoc(cfgs.find((c) => c.schema === "config.mana-tiers@1"));
  const cd = cooldownTiersFromDoc(cfgs.find((c) => c.schema === "config.cooldown-tiers@1"));
  // ⛔ 少一軸就 throw（見 assertEveryTierAxisIsAccountedFor 的檔頭）。
  const shippedTierSchemas = cfgs
    .map((c) => c.schema ?? "")
    .filter(isTierSchema)
    .sort();
  assertEveryTierAxisIsAccountedFor(shippedTierSchemas);
  const adoption = tierAdoption();
  // ⭐ 錨從 `Arenas` **推導**，⛔ 不抄字面值 24（第二守則：出貨數值不住在文件裡）。
  const zoneRadius = Math.min(...Arenas.all().flatMap((a) => a.zones.map((z) => z.boundaryRadius)));
  const originals = loadOriginals();

  const rows: Row[] = [];
  for (const d of Abilities.all()) {
    const a = d as unknown as { id: string; name?: string; radius?: number; range?: number };
    const hasR = typeof a.radius === "number" && a.radius > 0;
    const hasG = typeof a.range === "number" && a.range > 0;
    if (!hasR && !hasG) continue;
    const n = abilityNumber(a.name) ?? "";
    const o = originals.get(n);
    rows.push({
      id: a.id,
      name: a.name ?? a.id,
      num: n,
      layer: o?.layer ?? "—",
      wcArea: o?.area,
      wcRange: o?.range,
      radius: hasR ? a.radius : undefined,
      range: hasG ? a.range : undefined,
      radiusTier: hasR ? snapToTier(a.radius!, aoe.radius) : undefined,
      rangeTier: hasG ? snapToTier(a.range!, rng.range) : undefined,
      radiusGap: hasR ? snapGap(a.radius!, aoe.radius) : 0,
      rangeGap: hasG ? snapGap(a.range!, rng.range) : 0,
    });
  }
  rows.sort((x, y) => x.id.localeCompare(y.id));

  const L: string[] = [];
  const p = (s = "") => L.push(s);

  p("# GGD 技能級距規範（施法距離 · 施法範圍 · 位移 · 傷害 · 耗魔 · 冷卻）");
  p();
  p("> ⚙️ 這一份是**產生的**。⛔ 不要手改 —— 跑 `" + CMD + "` 重新產生。");
  p("> 守衛：`packages/shared/src/ops/skillTiersDocFresh.test.ts`（真的用 `--check` 跑這支）。");
  p();
  p("owner 2026-08-19：");
  p();
  p("> 「你的技能範圍轉換自 w3x 是不是有問題阿？");
  p("> 1. **可施展技能的距離普遍超遠** 2. **施法範圍也超大**」");
  p();
  p("> 「總之請你將**技能相關設定正規化成五級距**，並且將相關**文件 JSON 編輯器 後台設定 都統一**」");
  p();
  p("owner 2026-08-19（GH#438，這一份要涵蓋的**全部**軸）：");
  p();
  p("> 「你要記得**統一抽象化所有技能的設計模板**，將我說的**施法距離、範圍、");
  p("> 基於傷害及單體/範圍的[耗魔及冷卻]**都模板化」");
  p();
  p("---");
  p();
  p("## 〇 · 一句話結論");
  p();
  p("**換算係數是對的；六個視窗現在各有一張表，而且六張全部住在後台改得到的地方。**");
  p();
  p("`GGD_PER_WC3 = 11/600 = " + GGD_PER_WC3.toFixed(7) + "`（`templates/expand.ts`）通過 owner 自己的校準點：");
  p("04-02 炸彈陣 w3a 300 → 5.5 落「大」，04-03 龍破斬 w3a 450 → 8.25 落「超大」——");
  p("**剛好高一級**，正是 owner 說的「龍破斬應該高一級」。⇒ 係數不動。");
  p();
  p("這一份最早（GH#414）只回答了**幾何**那三軸；缺的是施法距離從來沒有表 —— 量到 " +
    rows.filter((r) => r.range !== undefined).length +
    " 支帶施法距離的技能，各自帶一個從 w3a 換算來的自由數字，最大 " +
    num(Math.max(...rows.filter((r) => r.range !== undefined).map((r) => r.range!))) +
    "，而決鬥區半徑只有 " + num(zoneRadius) + "。");
  p();
  p("**六個視窗現在全部有表了**（GH#438 點名的四軸 = 幾何三軸 + 傷害/耗魔/冷卻），");
  p("而且每一軸都住在 `content/config/*-tiers.json`（＝後台在改的那一份）：");
  p();
  p("| 軸 | JSON 欄位 | 出貨 config | 幾支技能填了 | 開關 |");
  p("|---|---|---|---:|---|");
  const adopt = (k: string) => adoption.byKey.get(k) ?? 0;
  const pct = (k: string) =>
    adoption.total > 0 ? " (" + num(Math.round((adopt(k) / adoption.total) * 1000) / 10) + "%)" : "";
  const onOff = (b: boolean) => (b ? "`enabled: true`" : "⛔ **`enabled: false`（這一軸現在不解析）**");
  p("| 施法距離 | `rangeTier` | `range-tiers.json` | " + adopt("rangeTier") + pct("rangeTier") + " | " + onOff(rng.enabled) + " |");
  p("| 施法範圍 | `radiusTier` | `aoe-tiers.json` | " + adopt("radiusTier") + pct("radiusTier") + " | " + onOff(aoe.enabled) + " |");
  p("| 位移 | `distanceTier` | `displacement-tiers.json` | " + adopt("distanceTier") + pct("distanceTier") + " | " + onOff(disp.enabled) + " |");
  p("| **傷害** | `damageTier` | `damage-tiers.json` | " + adopt("damageTier") + pct("damageTier") + " | " + onOff(dmg.enabled) + " |");
  p("| **耗魔** | `manaCostTier` | `mana-tiers.json` | " + adopt("manaCostTier") + pct("manaCostTier") + " | " + onOff(mana.enabled) + " |");
  p("| **冷卻** | `cooldownTier` (+`cooldownShape`) | `cooldown-tiers.json` | " + adopt("cooldownTier") + pct("cooldownTier") + " | " + onOff(cd.enabled) + " |");
  p();
  p("<sub>分母 = `content/abilities/` 的 " + adoption.total + " 份技能文件（含被動與 EX）。" +
    "⚠️ 採用率**不是** 100% 不代表壞掉：手寫數字一直是合法的寫法，級距是**預設走的那條路**。</sub>");
  p();
  p("---");
  p();
  p("## 一 · 五級距表（出貨值）");
  p();
  p("⭐ **一條梯子，多個視窗。** 五個級距名全專案只有一份（`packages/shared/src/content/skillTiers.ts`");
  p("的 `SKILL_TIER_NAMES`），⛔ 沒有任何一軸可以自己再宣告一組。");
  p();
  p("⭐ **這份契約只描述原始資料。** 下面每一張表就是技能 JSON 那一格級別解析出來的值；");
  p("玩家看到的秒數／距離／傷害由**遊戲主程式在執行期產生**，⛔ 編輯器不換算，");
  p("⛔ 也不需要知道怎麼換算（owner 2026-08-23 的裁決，見 `knobValueNotRestated.test.ts`）。");
  p();
  p("### ① 幾何三軸（長度，單位是 GGD 距離）");
  p();
  p("| 軸 | " + SKILL_TIER_NAMES.join(" | ") + " | 出處 |");
  p("|---|" + SKILL_TIER_NAMES.map(() => "---:").join("|") + "|---|");
  p("| **施法距離** `rangeTier` | " + SKILL_TIER_NAMES.map((t) => num(rng.range[t])).join(" | ") + " | `config/range-tiers.json` |");
  p("| **施法範圍 (AoE)** `radiusTier` | " + SKILL_TIER_NAMES.map((t) => num(aoe.radius[t])).join(" | ") + " | `config/aoe-tiers.json` |");
  p("| **位移 · 衝刺** `distanceTier` | " + SKILL_TIER_NAMES.map((t) => num(disp.travel[t].distance)).join(" | ") + " | `config/displacement-tiers.json` |");
  p("| **位移 · 擊退** `distanceTier` | " + SKILL_TIER_NAMES.map((t) => num(disp.push[t].distance)).join(" | ") + " | `config/displacement-tiers.json` |");
  p();
  p("### ② 回報一軸：傷害（GH#447）");
  p();
  p("| 軸 | " + SKILL_TIER_NAMES.join(" | ") + " | 出處 |");
  p("|---|" + SKILL_TIER_NAMES.map(() => "---:").join("|") + "|---|");
  p("| **傷害** `damageTier` | " + SKILL_TIER_NAMES.map((t) => num(dmg.damage[t])).join(" | ") + " | `config/damage-tiers.json` |");
  p();
  p("⭐ **只有一張表** —— 形狀（單體/範圍）的代價整個住在冷卻軸上，在傷害軸再打一次折");
  p("就是同一個懲罰收兩次。這正是 owner 對 Q4 的回答：「**不用**，已經有傷害相應的冷卻跟耗魔做限制」。");
  p();
  p("⚠️ ⛔ 填了 `damageTier` 就**不要**再填 `flat` / `perRank` —— 級距會取代它們（GH#534）。");
  p("出貨 JSON 裡只寫級別，`flat` 由 `resolveDamageTier()` 在**註冊時**填回去；");
  p("⛔ 直接讀原始 JSON 算傷害會拿到 `undefined`。");
  p();
  p("### ③ 代價兩軸：耗魔（GH#446）與冷卻（GH#445）");
  p();
  p("| 軸 | " + SKILL_TIER_NAMES.join(" | ") + " | 出處 |");
  p("|---|" + SKILL_TIER_NAMES.map(() => "---:").join("|") + "|---|");
  p("| **耗魔** `manaCostTier` | " + SKILL_TIER_NAMES.map((t) => num(mana.manaCost[t])).join(" | ") + " | `config/mana-tiers.json` |");
  for (const shape of COOLDOWN_SHAPES) {
    p("| **冷卻 · " + shape + "** `cooldownTier` | " +
      SKILL_TIER_NAMES.map((t) => num(cd.seconds[shape][t])).join(" | ") + " | `config/cooldown-tiers.json` |");
  }
  p();
  p("⭐ **這是 owner 說的「基於傷害及單體/範圍的耗魔及冷卻」那一句的落地**：形狀不是");
  p("另一個自由參數，它就是**選哪一張冷卻表**。沒填 `cooldownShape` 時由 `cooldownShapeOf()`");
  p("推（`autoShape: " + (cd.autoShape ? "true" : "**false** ⛔ 沒填的一律當「單體」，範圍技會靜默拿到便宜的那張表") + "`）。");
  p();
  p("⚠️ 形狀的定義是 owner 更正過的（U3）：「**單體還是範圍並不是看實際傷害到的個數**，");
  p("而是**施展技能的命中率難易度及傷害效率轉換**」⇒ 看 `castType`，⛔ 不是看 `maxTargets` 或半徑。");
  p();
  p("### ④ 是級距 config，但**不是技能的一軸**");
  p();
  p("⭐ 這一節存在的理由：這份契約的軸清單是**從出貨 config 推導**的，⛔ 不是手寫的。");
  p("出貨了 `config.*-tiers@N` 卻兩邊都沒列 → `" + CMD + "` 直接回非零並指名它。");
  p();
  p("| schema | 為什麼不在上面 |");
  p("|---|---|");
  for (const s of Object.keys(NOT_A_SKILL_AXIS).sort()) {
    p("| `" + s + "` | " + NOT_A_SKILL_AXIS[s] + " |");
  }
  p();
  p("---");
  p();
  p("## 二 · 每一級是怎麼推導出來的");
  p();
  p("錨是 owner 自己給 AoE 的那一句（`aoe-tiers.json` 的原始 note）：");
  p();
  p("> 「決鬥區半徑 " + num(zoneRadius) + "：**大 = 1/4、超大 = 1/3**」");
  p();
  p("把它讀成**分母**再往兩邊延伸，得到六根橫木：");
  p();
  p("| 橫木 | 分數 | 分母 | × 決鬥區半徑 " + num(zoneRadius) + " |");
  p("|---:|---|---:|---:|");
  LADDER_FRACTIONS.forEach((f, i) => {
    const denom = 1 / f;
    const mark = f === 1 / 4 || f === 1 / 3 ? "  ← owner 指定" : "";
    p("| " + i + " | " + ["1/12", "1/8", "3/16", "1/4", "1/3", "1/2"][i] + " | " +
      num(Math.round(denom * 100) / 100) + " | **" + num(Math.round(zoneRadius * f * 100) / 100) + "**" + mark + " |");
  });
  p();
  p("⭐ **這條梯子逐位元重現了改制前出貨的全部 12 個數字**，一個都沒有動到：");
  p();
  p("```");
  p("AoE      3 / 4.5 / 6 / 8           = 橫木 [1..4]");
  p("擊退      2 / 3 / 4.5 / 6           = 橫木 [0..3]");
  p("衝刺      5.5 / 8.25 / 11 / 14.67   = 橫木 [1..4] × " + TRAVEL_SCALE.toFixed(4) + " (= 11/6)");
  p("```");
  p();
  p("⇒ **五級 = 每個視窗往上再取一根橫木。既有的四個數字一格不動。**");
  p("那是這個做法唯一重要的性質：110 支填了 `radiusTier` 的技能，一支都不會因為");
  p("「從四級變五級」而改變手感。");
  p();
  p("⚠️ 比值刻意不是等比也不是等差：**1.5 / 1.333 / 1.333 / 1.5**（對稱）。");
  p("等比會把 owner 指定的 1/4 與 1/3 之中至少一個擠掉，而那兩格是規格。");
  p();
  p("### ⚠️ 兩套詞彙的合併（2026-08-19）");
  p();
  p("改制前 AoE 的第四格叫「超大」、位移的第四格叫「極大」—— **同一個位置兩個名字**。");
  p("合併方向是**量出來的**：出貨內容裡「超大」有 6 支技能在用，位移的「極大」**0 支**。");
  p("");
  p("⛔⛔ **而上面那一段是歷史，⛔ 不是現況。**（2026-08-31 更正）");
  p("⭐ **「超大」已經廢除** —— 出貨的五級距逐字是 `" + SKILL_TIER_NAMES.join(" · ") + "`，");
  p("而使用「超大」的出貨技能是 **0 支**（`grep -l 超大 content/abilities/*.json`）。");
  p("");
  p("⚠️ ⭐ 這一段在此之前寫著「第四格統一叫『超大』」—— **一句在它到期之後還活著的散文**，");
  p("而它住在**對外契約**裡（第三守則：註解會說謊）。⛔ 外部編輯器看不到我們的註冊表，");
  p("沒有辦法發現我們在說謊 ⇒ 照著它做出來的內容，上線就是死的。");
  p("⇒ ⭐ 級距名一律以 `AOE_TIER_NAMES` / `content/config/aoe-tiers.json` 為準，⛔ 不是這一段散文。");
  p("**沒有任何一支既有技能的級距詞改變意思。**");
  p();
  p("### ⭐ 傷害 / 耗魔 / 冷卻：錨不是幾何的，所以理由**逐字住在 config 裡**");
  p();
  p("上面那三軸的每一個數字都是「決鬥區半徑的幾分之幾」—— 一個客觀長度。");
  p("這三軸沒有那種東西可以除，錨只能是**遊戲性**的（一池魔力、一回合能放幾發、擊殺所需發數），");
  p("而那些是**設計決定**。⇒ ⛔ 產生器不編一組出來；下面每一段都是**出貨 config 的 `note` 原文**，");
  p("而那份 note 記著 owner 的原話與推導鏈。改表就要改 note，⛔ 不會有第二份會過期的拷貝。");
  p();
  const noteOf = (schema: string): string => {
    const doc = cfgs.find((c) => c.schema === schema) as { note?: unknown } | undefined;
    const n = doc?.note;
    // ⛔ 沒有 note 不是「留白」—— 那表示這一軸的數字沒有來源（第三守則）。
    return typeof n === "string" && n.trim() !== "" ? n.trim() : "⛔ **這份 config 沒有 `note`** —— 這五個數字目前沒有可查證的來源。";
  };
  for (const [label, schema] of [
    ["傷害 `damage-tiers.json`", "config.damage-tiers@1"],
    ["耗魔 `mana-tiers.json`", "config.mana-tiers@1"],
    ["冷卻 `cooldown-tiers.json`", "config.cooldown-tiers@1"],
  ] as const) {
    p("#### " + label);
    p();
    p("> " + noteOf(schema).replace(/\n+/g, " "));
    p();
  }
  p("---");
  p();
  p("## 三 · w3x → GGD 的換算關係");
  p();
  p("```");
  p("GGD 長度 = WC3 長度 × 11/600 = WC3 × " + GGD_PER_WC3.toFixed(7));
  p("```");
  p();
  p("⚠️ ⛔ 專案裡另外幾處寫的「約 54.5 倍」是**同一個係數的倒數的近似值**（600/11 = 54.5454…）。");
  p("要算的時候用 11/600，⛔ 不要用 54.5 —— 那會讓 450 算成 8.257 而不是 8.25。");
  p();
  p("### ⭐ 取值優先序：JASS > w3a（CLAUDE.md 第〇·六守則第 3 層 vs 第 5 層）");
  p();
  p("owner 2026-08-19：「**JASS 的部分優先權大於 w3x 技能設定**，因為**真正影響造成傷害的可能在 JASS**」。");
  p();
  p("⇒ 下面的逐支對照，每一列都標出它的原作值走的是哪一層：");
  p();
  const byLayer = { JASS: 0, w3a: 0, "—": 0 } as Record<string, number>;
  for (const r of rows) byLayer[r.layer] = (byLayer[r.layer] ?? 0) + 1;
  p("| 來源層 | 幾支 | 意思 |");
  p("|---|---:|---|");
  p("| **JASS**（第 3 層） | " + byLayer["JASS"] + " | JASS 明確寫了 `AoE <數字>`，用它 |");
  p("| **w3a**（第 5 層） | " + byLayer["w3a"] + " | JASS 沒寫幾何，退回 w3a 的 `area` / `cast_range` 欄位 |");
  p("| — | " + byLayer["—"] + " | 對不到原作（GGD 原創、EX、或編號不在 w3x 裡） |");
  p();
  p("⚠️ 「w3a」那一列**不代表已經驗證過** —— 它代表**沒有人去 JASS 確認過**。");
  p("`JASS_BEHAVIOR.json` 的 `geometry` 是稽核欄，只有 35 支寫了明確的 AoE 數字。");

  // JASS vs w3a 打架
  const conflicts: { num: string; name: string; jass: number; w3a: number }[] = [];
  for (const [n, o] of originals) if (o.conflict) {
    // ⚠️ 名字優先取**出貨內容**的（`JASS_BEHAVIOR` 的 skill_name 有些只有編號）。
    const r = rows.find((x) => x.num === n);
    const name = r?.name && r.name !== n ? r.name : n;
    conflicts.push({ num: n, name, jass: o.conflict.jass, w3a: o.conflict.w3a });
  }
  conflicts.sort((a, b) => a.num.localeCompare(b.num));
  p();
  p("### ⚠️ JASS 與 w3a 打架的技能（⛔ 產生器不替 owner 選一個）");
  p();
  if (conflicts.length === 0) {
    p("（目前 0 支：凡是 JASS 寫了明確 AoE 的，都與 w3a 的 `area` 欄位一致。）");
  } else {
    p("| 編號 | 技能 | JASS 說（第 3 層） | w3a 說（第 5 層） | 差 | w3a 這一格是半徑嗎 |");
    p("|---|---|---:|---:|---:|---|");
    for (const c of conflicts) {
      // ⚠️ WC3 的 DataA–F 欄位是**共用的**，同一格在不同技能上意思完全不同。
      //    落在 [50, 1200] 之外的「半徑」不是資料錯誤，是**那一格根本不是半徑** ——
      //    ⛔ 標出來而不是丟掉：丟掉會讓 owner 以為那幾支沒有分歧。
      const plausible = c.w3a >= 50 && c.w3a <= 1200;
      p("| " + c.num + " | " + c.name + " | **" + num(c.jass) + "** | " + num(c.w3a) + " | " +
        num(Math.round((c.jass / c.w3a - 1) * 1000) / 10) + "% | " +
        (plausible ? "✅ 是（真的分歧）" : "⛔ **不是** —— 那一格是別的意思") + " |");
    }
    p();
    p("⭐ 照階梯 JASS 贏。⚠️ 最後一欄是**分歧的種類**，兩種要分開讀：");
    p("· ✅ 那幾支是**真的兩層打架**，請 owner 看一眼 —— 差距本身就是資訊。");
    p("· ⛔ 那幾支不是打架，是 w3a 的 `Area` 欄在那支技能上**根本不是半徑**");
    p("  （WC3 的 DataA–F 是共用欄位）。這正是「只讀 w3a 會得到錯的機制模型」的實證。");
  }

  // 落差大的
  const gaps = rows
    .filter((r) => r.radiusGap > GAP_ALERT || r.rangeGap > GAP_ALERT)
    .sort((a, b) => Math.max(b.radiusGap, b.rangeGap) - Math.max(a.radiusGap, a.rangeGap));
  p();
  p("---");
  p();
  p("## 四 · ⚠️ 落差大的技能 —— **收進級距會改變手感**，請 owner 過目");
  p();
  p("判準：現在的引擎值離**最近的那一級**超過 " + Math.round(GAP_ALERT * 100) + "%（相對級距值）。");
  p("⛔ 這些**沒有**被自動收掉（第〇·六守則：不要四捨五入掉再假裝它一直都是那一級）。");
  p();
  if (gaps.length === 0) {
    p("（目前 0 支。）");
  } else {
    p("共 **" + gaps.length + "** 支。");
    p();
    p("| 技能 | 引擎 AoE | → 級 | 落差 | 引擎施法距離 | → 級 | 落差 |");
    p("|---|---:|---|---:|---:|---|---:|");
    for (const r of gaps) {
      const g = (v: number) => (v > GAP_ALERT ? "**" + Math.round(v * 100) + "%**" : v > 0 ? Math.round(v * 100) + "%" : "—");
      p("| " + r.name + " `" + r.id + "` | " + (r.radius !== undefined ? num(r.radius) : "—") + " | " +
        (r.radiusTier ?? "—") + " | " + (r.radius !== undefined ? g(r.radiusGap) : "—") + " | " +
        (r.range !== undefined ? num(r.range) : "—") + " | " + (r.rangeTier ?? "—") + " | " +
        (r.range !== undefined ? g(r.rangeGap) : "—") + " |");
    }
  }

  p();
  p("---");
  p();
  p("## 五 · 逐支對照（全部 " + rows.length + " 支）");
  p();
  p("`原作` = 依上面的優先序取到的 WC3 值。`引擎` = 真的跑過 `registerAll()` 之後註冊表裡的數字。");
  p("`→級` = 用出貨級距表就近收之後會落在哪一級（⛔ 尚未寫回技能 JSON）。");
  p();
  p("| 技能 | id | 層 | 原作 AoE | 引擎 AoE | →級 | 原作距離 | 引擎距離 | →級 |");
  p("|---|---|---|---:|---:|---|---:|---:|---|");
  for (const r of rows) {
    p("| " + r.name + " | `" + r.id + "` | " + r.layer + " | " +
      (r.wcArea !== undefined ? num(r.wcArea) : "—") + " | " +
      (r.radius !== undefined ? num(r.radius) : "—") + " | " + (r.radiusTier ?? "—") + " | " +
      (r.wcRange !== undefined ? num(r.wcRange) : "—") + " | " +
      (r.range !== undefined ? num(r.range) : "—") + " | " + (r.rangeTier ?? "—") + " |");
  }
  p();
  p("<sub>⚙️ 由 `" + CMD + "` 從出貨 config + 出貨註冊表 + `tools/w3x-import/out/` 產生 · ⛔ 不要手改</sub>");
  p();
  return L.join("\n");
}

// ⚠️ 包成 `main()` 而不是 top-level await —— `tools/` 走 cjs 輸出，
//    top-level await 在那個格式下 esbuild 直接拒絕轉譯。
async function main(): Promise<void> {
  const text = await build();
  const check = process.argv.includes("--check");
  const current = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  if (check) {
    if (current !== text) {
      console.error(`❌ ${DOC} 過期。跑 \`${CMD}\` 然後 git add docs/。`);
      process.exit(1);
    }
    console.log("✅ 技能級距文件是最新的");
  } else {
    writeFileSync(DOC, text);
    console.log(`✅ 寫出 ${DOC}（${text.split("\n").length} 行）`);
  }
}

void main();

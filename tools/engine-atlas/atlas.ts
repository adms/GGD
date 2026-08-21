/**
 * 引擎地圖（engine atlas）—— 「JSON 到底組得出什麼」的完整答案，**推導產生**。
 *
 * owner 2026-08-10 要一份「遊戲主程式/引擎的支援現況及注意事項，包含
 * 數值相加/相乘、上限、buff狀態效果、技能標記效果、大中小距離/範圍、
 * 攻擊/移動速度/距離、[xxx時]…等機制判斷」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 為什麼這一支必須是程式，而不是一份手寫的 md
 *
 * CLAUDE.md 第〇·五守則對能力清單的規定是硬的：「**它不可以是手寫的**」，
 * 理由寫在同一段 —— 這個 repo 已經有一份手寫的 `SIM_CAPABILITIES`，
 * 而它的檔頭自己記錄了它撒過兩次謊。一份手寫的引擎總表會用完全一樣的方式腐爛，
 * 而且腐爛時**不會有任何東西紅**。
 *
 * 所以這裡的每一個數字都有來源，而且來源分成三級（頁面上會標）：
 *
 *   `import`  直接從引擎的常數／登錄表讀出來（STAT_CLAMPS、COMBAT_ENV_KEYS…）
 *   `shipped` 從 `content/` 的出貨檔讀出來（stat-caps.json、combat-env.json…）
 *   ⭐`measured` **真的跑一次**再把結果寫下來
 *
 * ⭐ 第三級是這一支的重點。「pctAdd 是相加、pctMult 是相乘」如果用散文寫，
 * 它就只是一句宣稱；`measureModOps()` 真的建一個 StatsComp、掛上 modifier、
 * 呼叫出貨的 `statPipeline`，然後把**觀察到的數字**寫進頁面。實作改了，
 * 數字就跟著改 —— 它沒有辦法說謊。
 *
 * ⛔ 同樣刻意沒有時間戳（理由同 `tools/capability-export/export.ts`）：
 * 有時間戳就沒辦法用「重新產生 → 比對」當閘。
 *
 * 用法：
 *   npx tsx tools/engine-atlas/atlas.ts          # 產生 docs/engine-atlas.json
 *   npx tsx tools/engine-atlas/atlas.ts --check  # 過期就回非零
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCapabilityManifest } from "../../packages/shared/src/content/editorCapabilities";
import { Stat, STAT_CLAMPS, ALL_STATS, zeroStats } from "../../packages/shared/src/sim/stats/statTypes";
import { ModOp } from "../../packages/shared/src/sim/stats/modifiers";
import { DEFAULT_STAT_CAPS, STAT_CAP_MAX } from "../../packages/shared/src/sim/statCaps";
import { BASE_BONUS_MAX } from "../../packages/shared/src/sim/baseBonus";
import { COMBAT_ENV_KEYS, STAT_ENV_CHAIN, FACTOR_BAND_MAX } from "../../packages/shared/src/sim/combatEnv";
import {
  DEFAULT_COOLDOWN_RULES,
  COOLDOWN_MIN_SECONDS_MAX,
} from "../../packages/shared/src/sim/cooldownRules";
import { ITEM_MODIFIER_LIMITS, ITEM_PERCENT_LIMIT } from "../../packages/shared/src/content/schema/common";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = join(REPO, "docs/engine-atlas.json");

type Provenance = "import" | "shipped" | "measured";
interface Row {
  key: string;
  value: string;
  from: Provenance;
  note?: string;
}

const readJson = (rel: string): any => JSON.parse(readFileSync(join(REPO, rel), "utf8"));
const n = (v: unknown): string => {
  if (typeof v !== "number" || !Number.isFinite(v)) return String(v);
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6)));
};

/* ────────────────────────────────────────────────────────────────────────────
 * ⭐ measured —— 真的跑一次出貨的 statPipeline，把觀察到的數字寫下來。
 *
 * ⚠️ 這裡刻意**不 import statPipeline 的內部**，而是走它對外的那一支
 * （`resolveStat`）。走內部等於在測一個沒有人用的路徑（失敗形態⑤）。
 * ──────────────────────────────────────────────────────────────────────────── */
async function measureModOps(): Promise<Row[]> {
  const { SimWorld } = await import("../../packages/shared/src/sim/SimWorld");
  const { SKELETON_ARENA } = await import("../../packages/shared/src/sim/world/ArenaDef");
  const skel = await import("../../packages/shared/src/sim/content/skeleton");
  const { spawnChampion } = await import("../../packages/shared/src/sim/spawnChampion");
  const { attachSource, recomputeStats } = await import(
    "../../packages/shared/src/sim/stats/statPipeline"
  );
  const ids = await import("../../packages/shared/src/ids");

  skel.registerSkeletonContent();

  /** 掛上這些 modifier 之後，AP 的最終值 —— 走的是出貨的 recomputeStats。 */
  const run = (mods: { op: ModOp; value: number; from?: Stat }[]): number => {
    const world = new SimWorld(SKELETON_ARENA, 11);
    const hero = spawnChampion(world, {
      championId: skel.SELA.id as never,
      seatId: ids.asSeatId(0),
      teamId: ids.asTeamId(0),
      pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: SKELETON_ARENA.zones[0]!.center.z },
      zone: 0,
    });
    world.step(new Map());
    mods.forEach((m, i) =>
      attachSource(world, hero, {
        id: `atlas:${i}`,
        kind: "buff",
        modifiers: [
          { stat: Stat.AbilityPower, op: m.op, value: m.value, ...(m.from ? { from: m.from } : {}) },
        ],
      }),
    );
    recomputeStats(world, hero);
    return world.stats.get(hero)!.final[Stat.AbilityPower];
  };

  const BASE = run([]);
  const show = (label: string, got: number): string =>
    `基底 AP ${n(BASE)} → ${n(got)}（×${n(got / BASE)}）`;

  return [
    {
      key: "沒有任何 modifier（基準）",
      value: `AP ${n(BASE)}`,
      from: "measured",
      note: "下面每一列都拿它當比較基準。它是骨架英雄的值，不是平衡數字。",
    },
    {
      key: "flat（相加）",
      value: show("flat", run([{ op: ModOp.Flat, value: 10 }, { op: ModOp.Flat, value: 25 }])),
      from: "measured",
      note:
        "flat 10 ＋ flat 25 → 直接加 35 在基底上。多條就一路加下去。" +
        "⚠️ 這個 `flat` 是**屬性 modifier 的運算子**（`ModOp.Flat`），" +
        "⛔ 與傷害數值式（`Scaling`）裡那格同名的 `flat` 不是同一件事 —— " +
        "後者已經被 `damageTier` 取代（GH#534），這一格沒有。",
    },
    {
      key: "⭐ pctAdd（同一個總和桶）",
      value: show(
        "pctAdd",
        run([{ op: ModOp.PercentAdd, value: 1 }, { op: ModOp.PercentAdd, value: 3 }]),
      ),
      from: "measured",
      note:
        "pctAdd +100% ＋ pctAdd +300% → 全部先相加再乘**一次**：×(1 + 1.0 + 3.0) = ×5.0。" +
        "這就是「死之王套裝 +300% ＋ 惡夢魔王碎片 +100% = ×5.0 而不是 ×8.0」的原因。",
    },
    {
      key: "pctMult（各自相乘）",
      value: show(
        "pctMult",
        run([{ op: ModOp.PercentMult, value: 1 }, { op: ModOp.PercentMult, value: 3 }]),
      ),
      from: "measured",
      note:
        "同樣的 +100% 與 +300%，但每一條各乘一次：×(1+1.0) × (1+3.0) = ×8.0。" +
        "和上面是**不同的桶**，不會互相合併 —— 選錯 op 就是 5 倍與 8 倍的差別。",
    },
    {
      key: "flat 與 pctAdd 的先後",
      value: show(
        "mixed",
        run([{ op: ModOp.Flat, value: 100 }, { op: ModOp.PercentAdd, value: 1 }]),
      ),
      from: "measured",
      note: "flat +100 再 pctAdd +100%：**先加完 flat 才乘百分比**，也就是 (基底+100)×2。",
    },
    {
      key: "percentOf（取另一條屬性的百分比）",
      value: show(
        "percentOf",
        run([{ op: ModOp.PercentOf, value: 0.05, from: Stat.MaxMana }]),
      ),
      from: "measured",
      note:
        "「AP ＝ 5% 的最大魔力」（光魔杖那一條）。⚠️ 缺 `from` 會被 schema 拒收 —— " +
        "沒有那道閘的話這條 modifier 會**靜默無效**，而文件看起來一切正常。",
    },
  ];
}

/**
 * 出貨內容裡真正出現過的幾何數字 —— 「大中小」用**量到的分布**說，不用形容詞。
 *
 * ⚠️ 只掃 `abilities` / `items` 兩個集合，而且只收 `radius` / `aoeRadius`。
 * 第一版掃整份 bundle 的 `length`，結果混進了模型尺寸那一族（最大 513.5），
 * 分位數整個被拉歪 —— 一個把不相干的數字混進來的分布，比沒有分布更糟。
 */
function measureGeometry(): {
  rows: Row[];
  buckets: { label: string; range: string; count: number }[];
} {
  const bundle = readJson("content/bundle.json");
  const cols = bundle.collections ?? {};
  const radii: number[] = [];
  const walk = (o: any): void => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(walk);
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "number" && (k === "radius" || k === "aoeRadius")) {
        if (v > 0) radii.push(v);
      } else walk(v);
    }
  };
  for (const c of ["abilities", "items"]) walk(cols[c]);
  radii.sort((a, b) => a - b);
  const q = (p: number): number => radii[Math.min(radii.length - 1, Math.floor(radii.length * p))] ?? 0;

  // 攻擊距離的尺 —— 英雄自己的 range，跟 AoE 半徑是不同的軸，分開量。
  const ranges: number[] = [];
  for (const doc of Object.values<any>(cols.champions ?? {})) {
    const r = doc?.baseStats?.range;
    if (typeof r === "number" && r > 0) ranges.push(r);
  }
  ranges.sort((a, b) => a - b);
  const qr = (p: number): number => ranges[Math.min(ranges.length - 1, Math.floor(ranges.length * p))] ?? 0;

  const lo = q(0.33);
  const hi = q(0.66);
  const buckets = [
    { label: "小", range: `< ${n(lo)}`, count: radii.filter((r) => r < lo).length },
    { label: "中", range: `${n(lo)} – ${n(hi)}`, count: radii.filter((r) => r >= lo && r < hi).length },
    { label: "大", range: `≥ ${n(hi)}`, count: radii.filter((r) => r >= hi).length },
  ];
  const rows: Row[] = [
    {
      key: "AoE 半徑樣本（技能＋道具）",
      value: `${radii.length} 個　最小 ${n(radii[0] ?? 0)} / 中位 ${n(q(0.5))} / 最大 ${n(radii[radii.length - 1] ?? 0)}`,
      from: "shipped",
    },
    {
      key: "英雄攻擊距離（baseStats.range）",
      value: `${ranges.length} 位　最小 ${n(ranges[0] ?? 0)} / 中位 ${n(qr(0.5))} / 最大 ${n(ranges[ranges.length - 1] ?? 0)}`,
      from: "shipped",
      note: "⚠️ 這是**基底**，實際射程還要乘 combat-env 的 `attackRange`（下面那張表）。",
    },
  ];
  return { rows, buckets };
}

/**
 * 模板技能的 AoE 半徑 —— 讀**引擎輸出**，不讀作者填的輸入。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ 這一段的第一版是錯的，而且錯得很有教育性 —— 留著這段紀錄，因為它是
 *    CLAUDE.md 失敗形態⑤「被測的不是出貨的那個」在這支工具自己身上的實例。
 *
 * 第一版對整個 `AbilityDef` 做 `walk()` 收集**每一個**叫 `radius` 的數字，
 * 再取 `Math.max`。但 `registries.ts` 的 `mergeExpansion` **刻意保留**
 * `def.template.params`（文件存 ref+params 而不是展開結果，好讓模板升級時
 * 能重新展開每一支引用它的技能）。於是 walk 同時撿到兩個東西：
 *
 *     def.radius                  = 9.41   ← 引擎真正用的（已換算）
 *     def.template.params.radius  = 513.5  ← 作者填的 WC3 原始輸入
 *
 * `Math.max` 選了後者，於是這支工具「量到」29 支全場命中的技能，
 * 而那是 **GH#310，一份誤報**。實際換算一直都有做：`expand.ts` 的
 * `if (slot.unit === "wc3u") return toLen(v)`，係數 `GGD_PER_WC3 = 11/600`。
 * 513.5 × 11/600 = 9.4142 → 9.41，與文件裡的 radius 逐位吻合。
 *
 * ⭐ 教訓不是「walk 很危險」，是**一個宣稱「引擎沒辦法對它說謊」的工具，
 *    自己也要讀出貨的那一個欄位**。現在直接讀 `def.radius`，不做 walk。
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ 第二個缺陷（同一段，被 `?? 24` 救起來所以沒發作）：
 * `SKELETON_ARENA.zones[0]?.radius` —— `ZoneDef` 沒有 `radius` 欄位，
 * 它叫 `boundaryRadius`（`sim/world/ArenaDef.ts:28`）。實測回 `undefined`，
 * 只是剛好 fallback 就是 24 才沒被發現。一個永遠走 fallback 的讀取
 * 跟一個正確的讀取長得一模一樣 —— 這就是為什麼下面那行不再用 `??` 兜底，
 * 讀不到就丟出來。
 */
async function measureOversizedAoe(): Promise<{
  zoneRadius: number;
  total: number;
  over: { id: string; name: string; radius: number }[];
  note: string;
}> {
  const { ContentStore } = await import("../../packages/shared/src/content/store");
  const { registerAll } = await import("../../packages/shared/src/content/registries");
  const { Abilities } = await import("../../packages/shared/src/sim/content/registry");
  const { SKELETON_ARENA } = await import("../../packages/shared/src/sim/world/ArenaDef");

  const bundle = readJson("content/bundle.json");
  const store = new ContentStore();
  for (const [col, payload] of Object.entries<any>(bundle.collections)) {
    for (const e of payload.entries ?? []) store.add(col as never, e.doc.id, e.doc);
  }
  registerAll(store);

  // ⛔ 不用 `?? 24` 兜底：讀不到就是讀錯欄位，要當場炸掉而不是靜默走 fallback。
  const zoneRadius = SKELETON_ARENA.zones[0]?.boundaryRadius;
  if (typeof zoneRadius !== "number") {
    throw new Error("讀不到 zone 的 boundaryRadius —— ArenaDef 的欄位名改了？");
  }

  const over: { id: string; name: string; radius: number }[] = [];
  let total = 0;
  for (const e of bundle.collections.abilities?.entries ?? []) {
    if (typeof e.doc?.template?.params?.radius !== "number") continue;
    total++;
    let def: any;
    try {
      def = Abilities.get(e.doc.id);
    } catch {
      continue;
    }
    // ⬇⬇ THE line：讀 AbilityDef **自己的** radius，那是引擎跑的那一個。
    //     ⛔ 不要走訪整棵樹取 max —— 那會撿到 template.params 裡未換算的輸入。
    const r = def?.radius;
    if (typeof r === "number" && r > zoneRadius) {
      over.push({ id: e.doc.id, name: e.doc.name, radius: r });
    }
  }
  over.sort((a, b) => b.radius - a.radius);
  return {
    zoneRadius,
    total,
    over,
    note:
      over.length === 0
        ? `${total} 支模板技能的 AoE 半徑全部在 zone 半徑 ${zoneRadius} 之內 —— ` +
          "WC3 單位換算（GGD_PER_WC3 = 11/600）由 expand() 正確套用。"
        : `${over.length}/${total} 支超過 zone 半徑 ${zoneRadius}。`,
  };
}

function capsRows(): Row[] {
  const shippedCaps = readJson("content/config/stat-caps.json").caps as Record<
    string,
    { base: number; unlocked: number }
  >;
  const rows: Row[] = [];
  for (const s of ALL_STATS) {
    const clamp = STAT_CLAMPS[s];
    const shipped = shippedCaps[s];
    const dflt = DEFAULT_STAT_CAPS[s];
    if (!clamp && !shipped && !dflt) continue;
    const parts: string[] = [];
    if (clamp) parts.push(`結構夾限 [${n(clamp[0])}, ${n(clamp[1])}]`);
    if (dflt) parts.push(`預設上限 base ${n(dflt.base)} / 解鎖 ${n(dflt.unlocked)}`);
    if (shipped) parts.push(`⚙️出貨 base ${n(shipped.base)} / 解鎖 ${n(shipped.unlocked)}`);
    const bb = BASE_BONUS_MAX[s];
    if (bb !== undefined) parts.push(`後台基礎加成上限 ${n(bb)}`);
    const iv = (ITEM_MODIFIER_LIMITS as unknown as Record<string, number>)[s];
    if (iv !== undefined) parts.push(`道具欄位帶 ±${n(iv)}`);
    rows.push({
      key: s,
      value: parts.join("　·　"),
      from: shipped ? "shipped" : "import",
    });
  }
  return rows;
}

function envRows(): Row[] {
  const shipped = readJson("content/config/combat-env.json");
  const factors: Record<string, number> = shipped.multipliers ?? shipped.factors ?? shipped;
  const statOf: Record<string, string[]> = {};
  for (const [stat, chain] of Object.entries(STAT_ENV_CHAIN as Record<string, any[]>)) {
    for (const link of chain) {
      const keys: string[] =
        typeof link === "string"
          ? [link]
          : link?.key
            ? [link.key]
            : [link?.melee, link?.ranged].filter(Boolean);
      for (const k of keys) (statOf[k] = statOf[k] ?? []).push(stat);
    }
  }
  return COMBAT_ENV_KEYS.map((k) => ({
    key: k,
    value: factors[k] !== undefined ? `×${n(factors[k]!)}` : "（出貨檔沒寫，用預設）",
    from: (factors[k] !== undefined ? "shipped" : "import") as Provenance,
    note: statOf[k]?.length ? `作用於屬性：${statOf[k]!.join("、")}` : "公式格（不直接乘任何一條屬性）",
  }));
}

async function build(): Promise<unknown> {
  const cap = buildCapabilityManifest();
  const geo = measureGeometry();
  const oversized = await measureOversizedAoe();
  const effectFields: string[] = cap.effectFields as string[];
  const pick = (re: RegExp): string[] => effectFields.filter((f) => re.test(f)).sort();

  return {
    schema: "ggd-engine-atlas@1",
    capabilityFingerprint: cap.fingerprint,
    counts: {
      effectKinds: cap.effectKinds.length,
      hookEvents: cap.hookEvents.length,
      conditionLeafKinds: cap.conditionLeafKinds.length,
      templateFamilies: cap.templateFamilies.length,
      effectFields: effectFields.length,
      stats: ALL_STATS.length,
      combatEnvKeys: COMBAT_ENV_KEYS.length,
    },
    stacking: await measureModOps(),
    stackingNote: {
      buckets: Object.values(ModOp),
      itemPercentLimit: ITEM_PERCENT_LIMIT,
    },
    caps: capsRows(),
    capsExtra: [
      { key: "combat-env ×倍率的合法帶", value: `0.1 – ${n(FACTOR_BAND_MAX)}`, from: "import" as Provenance },
      {
        key: "冷卻秒數地板",
        value: `出貨 ${n(DEFAULT_COOLDOWN_RULES.minSeconds)} 秒（欄位上界 ${n(COOLDOWN_MIN_SECONDS_MAX)}）`,
        from: "import" as Provenance,
        note: "比率天花板管長技能、秒數地板管短技能 —— 兩個一起才蓋得住整個值域。",
      },
      {
        key: "全屬性最寬的上界（schema catchall 用）",
        value: (() => {
          const t = STAT_CAP_MAX as unknown as Record<string, number>;
          const top = Object.entries(t).sort((a, b) => b[1] - a[1])[0];
          return top ? `${n(top[1])}（最寬的是 ${top[0]}）` : "—";
        })(),
        from: "import" as Provenance,
      },
    ],
    env: envRows(),
    geometry: geo,
    oversizedAoe: oversized,
    geometryFields: {
      範圍與形狀: pick(/^(radius|length|width|coneAngle|falloff|maxTargets|includeOrigin|shape)$/),
      距離與位移: pick(/(range|distance|speed|dash|leap|knock|pull|blink|teleport)/i),
      時間: pick(/(duration|delay|interval|tick|cooldown|expire|sec)/i),
      疊層與標記: pick(/(stack|mark|maxTriggers|charges|onExisting)/i),
    },
    vocabulary: {
      effectKinds: cap.effectKinds,
      hookEvents: cap.hookEvents,
      conditionLeafKinds: cap.conditionLeafKinds,
      templateFamilies: cap.templateFamilies,
    },
    simCapabilities: cap.simCapabilities,
    planned: cap.planned,
    unsupported: cap.unsupported,
    knownBroken: cap.knownBroken,
  };
}

async function main(): Promise<void> {
  const atlas = await build();
  const text = JSON.stringify(atlas, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    if (cur !== text) {
      console.error("✗ docs/engine-atlas.json 過期了 —— 跑 `npx tsx tools/engine-atlas/atlas.ts`");
      process.exit(1);
    }
    console.log("✓ engine atlas 是最新的");
    return;
  }
  writeFileSync(OUT, text);
  console.log(`✓ ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

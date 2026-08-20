/**
 * Editor-side collection registry: label + schema (from the SHARED Zod table)
 * + a template factory for "create new". Templates are minimal VALID docs.
 */
import { COLLECTIONS, COLLECTION_NAMES, type CollectionName } from "@ggd/shared/content";
import type { ZodTypeAny } from "zod";
import { starterMap } from "@ggd/shared/map/starter";
// ⛔ 種子值不可以是字面量：`progression.levelCap` 抄 99 的那一刻就開始等著過期。
import { LEVEL_CAP } from "@ggd/shared/sim/economy/progression";
// ⭐ 同一個理由的第二批（owner 2026-08-19「技能相關設定正規化成五級距⋯編輯器⋯都統一」）：
//    新技能的冷卻與施法距離從**級距表**長出來，⛔ 不是一組手打的數字。
import { SKILL_TIER_NAMES } from "@ggd/shared/content/skillTiers";
import { DEFAULT_COOLDOWN_TIERS } from "@ggd/shared/content/cooldownTiers";
import { DEFAULT_RANGE_TIERS } from "@ggd/shared/content/rangeTiers";

export interface CollectionEntry {
  name: CollectionName;
  label: string;
  schema: ZodTypeAny;
  template(id: string): unknown;
}

/**
 * ⭐ 新技能的骨架 —— 落在**五級距的格點上**，⛔ 不是一組手打的秒數與距離。
 *
 * owner 2026-08-19：「總之請你將**技能相關設定正規化成五級距** 並且將相關
 * **文件 JSON 編輯器 後台設定 都統一**」。
 *
 * ⚠️ 在此之前這個骨架寫的是 `cooldown: [10, 9, 8, 7, 6]` / `range: 0` ——
 * 也就是**編輯器每按一次「新增技能」，就多生一支不在格點上的技能**，
 * 而那正是 `tierSnap` 那條規則存在的原因（它一次收掉 137 支從 w3x 匯進來的
 * 自由數字）。⛔ 一邊收舊的、一邊從新建鍵繼續生新的，那條規則永遠追不完。
 *
 * ⭐ 兩格都填是**刻意**的（級別 + 值）：
 *   · `cooldown` 陣列**必填**，而且 `resolveCooldownTier` 只在有陣列時才蓋
 *     （「⛔ 不憑空長出一格冷卻」）—— 所以陣列要先在。
 *   · `range` 在 `ability@1` 是必填的純量。
 *   兩格都填時**級別永遠贏**（三支 resolver 一致的決定），所以這裡的值不是
 *   第二個住處，而是「級距關掉時的退路」—— 它從同一份 `DEFAULT_*` 讀出來，
 *   ⛔ 不是手打的。
 *
 * ⚠️ 預設挑**正中間**那一格（五級的第 3 格），⛔ 不是最小或最大 ——
 * 作者從中間往兩邊調，比從一端往上爬少一半的操作。
 */
const MID_TIER = SKILL_TIER_NAMES[Math.floor(SKILL_TIER_NAMES.length / 2)]!;

function abilityTemplate(id: string, slot: "Q" | "W" | "E" | "R") {
  const maxRank = 5;
  return {
    id,
    name: "New Ability",
    slot,
    castType: "self",
    maxRank,
    // ⭐ 級距是**一支技能一格**，所以每一階都是同一個值（＝ resolver 會寫回來的樣子）。
    cooldownTier: MID_TIER,
    cooldown: Array.from<number>({ length: maxRank }).fill(
      DEFAULT_COOLDOWN_TIERS.seconds["單體"][MID_TIER],
    ),
    manaCost: [50, 55, 60, 65, 70],
    rangeTier: MID_TIER,
    range: DEFAULT_RANGE_TIERS.range[MID_TIER],
    effects: [],
  };
}

const TEMPLATES: Record<CollectionName, (id: string) => unknown> = {
  champions: (id) => ({
    id,
    schema: "champion@1",
    name: "New Champion",
    role: "bruiser",
    attackType: "melee",
    modelKey: `champ.${id}`,
    baseStats: { maxHealth: 600, maxMana: 300, ad: 55, armor: 25, mr: 30, as: 0.7, ms: 6.5, range: 1.6, critDamage: 1.75 },
    growth: { maxHealth: 100, ad: 3 },
    abilities: {
      Q: abilityTemplate(`${id}.q`, "Q"),
      W: abilityTemplate(`${id}.w`, "W"),
      E: abilityTemplate(`${id}.e`, "E"),
      // ⭐ 大絕：級距挑**最貴**那一格（⛔ 不是手打 100/85/70），而且 `cooldownShape`
      //    留空 —— 讓出貨的自動判斷去看它到底是單體、範圍還是變身。
      R: {
        ...abilityTemplate(`${id}.r`, "R"),
        maxRank: 3,
        cooldownTier: SKILL_TIER_NAMES[SKILL_TIER_NAMES.length - 1]!,
        cooldown: Array.from<number>({ length: 3 }).fill(
          DEFAULT_COOLDOWN_TIERS.seconds["單體"][SKILL_TIER_NAMES[SKILL_TIER_NAMES.length - 1]!],
        ),
        manaCost: [100, 100, 100],
      },
    },
    skillOrder: ["Q", "W", "E", "R"],
    buildPriority: [],
    tags: [],
  }),
  abilities: (id) => ({ schema: "ability@1", ...abilityTemplate(id, "Q") }),
  items: (id) => ({ id, schema: "item@1", name: "New Item", cost: 500, tier: 1, tags: [] }),
  augments: (id) => ({
    id,
    schema: "augment@1",
    name: "New Augment",
    description: "Describe the effect.",
    tier: "silver",
    weight: 100,
    tags: [],
  }),
  projectiles: (id) => ({ id, schema: "projectile@1", speed: 20, maxRange: 12, hitRadius: 0.5 }),
  "status-effects": (id) => ({ id, schema: "status-effect@1", name: "New Status", polarity: "debuff" }),
  "loot-tables": (id) => ({ id, schema: "loot-table@1", entries: [{ itemId: "ember-rod", weight: 100 }] }),
  arenas: (id) => ({
    id,
    schema: "arena@1",
    name: "New Arena",
    zones: [
      {
        id: "zone-0",
        center: { x: 0, z: 0 },
        boundaryRadius: 24,
        obstacles: [],
        spawns: [[{ x: -16, z: 0 }], [{ x: 16, z: 0 }]],
      },
    ],
  }),
  // GH#324 —— 作者層的地圖版面。⭐ 這一份是**人寫的**；`arena@1` 是 `pnpm map:gen`
  // 從它編譯出來的碰撞真相，⛔ 產生器的輸出禁止手改。
  //
  // ⛔ **這裡以前有 16 行手打的 tiles**，註解寫著「刻意給一張最小但合法的圖…
  // 不會一開場就是一堆紅字」。**那句話是假的**（第三守則）—— 實測那張圖的中央
  // 房間四面全封，`disconnectedRegions`（hard）直接紅，另外還有五項超規格，
  // ⇒ 按「新建」拿到的是一份**產生器會拒絕輸出**的文件。
  //
  // ⭐ 根因不是那 16 行打錯，是它**存在**：版面的產生器就在 shared 裡，而樣板
  // 自己抄了一份 = 第二個真相來源，⛔ 它必然漂移而且漂移時沒有東西會叫。
  // 現在呼叫同一個產生器，守衛逐一驗證四個模板都 `report.ok`。
  maps: (id) => starterMap(id),
  config: (id) => ({
    id,
    schema: "config@1",
    tick: { tickHz: 30, snapshotHz: 20 },
    match: { teamCount: 4, teamSize: 3, startingTeamLives: 8, champSelectSec: 30, intermissionSec: 60, combatMaxSec: 90, resolutionSec: 6 },
    economy: { startingGold: 600, killGold: 150, assistGold: 75, roundWinGold: 300, roundLoseGold: 150, sellRefund: 0.7, inventorySlots: 6 },
    progression: { levelCap: LEVEL_CAP, xpBase: 100, xpPerLevel: 80, xpKill: 120, xpAssist: 60, xpRoundSurvive: 100 },
    draft: { offerCount: 3, tierSchedule: { "1": "silver" } },
  }),
  models: (id) => ({
    id,
    schema: "model@1",
    glbPath: `assets/models/${id}.glb`,
    scale: 1,
    collisionRadius: 0.6,
    clipMap: { idle: "Idle", run: "Run", attack: "Attack", cast: "Cast", hurt: "Hurt", death: "Death" },
  }),
  skins: (id) => ({
    id,
    schema: "skin@1",
    championId: "sela",
    name: "New Skin",
    mcoinPrice: 750,
    modelKey: "champ.sela",
  }),
  // 鑄技工坊 (Skill Forge, #141/#205). A brand-new template starts as a `draft`
  // with NO param slots on purpose: a template's defaults are supposed to be the
  // exemplar's MEASURED JASS values (design §2.1), so the author fills in the
  // exemplar + slots deliberately rather than inheriting invented placeholders.
  // `draft` also means `expand()` refuses it, so an unfinished template can never
  // reach content by accident.
  "ability-templates": (id) => ({
    id,
    schema: "template@1",
    name: "新模板",
    description: "描述這個行為原型 (取自哪一類 JASS 行為)。",
    family: "未分類",
    status: "draft",
    params: {},
    requires: [],
    gapScore: 5,
    exemplar: { skill: "(填入 xx-0X 技能名)", jass: "(填入 rawcode 或 war3map.j:行號)" },
  }),
  vfx: (id) => ({
    id,
    schema: "vfx@1",
    emitter: { shape: "point" },
    mode: "burst",
    burstCount: 24,
    lifetimeSec: { min: 0.2, max: 0.6 },
    size: { start: 0.45, end: 0.1 },
    color: { start: [1, 0.6, 0.2, 1], end: [1, 0.2, 0.05, 0] },
    blendMode: "additive",
  }),
};

export const collectionRegistry: CollectionEntry[] = COLLECTION_NAMES.map((name) => ({
  name,
  label: COLLECTIONS[name].label,
  schema: COLLECTIONS[name].schema,
  template: TEMPLATES[name],
}));

export function collectionEntry(name: CollectionName): CollectionEntry {
  return collectionRegistry.find((c) => c.name === name)!;
}

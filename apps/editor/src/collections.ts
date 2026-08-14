/**
 * Editor-side collection registry: label + schema (from the SHARED Zod table)
 * + a template factory for "create new". Templates are minimal VALID docs.
 */
import { COLLECTIONS, COLLECTION_NAMES, type CollectionName } from "@ggd/shared/content";
import type { ZodTypeAny } from "zod";
import { starterMap } from "@ggd/shared/map/starter";

export interface CollectionEntry {
  name: CollectionName;
  label: string;
  schema: ZodTypeAny;
  template(id: string): unknown;
}

function abilityTemplate(id: string, slot: "Q" | "W" | "E" | "R") {
  return {
    id,
    name: "New Ability",
    slot,
    castType: "self",
    maxRank: 5,
    cooldown: [10, 9, 8, 7, 6],
    manaCost: [50, 55, 60, 65, 70],
    range: 0,
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
      R: { ...abilityTemplate(`${id}.r`, "R"), maxRank: 3, cooldown: [100, 85, 70], manaCost: [100, 100, 100] },
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
    progression: { levelCap: 18, xpBase: 100, xpPerLevel: 80, xpKill: 120, xpAssist: 60, xpRoundSurvive: 100 },
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

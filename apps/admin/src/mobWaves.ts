/**
 * 殭屍波系統 (roguelite mob waves, task #215) — the pure, node-testable logic
 * behind the admin page that tunes `config/arena-rules.json`'s `mobWaves` block.
 *
 * ── WHY A DEDICATED PAGE ────────────────────────────────────────────────────
 * Before this, NOTHING in the console touched arena-rules: `grep -rn
 * "arena-rules\|mobWaves" apps/admin/src/` returned zero hits. Every zombie
 * knob — 每波幾隻 / 場上上限 / 血量 / 攻擊 / 移速 / 等級曲線 / 獎勵 — was a
 * hand edit of a JSON file on the owner's disk, which on the deployed host is a
 * read-only bind mount. The 內容覆蓋層 page could technically write the doc, but
 * only as raw JSON in a textarea, with no labels, no bounds and no idea what
 * any number does.
 *
 * ── SHAPE: CombatEnvPage's, deliberately ────────────────────────────────────
 * Form state holds RAW STRINGS, not numbers, so a half-typed "1." or a
 * deliberately EMPTY box is representable — for this block that second case is
 * load-bearing, because ten of the fields are schema-OPTIONAL and an empty box
 * has to mean 「不覆寫，用系統預設」 rather than 0.
 *
 * ── WHY THE SHIPPED DEFAULTS ARE RESTATED HERE ──────────────────────────────
 * `DEFAULT_MOB_WAVES_CONFIG` lives in `@ggd/shared/content/schema/config`,
 * which imports zod at module scope, and `MOB_CHAMPION_ID`/`MOB_MODEL_KEY` live
 * in `@ggd/shared/sim/mobs`, which drags SimWorld + collision in. This page is
 * an EAGER member of the production admin bundle (its write is a platform admin
 * call, see the page header), so pulling either graph in would be paid by every
 * console load. The values are restated as plain data and PINNED against the
 * originals by mobWaves.test.ts — drift fails the suite instead of shipping a
 * console that quietly disagrees with the engine.
 */

// A TYPE-ONLY import: erased at build time, so no zod reaches the bundle.
import type { MobWavesConfig } from "@ggd/shared/content/schema/config";

export type { MobWavesConfig };

/** The arena-rules doc id + collection this page edits (one doc, one block). */
export const ARENA_RULES_COLLECTION = "config";
export const ARENA_RULES_ID = "arena-rules";

// ------------------------------------------------------------- fallbacks ----

/**
 * What the SIM falls back to when `mob.championId` / `mob.modelKey` are absent
 * (`MOB_CHAMPION_ID` / `MOB_MODEL_KEY` in sim/mobs.ts). Shown next to those two
 * boxes so an empty field reads as 「會用這個」 instead of 「壞掉了」.
 */
export const MOB_CHAMPION_FALLBACK = "godie-zombiex";
export const MOB_MODEL_FALLBACK = "champ.godie-zombiex";
/** `DEFAULT_MOB_BASE_LEVEL` / `DEFAULT_MOB_LEVEL_PER_ROUND` in sim/mobs.ts. */
export const MOB_BASE_LEVEL_FALLBACK = 3;
export const MOB_LEVEL_PER_ROUND_FALLBACK = 1;

/** The shipped `mobWaves` block — the 重設 target and the pre-fetch seed. */
export const SHIPPED_MOB_WAVES: MobWavesConfig = {
  fromRound: 3,
  firstWaveSec: 1,
  waveIntervalSec: 2,
  mobsPerWaveCap: 5,
  maxAlivePerZone: 15,
  schedule: [
    { round: 6, mobsPerWaveCap: 10, maxAlivePerZone: 20 },
    { round: 7, mobsPerWaveCap: 15, maxAlivePerZone: 30 },
    { round: 8, mobsPerWaveCap: 20, maxAlivePerZone: 40 },
    { round: 9, mobsPerWaveCap: 25, maxAlivePerZone: 50 },
    { round: 10, mobsPerWaveCap: 0, maxAlivePerZone: 0 },
  ],
  mob: {
    maxHp: 24,
    attackDamage: 1.2,
    moveSpeed: 3,
    attackRange: 1.8,
    attackCdSec: 1.0,
    radius: 0.6,
    championId: "godie-zombiex",
    // GH#192 — no `modelKey`: the mesh follows the champion. 0.68 keeps the
    // owner's 2026-07-26 「縮小到適合尺寸」 ruling now that the small doc is gone.
    sizeMult: 0.68,
    tintStrength: 0.65,
    baseLevel: 3,
    levelPerRound: 1,
    baseHp: 20,
    hpPerLevel: 20,
    baseRegen: 0,
    regenPerLevel: 0,
  },
  reward: { gold: 20, xp: 40, killsPerLevel: 6 },
  // 殭屍王 + 特殊殭屍 (#262). Restated from `DEFAULT_MOB_WAVES_CONFIG` for the
  // same reason as everything above, and pinned against it by mobWaves.test.ts.
  boss: {
    enabled: true,
    killThreshold: 100,
    repeatable: true,
    maxHp: 6000,
    attackDamage: 12,
    moveSpeed: 2.4,
    attackRange: 2.6,
    attackCdSec: 1.4,
    radius: 1.8,
    hpMult: 100,
    sizeMult: 10,
    bountyGold: 3000,
    bountyXp: 1200,
    lastHitMultiplier: 2,
  },
  special: {
    chancePercent: 5,
    hpMult: 2,
    damageMult: 1.5,
    moveSpeedMult: 1.25,
    radiusMult: 1.8,
    sizeMult: 1.8,
    rewardMult: 3,
  },
};

// ----------------------------------------------------------------- fields ---

/**
 * Every EDITABLE SCALAR in the block, as a dotted path. The per-round schedule
 * is a table, not a scalar, so it is modelled separately below — but everything
 * else the schema admits is here, and `MOB_WAVES_LABELS` is an exhaustive
 * `Record` over this union, so adding a knob to the schema without labelling it
 * is a type error rather than a knob nobody can reach.
 */
export type MobWavesFieldKey =
  | "fromRound"
  | "firstWaveSec"
  | "waveIntervalSec"
  | "mobsPerWaveCap"
  | "maxAlivePerZone"
  | "mob.maxHp"
  | "mob.attackDamage"
  | "mob.moveSpeed"
  | "mob.attackRange"
  | "mob.attackCdSec"
  | "mob.radius"
  | "mob.modelKey"
  | "mob.championId"
  | "mob.sizeMult"
  | "mob.tintStrength"
  | "mob.baseLevel"
  | "mob.levelPerRound"
  | "mob.baseHp"
  | "mob.hpPerLevel"
  | "mob.baseRegen"
  | "mob.regenPerLevel"
  | "reward.gold"
  | "reward.xp"
  | "reward.killsPerLevel"
  // 殭屍王 (#262)
  | "boss.enabled"
  | "boss.killThreshold"
  | "boss.repeatable"
  | "boss.maxHp"
  | "boss.attackDamage"
  | "boss.attackCdSec"
  | "boss.attackRange"
  | "boss.moveSpeed"
  | "boss.radius"
  | "boss.modelKey"
  | "boss.championId"
  | "boss.sizeMult"
  | "boss.hpMult"
  | "boss.bountyGold"
  | "boss.bountyXp"
  | "boss.lastHitMultiplier"
  // 特殊殭屍 (#262)
  | "special.chancePercent"
  | "special.hpMult"
  | "special.damageMult"
  | "special.moveSpeedMult"
  | "special.radiusMult"
  | "special.rewardMult"
  | "special.modelKey"
  | "special.championId"
  | "special.sizeMult";

/** How a box is typed + validated. `champion`/`model` are text with a picker. */
export type FieldKind = "int" | "num" | "text" | "champion" | "model" | "bool";

export interface MobWavesFieldSpec {
  /** 中文名稱 — the row's first column */
  zh: string;
  /** WHAT IT AFFECTS, in one line. Never a restatement of the field name. */
  note: string;
  /** unit suffix printed after the box ("秒" / "隻" / "點"), "" when unitless */
  unit: string;
  kind: FieldKind;
  /** inclusive lower bound, mirroring the zod schema */
  min?: number;
  /** true when the schema marks it `.optional()` — an EMPTY box is legal */
  optional: boolean;
  /** what an empty box means, in words (only for `optional` fields) */
  emptyMeans?: string;
  /**
   * `bool` fields only: what the two states are CALLED. A boolean stored as a
   * bare "1"/"0" is unreadable in a console — the operator has to guess which
   * way round it is — so the picker renders these words and the raw value never
   * reaches the screen.
   */
  boolLabels?: { on: string; off: string };
}

/**
 * Ordered so the page reads top-to-bottom the way the mechanic runs: when waves
 * start → how often → how many → what a zombie IS → what killing one pays.
 */
export const MOB_WAVES_FIELD_ORDER: readonly MobWavesFieldKey[] = [
  "fromRound",
  "firstWaveSec",
  "waveIntervalSec",
  "mobsPerWaveCap",
  "maxAlivePerZone",
  "mob.championId",
  "mob.modelKey",
  "mob.sizeMult",
  "mob.tintStrength",
  "mob.baseLevel",
  "mob.levelPerRound",
  "mob.baseHp",
  "mob.hpPerLevel",
  "mob.baseRegen",
  "mob.regenPerLevel",
  "mob.maxHp",
  "mob.attackDamage",
  "mob.attackCdSec",
  "mob.attackRange",
  "mob.moveSpeed",
  "mob.radius",
  "reward.gold",
  "reward.xp",
  "reward.killsPerLevel",
  "boss.enabled",
  "boss.killThreshold",
  "boss.repeatable",
  "boss.championId",
  "boss.modelKey",
  "boss.sizeMult",
  "boss.hpMult",
  "boss.maxHp",
  "boss.attackDamage",
  "boss.attackCdSec",
  "boss.attackRange",
  "boss.moveSpeed",
  "boss.radius",
  "boss.bountyGold",
  "boss.bountyXp",
  "boss.lastHitMultiplier",
  "special.chancePercent",
  "special.championId",
  "special.modelKey",
  "special.sizeMult",
  "special.hpMult",
  "special.damageMult",
  "special.moveSpeedMult",
  "special.radiusMult",
  "special.rewardMult",
] as const;

/**
 * The bounds mirror `zMobWavesConfig` exactly (packages/shared/.../config.ts),
 * so a value this page accepts is a value the content loader accepts. Where the
 * schema says `.positive()` the min is expressed as a strict-positive check in
 * `validateField`, not as `min: 0`.
 */
export const MOB_WAVES_LABELS: Record<MobWavesFieldKey, MobWavesFieldSpec> = {
  fromRound: {
    zh: "第幾回合開始出殭屍",
    note: "這一回合（含）之後每場戰鬥才會有殭屍；之前的回合完全沒有",
    unit: "回合",
    kind: "int",
    min: 1,
    optional: false,
  },
  firstWaveSec: {
    zh: "第一波出現時間",
    note: "戰鬥開始後這麼多秒，第一波從場地邊緣走進來",
    unit: "秒",
    kind: "num",
    optional: false,
  },
  waveIntervalSec: {
    zh: "每波間隔",
    note: "兩波之間隔幾秒；第 k 波會生出 min(k, 每波數量上限) 隻",
    unit: "秒",
    kind: "num",
    optional: false,
  },
  mobsPerWaveCap: {
    zh: "每波數量上限（基準）",
    note: "一波最多生幾隻。逐回合表沒列到的回合用這個值",
    unit: "隻",
    kind: "int",
    min: 1,
    optional: false,
  },
  maxAlivePerZone: {
    zh: "場上同時上限（基準）",
    note: "每個戰場同時最多幾隻活著；滿了就不再生。逐回合表沒列到的回合用這個值",
    unit: "隻",
    kind: "int",
    min: 1,
    optional: false,
  },
  "mob.championId": {
    zh: "殭屍由誰擔任（英雄文件）",
    note: "殭屍頂著哪個英雄的臉。留空 = 用系統預設；逐回合表可以逐場覆蓋",
    unit: "",
    kind: "champion",
    optional: true,
    emptyMeans: `留空 = ${MOB_CHAMPION_FALLBACK}`,
  },
  "mob.modelKey": {
    zh: "殭屍模型（覆蓋用，通常留空）",
    note: "留空 = 直接讀上面那位英雄的 3D 模型。只有想讓殭屍長成「沒有任何英雄長的樣子」時才填",
    unit: "",
    kind: "model",
    optional: true,
    emptyMeans: `留空 = ${MOB_MODEL_FALLBACK}`,
  },
  "mob.sizeMult": {
    zh: "殭屍體型倍率",
    note: "1 = 跟那位英雄本人一樣大。只影響看起來多大，碰撞體積是下面的「身體半徑」",
    unit: "倍",
    kind: "num",
    optional: true,
    emptyMeans: "留空 = 1 倍（跟英雄本人一樣大）",
  },
  "mob.tintStrength": {
    zh: "殭屍染黑強度",
    note: "0 = 保留英雄原本的顏色（會跟玩家混在一起）、1 = 全黑剪影（看不出是誰）。一般 / 特殊 / 王都吃這一個值",
    unit: "（0～1）",
    kind: "num",
    min: 0,
    optional: true,
    emptyMeans: "留空 = 0.65（出貨值）",
  },
  "mob.baseLevel": {
    zh: "起始等級",
    note: "「開始出殭屍」那一回合的殭屍等級",
    unit: "級",
    kind: "int",
    min: 1,
    optional: true,
    emptyMeans: `留空 = ${MOB_BASE_LEVEL_FALLBACK}`,
  },
  "mob.levelPerRound": {
    zh: "每回合升幾級",
    note: "之後每過一個回合，殭屍等級 +N（血量與回血跟著下面兩條曲線長）",
    unit: "級",
    kind: "int",
    min: 0,
    optional: true,
    emptyMeans: `留空 = ${MOB_LEVEL_PER_ROUND_FALLBACK}`,
  },
  "mob.baseHp": {
    zh: "1 級血量",
    note: "殭屍自己的血量曲線起點（與喪標麥可英雄卡無關，改英雄不會動到這裡）",
    unit: "點",
    kind: "num",
    optional: true,
    emptyMeans: "留空 = 改讀英雄文件的血量成長（舊行為）",
  },
  "mob.hpPerLevel": {
    zh: "每級加血",
    note: "實際血量 = 四捨五入(1 級血量 + 每級加血 ×(等級-1))",
    unit: "點",
    kind: "num",
    min: 0,
    optional: true,
    emptyMeans: "留空 = 0",
  },
  "mob.baseRegen": {
    zh: "1 級每秒回血",
    note: "殭屍的自然回血（0 = 不回血，打掉的血不會長回來）",
    unit: "點/秒",
    kind: "num",
    min: 0,
    optional: true,
    emptyMeans: "留空 = 改讀英雄文件的回血成長（舊行為）",
  },
  "mob.regenPerLevel": {
    zh: "每級加回血",
    note: "實際回血 = 1 級每秒回血 + 每級加回血 ×(等級-1)",
    unit: "點/秒",
    kind: "num",
    min: 0,
    optional: true,
    emptyMeans: "留空 = 0",
  },
  "mob.maxHp": {
    zh: "血量（最後保險值）",
    note: "只有在「1 級血量」留空、而且英雄文件也讀不到時才會用到的固定血量",
    unit: "點",
    kind: "num",
    optional: false,
  },
  "mob.attackDamage": {
    zh: "攻擊力",
    note: "殭屍每次普攻打掉玩家多少血（走完一般減傷）",
    unit: "點",
    kind: "num",
    min: 0,
    optional: false,
  },
  "mob.attackCdSec": {
    zh: "攻擊間隔",
    note: "兩次普攻之間幾秒。越小越痛",
    unit: "秒",
    kind: "num",
    optional: false,
  },
  "mob.attackRange": {
    zh: "攻擊距離",
    note: "追到多近才動手（GGD 單位；英雄體積半徑約 0.6）",
    unit: "單位",
    kind: "num",
    optional: false,
  },
  "mob.moveSpeed": {
    zh: "移動速度",
    note: "殭屍走多快（英雄一般約 6）。留空 = 跟英雄同速，會非常難跑",
    unit: "單位/秒",
    kind: "num",
    min: 0,
    optional: true,
    emptyMeans: "留空 = 6（與英雄基礎移速相同）",
  },
  "mob.radius": {
    zh: "身體半徑",
    note: "碰撞體積，也決定牠們能貼多近、以及從邊緣進場時內縮多少",
    unit: "單位",
    kind: "num",
    optional: false,
  },
  "reward.gold": {
    zh: "每殺一隻給金錢",
    note: "誰打死的誰拿，直接進那個人的錢包",
    unit: "金",
    kind: "int",
    min: 0,
    optional: false,
  },
  "reward.xp": {
    zh: "每殺一隻給經驗",
    note: "同樣只給最後一擊的人",
    unit: "XP",
    kind: "int",
    min: 0,
    optional: false,
  },
  "reward.killsPerLevel": {
    zh: "殺幾隻升一級",
    note: "這是「肉鴿爬升」的主軸：每累積 N 隻擊殺，那個玩家直接 +1 等級",
    unit: "隻",
    kind: "int",
    min: 1,
    optional: false,
  },

  // ── 殭屍王 (#262) ────────────────────────────────────────────────────────
  "boss.enabled": {
    zh: "開啟殭屍王",
    note: "關掉就完全不會有殭屍王：不召喚、不發獎金，其他殭屍照舊",
    unit: "",
    kind: "bool",
    optional: false,
    boolLabels: { on: "開啟", off: "關閉" },
  },
  "boss.killThreshold": {
    zh: "累積幾隻召喚殭屍王",
    note: "算的是「單一英雄」自己的累計擊殺，而且跨回合累積。兩個人各 50 隻不會召喚",
    unit: "隻",
    kind: "int",
    min: 1,
    optional: false,
  },
  "boss.repeatable": {
    zh: "可重複召喚",
    note: "開 = 每滿 N 隻就再來一隻（100、200、300…）；關 = 整場只在剛好第 N 隻那次召喚一次",
    unit: "",
    kind: "bool",
    optional: false,
    boolLabels: { on: "每滿 N 隻都召喚", off: "整場只召喚一次" },
  },
  "boss.championId": {
    zh: "殭屍王由誰擔任（英雄文件）",
    note: "王頂著哪個英雄的臉與模型。留空 = 跟該回合的一般殭屍同一位",
    unit: "",
    kind: "champion",
    optional: true,
    emptyMeans: "留空 = 跟一般殭屍同一位英雄",
  },
  "boss.modelKey": {
    zh: "殭屍王模型（覆蓋用，通常留空）",
    note: "留空 = 讀上面那位英雄的模型；王「看起來是王」現在由下面的體型倍率決定，不再靠另外做一份模型",
    unit: "",
    kind: "model",
    optional: true,
    emptyMeans: "留空 = 用該英雄自己的模型",
  },
  "boss.sizeMult": {
    zh: "殭屍王體型倍率",
    note: "王在畫面上是一般殭屍的幾倍高。⚠️ 10 倍 ≈ 18 單位高，比競技場相機看得到的範圍還高，玩家會被王擋住整個視野",
    unit: "倍",
    kind: "num",
    optional: true,
    emptyMeans: "留空 = 10 倍（出貨值）",
  },
  "boss.hpMult": {
    zh: "殭屍王血量倍率",
    note: "以「那一回合一般殭屍的血量」為基準乘上去。有填就用這個，下面的固定血量會被忽略",
    unit: "倍",
    kind: "num",
    optional: true,
    emptyMeans: "留空 = 改用下面的固定血量",
  },
  "boss.maxHp": {
    zh: "殭屍王固定血量（只在沒填血量倍率時生效）",
    note: "固定值，不隨回合成長。上面的「血量倍率」有填的話，這個數字完全不會被用到",
    unit: "點",
    kind: "num",
    optional: false,
  },
  "boss.attackDamage": {
    zh: "殭屍王攻擊力",
    note: "每次普攻打掉玩家多少血（走完一般減傷）",
    unit: "點",
    kind: "num",
    min: 0,
    optional: false,
  },
  "boss.attackCdSec": {
    zh: "殭屍王攻擊間隔",
    note: "兩次普攻之間幾秒",
    unit: "秒",
    kind: "num",
    optional: false,
  },
  "boss.attackRange": {
    zh: "殭屍王攻擊距離",
    note: "追到多近才動手（王的身體半徑大，這個值也要跟著大）",
    unit: "單位",
    kind: "num",
    optional: false,
  },
  "boss.moveSpeed": {
    zh: "殭屍王移動速度",
    note: "走多快（英雄一般約 6，一般殭屍 3）",
    unit: "單位/秒",
    kind: "num",
    min: 0,
    optional: false,
  },
  "boss.radius": {
    zh: "殭屍王身體半徑",
    note: "碰撞體積。一般殭屍是 0.6，這裡放大就是「王很大隻」的手感來源",
    unit: "單位",
    kind: "num",
    optional: false,
  },
  "boss.bountyGold": {
    zh: "殭屍王獎金總額",
    note: "這是「全部人加起來」的總金額，不是每人。照傷害比例分，最後一刀的人權重加倍",
    unit: "金",
    kind: "int",
    min: 0,
    optional: false,
  },
  "boss.bountyXp": {
    zh: "殭屍王經驗總額",
    note: "同上，也是總量，用同一套比例分下去",
    unit: "XP",
    kind: "int",
    min: 0,
    optional: false,
  },
  "boss.lastHitMultiplier": {
    zh: "最後一刀權重倍率",
    note: "2 = 補刀的人「每點傷害」算兩倍。因為是權重，總額仍然剛好等於上面的總金額",
    unit: "倍",
    kind: "num",
    min: 1,
    optional: false,
  },

  // ── 特殊殭屍 (#262) ──────────────────────────────────────────────────────
  "special.chancePercent": {
    zh: "特殊殭屍出現機率",
    note: "每生一隻殭屍就擲一次。0 = 完全不出現（而且完全不抽亂數）",
    unit: "%",
    kind: "num",
    min: 0,
    optional: false,
  },
  "special.championId": {
    zh: "特殊殭屍由誰擔任（英雄文件）",
    note: "留空 = 跟該回合的一般殭屍同一位英雄",
    unit: "",
    kind: "champion",
    optional: true,
    emptyMeans: "留空 = 跟一般殭屍同一位英雄",
  },
  "special.sizeMult": {
    zh: "特殊殭屍體型倍率",
    note: "畫面上的大小。與下面的「身體半徑倍率」分開：那個是碰撞體積，這個是看起來多大",
    unit: "倍",
    kind: "num",
    optional: true,
    emptyMeans: "留空 = 跟身體半徑倍率同值",
  },
  "special.modelKey": {
    zh: "特殊殭屍模型",
    note: "要跟一般殭屍長得不一樣，玩家才知道自己遇到了什麼。留空 = 跟一般殭屍同一個模型",
    unit: "",
    kind: "model",
    optional: true,
    emptyMeans: "留空 = 用一般殭屍的模型（玩家會分不出來）",
  },
  "special.hpMult": {
    zh: "血量倍率",
    note: "相對同一回合的一般殭屍。2 = 兩倍血",
    unit: "倍",
    kind: "num",
    optional: false,
  },
  "special.damageMult": {
    zh: "攻擊力倍率",
    note: "相對一般殭屍的攻擊力",
    unit: "倍",
    kind: "num",
    min: 0,
    optional: false,
  },
  "special.moveSpeedMult": {
    zh: "移動速度倍率",
    note: "相對一般殭屍的移速。>1 = 追得比較兇",
    unit: "倍",
    kind: "num",
    min: 0,
    optional: false,
  },
  "special.radiusMult": {
    zh: "體型倍率",
    note: "身體半徑與攻擊距離一起放大，所以牠看起來大一圈、也打得到人",
    unit: "倍",
    kind: "num",
    optional: false,
  },
  "special.rewardMult": {
    zh: "獎勵倍率",
    note: "打死牠給的金錢與經驗都乘這個數（升級進度算一隻，不變）",
    unit: "倍",
    kind: "num",
    min: 0,
    optional: false,
  },
};

/** Display grouping — every field appears in EXACTLY ONE group (unit-tested). */
export interface MobWavesGroup {
  title: string;
  /** why this group exists, one line under the heading */
  blurb: string;
  keys: MobWavesFieldKey[];
}

export const MOB_WAVES_GROUPS: MobWavesGroup[] = [
  {
    title: "出怪節奏 · 什麼時候、來幾隻",
    blurb: "逐回合表沒列到的回合，用這裡的兩個「基準」上限。",
    keys: ["fromRound", "firstWaveSec", "waveIntervalSec", "mobsPerWaveCap", "maxAlivePerZone"],
  },
  {
    title: "殭屍身分 · 臉、模型、體型、染黑",
    blurb:
      "選了英雄就直接用那個英雄的 3D 模型（模型欄留空即可）。殭屍一律染黑，避免跟玩家的英雄混在一起。逐回合表可以再逐場覆蓋這裡的英雄。",
    keys: ["mob.championId", "mob.modelKey", "mob.sizeMult", "mob.tintStrength"],
  },
  {
    title: "等級與血量曲線 · 隨回合變強",
    blurb: "等級 = 起始等級 + 每回合升幾級 ×(回合 − 開始回合)；血量與回血再由等級推出來。",
    keys: [
      "mob.baseLevel",
      "mob.levelPerRound",
      "mob.baseHp",
      "mob.hpPerLevel",
      "mob.baseRegen",
      "mob.regenPerLevel",
      "mob.maxHp",
    ],
  },
  {
    title: "戰鬥能力 · 打多痛、跑多快",
    blurb: "這四個決定殭屍是「雜魚」還是「壓力」。",
    keys: ["mob.attackDamage", "mob.attackCdSec", "mob.attackRange", "mob.moveSpeed", "mob.radius"],
  },
  {
    title: "擊殺獎勵 · 打殭屍換什麼",
    blurb: "獎勵只給最後一擊的人。",
    keys: ["reward.gold", "reward.xp", "reward.killsPerLevel"],
  },
  {
    title: "殭屍王 · 單一英雄累積擊殺後召喚",
    blurb:
      "門檻算的是「一個人自己」的累計擊殺，而且跨回合不歸零；王會出現在那個人的戰場。獎金是總額，照參戰傷害比例分，補刀的人權重加倍。",
    keys: [
      "boss.enabled",
      "boss.killThreshold",
      "boss.repeatable",
      "boss.championId",
      "boss.modelKey",
      "boss.sizeMult",
      "boss.hpMult",
      "boss.maxHp",
      "boss.attackDamage",
      "boss.attackCdSec",
      "boss.attackRange",
      "boss.moveSpeed",
      "boss.radius",
      "boss.bountyGold",
      "boss.bountyXp",
      "boss.lastHitMultiplier",
    ],
  },
  {
    title: "特殊殭屍 · 殭屍群裡的那一隻",
    blurb: "每生一隻就擲一次機率。機率填 0 就完全關掉，連亂數都不抽。",
    keys: [
      "special.chancePercent",
      "special.championId",
      "special.modelKey",
      "special.sizeMult",
      "special.hpMult",
      "special.damageMult",
      "special.moveSpeedMult",
      "special.radiusMult",
      "special.rewardMult",
    ],
  },
];

/** True when the display groups partition the field list exactly. */
export function groupsCoverAllFields(): boolean {
  const seen = MOB_WAVES_GROUPS.flatMap((g) => g.keys);
  const all = MOB_WAVES_FIELD_ORDER;
  return (
    seen.length === all.length &&
    new Set(seen).size === all.length &&
    all.every((k) => seen.includes(k))
  );
}

// ------------------------------------------------------------------ form ----

/** One editable row of the per-round schedule table. Raw strings, like the rest. */
export interface ScheduleRowForm {
  round: string;
  mobsPerWaveCap: string;
  maxAlivePerZone: string;
  /** #NEW: 由誰擔任 for this round only. Empty = inherit `mob.championId`. */
  championId: string;
}

export interface MobWavesForm {
  fields: Record<MobWavesFieldKey, string>;
  schedule: ScheduleRowForm[];
}

/** Render a number for an input box: 1 → "1", 1.20 → "1.2". */
export function formatNum(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "";
  return String(Number(n.toFixed(4)));
}

/** Read a dotted path out of a config block. */
export function readField(cfg: MobWavesConfig, key: MobWavesFieldKey): string {
  switch (key) {
    case "fromRound":
      return formatNum(cfg.fromRound);
    case "firstWaveSec":
      return formatNum(cfg.firstWaveSec);
    case "waveIntervalSec":
      return formatNum(cfg.waveIntervalSec);
    case "mobsPerWaveCap":
      return formatNum(cfg.mobsPerWaveCap);
    case "maxAlivePerZone":
      return formatNum(cfg.maxAlivePerZone);
    case "mob.maxHp":
      return formatNum(cfg.mob.maxHp);
    case "mob.attackDamage":
      return formatNum(cfg.mob.attackDamage);
    case "mob.moveSpeed":
      return formatNum(cfg.mob.moveSpeed);
    case "mob.attackRange":
      return formatNum(cfg.mob.attackRange);
    case "mob.attackCdSec":
      return formatNum(cfg.mob.attackCdSec);
    case "mob.radius":
      return formatNum(cfg.mob.radius);
    case "mob.modelKey":
      return cfg.mob.modelKey ?? "";
    case "mob.championId":
      return cfg.mob.championId ?? "";
    case "mob.sizeMult":
      return formatNum(cfg.mob.sizeMult);
    case "mob.tintStrength":
      return formatNum(cfg.mob.tintStrength);
    case "mob.baseLevel":
      return formatNum(cfg.mob.baseLevel);
    case "mob.levelPerRound":
      return formatNum(cfg.mob.levelPerRound);
    case "mob.baseHp":
      return formatNum(cfg.mob.baseHp);
    case "mob.hpPerLevel":
      return formatNum(cfg.mob.hpPerLevel);
    case "mob.baseRegen":
      return formatNum(cfg.mob.baseRegen);
    case "mob.regenPerLevel":
      return formatNum(cfg.mob.regenPerLevel);
    case "reward.gold":
      return formatNum(cfg.reward.gold);
    case "reward.xp":
      return formatNum(cfg.reward.xp);
    case "reward.killsPerLevel":
      return formatNum(cfg.reward.killsPerLevel);
    // #262 — an ABSENT `boss` / `special` block reads as EMPTY, not as 0/false.
    // Empty is what `validateField` rejects for these required fields and what
    // `configFromForm` turns back into an omitted block, so a doc authored
    // before #262 round-trips through this page unchanged instead of silently
    // gaining a disabled king.
    case "boss.enabled":
      return cfg.boss === undefined ? "" : cfg.boss.enabled ? "1" : "0";
    case "boss.repeatable":
      return cfg.boss === undefined ? "" : cfg.boss.repeatable ? "1" : "0";
    case "boss.killThreshold":
      return formatNum(cfg.boss?.killThreshold);
    case "boss.maxHp":
      return formatNum(cfg.boss?.maxHp);
    case "boss.attackDamage":
      return formatNum(cfg.boss?.attackDamage);
    case "boss.attackCdSec":
      return formatNum(cfg.boss?.attackCdSec);
    case "boss.attackRange":
      return formatNum(cfg.boss?.attackRange);
    case "boss.moveSpeed":
      return formatNum(cfg.boss?.moveSpeed);
    case "boss.radius":
      return formatNum(cfg.boss?.radius);
    case "boss.modelKey":
      return cfg.boss?.modelKey ?? "";
    case "boss.championId":
      return cfg.boss?.championId ?? "";
    case "boss.sizeMult":
      return formatNum(cfg.boss?.sizeMult);
    case "boss.hpMult":
      return formatNum(cfg.boss?.hpMult);
    case "boss.bountyGold":
      return formatNum(cfg.boss?.bountyGold);
    case "boss.bountyXp":
      return formatNum(cfg.boss?.bountyXp);
    case "boss.lastHitMultiplier":
      return formatNum(cfg.boss?.lastHitMultiplier);
    case "special.chancePercent":
      return formatNum(cfg.special?.chancePercent);
    case "special.hpMult":
      return formatNum(cfg.special?.hpMult);
    case "special.damageMult":
      return formatNum(cfg.special?.damageMult);
    case "special.moveSpeedMult":
      return formatNum(cfg.special?.moveSpeedMult);
    case "special.radiusMult":
      return formatNum(cfg.special?.radiusMult);
    case "special.rewardMult":
      return formatNum(cfg.special?.rewardMult);
    case "special.modelKey":
      return cfg.special?.modelKey ?? "";
    case "special.championId":
      return cfg.special?.championId ?? "";
    case "special.sizeMult":
      return formatNum(cfg.special?.sizeMult);
  }
}

/** Seed the whole form from a config block. */
export function formFromConfig(cfg: MobWavesConfig): MobWavesForm {
  const fields = {} as Record<MobWavesFieldKey, string>;
  for (const k of MOB_WAVES_FIELD_ORDER) fields[k] = readField(cfg, k);
  return {
    fields,
    schedule: (cfg.schedule ?? []).map((r) => ({
      round: String(r.round),
      mobsPerWaveCap: String(r.mobsPerWaveCap),
      maxAlivePerZone: String(r.maxAlivePerZone),
      championId: r.championId ?? "",
    })),
  };
}

/** The 全部重設 target. */
export function shippedForm(): MobWavesForm {
  return formFromConfig(SHIPPED_MOB_WAVES);
}

export function setField(form: MobWavesForm, key: MobWavesFieldKey, value: string): MobWavesForm {
  return { ...form, fields: { ...form.fields, [key]: value } };
}

export function resetField(form: MobWavesForm, key: MobWavesFieldKey): MobWavesForm {
  return setField(form, key, readField(SHIPPED_MOB_WAVES, key));
}

export function setScheduleCell(
  form: MobWavesForm,
  index: number,
  cell: keyof ScheduleRowForm,
  value: string,
): MobWavesForm {
  const schedule = form.schedule.map((r, i) => (i === index ? { ...r, [cell]: value } : r));
  return { ...form, schedule };
}

/**
 * Add a row for `round`. Seeded with the caps CURRENTLY in force for that round
 * (not with zeros): the operator opened the row to CHANGE something, and a row
 * that lands as 0/0 would silently delete that round's zombies before they got
 * to type anything — the exact 「乾淨總決賽」 setting, applied by accident.
 */
export function addScheduleRow(form: MobWavesForm, round: number): MobWavesForm {
  if (form.schedule.some((r) => Number(r.round) === round)) return form;
  const caps = capsForRound(configFromForm(form), round);
  const row: ScheduleRowForm = {
    round: String(round),
    mobsPerWaveCap: String(caps.mobsPerWaveCap),
    maxAlivePerZone: String(caps.maxAlivePerZone),
    championId: "",
  };
  const schedule = [...form.schedule, row].sort((a, b) => Number(a.round) - Number(b.round));
  return { ...form, schedule };
}

/**
 * Set 「這一回合由誰擔任」 for `round`, CREATING the row when it has none
 * (GH#191).
 *
 * THE UX DEFECT THIS CLOSES. The column was only editable on rounds that
 * already had a schedule row — and the shipped schedule starts at round 6, so
 * rounds 3-5 rendered a plain grey label. Nothing said why; it read as 「這一格
 * 被鎖死了」. Since the caps and the champion are independent overrides, an
 * operator who only wants to change the face should never have to know that a
 * caps row exists at all.
 *
 * The auto-created row inherits the caps CURRENTLY in force for that round
 * (`addScheduleRow`'s own rule), so creating it changes nothing but the face.
 * And clearing the picker back to empty leaves a row whose caps equal the
 * baseline — harmless, and still visible in the table as 「這回合單獨設定」, which
 * is honest: there IS now a row.
 */
export function setRoundChampion(
  form: MobWavesForm,
  round: number,
  championId: string,
): MobWavesForm {
  const existing = form.schedule.findIndex((r) => Number(r.round) === round);
  if (existing >= 0) return setScheduleCell(form, existing, "championId", championId);
  // Nothing to store and no row to store it in — do not manufacture one for a
  // no-op, or opening the dropdown and closing it would dirty the form.
  if (championId.trim() === "") return form;
  const withRow = addScheduleRow(form, round);
  const idx = withRow.schedule.findIndex((r) => Number(r.round) === round);
  return idx < 0 ? withRow : setScheduleCell(withRow, idx, "championId", championId);
}

export function removeScheduleRow(form: MobWavesForm, index: number): MobWavesForm {
  return { ...form, schedule: form.schedule.filter((_, i) => i !== index) };
}

// ------------------------------------------------------------ validation ----

/** Parse an input box: null when it is blank or not a finite number. */
export function parseNum(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Field-level validation mirroring `zMobWavesConfig`. Returns a zh-Hant message
 * or "" when valid. An empty box is legal for an OPTIONAL field and an error for
 * a required one — never silently coerced to 0.
 */
export function validateField(key: MobWavesFieldKey, text: string): string {
  const spec = MOB_WAVES_LABELS[key];
  const t = text.trim();
  // #262 — a `bool`/required field inside an ABSENT block is legal EMPTY: the
  // whole block is simply not authored. `blockEmpty` (below) is what decides
  // that, so `validateField` alone treats empty as 必填 and the form-level
  // `validateForm` waives it for a block nobody has filled in at all.
  if (t === "") return spec.optional ? "" : "必填";
  if (spec.kind === "bool") return t === "1" || t === "0" ? "" : "只能是開或關";
  if (spec.kind === "text" || spec.kind === "champion" || spec.kind === "model") return "";
  const n = Number(t);
  if (!Number.isFinite(n)) return "必須是數字";
  if (spec.kind === "int" && !Number.isInteger(n)) return "必須是整數";
  if (spec.min !== undefined && n < spec.min) return `不能小於 ${spec.min}`;
  // `.positive()` in the schema — 0 is rejected, and saying so beats a 422.
  if (spec.min === undefined && n <= 0) return "必須大於 0";
  return "";
}

export interface ScheduleRowErrors {
  round?: string;
  mobsPerWaveCap?: string;
  maxAlivePerZone?: string;
}

export interface MobWavesErrors {
  fields: Partial<Record<MobWavesFieldKey, string>>;
  /** index-aligned with `form.schedule` */
  schedule: ScheduleRowErrors[];
  /** cross-row problems (duplicate rounds) */
  general: string[];
}

/**
 * True when EVERY field of an optional block (`boss.` / `special.`) is blank —
 * i.e. the operator has not authored the block at all, which the schema allows.
 * Without this, opening the page on a pre-#262 arena-rules doc would light up
 * twenty 必填 errors and gate Save on filling in a mechanic nobody asked for.
 */
export function blockEmpty(form: MobWavesForm, prefix: "boss." | "special."): boolean {
  return MOB_WAVES_FIELD_ORDER.filter((k) => k.startsWith(prefix)).every(
    (k) => form.fields[k].trim() === "",
  );
}

export function validateForm(form: MobWavesForm): MobWavesErrors {
  const fields: Partial<Record<MobWavesFieldKey, string>> = {};
  const bossOff = blockEmpty(form, "boss.");
  const specialOff = blockEmpty(form, "special.");
  for (const k of MOB_WAVES_FIELD_ORDER) {
    if (bossOff && k.startsWith("boss.")) continue;
    if (specialOff && k.startsWith("special.")) continue;
    const e = validateField(k, form.fields[k]);
    if (e) fields[k] = e;
  }

  const schedule: ScheduleRowErrors[] = form.schedule.map((r) => {
    const row: ScheduleRowErrors = {};
    const round = parseNum(r.round);
    if (round === null || !Number.isInteger(round) || round < 1) row.round = "回合必須是 ≥1 的整數";
    const per = parseNum(r.mobsPerWaveCap);
    if (per === null || !Number.isInteger(per) || per < 0) row.mobsPerWaveCap = "必須是 ≥0 的整數";
    const alive = parseNum(r.maxAlivePerZone);
    if (alive === null || !Number.isInteger(alive) || alive < 0) {
      row.maxAlivePerZone = "必須是 ≥0 的整數";
    }
    return row;
  });

  const general: string[] = [];
  const rounds = form.schedule.map((r) => r.round.trim());
  const dupes = rounds.filter((r, i) => r !== "" && rounds.indexOf(r) !== i);
  for (const d of new Set(dupes)) general.push(`第 ${d} 回合有重複的設定列，請只留一列`);

  return { fields, schedule, general };
}

export function formValid(form: MobWavesForm): boolean {
  const errs = validateForm(form);
  return (
    Object.keys(errs.fields).length === 0 &&
    errs.schedule.every((r) => Object.keys(r).length === 0) &&
    errs.general.length === 0
  );
}

// ---------------------------------------------------------------- output ----

/**
 * Build the `mobWaves` block from the form. OPTIONAL fields left blank are
 * OMITTED, never written as 0 — writing `hpPerLevel: 0` where the operator meant
 * "leave it alone" is how an editor silently changes a curve it was asked not to
 * touch. Invalid input falls back to the shipped value, but the page gates Save
 * on `formValid`, so that branch is a safety net and not a path.
 */
export function configFromForm(form: MobWavesForm): MobWavesConfig {
  const num = (key: MobWavesFieldKey, fallback: number): number => {
    const n = parseNum(form.fields[key]);
    return n === null ? fallback : n;
  };
  const optNum = (key: MobWavesFieldKey): number | undefined => {
    const n = parseNum(form.fields[key]);
    return n === null ? undefined : n;
  };
  const optText = (key: MobWavesFieldKey): string | undefined => {
    const t = form.fields[key].trim();
    return t === "" ? undefined : t;
  };
  // "1"/"0" ⇒ true/false. Anything else (blank, or a value the picker could not
  // have produced) falls back to the SHIPPED setting rather than to `false` —
  // silently disabling a mechanic is the worst possible default for a box
  // nobody managed to fill in.
  const bool = (key: MobWavesFieldKey, fallback: boolean): boolean => {
    const t = form.fields[key].trim();
    return t === "1" ? true : t === "0" ? false : fallback;
  };

  const mob: MobWavesConfig["mob"] = {
    maxHp: num("mob.maxHp", SHIPPED_MOB_WAVES.mob.maxHp),
    attackDamage: num("mob.attackDamage", SHIPPED_MOB_WAVES.mob.attackDamage),
    attackRange: num("mob.attackRange", SHIPPED_MOB_WAVES.mob.attackRange),
    attackCdSec: num("mob.attackCdSec", SHIPPED_MOB_WAVES.mob.attackCdSec),
    radius: num("mob.radius", SHIPPED_MOB_WAVES.mob.radius),
  };
  const putNum = (k: keyof MobWavesConfig["mob"], key: MobWavesFieldKey): void => {
    const v = optNum(key);
    if (v !== undefined) (mob as Record<string, unknown>)[k] = v;
  };
  const putText = (k: keyof MobWavesConfig["mob"], key: MobWavesFieldKey): void => {
    const v = optText(key);
    if (v !== undefined) (mob as Record<string, unknown>)[k] = v;
  };
  putNum("moveSpeed", "mob.moveSpeed");
  putText("modelKey", "mob.modelKey");
  putText("championId", "mob.championId");
  putNum("sizeMult", "mob.sizeMult");
  putNum("tintStrength", "mob.tintStrength");
  putNum("baseLevel", "mob.baseLevel");
  putNum("levelPerRound", "mob.levelPerRound");
  putNum("baseHp", "mob.baseHp");
  putNum("hpPerLevel", "mob.hpPerLevel");
  putNum("baseRegen", "mob.baseRegen");
  putNum("regenPerLevel", "mob.regenPerLevel");

  const schedule = form.schedule
    .map((r) => {
      const row: NonNullable<MobWavesConfig["schedule"]>[number] = {
        round: parseNum(r.round) ?? 1,
        mobsPerWaveCap: parseNum(r.mobsPerWaveCap) ?? 0,
        maxAlivePerZone: parseNum(r.maxAlivePerZone) ?? 0,
      };
      const champ = r.championId.trim();
      if (champ !== "") row.championId = champ;
      return row;
    })
    .sort((a, b) => a.round - b.round);

  const out: MobWavesConfig = {
    fromRound: num("fromRound", SHIPPED_MOB_WAVES.fromRound),
    firstWaveSec: num("firstWaveSec", SHIPPED_MOB_WAVES.firstWaveSec),
    waveIntervalSec: num("waveIntervalSec", SHIPPED_MOB_WAVES.waveIntervalSec),
    mobsPerWaveCap: num("mobsPerWaveCap", SHIPPED_MOB_WAVES.mobsPerWaveCap),
    maxAlivePerZone: num("maxAlivePerZone", SHIPPED_MOB_WAVES.maxAlivePerZone),
    mob,
    reward: {
      gold: num("reward.gold", SHIPPED_MOB_WAVES.reward.gold),
      xp: num("reward.xp", SHIPPED_MOB_WAVES.reward.xp),
      killsPerLevel: num("reward.killsPerLevel", SHIPPED_MOB_WAVES.reward.killsPerLevel),
    },
  };
  // An EMPTY table means "no per-round overrides" — write no key at all rather
  // than `schedule: []`, so the doc goes back to exactly the legacy shape.
  if (schedule.length > 0) out.schedule = schedule;

  // #262 — 殭屍王 / 特殊殭屍. A block whose fields are ALL blank is OMITTED, not
  // written as zeros: an omitted block is how the sim is told the sub-mechanic
  // is off (`MobRules.boss === null`), and writing `enabled: false` instead
  // would be a different, louder statement than the operator made. Partially
  // filled blocks cannot reach here — `formValid` gates Save on them — but the
  // shipped value is used as the fallback anyway so this can never emit a doc
  // the schema rejects.
  if (!blockEmpty(form, "boss.")) {
    const sb = SHIPPED_MOB_WAVES.boss!;
    const boss: NonNullable<MobWavesConfig["boss"]> = {
      enabled: bool("boss.enabled", sb.enabled),
      killThreshold: num("boss.killThreshold", sb.killThreshold),
      repeatable: bool("boss.repeatable", sb.repeatable),
      maxHp: num("boss.maxHp", sb.maxHp),
      attackDamage: num("boss.attackDamage", sb.attackDamage),
      moveSpeed: num("boss.moveSpeed", sb.moveSpeed),
      attackRange: num("boss.attackRange", sb.attackRange),
      attackCdSec: num("boss.attackCdSec", sb.attackCdSec),
      radius: num("boss.radius", sb.radius),
      bountyGold: num("boss.bountyGold", sb.bountyGold),
      bountyXp: num("boss.bountyXp", sb.bountyXp),
      lastHitMultiplier: num("boss.lastHitMultiplier", sb.lastHitMultiplier),
    };
    const bm = optText("boss.modelKey");
    if (bm !== undefined) boss.modelKey = bm;
    const bc = optText("boss.championId");
    if (bc !== undefined) boss.championId = bc;
    const bs = optNum("boss.sizeMult");
    if (bs !== undefined) boss.sizeMult = bs;
    const bh = optNum("boss.hpMult");
    if (bh !== undefined) boss.hpMult = bh;
    out.boss = boss;
  }
  if (!blockEmpty(form, "special.")) {
    const ss = SHIPPED_MOB_WAVES.special!;
    const special: NonNullable<MobWavesConfig["special"]> = {
      chancePercent: num("special.chancePercent", ss.chancePercent),
      hpMult: num("special.hpMult", ss.hpMult),
      damageMult: num("special.damageMult", ss.damageMult),
      moveSpeedMult: num("special.moveSpeedMult", ss.moveSpeedMult),
      radiusMult: num("special.radiusMult", ss.radiusMult),
      rewardMult: num("special.rewardMult", ss.rewardMult),
    };
    const sm = optText("special.modelKey");
    if (sm !== undefined) special.modelKey = sm;
    const sc = optText("special.championId");
    if (sc !== undefined) special.championId = sc;
    const ssz = optNum("special.sizeMult");
    if (ssz !== undefined) special.sizeMult = ssz;
    out.special = special;
  }
  return out;
}

/**
 * Splice the block into the FULL arena-rules doc. Every other block (rounds /
 * overflow / flowers / reviveCircles / guardianTower / goldDrop …) is carried
 * through untouched — the overlay stores whole documents, so a save that dropped
 * a sibling block would delete that mechanic on the host.
 */
export function patchArenaRules(
  doc: Record<string, unknown>,
  mobWaves: MobWavesConfig,
): Record<string, unknown> {
  return { ...doc, mobWaves: mobWaves as unknown as Record<string, unknown> };
}

/** Pull the block out of a loaded arena-rules doc; null when it has none. */
export function extractMobWaves(doc: unknown): MobWavesConfig | null {
  if (typeof doc !== "object" || doc === null) return null;
  const block = (doc as Record<string, unknown>)["mobWaves"];
  if (typeof block !== "object" || block === null || Array.isArray(block)) return null;
  const b = block as Record<string, unknown>;
  if (typeof b["mob"] !== "object" || b["mob"] === null) return null;
  if (typeof b["reward"] !== "object" || b["reward"] === null) return null;
  return block as MobWavesConfig;
}

// -------------------------------------------------------- per-round view ----

/**
 * The caps in force for `round` — the console's copy of `mobCapsForRound`
 * (sim/mobs.ts). Restated here for the same reason the defaults are: importing
 * sim/mobs would drag SimWorld into the admin bundle. Pinned against the sim's
 * function by mobWaves.test.ts, which imports it freely under node.
 */
export function capsForRound(
  cfg: MobWavesConfig,
  round: number,
): { mobsPerWaveCap: number; maxAlivePerZone: number } {
  const authored = { mobsPerWaveCap: cfg.mobsPerWaveCap, maxAlivePerZone: cfg.maxAlivePerZone };
  if (!cfg.schedule || round <= 0) return authored;
  const row = cfg.schedule.find((r) => r.round === Math.round(round));
  if (!row) return authored;
  return {
    mobsPerWaveCap: Math.max(0, row.mobsPerWaveCap),
    maxAlivePerZone: Math.max(0, row.maxAlivePerZone),
  };
}

/** The console's copy of `mobLevelForRound`. Same pinning rule as above. */
export function levelForRound(cfg: MobWavesConfig, round: number): number {
  const base = cfg.mob.baseLevel ?? MOB_BASE_LEVEL_FALLBACK;
  const per = cfg.mob.levelPerRound ?? MOB_LEVEL_PER_ROUND_FALLBACK;
  return base + per * Math.max(0, Math.round(round) - cfg.fromRound);
}

/**
 * The hp one mob has in `round`, by the #244 mob-card law
 * `round(baseHp + hpPerLevel*(level-1))`. Returns null when the card has no
 * curve — in that case the sim reads the CHAMPION DOC, which this page cannot
 * see, and printing `maxHp` there would be a number that is simply not true.
 */
export function hpForRound(cfg: MobWavesConfig, round: number): number | null {
  if (cfg.mob.baseHp === undefined) return null;
  const level = levelForRound(cfg, round);
  return Math.max(1, Math.round(cfg.mob.baseHp + (cfg.mob.hpPerLevel ?? 0) * (level - 1)));
}

/** One row of the 逐回合 read-out. */
export interface RoundRow {
  round: number;
  /** false for rounds before `fromRound` — no waves at all */
  active: boolean;
  mobsPerWaveCap: number;
  maxAlivePerZone: number;
  /** true when this round has its own schedule row */
  overridden: boolean;
  /** index into `cfg.schedule` when `overridden`, else -1 */
  scheduleIndex: number;
  /** the champion doc id in force this round (per-round override → mob → sim default) */
  championId: string;
  /** true when the champion came from THIS round's own override */
  championOverridden: boolean;
  level: number;
  hp: number | null;
  /**
   * caps are 0/0 while the round IS active — the deliberate 乾淨總決賽. Called
   * out separately because it looks identical to "misconfigured" in a table.
   */
  cleanFinale: boolean;
}

/**
 * Build the whole per-round read-out, rounds 1..`lastRound`. Rounds before
 * `fromRound` are included on purpose: 「第 3 回合才開始」 is only legible when
 * you can see rounds 1 and 2 sitting there empty.
 */
export function roundRows(cfg: MobWavesConfig, lastRound: number): RoundRow[] {
  const rows: RoundRow[] = [];
  const scheduled = cfg.schedule ?? [];
  const end = Math.max(lastRound, cfg.fromRound, ...scheduled.map((r) => r.round));
  for (let round = 1; round <= end; round++) {
    const active = round >= cfg.fromRound;
    const caps = capsForRound(cfg, round);
    const idx = scheduled.findIndex((r) => r.round === round);
    const row = idx >= 0 ? scheduled[idx] : undefined;
    const champOverride = row?.championId;
    rows.push({
      round,
      active,
      mobsPerWaveCap: active ? caps.mobsPerWaveCap : 0,
      maxAlivePerZone: active ? caps.maxAlivePerZone : 0,
      overridden: idx >= 0,
      scheduleIndex: idx,
      championId: champOverride ?? cfg.mob.championId ?? MOB_CHAMPION_FALLBACK,
      championOverridden: champOverride !== undefined,
      level: levelForRound(cfg, round),
      hp: hpForRound(cfg, round),
      cleanFinale: active && caps.mobsPerWaveCap === 0 && caps.maxAlivePerZone === 0,
    });
  }
  return rows;
}

/** Highest round the arena-rules doc's own `rounds` table names (for the table length). */
export function lastAuthoredRound(doc: unknown, fallback = 10): number {
  if (typeof doc !== "object" || doc === null) return fallback;
  const rounds = (doc as Record<string, unknown>)["rounds"];
  if (typeof rounds !== "object" || rounds === null) return fallback;
  const keys = Object.keys(rounds as Record<string, unknown>)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n));
  return keys.length === 0 ? fallback : Math.max(fallback, ...keys);
}

// --------------------------------------------------------------- champions --

/** A pickable champion for the 由誰擔任 dropdowns. */
export interface ChampionOption {
  id: string;
  /** 中文名; falls back to the id when the doc could not be read */
  name: string;
}

/** Sort by 中文名 so the picker is browsable, with unnamed ids last. */
export function sortChampions(options: readonly ChampionOption[]): ChampionOption[] {
  return [...options].sort((a, b) => {
    const an = a.name === a.id ? 1 : 0;
    const bn = b.name === b.id ? 1 : 0;
    if (an !== bn) return an - bn;
    return a.name.localeCompare(b.name, "zh-Hant");
  });
}

/**
 * "破嵐 (godie-zombiex)" — never a bare id. A dropdown of `godie-*` slugs is
 * unreadable, and the id still has to be visible because it is what is stored.
 */
export function championLabel(id: string, options: readonly ChampionOption[]): string {
  const hit = options.find((o) => o.id === id);
  if (!hit || hit.name === id) return id;
  return `${hit.name}（${id}）`;
}

// -------------------------------------------------------------- messaging ---

/** When a save takes effect. Printed next to Save — the one thing to understand. */
export const APPLY_NOTE = "儲存後寫入平台的耐久覆蓋層；對戰伺服器在下次重啟（部署）時載入，進行中的對戰不受影響";

/**
 * WHERE THE EDIT LIVES — the answer to 「部署一次會不會被蓋掉？」.
 *
 * The write is a `PUT /api/v1/content-overlay/docs/config/arena-rules`, which
 * lands in `DATA_DIR/content-overlay/overlay.json`. On the host DATA_DIR is
 * `<repo>/data` through the `../data:/data` bind mount in docker/compose.yaml —
 * OUTSIDE the image and gitignored (`/data/**`), so neither `git pull` nor
 * `docker compose build && up -d` can touch it. `content/` is mounted `:ro` from
 * the repo and IS overwritten by a pull; that is why this page must never write
 * there. The game-server lays the overlay over the shipped tree at boot
 * (apps/game-server/src/index.ts → fetchOverlayBundle → OverlayContentSource).
 */
export const PERSISTENCE_NOTE =
  "這一頁寫進 data/ 的耐久覆蓋層，不是 repo 裡的 content/。git pull、重建 image、重啟容器都不會蓋掉它。";

/**
 * GH#191/#192 — the page's own statement of what 由誰擔任 now DOES.
 *
 * This constant used to say the opposite (「只會被儲存下來，對戰端還沒有讀它」).
 * It is kept, with the meaning inverted, rather than deleted: the note is what
 * an operator reads before trusting the column, and a page that simply stopped
 * mentioning the column would leave anyone who read the old warning still
 * believing it does nothing.
 */
export const SIM_GAP_NOTE =
  "選了哪個英雄，場上的殭屍就會用那個英雄的臉與 3D 模型（逐回合欄位優先於整場設定）。殭屍一律套上染黑，避免跟玩家的英雄混在一起——染黑強度在下面的「殭屍身分」區塊可調。";

export function loadErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `讀取殭屍波設定失敗：${msg}`;
}

export function saveErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `儲存失敗：${msg}`;
}

/** Fields whose value differs from the doc the server last gave us. */
export function changedFields(form: MobWavesForm, saved: MobWavesConfig): MobWavesFieldKey[] {
  return MOB_WAVES_FIELD_ORDER.filter((k) => form.fields[k].trim() !== readField(saved, k).trim());
}

/** True when the schedule table differs from the saved doc's. */
export function scheduleChanged(form: MobWavesForm, saved: MobWavesConfig): boolean {
  const a = JSON.stringify(configFromForm(form).schedule ?? []);
  const b = JSON.stringify(saved.schedule ?? []);
  return a !== b;
}

export function isDirty(form: MobWavesForm, saved: MobWavesConfig): boolean {
  return changedFields(form, saved).length > 0 || scheduleChanged(form, saved);
}

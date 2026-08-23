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
// A VALUE import, and a deliberately cheap one: `sim/combatEnv` is a leaf
// (its only import is `Stat`) and the admin bundle already carries it for the
// 戰鬥系統 page. `applyGoldFactor` is the SIM's own arithmetic — see 「實發」 below.
import { applyGoldFactor, type CombatEnvKey } from "@ggd/shared/sim/combatEnv";

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
/**
 * #289 由誰擔任的三個來源, in the order the picker shows them: 指定 first (the
 * thing an operator reaches for), 隨機 second, 沿用 last (it behaves exactly like
 * 指定 and only exists so a legacy doc's absent field has a name).
 *
 * MUST stay equal to `zMobChampionSource`'s members — `validateField` rejects
 * anything outside this list, so a value the schema gained and this list did not
 * would be un-savable from the console.
 */
export const CHAMPION_SOURCES = ["fixed", "random", "inherit"] as const;
/**
 * #290 英雄卡讀在幾級的來源, in the order the picker shows them: 公式 first
 * (owner 2026-08-04 把王與特殊殭屍都改成它), 跟場上最高 second, 指定 third,
 * 沿用回合 last.
 *
 * MUST stay equal to `zMobHeroLevelSource` / `MOB_HERO_LEVEL_SOURCES` — the
 * console's `validateField` rejects anything outside this list, so a value the
 * schema gained and this list did not would be un-savable from the page.
 *
 * ⚠️ 2026-08-04 這條差一點就踩到:`"curve"` 進了 Zod 與出貨檔,如果這裡沒跟上,
 * 操作者打開 小怪波 頁按存檔,`optEnum` 會把一個它不認得的值當成「沒填」而**整格
 * 丟掉** —— 存檔成功、畫面正常、王悄悄退回滿級 99。後台 override 蓋掉 content
 * 的那一類故障,沒有任何訊息。
 */
export const HERO_LEVEL_SOURCES = ["curve", "matchHighest", "fixed", "round"] as const;

/**
 * #247 —— 每回合上限算在哪一個範圍上. Restated here rather than imported from
 * `@ggd/shared/sim/mobs` for the reason the file header gives (that module pulls
 * zod at module scope and this page is an eager member of the admin bundle);
 * `mobWaves.test.ts` pins it against the Zod enum so a drift goes red.
 */
export const BOSS_CAP_SCOPES = ["zone", "match"] as const;

/**
 * #247 —— 長血條畫在畫面哪裡 / 什麼時候亮. Restated here for the same reason
 * `BOSS_CAP_SCOPES` is; `mobWaves.test.ts` pins both against the Zod enums.
 */
export const BOSS_BAR_ANCHORS = ["top", "bottom"] as const;
export const BOSS_BAR_REVEALS = ["summon", "sighted"] as const;

/**
 * #291 —— 特殊殭屍分紅結算的三種呈現,依「操作者會先想到的」排序:
 * 完整面板(出貨)→ 一行 toast → 完全不畫。
 *
 * MUST stay equal to `zMobWavesConfig.special.settlementMode` 的 enum ——
 * `validateField` 只收這張表上的值,schema 多一個而這裡沒有的值會變成
 * 「後台存不進去的設定」。`mobWaves.test.ts` 在比對。
 */
export const SETTLEMENT_MODES = ["panel", "toast", "off"] as const;

/** `DEFAULT_MOB_BASE_LEVEL` / `DEFAULT_MOB_LEVEL_PER_ROUND` in sim/mobs.ts. */
export const MOB_BASE_LEVEL_FALLBACK = 3;
export const MOB_LEVEL_PER_ROUND_FALLBACK = 1;

/**
 * 殭屍數量的兩條天花板 (owner 2026-07-30 裁定「上限值 500」).
 *
 * ⚠️ RESTATED, NOT IMPORTED —— 和這個檔案裡每一個出貨值同一個理由(見檔頭):
 * `MOB_ALIVE_CAP_MAX` / `MOB_PER_WAVE_CAP_MAX` 住在
 * `@ggd/shared/content/schema/config`,那個模組在 module scope 就 import zod,
 * 而這一頁是**正式後台 bundle 的 eager 成員**。所以值在這裡重寫一次,並由
 * `mobWaves.test.ts` 直接對照 schema 那兩個常數 —— drift 讓測試紅,而不是讓
 * 後台悄悄和引擎講不同的話。
 *
 * ⚠️ 為什麼這兩格之前**完全沒有上界**:GH#206 那一輪替 `mobWaves` 補 `max` 時
 * 漏掉了它們兩個。結果是 50 打成 5000 在後台、在 Zod、在耐久覆蓋層全部合法,
 * 一直到那一場比賽開始掉幀才會有人知道。這是 #277 的同一個 bug 家族:
 * **只有下界的欄位等於沒有驗證。**
 */
export const MOB_ALIVE_CAP_MAX = 500;
export const MOB_PER_WAVE_CAP_MAX = 500;

/** The shipped `mobWaves` block — the 重設 target and the pre-fetch seed. */
export const SHIPPED_MOB_WAVES: MobWavesConfig = {
  fromRound: 3,
  firstWaveSec: 1,
  waveIntervalSec: 2,
  mobsPerWaveCap: 5,
  maxAlivePerZone: 15,
  // owner 2026-08-02 的兩個回合結束旋鈕（見 schema/config.ts 的說明）。
  stopSpawnOnTeamWipe: true,
  roundHoldMobKinds: "boss",
  // GH#268 精英小怪(特殊殭屍 + 殭屍王)頭上的小血條。34 × 5 是「比冠軍那條
  // (64 × 6)小一號」,0.35u ≈ 頭頂上一個拳頭,1.0 = 全程顯示。
  // MUST stay equal to `DEFAULT_MOB_WAVES_CONFIG.healthBar`(mobWaves.test.ts 釘)。
  healthBar: {
    showHealthBar: true,
    barWidth: 34,
    barHeight: 5,
    yOffset: 0.35,
    showThreshold: 1,
  },
  // GH#647 普通殭屍腳下影子:不畫(owner 2026-08-24「節省效能」)。
  // MUST stay equal to `DEFAULT_MOB_WAVES_CONFIG.normalMobShadow`。
  normalMobShadow: false,
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
    // #289 — 指定 for the rank-and-file zombie (owner defaulted 隨機 on the king
    // and the special only). MUST stay equal to `DEFAULT_MOB_WAVES_CONFIG.mob`.
    championSource: "fixed",
    // GH#192 — no `modelKey`: the mesh follows the champion. 0.68 keeps the
    // owner's 2026-07-26 「縮小到適合尺寸」 ruling now that the small doc is gone.
    sizeMult: 0.68,
    tintStrength: 0.65,
    // #247 owner 2026-08-01 「殭屍王底下圈圈會比較大」. MUST stay equal to
    // `DEFAULT_MOB_WAVES_CONFIG.mob` — mobWaves.test.ts pins the whole block,
    // and this mirror is what the console renders before the GET resolves.
    groundRingDiameter: 1.25,
    groundRingSizeFollow: 1,
    baseLevel: 3,
    levelPerRound: 1,
    // owner 2026-08-04「普通殭屍等級: 回合數*2+1」。有它就以它為準,上面兩格不看。
    levelCurve: { perRoundSq: 0, perRound: 2, flat: 1 },
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
    radius: 0.9,
    // ⭐ owner 2026-08-13「殭屍王可以被考慮是英雄單位」
    countsAsChampion: true,
    // ⚠️ MERGE SEAM (v0.9.12) — see the same note in
    // packages/shared/src/content/schema/config.ts. Two lanes each landed ONE
    // owner instruction and BOTH must survive: #187's 30,000 bounty AND #192's
    // ×100 hp / ×10 size (with `modelKey` GONE, because the king now wears the
    // round's champion and a hard-coded model doc would silently override it).
    //
    // owner 2026-07-28 (#187) 3,000 → 30,000. MUST stay equal to
    // `DEFAULT_MOB_WAVES_CONFIG.boss.bountyGold` in
    // packages/shared/src/content/schema/config.ts (mobWaves.test.ts pins it):
    // this mirror is what the console renders BEFORE the GET resolves, so a
    // drift here shows the operator a default the server never uses.
    hpMult: 100,
    // 體型倍率: GH#192 10 → GH#206 30 → owner 2026-07-29 back to **10** after a
    // playtest (30× was taller than the arena is wide and blocked the camera).
    // MUST stay equal to `DEFAULT_MOB_WAVES_CONFIG.boss` — mobWaves.test.ts
    // pins the whole block, and this mirror is what the console renders before
    // the GET resolves.
    sizeMult: 5,
    // #289 owner 2026-07-29 「特殊殭屍與殭屍王預設是隨機」 + 「從策展白名單抽」.
    // No `championId` beside it: 隨機 and 指定 are two branches, and showing a
    // named hero next to 「隨機」 reads as a contradiction on the page.
    championSource: "random",
    heroHpMult: 20,
    // owner 2026-07-29: 4 → 2 (a huge hp pool is a wall, a huge attack is a
    // one-shot — the same 折衷 the schema note spells out).
    heroDamageMult: 2,
    hpFlatBonus: 100000,
    moveSpeedMult: 0.2,
    heroLevel: 99,
    // #290 — 「就用上面那個 99」 said out loud, so 「跟場上最高」 shows up as a real
    // alternative on the page instead of being invisible.
    // ⚠️ owner 2026-08-04「殭屍王等級: 回合數*回合數+10」把它換成了公式,所以上面
    // 那個 99 **還在檔裡但不再被讀** —— 清掉下面的公式才會回到它。
    heroLevelSource: "curve",
    levelCurve: { perRoundSq: 1, perRound: 0, flat: 10 },
    bountyGold: 30000,
    bountyXp: 1200,
    bountyLevels: 50,
    lastHitMultiplier: 2,
    lastHitMode: "bonus",
    countOverkill: false,
    // #247 owner 2026-08-01 「無視碰撞穿透地形」+「每回合最多只會出現一次」.
    // Mirrors `DEFAULT_MOB_WAVES_CONFIG.boss`; pinned by mobWaves.test.ts.
    noClip: true,
    noClipUnits: true,
    noClipObstacles: true,
    noClipStayInside: true,
    maxPerRound: 1,
    maxPerRoundScope: "zone",
    // #247 owner 2026-08-01 「英雄/bot都會優先打殭屍王」+「亮長血條」.
    aggroRank: -1,
    healthBar: true,
    healthBarAnchor: "top",
    healthBarReveal: "summon",
    // #291 owner 2026-08-03「特殊殭屍 不應該用殭屍王 分紅結算畫面」——
    // 抬頭以前寫死在 ui/hud/mobBossModel.ts，一字不差搬進設定。
    settlementTitle: "殭屍王 分紅結算",
    // ⭐ GH#577 / GH#602 owner 2026-08-23「殭屍王 應該要會自動學習所有技能並施展技能
    // 並且攻速都是上限4起跳 並且優先攻擊玩家角色而非bot」+「回魔速度是每秒1000點」。
    // ⭐ owner 2026-08-23 補的裁決（逐字）：「QWEREX都要學起來根據情況放（最近的敵人
    // 單體或多人範圍），至少殭屍王角色自己原本的技能都要學好學滿、放好放滿，額外追加
    // leap吸血 是給殭屍王一點額外優勢不會單方面被打太無聊而已」。
    king: {
      enabled: true,
      learnRank: 1,
      learnRankMode: "max",
      innateAbilityId: "godie-zombieking.passive",
      innateCastHpPct: 0.2,
      maxMana: 10000,
      manaRegenPerSec: 1000,
      attackSpeedFloor: 4,
      targetPreference: "players",
      situationalAiming: true,
      areaMinTargets: 2,
    },
  },
  special: {
    chancePercent: 1.25,
    hpMult: 1,
    damageMult: 1.5,
    // GH#206 owner 2026-07-29 「移動速度 −50%」 — was 1.25 (FASTER than a zombie).
    moveSpeedMult: 0.5,
    radiusMult: 1.8,
    // ⭐ owner 2026-08-13「特殊殭屍可以被考慮是英雄單位」
    countsAsChampion: true,
    // GH#206 shipped 3; owner 2026-07-29 walked it to 2 (same playtest as the
    // king's 30 → 10).
    sizeMult: 2,
    rewardMult: 3,
    // #289 — 隨機, same ruling as the king's.
    championSource: "random",
    heroHpMult: 5,
    heroDamageMult: 2,
    // #290 owner 2026-07-29: 10,000 → 4,000. The flat used to be 78% of a
    // round-3 special's hp, which made 隨機英雄 cosmetic.
    // owner 2026-08-02 「血太多 請都減半」: 4,000 → 2,000（同批 hpMult 2 → 1）。
    hpFlatBonus: 2000,
    // #290 owner 2026-07-29 「預設是跟當時場上英雄最高等級相同」;
    // owner 2026-08-04 改成公式「特殊殭屍等級: 回合數*3+5」。
    heroLevelSource: "curve",
    levelCurve: { perRoundSq: 0, perRound: 3, flat: 5 },
    // #288 owner 2026-07-29 「特殊殭屍也照傷害比例分,金錢 +5,000 · 等級提升 +5」.
    // MUST stay equal to `DEFAULT_MOB_WAVES_CONFIG.special` — mobWaves.test.ts
    // pins the whole block, and this mirror is what the console renders before
    // the GET resolves. ⚠️ Authoring the pool makes `rewardMult` above INERT
    // for the special; it is kept because clearing the pool is how an operator
    // asks for the old flat reward back.
    bountyGold: 5000,
    bountyXp: 200,
    bountyLevels: 5,
    lastHitMultiplier: 1,
    lastHitMode: "bonus",
    splitByDamage: true,
    countOverkill: false,
    // #291 —— 它自己的字 + 它自己的面板。`toast` / `off` 是逃生門(owner 抱怨過
    // 「怎麼會收到好幾次分紅結算」),不是出貨值。
    settlementTitle: "特殊殭屍 分紅結算",
    settlementMode: "panel",
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
  | "stopSpawnOnTeamWipe"
  | "roundHoldMobKinds"
  // GH#268 精英小怪血條的五格
  | "healthBar.showHealthBar"
  | "healthBar.barWidth"
  | "healthBar.barHeight"
  | "healthBar.yOffset"
  | "healthBar.showThreshold"
  // GH#647 普通殭屍腳下影子
  | "normalMobShadow"
  | "mob.maxHp"
  | "mob.attackDamage"
  | "mob.moveSpeed"
  | "mob.attackRange"
  | "mob.attackCdSec"
  | "mob.radius"
  | "mob.modelKey"
  | "mob.championId"
  // 由誰擔任:指定 / 隨機 (#289)
  | "mob.championSource"
  | "mob.sizeMult"
  | "mob.tintStrength"
  | "mob.groundRingDiameter"
  | "mob.groundRingSizeFollow"
  | "mob.baseLevel"
  | "mob.levelPerRound"
  | "mob.levelCurve.perRoundSq"
  | "mob.levelCurve.perRound"
  | "mob.levelCurve.flat"
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
  | "boss.countsAsChampion"
  | "boss.modelKey"
  | "boss.championId"
  | "boss.championSource"
  | "boss.sizeMult"
  | "boss.hpMult"
  | "boss.bountyGold"
  | "boss.bountyXp"
  | "boss.bountyLevels"
  | "boss.lastHitMultiplier"
  | "boss.lastHitMode"
  | "boss.countOverkill"
  // 從英雄推導 (GH#206)
  | "boss.heroHpMult"
  | "boss.heroDamageMult"
  | "boss.hpFlatBonus"
  | "boss.moveSpeedMult"
  | "boss.heroLevel"
  // 等級來源:跟場上最高 / 指定 / 沿用回合 (#290)
  | "boss.heroLevelSource"
  | "boss.levelCurve.perRoundSq"
  | "boss.levelCurve.perRound"
  | "boss.levelCurve.flat"
  | "boss.noClip"
  | "boss.noClipUnits"
  | "boss.noClipObstacles"
  | "boss.noClipStayInside"
  | "boss.maxPerRound"
  | "boss.maxPerRoundScope"
  | "boss.aggroRank"
  | "boss.healthBar"
  | "boss.healthBarAnchor"
  | "boss.healthBarReveal"
  | "boss.settlementTitle"
  | "boss.king.enabled"
  | "boss.king.learnRank"
  | "boss.king.learnRankMode"
  | "boss.king.innateAbilityId"
  | "boss.king.innateCastHpPct"
  | "boss.king.maxMana"
  | "boss.king.manaRegenPerSec"
  | "boss.king.attackSpeedFloor"
  | "boss.king.targetPreference"
  | "boss.king.situationalAiming"
  | "boss.king.areaMinTargets"
  // 特殊殭屍 (#262)
  | "special.chancePercent"
  | "special.hpMult"
  | "special.damageMult"
  | "special.moveSpeedMult"
  | "special.radiusMult"
  | "special.countsAsChampion"
  | "special.rewardMult"
  | "special.modelKey"
  | "special.championId"
  | "special.championSource"
  | "special.sizeMult"
  | "special.heroHpMult"
  | "special.heroDamageMult"
  | "special.hpFlatBonus"
  | "special.heroLevel"
  | "special.heroLevelSource"
  | "special.levelCurve.perRoundSq"
  | "special.levelCurve.perRound"
  | "special.levelCurve.flat"
  // 特殊殭屍分紅獎池 (#288)
  | "special.bountyGold"
  | "special.bountyXp"
  | "special.bountyLevels"
  | "special.lastHitMultiplier"
  | "special.lastHitMode"
  | "special.splitByDamage"
  | "special.countOverkill"
  | "special.settlementTitle"
  | "special.settlementMode";

/** How a box is typed + validated. `champion`/`model` are text with a picker. */
export type FieldKind = "int" | "num" | "text" | "champion" | "model" | "bool" | "enum";

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
  /**
   * Inclusive UPPER bound, mirroring the zod schema.
   *
   * ⚠️ ADDED BY GH#206 BECAUSE THERE WAS NO UPPER BOUND ANYWHERE ON THIS PAGE.
   * `validateField` only ever checked `min`, so a typo in 殭屍王等級提升 (say
   * 500 instead of 50) sailed past the console and was then rejected — or
   * silently clamped — much further downstream. A bound the operator can see is
   * worth more than one that only exists in a zod file they never open.
   */
  max?: number;
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
  /** `enum` fields only: the legal values, in the order the picker shows them */
  values?: readonly string[];
  /** `enum` fields only: the Chinese label for each value (same reason as `boolLabels`) */
  valueLabels?: Readonly<Record<string, string>>;
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
  "stopSpawnOnTeamWipe",
  "roundHoldMobKinds",
  "healthBar.showHealthBar",
  "healthBar.barWidth",
  "healthBar.barHeight",
  "healthBar.yOffset",
  "healthBar.showThreshold",
  "normalMobShadow",
  "mob.championSource",
  "mob.championId",
  "mob.modelKey",
  "mob.sizeMult",
  "mob.tintStrength",
  "mob.groundRingDiameter",
  "mob.groundRingSizeFollow",
  "mob.baseLevel",
  "mob.levelPerRound",
  "mob.levelCurve.perRoundSq",
  "mob.levelCurve.perRound",
  "mob.levelCurve.flat",
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
  "boss.championSource",
  "boss.championId",
  "boss.modelKey",
  "boss.sizeMult",
  // 從英雄推導 (GH#206) — read BEFORE the legacy numbers they override, so the
  // page reads in precedence order and an operator can see which box wins.
  // #290 — the SOURCE sits above the number it selects, for the same reason:
  // 「幾級」 is meaningless until you know which of the three answers is live.
  "boss.heroLevelSource",
  "boss.levelCurve.perRoundSq",
  "boss.levelCurve.perRound",
  "boss.levelCurve.flat",
  "boss.heroLevel",
  "boss.heroHpMult",
  "boss.hpFlatBonus",
  "boss.heroDamageMult",
  "boss.moveSpeedMult",
  "boss.hpMult",
  "boss.maxHp",
  "boss.attackDamage",
  "boss.attackCdSec",
  "boss.attackRange",
  "boss.moveSpeed",
  "boss.radius",
  "boss.countsAsChampion",
  "boss.bountyGold",
  "boss.bountyXp",
  "boss.bountyLevels",
  "boss.lastHitMultiplier",
  "boss.lastHitMode",
  "boss.countOverkill",
  // #247 —— 無視碰撞 + 每回合上限。排在獎金之後,因為它們回答的是「王走不走得到
  // 你、一回合來幾隻」,不是「打死牠拿多少」。
  "boss.noClip",
  "boss.noClipUnits",
  "boss.noClipObstacles",
  "boss.noClipStayInside",
  "boss.maxPerRound",
  "boss.maxPerRoundScope",
  // #247 第二批 —— 「打誰」與「怎麼被看見」。排在最後,因為它們既不是王的數值也
  // 不是獎金,而是「牠出現之後場上與畫面怎麼反應」。
  "boss.aggroRank",
  "boss.healthBar",
  "boss.healthBarAnchor",
  "boss.healthBarReveal",
  // #291 —— 分紅結算的字。排在長血條之後,因為它們回答的是同一種問題:
  // 「牠出現／死掉之後,畫面上要說什麼」。
  "boss.settlementTitle",
  "boss.king.enabled",
  "boss.king.learnRank",
  "boss.king.learnRankMode",
  "boss.king.innateAbilityId",
  "boss.king.innateCastHpPct",
  "boss.king.maxMana",
  "boss.king.manaRegenPerSec",
  "boss.king.attackSpeedFloor",
  "boss.king.targetPreference",
  "boss.king.situationalAiming",
  "boss.king.areaMinTargets",
  "special.chancePercent",
  "special.championSource",
  "special.championId",
  "special.modelKey",
  "special.sizeMult",
  "special.heroLevelSource",
  "special.levelCurve.perRoundSq",
  "special.levelCurve.perRound",
  "special.levelCurve.flat",
  "special.heroLevel",
  "special.heroHpMult",
  "special.hpFlatBonus",
  "special.heroDamageMult",
  "special.hpMult",
  "special.damageMult",
  "special.moveSpeedMult",
  "special.radiusMult",
  "special.countsAsChampion",
  "special.rewardMult",
  // 分紅獎池 (#288) — LAST in the special's run, mirroring where the king's
  // bounty sits in its own: 「牠是什麼」 first, 「殺了牠給什麼」 after.
  "special.bountyGold",
  "special.bountyXp",
  "special.bountyLevels",
  "special.splitByDamage",
  "special.lastHitMultiplier",
  "special.lastHitMode",
  "special.countOverkill",
  // #291 —— owner 2026-08-03「特殊殭屍 不應該用殭屍王 分紅結算畫面」。
  "special.settlementTitle",
  "special.settlementMode",
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
    max: MOB_PER_WAVE_CAP_MAX,
    optional: false,
  },
  maxAlivePerZone: {
    zh: "場上同時上限（基準）",
    note: "每個戰場同時最多幾隻活著；滿了就不再生。逐回合表沒列到的回合用這個值。這是「每個戰場」，一場四個戰場，所以填 500 是場上 2,000 隻",
    unit: "隻",
    kind: "int",
    min: 1,
    max: MOB_ALIVE_CAP_MAX,
    optional: false,
  },
  stopSpawnOnTeamWipe: {
    zh: "一隊全滅就停止生成殭屍",
    note: "開（預設）＝任何一隊的英雄全部倒下的那一刻，那個戰場立刻不再生新的殭屍。關＝照原本的波次一直生到回合結束。⚠️ 關掉會讓回合拖很久：場上的殭屍與下面那格一起決定回合什麼時候能結算，而殭屍一直生就一直有殭屍",
    unit: "",
    kind: "bool",
    boolLabels: { on: "一隊全滅就停生", off: "照波次一直生" },
    optional: true,
    emptyMeans: "沿用出貨預設「一隊全滅就停生」",
  },
  roundHoldMobKinds: {
    zh: "哪幾種殭屍會壓住回合不結束",
    note: "只剩一隊還站著時，場上還有這幾種殭屍就先不宣佈勝利。出貨值是「只有殭屍王」（owner 2026-08-02「場上沒有殭屍王 回合應該要馬上勝利結算」）。選「任何殭屍」會回到 2026-07-30 的舊行為，那會讓回合幾乎一定要等火圈燒完",
    unit: "",
    kind: "enum",
    values: ["none", "boss", "bossAndSpecial", "any"],
    valueLabels: {
      none: "都不壓 —— 一隊全滅就結束",
      boss: "只有殭屍王（出貨值）",
      bossAndSpecial: "殭屍王 + 特殊殭屍",
      any: "任何殭屍（舊行為）",
    },
    optional: true,
    emptyMeans: "沿用出貨預設「只有殭屍王」",
  },
  "healthBar.showHealthBar": {
    zh: "精英小怪頭上要不要有血條",
    note:
      "特殊殭屍與殭屍王頭上那條小血條(一般殭屍**不會**有 —— 波峰時一區 50 隻,50 條血條會把畫面糊掉)。" +
      "關掉＝畫面上一個節點都不畫,不是畫成透明。⚠️ 這和下面殭屍王那條**長血條**是兩回事:" +
      "長血條回答「這一區有沒有王」,這一條回答「我正在打的這一隻還剩多少」",
    unit: "",
    kind: "bool",
    boolLabels: { on: "顯示（出貨）", off: "完全不畫" },
    optional: true,
    emptyMeans: "留空 = 顯示",
  },
  "healthBar.barWidth": {
    zh: "└ 血條寬度",
    note:
      "冠軍(玩家)那條是 64,精英刻意小一號 —— 波峰時畫面上同時有 12 個玩家,一條和玩家一樣寬的血條會被誤讀成「那裡有個人」。" +
      "上限 200 是防呆:打成 5000 會蓋掉半個畫面",
    unit: "px",
    kind: "num",
    min: 8,
    max: 200,
    optional: true,
    emptyMeans: "留空 = 34",
  },
  "healthBar.barHeight": {
    zh: "└ 血條厚度",
    note: "太薄在手機上看不到,太厚會把小怪的頭蓋住。冠軍那條是 6",
    unit: "px",
    kind: "num",
    min: 1,
    max: 40,
    optional: true,
    emptyMeans: "留空 = 5",
  },
  "healthBar.yOffset": {
    zh: "└ 血條離頭頂多高",
    note:
      "⚠️ 單位是**世界高度**,不是像素。特殊殭屍體型倍率 2、王 5,一個固定的像素偏移會讓王的血條埋進牠胸口。" +
      "實際高度 = 1.8 × 體型倍率 + 這一格。負值 = 畫進頭裡面(極矮的模型會需要)",
    unit: "單位",
    kind: "num",
    min: -2,
    max: 6,
    optional: true,
    emptyMeans: "留空 = 0.35（頭頂上一個拳頭）",
  },
  "healthBar.showThreshold": {
    zh: "└ 血量低於多少才亮血條",
    note:
      "1.0(出貨)＝ 只要是精英就全程顯示。0.5 ＝ 只有半血以下才亮,是一種「快死了才給線索」的玩法。" +
      "⚠️ 這是**唯一**能讓血條在死亡前消失的格子 —— 其他任何提早消失都是缺陷(GH#268 兩次回報都是這個)",
    unit: "比例",
    kind: "num",
    min: 0,
    max: 1,
    optional: true,
    emptyMeans: "留空 = 1.0（全程顯示）",
  },
  normalMobShadow: {
    zh: "普通殭屍腳下要不要畫陰影",
    note:
      "GH#647(owner:「普通殭屍不必畫血條跟陰影 節省效能」)。R7 波峰一區 30 隻 × 2 區 = 60 顆半透明陰影圓盤," +
      "每顆是一次 draw call 加一層地板 overdraw。**精英(特殊殭屍 + 殭屍王)不吃這一格** —— 牠們的影子照畫," +
      "因為體型 2×/5× 的讀感主要靠影子。打開 = 回到舊行為(普通殭屍也有影子)",
    unit: "",
    kind: "bool",
    boolLabels: { on: "畫（舊行為）", off: "不畫（出貨，省效能）" },
    optional: true,
    emptyMeans: "留空 = 不畫（出貨）",
  },
  "mob.championSource": {
    zh: "殭屍由誰擔任：指定還是隨機",
    note: "指定 = 用下面那格填的英雄；隨機 = 每回合從策展白名單（線上開放的英雄）抽一位。逐回合表如果那一場指定了英雄，那一場以逐回合表為準",
    unit: "",
    kind: "enum",
    values: ["fixed", "random", "inherit"],
    valueLabels: {
      fixed: "指定（用下面那位）",
      random: "隨機（每回合抽一位）",
      inherit: "沿用（同「指定」）",
    },
    optional: true,
    emptyMeans: "留空 = 指定（用下面那位英雄）",
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
  // ── #247 腳下圈圈 (owner 2026-08-01「殭屍王底下圈圈會比較大」) ─────────────────
  "mob.groundRingDiameter": {
    zh: "殭屍腳下圈圈直徑（體型 1 倍時）",
    note: "只是畫面上的一個圈，⚠️ 完全不影響王撞得到什麼、走不走得過去（碰撞用的是各自的「身體半徑」那一格）。1.25 就是玩家英雄自己的圈；填 0 就完全不畫",
    unit: "單位",
    kind: "num",
    min: 0,
    max: 8,
    optional: true,
    emptyMeans: "留空 = 1.25（跟玩家一樣大）",
  },
  "mob.groundRingSizeFollow": {
    zh: "└ 圈圈跟著體型放大的程度",
    note: "1 = 完全跟著（10 倍大的王 → 10 倍大的圈，這是 owner 要的）；0 = 不管多大隻，圈圈都一樣。跟上一格分開，是因為「圈本身多大」和「王的圈要不要跟著變大」是兩個決定",
    unit: "倍",
    kind: "num",
    min: 0,
    max: 2,
    optional: true,
    emptyMeans: "留空 = 1（完全跟著體型）",
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
  "mob.levelCurve.perRoundSq": {
    zh: "一般殭屍等級公式 · 回合² 係數 (A)",
    note: "等級 = 回合² × A + 回合 × B + C，結果夾在 1–99。三格要嘛一起填、要嘛一起留空 —— 只填一兩格會被當成沒填。填 0 = 直線成長。出貨是 A=0 · B=2 · C=1，也就是「回合×2+1」",
    unit: "",
    kind: "num",
    min: 0,
    max: 5,
    optional: true,
    emptyMeans: "留空 = 不用公式（改回上面的「起始等級 + 每回合升幾級」）",
  },
  "mob.levelCurve.perRound": {
    zh: "一般殭屍等級公式 · 回合 係數 (B)",
    note: "每過一個回合等級加多少（線性那一項）。出貨是 A=0 · B=2 · C=1，也就是「回合×2+1」",
    unit: "",
    kind: "num",
    min: 0,
    max: 50,
    optional: true,
    emptyMeans: "留空 = 不用公式（同上）",
  },
  "mob.levelCurve.flat": {
    zh: "一般殭屍等級公式 · 常數 (C)",
    note: "第 0 回合的底,也就是整條線往上抬多少。出貨是 A=0 · B=2 · C=1，也就是「回合×2+1」",
    unit: "級",
    kind: "num",
    min: 0,
    max: 99,
    optional: true,
    emptyMeans: "留空 = 不用公式（同上）",
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
    // ⚠️ 第三守則：「直接進那個人的錢包」在 2026-08-04 的 金錢發放倍率 之後就是
    // 半句真話 —— 錢是直接進錢包沒錯，但進去的不是這個數字（量到的：20 → 10）。
    note: "誰打死的誰拿，直接進那個人的錢包。這是**設定值不是實發**：普通殭屍再乘一次戰鬥系統的「打一般殭屍發放金錢」（右邊的「實發」就是它），特殊殭屍走的是另一格，而且還要再乘上面的「獎勵倍率」",
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
  // ── #247 無視碰撞 + 每回合上限 (owner 2026-08-01 實戰回饋) ──────────────────
  "boss.noClip": {
    zh: "殭屍王無視碰撞",
    note: "開 = 王直接穿過柱子、牆、其他殭屍與英雄走向目標。owner 2026-08-01：「不然被卡住永遠走不到」。⚠️ 這不是無敵：王照樣被瞄準、被打、被火圈燒",
    unit: "",
    kind: "bool",
    optional: true,
    boolLabels: { on: "穿透（出貨）", off: "照舊會被卡住" },
    emptyMeans: "留空 = 不穿透（跟這個功能出現以前一樣）",
  },
  "boss.noClipUnits": {
    zh: "└ 穿過其他單位",
    note: "第 9 回合一個戰場最多 50 隻殭屍，王被自己的隨從推得動不了就是這一格關掉的下場。關掉之後王仍然穿得過柱子（那是下一格）",
    unit: "",
    kind: "bool",
    optional: true,
    boolLabels: { on: "穿過殭屍與英雄", off: "會被身體擋住" },
    emptyMeans: "留空 = 穿過（只在上面那格開著時才有意義）",
  },
  "boss.noClipObstacles": {
    zh: "└ 穿過牆與柱子",
    note: "場上的柱子、圍牆這類固定障礙。跟上一格分開，是因為「穿過身體」是走位問題、「穿過牆」是地形問題，你可能只想要前者",
    unit: "",
    kind: "bool",
    optional: true,
    boolLabels: { on: "穿過地形", off: "會被牆擋住" },
    emptyMeans: "留空 = 穿過（只在「無視碰撞」開著時才有意義）",
  },
  "boss.noClipStayInside": {
    zh: "└ 仍然被場地邊界擋住",
    note: "⚠️ 這一格的預設跟上面兩格相反，而且應該保持開著：王一旦走出競技場圓盤，回合判定、存活統計、小地圖全部開始討論一隻不在場上的單位",
    unit: "",
    kind: "bool",
    optional: true,
    boolLabels: { on: "留在場內（出貨）", off: "可以走出場外" },
    emptyMeans: "留空 = 留在場內",
  },
  "boss.maxPerRound": {
    zh: "每回合最多幾隻殭屍王",
    note: "owner 2026-08-01：「每回合最多只會出現一次殭屍王，不會無限出場」。⚠️ 這跟上面的「可重複召喚」是兩回事：那一格管的是同一個人整場的第 200 隻，這一格管的是這一回合已經來過幾隻。一個戰場裡六個英雄各自打滿 100 隻，只有這一格擋得住",
    unit: "隻",
    kind: "int",
    min: 1,
    max: 20,
    optional: true,
    emptyMeans: "留空 = 不設上限（跟這個功能出現以前一樣）",
  },
  "boss.maxPerRoundScope": {
    zh: "└ 上限算「每個戰場」還是「整場」",
    note: "出貨是「每個戰場」：王會生在召喚牠那個人的戰場，算成整場的話，1 號戰場先滿 100 隻就等於封掉其他三個戰場這一回合的王",
    unit: "",
    kind: "enum",
    values: ["zone", "match"],
    valueLabels: {
      zone: "每個戰場各自算（出貨）",
      match: "整場一起算",
    },
    optional: true,
    emptyMeans: "留空 = 每個戰場各自算",
  },
  // ── #247 第二批 (owner 2026-08-01 實戰回饋) ────────────────────────────────
  "boss.aggroRank": {
    zh: "殭屍王的仇恨排序",
    note:
      "owner 2026-08-01：「殭屍王出現英雄/bot都會優先打殭屍王 (因為獎勵很高)」。" +
      "它影響的是**英雄與 bot 自動索敵時先打誰**，玩家與 bot 走的是同一條規則。" +
      "數字是「王排在哪一階」：0 = 敵方英雄、1 = 召喚物、2 = 一般殭屍。" +
      "出貨 −1 = 王排在敵方英雄之前（owner 的字面讀法）；" +
      "填 0.5 = 「稍微優先」——被敵方英雄追殺時不會轉頭去打王，但王仍然贏過雜魚與召喚物；" +
      "填 2 = 跟一般殭屍同級，等於關掉這個功能。" +
      "⚠️ 它只在「你本來就索敵得到的東西裡面」排序：近戰的索敵半徑是 6 單位，" +
      "所以 20 單位外的王不會把 3 單位外的敵方英雄擠掉",
    unit: "階",
    kind: "num",
    min: -1,
    max: 2,
    optional: true,
    emptyMeans: "留空 = 2（跟一般殭屍同級，也就是這個功能出現以前的行為）",
  },
  "boss.healthBar": {
    zh: "殭屍王長血條",
    note:
      "owner 2026-08-01：「殭屍王 要像其他遊戲 BOSS 一樣亮長血條」。開 = 王活著的" +
      "整段時間，畫面上有一條橫跨中央的長血條，寫著真實的目前血量／最大血量" +
      "（不是百分比：27 萬血的王剩 0.4% 還有一千多，只印百分比會讓玩家以為打完了）。" +
      "關掉之後只剩小地圖上的紅點",
    unit: "",
    kind: "bool",
    optional: true,
    boolLabels: { on: "亮長血條（出貨）", off: "只有小地圖紅點" },
    emptyMeans: "留空 = 亮（這一格是畫面不是平衡，留空給出貨值）",
  },
  "boss.healthBarAnchor": {
    zh: "└ 血條畫在畫面哪裡",
    note:
      "出貨在上方（相位計時器下面，WoW／FF14 的團隊首領條位置）；改成下方會貼在" +
      "技能列正上方（魂系遊戲的首領條）。兩邊都會讓「殭屍王降臨」橫幅與連殺計數器" +
      "自動讓位，不會蓋到任何常駐介面",
    unit: "",
    kind: "enum",
    values: ["top", "bottom"],
    valueLabels: { top: "畫面上方（出貨）", bottom: "技能列上方" },
    optional: true,
    emptyMeans: "留空 = 上方",
  },
  "boss.healthBarReveal": {
    zh: "└ 什麼時候亮出來",
    note:
      "出貨是「召喚那一刻」：王一生出來血條就在。改成「進視野」的話要等王走到鏡頭" +
      "正在看的範圍內才亮 —— 想要「先聽到聲音、看到牠走過來才知道有多厚」的節奏就選這個。" +
      "⚠️「進視野」是以鏡頭注視點為圓心的近似圓，不是精確的視錐判定",
    unit: "",
    kind: "enum",
    values: ["summon", "sighted"],
    valueLabels: { summon: "召喚那一刻（出貨）", sighted: "王進入視野才亮" },
    optional: true,
    emptyMeans: "留空 = 召喚那一刻",
  },
  "boss.settlementTitle": {
    zh: "└ 分紅結算面板的抬頭",
    note: "打死殭屍王之後那面「誰打了多少、誰領多少」的表格，最上面那一行字。owner 2026-08-03 抱怨過特殊殭屍的結算也寫著殭屍王，所以王與特殊殭屍各有一格，改這裡只會動到王的那一面",
    unit: "",
    kind: "text",
    optional: true,
    emptyMeans: "留空 = 用出貨的「殭屍王 分紅結算」",
  },
  "boss.king.enabled": {
    zh: "殭屍王會不會自己打架",
    note:
      "owner 2026-08-23：「殭屍王 應該要會自動學習所有技能並施展技能」。開 = 王進場時" +
      "拿到技能欄與屬性表（一般殭屍與特殊殭屍**不會**，那是刻意的：第 3 場之後場上大多數" +
      "敵人是它們）。關 = 王回到只會揮刀的舊行為，連內建的 [leap吸血] 也不會放",
    unit: "",
    kind: "bool",
    optional: true,
    boolLabels: { on: "會施法（出貨）", off: "只會揮刀（舊行為）" },
    emptyMeans: "留空 = 整個「王會打架」的區塊不寫進設定檔 = 舊行為",
  },
  "boss.king.learnRank": {
    zh: "└ 技能學到第幾階",
    note:
      "⚠️ **只有下一格選「照這個數字」時才會讀這一格**（出貨是「學好學滿」，這一格被忽略）。" +
      "王戴哪張臉就學那張臉的 Q/W/E/R/EX 與天生技，這一格決定學到第幾階。" +
      "0 ＝ 只留下面那支內建技（兩種模式都保留這個出口）",
    unit: "階",
    kind: "num",
    min: 0,
    max: 6,
    optional: true,
    emptyMeans: "留空 = 1",
  },
  "boss.king.learnRankMode": {
    zh: "└ 學到第幾階怎麼決定",
    note:
      "owner 2026-08-23：「至少殭屍王角色自己原本的技能都要**學好學滿**、放好放滿」。" +
      "「學好學滿」＝ 每一支各學到**它自己的**最高階（每支技能的最高階本來就不一樣，1～6 階都有）。" +
      "「照上面那個數字」＝ 這一格出現之前的行為，一鍵回頭。" +
      "⚠️ ⛔ 不要改用「把上面那格填 6」代替：只有 3 階的技能會讀到不存在的第 6 階，" +
      "冷卻算出來是 NaN，結果那一支變成每個 tick 都放得出來，而且畫面上完全看不出來",
    unit: "",
    kind: "enum",
    values: ["max", "fixed"],
    valueLabels: { max: "學好學滿（出貨）", fixed: "照上面那個數字" },
    optional: true,
    emptyMeans: "留空 = 學好學滿",
  },
  "boss.king.innateAbilityId": {
    zh: "└ 內建技能（佔天生技槽）",
    note:
      "owner 2026-08-23：「殭屍王 內建 [leap吸血] 技能」。這支技能會**取代**王這一次戴的" +
      "那張臉自己的天生技 —— 那支是那位英雄的，這一隻是殭屍王。清空 = 沒有內建技，" +
      "王就用戴到的那張臉自己的天生技",
    unit: "",
    kind: "text",
    optional: true,
    emptyMeans: "留空 = godie-zombieking.passive（[leap吸血]）",
  },
  "boss.king.innateCastHpPct": {
    zh: "└ 內建技的施放血量門檻",
    note:
      "owner 2026-08-23：「當殭屍王生命低於20%時」。王的生命比例低於這一格才按得下內建技；" +
      "高於它連冷卻都不會轉。⚠️ 這一格必須在這裡而不是技能 JSON 裡：技能檔上只有觸發器" +
      "（hook）有條件欄，主動技沒有任何欄位表達得出「血夠低才放得出來」。" +
      "1 = 隨時放；0 = 永遠放不出來（看得出來它是關的）",
    unit: "比例",
    kind: "num",
    min: 0,
    max: 1,
    optional: true,
    emptyMeans: "留空 = 0.2（生命低於 20%）",
  },
  "boss.king.maxMana": {
    zh: "└ 魔力池",
    note:
      "王的魔力上限，進場時滿的。⚠️ 這一格是 0 的話王會「學會了但一支都放不出來」——" +
      "小怪的身體預設沒有魔力，而每一支要錢的技能都會被魔力不足擋掉，而且畫面上完全看不出來",
    unit: "點",
    kind: "num",
    min: 0,
    max: 1000000,
    optional: true,
    emptyMeans: "留空 = 10000",
  },
  "boss.king.manaRegenPerSec": {
    zh: "└ 每秒回魔",
    note: "owner 2026-08-23：「殭屍王回魔速度是每秒1000點，基本上不缺魔力」。王沒有屬性表可以走一般的回魔管線，所以這一格由殭屍波系統自己付",
    unit: "點／秒",
    kind: "num",
    min: 0,
    max: 1000000,
    optional: true,
    emptyMeans: "留空 = 1000",
  },
  "boss.king.attackSpeedFloor": {
    zh: "└ 攻速下限",
    note:
      "owner 2026-08-23：「攻速都是上限4起跳」。王每秒至少揮這麼多刀 —— 它只會讓王變快，" +
      "⛔ 不會把一隻本來就更快的王拖慢（取兩者之中比較快的那一個）。0 = 關掉，照上面那格「攻擊間隔」",
    unit: "刀／秒",
    kind: "num",
    min: 0,
    max: 20,
    optional: true,
    emptyMeans: "留空 = 4",
  },
  "boss.king.targetPreference": {
    zh: "└ 先打誰",
    note:
      "owner 2026-08-23：「優先攻擊玩家角色而非bot」。「先打真人」= 場上還有活著的真人英雄時，" +
      "王的索敵只在他們之間挑最近的；一個真人都沒有（或這一場全是 bot）才退回全體掃描。" +
      "「誰近打誰」是這一格出現之前的行為。⚠️ 只有**王**吃這一格，一般殭屍照舊",
    unit: "",
    kind: "enum",
    values: ["players", "nearest"],
    valueLabels: { players: "先打真人（出貨）", nearest: "誰近打誰" },
    optional: true,
    emptyMeans: "留空 = 先打真人",
  },
  "boss.king.situationalAiming": {
    zh: "└ 技能要不要看情況瞄",
    note:
      "owner 2026-08-23：「QWEREX都要學起來**根據情況放（最近的敵人單體或多人範圍）**」。" +
      "開（出貨）＝ **單體型**技能打最近的那一個敵人（也就是上一格挑出來的索敵目標）；" +
      "**範圍型**技能改落在「打得到最多人」的那一個敵人身上。" +
      "關 ＝ 每一支都瞄同一個索敵目標（這一格出現之前的行為）。" +
      "⚠️ 「單體還是範圍」是從技能自己的**打擊半徑**推出來的，⛔ 不是一張寫死的名單 ——" +
      "王每一場戴的臉是抽的，名單隔一場就過期",
    unit: "",
    kind: "bool",
    optional: true,
    boolLabels: { on: "看情況瞄（出貨）", off: "全部瞄索敵目標" },
    emptyMeans: "留空 = 看情況瞄",
  },
  "boss.king.areaMinTargets": {
    zh: "└ 範圍技至少要打到幾個人才挪落點",
    note:
      "owner 那句話裡的「**多人**」是幾個人。範圍技找得到的最好落點打不到這個數時，" +
      "就退回打最近的那一個 —— ⚠️ **不是不放**（owner 要的是「放好放滿」）。" +
      "1 ＝ 永遠挪到人最多的那一點；填大 ＝ 王會比較保守地照打最近的",
    unit: "人",
    kind: "num",
    min: 1,
    max: 50,
    optional: true,
    emptyMeans: "留空 = 2",
  },
  "boss.championSource": {
    zh: "殭屍王由誰擔任：指定還是隨機",
    note: "出貨是隨機：每回合從策展白名單抽一位，抽到誰就用誰的卡面去乘下面的「血量＝英雄的幾倍」，所以每回合的王是不同的仗，不只是換張臉",
    unit: "",
    kind: "enum",
    values: ["fixed", "random", "inherit"],
    valueLabels: {
      fixed: "指定（用下面那位）",
      random: "隨機（每回合抽一位）",
      inherit: "沿用（跟該回合的一般殭屍同一位）",
    },
    optional: true,
    emptyMeans: "留空 = 沿用該回合的一般殭屍那位",
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
    note: "王在畫面上是一般殭屍的幾倍高。⚠️ 出貨值 30 倍 ≈ 54 單位高，遠高於競技場相機看得到的範圍；覺得被擋住視野就是調這一格",
    unit: "倍",
    kind: "num",
    optional: true,
    emptyMeans: "留空 = 10 倍（沒填時的保守值，不是出貨值）",
  },
  // ── 從英雄推導 (GH#206, owner 2026-07-29) ────────────────────────────────
  "boss.heroLevelSource": {
    zh: "殭屍王的等級怎麼決定",
    note: "出貨是「指定」：王固定用下面那格的 99。選「跟場上最高」的話，王會在被召喚的那一刻改讀「王所在那個 zone 的全部英雄，死活都算」裡最高的等級 —— 會是一隻軟很多的王",
    unit: "",
    kind: "enum",
    values: ["curve", "matchHighest", "fixed", "round"],
    valueLabels: {
      curve: "公式（用下面三格算）",
      matchHighest: "跟場上最高（生成當下算）",
      fixed: "指定（用下面那個數字）",
      round: "沿用該回合殭屍等級",
    },
    optional: true,
    emptyMeans: "留空 = 有填下面那格就用它，沒填就沿用回合等級（舊行為）",
  },
  "boss.levelCurve.perRoundSq": {
    zh: "殭屍王等級公式 · 回合² 係數 (A)",
    note: "等級 = 回合² × A + 回合 × B + C，結果夾在 1–99。三格要嘛一起填、要嘛一起留空 —— 只填一兩格會被當成沒填。填 0 = 直線成長。出貨是 A=1 · B=0 · C=10，也就是「回合×回合+10」",
    unit: "",
    kind: "num",
    min: 0,
    max: 5,
    optional: true,
    emptyMeans: "留空 = 不用公式（改回上面選單的其他模式）",
  },
  "boss.levelCurve.perRound": {
    zh: "殭屍王等級公式 · 回合 係數 (B)",
    note: "每過一個回合等級加多少（線性那一項）。出貨是 A=1 · B=0 · C=10，也就是「回合×回合+10」",
    unit: "",
    kind: "num",
    min: 0,
    max: 50,
    optional: true,
    emptyMeans: "留空 = 不用公式（同上）",
  },
  "boss.levelCurve.flat": {
    zh: "殭屍王等級公式 · 常數 (C)",
    note: "第 0 回合的底,也就是整條線往上抬多少。出貨是 A=1 · B=0 · C=10，也就是「回合×回合+10」",
    unit: "級",
    kind: "num",
    min: 0,
    max: 99,
    optional: true,
    emptyMeans: "留空 = 不用公式（同上）",
  },
  "boss.heroLevel": {
    zh: "殭屍王當作幾級的英雄來算",
    note: "只在上面選「指定」時才會被讀到。只影響兩個「英雄倍率」讀英雄卡的等級，不是王的實際等級。出貨值 99（滿級）—— 填 3 的話王的血會少一半以上",
    unit: "級",
    kind: "int",
    min: 1,
    max: 99,
    optional: true,
    emptyMeans: "留空 = 跟那一回合的一般殭屍同級（會隨回合成長）",
  },
  "boss.heroHpMult": {
    zh: "殭屍王血量＝英雄的幾倍",
    note: "以「上面那位英雄在上面那個等級的生命上限」為基準。有填就用這個，下面的血量倍率與固定血量都會被忽略",
    unit: "倍",
    kind: "num",
    max: 1000,
    optional: true,
    emptyMeans: "留空 = 改用下面的「血量倍率 ×一般殭屍」",
  },
  "boss.hpFlatBonus": {
    zh: "殭屍王基礎生命額外加值",
    note: "在乘完倍率「之後」才加上去，不參與倍率（跟後台的基礎加成同一條規則）。只在有填上面的英雄血量倍率時生效",
    unit: "點",
    kind: "num",
    min: 0,
    max: 10_000_000,
    optional: true,
    emptyMeans: "留空 = 不額外加",
  },
  "boss.heroDamageMult": {
    zh: "殭屍王攻擊力＝英雄的幾倍",
    note: "⚠️ 刻意比血量倍率小很多。血厚只是變成一堵牆（好玩），攻高是直接把玩家秒掉（不好玩）。有填就蓋掉下面的固定攻擊力",
    unit: "倍",
    kind: "num",
    max: 1000,
    optional: true,
    emptyMeans: "留空 = 改用下面的固定攻擊力",
  },
  "boss.moveSpeedMult": {
    zh: "殭屍王移速＝一般殭屍的幾倍",
    note: "基準刻意是「一般殭屍」而不是英雄：王的臉是隨回合的英雄，而英雄移速從 2.6 到 6.1，用英雄當基準會讓同一個倍率有時候比一般殭屍還快。0.2 = 慢 80%",
    unit: "倍",
    kind: "num",
    min: 0,
    max: 10,
    optional: true,
    emptyMeans: "留空 = 改用下面的固定移動速度",
  },
  "boss.hpMult": {
    zh: "殭屍王血量倍率（×一般殭屍）",
    note: "以「那一回合一般殭屍的血量」為基準乘上去。⚠️ 上面的「血量＝英雄的幾倍」有填的話，這一格完全不會被用到",
    unit: "倍",
    kind: "num",
    optional: true,
    emptyMeans: "留空 = 改用下面的固定血量",
  },
  "boss.maxHp": {
    zh: "殭屍王固定血量（只在兩個血量倍率都沒填時生效）",
    note: "固定值，不隨回合成長。上面任何一個血量倍率有填，這個數字完全不會被用到",
    unit: "點",
    kind: "num",
    optional: false,
  },
  "boss.attackDamage": {
    zh: "殭屍王固定攻擊力（只在沒填英雄攻擊倍率時生效）",
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
    zh: "殭屍王固定移動速度（只在沒填移速倍率時生效）",
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
  "boss.countsAsChampion": {
    zh: "殭屍王算不算英雄單位",
    note: "owner 2026-08-13「只能吃掉英雄，特殊殭屍跟殭屍王可以被考慮是英雄單位」。開（預設）＝任何寫「對英雄才生效」的技能都吃得到殭屍王（89-002 憤怒的輪盤就是靠這格才吃得掉牠）。關＝殭屍王被當成一般小怪，那些技能對牠完全沒反應。⚠️ 這一格與旁邊那一格是**獨立的**：可以只讓殭屍王算英雄、特殊殭屍不算",
    unit: "",
    kind: "bool",
    boolLabels: { on: "算英雄單位", off: "只是小怪" },
    optional: true,
    emptyMeans: "沿用出貨預設「算英雄單位」",
  },
  "boss.bountyGold": {
    zh: "殭屍王獎金池",
    // ⚠️ 第三守則，這句話**第三次**因為同型理由被改寫（2026-08-04）。
    // 第一版寫「總金額」→ 假的（「額外加碼」模式會超過）。
    // 第二版寫「實發會**超過**這個數字」→ 也是假的，而且方向相反：2026-08-04
    // 上線的 金錢發放倍率 在 `grantGold` 裡再乘一次，出貨的
    // 「打特殊殭屍／殭屍王發放倍率」是 1.0 以下，所以實發被壓下去。
    // 第三版曾在這裡寫一個量到的數字（「30,000 → 3,090」）→ 也是假的，因為
    // 實發根本**不是一個數字是一個區間**，那個 3,090 只是某一種傷害分佈下的一點；
    // 換成「單一英雄包辦全部傷害＋補刀」再量就是 6,000。
    // 所以這一版一個具體數字都不寫 —— 兩個乘算講出來，端點由右邊的「實發」現場算。
    note: "照傷害比例分給參戰的人。這是**獎池設定值，不是實發**：「額外加碼」模式下補刀的人會多領一份自己的份額，所以總額會超出獎池（超出多少看傷害分佈），戰鬥系統的「打特殊殭屍／殭屍王發放金錢」再乘一次 —— 右邊的「實發」印的才是玩家真的拿到的錢，而它是一個區間",
    unit: "金",
    kind: "int",
    min: 0,
    max: 10_000_000,
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
  "boss.bountyLevels": {
    zh: "殭屍王等級提升",
    note: "直接送等級（不是經驗值），照同一套傷害比例分。⚠️ 等級上限 99，召喚王的人通常已經過 50 級，所以實際跳的級數會比這裡少 —— 結算面板顯示的是**實際跳的**",
    unit: "級",
    kind: "int",
    min: 0,
    max: 99,
    optional: false,
  },
  "boss.lastHitMultiplier": {
    zh: "最後一刀倍率",
    note: "2 = 翻倍。乘的是什麼由下面那個模式決定",
    unit: "倍",
    kind: "num",
    min: 1,
    max: 10,
    optional: false,
  },
  "boss.lastHitMode": {
    zh: "最後一刀怎麼算",
    unit: "",
    note: "額外加碼 = 補刀的人「再多領一份自己的份額」，實發總額會超過獎金池（一個人打完全部又補刀就是 200%）。權重 = 補刀的傷害算兩倍參與分配，總額剛好等於獎金池，不會多印錢",
    kind: "enum",
    emptyMeans: "沿用出貨預設「額外加碼」",
    values: ["bonus", "weight"],
    valueLabels: { bonus: "額外加碼（可超過總額）", weight: "權重（總額固定）" },
    optional: true,
  },
  "boss.countOverkill": {
    zh: "溢傷算不算",
    note: "關（預設）＝只算王真的掉的血，所以對剩 100 血的王丟 4000 傷害只算 100。開＝算全額，一發大招就能吃掉整包獎金",
    unit: "",
    kind: "bool",
    boolLabels: { on: "算（溢傷全額計入）", off: "不算（只算真的掉的血）" },
    optional: true,
    emptyMeans: "沿用出貨預設「不算」",
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
  "special.championSource": {
    zh: "特殊殭屍由誰擔任：指定還是隨機",
    note: "出貨是隨機。和殭屍王一樣，抽到的英雄同時決定臉、模型與「血量／攻擊力＝英雄的幾倍」的那個「英雄」",
    unit: "",
    kind: "enum",
    values: ["fixed", "random", "inherit"],
    valueLabels: {
      fixed: "指定（用下面那位）",
      random: "隨機（每回合抽一位）",
      inherit: "沿用（跟該回合的一般殭屍同一位）",
    },
    optional: true,
    emptyMeans: "留空 = 沿用該回合的一般殭屍那位",
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
  // ── 從英雄推導 (GH#206) — same four ideas as the king's, one less knob ────
  "special.heroLevelSource": {
    zh: "特殊殭屍的等級怎麼決定",
    note: "出貨是「跟場上最高」：每生一隻就當場去看「牠所在那個 zone 的全部英雄，死活都算」裡最高幾級，所以玩家越強牠越強、同一回合裡也會越生越強。屍體照算 —— 隊友倒下不會讓殭屍跟著變弱。只有那個 zone 真的一個英雄都沒有時才退回該回合的殭屍等級",
    unit: "",
    kind: "enum",
    values: ["curve", "matchHighest", "fixed", "round"],
    valueLabels: {
      curve: "公式（用下面三格算）",
      matchHighest: "跟場上最高（生成當下算）",
      fixed: "指定（用下面那個數字）",
      round: "沿用該回合殭屍等級",
    },
    optional: true,
    emptyMeans: "留空 = 有填下面那格就用它，沒填就沿用回合等級（舊行為）",
  },
  "special.levelCurve.perRoundSq": {
    zh: "特殊殭屍等級公式 · 回合² 係數 (A)",
    note: "等級 = 回合² × A + 回合 × B + C，結果夾在 1–99。三格要嘛一起填、要嘛一起留空 —— 只填一兩格會被當成沒填。填 0 = 直線成長。出貨是 A=0 · B=3 · C=5，也就是「回合×3+5」",
    unit: "",
    kind: "num",
    min: 0,
    max: 5,
    optional: true,
    emptyMeans: "留空 = 不用公式（改回上面選單的其他模式）",
  },
  "special.levelCurve.perRound": {
    zh: "特殊殭屍等級公式 · 回合 係數 (B)",
    note: "每過一個回合等級加多少（線性那一項）。出貨是 A=0 · B=3 · C=5，也就是「回合×3+5」",
    unit: "",
    kind: "num",
    min: 0,
    max: 50,
    optional: true,
    emptyMeans: "留空 = 不用公式（同上）",
  },
  "special.levelCurve.flat": {
    zh: "特殊殭屍等級公式 · 常數 (C)",
    note: "第 0 回合的底,也就是整條線往上抬多少。出貨是 A=0 · B=3 · C=5，也就是「回合×3+5」",
    unit: "級",
    kind: "num",
    min: 0,
    max: 99,
    optional: true,
    emptyMeans: "留空 = 不用公式（同上）",
  },
  "special.heroLevel": {
    zh: "特殊殭屍當作幾級的英雄來算",
    note: "只在上面選「指定」時才會被讀到 —— 出貨選的是「跟場上最高」，所以這格填了也不會生效。只影響兩個「英雄倍率」讀英雄卡的等級",
    unit: "級",
    kind: "int",
    min: 1,
    max: 99,
    optional: true,
    emptyMeans: "留空 = 跟那一回合的一般殭屍同級（會隨回合成長）",
  },
  "special.heroHpMult": {
    zh: "特殊殭屍血量＝英雄的幾倍",
    note: "以「上面那位英雄在該等級的生命上限」為基準。有填就蓋掉下面的「血量倍率 ×一般殭屍」",
    unit: "倍",
    kind: "num",
    max: 1000,
    optional: true,
    emptyMeans: "留空 = 改用下面的血量倍率",
  },
  "special.hpFlatBonus": {
    zh: "特殊殭屍基礎生命額外加值",
    note: "乘完倍率「之後」才加，不參與倍率。只在有填上面的英雄血量倍率時生效",
    unit: "點",
    kind: "num",
    min: 0,
    max: 10_000_000,
    optional: true,
    emptyMeans: "留空 = 不額外加",
  },
  "special.heroDamageMult": {
    zh: "特殊殭屍攻擊力＝英雄的幾倍",
    note: "刻意比血量倍率小，理由跟殭屍王那一欄一樣。有填就蓋掉下面的攻擊力倍率",
    unit: "倍",
    kind: "num",
    max: 1000,
    optional: true,
    emptyMeans: "留空 = 改用下面的攻擊力倍率",
  },
  "special.hpMult": {
    zh: "血量倍率（×一般殭屍）",
    note: "相對同一回合的一般殭屍。2 = 兩倍血。⚠️ 上面的「血量＝英雄的幾倍」有填的話這格不會被用到",
    unit: "倍",
    kind: "num",
    optional: false,
  },
  "special.damageMult": {
    zh: "攻擊力倍率（×一般殭屍）",
    note: "相對一般殭屍的攻擊力。⚠️ 上面的「攻擊力＝英雄的幾倍」有填的話這格不會被用到",
    unit: "倍",
    kind: "num",
    min: 0,
    optional: false,
  },
  "special.moveSpeedMult": {
    zh: "移動速度倍率（×一般殭屍）",
    note: "相對一般殭屍的移速，這一格「沒有」英雄版本 —— 基準必須是殭屍：特殊殭屍的臉是隨回合的英雄，英雄移速 2.6~6.1，用英雄當基準會讓 0.5 有時候比一般殭屍還快。0.5 = 慢一半",
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
  "special.countsAsChampion": {
    zh: "特殊殭屍算不算英雄單位",
    note: "owner 2026-08-13「只能吃掉英雄，特殊殭屍跟殭屍王可以被考慮是英雄單位」。開（預設）＝任何寫「對英雄才生效」的技能都吃得到特殊殭屍（89-002 憤怒的輪盤就是靠這格才吃得掉牠）。關＝特殊殭屍被當成一般小怪，那些技能對牠完全沒反應。⚠️ 這一格與旁邊那一格是**獨立的**：可以只讓殭屍王算英雄、特殊殭屍不算",
    unit: "",
    kind: "bool",
    boolLabels: { on: "算英雄單位", off: "只是小怪" },
    optional: true,
    emptyMeans: "沿用出貨預設「算英雄單位」",
  },
  "special.rewardMult": {
    zh: "獎勵倍率",
    note: "打死牠給的金錢與經驗都乘這個數（升級進度算一隻，不變）。⚠️ 下面的「分紅獎金」有填的話這格完全不會被用到 —— 獎池就是獎勵，兩者不疊加",
    unit: "倍",
    kind: "num",
    min: 0,
    optional: false,
  },

  // ── 特殊殭屍分紅獎池 (#288) ──────────────────────────────────────────────
  "special.bountyGold": {
    zh: "特殊殭屍分紅獎金",
    // ⚠️ 第三守則：跟 boss.bountyGold 同一個 2026-08-04 的謊話 —— 這裡寫的是
    // 獎池設定值，而 金錢發放倍率 會在發放的那一刻再乘一次（量到的：5,000 → 500）。
    note: "照傷害比例分給所有打過牠的人（不是只給補刀的）。這是**獎池設定值，不是實發** —— 戰鬥系統的「打特殊殭屍／殭屍王發放金錢」會再乘一次，右邊的「實發」才是玩家真的拿到的錢。留空＝不分紅，回到上面那個「獎勵倍率」的老規則",
    unit: "金",
    kind: "int",
    min: 0,
    max: 10_000_000,
    optional: true,
    emptyMeans: "留空 = 不分紅，改用「獎勵倍率」直接給補刀的人",
  },
  "special.bountyXp": {
    zh: "特殊殭屍分紅經驗",
    note: "同上，也是總量，用同一套傷害比例分下去",
    unit: "XP",
    kind: "int",
    min: 0,
    max: 10_000_000,
    optional: true,
    emptyMeans: "留空 = 不給經驗（金錢那格有填就仍然會分紅）",
  },
  "special.bountyLevels": {
    zh: "特殊殭屍等級提升",
    note: "直接送等級（不是經驗值），照同一套傷害比例分。⚠️ 等級上限 99，所以實際跳的級數可能比這裡少 —— 結算面板顯示的是**實際跳的**",
    unit: "級",
    kind: "int",
    min: 0,
    max: 99,
    optional: true,
    emptyMeans: "留空 = 不送等級",
  },
  "special.splitByDamage": {
    zh: "特殊殭屍要不要照傷害分",
    note: "開（預設）＝參戰的每個人照自己打的傷害比例領。關＝整包獎金全給補刀的那一個人，其他人一毛都沒有",
    unit: "",
    kind: "bool",
    boolLabels: { on: "照傷害比例分給所有人", off: "全額給補刀的人" },
    optional: true,
    emptyMeans: "沿用出貨預設「照傷害比例分」",
  },
  "special.lastHitMultiplier": {
    zh: "特殊殭屍最後一刀倍率",
    note: "1（預設）＝沒有翻倍，純照傷害比例。這裡和殭屍王的 2 不一樣是刻意的：owner 對特殊殭屍只說了「照傷害比例分」",
    unit: "倍",
    kind: "num",
    min: 1,
    max: 10,
    optional: true,
    emptyMeans: "沿用出貨預設 1（不翻倍）",
  },
  "special.lastHitMode": {
    zh: "特殊殭屍最後一刀怎麼算",
    note: "和殭屍王同一套語意。倍率是 1 的時候兩種模式結果一模一樣，把倍率調上去才有差",
    unit: "",
    kind: "enum",
    values: ["bonus", "weight"],
    valueLabels: { bonus: "額外加碼（可超過總額）", weight: "權重（總額固定）" },
    optional: true,
    emptyMeans: "沿用出貨預設「額外加碼」",
  },
  "special.settlementTitle": {
    zh: "特殊殭屍分紅結算的抬頭",
    note: "owner 2026-08-03：「特殊殭屍 不應該用殭屍王 分紅結算畫面」。兩種怪走的是同一顆結算事件，以前畫面上一律印殭屍王那一行字；這一格就是它自己的字",
    unit: "",
    kind: "text",
    optional: true,
    emptyMeans: "留空 = 用出貨的「特殊殭屍 分紅結算」",
  },
  "special.settlementMode": {
    zh: "特殊殭屍分紅結算怎麼呈現",
    note: "完整面板（出貨）＝和殭屍王同一張表，佔中央走廊 8.2 秒；一行通知＝只寫抬頭、總獎金與你自己那一份，不吃整條走廊；不顯示＝完全不畫（金錢照發，只是沒有畫面說明）。牠一回合會死好幾隻，覺得洗版就往下調",
    unit: "",
    kind: "enum",
    values: ["panel", "toast", "off"],
    valueLabels: {
      panel: "完整面板（出貨）",
      toast: "一行通知",
      off: "不顯示",
    },
    optional: true,
    emptyMeans: "留空 = 完整面板",
  },
  "special.countOverkill": {
    zh: "特殊殭屍溢傷算不算",
    note: "關（預設）＝只算牠真的掉的血，所以對剩 100 血的牠丟 4000 傷害只算 100。這格和殭屍王那格是分開的，關掉殭屍王也不影響這裡",
    unit: "",
    kind: "bool",
    boolLabels: { on: "算（溢傷全額計入）", off: "不算（只算真的掉的血）" },
    optional: true,
    emptyMeans: "沿用出貨預設「不算」",
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
    keys: [
      "fromRound",
      "firstWaveSec",
      "waveIntervalSec",
      "mobsPerWaveCap",
      "maxAlivePerZone",
      "stopSpawnOnTeamWipe",
      "roundHoldMobKinds",
    ],
  },
  {
    title: "精英小怪血條 · 特殊殭屍與殭屍王頭上那一條",
    blurb:
      "只有**精英**(特殊殭屍 + 殭屍王)有這條小血條;一般殭屍沒有,因為波峰時一區 50 隻。" +
      "殭屍王另外還有一條畫在畫面頂端的**長血條**,設定在下面的「殭屍王」那一組。",
    keys: [
      "healthBar.showHealthBar",
      "healthBar.barWidth",
      "healthBar.barHeight",
      "healthBar.yOffset",
      "healthBar.showThreshold",
      // GH#647 —— 跟血條同一組:owner 的同一句話管這兩件事
      // (「普通殭屍不必畫血條跟陰影 節省效能」),放一起才找得到。
      "normalMobShadow",
    ],
  },
  {
    title: "殭屍身分 · 臉、模型、體型、染黑",
    blurb:
      "選了英雄就直接用那個英雄的 3D 模型（模型欄留空即可）。殭屍一律染黑，避免跟玩家的英雄混在一起。逐回合表可以再逐場覆蓋這裡的英雄。",
    keys: [
      "mob.championSource",
      "mob.championId",
      "mob.modelKey",
      "mob.sizeMult",
      "mob.tintStrength",
      "mob.groundRingDiameter",
      "mob.groundRingSizeFollow",
    ],
  },
  {
    title: "等級與血量曲線 · 隨回合變強",
    blurb: "等級 = 起始等級 + 每回合升幾級 ×(回合 − 開始回合)；血量與回血再由等級推出來。",
    keys: [
      "mob.baseLevel",
      "mob.levelPerRound",
      "mob.levelCurve.perRoundSq",
      "mob.levelCurve.perRound",
      "mob.levelCurve.flat",
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
      "門檻算的是「一個人自己」的累計擊殺，而且跨回合不歸零；王會出現在那個人的戰場。獎金是總額，照參戰傷害比例分，補刀的人權重加倍。血量／攻擊力／移速各有三層：填了「＝英雄的幾倍」就以上面那位英雄的卡面為準，其次才是「×一般殭屍」，最後才是固定值。",
    keys: [
      "boss.enabled",
      "boss.killThreshold",
      "boss.repeatable",
      "boss.championSource",
      "boss.championId",
      "boss.modelKey",
      "boss.sizeMult",
      "boss.heroLevelSource",
      "boss.levelCurve.perRoundSq",
      "boss.levelCurve.perRound",
      "boss.levelCurve.flat",
      "boss.heroLevel",
      "boss.heroHpMult",
      "boss.hpFlatBonus",
      "boss.heroDamageMult",
      "boss.moveSpeedMult",
      "boss.hpMult",
      "boss.maxHp",
      "boss.attackDamage",
      "boss.attackCdSec",
      "boss.attackRange",
      "boss.moveSpeed",
      "boss.radius",
      "boss.countsAsChampion",
      "boss.bountyGold",
      "boss.bountyXp",
      "boss.bountyLevels",
      "boss.lastHitMultiplier",
      "boss.lastHitMode",
      "boss.countOverkill",
      "boss.noClip",
      "boss.noClipUnits",
      "boss.noClipObstacles",
      "boss.noClipStayInside",
      "boss.maxPerRound",
      "boss.maxPerRoundScope",
      "boss.aggroRank",
      "boss.healthBar",
      "boss.healthBarAnchor",
      "boss.healthBarReveal",
      "boss.settlementTitle",
      "boss.king.enabled",
      "boss.king.learnRank",
      "boss.king.learnRankMode",
      "boss.king.innateAbilityId",
      "boss.king.innateCastHpPct",
      "boss.king.maxMana",
      "boss.king.manaRegenPerSec",
      "boss.king.attackSpeedFloor",
      "boss.king.targetPreference",
      "boss.king.situationalAiming",
      "boss.king.areaMinTargets",
    ],
  },
  {
    title: "特殊殭屍 · 殭屍群裡的那一隻",
    blurb:
      "每生一隻就擲一次機率。機率填 0 就完全關掉，連亂數都不抽。血量與攻擊力跟殭屍王一樣是兩層：「＝英雄的幾倍」優先，沒填才用「×一般殭屍」。移速只有一層，而且基準永遠是一般殭屍。",
    keys: [
      "special.chancePercent",
      "special.championSource",
      "special.championId",
      "special.modelKey",
      "special.sizeMult",
      "special.heroLevelSource",
      "special.levelCurve.perRoundSq",
      "special.levelCurve.perRound",
      "special.levelCurve.flat",
      "special.heroLevel",
      "special.heroHpMult",
      "special.hpFlatBonus",
      "special.heroDamageMult",
      "special.hpMult",
      "special.damageMult",
      "special.moveSpeedMult",
      "special.radiusMult",
      "special.countsAsChampion",
      "special.rewardMult",
    ],
  },
  {
    title: "特殊殭屍分紅 · 打死牠獎金怎麼分",
    blurb:
      "牠現在是一隻一萬多血的小王，所以獎勵也照殭屍王那套走：獎金／經驗／等級是**總量**，照參戰傷害比例分給每一個打過牠的人。三個獎池全部留空 = 完全不分紅，回到「獎勵倍率直接給補刀的人」。",
    keys: [
      "special.bountyGold",
      "special.bountyXp",
      "special.bountyLevels",
      "special.splitByDamage",
      "special.lastHitMultiplier",
      "special.lastHitMode",
      "special.countOverkill",
      "special.settlementTitle",
      "special.settlementMode",
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
    case "stopSpawnOnTeamWipe":
      return cfg.stopSpawnOnTeamWipe === undefined ? "" : cfg.stopSpawnOnTeamWipe ? "1" : "0";
    case "roundHoldMobKinds":
      return cfg.roundHoldMobKinds ?? "";
    case "healthBar.showHealthBar":
      return cfg.healthBar?.showHealthBar === undefined
        ? ""
        : cfg.healthBar.showHealthBar
          ? "1"
          : "0";
    case "healthBar.barWidth":
      return formatNum(cfg.healthBar?.barWidth);
    case "healthBar.barHeight":
      return formatNum(cfg.healthBar?.barHeight);
    case "healthBar.yOffset":
      return formatNum(cfg.healthBar?.yOffset);
    case "healthBar.showThreshold":
      return formatNum(cfg.healthBar?.showThreshold);
    case "normalMobShadow":
      return cfg.normalMobShadow === undefined ? "" : cfg.normalMobShadow ? "1" : "0";
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
    case "mob.championSource":
      return cfg.mob.championSource ?? "";
    case "mob.sizeMult":
      return formatNum(cfg.mob.sizeMult);
    case "mob.groundRingDiameter":
      return formatNum(cfg.mob.groundRingDiameter);
    case "mob.groundRingSizeFollow":
      return formatNum(cfg.mob.groundRingSizeFollow);
    case "mob.tintStrength":
      return formatNum(cfg.mob.tintStrength);
    case "mob.baseLevel":
      return formatNum(cfg.mob.baseLevel);
    case "mob.levelPerRound":
      return formatNum(cfg.mob.levelPerRound);
    case "mob.levelCurve.perRoundSq":
      return formatNum(cfg.mob.levelCurve?.perRoundSq);
    case "mob.levelCurve.perRound":
      return formatNum(cfg.mob.levelCurve?.perRound);
    case "mob.levelCurve.flat":
      return formatNum(cfg.mob.levelCurve?.flat);
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
    case "boss.countsAsChampion":
      return cfg.boss?.countsAsChampion === undefined ? "" : cfg.boss.countsAsChampion ? "1" : "0";
    case "boss.modelKey":
      return cfg.boss?.modelKey ?? "";
    case "boss.championSource":
      return cfg.boss?.championSource ?? "";
    case "boss.championId":
      return cfg.boss?.championId ?? "";
    case "boss.sizeMult":
      return formatNum(cfg.boss?.sizeMult);
    case "boss.hpMult":
      return formatNum(cfg.boss?.hpMult);
    // GH#206 — `formatNum(undefined)` is "", which is what an un-authored
    // OPTIONAL box has to show: a 0 here would read as 「×0 生命」, and
    // `configFromForm` would then write that 0 back into the doc.
    case "boss.heroHpMult":
      return formatNum(cfg.boss?.heroHpMult);
    case "boss.heroDamageMult":
      return formatNum(cfg.boss?.heroDamageMult);
    case "boss.hpFlatBonus":
      return formatNum(cfg.boss?.hpFlatBonus);
    case "boss.moveSpeedMult":
      return formatNum(cfg.boss?.moveSpeedMult);
    case "boss.heroLevel":
      return formatNum(cfg.boss?.heroLevel);
    // #290 — "" for an absent field, exactly like `championSource`: ABSENT is a
    // real state (「沿用今天的行為」) and must round-trip as an empty picker.
    case "boss.heroLevelSource":
      return cfg.boss?.heroLevelSource ?? "";
    case "boss.levelCurve.perRoundSq":
      return formatNum(cfg.boss?.levelCurve?.perRoundSq);
    case "boss.levelCurve.perRound":
      return formatNum(cfg.boss?.levelCurve?.perRound);
    case "boss.levelCurve.flat":
      return formatNum(cfg.boss?.levelCurve?.flat);
    case "boss.bountyGold":
      return formatNum(cfg.boss?.bountyGold);
    case "boss.bountyXp":
      return formatNum(cfg.boss?.bountyXp);
    case "boss.bountyLevels":
      return formatNum(cfg.boss?.bountyLevels);
    case "boss.lastHitMultiplier":
      return formatNum(cfg.boss?.lastHitMultiplier);
    case "boss.countOverkill":
      return cfg.boss?.countOverkill === undefined ? "" : cfg.boss.countOverkill ? "1" : "0";
    // #247 —— "" for an absent boolean, exactly like `countOverkill` above:
    // ABSENT is a real state (「跟這個功能出現以前一樣」) and must round-trip as an
    // empty picker, never as a silently-written `false`.
    case "boss.noClip":
      return cfg.boss?.noClip === undefined ? "" : cfg.boss.noClip ? "1" : "0";
    case "boss.noClipUnits":
      return cfg.boss?.noClipUnits === undefined ? "" : cfg.boss.noClipUnits ? "1" : "0";
    case "boss.noClipObstacles":
      return cfg.boss?.noClipObstacles === undefined ? "" : cfg.boss.noClipObstacles ? "1" : "0";
    case "boss.noClipStayInside":
      return cfg.boss?.noClipStayInside === undefined ? "" : cfg.boss.noClipStayInside ? "1" : "0";
    case "boss.maxPerRound":
      return formatNum(cfg.boss?.maxPerRound);
    case "boss.maxPerRoundScope":
      return cfg.boss?.maxPerRoundScope ?? "";
    case "boss.aggroRank":
      return formatNum(cfg.boss?.aggroRank);
    case "boss.healthBar":
      return cfg.boss?.healthBar === undefined ? "" : cfg.boss.healthBar ? "1" : "0";
    case "boss.healthBarAnchor":
      return cfg.boss?.healthBarAnchor ?? "";
    case "boss.healthBarReveal":
      return cfg.boss?.healthBarReveal ?? "";
    // #291 —— 空白 = 沒填 = 用出貨抬頭,和其他 optional 欄位同一條規則。
    case "boss.settlementTitle":
      return cfg.boss?.settlementTitle ?? "";
    case "boss.king.enabled":
      return cfg.boss?.king?.enabled === undefined ? "" : cfg.boss.king.enabled ? "1" : "0";
    case "boss.king.learnRank":
      return formatNum(cfg.boss?.king?.learnRank);
    case "boss.king.innateAbilityId":
      return cfg.boss?.king?.innateAbilityId ?? "";
    case "boss.king.innateCastHpPct":
      return formatNum(cfg.boss?.king?.innateCastHpPct);
    case "boss.king.maxMana":
      return formatNum(cfg.boss?.king?.maxMana);
    case "boss.king.manaRegenPerSec":
      return formatNum(cfg.boss?.king?.manaRegenPerSec);
    case "boss.king.attackSpeedFloor":
      return formatNum(cfg.boss?.king?.attackSpeedFloor);
    case "boss.king.targetPreference":
      return cfg.boss?.king?.targetPreference ?? "";
    case "boss.king.learnRankMode":
      return cfg.boss?.king?.learnRankMode ?? "";
    case "boss.king.situationalAiming":
      return cfg.boss?.king?.situationalAiming === undefined
        ? ""
        : cfg.boss.king.situationalAiming
          ? "1"
          : "0";
    case "boss.king.areaMinTargets":
      return formatNum(cfg.boss?.king?.areaMinTargets);
    case "boss.lastHitMode":
      // Absent in a doc authored before GH#206 — show the shipped default
      // rather than an empty box, because an empty box here reads as
      // 「沒有模式」 and there is no such state.
      return cfg.boss?.lastHitMode ?? "";
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
    case "special.countsAsChampion":
      return cfg.special?.countsAsChampion === undefined
        ? ""
        : cfg.special.countsAsChampion
          ? "1"
          : "0";
    case "special.rewardMult":
      return formatNum(cfg.special?.rewardMult);
    case "special.modelKey":
      return cfg.special?.modelKey ?? "";
    case "special.championSource":
      return cfg.special?.championSource ?? "";
    case "special.championId":
      return cfg.special?.championId ?? "";
    case "special.sizeMult":
      return formatNum(cfg.special?.sizeMult);
    case "special.heroHpMult":
      return formatNum(cfg.special?.heroHpMult);
    case "special.heroDamageMult":
      return formatNum(cfg.special?.heroDamageMult);
    case "special.hpFlatBonus":
      return formatNum(cfg.special?.hpFlatBonus);
    case "special.heroLevel":
      return formatNum(cfg.special?.heroLevel);
    case "special.heroLevelSource":
      return cfg.special?.heroLevelSource ?? "";
    case "special.levelCurve.perRoundSq":
      return formatNum(cfg.special?.levelCurve?.perRoundSq);
    case "special.levelCurve.perRound":
      return formatNum(cfg.special?.levelCurve?.perRound);
    case "special.levelCurve.flat":
      return formatNum(cfg.special?.levelCurve?.flat);
    // #288 分紅獎池 — `formatNum(undefined)` is "", which is the honest reading
    // of an un-authored OPTIONAL pool: a 0 here would say 「獎金 0」, and
    // `configFromForm` would then write that 0 back and permanently disable the
    // `rewardMult` fallback it is supposed to preserve.
    case "special.bountyGold":
      return formatNum(cfg.special?.bountyGold);
    case "special.bountyXp":
      return formatNum(cfg.special?.bountyXp);
    case "special.bountyLevels":
      return formatNum(cfg.special?.bountyLevels);
    case "special.lastHitMultiplier":
      return formatNum(cfg.special?.lastHitMultiplier);
    case "special.lastHitMode":
      return cfg.special?.lastHitMode ?? "";
    case "special.splitByDamage":
      return cfg.special?.splitByDamage === undefined ? "" : cfg.special.splitByDamage ? "1" : "0";
    case "special.countOverkill":
      return cfg.special?.countOverkill === undefined ? "" : cfg.special.countOverkill ? "1" : "0";
    case "special.settlementTitle":
      return cfg.special?.settlementTitle ?? "";
    case "special.settlementMode":
      return cfg.special?.settlementMode ?? "";
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
  if (spec.kind === "enum") {
    return (spec.values ?? []).includes(t) ? "" : `只能是 ${(spec.values ?? []).join(" / ")}`;
  }
  if (spec.kind === "text" || spec.kind === "champion" || spec.kind === "model") return "";
  const n = Number(t);
  if (!Number.isFinite(n)) return "必須是數字";
  if (spec.kind === "int" && !Number.isInteger(n)) return "必須是整數";
  if (spec.min !== undefined && n < spec.min) return `不能小於 ${spec.min}`;
  // GH#206 — THE UPPER BOUND THAT DID NOT EXIST. Until now `validateField`
  // only ever checked `min`, so a mistyped 殭屍王等級提升 (500 for 50) passed the
  // console and was rejected — or silently clamped — somewhere the operator
  // could not see. Same class of hole as GH#277.
  if (spec.max !== undefined && n > spec.max) return `不能大於 ${spec.max}`;
  // `.positive()` in the schema — 0 is rejected, and saying so beats a 422.
  if (spec.min === undefined && n <= 0) return "必須大於 0";
  return "";
}

/**
 * 「範圍 a ~ b」 —— the human-readable bound for one field, or "" when the field
 * has no numeric bound to state (`bool` / `enum` / `text` / `champion` / `model`
 * carry their legality in the picker itself).
 *
 * ⚠️ 這個函式存在的理由是 **`max` 之前從來沒有被印出來過**。GH#206 加了上界、
 * `validateField` 也真的會擋,但 `MobWavesPage` 只印「目前生效 / 出貨版」——
 * 操作者要先打錯一次才會知道天花板在哪。一個看得見的界線才算做完
 * (`MobWavesFieldSpec.max` 的註解自己就是這樣寫的)。
 *
 * 只有下界的欄位印「≥ n」而不是假裝有上界;`.positive()` 那種(兩個都沒有)印
 * 「> 0」,和 `validateField` 最後那條分支說的是同一件事。
 */
export function boundsText(spec: MobWavesFieldSpec): string {
  if (spec.kind !== "int" && spec.kind !== "num") return "";
  if (spec.min !== undefined && spec.max !== undefined) return `範圍 ${spec.min} ~ ${spec.max}`;
  if (spec.min !== undefined) return `範圍 ≥ ${spec.min}`;
  if (spec.max !== undefined) return `範圍 > 0，最多 ${spec.max}`;
  return "範圍 > 0";
}

// ───────────────────────────────────────────────────────── 實發（顯示真實值）──
//
// owner 2026-08-04:「顯示不說謊 => **顯示真實值，跟其他系統倍率一樣**」——
// 也就是 #125「每一個顯示的數字都是乘完倍率的最終值」的同一條規則。
//
// 這一頁上三個金錢欄位在 2026-08-04 的 金錢發放倍率 上線之後就開始說謊：框裡的
// 數字是**設定值**，而發放的那一刻 `grantGold` 還會再乘一格倍率上去，這一頁從來
// 沒有把那一格告訴操作者。
//
// ⚠️ 但「實發」對兩個獎池**不是一個數字，是一個區間** —— 而這正是第一版做錯的地方。
// 殭屍王與特殊殭屍走 `splitBossBounty`，出貨的 `lastHitMode: "bonus"`（額外加碼）
// 意思是「補刀的人除了自己那份，**再多領一份自己的份額**」，所以總額**會超出獎池，
// 超出多少取決於傷害分佈**：
//   · 多人平分傷害、補刀者佔比極小 → 逼近 `獎池 × 發放倍率`（下界）
//   · 一個人包辦全部傷害又補刀     → `獎池 × 補刀倍率 × 發放倍率`（上界）
// `"weight"`（權重）模式是守恆的 —— 補刀傷害以 ×倍率 計入分母，總額固定等於獎池
// —— 所以**那個模式下不是區間，是單一數字**，`lastHitMultiplier ≤ 1` 同理。
// 普通殭屍的「每殺一隻給金錢」不走獎池，永遠是單一數字。
//
// ⛔ 這一段的前一版本身就是第三守則的案例。它寫著「殭屍王獎金池寫 30,000 而實打發
// 3,090」，而同一份工作區裡 chip 印 3,000、複驗者用真 sim 量到 6,000 —— 三個互相
// 矛盾的「量到的」數字，因為它們量的是**同一個區間的不同點**（3,090 是三人分紅的
// 某一種傷害分佈，6,000 是單一英雄包辦全部傷害＋補刀的上界）。所以這裡不再寫任何
// 單一數字：端點由 `lastHitMode` / `lastHitMultiplier` **現場算**，
// 見 `goldPoolLastHitBonus`。
//
// ⚠️ 為什麼是「旁邊多一欄」而不是「把框裡的數字改成實發」：框裡那個數字是
// 操作者**要編輯的東西**，它必須是會被存進 arena-rules 的那一個。把它換成
// 乘完的值，存檔就會把倍率烘進設定裡，下一次再乘一遍。所以設定值留在框裡，
// 實發印在旁邊 —— 跟 屬性上限 頁的 `effective` 同一個作法。

/**
 * 哪一個欄位會被哪一格 發放倍率 乘過。
 *
 * ⚠️ 這三條對應**必須跟 sim 的分桶一致**（`GoldPayoutCategory`）：
 *   · `reward.gold`         普通殭屍的擊殺金 → `mob`
 *   · `special.bountyGold`  特殊殭屍的分紅獎池 → `elite`
 *   · `boss.bountyGold`     殭屍王的分紅獎池 → `elite`（**不是** quest）
 * 對錯了的症狀不是錯誤訊息，是一個看起來很有說服力的錯數字。
 */
export const MOB_WAVES_GOLD_ENV_KEY: Readonly<Partial<Record<MobWavesFieldKey, CombatEnvKey>>> =
  Object.freeze({
    "reward.gold": "goldMobKill",
    "special.bountyGold": "goldEliteKill",
    "boss.bountyGold": "goldEliteKill",
  });

/**
 * 把「實發」從一個數字撐成一個區間的那個係數 —— 也就是**上界是下界的幾倍**。
 * `1` = 不是區間（單一數字）。
 *
 * ⛔ 端點一律從**現在這一份設定**推導，不寫死 2 或 200%：`lastHitMultiplier` 與
 * `lastHitMode` 都是後台可調欄位（第一守則），把出貨值抄進這裡就是替一個預期會
 * 變的東西上鎖，而且錯的時候長得跟對的一模一樣。
 *
 * 三個讓區間塌回單一數字的條件，每一個都對應 `splitBossBounty` 裡真的那一行：
 *   · `"weight"` 模式 —— 補刀傷害以 ×倍率 計入分母，總額守恆等於獎池；
 *   · `lastHitMultiplier ≤ 1` —— `mult - 1` 是 0，加碼那一步加了個 0（出貨的
 *     特殊殭屍就是這一種，所以它的 chip 從第一天就是對的）；
 *   · 特殊殭屍的 `splitByDamage` 關掉 —— damager 表是空的，走的是
 *     「沒有人造成可測量的傷害」那條分支，而那條分支**兩種模式都不加碼**。
 *     殭屍王沒有這個欄位（`mobBountyRules` 寫死 `splitByDamage: true`）。
 *
 * `reward.gold` 不走獎池（每殺一隻直接發），所以永遠是 `1`。
 */
export function goldPoolLastHitBonus(
  fieldKey: MobWavesFieldKey,
  cfg: MobWavesConfig | null,
): number {
  if (cfg === null) return 1;
  const block =
    fieldKey === "boss.bountyGold"
      ? cfg.boss
      : fieldKey === "special.bountyGold"
        ? cfg.special
        : undefined;
  if (block === undefined) return 1;
  // 特殊殭屍才有的逃生門；殭屍王永遠照傷害分。
  if ("splitByDamage" in block && block.splitByDamage === false) return 1;
  // 空 = 沿用 schema 預設「額外加碼」，和 `configFromForm` 的 `enumOf` 同一個回退。
  const mode = block.lastHitMode ?? "bonus";
  if (mode !== "bonus") return 1;
  const mult = block.lastHitMultiplier;
  if (typeof mult !== "number" || !Number.isFinite(mult) || mult <= 1) return 1;
  return mult;
}

export interface EffectiveGold {
  /** 實發**下界** = 設定值 × 倍率（走 sim 自己的 `applyGoldFactor`）。 */
  paid: number;
  /**
   * 實發**上界**。不是區間時 === `paid` —— 呼叫端一律比較這兩個，不要自己重算
   * 「這是不是區間」，那是第二個住處。
   */
  paidMax: number;
  /** 設定值本身 */
  configured: number;
  /** 乘的是哪一格 */
  envKey: CombatEnvKey;
  /** 那一格現在的值 */
  factor: number;
  /** 撐開區間的補刀倍率（不是區間時是 1）—— 印出來才知道區間是誰造成的。 */
  lastHitBonus: number;
}

/**
 * 一個欄位的「實發」。回 `null` = 這一欄不需要顯示實發，四種情況：
 *   1. 這個欄位不是金錢欄（大多數）；
 *   2. 戰鬥系統那張表還沒讀到（頁面剛開、或平台連不上）—— 這時**寧可不印**，
 *      印一個猜的實發比不印更糟；
 *   3. 欄位是空的（optional 欄位留空 = 不分紅，沒有東西可以乘）；
 *   4. 倍率剛好是 1.0 **而且不是區間** —— 實發等於設定值，多印一次只是雜訊。
 *      ⚠️ 「而且不是區間」是 2026-08-04 補的：倍率調回 1.0 之後，殭屍王的實發
 *      仍然是 `[獎池, 獎池 × 補刀倍率]`，這時候把 chip 收起來就等於又回去說
 *      「實發就是 30,000」那個謊 —— 只是換一個方式說。
 *
 * `cfg` 是**現在生效的那一份**（不是編輯中的表單）：這一行回答的是「現在這一場
 * 真的發多少」。給 `null` 就當作沒有區間資訊。
 */
export function effectiveGold(
  fieldKey: MobWavesFieldKey,
  value: string,
  multipliers: Readonly<Partial<Record<CombatEnvKey, number>>> | null,
  cfg: MobWavesConfig | null,
): EffectiveGold | null {
  const envKey = MOB_WAVES_GOLD_ENV_KEY[fieldKey];
  if (envKey === undefined || multipliers === null) return null;
  const factor = multipliers[envKey];
  if (typeof factor !== "number" || !Number.isFinite(factor)) return null;
  const text = value.trim();
  if (text === "") return null;
  const configured = Number(text);
  if (!Number.isFinite(configured)) return null;
  const lastHitBonus = goldPoolLastHitBonus(fieldKey, cfg);
  const paid = applyGoldFactor(configured, factor);
  // 上界走的是**同一個** `applyGoldFactor`，而且順序跟 sim 一致：加碼先發生在
  // 份額上（`splitBossBounty` 第 4 步），發放倍率最後才乘（`grantGold`）。
  const paidMax = lastHitBonus > 1 ? applyGoldFactor(configured * lastHitBonus, factor) : paid;
  if (factor === 1 && paidMax === paid) return null;
  return { paid, paidMax, configured, envKey, factor, lastHitBonus };
}

/**
 * 印在欄位旁邊的那一句。標出**乘的是哪一格**，否則操作者不知道去哪裡改；是區間
 * 的時候還要說出**為什麼**是區間，否則兩個端點看起來像是有人算不出來。
 */
export function effectiveGoldText(e: EffectiveGold, envLabel: string): string {
  const src = `${envLabel} ×${e.factor}`;
  if (e.paidMax <= e.paid) return `實發 ${e.paid} 金（${src}）`;
  return (
    `實發 ${e.paid} – ${e.paidMax} 金（${src}；` +
    `補刀的人會額外再多領一份自己的份額 ×${e.lastHitBonus}，` +
    `所以總額看傷害分佈 —— 多人平分接近下界，一個人包辦全部傷害又補刀就是上界）`
  );
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
/** 「先打誰」的兩個值 —— 與 `zMobWavesConfig.boss.king.targetPreference` 同一組。 */
export const KING_TARGET_PREFERENCES = ["players", "nearest"] as const;
/** 「學到第幾階」的兩個值 —— 與 `zMobWavesConfig.boss.king.learnRankMode` 同一組。 */
export const KING_LEARN_RANK_MODES = ["max", "fixed"] as const;

/**
 * 王的「會打架」那一整塊是不是全空。⭐ 與 {@link blockEmpty} 分開，因為它們回答不同的
 * 問題：`blockEmpty("boss.")` 問「這一份設定檔有沒有殭屍王」，這一支問「那隻王會不會
 * 自己打架」——⛔ 前者為 false 時後者仍然可以是 true（一隻只會揮刀的王）。
 */
export function kingBlockEmpty(form: MobWavesForm): boolean {
  return MOB_WAVES_FIELD_ORDER.filter((k) => k.startsWith("boss.king.")).every(
    (k) => form.fields[k].trim() === "",
  );
}

export function blockEmpty(
  form: MobWavesForm,
  prefix: "boss." | "special." | "healthBar.",
): boolean {
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
    // ⚠️ 逐回合表的兩格是**手寫**的檢查,不走 `validateField` —— 所以 GH#206 補
    // 上界時它們一併被漏掉,而這裡才是操作者真正會打「第 9 回合 5000 隻」的地方
    // (基準格通常只設一次,逐回合表每次改平衡都會被動到)。上下界要成對。
    const per = parseNum(r.mobsPerWaveCap);
    if (per === null || !Number.isInteger(per) || per < 0) {
      row.mobsPerWaveCap = "必須是 ≥0 的整數";
    } else if (per > MOB_PER_WAVE_CAP_MAX) {
      row.mobsPerWaveCap = `不能大於 ${MOB_PER_WAVE_CAP_MAX}`;
    }
    const alive = parseNum(r.maxAlivePerZone);
    if (alive === null || !Number.isInteger(alive) || alive < 0) {
      row.maxAlivePerZone = "必須是 ≥0 的整數";
    } else if (alive > MOB_ALIVE_CAP_MAX) {
      row.maxAlivePerZone = `不能大於 ${MOB_ALIVE_CAP_MAX}`;
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
  /**
   * #288 — the OPTIONAL-boolean twin of `bool`. A blank box means 「沒填」 and
   * must round-trip as an ABSENT key, not as the shipped value: these fields are
   * `.optional()` in the schema and their absence is a meaningful state the
   * operator can return to.
   */
  const optBool = (key: MobWavesFieldKey): boolean | undefined => {
    const t = form.fields[key].trim();
    return t === "1" ? true : t === "0" ? false : undefined;
  };
  /**
   * `enum` fields. An empty box means 「沒填」 and falls back to the shipped
   * value — NOT to `undefined`. Dropping the key would silently re-open the
   * schema's own default, which for `lastHitMode` is the opposite of what the
   * operator is looking at on screen.
   */
  const enumOf = <T extends string>(key: MobWavesFieldKey, allowed: readonly T[], fallback: T): T => {
    const t = form.fields[key].trim();
    return (allowed as readonly string[]).includes(t) ? (t as T) : fallback;
  };
  /**
   * #289 — the OPTIONAL-enum twin of `enumOf`, same reasoning as `optBool`.
   * `championSource` is `.optional()` and ABSENT is a real, reachable state
   * (「沒指定來源」 = 沿用今天的行為). Falling back to the SHIPPED value here would
   * make clearing 殭屍王由誰擔任 impossible — the box would silently re-write
   * `"random"` every save — and `changedFields` would report a diff nobody made.
   */
  const optEnum = <T extends string>(key: MobWavesFieldKey, allowed: readonly T[]): T | undefined => {
    const t = form.fields[key].trim();
    return (allowed as readonly string[]).includes(t) ? (t as T) : undefined;
  };
  /**
   * 等級公式的三格 —— **全有或全無**。
   *
   * ⚠️ 這裡不可以逐格 `optNum` 然後 `?? 0`:`levelCurve` 是 `.strict()` 的三欄
   * 物件,少一欄 Zod 直接拒收整份文件(而拒收的訊息會指向別的檔,見 CLAUDE.md)。
   * 而補 0 更糟 —— 只填了 B 的操作者會拿到 `C = 0`,也就是一條**穿過原點**的線,
   * 第 3 回合的殭屍從 7 級變 6 級,沒有任何訊息說他少填了東西。
   *
   * 所以:三格都填 = 寫出物件;一格都沒填 = 整個 key 省略(回到公式之前的行為);
   * 填了一兩格 = 也省略,並由 `formValid` 那條「這一區沒填完」的閘擋在存檔之前。
   */
  const curveOf = (prefix: "mob" | "boss" | "special"):
    | { perRoundSq: number; perRound: number; flat: number }
    | undefined => {
    const a = optNum(`${prefix}.levelCurve.perRoundSq` as MobWavesFieldKey);
    const b = optNum(`${prefix}.levelCurve.perRound` as MobWavesFieldKey);
    const c = optNum(`${prefix}.levelCurve.flat` as MobWavesFieldKey);
    if (a === undefined || b === undefined || c === undefined) return undefined;
    return { perRoundSq: a, perRound: b, flat: c };
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
  // #289 — 指定 / 隨機. OMITTED when blank (see `optEnum`): absent reads as
  // 「沿用」 in the sim, which is exactly what a cleared box should mean.
  const mobSrc = optEnum("mob.championSource", CHAMPION_SOURCES);
  if (mobSrc !== undefined) mob.championSource = mobSrc;
  putNum("sizeMult", "mob.sizeMult");
  putNum("tintStrength", "mob.tintStrength");
  // #247 腳下圈圈 — OMITTED when blank, like every other `putNum` here: a 0
  // written back would mean 「不要畫圈」, which is a real setting an operator must
  // have to type on purpose.
  putNum("groundRingDiameter", "mob.groundRingDiameter");
  putNum("groundRingSizeFollow", "mob.groundRingSizeFollow");
  putNum("baseLevel", "mob.baseLevel");
  putNum("levelPerRound", "mob.levelPerRound");
  const mobCurve = curveOf("mob");
  if (mobCurve !== undefined) mob.levelCurve = mobCurve;
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
    // ⚠️ 兩格都是 optional：空白 = 「沿用出貨預設」而不是 false / "none"。
    // 把空白寫成 false 會把 owner 2026-08-02 的規則靜默關掉（ABSENT ≠ ZERO）。
    ...(optBool("stopSpawnOnTeamWipe") === undefined
      ? {}
      : { stopSpawnOnTeamWipe: optBool("stopSpawnOnTeamWipe") }),
    // GH#647 —— 同一條 optional 規矩:空白 = 沿用出貨預設(不畫),不是 false。
    ...(optBool("normalMobShadow") === undefined
      ? {}
      : { normalMobShadow: optBool("normalMobShadow") }),
    ...(form.fields["roundHoldMobKinds"].trim()
      ? {
          roundHoldMobKinds: form.fields["roundHoldMobKinds"].trim() as NonNullable<
            MobWavesConfig["roundHoldMobKinds"]
          >,
        }
      : {}),
    // GH#268 —— 精英小怪血條。⚠️ Zod 這一塊是 `.strict()` 而且五格**都必填**,
    // 所以它只有「整塊寫」與「整塊不寫」兩種合法結果。五格全空 = 不寫這一塊
    // (＝沿用出貨值);只要有人填了任何一格,五格都要有值,沒填的用出貨值補齊。
    // 「只寫填了的那幾格」會產出一份 schema 拒絕的文件,而它被拒的地方遠在後台之外。
    ...(blockEmpty(form, "healthBar.")
      ? {}
      : {
          healthBar: {
            showHealthBar: bool(
              "healthBar.showHealthBar",
              SHIPPED_MOB_WAVES.healthBar!.showHealthBar,
            ),
            barWidth: num("healthBar.barWidth", SHIPPED_MOB_WAVES.healthBar!.barWidth),
            barHeight: num("healthBar.barHeight", SHIPPED_MOB_WAVES.healthBar!.barHeight),
            yOffset: num("healthBar.yOffset", SHIPPED_MOB_WAVES.healthBar!.yOffset),
            showThreshold: num(
              "healthBar.showThreshold",
              SHIPPED_MOB_WAVES.healthBar!.showThreshold,
            ),
          },
        }),
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
      ...(optBool("boss.countsAsChampion") === undefined
        ? {}
        : { countsAsChampion: optBool("boss.countsAsChampion") }),
      bountyGold: num("boss.bountyGold", sb.bountyGold),
      bountyXp: num("boss.bountyXp", sb.bountyXp),
      bountyLevels: num("boss.bountyLevels", sb.bountyLevels),
      lastHitMode: enumOf("boss.lastHitMode", ["bonus", "weight"] as const, sb.lastHitMode ?? "bonus"),
      countOverkill: bool("boss.countOverkill", sb.countOverkill ?? false),
      lastHitMultiplier: num("boss.lastHitMultiplier", sb.lastHitMultiplier),
    };
    const bm = optText("boss.modelKey");
    if (bm !== undefined) boss.modelKey = bm;
    const bc = optText("boss.championId");
    if (bc !== undefined) boss.championId = bc;
    const bsrc = optEnum("boss.championSource", CHAMPION_SOURCES);
    if (bsrc !== undefined) boss.championSource = bsrc;
    const bs = optNum("boss.sizeMult");
    if (bs !== undefined) boss.sizeMult = bs;
    const bh = optNum("boss.hpMult");
    if (bh !== undefined) boss.hpMult = bh;
    // GH#206 — OMITTED when blank, never written as 0. Clearing 「血量＝英雄的
    // 幾倍」 is how an operator asks for the pre-#206 king back; writing a 0
    // instead would ship a king with 1 hp (the sim clamps) and no message.
    const bhh = optNum("boss.heroHpMult");
    if (bhh !== undefined) boss.heroHpMult = bhh;
    const bhd = optNum("boss.heroDamageMult");
    if (bhd !== undefined) boss.heroDamageMult = bhd;
    const bhf = optNum("boss.hpFlatBonus");
    if (bhf !== undefined) boss.hpFlatBonus = bhf;
    const bms = optNum("boss.moveSpeedMult");
    if (bms !== undefined) boss.moveSpeedMult = bms;
    const bhl = optNum("boss.heroLevel");
    if (bhl !== undefined) boss.heroLevel = bhl;
    // #290 — OMITTED when blank (`optEnum`, not `enumOf`): clearing the picker
    // has to mean 「回到舊行為」, not 「悄悄寫回 fixed」.
    const bhls = optEnum("boss.heroLevelSource", HERO_LEVEL_SOURCES);
    if (bhls !== undefined) boss.heroLevelSource = bhls;
    const bcv = curveOf("boss");
    if (bcv !== undefined) boss.levelCurve = bcv;
    // #247 —— OMITTED when blank (`optBool`, not `bool`). Clearing 「無視碰撞」
    // has to mean 「回到舊行為」, and writing `false` back would be a LOUDER
    // statement than the operator made — the same rule `heroLevelSource` states
    // two lines up.
    const bnc = optBool("boss.noClip");
    if (bnc !== undefined) boss.noClip = bnc;
    const bncu = optBool("boss.noClipUnits");
    if (bncu !== undefined) boss.noClipUnits = bncu;
    const bnco = optBool("boss.noClipObstacles");
    if (bnco !== undefined) boss.noClipObstacles = bnco;
    const bncs = optBool("boss.noClipStayInside");
    if (bncs !== undefined) boss.noClipStayInside = bncs;
    const bmpr = optNum("boss.maxPerRound");
    if (bmpr !== undefined) boss.maxPerRound = bmpr;
    const bmps = optEnum("boss.maxPerRoundScope", BOSS_CAP_SCOPES);
    if (bmps !== undefined) boss.maxPerRoundScope = bmps;
    // #247 第二批 —— OMITTED when blank, same rule as every optional above:
    // clearing a box means 「回到舊行為」, and for `aggroRank` 舊行為 is 「王跟
    // 一般殭屍同級」 — writing a number back would be a louder statement than
    // the operator made.
    const bar = optNum("boss.aggroRank");
    if (bar !== undefined) boss.aggroRank = bar;
    const bhb = optBool("boss.healthBar");
    if (bhb !== undefined) boss.healthBar = bhb;
    const bhba = optEnum("boss.healthBarAnchor", BOSS_BAR_ANCHORS);
    if (bhba !== undefined) boss.healthBarAnchor = bhba;
    const bhbr = optEnum("boss.healthBarReveal", BOSS_BAR_REVEALS);
    if (bhbr !== undefined) boss.healthBarReveal = bhbr;
    // #291 —— OMITTED when blank: 清空抬頭 = 「用出貨的字」,不是「面板沒有抬頭」。
    const bst = optText("boss.settlementTitle");
    if (bst !== undefined) boss.settlementTitle = bst;
    // ⭐ GH#577 / GH#602 —— 王的「會打架」區塊是**全有或全無**（`levelCurve` 同一條
    // 規矩）：schema 上它是一個 `.strict()` 的物件。⚠️ 2026-08-23 之後**不是每一格
    // 都必填** —— 「學好學滿／根據情況放」那三格是 `.optional()`，理由是後台存過的
    // 舊 override 少了它們仍然必須驗得過（否則整份 arena 設定被拒 ⇒ 退回骨架）。
    // 這一塊全空 = 這一份設定檔沒有這個區塊 = 王回到只會揮刀的舊行為；
    // 有任何一格填了，其餘用出貨值補齊。
    if (!kingBlockEmpty(form)) {
      const sk = SHIPPED_MOB_WAVES.boss!.king!;
      boss.king = {
        enabled: bool("boss.king.enabled", sk.enabled),
        learnRank: num("boss.king.learnRank", sk.learnRank),
        innateAbilityId: optText("boss.king.innateAbilityId") ?? sk.innateAbilityId,
        innateCastHpPct: num("boss.king.innateCastHpPct", sk.innateCastHpPct),
        maxMana: num("boss.king.maxMana", sk.maxMana),
        manaRegenPerSec: num("boss.king.manaRegenPerSec", sk.manaRegenPerSec),
        attackSpeedFloor: num("boss.king.attackSpeedFloor", sk.attackSpeedFloor),
        learnRankMode:
          optEnum("boss.king.learnRankMode", KING_LEARN_RANK_MODES) ?? sk.learnRankMode,
        situationalAiming: bool("boss.king.situationalAiming", sk.situationalAiming!),
        areaMinTargets: num("boss.king.areaMinTargets", sk.areaMinTargets!),
        targetPreference:
          optEnum("boss.king.targetPreference", KING_TARGET_PREFERENCES) ?? sk.targetPreference,
      };
    }
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
      ...(optBool("special.countsAsChampion") === undefined
        ? {}
        : { countsAsChampion: optBool("special.countsAsChampion") }),
      rewardMult: num("special.rewardMult", ss.rewardMult),
    };
    const sm = optText("special.modelKey");
    if (sm !== undefined) special.modelKey = sm;
    const sc = optText("special.championId");
    if (sc !== undefined) special.championId = sc;
    const ssrc = optEnum("special.championSource", CHAMPION_SOURCES);
    if (ssrc !== undefined) special.championSource = ssrc;
    const ssz = optNum("special.sizeMult");
    if (ssz !== undefined) special.sizeMult = ssz;
    // GH#206 — same omit-when-blank rule as the king's.
    const shh = optNum("special.heroHpMult");
    if (shh !== undefined) special.heroHpMult = shh;
    const shd = optNum("special.heroDamageMult");
    if (shd !== undefined) special.heroDamageMult = shd;
    const shf = optNum("special.hpFlatBonus");
    if (shf !== undefined) special.hpFlatBonus = shf;
    const shl = optNum("special.heroLevel");
    if (shl !== undefined) special.heroLevel = shl;
    const shls = optEnum("special.heroLevelSource", HERO_LEVEL_SOURCES);
    if (shls !== undefined) special.heroLevelSource = shls;
    const scv = curveOf("special");
    if (scv !== undefined) special.levelCurve = scv;
    // #288 分紅獎池 — OMITTED when blank, never written as 0/false. Clearing all
    // three pool boxes is how an operator asks for the pre-#288 特殊殭屍 back
    // (`rewardMult` straight to the last hitter, and no damage ledger at all);
    // writing zeros instead would ship a special that pays NOTHING and says
    // nothing about it.
    const sbg = optNum("special.bountyGold");
    if (sbg !== undefined) special.bountyGold = sbg;
    const sbx = optNum("special.bountyXp");
    if (sbx !== undefined) special.bountyXp = sbx;
    const sbl = optNum("special.bountyLevels");
    if (sbl !== undefined) special.bountyLevels = sbl;
    const slm = optNum("special.lastHitMultiplier");
    if (slm !== undefined) special.lastHitMultiplier = slm;
    const smode = form.fields["special.lastHitMode"].trim();
    if (smode === "bonus" || smode === "weight") special.lastHitMode = smode;
    // ⚠️ `optBool`, NOT the `bool(key, fallback)` helper the king's block uses.
    // These two are `.optional()` in the schema, so a blank box must round-trip
    // as ABSENT; substituting the shipped value would silently write
    // `splitByDamage: true` into a doc whose operator never touched the box, and
    // `changedFields` would then report a diff that is not one.
    const sSplit = optBool("special.splitByDamage");
    if (sSplit !== undefined) special.splitByDamage = sSplit;
    const sOver = optBool("special.countOverkill");
    if (sOver !== undefined) special.countOverkill = sOver;
    // #291 —— 同上,兩格都 omit-when-blank。特別是 `settlementMode`:
    // 用 `optEnum` 而不是 `enumOf`,否則清空會被寫回 "panel",操作者永遠清不掉,
    // 而 `changedFields` 會報一個沒人做過的 diff(#289 踩過的同一個坑)。
    const sst = optText("special.settlementTitle");
    if (sst !== undefined) special.settlementTitle = sst;
    const ssm = optEnum("special.settlementMode", SETTLEMENT_MODES);
    if (ssm !== undefined) special.settlementMode = ssm;
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

/**
 * `等級 = 回合² × perRoundSq + 回合 × perRound + flat`,夾在 [1, 99] ——
 * the console's copy of `mobLevelFromCurve`. Same pinning rule as above.
 * (99 是 `packages/shared/src/sim/economy/progression.ts` 的 `LEVEL_CAP`;
 * 這頁不 import 它的理由與檔頭給 `BOSS_CAP_SCOPES` 的一樣。)
 */
export const CURVE_LEVEL_CAP = 99;

export function levelFromCurve(
  curve: { perRoundSq: number; perRound: number; flat: number },
  round: number,
): number {
  const r = Math.max(0, Math.round(round));
  const raw = Math.round(r * r * curve.perRoundSq + r * curve.perRound + curve.flat);
  return Math.min(CURVE_LEVEL_CAP, Math.max(1, raw));
}

/**
 * The console's copy of `mobLevelForRound`. Same pinning rule as above.
 *
 * ⚠️ 曲線**優先**,而且是**絕對**的(吃回合本身,不是 `round - fromRound`)——
 * 跟 `sim/mobs.mobLevelForRound` 逐字相同。這一段不跟上,逐回合預覽表會印出一份
 * 跟實際開打不一樣的等級,而那正是操作者拿來調平衡的那張表。
 */
export function levelForRound(cfg: MobWavesConfig, round: number): number {
  const curve = cfg.mob.levelCurve;
  if (curve) return levelFromCurve(curve, round);
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

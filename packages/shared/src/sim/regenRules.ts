/**
 * 百分比回血規則 (GH#253, owner 2026-08-01:「Berserker HP 回血 1%每秒,沒有保底」).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 動手之前的事實:回血一直是**固定值**,而且沒有任何一層有保底
 * ════════════════════════════════════════════════════════════════════════════
 * `systems/RegenSystem.ts` 一直只做一件事:
 *
 *     hp.hp += sc.final[Stat.HealthRegen] * world.dt
 *
 * `Stat.HealthRegen` 是一條純粹的**點數/秒**:英雄卡的 `baseStats.healthRegen`
 * ＋ `growth.healthRegen × (等級−1)` ＋ 力量 × `strToHealthRegen`,再乘
 * `combatEnv.healthRegen`。整條路上沒有任何一項讀 `maxHp`,所以
 * **「每秒回最大生命的 1%」在此之前是表達不出來的** —— 它不是被設錯的數字,
 * 是一個不存在的機制。
 *
 * 「保底」也查過了,三個可能的位置都是空的:
 *   · `content/config/base-bonus.json` 只有 `maxHealth: 650`,沒有 healthRegen;
 *   · `STAT_CLAMPS` 沒有 `HealthRegen` 這一列(所以 `finalizeStat` 的下界是 −∞);
 *   · `statCaps` 的 `HealthRegen` 是**上**界 10000,不是下界。
 * 也就是說 owner 擔心的「至少回 N 點」目前不存在於任何一層 —— 唯一會表現得像
 * 保底的是**固定值那一項本身**:百分比若是「疊加」在固定值上,那條固定值就是
 * 一條與最大生命無關的地板。所以 {@link RegenRules.pctMode} 的出貨值是
 * `replace`,而不是 `add`。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 每一格都是欄位(第一守則),出貨值取 owner 明說的那一個
 * ════════════════════════════════════════════════════════════════════════════
 * PURITY: 純資料 + 純函式。沒有 `Math.random` / `Date.now` / 三角函式 / `**`,
 * 沒有 Map/Set 迭代。
 */

/** 百分比回血與英雄卡上那條固定回血的關係。 */
export type RegenPctMode = "replace" | "add";

/** 後台下拉選單的選項來源;也是 `normalizeRegenRules` 的合法值清單。 */
export const REGEN_PCT_MODES: readonly RegenPctMode[] = Object.freeze(["replace", "add"]);

export interface RegenRules {
  /**
   * 百分比回血的總開關。關 = 英雄卡上的 `healthRegenPctOfMax` 全部當作沒填,
   * 逐位元等同這個機制出現之前的 sim。
   */
  pctEnabled: boolean;
  /**
   * `replace` = 有填百分比的英雄,他的固定回血**不再計算**,每秒只回
   * 「最大生命 × 百分比」(出貨值 = owner 的「沒有保底」)。
   * `add`     = 百分比疊在固定回血上 —— 這等於給了一條與最大生命無關的地板,
   *             也就是 owner 說的那種保底,所以它不是出貨值。
   */
  pctMode: RegenPctMode;
  /**
   * 保底:每秒至少回這麼多點。**出貨 0 = 沒有保底**(owner 的裁決)。
   * 它獨立於 {@link pctEnabled} —— 一位沒填百分比的英雄也吃得到這條地板。
   */
  floorPerSec: number;
  /**
   * 百分比那一項要不要吃 `combatEnv.healthRegen` 這個全域倍率。
   * 開(出貨值)= 後台那一格仍然是「全遊戲回血快慢」的總閥;
   * 關 = 百分比是一個不受全域調節影響的角色設定。
   */
  applyEnvMultiplier: boolean;
  /**
   * 百分比回血只給**英雄**(有 ChampionComp 的單位),不給小怪與召喚物。
   * 開 = 出貨值。關掉之後,一隻臉是 Berserker 的隨機英雄殭屍王也會每秒回 1%
   * 最大生命 —— 那是一個決定,不是一個副作用,所以它是一格開關而不是註解。
   */
  championsOnly: boolean;
}

/**
 * 出貨值。
 *
 * ⚠️ 這份預設**本身不改變任何一場比賽**:百分比只有在英雄卡填了
 * `healthRegenPctOfMax` 的時候才會啟動,而出貨內容裡只有一位填了
 * (`content/champions/godie-hapm.json` 海克力斯 - Berserker,0.01)。
 * `floorPerSec: 0` 也和現況一致(現況本來就沒有任何保底)。
 */
export const DEFAULT_REGEN_RULES: RegenRules = Object.freeze({
  pctEnabled: true,
  pctMode: "replace" as RegenPctMode,
  floorPerSec: 0,
  applyEnvMultiplier: true,
  championsOnly: true,
});

/** 文件的 schema 字串 —— sim 與後台 overlay 共用這一個常數。 */
export const REGEN_SCHEMA = "config.regen@1";
/** 文件 id(`config` collection 裡的 `regen`)。 */
export const REGEN_DOC_ID = "regen";

/**
 * 每秒保底的上界。1000 點/秒對照:出貨 Berserker 一級最大生命約 7.5k,1% 是
 * 75/秒,所以 1000 已經是「這條地板本身就能撐住一場」。再高只可能是把
 * 「最大生命」貼進了「每秒」那一格。
 */
export const REGEN_FLOOR_MAX = 1000;

/**
 * 英雄卡 `healthRegenPctOfMax` 的上界 = 0.5(每秒回滿血的一半)。
 *
 * 它擋的是一個很具體的手誤:owner 要的是「1%」,而 1% 在這裡寫成 `0.01`。
 * 直接把 `1` 填進去(以為單位是百分比)會變成**每秒回滿血**,而畫面上看起來
 * 只是「這個角色打不死」。0.5 > 任何實際會用到的設計值,又剛好把 `1` 擋在外面。
 */
export const REGEN_PCT_MAX = 0.5;

function isPctMode(v: unknown): v is RegenPctMode {
  // 逐一比對而不是 `includes`:`readonly T[]` 的 `includes(unknown)` 在 TS 下要
  // 先斷言,而斷言正是讓一個打錯的字串溜進 sim 的那一步(同 blockRules)。
  return v === "replace" || v === "add";
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * 正規化操作者/文件給的值。認不得 / 超界 → 夾回合法區間或退回出貨值,
 * **不 throw、不留 undefined**:一個 undefined 的 `pctMode` 會讓
 * {@link healthRegenPerSec} 兩條分支都不走,而那個結果是**全場沒有人回血**。
 */
export function normalizeRegenRules(raw: unknown): RegenRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const floorRaw = r.floorPerSec;
  const floor =
    typeof floorRaw === "number" && Number.isFinite(floorRaw)
      ? floorRaw < 0
        ? 0
        : floorRaw > REGEN_FLOOR_MAX
          ? REGEN_FLOOR_MAX
          : floorRaw
      : DEFAULT_REGEN_RULES.floorPerSec;
  return Object.freeze({
    pctEnabled: bool(r.pctEnabled, DEFAULT_REGEN_RULES.pctEnabled),
    pctMode: isPctMode(r.pctMode) ? r.pctMode : DEFAULT_REGEN_RULES.pctMode,
    floorPerSec: floor,
    applyEnvMultiplier: bool(r.applyEnvMultiplier, DEFAULT_REGEN_RULES.applyEnvMultiplier),
    championsOnly: bool(r.championsOnly, DEFAULT_REGEN_RULES.championsOnly),
  });
}

/**
 * 讀一份 `config.regen@1` 文件。沒有文件 / schema 不對 → 出貨預設。
 */
export function regenRulesFromDoc(doc: unknown): RegenRules {
  if (!doc || typeof doc !== "object") return DEFAULT_REGEN_RULES;
  const d = doc as { schema?: unknown };
  if (d.schema !== REGEN_SCHEMA) return DEFAULT_REGEN_RULES;
  return normalizeRegenRules(d);
}

/** {@link healthRegenPerSec} 的輸入 —— 全部是呼叫端已經算好的數字。 */
export interface HealthRegenInputs {
  /** `sc.final[Stat.HealthRegen]` —— 已經過 env / 基礎加成 / clamp 的固定值。 */
  flatPerSec: number;
  /** 這個單位當下的最大生命(`hp.maxHp`,也就是玩家血條的分母)。 */
  maxHp: number;
  /** 英雄卡的 `healthRegenPctOfMax`;缺 = 這位沒有百分比回血。 */
  pctOfMax: number | undefined;
  /** `combatEnv.healthRegen` —— 只有 `applyEnvMultiplier` 開著才會被用到。 */
  envHealthRegen: number;
  /** 這個單位有沒有 ChampionComp(`championsOnly` 用)。 */
  isChampion: boolean;
}

/**
 * 這個單位這一秒實際回多少點血。**這是唯一一份順序**,`RegenSystem` 與任何
 * 顯示面板都必須走它 —— 面板自己乘一次的話,#125 又會多一個破口。
 *
 * 順序:百分比(取代或疊加)→ 保底 → 不可為負。
 */
export function healthRegenPerSec(inp: HealthRegenInputs, rules: RegenRules): number {
  const pct =
    rules.pctEnabled &&
    typeof inp.pctOfMax === "number" &&
    Number.isFinite(inp.pctOfMax) &&
    inp.pctOfMax > 0 &&
    (!rules.championsOnly || inp.isChampion)
      ? inp.pctOfMax
      : 0;

  let out = inp.flatPerSec;
  if (pct > 0) {
    const envK =
      rules.applyEnvMultiplier && Number.isFinite(inp.envHealthRegen) ? inp.envHealthRegen : 1;
    const fromPct = Math.max(0, inp.maxHp) * pct * envK;
    out = rules.pctMode === "replace" ? fromPct : inp.flatPerSec + fromPct;
  }

  if (out < rules.floorPerSec) out = rules.floorPerSec;
  return out > 0 ? out : 0;
}

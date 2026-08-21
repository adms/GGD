/**
 * 移動速度 / 攻擊速度 的**每級成長五級距**（`config.speed-growth-tiers@1`，
 * owner 2026-08-21：「請你給我**移動速度及攻擊速度 每級成長五級距**」）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 這一軸與另外五軸**不一樣**：它不是把既有數值歸位，是**從無到有**
 * ─────────────────────────────────────────────────────────────────────────────
 * 量到的起點（母體＝49 位對戰可選本體，`testkit/balancePopulation`）：
 *
 *   | 軸 | 基礎 min/中位/max | **每級成長** |
 *   |---|---|---|
 *   | ms | 2.6 / 5.8 / 6.2 | ⛔ **49 位全部 0** |
 *   | as | 0.4 / 0.5 / 0.603 | ⛔ **49 位全部 0.02**（完全相同） |
 *
 * ⇒ 冷卻／耗魔／AoE／施法距離／傷害那五軸是「216 支各帶一個自由數字，收進格點」，
 * 這一軸是「**49 位共用一個常數，今天沒有任何差異**」。所以它解鎖的是一個
 * **今天不存在的設計維度**（「這位英雄會不會越打越快／越跑越快」），
 * ⛔ 不是一次重新分配。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 兩把梯子，A 是預設 —— 這是一格**下拉**，⛔ 不是我在註解裡挑一個
 * ─────────────────────────────────────────────────────────────────────────────
 * owner 2026-08-21 給了兩個候選（{@link SPEED_GROWTH_LADDERS}）。⛔ 兩把梯子的
 * 數字都**逐字住在這裡與出貨 JSON**，`ladder` 一格切換 —— 第〇·六守則「不能停
 * 就做成一格後台開關，讓他事後一鍵 rollback」的形狀。
 *
 * ⚠️ **今天切 A↔B 一個位元都不會動**，這是刻意的性質：
 * 出貨 49 位落在 `ms → 極小`（兩把梯子都是 0）與 `as → 小`（兩把梯子都是 0.02）。
 * ⇒ 開關已經接好、已經可以切，而它今天是**惰性**的。要它生效必須有人先把某一位
 * 移出那兩格 —— 那才是一次平衡改動，而它會是**看得見的一筆內容 diff**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 owner 的規格內部有一處打架，這裡照第〇·六守則①（**內文 > 標籤**）處理
 * ─────────────────────────────────────────────────────────────────────────────
 * 他同一則裡給了三件事，而三件不能同時成立：
 *
 *   ① 梯子（標籤）：A 的 ms ＝ `0 / 0.01 / 0.02 / 0.03 / 0.04`，as ＝ `0.01 …0.05`
 *   ② 理由（內文）：「**中位維持今天的值**（ms 0、as 0.02）⇒ ⛔ 不動現況」
 *   ③ 落地（內文＋守衛）：「49 位全部給**中**（＝維持今天的值）」、
 *      「**出貨 49 位解析後與今天逐位元相同**（零平衡改動的證明）」
 *
 * ⚠️ 照 ① 的表，「中」是 ms 0.02 / as 0.03，而今天是 ms 0 / as 0.02 ——
 * 49 位全給「中」＝ **ms 從 0 變 0.02**（LV99 移速 5.8 → 7.76，**+34%**）、
 * as 從 0.02 變 0.03。那是一次**很大**的平衡改動，③ 的守衛會當場紅。
 *
 * ⇒ 內文（②③「維持今天的值」「零平衡改動」）修正標籤（③ 的「中」）：
 * **梯子照抄 owner 的五個數字，每一位的預設級別＝「值等於他今天成長」的那一格**
 * ⇒ 49 位一律 `msGrowthTier: 極小` · `asGrowthTier: 小`。
 * 兩邊的內文都成立，只有「中」這個標籤被改掉 —— 那正是①要求的處理方式。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 **2026-08-21 下午：`as` 這一半被 owner 收走了** —— 「照出身表的規劃來設定就好」
 * ─────────────────────────────────────────────────────────────────────────────
 * `as` 進了 `config.stat-normalization@1` 的 `appliesTo`，⇒ `growth.as` 的主人
 * 變成**出身五級距**，而 `pnpm speedtiers:build` **不再敲 `asGrowthTier`**
 * （它從 `appliesTo` × `channel` **推導**自己該管哪幾條軸，⛔ 不是寫死名單，
 *  所以 owner 哪天把 `as` 拿回來，級別欄位會自動長回去）。
 * ⇒ 這一支今天實際只管 **`ms`**；上面 `asGrowthTier` 的每一句話都變成**紀錄**。
 * ⚠️ 這**不是**把機制刪掉：兩把梯子的 `as` 欄、`resolveSpeedGrowthTiers` 的
 * `as` 分支、後台那一格全部原封不動 —— 差別只在**今天沒有一張卡填它**。
 *
 * ⭐ 而且那個結果讀起來是對的：`0` 是 ms 成長的**地板**（負成長＝越級越慢，
 * 會被 `STAT_CLAMPS[MoveSpeed]` 的下界 2 靜默夾住），所以 ms 這一軸的空間
 * 本來就**只在上面**；as 今天的 0.02 在梯子上正好是第 2 格，下面還留一格
 * 給 owner 說的「攻速極慢只能靠反彈傷害」那種特化英雄（`BAND_MEANING.極小 = 缺陷`）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 攻速上限 4 —— 這一軸**撞得到**，而且今天就已經撞穿了
 * ─────────────────────────────────────────────────────────────────────────────
 * `config.stat-caps@1` 的 `as` 是 `base 4 / unlocked 10`。量到的（出貨管線，
 * `championStatBase(卡, AttackSpeed, L, 出貨 combat-env)`，母體 49）：
 *
 *   | 成長 | LV30 中位 | LV99 中位 | LV99 最大 |
 *   |---|---|---|---|
 *   | **今天 0.02** | 1.51 | **7.51** | 9.99 |  ← ⛔ 出貨就已經 > 4
 *   | A 極大 0.05 | **3.34** | 16.48 | 21.93 |
 *   | B 極大 0.08 | **4.82** | 25.45 | 33.88 |
 *
 * ⇒ 「LV99 撞不撞上限 4」這個問題**沒有一個候選過得了**，連**今天的出貨值都過不了**
 * （所以它不是選 A 或 B 的判準）。真正分得出勝負的是 owner 自己指定的
 * **hard limit ＝ LV30**（`HARD_ANCHOR_LEVEL`，「拿 30 級的當標準就好」）：
 *
 *   · **A 極大在 LV30 中位 3.34 < 4** —— 49 位裡只有 4 位超過 base cap（都是高敏英雄）
 *   · **B 極大在 LV30 中位 4.82 > 4** —— 49 位裡 **47 位**超過 ⇒ 那一格在 hard anchor
 *     上就已經整排被夾住，五級距的頂端變成一個**看不出差別**的格子
 *
 * ⭐ 這是 A 之所以是預設的第二個理由（第一個是 owner 自己給的「不動現況」）。
 * ⛔ 它**不是**「B 壞掉」—— B 是給「攻速上限被解到 10」之後的世界用的，
 * 那一天把 `ladder` 切成 `B` 就好。
 *
 * ⚠️ ms 那一軸兩把梯子都撞不到上限：`ms` cap base 18，B 極大在 LV99 中位 13.64
 * （最大 14.04）。但 owner 自己標了另一個代價：**B 的極大在 LV30 把移速從 5.8 推到
 * 8.12（+40%）⇒ 追逃節奏會變**，而那是玩法改動不是數值微調。
 */
import { LIMIT_ANCHOR_LEVEL } from "./balanceAnchors";
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";
import { DEFAULT_STAT_NORMALIZATION } from "./statNormalization";
import { DEFAULT_STAT_CAPS } from "../sim/statCaps";
import { Stat } from "../sim/stats/statTypes";

/** `content/config/speed-growth-tiers.json` 的文件 id。 */
export const SPEED_GROWTH_TIERS_DOC_ID = "speed-growth-tiers";

/** 五個級別 —— 與另外五軸**同一份**（`skillTiers.ts`）。⛔ 不要在這裡另立一組。 */
export const SPEED_GROWTH_TIER_NAMES = SKILL_TIER_NAMES;
export type SpeedGrowthTierName = SkillTierName;

/**
 * 這一份管的兩條屬性。⚠️ 字面值同時是**英雄卡 `growth` 區塊的鍵** ——
 * ⛔ 不要在別處再寫一次 `"ms"` / `"as"`，那就是第二個住處。
 */
export const SPEED_GROWTH_AXES = ["ms", "as"] as const;
export type SpeedGrowthAxis = (typeof SPEED_GROWTH_AXES)[number];

/** 兩條軸各自在英雄卡上的級別欄位名。⛔ 全專案唯一一份。 */
export const SPEED_GROWTH_TIER_FIELD: Readonly<Record<SpeedGrowthAxis, string>> = Object.freeze({
  ms: "msGrowthTier",
  as: "asGrowthTier",
});

/** 兩條軸的人話（後台標籤 · 文件 · 報告共用）。 */
export const SPEED_GROWTH_AXIS_LABEL: Readonly<Record<SpeedGrowthAxis, string>> = Object.freeze({
  ms: "移動速度",
  as: "攻擊速度",
});

/** 兩條軸對到的 `Stat`（上界從 `config.stat-caps@1` 推導時要用）。 */
export const SPEED_GROWTH_AXIS_STAT: Readonly<Record<SpeedGrowthAxis, Stat>> = Object.freeze({
  ms: Stat.MoveSpeed,
  as: Stat.AttackSpeed,
});

export const SPEED_GROWTH_LADDER_IDS = ["A", "B"] as const;
export type SpeedGrowthLadderId = (typeof SPEED_GROWTH_LADDER_IDS)[number];

type Ladder = Readonly<Record<SpeedGrowthAxis, Readonly<Record<SpeedGrowthTierName, number>>>>;

const ladder = (ms: readonly number[], as: readonly number[]): Ladder =>
  Object.freeze({
    ms: Object.freeze(
      Object.fromEntries(SPEED_GROWTH_TIER_NAMES.map((n, i) => [n, ms[i]!])),
    ) as Readonly<Record<SpeedGrowthTierName, number>>,
    as: Object.freeze(
      Object.fromEntries(SPEED_GROWTH_TIER_NAMES.map((n, i) => [n, as[i]!])),
    ) as Readonly<Record<SpeedGrowthTierName, number>>,
  });

/**
 * ⭐ owner 2026-08-21 **逐字給滿**的兩把梯子 —— 所以它們**照抄**，
 * ⛔ 沒有像 AoE／施法距離／耗魔那樣套一條推導梯子（再推一次就是拿第 2 層去蓋第 1 層，
 * 見 `cooldown-tiers.json` 的同一段）。
 *
 * · **A（預設）** ms `0 / 0.01 / 0.02 / 0.03 / 0.04` · as `0.01 … 0.05`
 * · **B（可切）** ms `0 / 0.02 / 0.04 / 0.06 / 0.08` · as `0.01 / 0.02 / 0.04 / 0.06 / 0.08`
 *
 * ⚠️ 兩把梯子的**前兩格 as 相同（0.01 / 0.02）、ms 極小相同（0）** —— 那不是巧合，
 * 那就是「今天」被兩把梯子同時包住的位置，也是切換今天為什麼是惰性的原因。
 */
export const SPEED_GROWTH_LADDERS: Readonly<Record<SpeedGrowthLadderId, Ladder>> = Object.freeze({
  A: ladder([0, 0.01, 0.02, 0.03, 0.04], [0.01, 0.02, 0.03, 0.04, 0.05]),
  B: ladder([0, 0.02, 0.04, 0.06, 0.08], [0.01, 0.02, 0.04, 0.06, 0.08]),
});

/** 出貨梯子。⭐ owner 2026-08-21「預設走 A」。 */
export const DEFAULT_SPEED_GROWTH_LADDER: SpeedGrowthLadderId = "A";

/**
 * 下界 **0** —— 負成長＝「越升級越慢」，而 `STAT_CLAMPS[MoveSpeed]` 的下界是 2，
 * 所以負值會在某一級之後**被靜默夾住**（做得到、看不出來、沒有東西會紅）。
 * 要做「越打越慢」的特化英雄，那是一個 debuff 機制，⛔ 不是在這一格填負數。
 */
export const SPEED_GROWTH_MIN = 0;

/**
 * 上界 —— **從 `config.stat-caps@1` 的 `unlocked` 天花板推導**，⛔ 不抄字面值。
 *
 * 判準：`成長 × (等級上限 − 1) ≤ 解鎖後的天花板` ⇒ 「光靠成長，在最高等級也
 * 不可能超過這條屬性解得開的極限」。它是一道 **mis-parse 柵欄**（把 0.05 打成 5），
 * ⛔ 不是平衡規則 —— 真正的平衡判準是 LV30 的 hard anchor，寫在檔頭那張表。
 *
 * 出貨值：ms `24 ÷ 98` → **0.244**、as `10 ÷ 98` → **0.102**
 *（往下取三位小數，逐位元組比對要一個穩定的字面表示）。
 * ⇒ A 的最大 0.05 與 B 的最大 0.08 都在裡面，⛔ 這道柵欄不會擋掉 owner 的規格。
 */
export const SPEED_GROWTH_MAX: Readonly<Record<SpeedGrowthAxis, number>> = Object.freeze(
  Object.fromEntries(
    SPEED_GROWTH_AXES.map((axis) => {
      const cap = DEFAULT_STAT_CAPS[SPEED_GROWTH_AXIS_STAT[axis]];
      const ceiling = cap?.unlocked ?? cap?.base ?? 1;
      return [axis, Math.floor((ceiling / (LIMIT_ANCHOR_LEVEL - 1)) * 1000) / 1000];
    }),
  ) as Record<SpeedGrowthAxis, number>,
);

export interface SpeedGrowthTiers {
  /**
   * 止血閥兼**一鍵 rollback**。false = `msGrowthTier` / `asGrowthTier` 不解析
   * ⇒ 每一位回到自己卡上手寫的 `growth.ms` / `growth.as`（⛔ 那些值一直都在，
   * 這一軸從來沒有銷毀退路值）。
   */
  enabled: boolean;
  /** 用哪一把梯子。⭐ owner 的兩個候選，出貨 `A`。 */
  ladder: SpeedGrowthLadderId;
  /**
   * 每一位的級別解析出來必須**逐位元**等於他卡上原本的 `growth`。
   * 守衛（`speedGrowthTiers.test.ts`）與 `pnpm speedtiers:check` 讀這一格決定要不要驗。
   *
   * ⚠️ **它不是一句「這一版沒改平衡」的宣稱**（2026-08-21 之前的註解是那樣寫的，
   * 而那個框架在同一天就壞了）。它守的是一件**永遠**該成立的事：
   * **卡上的原值與級別解析值不可以說兩句話** —— 級別是引擎跑的那個，原值是
   * `enabled: false` 拉下去之後接手的那個，兩者不一致 ⇒ 止血閥拉下去等於一次
   * 沒有人宣告過的平衡改動（第一·五守則的鏡像）。
   *
   * ⛔ 有差異的時候**不要關掉它**，也⛔ 不要去改測試 —— 把那條軸連同**理由**寫進
   * {@link SPEED_GROWTH_PARITY_DRIFT}，差異就會被**逐位列出來拿給 owner 看**。
   */
  requireAuthoredParity: boolean;
  /** 兩把梯子的全部 20 個數字。⭐ 每一格都可以在後台單獨調。 */
  growth: Readonly<Record<SpeedGrowthLadderId, Ladder>>;
}

/**
 * 出貨值。三個住處：`content/config/speed-growth-tiers.json` · 這裡 ·
 * `apps/admin` 的 `SHIPPED_*`。
 */
export const DEFAULT_SPEED_GROWTH_TIERS: SpeedGrowthTiers = Object.freeze({
  enabled: true,
  ladder: DEFAULT_SPEED_GROWTH_LADDER,
  requireAuthoredParity: true,
  growth: SPEED_GROWTH_LADDERS,
});

/**
 * ⛔ **具名退路** —— 軸 → 為什麼這一條軸的原值與級別還在說兩句話。
 *
 * ⚠️ 這是**名單**不是豁免（同 `tierRawParity.test.ts` 的 `TIER_RAW_DRIFT`、
 * `balanceAnchors.test.ts` 的 `LEGACY_ANCHORS`）：每一筆都要帶一個**能被反駁的
 * 理由**，而守衛與 `pnpm speedtiers:check` 兩邊都有**反向斷言** ——
 * 收乾淨之後那一筆會變成過期項目而紅，⛔ 不會靜靜留著變成沒人讀的豁免。
 *
 * ⭐ 而且列在這裡**不等於被消音**：守衛會把那一軸的差異**逐位印出來**
 *（哪一位 · 卡上多少 · 級別多少 · 差幾 %），因為這份清單存在的目的就是
 * **拿給 owner 看**，讓他自己決定那些差異是不是他要的。
 */
export const SPEED_GROWTH_PARITY_DRIFT: Readonly<Record<string, string>> = Object.freeze({
  // ⭐ **`as` 在 2026-08-21 被 owner 裁掉了，所以這張表現在是空的。**
  //
  //   > 「看不懂你第二第三選項，**請你照出身表的規劃來設定就好**」
  //
  //   ⇒ 出身表（`config.stat-normalization@1`）成為 `growth.as` 的主人：
  //     `as` 進 `appliesTo`，而 `pnpm speedtiers:build` **不再敲 `asGrowthTier`**
  //     （它從 `appliesTo` 推導自己該管哪幾條軸，⛔ 不是寫死名單）。
  //   ⇒ 「原值與級別說兩句話」在 `as` 這條軸上**不再可能發生** —— 級別欄位沒了。
  //   被取代的那條紀錄（三個選項、49 位的 0.003–0.0281、為什麼它沒生效）
  //   另存在 `docs/legacy/_attr-growth-zeroed-superseded.md` ④。
  //
  // ⚠️ 這張表**留著**：它是給下一條真的漂了的軸用的，而它的反向斷言
  //   （「清單上的軸必須真的還在漂」）會讓一筆過期的豁免紅，⛔ 不是靜靜留著。
});

function clampGrowth(v: unknown, axis: SpeedGrowthAxis, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, SPEED_GROWTH_MIN), SPEED_GROWTH_MAX[axis]);
}

/** 把一份 `config.speed-growth-tiers@1` 文件正規化成級距表。認不得 → 出貨值。 */
export function speedGrowthTiersFromDoc(doc: unknown): SpeedGrowthTiers {
  const d = doc as
    | {
        schema?: string;
        enabled?: unknown;
        ladder?: unknown;
        requireAuthoredParity?: unknown;
        growth?: Record<string, Record<string, Record<string, unknown>>>;
      }
    | undefined;
  if (!d || d.schema !== "config.speed-growth-tiers@1") return DEFAULT_SPEED_GROWTH_TIERS;
  const growth = Object.fromEntries(
    SPEED_GROWTH_LADDER_IDS.map((id) => [
      id,
      Object.freeze(
        Object.fromEntries(
          SPEED_GROWTH_AXES.map((axis) => [
            axis,
            Object.freeze(
              Object.fromEntries(
                SPEED_GROWTH_TIER_NAMES.map((name) => [
                  name,
                  clampGrowth(
                    d.growth?.[id]?.[axis]?.[name],
                    axis,
                    SPEED_GROWTH_LADDERS[id][axis][name],
                  ),
                ]),
              ),
            ),
          ]),
        ),
      ),
    ]),
  ) as Record<SpeedGrowthLadderId, Ladder>;
  return {
    enabled:
      typeof d.enabled === "boolean" ? d.enabled : DEFAULT_SPEED_GROWTH_TIERS.enabled,
    ladder: (SPEED_GROWTH_LADDER_IDS as readonly string[]).includes(d.ladder as string)
      ? (d.ladder as SpeedGrowthLadderId)
      : DEFAULT_SPEED_GROWTH_LADDER,
    requireAuthoredParity:
      typeof d.requireAuthoredParity === "boolean"
        ? d.requireAuthoredParity
        : DEFAULT_SPEED_GROWTH_TIERS.requireAuthoredParity,
    growth: Object.freeze(growth),
  };
}

/** 現在生效的那一把梯子（`ladder` 選出來的那一把）。⛔ 全專案唯一的查表入口。 */
export function speedGrowthTableOf(tiers: SpeedGrowthTiers): Ladder {
  return tiers.growth[tiers.ladder] ?? SPEED_GROWTH_LADDERS[DEFAULT_SPEED_GROWTH_LADDER];
}

/**
 * 把一張英雄卡上的 `msGrowthTier` / `asGrowthTier` 翻成 `growth.ms` / `growth.as`。
 *
 * ⭐ 全專案**唯一**知道級別怎麼變成每級成長的地方（同 `resolveManaCostTier`）——
 * 註冊表、選人畫面、商店預覽、後台試算、文件產生器都呼叫它。
 *
 * 規則（與另外五軸**逐字相同**）：
 *   · 沒填級別 → 原樣返回。手寫 `growth.ms` / `growth.as` 一直都是合法寫法。
 *   · `enabled: false` → 原樣返回（＝一鍵回到今天的那一套數字）。
 *   · 級別不在梯子上 → 那一條軸原樣返回，⛔ 不猜一格。
 *   · **兩格都有 → 級別贏**（卡上的原值留著當退路，⛔ 不銷毀）。
 *
 * ⚠️ 只看**頂層** —— `growth` 在 `champion@1` 是頂層欄位，深走訪會讓一個內嵌在
 * effect 裡的 `growth` 被誤當成英雄本人的成長（`resolveCooldownTier` 踩過那個坑）。
 */
export function resolveSpeedGrowthTiers<T extends Record<string, unknown>>(
  def: T,
  tiers: SpeedGrowthTiers,
): T {
  if (!tiers.enabled) return def;
  const table = speedGrowthTableOf(tiers);
  let growth: Record<string, number> | undefined;
  for (const axis of SPEED_GROWTH_AXES) {
    const tier = def[SPEED_GROWTH_TIER_FIELD[axis]];
    if (typeof tier !== "string") continue;
    const value = table[axis][tier as SpeedGrowthTierName];
    if (typeof value !== "number") continue;
    growth ??= { ...((def["growth"] as Record<string, number> | undefined) ?? {}) };
    growth[axis] = value;
  }
  return growth === undefined ? def : ({ ...def, growth } as T);
}

/** 一句話（後台說明 · Codex 契約 · 報告**共用**，⛔ 不各自寫一段）。 */
export function describeSpeedGrowthTiers(
  tiers: SpeedGrowthTiers = DEFAULT_SPEED_GROWTH_TIERS,
): string {
  const t = speedGrowthTableOf(tiers);
  const row = (axis: SpeedGrowthAxis): string =>
    `${SPEED_GROWTH_AXIS_LABEL[axis]} ` +
    SPEED_GROWTH_TIER_NAMES.map((n) => `${n} ${t[axis][n]}`).join(" / ");
  const normalized = SPEED_GROWTH_AXES.filter(
    (a) =>
      (DEFAULT_STAT_NORMALIZATION.appliesTo as readonly string[]).includes(a) &&
      DEFAULT_STAT_NORMALIZATION.channel[a] === "growth",
  );
  const managed = SPEED_GROWTH_AXES.filter((a) => !normalized.includes(a));
  return (
    `每級成長五級距（梯子 ${tiers.ladder}）：${row("ms")}；${row("as")}。` +
    (managed.length > 0
      ? `⚠️ 出貨 49 位一律 ${managed
          .map((a) => `${a}「${SPEED_GROWTH_TIER_NAMES[a === "ms" ? 0 : 1]}」`)
          .join(" · ")}＝今天的值 ⇒ 這幾條軸**零平衡改動**。`
      : "") +
    (normalized.length > 0
      ? `⭐ ${normalized
          .map((a) => SPEED_GROWTH_AXIS_LABEL[a])
          .join(" · ")}**不由這一頁決定** —— owner 2026-08-21「請你照出身表的規劃來設定就好」⇒` +
        ` 它的每級成長由 \`config.stat-normalization@1\` 的出身五級距推導，` +
        `英雄卡上那一格級別欄位已經由 \`pnpm speedtiers:build\` 刪除（⛔ 一條軸只能有一個主人）。`
      : "")
  );
}

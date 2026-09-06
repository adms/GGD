/**
 * ⭐【技能說明 = 從 JSON 推導】的**第二半**：卡面值 ↔ 實際值。
 *
 * ── 這一支與 `abilityProse.ts` 的分界（⛔ 不是第二份算繪）────────────────────
 *
 * `abilityProse.ts` 是**唯一**的算繪處：詞彙（`{{cd}}`）、抽取（`abilityQuantities`）、
 * 代入（`renderAbilityText`）、閘（`proseViolations`）都在那一份。這一支**不重寫
 * 任何一段算繪** —— 它補上那一份刻意留白的一格：
 *
 *   > `{{cd}}` 算繪出來的是**卡面秒**（`cooldownTiers.ts`：「這三張表是卡面秒」），
 *   > 而玩家真的等到的是 **卡面 × `combatEnv.cooldown`（出貨 0.2）**。
 *   > ⇒ 一支寫著「45秒冷卻」的技能，實際只轉 **9 秒**。
 *
 * 兩個數字都是真的，它們住在**不同的空間**。⛔ 語法只表達得出其中一種的話，
 * 想寫另一種的作者只能手打回去 —— 而手打正是這一整族要消滅的東西。
 *
 * ⭐ 所以入口 {@link renderAbilityDescription} 在這裡：它把「抽卡面量 → 算實際值 →
 * 代入」串成**一次呼叫**，`registries.ts` 的 `withProse` 與後台預覽都呼叫它。
 * ⛔ 呼叫端不可以自己組這三步：漏掉中間那步的那一天，`{{cd!}}` 會**原樣印在卡片上**
 * 而所有測試都是綠的（失敗形態②：算出來了但從沒送到客戶端）。
 *
 * ── ⛔ 為什麼**只有冷卻**有實際值 ──────────────────────────────────────────
 *
 * 判準只有一條：**這一軸的「實際」是不是一個單一因子？** 不是的話，⛔ 不做 ——
 * 一個看起來合理、實際上算錯的數字比一個裸的佔位符糟得多（第一·五守則：
 * 卡片上不可以有「說了但不會發生」的字）。逐軸的答案與**能被反駁的理由**
 * 全部逐格寫在 {@link LIVE_RULES}，⛔ 不是一句「其餘不支援」。
 *
 * ⚠️ 這張表是**閘**不是判準：它逐格覆蓋 `PROSE_SLOT_KEYS`，
 * 加一格新佔位符而不做決定 → `renderAbilityText.test.ts` 當場紅。
 */
import {
  abilityQuantities,
  fmtRanks,
  renderAbilityText,
  DEFAULT_PROSE_TABLES,
  type AbilityQuantities,
  type LiveValues,
  type ProseSlotKey,
  type ProseTables,
} from "./abilityProse";
import {
  DEFAULT_COMBAT_ENV,
  normalizeCombatEnv,
  type CombatEnvKey,
  type CombatEnvMultipliers,
} from "../sim/combatEnv";
import {
  DEFAULT_COOLDOWN_RULES,
  applyCooldownFloor,
  cooldownRulesFromDoc,
  type CooldownRules,
} from "../sim/cooldownRules";

/**
 * ⭐ **同一個實作**，從這一支再匯出一次 —— 讓「算繪一段技能說明」這件事只有一個
 * 檔名可以想到。⛔ 這不是第二份算繪（那是這一族的紅線），它逐字是
 * `abilityProse.renderAbilityText`。
 */
export { renderAbilityText };

/**
 * 實際值的字尾。⚠️ 它是 `abilityProse.PLACEHOLDER_RE` 第三個捕獲群組的字面值 ——
 * 兩邊要一起改（外部編輯器抄的是那條正則）。
 */
export const LIVE_SUFFIX = "!";

/**
 * 一軸「卡面 → 實際」的規則。
 *
 * · `factor` —— 實際值 = 卡面 × 一個**具名的** `combatEnv` 因子（可再過一道地板）。
 * · `none`   —— ⛔ 這一軸**刻意沒有**實際值，`why` 要說得出為什麼，
 *               而且要寫成**能被反駁**的樣子（照著做，這一格就該改成 `factor`）。
 */
export type LiveRule =
  | {
      readonly kind: "factor";
      readonly env: CombatEnvKey;
      /** 乘完之後要不要過 `config.cooldown-rules@1` 的秒數地板（⚠️ 地板是最後一步）。 */
      readonly cooldownFloor: boolean;
      readonly why: string;
    }
  | { readonly kind: "none"; readonly why: string };

/**
 * ⭐ 逐軸的決定。**八格一格都不可以少** —— 加一格新佔位符就要在這裡選一邊，
 * 而不是讓它靜靜地沒有實際值（守衛 ③ 在守這件事）。
 */
export const LIVE_RULES: Readonly<Record<ProseSlotKey, LiveRule>> = Object.freeze({
  cd: {
    kind: "factor",
    env: "cooldown",
    cooldownFloor: true,
    why:
      "冷卻是**唯一**一軸的「實際」真的是一個單一因子：`combatEnv.cooldown` 乘在 " +
      "`abilitySystem.castAbility` 那**一個**接縫上（Q/W/E/R 與 EX 同一條路），" +
      "然後 `applyCooldownFloor` 夾一次。⚠️ 這裡刻意**不含** cdr 與暴走倍率 —— " +
      "那兩個取決於**這一場、這一刻**的狀態，卡片上寫不出來",
  },
  mp: {
    kind: "none",
    why:
      "沒有任何倍率乘在耗魔上（`abilitySystem` 逐字扣 `manaCost[rank-1]`）⇒ " +
      "`{{mp!}}` 會與 `{{mp}}` **逐位元組相同**，那是一句空話（第一·五守則）。" +
      "⭐ 反駁方式：哪天真的加了一格「耗魔倍率」，這一格就該改成 factor",
  },
  dmg: {
    kind: "none",
    why:
      "一發傷害**真的掉多少血**不是一個因子：`damageDealt` 之外還有護甲／魔抗減傷" +
      "（`magicResistMult`）與 `maxHealth` 倍率，而且逐個目標不同。" +
      "⛔ 印一個「實際傷害」等於印一個對誰都不成立的數字。" +
      "⭐ 反駁方式：owner 指定一個要對誰算的錨（例如 LV30 的傷害級距那個錨），" +
      "它就變成一條算得出來的規則",
  },
  range: {
    kind: "none",
    why:
      "`combatEnv.abilityRange` 的確乘在施法距離上，但這一軸算繪成**級距詞**，" +
      "而級距表是**卡面**空間 —— 「他指定的比例是卡面還是實際」是 owner **還沒答**的" +
      "決策題（`aoeTiers.ts` 檔頭逐字記著）。⛔ 不在程式裡替他選一邊。" +
      "⭐ 反駁方式：owner 一裁決，這一格改成 factor",
  },
  radius: {
    kind: "none",
    why: "同 `range`（`abilityRange` 同時乘在 AoE 半徑上）—— owner 未裁決，⛔ 不替他選",
  },
  travel: {
    kind: "none",
    why:
      "位移距離**不走** `abilityRange` 那個接縫（它只乘施法距離與 AoE 半徑，" +
      "見 `sim/combatEnv.ts` 檔頭），而位移另外還被一條速度天花板夾（GH#318）⇒ " +
      "沒有一個單一因子代表得了「實際」",
  },
  push: { kind: "none", why: "同 `travel` —— 擊退距離沒有任何全域因子乘在上面" },
  msb: {
    kind: "none",
    why:
      "移速加成（GH#789）是 modifier 進 statPipeline 的一份輸入：實際跑多快取決於" +
      "基礎移速、其他 flat/pctAdd/pctMult 疊加與 `STAT_CLAMPS` 的上限 18 —— " +
      "沒有一個單一因子代表得了「實際」。⭐ 反駁方式：owner 指定一個錨" +
      "（例如「對中位基礎移速 5.8 算」），它就變成一條算得出來的規則",
  },
  cast: {
    kind: "none",
    why:
      "⭐ 這一格的理由與其他七格**方向相反**：`{{cast}}` 算繪出來的**本來就是實際值** " +
      "—— `abilityQuantities` 那一行已經套過 `applyCastTimeRules`（含 owner 的 " +
      "`castTimeMaxSec` 夾，#787/#792），因為 `abilitySystem.ts` 讀 `castTimeSec` 的" +
      "**同一行**就套它 ⇒ 玩家從來沒有經歷過規格值。" +
      "⇒ `{{cast!}}` 會與 `{{cast}}` **逐位元組相同**，那是一句空話（第一·五守則）。" +
      "⭐ 反駁方式：哪天吟唱長出一個「這一場、這一刻」才知道的因子（急速？狀態？）" +
      "而卡面值與實際值真的分家了，這一格就該改成 factor，而 `{{cast}}` 要退回規格值",
  },
  // ⭐ `{{ap}}`：法強係數沒有「實際值」那一張表 —— 卡面印的就是註冊表裡那條係數（公式或字面值由 config.ap-coefficient@1 決定）。
  ap: { kind: "none", why: "係數本身就是玩家真的吃到的值；沒有第二個空間可以 `{{ap!}}`" },
});

/** 算實際值要的兩份出貨設定。⛔ 全部從 `content/config/` 推導，不抄字面值。 */
export interface LiveDeps {
  readonly env: CombatEnvMultipliers;
  readonly cooldownRules: CooldownRules;
}

/**
 * 兩支的 `DEFAULT_*`（第一守則的住處②），⛔ 不是一份手抄的數字。
 *
 * ⛔⛔ **它刻意不是「沒給 deps 時的預設」**（量到的，2026-08-21）：
 * `DEFAULT_COMBAT_ENV` 是一張**中性表**（每一格 1.0），而出貨
 * `content/config/combat-env.json` 的 `cooldown` 是 **0.2** ——
 * 拿中性表去算「實際值」會印出一個**逐字等於卡面值**的數字，
 * 也就是「45 秒冷卻（實戰 45 秒）」，而玩家等的是 9 秒。
 * ⇒ 那正是第一·五守則說的「說了但不會發生」，而且它看起來完全正常。
 *
 * ⭐ 所以沒有 config 的時候，`{{cd!}}` **原樣印出來**（fail-loud），
 * ⛔ 不是用這一份頂上。這一份只給**明說要中性表**的呼叫端（測試 / 純算式）。
 */
export const DEFAULT_LIVE_DEPS: LiveDeps = Object.freeze({
  env: DEFAULT_COMBAT_ENV,
  cooldownRules: DEFAULT_COOLDOWN_RULES,
});

/**
 * 從 store 裡的 config 文件推導。⚠️ `normalizeCombatEnv` 是伺服器與客戶端**共用**
 * 的那一個正規化接縫，⛔ 不要在這裡自己 merge 一次（少一格 key 的 override 會讓
 * 卡片以為那個倍率不存在）。
 */
export function liveDepsFromConfigs(docs: readonly unknown[]): LiveDeps {
  // ⚠️ `unknown[]` 是刻意的：呼叫端手上的是**未經型別**的 config 文件（`store.all`
  //    給的那一種）。收窄成某個介面只會逼每個呼叫端各自 cast 一次。
  const find = (schema: string): unknown =>
    docs.find((d) => (d as { schema?: unknown } | null)?.schema === schema);
  const env = find("config.combat-env@1") as
    | { multipliers?: Partial<Record<CombatEnvKey, number>> }
    | undefined;
  return {
    env: normalizeCombatEnv(env?.multipliers),
    cooldownRules: cooldownRulesFromDoc(find("config.cooldown-rules@1")),
  };
}

/** `"60/50/40/30"` → `[60,50,40,30]`（算繪器吐出來的形狀，⛔ 不是任意文字）。 */
const parseCardRanks = (s: string | undefined): number[] =>
  s === undefined
    ? []
    : s
        .split("/")
        .map((t) => Number.parseFloat(t))
        .filter((n) => Number.isFinite(n));

/**
 * 一支技能的**實際值**表。今天只有 `cd` 算得出來（見 {@link LIVE_RULES}），
 * 其餘軸刻意缺席 ⇒ `{{dmg!}}` 之類會**原樣印在卡片上**並被閘點名。
 */
export function liveValues(q: AbilityQuantities, deps: LiveDeps): LiveValues {
  const out: Partial<Record<ProseSlotKey, string>> = {};
  // ⭐ 今天只有 `cd` 是 factor —— 而那個決定的唯一住處是 `LIVE_RULES`，所以這裡
  //    **讀它**而不是自己記得。⛔ 也不寫成「掃過每一格 factor 再拿 `q[slot]`」：
  //    幾何四軸的 `q[slot]` 是一個級距**詞**，那樣寫的話下一格 factor 落地的那天，
  //    會靜靜地拿一個詞去乘 0.2。
  if (LIVE_RULES.cd.kind === "factor") {
    const s = fmtRanks(parseCardRanks(q.cd).map((v) => liveSeconds(v, deps)));
    if (s !== undefined) out.cd = s;
  }
  return Object.freeze(out);
}

/**
 * 卡面秒 → 玩家等到的秒。
 *
 * ⚠️ 這一行是 `abilitySystem.castAbility` 那條算式的**鏡子**，而且是刻意的鏡子：
 * 那裡多的兩項（cdr、暴走倍率）取決於這一場的狀態，卡片上寫不出來 ⇒ 這裡取
 * 「沒有任何加成」的那一種。⛔ 地板永遠是**最後**一步（`applyCooldownFloor` 是
 * 唯一知道地板怎麼作用的地方）。
 */
export function liveSeconds(cardSeconds: number, deps: LiveDeps): number {
  const rule = LIVE_RULES.cd;
  // ⛔ 因子與地板都從 `LIVE_RULES` 讀，⛔ 不在這裡再打一次 `"cooldown"` ——
  //    哪天那一格被改成 `none`，這裡要跟著回卡面值，⛔ 不是繼續乘一個不存在的因子。
  if (rule.kind !== "factor") return cardSeconds;
  const scaled = cardSeconds * deps.env[rule.env];
  return rule.cooldownFloor ? applyCooldownFloor(deps.cooldownRules, scaled) : scaled;
}

/**
 * ⭐ **算繪一段技能說明的唯一入口**（抽量 → 算實際值 → 代入，一次呼叫）。
 *
 * @param def   ⚠️ 註冊**之後**那一份（`Abilities.get(id)`），⛔ 不是磁碟 JSON ——
 *              104 支技能的 `effects` 在磁碟上是空的，內容住在 `template.ref` 裡。
 * @param text  要算繪的原文（通常就是 `def.description`；後台草稿會傳表單上那一段）。
 * @param deps  ⛔ **不給就等於「這裡算不出實際值」** —— `{{cd!}}` 會原樣印出來並被閘
 *              點名，⛔ 不會被中性表頂成一個等於卡面值的假數字（見 `DEFAULT_LIVE_DEPS`）。
 */
export function renderAbilityDescription(
  def: unknown,
  text: string,
  tables: ProseTables = DEFAULT_PROSE_TABLES,
  deps?: LiveDeps,
): string {
  const q = abilityQuantities(def, tables);
  // ⛔ `deps` 缺席時**不**用中性表頂上（見 `DEFAULT_LIVE_DEPS`）：算不出實際值時
  //    `{{cd!}}` 原樣印在卡面上是刺眼的，一個「實戰 45 秒」不是。
  return renderAbilityText(text, q, deps === undefined ? undefined : liveValues(q, deps));
}

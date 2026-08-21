/**
 * ⭐ **觸發器（hook）那一層** —— 分片時從 `schema/effect.ts` 搬過來的，理由不是
 * 「檔案太長」而是一條真的相依：`applyBuff.hooks` 收的就是 `zHookDef`，所以
 * hook 若留在 `../effect.ts`，`effects/applyBuff.ts` 就得往回 import 上一層，
 * 而上一層 import `effects/index.ts` —— 一個 ESM 循環，會不會炸看誰先被載入。
 *
 * 這一支的相依是**單向**的：`_shared` ← `_hook` ← `applyBuff` ← `index` ← `../effect.ts`。
 * ⚠️ 它不是一個 kind，所以檔名以 `_` 開頭 —— 四向閘只把**不以 `_` 開頭**的檔當成 kind。
 *
 * ⛔ 對外 import 路徑不變：`zHookDef` / `zHookDefBase` / `zHookEvent` /
 * `hasBudgetedLeaf` / `refineHookDamageContext` / `HOOK_INTERNAL_COOLDOWN_MAX_SEC`
 * 全部由 `../effect.ts` 原地 re-export。
 */
import { z } from "zod";
import { CHANCE_PER_ATTR_MAX } from "../../../sim/effects/dynamicTerms";
import { HOOK_MAX_TRIGGERS } from "../../../sim/effects/kindLimits";
import { zCastableSlot } from "../common";
import { zEffectCondition } from "../condition";
import {
  zEffectDef,
} from "./_shared";
export const zHookEvent = z.enum([
  // ⭐ GH#354（owner 2026-08-17）—— 這 13 個與 sim 的 `HookEvent` 逐字對齊，
  // 而「誰在發射」寫在 systems/WorldHookSystem.ts 的那張表上。
  // ⚠️ 只加這裡而沒有那一列 = 下拉裡多一個永遠不會發生的選項（`onLevelUp` 的前科）。
  "onUltimateCast",
  "onUltimateHit",
  "onCrowdControlApplied",
  "onCrowdControlReceived",
  "onHeal",
  "onOverheal",
  "onAllyDamaged",
  "onProjectileExpire",
  "onBoundaryTouch",
  "onDashOrBlink",
  "onLethalDamage",
  "onStatCapReached",
  "onRoundStart",
  "onRoundEnd",
  "onAbilityCast",
  "onAbilityHit",
  "onBasicAttack",
  "onDamageDealt",
  "onDamageTaken",
  "onKill",
  // ⛔ `"onLevelUp"` 在這裡待到 2026-08-05 為止。owner 裁決 A2（泛化 pending-hook
  // 佇列）**不做**，而它從進 enum 的那天起就**零發射點** —— 全 sim 的 `fireHooks`
  // 只發八種事件，它不在裡面。留著它等於在編輯器下拉裡放一個「寫了什麼都不會
  // 發生」的選項，而作者不會知道：schema 收下、後台存得起來、卡片上看得到。
  //
  // 刪掉是安全的：`fieldAdoption` 的普查證明**零份文件**用過它，所以沒有任何
  // 一份既有內容會因此載入失敗。
  //
  // ⚠️ 這只是把**這一個**謊話拿掉，不是把「下拉裡有、引擎沒有」這個**形狀**關掉。
  // 結構性的守衛是 B1（謂詞池統一）的工作：登錄表同時宣告「能不能當觸發」與
  // 「誰在發射」，於是下一個 `onLevelUp` 在加進去的當下就會紅。
  /** 被暈眩的那一刻 — 為什麼是新成員、為什麼纏繞/減速不算,見
   *  sim/stats/modifiers.ts 的 `HookEvent`。 */
  "onStunned",
  /** 週期 — 每 tick 發射,節奏寫在 `internalCooldown`(10 = 每 10 秒)。
   *  43-00 觀音大士「每 10 秒生成一個護盾」、03-00 相轉移裝甲的常駐魔免都是它。
   *  見 sim/stats/modifiers.ts 的 `HookEvent` 與 systems/IntervalHookSystem.ts。 */
  "onInterval",
  /**
   * 反彈成功時（owner 2026-08-05：「onReflect／反彈成功時 這個也要」；
   * 2026-08-08 更名自 `onReflect` 並補上 provenance）。
   *
   * ⛔ 「成功」= **一發 `reflectDepth > 0` 的封包真的落地**。兩層閘：
   * ①`incomingPct` 的四道（沒有觸發封包 / 超過 `maxChainDepth` / 排空預算來不及且
   * `whenTooLate:"drop"` / 反彈量 ≤ 0）；②那一發封包沒有被目標的死亡、無敵免疫
   * 或技能迴避擋掉。任何一道攔下來都**不算**。
   *
   * ⭐ 它**帶得到那一發封包**（`DAMAGE_BEARING_EVENTS` 的第三個成員）——
   * hook 裡的 `damage.incomingPct` 反彈的是**那一發反彈封包**，也就是
   * 20-002「每次造成 7 倍[反彈]傷害」寫得出來的原因。
   * ⚠️ 那一發的 `reflectDepth` 已經是 1，所以要一起寫 `maxChainDepth: 1`，
   * 否則會被鏈深閘擋掉（那正是終止性在做它的事）。
   *
   * 理由與發射點見 `sim/systems/ReflectHookSystem.ts`；持有者是反彈的人
   *（防禦者），hook 的 target 是被反彈到的那個人（攻擊者，與 `onStunned` 同方向），
   * 所以「反彈時自己回血」寫 `target: "self"`。
   */
  "onReflectSuccess",

  // ── 由 `sim/systems/WorldHookSystem.ts` 從事件流轉成 hook 的六個（2026-08-06）──
  //
  // ⚠️ 這六個時刻 sim **每一場都在發**（`world.emit()`，給客戶端畫面用），
  // 而在這一批之前內容側一個都掛不上去 —— 因為 `fireHooks` 的呼叫點沒有一個
  // 讀事件流。缺的從來不是「事件」，是「廣播器」。
  //
  // ⛔ 加第七個的完整成本：`WORLD_HOOKS` 一列 + `HookEvent` 一個成員 +
  // 這裡一個成員 + `fieldAdoption` 一筆豁免。**不用寫新系統。**
  // 語意（誰是持有者、有沒有 target）逐一寫在 `sim/stats/modifiers.ts` 的
  // `HookEvent` 上，不在這裡重複一份 —— 兩份會分岔。

  /** 殭屍王出現（世界廣播）。 */
  "onBossSpawn",
  /** 火圈點燃（世界廣播，只在點燃那一 tick 發一次）。 */
  "onFireRingIgnite",
  /** 守衛塔倒下（世界廣播）。⚠️ 打塔不發 `onKill`，所以這是唯一接得到的路。 */
  "onGuardianDown",
  /** 死亡時。持有者＝死掉的人，target＝兇手（燒死時沒有 target）。 */
  "onDeath",
  /** 復活時。持有者＝被復活的人，不是頂圈圈的隊友。 */
  "onRevive",
  /** 迴避時。⚠️ 持有者＝**閃掉的那個**，target＝攻擊者。 */
  "onEvade",

  // ── 契約層 2026-08-09（GH#300）加的四個，⛔ **發射點由 lane B 接** ────────
  //
  // owner 點名這一族「使用率超高請一定要實作」。契約層先把**名字**定下來，
  // 因為四路平行實作全部要 import 同一個字面量；發射點在 GH#300。
  //
  // ⛔ 在發射點接上之前，這四個是「下拉裡有、引擎不發」——`onLevelUp` 被刪掉的
  // 那個形狀。語意（誰是持有者、有沒有 target、什麼不算）逐一寫在
  // `sim/stats/modifiers.ts` 的 `HookEvent`，**不在這裡重複一份**（兩份會分岔）。
  // ⛔ GH#300 收尾時沒接到的那幾個要**刪掉**，不是留著。

  /** 護盾產生時。持有者＝拿到護盾的人。 */
  "onShieldGained",
  /** 護盾破碎時（護盾池歸零那一格）。⚠️ 與【破盾】那個**動作**不是同一件事。 */
  "onShieldBroken",
  /** 隊友陣亡時。⚠️ 持有者＝**活著的隊友**，方向與 `onDeath` 相反。 */
  "onAllyDeath",
  /** 狀態被掛上的那一刻。⚠️「身上有某狀態時」走的是效果上的 `condition`，不是它。 */
  "onStatusApplied",
]);

/**
 * Ceiling on `HookDef.internalCooldown`, in SECONDS.
 *
 * The field had `.min(0)` and no upper bound at all until 2026-08-01, which is
 * exactly the half-bounded shape CLAUDE.md calls out (「欄位要有上界,不是只有
 * 下界」). What the ceiling catches is one specific, invisible mis-parse:
 * **milliseconds typed into a seconds field**. owner's 2026-08-01 rulings on
 * 炎神弩 godie-i06i and 熾天使之弓 godie-i012 are both 「冷卻1 秒」, and `1000`
 * typed where `1` was meant does not look wrong in a diff — it silently turns a
 * once-per-second proc into a once-per-match one, on a card that still advertises
 * the effect. `sim/effects/hooks.ts` would clamp nothing and report nothing; the
 * item would simply stop doing its job (失敗形態 ②).
 *
 * 300 s, matching `zItemBlockGrant.internalCooldown` in schema/item.ts so the two
 * cooldown fields do not disagree about what counts as a typo. It is a MIS-PARSE
 * guard, NOT balance policy: a combat round is ~3 min, the longest authored value
 * in content/ today is 45 s (godie-e00r.passive), and anything genuinely longer
 * than 300 s is a once-per-match effect that should say so in its own field.
 * The floor stays `.min(0)` — 0 is legal AND meaningful (= no cooldown, which is
 * what every hook authored before this field had).
 */
export const HOOK_INTERNAL_COOLDOWN_MAX_SEC = 300;

/**
 * 帶著一發傷害封包的事件 —— 也就是 `EffectContext.incoming` 唯一會被填的那幾個。
 * 是 `combatResolveSystem` 裡那幾個帶 `trigger` 的 `fireHooks` 的**唯一**真實來源
 * 鏡像（`onDamageDealt` / `onDamageTaken` 是直接發，`onReflectSuccess` 走
 * `pendingReflectHooks` → `ReflectHookSystem`，但帶的是同一個 `trigger` 物件）。
 */
const DAMAGE_BEARING_EVENTS: readonly string[] = [
  "onDamageTaken",
  "onDamageDealt",
  // 2026-08-08 —— 第三個。`onReflectSuccess` 是在**反彈封包落地的那一格**發的
  //（`combat/damage.ts` 排空迴圈裡，`trigger` 就是那一發封包本身），所以它跟
  // 上面兩個一樣帶得到 `EffectContext.incoming`。
  // ⛔ 少了這一列，20-002「[反彈]成功時…每次造成 7 倍[反彈]傷害」會在**載入時**
  // 被這個 refine 拒絕 —— 引擎做得到、schema 不收，也就是最貴的那種假的缺口。
  "onReflectSuccess",
];

/**
 * 把「只有帶傷害的事件才談得上『那一發』」變成一個**載入時的解析錯誤**,
 * 而不是一句註解。
 *
 * 它擋的是失敗形態 ②(做了但玩家拿不到)的一個非常安靜的變體:把
 * `damageSource: "basic"` 或 `damage.incomingPct` 掛在 `onKill` / `onBasicAttack`
 * / `onInterval` 上。schema 收得下、後台存得起來、卡片上看得到,而 sim 永遠
 * 不會給那些事件一發封包 —— 於是那條 hook **一次都不會觸發**,或者反彈永遠是 0,
 * 沒有任何錯誤訊息。
 *
 * ⚠️ 只看 `effects` 的**第一層**。巢狀 payload(`spawnProjectile.onHit`、
 * `applyBuff.hooks[]`、`leap.onLand`)不在這裡檢查,因為那些 payload 在**另一個**
 * 時間點執行,那時 `ctx.incoming` 本來就已經沒有了 —— 那是一個不同的、更難的問
 * 題,而一個假裝檢查了的淺掃比誠實地只掃一層更糟。sim 那一側的
 * `damage.incomingPct` 對沒有 `incoming` 的情況是**整條不執行**,所以巢狀誤用的
 * 後果是「什麼都不做」,不是「付一半」。
 */
/**
 * 每一次評估都**要付一次代價**的條件葉子 —— `onInterval` 漏填
 * `internalCooldown` 時,這些是把「每秒 30 次」從一句註解變成一個問題的那些。
 *
 * ⚠️ **這張表是 refine 的全部**,所以加葉子的人要順手看一眼這裡。今天只有
 * 一個成員:
 *
 *   · `"chance"` —— 每一次評估**抽一次 `world.rng`**。掛在沒有 ICD 的
 *     `onInterval` 上就是每 tick 一抽 × 每個持有者,而抽籤是**亂數流**上的
 *     動作:一份這樣的文件不只是慢,它會讓那一場的 seed 以 30Hz 前進,
 *     任何人事後想從錄影推理都要先扣掉它。
 *
 * 批 10 的空間葉子(`enemyChampionWithinRange`:沒有敵人在範圍內時 ICD 閘
 * **不會**擋,因為 `hookLastFired` 只在成功發射後才寫,所以條件會每 tick 做
 * 一次網格查詢)加進這張表就自動被擋 —— 那正是決策點 1-5 選 A 的理由,
 * 而這張表就是它落地的地方。
 */
const INTERVAL_BUDGET_CONDITION_KINDS: readonly string[] = ["chance"];

/**
 * 這棵條件樹裡有沒有任何一顆「每次評估都要付錢」的葉子。
 *
 * ⭐ EXPORTED（2026-08-10）—— `schema/ability.ts` 的 `zAbilityAugmentTarget`
 * 用同一支函式擋掉「強化的前提含機率葉」。兩處問的是**同一個**問題（這棵樹每次
 * 求值會不會抽 `world.rng`），所以共用一份；抄第二份的那一天，加新葉子的人只會
 * 想到更新其中一邊。
 */
export function hasBudgetedLeaf(cond: unknown): boolean {
  if (!cond || typeof cond !== "object") return false;
  const c = cond as Record<string, unknown>;
  if (typeof c.kind === "string")
    return INTERVAL_BUDGET_CONDITION_KINDS.includes(c.kind);
  for (const key of ["all", "any"] as const) {
    const arr = c[key];
    if (Array.isArray(arr) && arr.some(hasBudgetedLeaf)) return true;
  }
  return hasBudgetedLeaf(c.not);
}

export function refineHookDamageContext(
  hook: {
    on: string;
    damageSource?: string | undefined;
    damageType?: string | undefined;
    damageCrit?: string | undefined;
    critSource?: string | undefined;
    reflectedDamageSource?: string | undefined;
    reflectedDamageType?: string | undefined;
    perTarget?: boolean | undefined;
    chance?: number | undefined;
    chanceFrom?: { min: number; max: number } | undefined;
    internalCooldown?: number | undefined;
    condition?: unknown;
    effects: readonly { kind: string; incomingPct?: unknown }[];
  },
  ctx: z.RefinementCtx,
): void {
  // ── `onInterval` 的節奏 (批 1, 決策點 1-5) ────────────────────────────────
  //
  // owner 的 TSV 把節奏寫成 `interval: 0.5`。引擎的欄位叫 `internalCooldown`,
  // 而 `zHookDefBase` 是 `.strict()`,所以 `interval` 這個 key 本身進不來 ——
  // 問題不在拼錯,在**漏填**:`onInterval` 沒有 `internalCooldown` = 每一 tick
  // 都發 = 30 次/秒,而那在畫面上跟「每 0.5 秒一次」長得一模一樣,只是更燙。
  //
  // ⚠️ 為什麼不是「一律要求 `internalCooldown`」:03-00 相轉移裝甲的常駐魔免
  // **就是**要每 tick 發,出貨的 7 條 `onInterval` 也全部有 ICD。所以這條只擋
  // 「每次評估都要付錢的條件 + 沒有節奏」這個組合 —— 見
  // {@link INTERVAL_BUDGET_CONDITION_KINDS}。
  //
  // CLAUDE.md 的 fail-loud 條款:錯誤要在**編輯發生的當下**響(載入這份文件
  // 就爆,訊息由 `SchemaValidationError` 冠上 collection + 文件 id),
  // 不是等到某條剛好跑到它的測試。
  if (
    hook.on === "onInterval" &&
    !hook.internalCooldown &&
    hasBudgetedLeaf(hook.condition)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["internalCooldown"],
      message:
        "onInterval + 需要每次評估付出代價的條件(" +
        `${INTERVAL_BUDGET_CONDITION_KINDS.join(" / ")})卻沒有 internalCooldown ——` +
        " 這條 hook 會**每一 tick**(30 次/秒)評估一次條件並抽一次亂數。" +
        "節奏就寫在 internalCooldown(0.5 = 每 0.5 秒),那個欄位本來就存在;" +
        "owner TSV 上的 `interval` 指的就是它,不是第二個欄位。",
    });
  }
  // ── 【吞噬】掛在觸發器上一定要有節奏（GH#489）─────────────────────────────
  //
  // owner 2026-08-21：「**不對 有些被動是有冷卻的 例如初號機吞噬**」。
  //
  // `devour` 是唯一一個**無視護甲、護盾與傷害倍率、命中即死**的 kind
  //（`sim/effects/devour.ts`）。掛在一條沒有內部冷卻的觸發器上時，它的頻率
  // 等於那個事件的頻率 —— `onBasicAttack` 在攻速上限 4 之下是**每秒 4 次處決
  // 判定**，`onInterval` 更直接是**每秒 30 次**。
  //
  // ⭐ 這是**一條機制規則**（第〇·五守則），⛔ 不是替 59-01 / 92-03 各寫一個 if：
  //    節流的住處是**既有的** `internalCooldown`（`sim/effects/hookIcd.ts` 是
  //    全 repo 唯一的那份算術），這裡只是不准作者把它留白。
  //    ⛔ 也刻意**不**在 `zDevour` 上長第二個冷卻欄位：兩個平行的時鐘寫同一件事，
  //    「一個 hook 同時寫兩種節奏時誰贏」的任何答案都要靠註解解釋
  //    （理由與 `onInterval` 那一段的 `everySec` 逐字相同）。
  //
  // ⚠️ 和上面那一段一樣**只看第一層** `effects`。巢狀 payload（`leap.onLand`、
  // `spawnProjectile.onHit`）在另一個時間點跑，那是另一個更難的問題 ——
  // 而一個假裝檢查了的淺掃比誠實地只掃一層更糟。出貨的兩處 devour 觸發器
  //（92-03 狂草泥馬、grail-ex-13）都在第一層。
  //
  // ⚠️ 主動施放的 devour **不受這條管**：它根本不是 hook，節流是技能自己的
  // `cooldown[]`。
  if (!hook.internalCooldown && hook.effects.some((e) => e.kind === "devour")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["internalCooldown"],
      message:
        "帶【吞噬】的觸發器一定要填 internalCooldown —— 吞噬是無視護甲/護盾、" +
        "命中即死的處決，沒有節奏的話它的頻率就是事件的頻率" +
        "（onBasicAttack 在攻速上限下每秒 4 次、onInterval 每秒 30 次）。" +
        "⚠️ 這一格是**實際秒**，⛔ 不是卡面秒：卡面 60 秒的冷卻要填 12" +
        "（卡面 × combat-env 的技能冷卻倍率，出貨 0.2）。",
    });
  }
  // ── 機率的兩個欄位:互斥,而且區間不可以顛倒 ──────────────────────────────
  // 這一段**在 DAMAGE_BEARING_EVENTS 的 early-return 之前**,因為機率跟事件
  // 帶不帶封包無關 —— 放在後面的話,`onDamageTaken` 上的一份壞文件會安靜地
  // 通過(而 [反彈] 那一族全都掛在那兩個事件上)。
  if (hook.chance !== undefined && hook.chanceFrom !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["chanceFrom"],
      message:
        "chance 與 chanceFrom 不能同時出現 —— 「相乘還是取代」這個問題沒有正確答案, " +
        "而任何一種選法都會在某一張卡上讀起來像 bug。要活的門檻就只留 chanceFrom。",
    });
  }
  if (
    hook.chanceFrom !== undefined &&
    hook.chanceFrom.min > hook.chanceFrom.max
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["chanceFrom", "min"],
      message:
        `min ${hook.chanceFrom.min} > max ${hook.chanceFrom.max} —— 顛倒的區間會讓 clamp ` +
        "永遠回傳 min,也就是一件「機率性」道具安靜地卡在一個固定值上。",
    });
  }
  // ── S10：`reflected*` 只有 `onReflectSuccess` 帶得到原封包 ──────────────────
  // ⚠️ 它**不能**併進下面那個 for 迴圈：那個迴圈的條件是「不是帶傷害的事件」，
  // 而這兩格更窄 —— `onDamageTaken` / `onDamageDealt` 也帶不到「被反彈掉的原封包」。
  // ⛔ 少了它就是失敗形態②：schema 收得下、後台存得起來、卡片上寫著「反彈技能傷害
  // 時」，而 sim 永遠不會給那個事件一份原封包。
  // 這一段在 early-return **之前**，理由與上面機率那一段逐字相同。
  for (const [key, val] of [
    ["reflectedDamageSource", hook.reflectedDamageSource],
    ["reflectedDamageType", hook.reflectedDamageType],
  ] as const) {
    if (val === undefined || val === "any") continue;
    if (hook.on === "onReflectSuccess") continue;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [key],
      message:
        `「${val}」問的是**被反彈掉的那一發原封包**長什麼樣,只有 onReflectSuccess ` +
        `帶得到它。掛在 ${hook.on} 上這條 hook 一次都不會觸發。`,
    });
  }
  // ── S6：`perTarget` 需要一個「對象」。`onInterval` 發射時沒有 ───────────────
  if (hook.perTarget === true && hook.on === "onInterval") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["perTarget"],
      message:
        "perTarget 問的是「對每個敵人各算一次」,而 onInterval 發射時沒有對象 —— " +
        "這一格在那裡退化成一份共用額度,也就是一個看起來有設、實際上沒作用的設定。",
    });
  }
  // ── 45-00：免傷只有**被打的那一側**問得到 ─────────────────────────────────
  //
  // ⚠️ 這一段在 2026-08-10 換過一次，換掉的理由要留著（第三守則）：
  // 它**本來**禁的是「帶 `negateOriginal` 的 hook 不可以有 chance / chanceFrom /
  // internalCooldown」，支撐是「扣血那一半與反彈那一半會各問一次，兩次可以分岔」。
  // 而落地的實作把兩者併成**同一次詢問**（帶免傷的 `onDamageTaken` hook 只在扣血前
  // 的預掃描裡執行一次，含 ICD 與擲骰；`fireHooks` 一律跳過它們）——
  // 一個判定點就**不可能**分岔，所以那個禁令的支撐消失了。
  //
  // ⛔ 而它擋住的正是 owner 親自裁決的 45-00 寫輪眼（「有 **20% 機率**反彈魔法傷害」）：
  // 照裁決寫下去會是 PARSE ERROR。留著它 = 一格會拒絕正確內容的閘。
  //
  // 換上的這一條擋的是真的問不出答案的情況：免傷是「這一發不扣**我**的血」，
  // 只有被打的那一側帶得到「即將扣掉的那一發」。掛在 `onDamageDealt`（攻擊者視角）
  // 或任何別的事件上，那條 hook 一次都不會被預掃描看到 —— 而畫面上跟「這張卡就是
  // 沒生效」一模一樣（失敗形態②）。
  const negates = hook.effects.some(
    (e) =>
      e.kind === "damage" &&
      (e.incomingPct as { negateOriginal?: boolean } | undefined)?.negateOriginal === true,
  );
  if (negates && hook.on !== "onDamageTaken") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["on"],
      message:
        "免傷是「這一發不扣我的血」，只有被打的那一側問得到 —— onDamageTaken 是唯一" +
        `帶得到「即將扣掉的那一發」的事件。掛在 ${hook.on} 上這條 hook 的免傷一次都` +
        "不會生效。",
    });
  }
  if (DAMAGE_BEARING_EVENTS.includes(hook.on)) return;
  if (hook.damageSource !== undefined && hook.damageSource !== "any") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["damageSource"],
      message:
        `「${hook.damageSource}」是對觸發傷害的過濾,只有 ${DAMAGE_BEARING_EVENTS.join(" / ")} ` +
        `帶得到那一發封包。掛在 ${hook.on} 上這條 hook 一次都不會觸發。`,
    });
  }
  // B2 (2026-08-05) —— 新的兩格走**同一道閘**,不是第二套規則。
  // 它們與 `damageSource` 是同一族(都在問「觸發這一次的那一發封包長什麼樣」),
  // 所以「只有帶傷害的事件談得上『那一發』」對它們逐字成立。
  //
  // ⚠️ 這一段存在的理由就是失敗形態 ②:一條 `damageCrit: "crit"` 掛在
  // `onInterval` 上,schema 收得下、後台存得起來、卡片上寫著「暴擊時」,
  // 而 sim 永遠不會給那個事件一發封包 —— 它一次都不會觸發,沒有任何錯誤訊息。
  for (const [key, val] of [
    ["damageType", hook.damageType],
    ["damageCrit", hook.damageCrit],
    // ⭐ G8（2026-08-10）—— 走**同一道閘**，不是第二套規則：它與上面兩格是同一族
    // （都在問「觸發這一次的那一發封包長什麼樣」）。
    ["critSource", hook.critSource],
  ] as const) {
    if (val === undefined || val === "any") continue;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [key],
      message:
        `「${val}」是對觸發傷害的過濾,只有 ${DAMAGE_BEARING_EVENTS.join(" / ")} ` +
        `帶得到那一發封包。掛在 ${hook.on} 上這條 hook 一次都不會觸發。`,
    });
  }
  hook.effects.forEach((e, i) => {
    if (e.kind === "damage" && e.incomingPct !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effects", i, "incomingPct"],
        message:
          `[反彈] incomingPct 反彈的是「觸發這個 hook 的那一發傷害」,只有 ` +
          `${DAMAGE_BEARING_EVENTS.join(" / ")} 帶得到它。掛在 ${hook.on} 上永遠反彈 0。`,
      });
    }
  });
}

/**
 * `.strict()` OBJECT 版本,給 `schema/item.ts` 的 `.extend()` 用。
 *
 * 分成兩個名字的原因很實際:`zHookDef` 加了 `superRefine` 之後是 `ZodEffects`,
 * 而 `ZodEffects` 沒有 `.extend()`。`zAuraDef` / `zItemAuraDef` 已經踩過同一個
 * 坑(那邊用的是 `.innerType()`)。item.ts 會把同一個 refine 再套一次,兩邊共用
 * `refineHookDamageContext` 這一個函式,所以規則不可能只在一邊生效。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 寫卡片的人最常打錯的四個字 —— **它們都不是缺的功能,是拼寫**
 * ════════════════════════════════════════════════════════════════════════════
 * 稜彩增益卡的規格 TSV 用的是一套人話字彙,而其中四個字在引擎裡**已經有對應的
 * 欄位**。照 TSV 字面新增欄位的唯一產出是**同義詞**,而同義詞是最貴的一種技術
 * 債:兩個都填得起來、誰贏要靠註解解釋,而註解會過期(CLAUDE.md 第三守則)。
 *
 *   TSV 寫的            引擎已出貨的                        住在哪裡
 *   ──────────────────  ──────────────────────────────────  ─────────────────
 *   op: "conversion"    op: "percentOf" + from/fromResource  ModOp.PercentOf
 *                                                            (sim/stats/modifiers.ts)
 *   op: "set"           op: "override"                       ModOp.Override
 *   conditions: [ … ]   condition: { all: [ … ] }            本檔 `condition`
 *   interval: 0.5       internalCooldown: 0.5                本檔 `internalCooldown`
 *
 * 前三個由 `.strict()` 自動擋(未知的 key → 解析錯誤,而 `SchemaValidationError`
 * 會冠上 collection 與文件 id)。第四個擋得到「漏填」但擋不到「拼錯」,所以它
 * 另有一段 refine —— 見 `refineHookDamageContext` 的 `onInterval` 那一段。
 */
export const zHookDefBase = z
  .object({
    on: zHookEvent,
    /**
     * ⭐ S3 —— 這條觸發器在它所屬的那份被動／道具裡的**穩定名字**，讓
     * `modifyCooldown{target:"hookInternalCooldown"}` 指得到它。
     * 省略 = 沒有名字 = 沒有任何效果指得到它（也就是今天）。
     * ⭐ 形狀抄 `zAuraDef.key`。⛔ **不可以用陣列索引定址** —— `hooks[2]` 在作者
     * 插入一條新觸發器的那一刻就指到別人身上，而畫面上完全看不出來。
     */
    key: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe("這條觸發器的名字（讓「重置這條觸發器的冷卻」指得到它）。同一份被動裡不要重複。"),
    /** restrict to one slot; "PASSIVE" is the level-1 天生技 (zCastableSlot). */
    abilitySlot: zCastableSlot.optional(),
    effects: z.array(zEffectDef),
    /**
     * 內部冷卻(**秒**):這條 hook 真的發動過一次之後,要隔多久才能再發動。
     * 留空 / 0 = 沒有冷卻(每一次事件都算)。抽輸 / 條件不成立**不燒冷卻**
     * (sim/effects/hooks.ts 的順序註解)。道具來源還會再乘後台 combat-env 的
     * `itemCooldown`。上界見 {@link HOOK_INTERNAL_COOLDOWN_MAX_SEC}。
     */
    internalCooldown: z
      .number()
      .min(0)
      .max(HOOK_INTERNAL_COOLDOWN_MAX_SEC)
      .optional(),
    /** proc probability 0..1 on the seeded rng (absent = always) */
    chance: z.number().min(0).max(1).optional(),
    /**
     * 機率 = 一項三圍 × 係數,夾在 `[min, max]` —— 朗基努斯之槍 godie-i018
     * 「(總敏捷)% 機率」。mirrors `HookDef.chanceFrom` in sim/stats/modifiers.ts,
     * where the determinism argument (抽的次數與位置完全沒變,動的只有門檻)
     * and the 「為什麼 `chance` 不夠」 derivation live.
     *
     * `coeff` 上界 `CHANCE_PER_ATTR_MAX` 是**打錯數字的守衛**:寫 1 而不是
     * 0.01 等於「一點敏捷 = 100%」,而 clamp 會幫它藏起來 —— 一個永遠觸發的
     * 「機率性」道具在 diff 裡跟正確的長得一樣。
     *
     * `min`/`max` 兩端都是欄位:「(總敏捷)%」在後期無界(120 敏 = 120%),
     * 而要不要真的讓它變成必定觸發是 owner 的決定。`min <= max` 由
     * {@link refineHookDamageContext} 檢查(一個上下顛倒的區間會讓 clamp 回傳
     * `min`,也就是一個安靜地永遠不觸發的道具)。
     *
     * ⚠️ 2026-08-01 更正:這一段原本寫「在下面的 `refineHookChance` 檢查」,
     * 而**全樹沒有任何一個叫 `refineHookChance` 的東西**(第三守則)。那個檢查
     * 從一開始就住在 `refineHookDamageContext` 的最前面 —— 而且是刻意放在
     * `DAMAGE_BEARING_EVENTS` 的 early-return **之前**,那個順序本身有註解在守。
     * 名字指錯的註解比沒有註解更貴:它會讓下一個人去找一個不存在的函式,
     * 然後以為這條規則沒被實作。
     *
     * ⚠️ **沒有常數項**:門檻是 `clamp(三圍 × coeff, min, max)`,不是
     * `flat + 三圍 × coeff`。w3x 那一族 `(5 + 敏捷/15)%` 的技能因此**寫不進來**
     * (拿 `min` 當常數會得到 `max(0.05, agi×coeff)`,在 75 敏以下與文案差最多
     * 5 個百分點)。要移植那一族就是加一個 flat 欄位,不是在文件裡寫近似值 ——
     * 見 `content/fieldAdoption.test.ts` 對這個 key 的豁免。
     */
    chanceFrom: z
      .object({
        attr: z.enum(["str", "agi", "int"]),
        basis: z.enum(["base", "total"]).optional(),
        coeff: z.number().min(0).max(CHANCE_PER_ATTR_MAX),
        min: z.number().min(0).max(1),
        max: z.number().min(0).max(1),
      })
      .strict()
      .optional(),
    /**
     * 觸發條件 — the general 「什麼時候才觸發」 gate (owner 2026-07-30). Absent =
     * always, so every hook authored before this field is untouched.
     *
     * ⚠️ AUTHORED HERE, ON `zHookDef` ITSELF, AND NOT ON A PER-COLLECTION EXTEND
     * THE WAY `requires` IS. The two fields answer different questions and
     * therefore belong at different levels: `requires` is 「這位英雄配不配得上這
     * 張卡」, which only has meaning for a thing a champion EQUIPS, so item.ts
     * extends `zHookDef` to add it. A condition is 「這一下算不算數」, which is
     * meaningful for every hook carrier there is — ability passives, 天生技,
     * champion passives, augments, auras and items — and 獸矛 (an ability),
     * 僵屍王 A022 (an ability) and the 「X% 機率造成 Y」 item family all need it
     * at once. Putting it on the base is what stops this from becoming three
     * near-identical fields with three near-identical editors.
     */
    condition: zEffectCondition.optional(),
    /**
     * 效果打在誰身上:事件的那個實體(預設)、hook 的持有者("self"), 或**全隊**
     * ("allies")。
     *
     * `"allies"` 是 天生牙 godie-i031 的「我方所有英雄」/「我們全部英雄」——
     * 成員是「同隊、有 ChampionComp 的每一位, 含自己, **含死掉的**, 依實體 id 排序」,
     * 完整的理由與每一條的取捨寫在 sim/stats/modifiers.ts 的 `HookDef.target`。
     * 死人也在名單裡是 `revive` 的全部意義, 而對只作用在活人的 kind 是零成本:
     * `healTarget` / `restoreMana` 對屍體回 0。
     */
    target: z.enum(["self", "event", "allies"]).optional(),
    /**
     * #244 — WHAT the event's entity must be for the hook to fire. Absent =
     * "any" (every pre-#244 hook). Lets one `onKill` doc pay differently for a
     * 部隊 kill and a 英雄 kill.
     */
    victim: z
      .enum([
        "champion",
        "mob",
        "any",
        "enemyChampion",
        "allyChampion",
        "enemy",
      ])
      .optional(),
    /**
     * {@link zHookDefBase.shape.internalCooldown} 的**作用域**(批 1,
     * 決策點 1-4)。`"source"`(省略 = 這一個)= 一份冷卻不分槽位,也就是這個
     * 欄位出現之前每一份文件的行為;`"perAbilitySlot"` = Q/W/E/R/EX/PASSIVE
     * 各記各的(末日預言的 `perAbilityCooldown`)。
     *
     * ⚠️ **只在 `onAbilityCast` / `onAbilityHit` 上真的分得開** —— 其餘事件
     * 發射時沒有槽位,`"perAbilitySlot"` 在那裡退化成一份全域冷卻。完整的
     * 理由與「為什麼是槽位不是技能 id」寫在 `sim/stats/modifiers.ts` 的
     * `HookDef.internalCooldownScope`。
     */
    internalCooldownScope: z.enum(["source", "perAbilitySlot"]).optional(),
    /**
     * [反彈] 觸發這個 hook 的那一發傷害**是不是普通攻擊** —— mirrors
     * `HookDef.damageSource` in sim/stats/modifiers.ts, where the naming
     * (`"nonBasic"` 而不是 `"ability"`)與「無封包 = 不通過」的不對稱都有交代。
     *
     * owner 給反射之盾寫的是「反彈**普通攻擊**傷害 200%」;在這之前
     * `onDamageTaken` 分不出普攻、技能與 DoT,那件道具只能被實作成「反彈所有
     * 傷害」—— 一件強得多的、不同的道具。
     */
    damageSource: z
      .enum(["any", "basic", "nonBasic", "ability", "other"])
      .optional(),
    /**
     * B2 —— 觸發這個 hook 的那一發傷害**是什麼型別**。mirrors
     * `HookDef.damageType` in sim/stats/modifiers.ts。
     *
     * 讀的是**最後一次型別轉換之後**的型別,所以一發被轉成魔法的物理傷害在這裡
     * 是 `"magic"` —— 與護甲／魔抗吃到的那一個相同。
     *
     * 省略 = 不過濾(每一份既有文件逐位元不變)。
     */
    damageType: z.enum(["any", "physical", "magic", "true"]).optional(),
    /**
     * B2 —— 觸發這個 hook 的那一發傷害**是不是暴擊**。mirrors
     * `HookDef.damageCrit` in sim/stats/modifiers.ts。
     *
     * ⚠️ 三值而不是 boolean:`false` 與「沒填」在後台表單上分不開,而
     * 「不過濾」與「只在非暴擊時」是兩件完全不同的事。
     */
    damageCrit: z.enum(["any", "crit", "nonCrit"]).optional(),
    /**
     * ⭐ G8 —— 觸發這個 hook 的那一發暴擊**是不是這一份來源自己那條暴擊來源**
     * 造成的（89-01「**這一招**想起頭槌的那一下把敵人震昏」，不是「這位英雄任何
     * 一次暴擊都震昏」）。
     *
     * 省略 = `"any"` = 不過濾 = {@link zHookDefBase.shape.damageCrit} 今天的行為。
     * ⭐ hook 與暴擊來源本來就住在**同一份** source 上，所以「我自己那一條」是一個
     * **關係**不是一個字串 —— ⛔ 不做「填一個 source id」（那會多一個會腐爛的 join key）。
     */
    critSource: z
      .enum(["any", "thisSource"])
      .optional()
      .describe(
        "只在**這個被動自己的暴擊**觸發時才算：any（預設，任何來源的暴擊都算）或 " +
          "thisSource（只有這份被動自己那條暴擊來源打出來的才算）。",
      ),
    /**
     * ⭐ S10 —— 被**反彈掉的那一發原封包**是不是普通攻擊（60-04「若成功反彈敵方
     * **技能** AP 傷害」）。字彙與 {@link zHookDefBase.shape.damageSource} 完全相同，
     * 因為問的是完全相同的問題，只是主詞換成原封包。
     * ⚠️ 只有 `onReflectSuccess` 帶得到原封包（`refineHookDamageContext` 擋）。
     * 省略 = 不過濾 = 今天（每一條 `onReflectSuccess` 都是無條件觸發）。
     */
    reflectedDamageSource: z
      .enum(["any", "basic", "nonBasic", "ability", "other"])
      .optional()
      .describe(
        "只在被反彈掉的**原本那一發**是某種來源時才算（「反彈到的是技能傷害」）。留空＝不過濾。",
      ),
    /** ⭐ S10 —— 被反彈掉的原封包**是什麼型別**（60-04 的「AP」那一半）。 */
    reflectedDamageType: z
      .enum(["any", "physical", "magic", "true"])
      .optional()
      .describe(
        "只在被反彈掉的**原本那一發**是某種傷害型別時才算（「反彈到的是 AP 傷害」）。留空＝不過濾。",
      ),
    /**
     * ⭐ S6 —— 這條觸發器**總共**能發動幾次（15-04「**下一次**普攻」）。
     * 省略 = **無限次** = 這個欄位出現之前每一條 hook 的行為。
     * ⛔ 不要用「掛一個 duration 極短的增益」假裝一次性：那是**時間**界不是**次數**界，
     * 攻速一高就會吃到兩次，而畫面上跟正確的一模一樣。
     */
    maxTriggers: z
      .number()
      .int()
      .positive()
      .max(HOOK_MAX_TRIGGERS)
      .optional()
      .describe("這條觸發器總共只能發動幾次（「下一次普攻附加雷擊」＝ 1）。留空＝無限次。"),
    /**
     * ⭐ S6 —— 額度什麼時候被扣掉。今天只有 `"fire"`（真的發動的那一刻）。
     * ⚠️ 這一格刻意先存在：它把「這裡有二選一」寫進契約，而 `"hit"`（下游真的打到
     * 人才算）上線那天只是加一個 enum 成員、不是改語意。
     * ⛔ 不先開 `"hit"` —— schema 開了 handler 沒接正是失敗形態②。
     */
    consumeOn: z
      .enum(["fire"])
      .optional()
      .describe("什麼時候扣掉一次額度：fire（預設，觸發器發動的那一刻）。"),
    onConsumed: z
      .enum(["stop", "detachSource"])
      .optional()
      .describe(
        "額度用完之後：stop（預設，觸發器不再發動，但增益與屬性留著）或 " +
          "detachSource（整份來源卸下，圖示跟著消失）。",
      ),
    perTarget: z
      .boolean()
      .optional()
      .describe(
        "額度是每個敵人各一份還是全部共用。留空＝共用一份（「一次性」最直觀的意思）。" +
          "⚠️ 只有帶對象的事件談得上「每個敵人」。",
      ),
  })
  .strict();

/** `zHookDefBase` + 「只有帶傷害的事件談得上『那一發』」的載入時檢查。 */
export const zHookDef = zHookDefBase.superRefine(refineHookDamageContext);

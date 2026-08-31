/**
 * ⭐ effect kind 分片的**共用地基** —— `effects/<kind>.ts` 每一支都 import 它。
 *
 * 這裡放的只有兩種東西，⛔ 沒有第三種：
 *   ① **兩支以上** kind 共用的界／子 schema／跨欄位檢查（`refineDispelShape`
 *      有十個消費端、`SOURCE_GRANT_SHAPE` 有四個授權面）。
 *   ② 遞迴的結（{@link zEffectDef}）—— 見它自己的檔頭。
 *
 * ⛔ **只有一個 kind 用的東西不要放這裡**：那是把 4,754 行的單點失效原地搬家。
 * 一支 kind 自己的界與自己的 `refine` 住在 `effects/<kind>.ts`，跟它的欄位放在
 * 一起 —— 那正是 #467 ② 要的形狀（加一個機制只碰一個新檔）。
 *
 * 模組圖是**單向**的：`_shared`（葉）← `<kind>.ts` ← `index.ts` ← `../effect.ts`。
 */
import { z } from "zod";
import { RESOURCE_PCT_POINTS_MAX, RESOURCE_PCT_RATIO_MAX, RESOURCE_PCT_RATIO_SELF_MAX } from "../../../sim/effects/dynamicTerms";
import type { EffectDef } from "../../../sim/effects/effect";
import { EFFECT_CHAIN_MAX_STEPS, TYPE_STREAK_MAX_THRESHOLD, TYPE_STREAK_MAX_TIMEOUT_SEC } from "../../../sim/effects/kindLimits";
import { FLIGHT_MAX_HOVER_HEIGHT } from "../../../sim/flight";
import { RANK_SCALAR_MAX_COLUMNS } from "../../../sim/perRank";
import { ATTR_GRANT_MAX, ATTR_GRANT_MIN } from "../../../sim/stats/attributes";
import { AOE_TIER_NAMES } from "../../aoeTiers";
import { zStatModifier } from "../common";
import { zEffectCondition } from "../condition";
import { zPenetrationGrant } from "../mitigationDoc";

/**
 * ⭐ 遞迴的結 —— `spawnProjectile.onHit` 又是一串 `EffectDef`。
 *
 * 分片之前這裡是一行 `z.lazy(() => zEffectDefUnion.superRefine(refineEffectDef))`，
 * 因為聯集就在同一個檔的下面。分片之後聯集住在 `./index.ts`，而 `index.ts`
 * **import 這一支**（每個 kind 檔都 import 它）—— 反過來 import 會 closed 一個
 * 真的 ESM 循環，而那個循環的代價不是「風格不好」：
 *
 *   `_shared.ts` 若 `import { zEffectDefUnion } from "./index"`，那麼**誰先被載入**
 *   就決定會不會爆 —— 先進 `index` 沒事，先進 `_shared` 就是
 *   `EFFECT_COMMON_SHAPE` 在 kind 檔的 top-level 被讀到時還在 TDZ。
 *   ⛔ 一個「看載入順序決定會不會炸」的模組圖不是設計，是運氣。
 *
 * 所以改成**單向**的：`_shared`（葉）← 各 kind ← `index`。`index.ts` 在自己的
 * 結尾把真正的 schema 交回來（{@link registerEffectDefSchema}）。
 *
 * ⚠️ 沒交回來就 **throw**，⛔ 不 fail-open 回一個 `z.any()` ——
 * 那會讓「單獨 import 一個 kind 檔」變成一份**什麼巢狀效果都收**的 schema，
 * 而它跟正確的長得一模一樣（CLAUDE.md 失敗形態②）。
 */
const effectDefHolder: { schema: z.ZodTypeAny | null } = { schema: null };

/** ⛔ 只有 `./index.ts` 可以呼叫。見 {@link zEffectDef}。 */
export function registerEffectDefSchema(schema: z.ZodTypeAny): void {
  effectDefHolder.schema = schema;
}

/**
 * Recursive knot: spawnProjectile.onHit is EffectDef[] again.
 *
 * ⛔⛔ **⛔ 不要在這裡包一層 `superRefine` 做深度檢查。**
 *
 * ⭐ 2026-08-31 我這樣做過，而它**當場弄壞了編輯器**：
 * 把這個 `z.lazy` 的回傳包成 `z.any().superRefine(...)` 之後，
 * schema 的**可內省型別**從 `discriminatedUnion` 變成 `unknown`
 * ⇒ ⭐⭐ `apps/editor` 的 `walkZod()` **看不見那 46 種 effect kind 了**
 * ⇒ 表單產生器產不出任何一格（`union.variants` 是 `undefined`）。
 *
 * ⚠️ ⭐ 而那正好打在 owner 最在意的那一點上：
 * 「**後台編輯器的抽象化、完整性、視覺化可操作性很重要**」——
 * ⛔ 一個為了安全而做的改動，把「no code 介面」的地基抽掉了。
 *
 * ⇒ ⭐ **深度檢查住在門口**（`content/finiteNumbers.ts` 的 `findDocProblems`），
 *   與非有限數字同一處、同一個時機（Zod **之前**）——
 *   ⭐ 那裡不碰 schema 的型別，⛔ 所以內省不受影響。
 */
export const zEffectDef: z.ZodType<EffectDef, z.ZodTypeDef, unknown> = z.lazy(() => {
  if (effectDefHolder.schema === null) {
    throw new Error(
      "zEffectDef 還沒接上聯集 —— 一定要 import content/schema/effect.ts 或 " +
        "content/schema/effects/index.ts（⛔ 不可以只 import 單一 kind 檔）",
    );
  }
  return effectDefHolder.schema;
}) as unknown as z.ZodType<EffectDef, z.ZodTypeDef, unknown>;

// AoE 四級距（owner 2026-08-11）。⛔ 不要在這裡重打一份字串陣列。
export const zAoeTier = z.enum(AOE_TIER_NAMES);

export const zDamageType = z.enum(["physical", "magic", "true"]);

/**
 * ⭐ GH#299 第 2 條（owner：「授權格沒開⋯**請修正**」）—— 把一格既有的**純量**
 * 欄位開放成「逐階可以不一樣」，**而且不動任何一份既有文件**。
 *
 *   · `duration: 3`        每一階都是 3（今天所有內容的寫法，語意逐字不變）
 *   · `duration: [2,3,4,5]` 一階一格，rank-1 起算、超出長度夾在最後一格
 *
 * ⛔ 不開第二個欄位名（`durationPerRank`）：那是同一個量的第二個住處，
 * 而它會在有人只改一邊的那一天靜默地贏。完整推導與讀取器住在
 * `sim/perRank.ts` —— ⛔ 這裡不重複一份。
 *
 * @param inner 那一格原本的純量 schema（含它自己的上下界）——
 *              陣列的每一格**共用同一組界**，所以打錯的數字在哪一階都擋得住。
 */
export function zRankScalar<T extends z.ZodTypeAny>(inner: T): z.ZodUnion<[T, z.ZodArray<T>]> {
  return z.union([inner, z.array(inner).min(1).max(RANK_SCALAR_MAX_COLUMNS)]);
}

/**
 * Ceiling on ONE rank column of `damage.hpPct` (a 0..1 ratio of the victim's
 * health). 0.35 is deliberately several times the strongest authored value
 * (揍敵客阿福 W 牙突 tops out at 0.12) — this is a MIS-PARSE guard in the spirit
 * of `damageArea`'s radius caps, not balance policy. The failure it prevents is
 * exact and has shipped before in other clothes (#277): 「12」 typed where
 * 「0.12」 was meant is not a strong ability, it is 1200 % of max health, i.e.
 * every cast one-shots every body it touches. Bounded on BOTH ends because
 * CLAUDE.md says 「欄位要有上界，不是只有下界」.
 */
export const HP_PCT_DAMAGE_MAX = RESOURCE_PCT_RATIO_MAX;

/**
 * ⭐ `applyStatus.duration` 的**兩層**上界（2026-08-09 / GH#299 第 1 條）。
 *
 * 在此之前只有一個數字（20 秒）管所有狀態，而它的理由 ——「一個 30 秒的暈眩在
 * 一場三分鐘的回合裡等於那個人這一場不用玩了」——**只對硬控成立**。於是一個
 * 24 秒的計數視窗（不動控制、不動數值，只是「這段時間內」）也被同一條界擋下來。
 *
 * 所以現在是兩條：
 *   · {@link STATUS_MAX_DURATION_SEC} = 60 —— 一般狀態。仍然是**打錯數字的守衛**
 *     （20 打成 200 照樣擋得下），不是平衡政策。
 *   · {@link HARD_CC_MAX_DURATION_SEC} = 20 —— `stun` / `root` / `feared` /
 *     `silenced` 任何一格為真時。**逐字是舊的那個數字**，一格都沒放寬。
 *
 * ⚠️ 判準是「玩家這段時間還能不能操作」，所以 `moveSpeedMult` 不在硬控那一組
 * （減速仍然打得到、放得出技能），而 `silenced` 在（放不出技能就是被拿走一半的
 * 操作）。⛔ 新增一個「拿走操作」的布林時要一起加進 `HARD_CC_FLAGS`，
 * 否則它會安靜地拿到 60 秒。
 */
export const STATUS_MAX_DURATION_SEC = 60;

/** 硬控（拿走操作）的上界 —— 2026-08-09 之前**所有**狀態共用的那個數字。 */
export const HARD_CC_MAX_DURATION_SEC = 20;

/** 哪幾格算「拿走操作」。⛔ 新增同類布林時一起加，見上。 */
export const HARD_CC_FLAGS = ["stun", "root", "feared", "silenced", "disarmed"] as const;

/**
 * `damage.bankedBonus` 的三個上界(owner 2026-07-31 的「係數要是欄位 + 要有一個
 * 傷害上界當保險」)。
 *
 * ⚠️ 這三個數字是**護欄不是平衡值**,跟 `HP_PCT_DAMAGE_MAX` 同一個性質:它們的
 * 工作是讓打錯的數字**載不進來**,而不是替設計師決定強度。出貨的 13-002 用的是
 * coeff 0.20 / max 900,離每一個上界都很遠。
 *
 * MEASURED, not guessed（2026-07-31,揍敵客 godie-efur,用出貨的 combat-env）:
 *   maxMana = (baseStats.maxMana 100 + growth.maxMana 28×(lv−1) + INT×intToMaxMana 15)
 *             × multipliers.maxMana 1.0,  INT = 20 + 2.3×(lv−1)
 *   → lv1 ≈ 400、lv10 ≈ 962、lv15 ≈ 1,275(無法力裝)
 * 出貨的 coeff 0.20 因此換算成 lv10 滿魔約 **+192 點**,對照 maxHealth 倍率 9
 * 下的一條血(150 基礎 → 1,350 起跳)大約是 14%。合理,不是一擊必殺。
 *
 * 出貨卡的 `max` 是 400,對應法力池 2,000 —— 只有重度法力裝才碰得到,所以它
 * 是**保險絲**而不是隱形的平衡上限;下面這個 schema 上界(1200)又比它高三倍,
 * 因為 schema 的工作是擋住打錯的數字,不是替設計師決定強度。
 */
export const BANKED_COEFF_MAX = 1;

/** 單次存款加成的絕對傷害天花板。1200 ≈ 出貨生命倍率 9 下的一條滿血。 */
export const BANKED_BONUS_MAX = 1200;

/** 存款能活多久。跟 `applyBuff.duration` 的量級一致;超過就是設定錯了。 */
export const BANKED_LIFE_MAX_SEC = 60;

/**
 * Ceiling on `cycleBuff.steps`. A rotation is a READABLE thing — the player has
 * to be able to feel 「輪到防禦了」 — and past a handful of steps the ring is
 * indistinguishable from randomness while costing one live ModifierSource per
 * step on every rotating body. 8 matches `CONDITION_MAX_CHILDREN`, the other
 * "how many of these can a human hold in their head" bound in this codebase.
 */
export const CYCLE_BUFF_MAX_STEPS = 8;

/**
 * CROSS-FIELD checks that a `z.discriminatedUnion` member cannot carry itself:
 * `.superRefine` turns an object into `ZodEffects`, and `discriminatedUnion`
 * only accepts `ZodObject`s. So the refinement rides {@link zEffectDef} — the
 * lazy wrapper every document actually validates through (`zHookDef.effects`,
 * `ability@1`, `item@1.passive`, `auras[].hooks`). `zEffectDefUnion` stays a
 * pure discriminated union so the editor's `walkZod` still sees the variant
 * list (apps/editor/src/form/walk.ts) and the three template tests that call
 * `zEffectDefUnion.parse` directly keep working.
 *
 * Today it enforces the two `grantAttribute.store` pairings — see the field.
 */
/**
 * 資源百分比項 —— `damage.resourcePct` 與 `dot.resourcePct` **共用同一份 schema**,
 * mirroring `ResourcePctTerm` in sim/effects/dynamicTerms.ts(那裡有完整推導:
 * 為什麼它不是 `Scaling` 的一部分、`scale` 的兩種讀法差在哪、兩個上界為什麼
 * 不同)。一份 schema 而不是兩份,理由跟 sim 端一樣:四支道具要的是同一個讀數,
 * 抄成兩份保證有一天只修到一邊。
 *
 * 每一格 `perRank` 的上界由 `scale` 決定,所以夾在 `superRefine` 裡而不是
 * `z.number().max(...)` 上 —— 兩種模式的自然量級差 100 倍以上,共用一個上界
 * 對其中一邊必然太鬆(擋不住打錯的數字)。
 */
export const zResourcePctTerm = z
  .object({
    /** 讀誰的條:施法者自己,還是這次事件的對象 */
    subject: z.enum(["self", "target"]),
    resource: z.enum(["health", "mana"]),
    /** 現存 / 最大 / 已損失(= 最大 − 現存) */
    basis: z.enum(["current", "max", "missing"]),
    /** 省略 = "ratio" = 係數 × 絕對量。"points" = 係數 × 百分比本身(0~100) */
    scale: z.enum(["ratio", "points"]).optional(),
    /**
     * `.min(1)`:同 `hpPct` / `incomingPct` 的反空欄位規則 —— 一個空陣列解算成 0,
     * 長得像功能、實際上什麼都不做。
     */
    perRank: z.array(z.number().min(0)).min(1),
  })
  .strict()
  .superRefine((t, ctx) => {
    // ⭐ 上界看**兩件事**：模式(ratio/points)與**主體**。讀自己的條寬,讀對方
    //    的條緊 —— 完整理由在 `dynamicTerms.ts` 的 `RESOURCE_PCT_RATIO_SELF_MAX`。
    const cap =
      (t.scale ?? "ratio") === "points"
        ? RESOURCE_PCT_POINTS_MAX
        : t.subject === "self"
          ? RESOURCE_PCT_RATIO_SELF_MAX
          : RESOURCE_PCT_RATIO_MAX;
    t.perRank.forEach((v, i) => {
      if (v > cap) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["perRank", i],
          message:
            `scale:"${t.scale ?? "ratio"}" 的係數上限是 ${cap}(拿到 ${v})—— ` +
            "這是打錯數字的守衛:ratio 模式寫 5 而不是 0.05 是「對方整條的 500%」, " +
            "points 模式寫 100 而不是 1 是 10,000 點。兩種在 diff 裡都跟正確值長得一樣。",
        });
      }
    });
  });

/**
 * `shape` 與幾何欄位的**交叉檢查**（A4b / E1）。
 *
 * ⚠️ 為什麼是**載入時**的解析錯誤而不是執行期的靜默退化：
 * 一份 `{kind:"dispel", shape:"circle"}` 沒寫 radius 的文件，在執行期
 * `radius ?? 0` → `radius <= 0` → **直接 return**。技能放得出來、動畫演完、
 * 什麼都沒發生，而且沒有任何訊息 —— 失敗形態 ②。
 */
export function refineDispelShape(
  e: Extract<
    EffectDef,
    {
      kind:
        | "dispel"
        | "shieldBreak"
        | "devour"
        // Lane 1（2026-08-08）：四個新 kind 用同一組幾何欄位，所以用**同一份**
        // 檢查。各寫一份的那一天它們會分岔，而每一份看起來都對。
        | "modifyCooldown"
        | "weightedBranch"
        | "swapResource"
        | "eventValueConversion"
        // Lane 2（2026-08-08）：同一組幾何欄位 → **同一份**檢查。
        // ⛔ `randomArea` 2026-08-10 從這裡**拿掉**了 —— 它根本沒有那四格
        // （理由寫在它自己的 schema 註解上：它解的是**落點**不是受害者）。
        | "manaBarrier"
        | "extendBuff"
        // 契約層（2026-08-09，GH#301-2）：`blink` 用**同一組** shape/radius/
        // side/maxTargets，所以走**同一份**檢查。開第二份的那一天它們會分岔，
        // 而兩份看起來都對。
        | "blink"
        // Lane 3（2026-08-10）：`delayed` / `proxyCast` 用**同一組**幾何欄位，
        // 所以走同一份檢查。⛔ 各寫一份的那一天它們會分岔，而每一份看起來都對。
        | "delayed"
        | "proxyCast"
        // [EX∅ 根源]（2026-08-18）：`carry` / `convertTeam` 用**同一組**幾何
        // 欄位（shape + radius + radiusTier），所以走同一份檢查。
        | "carry"
        | "convertTeam"
        // 連鎖閃電（2026-08-19，GH#451）：`shape` + `radius` 是**同一組**幾何欄位，
        // 所以走同一份檢查。⛔ 各寫一份的那一天它們會分岔，而每一份看起來都對。
        | "chainLightning"
        // 連段 / 吸引（2026-08-22，#541 / #147）：同一組 shape + radius + side +
        // maxTargets，所以走**同一份**檢查。
        | "comboStrikes"
        | "pull"
        // 移動模型特效 / 螢幕回饋 / 特效文字（2026-08-22，#551 · #543 · #549）：
        // 同一組 shape + radius + side + maxTargets，所以走**同一份**檢查。
        // ⛔ 各寫一份的那一天它們會分岔，而每一份看起來都對。
        | "spawnModelFx"
        | "screenFlash"
        | "screenShake"
        | "floatingText";
    }
  >,
  ctx: z.RefinementCtx,
): void {
  if (e.shape === "circle" && e.radius === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["radius"],
      message:
        'shape:"circle" 一定要有 radius —— 沒有半徑的圓在執行期會直接 return，技能放得出來但什麼都不會發生',
    });
  }
  // 反向：單體卻寫了圓的欄位 = 作者以為自己設定了範圍，而那三格沒有人讀。
  // ⚠️ 透過 index signature 讀，⛔ 不是 `e[k]`：這一族現在包含
  // `convertTeam`，而它**沒有** `side` / `maxTargets`（它的名額軸是 `maxHeld`）。
  // 直接索引一個聯集會讓 TS 要求**每一個**成員都有那三格 —— 而為了讓型別過
  // 就去補兩個沒有人讀的欄位，正是「畫得出來、引擎讀不到」那個失敗形態。
  // 缺席的鍵讀出 `undefined`，也就是「作者沒填」，語意逐字不變。
  const bag = e as unknown as Record<string, unknown>;
  for (const k of ["radius", "side", "maxTargets"] as const) {
    if (e.shape === "single" && bag[k] !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [k],
        message: `shape:"single" 讀不到 ${k} —— 要用範圍請改成 shape:"circle"，否則這一格是一個看起來有設、其實沒有人讀的數字`,
      });
    }
  }
}

/**
 * ⭐ 0..255 三格的顏色 —— `screenFlash.colorRgb` 與 `floatingText.colorRgb`
 * **共用同一份**（#543 / #549）。⛔ 兩份的那一天其中一份會少一條界，
 * 而它跟正確的長得一模一樣。
 *
 * ⚠️ 刻意是 `z.tuple` 而不是 `z.array(...).length(3)`：前者的推導型別是
 * `[number, number, number]`，逐格對得上 `sim/effects/variants/*.ts` 的 TS 宣告
 * （`content/compat.test.ts` 在守兩邊一致）；後者推成 `number[]`，於是那份
 * 型別對帳會靜默地少一層精度。
 */
export const zRgb = z.tuple([
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255),
]);

/**
 * 三個「送到客戶端的提示」kind（`screenFlash` / `screenShake` / `floatingText`）
 * 共有的**死旋鈕**檢查。
 *
 * 它們的幾何欄位（`shape:"circle"` + `radius` …）**只有 `applyTo:"victim"`
 * 讀得到** —— `self` 是施法者一個人、`all` 是全場，兩者都不會去解那個圓。
 * 所以「圓 + applyTo:self」是一個作者以為自己設定了範圍、而執行期沒有人讀的圓：
 * 卡片上看起來是一發全場震動，場上只有施法者的畫面在動（失敗形態②）。
 *
 * ⚠️ 反方向（`applyTo:"victim"` 卻寫 `shape:"single"`）**是合法的**，
 * 而且是最常見的寫法：`single` = 沿用上游解好的目標（掛在 `damage` 之後或
 * hook 上的那一份），⛔ 不是「沒有目標」。
 */
export function refineCueGeometry(
  e: Extract<EffectDef, { kind: "screenFlash" | "screenShake" | "floatingText" }>,
  ctx: z.RefinementCtx,
): void {
  // ⭐ GH#838 N3 —— `nearby` 也讀那個圓（`cueRecipients` 的新分支：圓內敵我都算）。
  //    ⚠️ 反過來也要成立：`nearby` **沒有**圓就沒有「範圍限定」可言 ⇒ 那是一個
  //    看起來限了範圍、實際退化成「上游解析好的名單」的宣稱（同一個病的鏡像）。
  const READS_CIRCLE = new Set(["victim", "nearby"]);
  const mode = (e as { applyTo?: string }).applyTo ?? "self";
  if (e.shape === "circle" && !READS_CIRCLE.has(mode)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["shape"],
      message:
        `applyTo:"${mode}" 讀不到 shape:"circle" —— 只有 applyTo:"victim"／"nearby" 會去解那個圓，` +
        "現在這一格是一個看起來有設定範圍、其實沒有人讀的圓",
    });
  }
  if (mode === "nearby" && e.shape !== "circle") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["applyTo"],
      message:
        'applyTo:"nearby" 需要 shape:"circle" ＋ radius —— 沒有圓的「附近」' +
        "會退化成上游解析好的名單，而那與 applyTo:\"victim\" 逐位元相同（一個看起來限了範圍、其實沒限的宣稱）",
    });
  }
}

/**
 * 格擋 —— mirrors `BlockGrant` in `sim/combat/block.ts`, which is where the
 * mechanism, the WC3 evidence and every one of these six axes is argued out.
 *
 * ⚠️ 它住在**這一支**而不是 `schema/item.ts`,理由跟 {@link zVisionGrant} /
 * {@link zFlightGrant} 住在這裡一模一樣:授予它的**不只有道具**。
 * `zAbilityPassiveRank` 也要用同一份(20-00 銀色甲胄「30%機率格擋 100% 魔法傷害」
 * 是 Saber 的天生技,79-002 虛化是卍解狀態下的物理格擋),而 `schema/item.ts`
 * import 這一支 —— 反過來 import 會closed 一個真的模組循環,兩份定義則會 drift。
 * `zItemBlockGrant` 就是這一個常數的別名,不是第二份。
 *
 * 一組軸、三種讀法(道具那三支的實際值列在 `schema/item.ts` 的 `zItemBlockGrant`):
 *   平擋   `{damageTypes:["physical","magic"], chance:0.5, fraction:1}`
 *   限型別 `{damageTypes:["magic"],            chance:0.3, fraction:1}`
 *   保命   `{…, lethalOnly:true, internalCooldown:1}`
 *
 * ⚠️ 上下界不是裝飾,每一個都擋一種真的會發生的誤植:
 *   · `chance` / `fraction` 上界 **1** —— 文案寫的是「30%」「50%」,而一個把
 *     百分比直接抄進來的 `0.3 → 30` 在沒有上界時就是**永遠觸發**(`chance`)或
 *     **把傷害變成治療**(`fraction > 1` ⇒ `impact - cut < 0`)。上界 1 讓這種
 *     誤植在**載入時**就紅,而不是在某一場比賽裡變成一個無敵的玩家。
 *   · `chance` / `fraction` 下界 **>0**(`.positive()`)—— `0` 是一個合法但
 *     **會說謊**的值:卡片上寫著 [格擋],骰子照抽、擋格語音照喊,傷害一點沒少。
 *   · `damageTypes` 必填且 `.min(1)` —— 「真實傷害無法阻擋」必須是這個陣列的
 *     內容,不是程式裡的一行 `if`;而空陣列是一個永遠不會觸發的格擋。
 *   · `internalCooldown` 上界 **300 秒** —— owner 對道具選的是 1 秒,w3x 原作
 *     那兩支是 Cool 45 / Cool 100,所以 300 是「這是誤植不是設計」的那條線,
 *     不是平衡政策。下界 0 是合法且有意義的(= 沒有冷卻),所以是 `.min(0)`。
 */
export const zBlockGrant = z
  .object({
    damageTypes: z
      .array(zDamageType)
      .min(1)
      .describe(
        "這個格擋擋得住哪些傷害型別。想表達「真實傷害無法阻擋」就**不要**把 true 列進來 —— " +
          "擋不擋真傷是這個欄位的內容,不是寫死的規則。",
      ),
    chance: z
      .number()
      .positive()
      .max(1)
      .describe("觸發機率,0~1(0.5 = 50%)。每一發合格的傷害各抽一次,抽中才擋。"),
    fraction: z
      .number()
      .positive()
      .max(1)
      .describe(
        "抽中時擋掉這一發的幾成,0~1(1 = 整包擋掉)。擋掉的部分不會進護盾池,也不會扣血;" +
          "沒擋掉的部分照常走護盾與血條。",
      ),
    lethalOnly: z
      .boolean()
      .optional()
      .describe(
        "只擋「會殺死我」的那一發(抵擋致命一擊)。留空 = 每一發合格的傷害都可能被擋。",
      ),
    lethalBasis: z
      .enum(["hp", "hpAndShields"])
      .optional()
      .describe(
        "致死怎麼算:hpAndShields(預設)= 血 + 這一發吃得到的護盾,也就是「這一發真的會殺死我嗎」;" +
          "hp = 只看血條(文案的字面讀法)。只有 lethalOnly 打開時才有意義。",
      ),
    internalCooldown: z
      .number()
      .min(0)
      .max(300)
      .optional()
      .describe(
        "內部冷卻(秒):這個來源擋中一次之後,要隔多久才能再擋一次。留空 / 0 = 沒有冷卻," +
          "每一發合格的傷害都各抽一次。抽輸不會進冷卻,只有真的擋中才會。",
      ),
      // ── ⭐ GH#650 「擋下的那一瞬間沒有特效」（owner 說過**兩次**）──────────────
      // ⚠️ ⭐ 為什麼是**一道機制**而不是替初號機寫一個 if（第〇·五守則）:
      //   施法者側的特效走 `spawnVfx` / `spawnModelFx`,那些都掛在**技能施放**上;
      //   ⛔ 而「這一發被擋下」發生在 `sim/combat/damage.ts` 的**減傷鏈中途**,
      //   那裡在此之前**沒有任何內容驅動的特效出口** ⇒ 所有格擋長一模一樣。
      // ⚠️ ⭐ **刻意用 `z.string()` 而不是 `zRef("vfx")`** —— `_shared.ts` 不 import
      //   參照工具（那會關上一個循環）。⛔ 而 2026-08-31 實測:在這裡寫 `zRef(...)`
      //   讓它變成 `any` ⇒ **整個 `zBlockGrant` 的推導退化成 `unknown`** ⇒ 型別漂移閘紅。
      //   ⇒ 參照的存在性由**內容驗證**那一層守（與其他 `vfxId` 欄位同一條路）。
      vfxId: z
        .string()
        .min(1)
        .optional()
        .describe(
          "⭐ 擋下的那一瞬間放什麼特效(掛在**被擋的那個人**身上)。留空 = 維持泛用的格擋火花。" +
            "⚠️ 它**取代**泛用火花,⛔ 不是疊在上面 —— 疊起來會變成一次擋兩發。",
        ),
      vfxScale: z
        .number()
        .positive()
        .max(20)
        .optional()
        .describe("上面那份特效的縮放。留空 = 1(用特效自己的尺寸)。"),
      vfxTint: z
        .tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)])
        .optional()
        .describe(
          "上面那份特效的染色 [r,g,b] 0–255。留空 = 不染色。" +
            "⚠️ 它乘進 diffuse,所以一份本來就有顏色的特效會被**再乘一次**。",
        ),
  })
  .strict();

/**
 * 型別連擊免疫（史萊姆裝「連續受到 2 次同型別傷害後免疫該型別」）——
 * mirrors `TypeStreakImmunityGrant` in `sim/combat/typeStreakImmunity.ts`。
 *
 * ⚠️ 它住在**這一支**而不是 `schema/item.ts`，理由與 {@link zBlockGrant} 逐字
 * 相同：授予它的不只有道具（`SOURCE_GRANT_SHAPE` 展開它，所以天生技 rank /
 * 三選一增益卡 / `applyBuff` 的限時來源同時拿得到）。`zItemTypeStreakImmunity`
 * 是這一個常數的**別名**，⛔ 不是第二份。
 *
 * ⚠️ 每一個上下界都擋一種真的會發生的誤植：
 *   · `damageTypes` **必填**且 `.min(1)` —— 沿用 `zBlockGrant.damageTypes` 的
 *     判例：「真傷算不算連擊」是這個陣列的**內容**，不是程式裡的一行 `if`。
 *     一個預設值會把這張卡唯一講清楚的事變成要去翻別的檔案的問題。
 *   · `threshold` 上界 {@link TYPE_STREAK_MAX_THRESHOLD} —— 見那裡。
 *   · `streakTimeoutSec` —— **安全閥**。免疫本身沒有到期 tick，面對一波純物理
 *     的殭屍就是無限免疫，而 `zInvulnerable.durationSec` 已經寫過
 *     「an unbounded immunity is an unwinnable round」。缺席 = 永不逾時，
 *     出貨要不要填數字是 owner 的平衡決定。
 */
export const zTypeStreakImmunityGrant = z
  .object({
    damageTypes: z
      .array(zDamageType)
      .min(1)
      .max(3)
      .describe(
        "哪幾種傷害會被計進連擊、並在達標後被免疫。想表達「真實傷害不列入」就**不要**把 true 列進來 —— " +
          "算不算真傷是這個欄位的內容,不是寫死的規則。",
      ),
    threshold: z
      .number()
      .int()
      .min(1)
      .max(TYPE_STREAK_MAX_THRESHOLD)
      .describe("連續受到幾發**同一型別**的傷害之後開始免疫該型別。卡片上的「連續 2 次」= 2。"),
    resetMode: z
      .enum(["restart", "zero"])
      .optional()
      .describe(
        "來了**不同型別**的一發時,那一發自己算不算新連擊的第 1 發:" +
          "restart(預設,內文的自然讀法)= 算,連擊立刻變成「新型別 ×1」;" +
          "zero = 不算,連擊歸零,要下一發才開始數。",
      ),
    streakTimeoutSec: z
      .number()
      .positive()
      .max(TYPE_STREAK_MAX_TIMEOUT_SEC)
      .optional()
      .describe(
        "連擊多久沒被續上就歸零(秒)。留空 = 永不逾時 —— 面對一波純物理的殭屍那就是無限免疫,所以這一格是安全閥。",
      ),
  })
  .strict();

/**
 * 暴擊來源 —— mirrors `CritStrikeGrant` in `sim/combat/critStrike.ts`, which is
 * where the mechanism and every one of these five axes is argued out.
 *
 * ⭐ **這一格就是 owner #299 第 2 條要的那根軸。** 他說暴擊「分 % 幾倍傷害,
 * 不是純暴擊數字累加,反而像是多個獨立技能判斷」——「合成規則」那一半
 * 2026-08-09 已經做完了(`sim/critRules.ts` 的 `stackMode: "multiply"`,
 * 每一條各抽各的骰、倍率相乘);剩下的那一半是**作者要寫得出「一條自己的機率
 * + 自己的倍率」的來源**,而那就是這個物件。
 * ⛔ 它不是 `Stat.CritChance` / `Stat.CritDamage` 兩條屬性的第三種寫法:
 * 那兩條是**聚合**的,加下去之後這位英雄的每一次暴擊都變成那個倍率,
 * 「6% 的那一次是 10 倍」在結構上寫不出來(`critStrike.ts` 檔頭 ①)。
 *
 * ⚠️ 它住在**這一支**而不是 `schema/item.ts`,理由與 {@link zBlockGrant}
 * 一模一樣:授予它的不只有道具。`zItemCritStrike` 是這一個常數的**別名**,
 * 不是第二份 —— 兩份會 drift,而 drift 的那一天兩邊的測試各自只看自己那一半。
 *
 * ⚠️ 上下界不是裝飾,每一個都擋一種真的會發生的誤植:
 *   · `chance` 上界 **1** —— 文案寫的是「6%」,一個把百分比直接抄進來的
 *     `0.06 → 6` 在沒有上界時就是**每一發都 10 倍而且回滿血**。
 *   · `chance` 下界 `.positive()` —— `0` 是一個合法但**會說謊**的值:
 *     卡片上寫著 [暴擊],骰子照抽,什麼都不會發生。
 *     `lifestealFraction: 0` 反而是合法且有意義的(只給倍率、不給吸血),
 *     所以那一格的下界是 0 不是正數。
 *   · `damageMult` 下界 **1** —— 小於 1 的「暴擊」比普通攻擊還弱,
 *     那不是平衡選擇,那是把 10 打成 0.1。
 *   · `damageMult` 上界 **50** —— 出貨最強是 10(天堂之劍)。50 是
 *     「這是誤植不是設計」的那條線,不是平衡政策。
 */
export const zCritStrikeGrant = z
  .object({
    chance: z
      .number()
      .positive()
      .max(1)
      .describe("觸發機率,0~1(0.06 = 6%)。每一次普攻(近戰揮擊/遠程射出)各抽一次。"),
    damageMult: z
      .number()
      .min(1)
      .max(50)
      .describe(
        "抽中時**這一條**貢獻的倍率(10 = 10倍),不是加在暴擊傷害屬性上的增量。" +
          "和英雄自己的暴擊傷害、以及其他抽中的暴擊來源**相乘**(owner 2026-08-09," +
          "後台『暴擊規則』的 stackMode 可改),總倍率再夾在該頁的上限。",
      ),
    lifestealFraction: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "抽中時吸回**真的從血條掉下來的量**的幾成,0~1(1 = 100%)。" +
          "打在護盾上被吃掉的部分不算,和一般吸血同一個基數。",
      ),
    empowers: z
      .enum(["ownProcOnly", "everyCrit"])
      .optional()
      .describe(
        "倍率與吸血套用在哪些暴擊上:ownProcOnly(預設)= 只有這個來源自己抽中的那一發;" +
          "everyCrit = 這一發只要是暴擊就算(包含英雄自己暴擊率骰出來的)。" +
          "預設選較弱的那一個 —— 一個已經堆滿暴擊率的英雄不會因為撿到它就整場 10 倍。",
      ),
    lifestealMode: z
      .enum(["replace", "add"])
      .optional()
      .describe(
        "這一發的吸血怎麼結合持有者原本的吸血:replace(預設)= 直接用上面那個比例;" +
          "add = 加在原本的吸血上面。預設 replace 是較弱的那一個。",
      ),
  })
  .strict();

/**
 * ⭐ **一個來源可以攜帶的「非屬性」授予** —— 一份,不是四份(第零守則⑨)。
 *
 * `ModifierSource` 上有一族東西不是 `Stat` 上的數字:格擋與暴擊來源。
 * 兩者的共同性質是 `sim` 端**完全不看 `kind`** —— `combat/block.ts::blockCutFor`
 * 與 `combat/critStrike.ts::rankedGrants` 都只走 `StatsComp.sources`。
 * 所以「哪一種來源授予得起」從來不是引擎的限制,而是**授權格**的限制:
 * schema 上有沒有這一格 + 建構那個 source 的地方有沒有轉發。
 *
 * ⛔ 所以它是一個**展開的常數**,不是抄四次:
 * `applyBuff`(限時授予 / 主動技能)、`zAbilityPassiveRank`(天生技與被動)、
 * `zAugmentDef`(三選一增益卡)、`zItemDef`(道具)全部展開同一份。
 * 下一個「騎在來源上的授予」加在這裡一格,四個授權面自動全部拿到。
 *
 * ⚠️ 道具那一面歷史上先落地,所以 `schema/item.ts` 仍然逐格寫(它還帶著
 * `zItemBlockGrant` / `zItemCritStrike` 兩個別名給既有守衛用),但**指向的是
 * 同一個 ZodObject 實例** —— 不是第二份定義。
 *
 * ⚠️ 轉發那一半在 `sim/stats/sourceGrants.ts::sourceGrants()`,同樣是一份。
 */
/**
 * 三圍 (力/敏/智) 授予 —— 定義**搬到這裡**（2026-08-09，GH#299 第 6 條的第二批）。
 *
 * ⚠️ 它以前住在 `schema/item.ts` 叫 `zItemAttributes`，搬家的理由與 `zBlockGrant`
 * 2026-08-08 那一次逐字相同：授予它的不只有道具。`item → effect` 是單向 import，
 * 所以要讓 `SOURCE_GRANT_SHAPE` 展開得到它，定義就必須住在這一側；item.ts 留一個
 * 別名（既有守衛用 `zItemAttributes.shape` 數欄位）。
 *
 * 每一格都 optional 而整體 `.refine` 拒絕 `{}`：一個空的授予區塊看起來有 author 過
 * 卻一毛不付，正是這一族要關的洞。上下界的推導（下界 0 是因為大負敏會經由那唯一
 * 一條乘法推導把攻速靜默歸零；上界 500 是打錯數量級的守衛，不是平衡意見）住在
 * `sim/stats/attributes.ts`，⛔ 這裡只引用常數。
 *
 * ⚠️ NOT `.int()` —— 能力屬性強化三選一每張付 0.1–2.0（#260），小數三圍在一場
 * 比賽裡本來就是常態。
 */
export const zAttrGrant = z
  .object({
    str: z.number().min(ATTR_GRANT_MIN).max(ATTR_GRANT_MAX).optional(),
    agi: z.number().min(ATTR_GRANT_MIN).max(ATTR_GRANT_MAX).optional(),
    int: z.number().min(ATTR_GRANT_MIN).max(ATTR_GRANT_MAX).optional(),
  })
  .strict()
  .refine((a) => a.str !== undefined || a.agi !== undefined || a.int !== undefined, {
    message: "attributes must grant at least one of str/agi/int",
  });

/**
 * 傷害型別轉換（無視防禦 / 真實傷害家族）—— 同樣從 `schema/item.ts` 搬過來，
 * 同樣的理由。四個欄位各自的完整推導留在 `schema/item.ts` 的別名註解與
 * `sim/combat/damageTypeOverride.ts` 檔頭，⛔ 不在這裡抄第二份。
 */
export const zDamageTypeOverrideGrant = z
  .object({
    scope: z
      .enum(["basic", "ability", "all"])
      .describe(
        "換哪些傷害:basic = 普通攻擊(近戰與遠程投射物都算)、" +
          "ability = 技能,含技能留下的延燒/中毒每一跳、" +
          "all = 這個來源的持有者打出去的每一發(額外含道具觸發、小怪與守衛塔封包)。",
      ),
    becomes: zDamageType.describe(
      "換成什麼型別。true = 真實傷害(完全跳過護甲與魔抗,而且只有不指定型別的護盾吃得到)。",
    ),
    applyAt: z
      .enum(["afterGates", "beforeGates"])
      .optional()
      .describe(
        "什麼時候換。afterGates(預設)= 無敵/免疫與閃避先用原本的型別判定,轉換只影響護甲魔抗與護盾;" +
          "beforeGates = 連免疫與閃避也用新型別判定(例:被轉成真傷的法術,魔法免疫就擋不住了)。",
      ),
    impactType: z
      .enum(["original", "converted"])
      .optional()
      .describe(
        "換完之後,擊倒判定讀哪一個型別。original(預設)= 讀轉換前的型別 —— " +
          "被轉成真傷的法術跳過魔抗,但不會因此多出一個它本來沒有的擊倒;" +
          "converted = 讀轉換後的型別,也就是「轉真傷順便附贈擊倒」。",
      ),
  })
  .strict();

/**
 * 飛行 (無視碰撞) grant on a passive rank — mirrors `FlightGrant` in
 * sim/flight.ts.
 *
 * ⚠️ `stayInsideBoundary` DEFAULTS TO TRUE and that default is the whole safety
 * story: without it 「無視碰撞」 walks 莉娜因巴斯 off the 24-unit arena disc, and
 * every zone-scoped mechanic (duel resolution, teamAliveInZone, the minimap)
 * then reasons about a champion who is nowhere. Turning it off is a deliberate
 * authoring act, not a default anybody falls into.
 *
 * `hoverHeight` is presentation only (it rides the existing `EntityState.h`
 * channel) and is bounded on BOTH ends: a champion floating 40 units up is off
 * the top of a fixed-pitch camera, i.e. invisible, which reads as the model
 * failing to load rather than as a feature.
 */
export const zFlightGrant = z
  .object({
    hoverHeight: z.number().min(0).max(FLIGHT_MAX_HOVER_HEIGHT).optional(),
    ignoreUnits: z.boolean().optional(),
    ignoreObstacles: z.boolean().optional(),
    stayInsideBoundary: z.boolean().optional(),
  })
  .strict();

/**
 * 隱形 / 真視 grant — mirrors `VisionGrant` in sim/stealth.ts.
 *
 * ⚠️ 這一份**定義的位置**是承重的：它被 {@link SOURCE_GRANT_SHAPE} 展開，而那是
 * 一個模組載入當下就求值的 `const`。定義留在檔案下半部時，展開那一行會撞上
 * `zVisionGrant` 的 TDZ 而讓整個 `schema/index.ts` 在 import 時當場 TypeError
 * （與 `zAuraDef` 那一段檔頭記錄的是同一族陷阱）。⛔ 不要把它搬回去。
 *
 * BOTH numbers are PORTED, not invented, and both have an upper bound because a
 * missing ceiling is how a mis-parse ships (#277):
 *
 *   · `stealthFadeDelaySec` — the w3x `Dur`/`HeroDur` column of WC3 Permanent
 *     Invisibility (`Apiv`), which for that ability is the FADE TIME. 27-00
 *     永久性的隱形術 ships 4.0, matching its own prose 「在4秒內不做任何攻擊或
 *     施法動作」. Cap 60 s: anything longer is a hero who never goes invisible
 *     inside a 3-minute round, i.e. a typo that would read as the feature being
 *     broken. 0 is legal and means "hidden the instant you stop acting".
 *   · `trueSightRadius` — sim units, so the w3x `cast_range` divided by the
 *     usual 54.5 (`Atru` 16-00 通靈能力: 500 → 9.17). Cap 40, the same
 *     mis-parse guard `zAuraDef.radius` uses and for the same reason: the whole
 *     zone is `boundaryRadius: 24`, so >40 is almost certainly a raw WC3 number
 *     that leaked through unconverted.
 */
export const zVisionGrant = z
  .object({
    stealthFadeDelaySec: z.number().min(0).max(60).optional(),
    trueSightRadius: z.number().positive().max(40).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.stealthFadeDelaySec !== undefined || v.trueSightRadius !== undefined,
    {
      message:
        "vision grant must carry at least one of stealthFadeDelaySec / trueSightRadius",
    },
  );

/**
 * 【死亡遺留】—— 「帶著這份來源的人在場時，同區有英雄陣亡就在屍體原地留下一個
 * 持久的光環物件」。71-00 暗夜契約的**暗夜旗**是出貨的那一支。
 *
 * ⭐ 2026-08-19（CLAUDE.md 第〇·五守則）—— 這一格是**把一份專屬程式收編成資料**。
 * 在它之前，這整套機制住在 `sim/nightPact.ts`，參數住在
 * `config.arena-rules@1.nightPact`，而那個區塊的第一格是
 * `abilityIds: ["godie-u00k.passive"]` —— 引擎被一支技能的 id 綁死，
 * 於是 71-00 的 `passive.ranks[0].modifiers` 是**空的**，
 * castability 普查每一次跑都量出一格 ❌（而那個 ❌ 說的是實話）。
 *
 * ⛔ 每一格的上下界都是 MIS-PARSE 護欄，不是平衡意見：
 *   · `radius` ≤ 40 —— 與 `zAuraDef.radius` 同一條（決鬥區的 `boundaryRadius`
 *     是 24，超過 40 的一律是沒換算的 WC3 原始數字）。
 *   · `maxPerZone` ≤ 64 —— 一場 12 人的團滅留不下 65 個遺留物；更大的數字
 *     是打錯數量級，而它的代價是每 tick 的 O(遺留物 × 英雄) 迴圈。
 *   · `modifiers` `.min(1)` —— 一個什麼都不給的遺留物看起來 author 過卻一毛不付，
 *     正是第一·五守則要關的那族洞。
 */
export const zDeathWardGrant = z
  .object({
    radius: z
      .number()
      .positive()
      .max(40)
      .describe("遺留物光環的半徑（GGD 單位）。站進這個圈才吃得到下面的加成。"),
    maxPerZone: z
      .number()
      .int()
      .min(1)
      .max(64)
      .describe("同一座競技場裡同時最多幾個遺留物。滿了之後再有人陣亡就不再留下新的。"),
    beneficiary: z
      .enum(["owner", "team"])
      .describe(
        "誰吃得到這一圈：owner = 只有帶著這支技能／這件道具的人自己；team = 他整隊。" +
          "⚠️ 這不是隊伍光環（那要用 auras），它問的是「誰帶著這份來源」。",
      ),
    stacking: z
      .enum(["max", "add"])
      .describe(
        "多個遺留物重疊時：max = 只算一份（站在三個圈裡和站在一個圈裡一樣）；" +
          "add = 每一個都算（三個圈就是三倍）。一場團滅會留下很多個，所以這是真的平衡決定。",
      ),
    modelKey: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe("遺留物在畫面上用哪一份模型。留空 = 暗夜旗（prop.night-flag）。"),
    modifiers: z
      .array(zStatModifier)
      .min(1)
      .describe(
        "站在圈內的受益者吃到的加成。⚠️ 與這一階自己的 modifiers 是**兩件事**：" +
          "那一份是持有者常駐，這一份是站進圈裡才有。",
      ),
  })
  .strict();

export const SOURCE_GRANT_SHAPE = {
  block: zBlockGrant.optional(),
  /**
   * ⭐ 2026-08-19 —— 第九格，見 {@link zDeathWardGrant}。
   * 讀它的是 `sim/deathWard.ts`，而它走 `StatsComp.sources` 且不問 `kind`，
   * 所以天生技 rank / 切換技開著的期間 / 道具 / 增益卡 / `applyBuff` 的限時來源
   * 五個授權面同時拿得到，⛔ 不需要第二次接線。
   */
  deathWard: zDeathWardGrant.optional(),
  critStrike: zCritStrikeGrant.optional(),
  /**
   * ⭐ 2026-08-18（GH#373）—— **限時**隱形 / 真視。**又是同一個授權格**，
   * 而且是這一族裡引擎最早就準備好的那一格：`sim/stealth.ts::syncVisionGrants`
   * 從 2026-07-30 起每 tick 掃 `StatsComp.sources` 找 `src.vision`、**不問
   * `kind`**，而且**已經在跳過過期的 source**（`expiresAtTick <= world.tick`
   * 那一行）。所以「隱身 20 秒」到期由那份 buff 自己收掉，⛔ 不需要第二支掃描器。
   *
   * 擋住它的一直只有 schema：`vision` 在此之前只掛得到**道具**（永久佩戴）與
   * **天生技 rank**（rank>0 之後永久），於是 53-00 空間穿梭「持續 20 秒」與
   * 30-00 攝影機「可以看到隱形部隊」在引擎裡沒有形狀 —— 兩支的整棵效果樹因此
   * 只剩一個 `spawnVfx`（GH#373，第一·五守則的形狀）。
   */
  vision: zVisionGrant.optional(),
  /**
   * ⭐ 2026-08-09 —— G7 的第三、第四格。**引擎從第一天就不看 `kind`**（真的跑過
   * 模擬：把 `attributes` 掛在 `kind:"buff"/"augment"/"passive"` 的來源上，
   * `stats/attrSources.ts::sourceAttrGrants` 照樣把 24 力加成 54；把
   * `damageTypeOverride` 掛在同樣三種上，`combat/damageTypeOverride.ts::
   * resolveDamageConversion` 照樣回 `"true"`）。擋住「這支大招期間三圍 +30」
   * 「這張卡讓你的普攻變真傷」的**只有**這兩格 schema 與轉發。
   */
  attributes: zAttrGrant.optional(),
  damageTypeOverride: zDamageTypeOverrideGrant.optional(),
  /**
   * ⭐ 2026-08-09 —— S11（GH#299）的第一半，**又是同一個授權格**。
   *
   * `ModifierSource.flight` 早就存在，而 `sim/flight.ts::flightSystem` 每 tick
   * 掃 `StatsComp.sources` 找它、**不問 `kind`**（那份檔頭自己寫著「NOTHING else
   * reads it」）。擋住「限時飛行」的只有 schema：`flight` 在此之前只掛得到
   * `ability@1.passive.ranks[].flight`，而被動一旦到 rank>0 就是**永久**的 ——
   * 於是 77-03 的「翅膀 6 秒」只能靠 `whileForm` 閘去繞，結果 rank 4 的加速活
   * 15 秒、翅膀只有 6 秒，兩個本來該同時結束。
   *
   * 開在這裡（而不是 `applyBuff` 自己一格）的好處是它一次落在**四個授權面**上：
   * 道具、天生技 rank、增益卡、`applyBuff` —— 而一份限時的 `applyBuff` source
   * 到期時 `flight` 跟著整個 source 一起消失，⛔ 不需要第二支到期掃描器。
   */
  flight: zFlightGrant.optional(),
  /**
   * ⭐ 2026-08-12 —— [穿透]（LoL 四段的段③④）。**又是同一個授權格**：
   * `sim/combat/penetration.ts::resolvePenetration` 走 `StatsComp.sources` 而
   * **不問 `kind`**，所以「這張三選一卡讓你的普攻穿 30% 護甲」「這支大招期間
   * 無視魔抗 8 秒」擋住它的只有這一格 schema 與 `sourceGrants()` 的轉發。
   *
   * ⚠️ 定義住在 `schema/mitigationDoc.ts` 而不是這裡，因為它的上下界要從
   * `sim/combat/penetration.ts` import（⛔ 不抄字面值）。
   */
  penetration: zPenetrationGrant.optional(),
  /**
   * ⭐ 2026-08-18 —— [型別連擊免疫]（史萊姆裝）。**又是同一個授權格**：
   * `combat/typeStreakImmunity.ts` 走 `StatsComp.sources` 而**不問 `kind`**，
   * 所以「這張三選一卡讓你連吃兩發物理後免疫物理」「這支大招期間對魔法連擊
   * 免疫」擋住它的只有這一格 schema 與 `sourceGrants()` 的轉發。
   * ⛔ 少了後者 = schema 畫得出來、引擎永遠讀不到（失敗形態②）。
   */
  typeStreakImmunity: zTypeStreakImmunityGrant.optional(),
  /**
   * ⭐ M5(2026-08-23) —— 【紮根】**不能移動，但可攻擊、可施法**。第十格授予。
   *
   * owner 2026-08-13 逐字：「應該是**狀態改變，類似定身**（可攻擊跟施展技能但
   * 不能移動），並非把移動速度調整到 0」。
   *
   * ⛔ 它**不是**【定身】(`applyStatus.root`)：那一個是 CC —— 會被【淨化】剝掉、
   * 被免控 buff 拒絕、計進 CC 戰績；紮根三件事一件都不是。⭐ 掛在**來源**上就
   * 結構性地全部成立（`StatsComp.sources` 不走 dispel、不走免控、不進 CC 帳）。
   *
   * 在此之前它是英雄卡上的一格布林（`champion@1.immobile`，全 repo 唯一一格），
   * ⇒「站著不能動」只有**換一整份英雄卡**（＝變身）做得到。
   * 讀它的只有 `sim/movementHold.ts`，而它走 `StatsComp.sources` 且不問 `kind`。
   *
   * ⚠️ 只收 `true`，⛔ 沒有 `false`：一份 `immobile:false` 是「掛得上去卻什麼都
   * 不做」的來源（第一·五守則點名的形狀）。不想要就不要填這一格。
   */
  immobile: z
    .literal(true)
    .describe(
      "紮根：持有這份來源期間**不能移動**，但**可以攻擊、可以施放技能**。" +
        "⛔ 與【定身】不同 —— 它不是控場效果，淨化拔不掉、免控擋不住，也不計進控場戰績。",
    )
    .optional(),
  /**
   * ⭐ M5(2026-08-23) —— **主屬性覆寫**（力→智…）。第十一格授予。
   *
   * `Stat` 上沒有「主屬性是誰」這個數字，所以既有的 modifier 一條都表達不了它 ——
   * 70-00 紮根的變身態把 `attributes.primary` 從 STR 換成 INT，而那個換法在這一格
   * 出現之前**只有換一整份英雄卡**做得到。
   *
   * 詞彙刻意與英雄卡上那一格相同（大寫 STR/AGI/INT），因為它的語意就是覆寫那一格。
   * 讀它的只有 `sim/stats/statPipeline.ts::sourcePrimaryAttribute`。
   */
  primaryAttribute: z
    .enum(["STR", "AGI", "INT"])
    .describe(
      "持有這份來源期間，把這具身體的**主屬性**改成這一個（蓋掉英雄卡上宣告的那一格）。" +
        "影響「每級主屬性加成 / 非主屬性加成」那兩種成長模式。留空 = 照英雄卡。",
    )
    .optional(),
  /**
   * ⭐ M4(2026-08-23) —— **攻擊型態覆寫**（近戰 ↔ 遠程）。第十二格授予。
   *
   * 同前十一格：擋住它的**只有**這一格 schema 與 `sourceGrants()` 的轉發 ——
   * 兩個消費端（`systems/BasicAttackSystem.ts` 與 `stats/statPipeline.ts`）都走
   * `StatsComp.sources` 而**不問 `kind`**，所以掛在 `applyBuff` 生出來的限時來源上
   * 就是「接下來 8 秒你的普攻是遠程」，到期由那份 source 自己的 `expiresAtTick`
   * 收掉，⛔ 不需要第二支掃描器。
   *
   * ⚠️ 詞彙刻意與英雄卡上那一格相同（`champion@1.attackType`），因為它的語意
   * 就是覆寫那一格。⛔ 它與 `item@1.requiresAttackType`（商店的推薦過濾）**不共用**
   * 讀取路徑 —— 理由寫在 `sim/stats/sourceGrants.ts` 的 `attackType` 那一格。
   */
  attackType: z
    .enum(["melee", "ranged"])
    .describe(
      "持有這份來源期間，把這具身體的**攻擊型態**改成這一個（蓋掉英雄卡上宣告的那一格）。" +
        "近戰＝走到身邊揮擊；遠程＝射出一發普攻投射物。也會換掉移動速度吃的環境倍率" +
        "（近戰 `moveSpeedMelee` / 遠程 `moveSpeedRanged`）。留空 = 照英雄卡。",
    )
    .optional(),
  /**
   * ⭐ GH#656(2026-08-24) —— **選擇性狀態免疫**。第十三格授予。
   *
   * owner 逐字：「殭屍王**免疫負面狀態** 包含**暈眩 緩慢 詛咒 致盲** 但
   * **可被吸血、暴擊、淨化跟其他技能標記與疊層**」。
   *
   * ⭐ 分群靠 **`status-effect@1.tags`**，⛔ 不是 `polarity` —— 量到的（44 份
   * 出貨狀態）：帶 `cc` 的 16 份逐字就是 owner 點名的四類（暈眩／緩慢／詛咒／
   * 致盲）加上纏繞恐懼魅惑混亂癱瘓麻痺；不帶的 28 份正是他要**保留**的那一半
   *（破甲／破魔／禁療／重創／連段窗／存款計數）。⇒ ⛔ 不需要新開一個
   * `category` 欄位（第〇·四守則：不要有第二個住處）。
   *
   * 同前十二格：擋住它的只有這一格 schema 與 `sourceGrants()` 的轉發 ——
   * 消費端 `sim/effects/applyStatus.ts` 走 `StatsComp.sources` 而不問 `kind`，
   * 所以天生技 rank（常駐身分）與 `applyBuff` 的限時來源（「6 秒內免疫減速」）
   * 是同一條線，到期由那份 source 自己的 `expiresAtTick` 收掉。
   *
   * ⚠️ `tags` `.min(1)`：一份空清單的免疫掛得上去卻什麼都不擋，
   * 正是第一·五守則要關的那族洞（同 `zDeathWardGrant.modifiers`）。
   */
  statusImmunity: z
    .object({
      tags: z
        .array(z.string().min(1).max(48))
        .min(1)
        .max(16)
        .describe(
          "要擋下來的**狀態類別**，逐字對 status-effect@1 的 tags。" +
            "填 `cc` = 暈眩／緩慢／詛咒／致盲／纏繞／恐懼那一整族掛不上來；" +
            "填 `slow` = 只免減速。⚠️ 這一格擋的是「掛上來」，" +
            "⛔ 不擋傷害、不擋吸血暴擊、不擋【淨化】把身上的增益拔走，" +
            "而且不帶這些 tag 的**標記與疊層照樣掛得上**。",
        ),
    })
    .strict()
    .describe(
      "持有這份來源期間，帶著指定 tag 的狀態一律**掛不上這具身體**（GH#656 殭屍王）。",
    )
    .optional(),
} as const;

/**
 * ⭐ 每一個 effect kind **共有**的欄位 —— `sim/effects/effect.ts` 的
 * {@link EffectCommon} 在 Zod 這一側的鏡子。
 *
 * ⛔ **一份，不是 34 份。** 每個聯集成員都 `...EFFECT_COMMON_SHAPE,` 展開它；
 * 下一個共有欄位加在這裡一格，34 個成員自動全部拿到（第零守則⑨）。
 * ⚠️ 不做成 `zEffectDefUnion.options.map(o => o.extend(...))` 是因為
 * `z.discriminatedUnion` 需要一個**元組**型別，`.map` 回來的陣列要靠 `as` 騙進去，
 * 而那一個 `as` 會讓整個聯集的推導型別退化 —— 展開一個常數形狀是 zod 的慣用法，
 * 而且型別完全精確、零 cast。
 */
export const EFFECT_COMMON_SHAPE = {
  /**
   * 這一段效果要不要發生。與 **hook 上的 `condition` 是同一個型別、同一個求值器、
   * 同一組葉子**（`zEffectCondition`）—— ⛔ 不是第二套條件系統。
   *
   * 語意（逐一判斷 / 空目標退化成整段閘 / 一個都沒通過就不呼叫 handler）完整寫在
   * `sim/effects/effect.ts` 的 `EffectCommon.condition`，**不在這裡重複一份**。
   * 省略 = 無條件執行（今天所有內容的行為）。
   */
  condition: zEffectCondition
    .optional()
    .describe(
      "觸發條件：只有條件成立的目標才吃到這一段效果（省略＝所有目標都吃到）。" +
        "與觸發器上的條件用同一組判斷式；「對身上有〔恐懼〕的敵人追加傷害」是**逐一**" +
        "判斷的，範圍技裡沒有恐懼的人不會被算進去。沒有目標的效果（自我增益／落點特效）" +
        "則是整段成立或整段不發生。",
    ),
} as const;

/**
 * ⭐ G11（GH#299）—— 「這一段落在誰身上」。
 *
 * `applyStatus` / `spendMana` / `leap` / `invulnerable` / `knockback` /
 * `blink` / `evasion` / `cycleBuff` 早就有這一格，而 `damage` / `dot` /
 * `heal` / `restore` **沒有**，於是「施法者付自己的血」被 `.strict()` 拒收，
 * 89-002 只好靠 `randomArea{who:"self"}` → `weightedBranch{side:"allies",
 * maxTargets:1}` **兩層包裝**繞過去。
 *
 * ⛔ **沒有**提進 {@link EFFECT_COMMON_SHAPE}（原本的計畫），因為那會把這一格
 * 開在全部 34 個 kind 上，包括 handler 根本不讀它的那些 —— 作者填了、什麼都
 * 不會發生，那是失敗形態②的鏡像（「JSON 有那一格但引擎不看」），跟這一批要修的
 * 「引擎會做但 JSON 沒那一格」一樣糟。所以是**開一格、接一條線**，逐 kind 加。
 */
export const zApplyToSelfOrTarget = z
  .enum(["self", "target"])
  .optional()
  .describe("落在誰身上：target（預設，這次解出來的每個目標）或 self（施法者自己）。");

/**
 * ⭐ G1（2026-08-10）—— 範圍技的**圈內逐一過濾**那一族，四個共用常數。
 *
 * ⛔ **沒有**提進 {@link EFFECT_COMMON_SHAPE}，理由與 {@link zApplyToSelfOrTarget}
 * 逐字相同：那會把四格開在全部 36 個 kind 上，包括 handler 根本不讀它們的那些 ——
 * 作者填了、什麼都不會發生（失敗形態②的鏡像）。所以是**開一格、接一條線**，
 * 逐 kind 加：今天只有 `damageArea` 與 `damageLine`。
 *
 * ⛔ 也**不**給 `damageArea` / `damageLine` 加 `shape`：它們有自己的幾何
 *（`radius` / `length`+`width`），而 E1「新 kind 一律帶 shape」只約束**新** kind。
 * 加了會變成兩份互相打架的範圍定義。
 */
export const zVictimCondition = zEffectCondition.optional().describe(
  "圈內逐一過濾：只有通過這個條件的敵人才吃到這一段（「範圍內只打帶〔恐懼〕的敵人」）。" +
    "留空＝圈內每個人都吃到。⚠️ 它與上面那格「觸發條件」不是同一件事：" +
    "觸發條件讀的是上游交下來的目標、決定「這一段跑不跑」；這一格讀的是這個圓／" +
    "這條線自己解出來的人、決定「圈內誰挨打」。兩者用同一組判斷式。",
);

export const zMaxTargetsCounts = z
  .enum(["qualified", "candidates"])
  .optional()
  .describe(
    "「最多幾人」數的是誰：qualified（預設）＝通過上面那個過濾的前 N 個" +
      "（卡面「最多 5 名帶〔恐懼〕的敵人」）；candidates＝先取最近的 N 個再過濾" +
      "（「最近 5 人裡帶〔恐懼〕的」）。沒填過濾條件時這一格沒有作用。",
  );

export const zOnHitTargets = z
  .array(z.lazy(() => zEffectDef))
  .min(1)
  .max(EFFECT_CHAIN_MAX_STEPS)
  .optional()
  .describe(
    "命中之後接著跑的一段，而且**它收到的目標是這個圓／這條線真的打到的那群人**" +
      "（不是上游交下來的）。「打到的每個人都中毒」「濺射到的人再被擊退」寫的就是這裡。",
  );

export const zRunOnEmptyHit = z
  .boolean()
  .optional()
  .describe(
    "一個人都沒打到時，要不要照樣跑上面那一段。留空＝不跑（＝沒有這一格之前的行為）。" +
      "打開它才寫得出「打空了也留下一個落地特效」。",
  );

/**
 * ⭐ G1 ② —— 下一段怎麼收那群人：整群一次，還是一個一個分開跑。
 *
 * 省略 = `"batch"`，也就是 {@link zOnHitTargets} 的檔頭**已經公告過**的語意
 * （「把這一圈真的打到的那群人當成 ctx.targets 交給這一段」）。⛔ 所以它不是一個
 * 新語意，只是把那句話裡本來就藏著的第二個選項拿出來當欄位（第一守則：決策點）。
 *
 * ⚠️ 為什麼一定要有 `perTarget`：下游若是 `damageArea` / `damageLine` 這種**自己解
 * 幾何**的 kind，它們只讀 `ctx.targets[0]` 當圓心 —— batch 模式下 5 個受害者只會炸
 * 出**一個**圈，而畫面上跟壞掉一模一樣（失敗形態②）。
 *
 * ⚠️ 預算誠實記一筆：`perTarget` 讓下游的 rng draw 隨受害者數線性成長。受害者清單
 * 本身已經是全序決定性的，所以決定性不破，但那是一筆看得見的成本。
 *
 * 上下界由 enum 本身封閉，無數值界。
 */
export const zOnHitTargetsMode = z
  .enum(["batch", "perTarget"])
  .optional()
  .describe(
    "下一段收到的是**整群人一次**（batch，預設）還是**一個一個分開跑**（perTarget）。" +
      "要寫「每個被打到的人腳下再炸一圈」必須選 perTarget —— 圓形／直線那類效果只認" +
      "第一個目標當圓心，整群一次交下去只會炸出一個圈。",
  );

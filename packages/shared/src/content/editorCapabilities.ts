/**
 * `ggd-runtime-capabilities@1` —— 給**外部技能模板編輯器**的能力契約。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 這支存在的理由：一份手寫的能力清單一定會對另一個專案撒謊
 *
 * `main_load_editor_plan.md` §2.1.1 的要求是硬的：
 *
 *   「遊戲端沒有對應 capability 時必須回 `unsupported-runtime`，
 *     **不可降級成相似但不同的效果**」
 *
 * 而這個 repo 已經有一份手寫的能力表（`content/templates/expand.ts` 的
 * `SIM_CAPABILITIES`），它的檔頭**自己記錄了它撒過兩次謊**：
 *
 *   · `knockback` 寫著 `available: false` 並附一段辯護散文，而那個 kind 早就
 *     出貨了 —— 註解原文：「a flag defended by prose outlives the prose's
 *     expiry date and nothing goes red」。
 *   · `invulnerable` **整列漏掉**，而 `missingCaps` 把未知 key 當成缺失 ——
 *     比寫 false 更糟，因為沒有人在找一列不存在的東西。
 *
 * 那份表的註解自己下了結論：「it was found by diffing EFFECT_HANDLERS against
 * this table, **which is the only way a stale row in here is ever going to be
 * noticed**」。
 *
 * ⛔ 在只有我們自己讀的時候，那是一個內部債。**一旦另一個專案照著它做技能，
 * 它就變成一個會讓對方做出上不了線的內容的錯誤來源。**
 *
 * 所以這份清單的每一格都**從出貨的註冊表推導**，而不是手打：
 *   · effect kinds ← `EFFECT_HANDLERS`（mapped type，少一個就編譯錯）
 *   · hook events  ← `zHookEvent`（Zod enum，載入時真的在驗的那一份）
 *   · 模板家族     ← `content/ability-templates/*.json` × `isExpandable()`
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② ⭐ 「還沒支援」的那一份**也是推導的** —— 這是這支的核心設計
 *
 * 計畫 §12 G4 點名了約 20 個 capability。把它們手寫成一張 `unsupported` 清單，
 * 會在**兩個方向**上過期：
 *   · 做出來了卻忘了從清單移除 → 對方以為不能用，白白繞路；
 *   · 清單寫著支援但其實沒做 → 對方做出來的技能上線就是死的。
 *
 * 解法是每一筆都帶一個 {@link CapabilityProbe} —— 一個**對推導出來的資料求值**
 * 的謂詞。清單不宣告「支援與否」，它宣告「**怎麼判斷**支援與否」。
 * 所以 `effect.modify-cooldown@1` 的那一天有人加了 `modifyCooldown` 這個 kind，
 * probe 自己就翻成 true，不需要任何人記得回來改這個檔。
 *
 * 守衛 `editorCapabilities.test.ts` 再加一道：任何一筆的 `expected` 與 probe
 * 的實際結果不符就紅 —— 那條紅燈的訊息是「你做完了 X，請把它的 expected 改成
 * supported」，而不是一個沉默的謊。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ ⛔ 推導式的守衛有一個**盲點**：它不驗「probe 問對了問題」
 *
 * 上面那道對帳閘只保證「宣告的 `expected` 與 probe 的結果一致」。
 * 一個**名字猜錯的 probe** 會回 false，於是宣告 `unsupported` 的那一列
 * **自己跟自己對得上** —— 守衛滿意，而那句 `reason` 是假的。
 * 實際發生過兩次（2026-08-08 的覆蓋矩陣量到）：
 *
 *   · `hook.on-reflect-success@1` 的 probe 找 `onReflectSuccess`，
 *     而當時引擎裡叫 `onReflect` → probe 回 false，reason 寫「沒有事件」是謊。
 *   · `effect.execute@1` 的 probe 找 `execute`，reason 寫「處決沒有 typed
 *     primitive」—— 而 **`devour` 早就出貨**（帶 `thresholdPctOfMax` 逐階處決線、
 *     `victim` hero-only、`throughShields`），59-01 吞噬用的就是它。
 *
 * 兩次是**同一個形狀**：`unsupported` 是一句「引擎裡什麼都沒有」的斷言，
 * 而 probe 只驗得了「叫這個名字的東西沒有」。這兩件事不一樣。
 *
 * ⭐ 所以 `unsupported` 現在**多一格必填的 {@link CapabilityEntry.nearestExisting}**：
 * 「引擎裡最接近的既有機制是什麼，以及它為什麼不算數」。
 * 它把一個**判準**（「我應該去查一下有沒有相近的東西」）換成一個**閘**：
 * 型別上不填就編譯不過（`unsupported` 分支要求它），守衛再驗它非空。
 * 要在 `devour` 存在的情況下寫下「什麼都沒有」，你必須**親手打那句謊**，
 * 而不是沉默地漏掉 —— 這是 CLAUDE.md「閘不是判準」那條的直接套用。
 *
 * ⚠️ 這裡**刻意不做**「自動掃 `EFFECT_HANDLERS` 找名字相近的 kind」：
 * `execute` 與 `devour` 沒有任何共同子字串，模糊比對抓不到這一次，卻會在別處
 * 誤報 —— 而一個會誤報的閘會被關掉。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ④ 邊界：這裡**只**回答「引擎會不會做這件事」
 *
 * 它不是 importer、不驗 package、不碰 authoring store。那一半要等
 * `GGD_EDITOR_PACKAGE_SPEC.md` 進 repo（2026-08-08 時它不在）。
 * 沒有那份契約就寫 importer，等於猜對方的欄位名 —— 而一個猜錯的 importer
 * 比沒有 importer 更糟，它會**接受**錯的東西。
 */
import { EFFECT_HANDLERS } from "../sim/effects/effectRegistry";
import { zHookEvent, zHookDefBase, zEffectDefUnion, zAuraDef } from "./schema/effect";
import { SIM_CAPABILITIES, isExpandable } from "./templates/expand";
import { zAbilityDef } from "./schema/ability";
import { zConditionLeaf } from "./schema/condition";
import {
  zVfxDoc,
  zVfxOrient,
  zRibbonDoc,
  // GH#392（lane 並行）—— `attachment@1`。⚠️ 這一行在 2026-08-19 掉過一次：
  // GH#384 把單行 import 改成多行的同一刻，另一條 lane 正在往單行那一版加它，
  // 於是它的**用處**進了 `VFX_SURFACE_SHAPES` 而**宣告**沒進來 ——
  // `ReferenceError: zAttachmentDoc is not defined`，整個 shared 套件 18 個檔一起紅。
  zAttachmentDoc,
  zVfxAbilityFamilyBinding,
  zVfxFamilyTuning,
  zVfxPrimBinding,
  zVfxFamilyBinding,
  zVfxOwnerBinding,
  zVfxPromotedBinding,
} from "./schema/vfx";
import { zAbilityVfxLayer } from "./schema/abilityVfx";
// ⭐ 文件授權面（GH#380）—— 這五份 Zod 是「一支技能／一件道具／一個狀態長什麼樣」
//    的出貨定義本身。⛔ 不是為了這份契約另外抄的一張表。
import { zMarkSpec } from "./schema/mark";
import { zProjectileDoc } from "./schema/projectile";
import { zStatusEffectDoc } from "./schema/statusEffect";
import { zItemDoc } from "./schema/item";
import { zChampionDoc } from "./schema/champion";
import { zTemplateDoc } from "./schema/template";

/** 這份文件的 schema id（計畫 §4.1 的 capabilities 回應）。 */
export const RUNTIME_CAPABILITIES_SCHEMA = "ggd-runtime-capabilities@1";

/** 一筆 capability 的支援狀態。三態，不是 boolean。 */
export type CapabilityState =
  /** 引擎現在就做得到，內容可以放心用。 */
  | "supported"
  /** 主要路徑可用，但有**明講**的限制（見 `caveat`）。 */
  | "partial"
  /** ⛔ 做不到。編輯器必須回 `unsupported-runtime`，不可降級成相似的效果。 */
  | "unsupported";

/**
 * 「怎麼判斷這個 capability 在不在」—— 對**推導出來的**引擎事實求值。
 *
 * ⚠️ 它刻意只拿得到 derived facts（effect kinds / hook events / 模板家族），
 * 不能自己去讀檔案或呼叫 sim。理由是純度與可預測性：一個會 I/O 的 probe
 * 在 CI 與本機會給出不同答案，而這份清單是**對外的契約**。
 */
export interface CapabilityProbeInput {
  readonly effectKinds: ReadonlySet<string>;
  readonly hookEvents: ReadonlySet<string>;
  readonly simCapabilities: ReadonlySet<string>;
  /**
   * `ability@1` 頂層欄位名，從出貨的 `zAbilityDef.shape` 推導。
   *
   * ⚠️ 加這一格的理由：不是每個 capability 都長成一個 effect kind。
   * 【切換】（`state.lifecycle@1`）是 `ability@1` 上的一格結構，effect kind 與
   * hook event 兩張表都看不到它 —— 沒有這一格，它的 probe 就只能寫成一個手打
   * 的 `() => true`，而那正是這份檔案的檔頭說「一定會撒謊」的東西。
   *
   * 純度不變：讀 Zod 物件的 shape 沒有 I/O、沒有時鐘。
   */
  readonly abilityFields: ReadonlySet<string>;
  /**
   * `condition@1` 的葉子種類（`kind` 字面量），從出貨的 `zConditionLeaf` union 推導。
   *
   * ⚠️ 計畫 §2.1.1.2 點名的四個 `condition.*@1` 全部長成**條件葉**，
   * 不是 effect kind 也不是 hook event —— 沒有這一格，它們的 probe 只能手打。
   */
  readonly conditionLeafKinds: ReadonlySet<string>;
  /**
   * 條件葉身上的**欄位名**（所有分支的聯集），從出貨的 `zConditionLeaf` 推導。
   *
   * ⚠️ 為什麼 `conditionLeafKinds` 不夠：不是每一個 typed condition 都長成一顆
   * 新葉子。`condition.stack-count@1`（「≥N 層」）落地的形狀是**既有 status 葉子
   * 上多一格 `minStacks`** —— 只問 kind 的 probe 對它是 false，於是那一列會宣告
   * 「引擎裡什麼都沒有」並且自己跟自己對得上。那正是檔頭 ③ 記的兩次撒謊的形狀。
   *
   * 純度不變：讀 Zod 物件的 shape，沒有 I/O、沒有時鐘。
   */
  readonly conditionLeafFields: ReadonlySet<string>;
  /**
   * `HookDef` 的欄位名，從出貨的 `zHookDefBase.shape` 推導。
   *
   * ⚠️ `hook.consume-policy@1`（「下一次普攻」用掉就沒了）也不是 kind 或 event，
   * 它是 hook 自己身上的幾格（`maxTriggers` / `consumeOn` / …）。
   */
  readonly hookFields: ReadonlySet<string>;
  /**
   * effect kind 身上的**欄位名**（所有分支的聯集），從出貨的 `zEffectDefUnion` 推導。
   *
   * ⚠️ 為什麼 `effectKinds` 不夠：有些 capability 是**既有 kind 多一格**而不是一個
   * 新 kind。`effect.target-set-chain@1` 落地的形狀就是 `damageArea` / `damageLine`
   * 上多一格 `onHitTargets` —— 只問 kind 的 probe 對它永遠是 false，那一列就會
   * 自己跟自己對得上地撒謊（檔頭 ③ 記過兩次的形狀）。
   *
   * 純度不變：讀 Zod 物件的 shape，沒有 I/O、沒有時鐘。
   */
  readonly effectFields: ReadonlySet<string>;
  /**
   * 靈氣定義（`zAuraDef`）的欄位名，從出貨的 Zod 物件推導。
   *
   * ⚠️ 為什麼上面五格都不夠：**靈氣不在 `zEffectDefUnion` 裡**。它掛在
   * `ability@1.passive.ranks[].auras[]` 與 `item@1.auras[]` 上，所以
   * `aura.scale-by-nearby@1`（2026-08-18 討伐叉那一格 `scaleByNearby`）
   * 對 `effectFields` 永遠是 false —— 沒有這一格，那一列的 probe 就只能手打
   * 一個 `() => true`，而那正是檔頭 ③ 記過兩次的撒謊形狀。
   *
   * 純度不變：讀 Zod 物件的 shape，沒有 I/O、沒有時鐘。
   */
  readonly auraFields: ReadonlySet<string>;
  /**
   * **特效授權面**上的欄位名（`vfxSurface` 每一列的聯集），從出貨的 Zod 推導。
   *
   * ⚠️ 為什麼上面七格都不夠：特效的格子**一個都不在** effect / hook / condition /
   * aura 任何一張表上。GH#390 的「特效自帶的音效」（`soundLaunch` / `soundImpact` /
   * `soundLoop` / `soundDissipate`）就是這個形狀 —— 沒有這一格，那一列的 probe
   * 只能手打一個 `() => true`，而那正是檔頭 ③ 記過兩次的撒謊形狀。
   *
   * 純度不變：讀 Zod 物件的 shape，沒有 I/O、沒有時鐘。
   */
  readonly vfxFields: ReadonlySet<string>;
}
export type CapabilityProbe = (f: CapabilityProbeInput) => boolean;

interface CapabilityEntryBase {
  /** 計畫裡用的 capability key，例如 `hook.on-lethal-damage@1`。 */
  readonly key: string;
  /** 計畫章節或 issue，讓對方查得到出處。 */
  readonly plan: string;
  /**
   * 引擎事實 → 這個 capability 存不存在。
   *
   * `partial` 與 `supported` 的 probe 都要回 true（兩者都「存在」）；
   * 差別在 `caveat` 有沒有被填。`unsupported` 的 probe 必須回 false。
   */
  readonly probe: CapabilityProbe;
  /** `partial` 必填：**限制是什麼**，不是複述 key。 */
  readonly caveat?: string;
  /** `unsupported` 必填：**為什麼還沒有**，以及對方該怎麼繞（或不要繞）。 */
  readonly reason?: string;
  /** 出貨證據（file 或 test），讓對方不必相信這份清單本身。 */
  readonly evidence?: string;
  /**
   * ⭐ 「引擎裡**最接近**的既有機制是什麼，以及它為什麼不算數」。
   *
   * 見檔頭 ③：`unsupported` 是一句「引擎裡什麼都沒有」的斷言，而 probe 只驗得了
   * 「叫這個名字的東西沒有」—— `effect.execute@1` 就是這樣在 `devour` 出貨之後
   * 還宣告著「處決沒有 typed primitive」。這一格逼作者去回答那個 probe 問不到的
   * 問題；`supported` / `partial` 可以填（很有用），`unsupported` **必填**。
   */
  readonly nearestExisting?: string;
}

/**
 * 一筆 capability。
 *
 * ⭐ **這是一個 discriminated union，不是一個 interface** —— `unsupported` 那一支
 * 把 `reason` 與 `nearestExisting` 變成**型別上必填**。所以「宣告做不到卻沒說
 * 最接近的是什麼」在 `pnpm typecheck` 就擋下來了，不必等測試跑。
 * （測試那一條驗的是另一半：填了但填空字串。）
 */
export type CapabilityEntry =
  | (CapabilityEntryBase & { readonly expected: "supported" | "partial" })
  | (CapabilityEntryBase & {
      readonly expected: "unsupported";
      readonly reason: string;
      readonly nearestExisting: string;
    });

const has =
  (kind: string): CapabilityProbe =>
  (f) =>
    f.effectKinds.has(kind);
/**
 * 這幾個候選 kind 名**任何一個**在不在。
 *
 * ⚠️ 與 {@link anyHookField} 同一個理由（檔頭 ③）：單一名字的 probe 猜錯就永遠
 * 回 false，而 `unsupported` 那一列會**自己跟自己對得上**。多列候選名是安全的
 * （多一個不存在的名字不會誤報），漏列才致命。
 */
const anyKind =
  (...kinds: readonly string[]): CapabilityProbe =>
  (f) =>
    kinds.some((k) => f.effectKinds.has(k));
const hook =
  (ev: string): CapabilityProbe =>
  (f) =>
    f.hookEvents.has(ev);
/** 條件葉在不在（`zConditionLeaf` 的 `kind` 字面量）。 */
const condLeaf =
  (kind: string): CapabilityProbe =>
  (f) =>
    f.conditionLeafKinds.has(kind);
/**
 * `HookDef` 上**任何一格**帶這個語意的欄位在不在。
 *
 * ⚠️ 收一個名字陣列而不是單一個名字，是檔頭 ③ 那個盲點的直接對策：
 * 單一名字的 probe 只要猜錯就永遠回 false，而那正是 `onReflectSuccess`
 * 與 `execute` 兩次撒謊的成因。多列幾個候選名不會誤報（多一個不存在的名字
 * 是安全的），漏列才會。
 */
const anyHookField =
  (...names: readonly string[]): CapabilityProbe =>
  (f) =>
    names.some((n) => f.hookFields.has(n));
/** 同上，用在條件葉。 */
const anyCondLeaf =
  (...kinds: readonly string[]): CapabilityProbe =>
  (f) =>
    kinds.some((k) => f.conditionLeafKinds.has(k));

/**
 * ⭐ GH#354 —— owner 2026-08-17 那張 **Action 清單裡「引擎完全沒有」的那 12 個**。
 *
 * ── 為什麼它們必須出現在這份契約裡 ─────────────────────────────────────────
 *
 * owner 那張表的 21 個 action 裡，`redirectDamage` 這一族在**這份 manifest 裡
 * 一個字都不存在**。而 `SIM_CAPABILITIES` 的檔頭已經記過這個形狀的代價：
 * `invulnerable` **整列漏掉**比寫 `false` 更糟，「因為沒有人在找一列不存在的
 * 東西」。⛔ 對外部編輯器來說，「沒被點名」讀起來就是「不需要」，
 * 而它會照著這份清單去猜一個相近的效果 —— 那正是計畫 §2.1.1 明文禁止的降級。
 *
 * ── ⛔ 為什麼是一張表而不是 12 段散文 ─────────────────────────────────────
 *
 * 12 筆之間只差三個字串（owner 的原詞 · 為什麼還沒有 · 最接近的既有機制），
 * 逐筆手寫 12 個 `{ key, plan, expected, probe, reason, nearestExisting }`
 * 就是 CLAUDE.md 第零守則⑨ 說的「到處改改改」。這裡是 **1 個模板 + 12 列參數**。
 *
 * ⚠️ `probeNames` 收的是**候選 kind 名**（見 {@link anyKind}）：漏列會讓這一列
 * 在機制真的落地那天繼續說「引擎裡什麼都沒有」，而守衛不會紅 —— 那正是
 * `effect.execute@1` 在 `devour` 出貨之後還撒了半年謊的成因（檔頭 ③）。
 */
const OWNER_ACTIONS_ABSENT: readonly {
  readonly key: string;
  /** owner 2026-08-17 的原詞，⛔ 不要改寫成我們的說法 —— 對方是照他的清單找的。 */
  readonly owner: string;
  readonly probeNames: readonly string[];
  readonly reason: string;
  readonly nearest: string;
}[] = [
  {
    key: "action.redirect-damage@1",
    owner: "redirectDamage —— 把即將落在 A 身上的傷害轉到 B",
    probeNames: ["redirectDamage", "damageRedirect", "redirect", "transferDamage"],
    reason:
      "傷害佇列今天只認得**一個**承受者（`combat/damage.ts` 的封包帶 target，沒有第二個座位）。" +
      "「換一個人挨」要在扣血之前改寫封包的 target，而那一格是護盾／免死／無敵三道閘共用的輸入。",
    nearest:
      "⚠️ 三個看起來像、但都不是：① **反彈**（`onReflectSuccess` + `damage.incomingPct`）把傷害送回" +
      "**攻擊者**，⛔ 方向是固定的，指不到第三個人；② `manaBarrier` 把傷害換成扣魔，" +
      "⛔ 仍然扣在同一個人身上；③ `taunt` 改的是**誰被瞄準**（`targeting.forcedTargetOf`），" +
      "⛔ 那是在傷害發生**之前**改目標，已經飛在路上的那一發它動不了。",
  },
  {
    key: "action.store-damage@1",
    owner: "storeDamage —— 把承受到的傷害存起來",
    probeNames: ["storeDamage", "bankDamage", "absorbLedger", "storedDamage"],
    reason:
      "引擎有「記一個數字」的機制，但它的**存款來源只有一種**：`spendMana.bankAs` 記的是" +
      "**這一次實際扣掉的法力**。⛔ 沒有任何一格讀得到「剛剛那一發打了我多少」再把它記下來 —— " +
      "`HookDef` 的過濾器與 `condition@1` 的葉子都沒有那個數字（`extendBuff` 的檔頭逐條查過同一件事）。",
    nearest:
      "⭐ **形狀已經存在，只是綁在別的數字上**：`spendMana.bankAs` → `sim/marks.ts` 的具名標記 → " +
      "`damage.bankedBonus`（`min(標記帶的數字 × coeff, max)`）。⇒ 缺的不是「帳本」也不是「支出端」，" +
      "是一個**把傷害寫進標記**的入口。⛔ 也不要拿 `shield` 當它：護盾吸掉的量沒有被記在任何地方，" +
      "吸完就消失了。",
  },
  {
    key: "action.release-stored-damage@1",
    owner: "releaseStoredDamage —— 把存起來的傷害一次放出去",
    probeNames: ["releaseStoredDamage", "releaseDamage", "dischargeDamage", "unleash"],
    reason:
      "與 `action.store-damage@1` 是同一條路的兩端：沒有存款端就沒有支出端。" +
      "⚠️ 兩者要一起做，⛔ 只做一半的話卡片會宣稱一個永遠是 0 的數字（第一·五守則的形狀）。",
    nearest:
      "⭐ **支出端其實已經出貨**：`damage.bankedBonus` 就是「把標記裡的數字乘上係數變成額外傷害」，" +
      "而且三個上界都是欄位（owner 2026-07-31 的裁決）。⇒ 這一列真正缺的只有「存的是傷害」那一半。",
  },
  {
    key: "action.rewind-state@1",
    owner: "rewindState —— 把一個單位倒回 N 秒前的狀態",
    probeNames: ["rewindState", "rewind", "timeRewind", "snapshotRestore"],
    reason:
      "⛔ sim **沒有保存任何歷史狀態**。決定性重播靠的是重跑輸入（`MatchRecorder` 錄的是 input log），" +
      "⛔ 不是狀態快照 —— 所以「倒回去」在引擎裡沒有可以讀的東西。" +
      "要做的話是動 `SimWorld` 的儲存體本身，而那是決定性與重播的承重牆（票 body 建議**最後**做）。",
    nearest:
      "⚠️ `revive` 與 `restore` 都是**設值**（把血魔設到一個算出來的數字），" +
      "⛔ 不是「回到當時那一刻」—— 位置、冷卻、身上的 buff、標記層數一格都不會跟著回去。",
  },
  {
    key: "action.swap-position@1",
    owner: "swapPosition —— 兩個單位對調位置",
    probeNames: ["swapPosition", "positionSwap", "swapPlaces", "teleportSwap"],
    reason:
      "位移的三個 kind（`dash` / `leap` / `blink`）都只搬**一具身體**，而且落點是算出來的座標。" +
      "「同一 tick 把兩具身體互換」還要決定**對方能不能拒絕**（免疫／不可位移／卡在牆裡），" +
      "而那組決策今天一個欄位都沒有。",
    nearest:
      "⚠️ `swapResource` 是引擎裡**唯一**的原子雙向交換，形狀對得上（兩個當事人、一個 tick、" +
      "拒絕條件寫成欄位）—— ⛔ 但它換的是資源不是座標。`blink` 是同一 tick 換座標的那一半，" +
      "⛔ 只搬自己。",
  },
  {
    key: "action.create-terrain@1",
    owner: "createTerrain —— 執行期長出新的地形/障礙",
    probeNames: ["createTerrain", "spawnTerrain", "createObstacle", "wallOfForce"],
    reason:
      "場地幾何是**編譯期**的：`arena@1.obstacles` 由 `map/compile.ts` 從格盤產出，" +
      "而碰撞的 relax 每 tick 掃的就是那個陣列。執行期插一塊新的要同時處理導航（`nav.nextHop` 是烘好的）" +
      "與「有人正好站在那裡」——⛔ 兩件事今天都沒有答案。",
    nearest:
      "⭐ **可開關的幾何已經有了**：`arena@1.obstacles[].gateGroup` + `sim/map/gates.ts` 讓一塊障礙" +
      "按排程（或 `toggleGate` 互動點）開開關關。⛔ 差別是那些方塊**是作者事先擺好的**，" +
      "技能只能開關它們，不能憑空多一塊。⇒ 「魔法牆」這一族今天的寫法是先在地圖上擺好再用 gate 開關。",
  },
  {
    key: "action.create-portal@1",
    owner: "createPortal —— 放一個持續存在、任何人踩得到的傳送門",
    probeNames: ["createPortal", "portal", "spawnPortal", "warpGate"],
    reason:
      "傳送門是**一個持續存在的世界實體**（有位置、有半徑、有壽命、對誰生效是欄位），" +
      "而引擎今天唯一的持續實體是 `summon`（一具身體）與投射物。" +
      "⚠️ 它與 `action.create-zone@1` 是同一個缺口的兩張臉，⛔ 不要分兩次做。",
    nearest:
      "⚠️ `blink` 做得到「同一 tick 換座標」那一半（中間位置一格都不存在），" +
      "⛔ 但它是**施法者自己、一次性**的 —— 沒有留在地上的東西，隊友踩不到，敵人也踩不到。",
  },
  {
    key: "action.modify-arena-boundary@1",
    owner: "modifyArenaBoundary —— 技能改變場地邊界",
    probeNames: ["modifyArenaBoundary", "shrinkBoundary", "expandArena", "moveBoundary"],
    reason:
      "邊界（`arena@1.bounds` 與火圈半徑）是**一份 config 的排程**，不是任何一支技能寫得到的狀態。" +
      "而且它是所有出生點合法性檢查與 `sim/map/bounds.ts` 的共同前提 —— 改它會讓那些檢查的答案" +
      "在一場比賽中途改變。票 body 建議**最後**做，理由與 `rewindState` 同一條。",
    nearest:
      "⭐ 「可站區域會隨時間縮小」**已經在跑**：火圈（`match.fireRing` + `combat/environmentalBurn.ts`）。" +
      "⛔ 但它是一份出貨排程，⛔ 技能／道具動不到它的任何一格。",
  },
  {
    key: "action.transfer-cooldown@1",
    owner: "transferCooldown —— 把自己的冷卻轉給別人（或反過來）",
    probeNames: ["transferCooldown", "cooldownTransfer", "shareCooldown"],
    reason:
      "`modifyCooldown` 的三個 mode（`reduce` / `reduceFlat` / `reset`）都只動**持有者自己**的一支技能，" +
      "而且它拿的是 `abilityId`。「轉給別人」要先回答「對方有沒有這一支」以及「對方的槽位是哪一格」——" +
      "⛔ 兩個問題今天都沒有欄位。",
    nearest:
      "⚠️ `modifyCooldown`（含 `reset` 模式）是最接近的，⛔ 但它的作用對象永遠是持有者。" +
      "`swapResource` 有「兩個當事人原子交換」的形狀，⛔ 但冷卻不是它認得的資源。",
  },
  {
    key: "action.copy-buff@1",
    owner: "copyBuff —— 讀出目標身上那一份增益，複製到自己（或隊友）身上",
    probeNames: ["copyBuff", "stealBuff", "mirrorBuff", "cloneStatus"],
    reason:
      "`applyBuff` 掛的是**作者在 JSON 裡寫死的**那一份修飾子。" +
      "「讀出對方身上現在有什麼」需要一個把 `StatsComp.sources` 反序列化回一份 `applyBuff` 的路徑，" +
      "而 modifier 的來源（道具／技能／靈氣／標記）語意各不相同 —— 複製過來之後**歸誰、什麼時候到期**" +
      "今天沒有答案。",
    nearest:
      "⚠️ `dispel` 證明了**讀得到**那些池子（它按 `pools` 清 status / dot / shields / buffs），" +
      "⛔ 但它只會刪，不會複製。`cycleBuff` 會輪替**自己這一份**的內容，⛔ 與目標身上有什麼無關。",
  },
  {
    key: "action.evolve-item@1",
    owner: "evolveItem —— 一件道具在戰鬥中升級成另一件",
    probeNames: ["evolveItem", "upgradeItem", "transformItem", "itemEvolve"],
    reason:
      "⛔ **GGD 沒有合成步驟**：`item@1.recipe`（book + components）的欄位註解自己寫著" +
      "「GGD has no combine step; this is provenance only」——它是從原作 TRIGGERS 撈回來的**出處紀錄**，" +
      "⛔ 不是一條執行期的路。而且沒有任何 effect kind 動得了背包（`economy/itemSource.ts` 只在" +
      "購買與回合邊界寫）。",
    nearest:
      "⚠️ `championForm`（變身）是引擎裡唯一「整份定義換成第二份」的機制，形狀對得上，" +
      "⛔ 但它換的是**英雄**不是道具，而且是靠 `content/champions` 的第二份文件，不是背包欄位。",
  },
  {
    key: "action.sacrifice-item@1",
    owner: "sacrificeItem —— 消耗掉一件道具換取效果",
    probeNames: ["sacrificeItem", "consumeItem", "destroyItem", "itemSacrifice"],
    reason:
      "與 `action.evolve-item@1` 同一個缺口：⛔ 沒有任何 effect 拿得走背包裡的一格。" +
      "⚠️ 它還多一個決策：**退不退錢、退多少** —— 那是 owner 的平衡題，⛔ 不是實作題。",
    nearest:
      "⚠️ `spendMana`（含 `bankAs` 記帳）是「花掉一種東西換一筆好處」最完整的樣板，" +
      "⛔ 但它花的是資源條上的數字。`condition.has-equipment@1` 讀得到「身上有沒有這一件」，" +
      "⛔ 只能讀，不能拿走。",
  },
];

/**
 * 計畫 §12 G4 點名的 capability，逐筆對帳。
 *
 * ⛔ **這張表的順序與內容跟著 `main_load_editor_plan.md` 走**，不要按「我們做了
 * 什麼」重排 —— 對方是照計畫的章節找東西的。
 *
 * ⭐ **例外只有一個**：結尾那一段 `action.*@1` 來自 owner 2026-08-17 的清單
 * （GH#354），不在計畫的章節樹上，所以它整段接在最後而不是插進去。
 */
export const PLANNED_CAPABILITIES: readonly CapabilityEntry[] = [
  // ── 2026-08-08 這一輪真的做出來的三個 ────────────────────────────────
  {
    key: "hook.on-lethal-damage@1",
    plan: "§12 G4 · §13「lethal hook 在 death commit 前」",
    expected: "partial",
    // 免死沒有自己的 effect kind，它掛在標記上；判準是標記機制在不在。
    probe: (f) => f.effectKinds.has("restore") && f.hookEvents.has("onDeath"),
    caveat:
      "攔截點在 `combat/damage.ts` 的護盾之後、扣血之前，符合計畫的「death commit 前」。" +
      "⚠️ **火圈燒傷是一個要知道的例外，而它現在是一格後台開關**（GH#287）：火圈不走傷害佇列" +
      "（那條路會帶來每 tick 的浮動數字、擊倒、擊殺歸屬 —— 全都不是環境傷害要的），" +
      "改走 `combat/environmentalBurn.ts` 這唯一的第二條路，它直接呼叫佇列**自己在用的**" +
      "`refusesDamage` 與 `lethalSaveFor`。所以：**無敵擋得住火圈**（`invulnerable` 的 " +
      "`blocksTrueDamage`，無條件），而**免死擋不擋火圈是 `match.fireRing.lethalSaveApplies`**，" +
      "⛔ **出貨預設關**（＝火圈無視免死，維持今天的行為，等 owner 裁決）。" +
      "⇒ 寫「受到致命傷害時 ⋯」的卡片時，不要假設它在火圈裡會生效。" +
      "⚠️ 這一句在 2026-08-08 當天有過一個中間版本寫著「火圈燒傷攔不到 —— 直寫 `hp.hp -=`，" +
      "無敵也一樣擋不住」，那是寫在 GH#287 落地**之前**的（同 `defense.mana-barrier@1` 那一格）。" +
      "⭐ 2026-08-09（GH#306）**`surviveHpPct` 現在有兩種語意，而預設是舊的那一種** —— " +
      "這是寫免死卡的人一定要讀的一格：`restoreMode:\"clamp\"`（**省略時的預設**，逐位元等於" +
      "這一格出現前的每一份文件）＝「這一發最多把你扣到這裡」，所以血**已經低於**地板時" +
      "一格都不補；`restoreMode:\"restore\"` ＝ owner 2026-08-09 講死的那一句「到生命 0 以下，" +
      "**再回到** 20%，不是停在 20%」，是一個**無條件設值**（救完血量 == 地板，與挨打前是 60% " +
      "還是 5% 無關）。⛔ 卡片文案寫「免死，並留在 N% 生命」卻沒填 `restoreMode:\"restore\"` 的話，" +
      "被磨到剩 5% 血的玩家會被救活在 5% 血 —— 下一發就死，而畫面上跟正常一模一樣。" +
      "⚠️ 兩種模式**只在血量已經低於地板時**行為不同，所以任何只試「滿血挨一發」的驗證看不出差別。",
    evidence:
      "packages/shared/src/sim/combat/lethalSave.ts + lethalSave.test.ts" +
      "（`restoreMode` 那一條真的用**兩個起始血量**跑同一發致命傷，斷言兩者落在同一格血量；" +
      "只驗高於地板的那一邊，三種實作都會過）",
  },
  {
    key: "effect.charge-ledger@1",
    plan: "§12 G4 · §13「十二道試煉的 ledger 跨 round 不跨 match」",
    expected: "supported",
    probe: (f) => f.effectKinds.has("restore"),
    caveat: undefined,
    evidence:
      "packages/shared/src/sim/marks.ts（具名標記：count/spent/expiresAtTick/resetOn）。" +
      "`resetOn:\"match\"` 就是計畫要的「跨 round 不跨 match」——`SimWorld` 一場比賽一個。",
  },
  {
    key: "hook.on-evade@1",
    plan: "§7 P1 · §12 G4",
    expected: "partial",
    probe: hook("onEvade"),
    caveat:
      "事件會發到**閃掉的那一方**（`WorldHookSystem` 的 actorKey=target），符合計畫的 defender hook。" +
      "⛔ 尚未區分「真閃避」與「attacker fumble」，計畫 §13 要求 fumble 零次 —— 這一格還沒守。",
    evidence: "packages/shared/src/sim/systems/WorldHookSystem.ts + worldHook.test.ts",
  },
  {
    key: "hook.on-ability-hit@1",
    plan: "§2.1.1（配合 condition.target-status@1）",
    expected: "supported",
    probe: hook("onAbilityHit"),
    evidence: "content/schema/effects/_hook.ts 的 zHookEvent",
  },

  // ── 計畫點名但引擎沒有的 ─────────────────────────────────────────────
  {
    key: "effect.modify-cooldown@1",
    plan: "§12 G4",
    expected: "supported",
    probe: has("modifyCooldown"),
    caveat: undefined,
    evidence:
      "packages/shared/src/sim/effects/modifyCooldown.ts（`slot` 或 `abilityId` 指名一支；" +
      "`reduce`/`reduceFlat`/`reset` 三種模式，`basis` 決定百分比的分母是剩餘量還是基礎冷卻）。" +
      "⭐ 2026-08-10（S3）多一條路：`target` 決定縮短的是**技能槽位**（`abilitySlot`，省略時的預設" +
      "＝這個 kind 在此之前的全部行為）還是**觸發器的內部冷卻**（`hookInternalCooldown` ——" +
      "「重置某個 proc 的 ICD」，`hookKey` 比對 `HookDef.key`，`hookScope` 決定只碰觸發這一發的" +
      "那一份來源（`originSource`，預設，較窄）還是身上全部來源（`allSources`，此時 `hookKey` 必填）)。" +
      "⚠️ `hookScope:\"originSource\"` 只認得 `origin` 是 `hook:…` 的呼叫 —— 從**施放**跑出來的" +
      "`modifyCooldown`（`origin` 是 `ability:…`）不屬於任何一份來源，那條路下什麼都不會發生，" +
      "而且是**靜默**的：要從施放去重置 proc，請用 `allSources` + `hookKey`。" +
      "守衛 packages/shared/src/sim/effects/lane1Kinds.test.ts + hookFamily.test.ts。",
  },
  {
    key: "effect.execute@1",
    plan: "§12 G4 · §16.13 · §5「待確認 14」",
    expected: "partial",
    // ⚠️ 2026-08-08 修正：這一列原本宣告 `unsupported`、reason 寫「處決沒有 typed
    // primitive」，而 probe 找的是 `execute` —— 出貨的那個 kind 叫 **`devour`**。
    // probe 自己跟自己對得上，守衛全綠，而那句 reason 從 `devour` 上架那天起就是假的
    // （檔頭 ③ 的第二個案例）。probe 改成問**出貨的那個名字**。
    probe: has("devour"),
    nearestExisting:
      "`devour`（`sim/effects/devour.ts` + `content/schema/effects/devour.ts`）—— " +
      "它**就是**這個 capability 的實作，不是「相近的東西」。59-01 吞噬走的就是它。",
    caveat:
      "計畫 §160 的最低契約有五項，`devour` 拿到三項：" +
      "① **typed threshold** ✅ `thresholdPctOfMax` 是逐階陣列（3/5/7/9% 就是四格）；" +
      "② **hero-only** ✅ `victim: \"champion\" | \"any\"` 是欄位；" +
      "③ **kill credit** ✅ 它不寫 `hp = 0`，而是推一發 `type:\"true\"` 進 `world.damageQueue`，" +
      "所以擊殺賞金 / `onKill` / 掉金幣 / 擊殺語音 / MVP 統計全部走出貨的那一條路。" +
      "⛔ 缺的兩項，寫技能的人一定會撞到：" +
      "④ **回復 basis 不是欄位** —— 固定讀施法瞬間的 `hp.hp`（cast-commit 快照），" +
      "而計畫 §16.13 要問的「讀 cast commit 前還是實際 hpLost」今天只有一個答案且寫死；" +
      "`healPct` 只是**倍率**，不是 basis。" +
      "⑤ **invulnerable interaction 沒有欄位** —— 因為走傷害佇列，`refusesDamage` 會讓" +
      "無敵目標**靜默吞不掉**（既沒有 `pierceInvulnerable`，也沒有「被擋下了」的回饋）。" +
      "⚠️ 另外它是**吞噬風味**的處決不是中性 primitive：`healPct` 省略 = 1，" +
      "要純處決得明寫 `healPct: 0`。",
    evidence:
      "packages/shared/src/sim/effects/devour.ts + devour.test.ts（護盾那條驗過 `throughShields`：" +
      "致死量含當下吃得到的護盾，否則「即死」會被護盾靜默擋掉）",
  },
  {
    key: "effect.weighted-branch@1",
    plan: "§12 G4 · §16.14（俄羅斯輪盤）",
    expected: "partial",
    probe: has("weightedBranch"),
    caveat:
      "機制已出貨：一次施放**只 draw 一次** `world.rng`（計畫 §13 的決定性要求），" +
      "分支各帶自己的 `weight` 與 `effects[]`，總權重 0 在載入時就被擋下。" +
      "⛔ 但 §16.14 的**機率表語意尚未 owner freeze**（1/6 是「每次獨立」還是「六發彈倉」），" +
      "所以 importer 在 freeze 之前仍應拒絕 89-002 那一類文件 —— 引擎做得到，規格還沒定。",
    evidence:
      "packages/shared/src/sim/effects/weightedBranch.ts + lane1Kinds.test.ts（「只抽一次」做過突變驗證）",
  },
  {
    key: "effect.swap-resource@1",
    plan: "§12 G4 · §16.16（交換筆記本）",
    expected: "supported",
    probe: has("swapResource"),
    caveat: undefined,
    evidence:
      "packages/shared/src/sim/effects/swapResource.ts —— 依 §16.16 的建議實作：" +
      "resolve tick 原子交換，各自 clamp 到 [clampMin, 自己的上限]，目標失效預設整招失敗。" +
      "三個決策點（`resource` / `clampMin` / `onInvalidTarget`）都是欄位，所以 owner 之後改語意不必改程式。",
  },
  {
    key: "defense.mana-barrier@1",
    plan: "§12 G4",
    expected: "partial",
    probe: has("manaBarrier"),
    nearestExisting:
      "（2026-08-08 起不再適用 —— 這一格留著是為了說明**為什麼**那兩件零件不算數。）" +
      "`shield`（`shield.absorbs` 能吸收指定型別的傷害）加上 `spendMana`（20-01 風王結界每擊扣魔）" +
      "擺在一起**看起來**像魔力護盾，⛔ 但沒有任何東西把**傷害導進魔力池**。",
    caveat:
      "primitive 已出貨（`manaBarrier`）：`manaBarrierCutFor` 在**扣血之前**把傷害換成扣魔 —— " +
      "⛔ 不是受傷後補護盾，魔力真的被扣、期間回的魔力真的會變成新的抵擋量。" +
      "計畫點名的兩格都在：`perMana` 就是 damage-to-MP ratio，remainder 由函式回傳" +
      "（抵不完的部分原封不動往下走進 免死 → 血條）。**四個**決策點都是欄位" +
      "（`perMana` / `damageTypes` **必填明列** / `minManaReserve` / `durationSec`）。" +
      "⭐ 2026-08-09（GH#307）`durationSec` 改成**選填**：省略 = **常駐**（沒有到期 tick），" +
      "填數字 = 到期或魔力耗盡先到的那個停。⛔ 兩種寫法的**強制停止都是魔力耗盡** ——" +
      "魔力見底時屏障是真的被**拔掉**（`detachSource`），不是「這一發抵 0」，" +
      "否則常駐的那一半永遠不會結束（owner 2026-08-09 明說「共同的強制停止都是魔力耗盡」）。" +
      "接線**已經接上**（`combat/damage.ts`，護盾池之後、免死之前）—— 44-00 掛上去就會擋。" +
      "⚠️ 這一句在 2026-08-08 當天有過一個中間版本寫著「接線還沒接」，那是寫在接線落地**之前**的；" +
      "留這句話在這裡是因為它示範了這份清單最危險的失效方式：" +
      "守衛只檢查 caveat 是不是空字串，**從不讀它的內容**，所以一句過期的散文可以把" +
      "一個已經可用的機制擋在門外，而且什麼都不會紅（見檔頭③與 GH#291 的同型）。",
    evidence: "packages/shared/src/sim/effects/manaBarrier.ts + lane2Kinds.test.ts",
  },
  {
    key: "effect.control-restriction@1",
    plan: "§12 G4",
    expected: "unsupported",
    probe: has("controlRestriction"),
    nearestExisting:
      "`applyStatus` 的**六個**獨立布林（root / stun / silenced / berserk / feared / **disarmed**）—— " +
      "它們**真的擋得住**移動、施法與普攻，所以「臥草泥馬不能動」寫得出來。" +
      "⭐ 2026-08-10（S8）新增的 `disarmed`【繳械】是「揮不出來」而不是「揮空刀」：" +
      "它併進 `BasicAttackSystem` 的**暈眩那一道閘**，而那道閘排在 `breakStealth` / 冷卻 commit / " +
      "`attackWindup` 之前，所以繳械期間不會空燒冷卻。它也算 CC（進 `isCc`，免控擋得掉、" +
      "秒數進 `ccAppliedTicks`），與 `feared` 同一列。" +
      "⚠️ **`berserk` 那一格是一個受詞題，不是一個布林題** —— 【暴走】與【混亂】共用同一格 " +
      "`applyStatus.berserk`，差別**只在落在誰身上**：落在自己 = 暴走，落在敵人 = 混亂" +
      "（owner 2026-08-09：「混亂應該是完全無法指定目標，並且會亂走路」）。" +
      "⛔ 這件事有後果：**自我暴走**吃一道「血夠低才放得出來」的施法閘（`config.berserk@1`），" +
      "而**對敵人下混亂**不吃。受詞由 `applyTo:\"self\"` 或 `castType:\"self\"` 判定，" +
      "逐字鏡射 `effects/applyStatus.ts` 自己那一行 —— 所以一支「對敵人下混亂」的普通技" +
      "⛔ **不要**寫 `applyTo:\"self\"`，寫了它就會在滿血時被拒（`cast rejected: hp-too-high`），" +
      "而那是 GH#305 之前 12-01 鬥仙術真的踩過的樣子。" +
      "⛔ 不算數的理由**沒有變**，而且每加一個布林就更成立一次：它不是一張表。計畫要的 " +
      "move / basicAttack / cast / playerOrders / AI control 五個維度**不能分開組合**，" +
      "而「這個狀態擋住哪幾種行為」散落在各個消費端的 `if` 裡。",
    reason:
      "`applyStatus` 目前有 root / stun / silenced / berserk / feared / disarmed 六個獨立布林" +
      "（`feared` 是 2026-08-08 為 89-002 俄羅斯輪盤與 52-02/04/002 加的，" +
      "`disarmed` 是 2026-08-10 的 S8），" +
      "但**沒有可組合的 typed 控制限制模型** —— 每多一種控制就多一個布林，" +
      "而「這個狀態擋住哪幾種行為」散落在各個消費端的 if 裡，不是一張表。" +
      "⚠️ 所以這一列停在 `unsupported` 是**對的**，但它的 `nearestExisting` 才是對方要讀的那一半：" +
      "六個布林各自都是能用的，⛔ 不要因為這一列寫 unsupported 就繞開它們。",
  },
  {
    key: "scheduler.random-area@1",
    plan: "§12 G4",
    expected: "partial",
    probe: has("randomArea"),
    nearestExisting:
      "三個零件各有一半：`damageArea` / `shapeTargets` 的 `circle`（**一個**圓的落點與命中）、" +
      "`dot` 與 hook 的 `internalCooldown`（**節奏**：每 N 秒一次）、`weightedBranch`（**一次** " +
      "`world.rng` 抽樣的正確做法）。⛔ 不算數的理由是沒有把三者接起來的排程器：" +
      "「count=10、interval=0.2s、每一發自己抽落點」沒有形狀，而更關鍵的是**沒有 draw 預算模型** —— " +
      "誰在哪一 tick 抽第幾次沒有定義，replay 就重現不出同一組落點（計畫 §13）。" +
      "（2026-08-08 起不再適用 —— 留著是為了說明那三件零件為什麼不算數。）",
    caveat:
      "排程器已出貨（`randomArea`），而且 §13 要的 draw 預算模型是**明確**的：" +
      "一次施放固定花 `2 × count` 次 `world.rng.next()`，**全部在施法那一刻抽完** —— " +
      "所以「這一波抽了幾次」不受場上人數、也不受它有沒有被打斷影響。" +
      "到期是**絕對 tick**；方形→圓形用 elliptical grid mapping（`sim/**` 禁三角函式）。" +
      "接線**已經接上**：`randomAreaSystem` 掛在 `SimWorld.step()` 的 slot 7e" +
      "（`combatResolveSystem` 之前），13-04 / 70-04 排得出來也落得下去。" +
      "（同 `effect.mana-barrier@1`：這一句 2026-08-08 當天曾寫著「接線還沒接」而接線就在那裡。）" +
      "⚠️ `content/templates/expand.ts` 的 `random-barrage` 那 8 張卡**仍然走 `dot`**，" +
      "遷移到這個 kind 是獨立的一批。",
    evidence:
      "packages/shared/src/sim/effects/randomArea.ts + lane2Kinds.test.ts（draw 預算做過突變驗證）",
  },
  {
    key: "effect.extend-buff-on-damage@1",
    plan: "§12 G4（2026-08-08 覆蓋矩陣 X20：52-01 狂戰士之怒）",
    expected: "supported",
    probe: has("extendBuff"),
    caveat: undefined,
    evidence:
      "packages/shared/src/sim/effects/extendBuff.ts —— 「期間每承受自身最大生命 5% 的傷害，延長 2 秒」。" +
      "⭐ **無狀態**：延長量是這一發傷害的連續比例（總量與階梯式相同），所以不需要累積器、" +
      "不需要任何新的 SimWorld 欄位，也**不需要任何接線**。" +
      "`maxRemainingSec` 是**必填**：這條是正回饋（挨越多、越久），沒有上界會變成永久，" +
      "而症狀是「這個回合打不完」——一個不會讓任何測試變紅的故障。" +
      "⚠️ 現有詞彙**組不出來**（逐條查過）：`applyBuff.stackKey` 寫的是「重設到滿」不是「延長」，" +
      "而 `condition@1` 的葉子與 `HookDef` 的過濾器沒有任何一格讀得到「剛剛那一下打了多少」。",
  },
  {
    key: "effect.event-value-conversion@1",
    plan: "§12 G4 · §16.12（太陰道）",
    expected: "partial",
    probe: has("eventValueConversion"),
    caveat:
      "機制已出貨：來源可選 `incomingDamage`（讀 `EffectContext.incoming`）或 `targetCurrentHealth`" +
      "（59-01 吞噬的「等同其剩餘生命」），轉成 mana / health，並可順帶給一段限時屬性加成" +
      "（15-002 太陰道的「短暫加成至 AP」）。" +
      "⛔ 但 §16.12 的**基數 `raw | mitigated | hpLost` 尚未 owner freeze** —— 所以它是一格欄位，" +
      "出貨預設 `mitigated`（與 `damage.incomingPct.basis` 同一句話）。freeze 之後只要改預設值，不必改程式。",
    evidence: "packages/shared/src/sim/effects/eventValueConversion.ts + lane1Kinds.test.ts",
  },
  {
    // 2026-08-08 補：計畫 §2.1.1.2 點名，而這張表原本**一列都沒有**（覆蓋矩陣的發現 C）。
    // 「沒被點名」在對方眼裡等於「不需要」，而它其實擋著 15-04 雷天大壯。
    key: "hook.consume-policy@1",
    plan: "§2.1.1.2（雷天大壯「施放技能後的下一次普攻」）· §12 G4",
    // ⭐ 2026-08-10（Lane 3 / S6）：**authoring 與執行兩面都落地了**。
    // ⚠️ 這一段前一版寫的是「authoring 面落地了，執行面還沒」，而它**正下方的
    // caveat 第一句就寫著相反的話** —— 同一個物件裡兩句互相打臉（第三守則）。
    // 實測（`sim/effects/lane3Kinds.test.ts` 的「S6 hook 額度」那一條真的跑起來
    // 數觸發次數）：`sim/effects/hooks.ts` 真的讀 `maxTriggers` 並扣帳，所以
    // **caveat 那一句是真的，這一句是假的**，假的那一句刪掉。
    // 這一列停在 `partial` 而不是 `supported` 的理由**不是**「引擎還沒讀」，
    // 而是 `consumeOn` 今天只有 `"fire"` 一個值（見 caveat 最後一段）。
    // ⛔ 也不可以退回 `unsupported`：probe 看得到那幾格，對帳閘會紅（它應該紅）。
    expected: "partial",
    // ⚠️ 收四個候選名而不是一個 —— 見檔頭 ③：單一名字猜錯就永遠回 false。
    probe: anyHookField("maxTriggers", "consumeOn", "expiresAt", "perTarget"),
    caveat:
      "⭐ **執行面已經落地**（2026-08-10 Lane 3 / S6，這一句前一版寫的是「只有欄位，" +
      "引擎還沒讀」而那已經不成立 —— 第三守則）。`sim/effects/hooks.ts` 的額度閘坐在" +
      "**內部冷卻閘與機率骰之前**（與 `victim` / `damageSource` 同一族的 rng-FREE 過濾），" +
      "所以一條額度用完的 hook **不燒 ICD、不動 seed**。扣帳走 `ModifierSource." +
      "hookFireCount` / `hookFireCountByTarget`（依 `hooks[hi]` 位置索引）。" +
      "⚠️ 仍然是 `partial`，剩下的限制只有一個：`consumeOn` 只有 `\"fire\"`（見下）。" +
      "⛔ **不可以**改用 `internalCooldown` 近似成「每 N 秒一次」：攻速快的英雄會" +
      "**多觸發**、慢的會**漏觸發**，而兩種錯法在畫面上都看不出來（只是偶爾多打或少打" +
      "一下）—— 那是**時間**界，這一族要的是**次數**界。" +
      "⚠️ `consumeOn` 今天刻意只有 `\"fire\"` 一個值：`\"hit\"`（下游真的打到人才算）" +
      "需要把扣帳搬到傷害落地那條路，那是第二條接線，⛔ 不先開一個接不到的選項。",
    evidence:
      "packages/shared/src/content/schema/effects/_hook.ts（zHookDefBase）+ " +
      "packages/shared/src/sim/effects/hooks.ts（額度閘 + consumeTrigger + detachSource）+ " +
      "packages/shared/src/sim/effects/lane3Kinds.test.ts",
  },
  {
    key: "hook.on-reflect-success@1",
    plan: "§2.1.1 · §12 G4 · §13",
    expected: "partial",
    probe: hook("onReflectSuccess"),
    caveat:
      "事件與 provenance 都出貨了：判準是「一發 `reflectDepth > 0` 的封包**真的落地**」，" +
      "hook 的持有者＝**防禦者**、`target`＝**攻擊者**，而 `EffectContext.incoming` 是" +
      "**那一發反彈封包自己的** `TriggerDamage`（raw / mitigated / hpLost 三個讀數都是真值），" +
      "所以 20-002「每次造成 7 倍[反彈]傷害」寫得出來 —— 用 `damage.incomingPct`。" +
      "⚠️ 兩個限制，寫技能的人一定會撞到：" +
      "① 那一發的 `reflectDepth` 已經是 1，child chain 的 `incomingPct` 要一起寫 " +
      "`maxChainDepth: 1`，否則被鏈深閘擋掉（那是終止性，不是 bug）；" +
      "② ⭐ 2026-08-09 已解除：`INCOMING_PCT_MAX` 從 5 抬到 **10**，所以「7 倍」" +
      "現在直接寫成 `perRank: [7]`，不必再靠 `amount` 那一項補。" +
      "（在此之前那條上界自稱是「打錯數字的守衛」卻擋住了 owner 的文案 —— " +
      "護欄裝在錯的位置；10 仍然擋得住「200 打在該寫 2.00 的格子裡」。）" +
      "⛔ 計畫 §2.1.1 四項 provenance 裡的**原傷害**沒有進 payload：`TriggerDamage` 是" +
      "封閉型別，而同一個 tick、同一個持有者的 `onDamageTaken` 已經帶著它 —— 再塞一份" +
      "進來就是第二個真相。要「原傷害的百分比」請掛在 `onDamageTaken` 上。",
    evidence:
      "packages/shared/src/sim/combat/damage.ts（push 點）+ " +
      "packages/shared/src/sim/systems/ReflectHookSystem.ts（dispatch）；" +
      "守衛 reflectHook.test.ts（不該發的時候不發）+ reflectSuccessProvenance.test.ts" +
      "（provenance 到得了 child chain，且交給它的是反彈傷害不是原傷害；三個突變都驗過）",
  },
  {
    key: "effect.target-set-chain@1",
    plan: "§6 P1 · §12 G4",
    expected: "partial",
    // ⛔ probe 換成真的問得到答案的那一個。舊的 `has("targetSetChain")` 是一個
    // **永遠回 false 的名字**（引擎裡沒有這個 kind，也不該有）—— 只改 expected
    // 會留下檔頭 ③ 記過兩次的撒謊形狀。
    probe: (f) => f.effectFields.has("onHitTargets"),
    caveat:
      "`damageArea` / `damageLine` 現在把**自己解出來、`victimCondition` 過濾完、`maxTargets` 切完**" +
      "的那一組人當成 `ctx.targets` 交給 `onHitTargets`（`onHitTargetsMode` 決定整群一次 batch " +
      "還是一個一個 perTarget；下游若是圓／線那類自己解幾何的 kind，batch 只會炸出一個圈）。" +
      "`runOnEmptyHit` 決定一個人都沒打到時要不要照樣跑（預設不跑）。" +
      "⛔ 仍然**不是**計畫要的『兩個具名 target set 同一 tick 並存』：`ctx.targets` 只有一個，" +
      "所以「ally selector 回 MP、enemy selector 造成傷害」還是只能靠後者覆寫前者 —— " +
      "要兩組並存請維持 `unsupported-runtime`。",
    evidence:
      "packages/shared/src/sim/effects/victimFilter.ts（`selectVictims` + `runOnHitChain`，" +
      "兩個 kind 共用一支模板）；守衛 areaVictimChain.test.ts" +
      "（下游收到的是真的挨打的那群人而不是上游的震央；突變驗過會紅）",
  },
  {
    key: "effect.attack-dash@1",
    plan: "§2.1.1",
    expected: "unsupported",
    probe: has("attackDash"),
    nearestExisting:
      "`dash`（`sim/effects/dash.ts`，一段位移）與 `leap`（帶 `onLand` 落地 child）。" +
      "⛔ 不算數的理由是兩者都是**施法者主動一次**的位移，而這裡要的是**掛在每一次普攻上**：" +
      "沒有 collision 停止、沒有目標中途失效的處理、也沒有 exactly-once（同一次揮擊不可以衝兩次）。",
    reason: "「每次普攻向目標短距離衝刺」需要 collision + target invalidation + exactly-once，`dash` kind 三者都沒有。",
  },
  {
    key: "effect.dash-on-end@1",
    plan: "§2.1.1 P1（條件式）· §16.7",
    // ⭐ 2026-08-10（Lane 3 / S7）：落地了，所以這一列從 `unsupported` 走到
    // `supported`。⛔ 它**不是**一個新 kind（`has("dashOnEnd")` 會永遠是 false，
    // 那正是檔頭③說的「probe 問錯問題」）—— 它是 `dash` 上的三格欄位，所以 probe
    // 問的是 `effectFields`。
    expected: "supported",
    probe: (f) => f.effectFields.has("onEndOn"),
    nearestExisting:
      "`leap.onLand` —— **固定落點**的版本一直就精確表達得出來（`sim/effects/leap.ts`，#247 那一批）。" +
      "（2026-08-10 起不再適用 —— 留著是為了說明「衝刺**結束的那一刻**」為什麼需要另一條路：" +
      "effect 在 step slot 2b/3 跑完、位移在 slot 5 才發生，所以同一個 `effects[]` 裡的 AoE" +
      "**必然**用衝刺前的座標。）",
    evidence:
      "packages/shared/src/sim/effects/dashOnEnd.ts（`dashOnEndSystem`，掛在 " +
      "`SimWorld.step()` 的 slot 5′）+ lane3Kinds.test.ts 的三臂量測",
  },
  {
    key: "state.exclusive-group@1",
    plan: "§12 G4 · §16.15（涅吉三形態）",
    expected: "partial",
    // 這一列有**兩個**互斥，兩個都要在：
    // ① 【變身】的互斥不是一個 effect kind，它是 `championForm` 這個 kind 的**結構**：
    //    `SimWorld.championForm` 是 `Map<EntityId, ChampionFormComp>`（一實體一格），
    //    身體只有一個 `championId`，而 `setBody` 是唯一的寫入者。所以 kind 在 ⇒ 互斥在。
    // ② 2026-08-10（G5）落地的**泛化 buff 互斥群**是 `applyBuff` 上的一格欄位，
    //    不是新 kind —— 只問 kind 的 probe 對它永遠是 false（檔頭 ③ 的形狀）。
    // 兩者以 AND 相連是刻意的：任何一半被撤掉，下面的 caveat 就有一半變成謊話，
    // 而對帳閘會替我們紅。
    probe: (f) => f.effectKinds.has("championForm") && f.effectFields.has("exclusiveGroup"),
    caveat:
      "✅ 15-02/03/04 逐字寫的「([變身]為唯一狀態不可疊加)」**對變身成立，而且是結構性的**：" +
      "一個實體只有一格形態、一個身體只有一個 `championId`，所以第二個形態不可能與第一個" +
      "並存 —— ⛔ 技能文件**不需要、也不應該**自己檢查「我是不是已經變身了」。" +
      "重複進入時「舊形態的剩餘時間怎麼辦」是欄位（`champion@1.transform.reenter`：" +
      "`restart` / `keepLongest` / `reject`），預設 = 出貨現況，被回絕會走 `castRejected`。" +
      "⭐ 2026-08-10（G5）：**泛化的互斥狀態群落地了** —— 這一句前一版寫的是「沒有『這三個 buff " +
      "互斥』的模型」，那已經不成立（第三守則）。`applyBuff.exclusiveGroup` 是一個自由字串群名，" +
      "掛上之前先掃 `sc.sources`：同組且未過期的舊來源整份卸下（`exclusiveOnExisting:\"replace\"`，" +
      "省略時的預設，形狀抄 `shield.onExisting`）或整發不掛（`\"reject\"`）。" +
      "所以 15-02/03/04 逐字寫的「[變身]為唯一狀態不可疊加」在**數值那一層**已經成立：" +
      "三個形態的移速倍率／攻速％／普攻附加傷害不會再連乘（⛔ 技能文件仍然不需要自己檢查）。" +
      "⚠️ 它作用在 **gameplay state（buff source）** 這一層，⛔ **不可以拿它假裝三個 3D 形態** —— " +
      "那是下面 ② 的事，而 ② 還沒解。" +
      "⛔ 仍缺一件，**涅吉三形態的「三個身體」今天仍然表達不出來**：" +
      "② **一個英雄只有一個 `transform.counterpartId`**，而 `championForm` effect 的 `to` 只有" +
      "`alternate`/`base`/`toggle`，沒有「變成指定的那一個形態」—— 所以第二個**不同**的形態" +
      "根本不是目的地：再施放一次只會刷新當前形態（WC3 Metamorphosis 的語意，刻意保留）。" +
      "⚠️ 它卡在計畫 §16.15 還沒裁決「三個 gameplay state 還是三個 3D body」——" +
      "⛔ 在那之前不要把三形態降級成三個獨立變身，那會是一個**看起來**能用的錯誤答案。" +
      "（那個裁決**不會**再回頭改 `exclusiveGroup` 那一層：數值互斥與身體選擇是兩件事。）",
    evidence:
      "packages/shared/src/sim/systems/ChampionFormSystem.ts + sim/championFormExclusive.test.ts" +
      "（四個突變都驗過會紅：拿掉 `sc.championId` 的寫入、`championForm.set` 改成不覆寫、" +
      "拿掉 `keepLongest`、拿掉整個 `reject` 分支）；泛化互斥群在 " +
      "packages/shared/src/sim/effects/applyBuff.ts::enforceExclusiveGroup + " +
      "sim/exclusiveDisarmNegate.test.ts（同一次執行裡比四臂：互斥 / 只掛一份 / 不填 group 仍然相乘 / reject）",
  },
  {
    key: "state.lifecycle@1",
    plan: "§12 G4（與 `state.exclusive-group@1` 同一列）· §13「風王結界手動關閉與 MP 不足自動關閉都走同一個 onExit child」",
    expected: "partial",
    // 【切換】不是一個 effect kind，它是 `ability@1` 上的一格結構 ——
    // 所以判準讀的是出貨 Zod 物件的欄位表（`CapabilityProbeInput.abilityFields`）。
    probe: (f) => f.abilityFields.has("toggle"),
    caveat:
      "✅ 計畫 §13 逐字要求的那一條**已經成立**：`exitToggle()` 是全專案唯一的關閉出口，" +
      "手動關閉（`castAbility` 第二次按下，刻意排在冷卻閘之前）與 MP 不足自動關閉" +
      "（`toggleUpkeepSystem`）都只是呼叫它，所以「關閉時釋放風王鐵槌」不可能只發生一半。" +
      "開關成本（`ability@1.manaCost`）與維持成本（`toggle.upkeepCost`）是兩個獨立數列，" +
      "節奏 `none`/`perAttack`/`perSecond` 是欄位。" +
      "⭐ 2026-08-10（G13-2）：`toggle.whileOn` 落地 —— 開著的期間掛一份**被動區塊**" +
      "（重用 `AbilityPassive`，⛔ 不是第二份 `EffectDef[]`），走的是 `abilityPassives.ts` 那**同一份**" +
      "程式（形態閘／六種授予轉發／四個強化面只有一份）。attach 掛在 `enterToggle`、detach 掛在" +
      "`exitToggle`，所以手動關閉與 MP 不足自動關閉都一定卸得掉；`whileOnDuringExit` 只決定卸下與" +
      "`onExit` 的**順序**，不決定會不會卸下。⚠️ 已知邊界：開著的時候升級**不換 rank**（加成停在" +
      "開啟當下那一階）。" +
      "⛔ 仍缺三件：① **stable state key** —— 一顆按鈕一個切換；「這幾個狀態互斥」現在寫得出來了" +
      "（`applyBuff.exclusiveGroup`，見 `state.exclusive-group@1`），但那是**buff 層**的互斥，" +
      "切換本身沒有群的概念；" +
      "② **duration / refresh policy** —— 切換沒有自帶時限，要限時請用 `applyBuff`；" +
      "③ **死亡不觸發 onExit** —— 屍體不付維持成本但旗標留著，「大招要不要從屍體放出來」" +
      "是一個還沒裁決的決策點，⛔ 不可以在遊戲端偷開第二條出口去補它。",
    evidence:
      "packages/shared/src/sim/abilities/toggle.ts + toggle.test.ts" +
      "（三個突變都驗過會紅：拿掉自動關閉、拿掉 perAttack 節奏閘、拿掉 onExit 的 runEffects）",
  },
  // ── 2026-08-08 補：計畫 §2.1.1.2 的三格 typed condition（覆蓋矩陣的發現 C）──
  // ⚠️ 它們**都不是 effect kind 也不是 hook event**，是 `zConditionLeaf` 的葉子 ——
  // 所以判準讀的是新加的 `conditionLeafKinds`（從出貨的 Zod union 推導）。
  {
    key: "condition.has-equipment@1",
    plan: "§2.1.1.2（77-002 御雷劍）· §12 G4",
    expected: "supported",
    probe: condLeaf("equipment"),
    nearestExisting: undefined, // 它本身就在，這一格留白是對的
    evidence:
      "packages/shared/src/content/schema/condition.ts 的 `zEquipmentItemLeaf` / `zEquipmentTagLeaf`" +
      "（⭐ 一個 UNION 而不是一個帶兩個 optional 欄位的物件，所以 `{itemId, tag}` 同時寫是 " +
      "**PARSE ERROR**，不會安靜地由求值端替作者決定哪一格贏）+ " +
      "packages/shared/src/sim/content/condition.ts 的求值與中文標籤。" +
      "✅ 計畫要的「只接穩定 itemId、禁止用顯示名稱連結」成立：`itemId` 走 `zRef<ItemId>(\"items\")`。" +
      "⚠️ 對方要知道的一件事：那個 ref 是 **soft**（御雷劍那一族的道具文件還沒進 `content/items/`），" +
      "所以打錯的 itemId **不會在載入時被擋**，它只是永遠不成立。",
  },
  {
    key: "condition.stack-count@1",
    plan: "§2.1.1.2（層數門檻）· §12 G4 · GH#301-5",
    // 2026-08-09 從 `unsupported` 改成 `partial`：owner #299 第 8 條把「狀態除了
    // 有無也要是數字層數」定案，`applyStatus.stacks` 寫得進去，而**讀取端**
    // 落在 status 葉子的 `minStacks` 上。
    // ⚠️ probe 也一起改：舊的問的是「有沒有一顆叫 stackCount 的葉子」，而落地的
    // 形狀是**既有葉子多一格** —— 不改 probe 的話這一列會維持 unsupported 並且
    // 自己跟自己對得上，也就是檔頭 ③ 記的那兩次撒謊再來一次。
    expected: "partial",
    probe: (f) => f.conditionLeafFields.has("minStacks"),
    nearestExisting:
      "`sim/marks.ts` 的具名標記（`count` / `spent`）—— 那是**另一個池子**，" +
      "`minStacks` 讀不到它，見下面 caveat 的第 ①點。",
    caveat:
      "✅ 寫得出來的是「某個主體身上的**某一份狀態**疊到 ≥N 層」：" +
      "`{kind:\"status\", subject, statusId, minStacks:N}`（缺 `minStacks` = 只問有無，與這一格出現前逐字相同）。" +
      "層數由 `applyStatus.stacks` 寫入、多來源相加、上界 `MARK_MAX_COUNT`(999)。" +
      "⛔ 三件**還不行**，不要繞：" +
      "① 讀不到 `sim/marks.ts` 的具名標記池（`effect.charge-ledger@1` 那一套的 `count`/`spent`）——" +
      "那是另一個池子。⚠️ **但「`minStacks` 只看 `StatusComp`」這句話 2026-08-10 起不成立了**" +
      "（第三守則）：G10 之後 `statusStacks` 讀**三本帳** —— `StatusComp.effects`、`world.marks`，" +
      "以及帶 `statusId` 的 `ModifierSource`（`applyBuff.statusId`：標記與數值變成同一個物件，" +
      "所以到期／淨化／卸下只有一條路，`extendBuff` 一行都不用改就把標記一起延長了）。" +
      "→ 對方要「破甲同時是狀態也是數值」時，寫 **一發** `applyBuff{stackKey, statusId, modifiers}`，" +
      "⛔ 不要拆成 `applyStatus` + `applyBuff` 兩份 —— 拆了的那一份 `extendBuff` 只延長得到後者；" +
      "② `tag` 那個分支**刻意沒有** `minStacks`（「【破甲】類的狀態合計幾層」沒有人定義過語意，" +
      "所以它是 PARSE ERROR 而不是由求值端替作者猜）；" +
      "③ 只有「≥」一種比較 —— 「剛好 N 層」「至多 N 層」寫不出來（後者用 `not` 包一個 `minStacks:N+1`）。" +
      "⚠️ 還有一件對方一定要知道的：出貨的 28 份狀態文件**沒有一份**寫 `stacks`，" +
      "而 `applyStatus` 只在作者明寫 `stacks` 時才累加 —— 所以對既有狀態問 `minStacks:2` 永遠是 false，" +
      "那不是壞掉，是那些狀態根本不疊層。",
    evidence:
      "packages/shared/src/content/schema/condition.ts 的 `zStatusIdLeaf.minStacks` + " +
      "packages/shared/src/sim/content/condition.ts 的求值（走 `statusStacks`）與中文標籤。",
  },
  {
    key: "condition.ability-state@1",
    plan: "§2.1.1.2（哥哥、絕。暗殺奧義、虛化）· §12 G4",
    expected: "unsupported",
    probe: anyCondLeaf("abilityState", "ability", "cooldown"),
    nearestExisting:
      "三件東西各摸到一角，**沒有一件是可查詢的條件**：" +
      "① `HookDef.abilitySlot` —— 只在事件**抵達時**過濾「這一發來自哪個槽位」，而且它是**槽位**" +
      "不是 exact ability ref（計畫 §4.4 要的是後者）；" +
      "② `applyBuff.whileForm` —— 綁在 buff 上的形態限定，答得了「卍解中嗎」答不了「這支技能在冷卻嗎」；" +
      "③ `ability@1.toggle` 的開關旗標 —— 只有 `exitToggle()` 這條路讀得到，內容寫不出對它的判斷。",
    reason:
      "「某支技能正在冷卻 / 已學會 / 正在開啟」問不出來 —— `zConditionLeaf` 沒有這一種葉。" +
      "⛔ 禁止以技能顯示名稱（「哥哥」「千年練成」）連結（計畫 §2.1.1.2 逐字）。",
  },
  {
    key: "ability-augment@1",
    plan: "§2.1.1 P1 · §12 G4 · §13",
    expected: "partial",
    // 【跨技能強化】不是一個 effect kind，它是 `ability@1` 上的一格結構 ——
    // 判準與 `state.lifecycle@1` 同一個形狀：讀出貨 Zod 物件的欄位表。
    probe: (f) => f.abilityFields.has("augment"),
    caveat:
      "✅ 計畫 §4.4 的兩條禁令都守住了：目標是 **exact ability ref**（`zRef(\"abilities\")`，" +
      "不是槽位、不是名稱文字），操作是一個 **allowlist enum** —— `procChance`（改機率）/ " +
      "`durationSec`（改持續時間）/ `damageCoeffAp`（加 AP 傷害係數）/ `thresholdPct`（改門檻），" +
      "四個剛好對上四支出貨卡（77-002 / 77-002 / 70-002 / 59-001）加上 `modifierValue`" +
      "（改一條 `StatModifier` 的數值，必填 `stat`），⛔ 沒有位置 JSON Pointer。" +
      "每個 op 的 `value` **兩端都有界**（`AUGMENT_OP_BOUNDS`），`mode` 只有 `set` / `add`。" +
      "**fail closed 在載入時**：目標指不到就 `DanglingRefError`（`content/refs.ts::abilityRefs` " +
      "推的是**硬** ref edge），不是執行期靜默跳過；`thresholdPct` 另外強制填 `nodeKind`，" +
      "那一格就是 §13「不得套到相鄰效果」的閘（一棵 condition 樹裡通常不只一個 `value`）。" +
      "⭐ 2026-08-10：**四個面全部接上了** —— `scope` 那一格（`all` 預設 / `hooks` / `effects` / " +
      "`grants`）決定一條操作打得到 hook 的 `chance` 與 hook 效果樹、主動施放的 `def.effects`" +
      "（`castAbility` 與 `CastResolveSystem` 兩個入口都問）、來源授予的 `critStrike.chance`，" +
      "或 passive 區塊的 `modifiers`（`modifierValue`，只有預設的 `all` 打得到）。" +
      "`AugmentTarget.condition` 也讀了（77-002「裝備了某類道具時」；求值主體只有 `self`，" +
      "所以 `subject:\"target\"` 的葉子恆為假）。" +
      "⛔ 仍缺兩件，寫技能的人一定會撞到：" +
      "① **這一版是執行期，不是編譯期** —— 計畫要的 reverse dependency closure 重編需要一個" +
      "住在 `content/registries.ts` 的 compiler。現在是「組出那一份 clone 的前一刻」讀 augment " +
      "表再算（**可觀測等價**：同一組 ops、同一個目標解析、同一份界），但沒有 closure、不遞迴" +
      "（強化一支自己也被強化的技能不成立）；" +
      "② **`nodeKind` 是自由字串**（condition 的 kind 表住在另一份 schema，抄過來就是第二份" +
      "會過期的真相），所以打錯字 = 那條操作匹配不到任何節點、靜默無效。⛔ 不要假裝它會紅。",
    evidence:
      "packages/shared/src/sim/abilities/abilityAugment.ts（收集 + 純改寫 + `opHitsSurface` " +
      "是全 sim 唯一讀 `scope` 的地方）；四個 seam：abilityPassives.ts::rankBlock（hooks / " +
      "modifiers / grants）、abilitySystem.ts::castAbility 與 systems/CastResolveSystem.ts（effects）；" +
      "守衛 packages/shared/src/sim/abilities/abilityAugment.test.ts（被動那一面）+ " +
      "abilityAugmentCastAndScope.test.ts（主動施放那一面，突變驗過會紅）",
  },
  {
    key: "defense.block-source@1",
    plan: "§2.1.1 P1 · §12 G4",
    expected: "partial",
    probe: (f) => f.simCapabilities.has("hooks"),
    caveat:
      "`BlockGrant`（含 `lethalOnly` / `lethalBasis` / `internalCooldown` / 鏈式獨立判定）已出貨且時序正確" +
      "（`mitigate()` 之後、護盾之前）。⭐ 2026-08-09（owner #299 第 6 條「授權格要放寬」）之後" +
      "寫入點有**四個**：道具（`economy/itemSource.ts`）、**技能被動**" +
      "（`ability@1.passive.ranks[].block`，配 `whileForm` 就寫得出「卍解狀態下才格擋」）、" +
      "**三選一增益卡**（`augment@1.block`）、以及 **`applyBuff.block`**（限時授予 ——" +
      "「接下來 5 秒內格擋」，同時也是**主動技能**那一格的答案：⛔ 不需要新的 effect kind）。" +
      "四者走同一個 `ModifierSource.block`（`blockCutFor` 不看 `kind`），所以鏈式判定與型別過濾逐條相同；" +
      "轉發只有一份（`sim/stats/sourceGrants.ts`）。" +
      "⛔ 仍然缺的是**「格擋的那一刻」這個時機** —— 擋下來不會觸發任何 hook。" +
      "⚠️ 另外 `internalCooldown` 的記帳住在 source 上，而技能被動的 source 在升級 / EX 解鎖 /" +
      "變身時會 detach + attach、`applyBuff` 每次施放都是新的 source，等於冷卻歸零；" +
      "後者的正確讀法是「這一次施放最多擋幾次」。出貨的兩支技能格擋都沒有 ICD，所以今天不可觀測。",
    evidence:
      "packages/shared/src/sim/combat/blockFromPassive.test.ts + " +
      "packages/shared/src/sim/stats/sourceGrants.test.ts（四個授權面，四個突變都驗過會紅）",
  },
  {
    key: "effect.convert-hit-damage-type@1",
    plan: "§2.1.1 P1 · §12 G4",
    expected: "partial",
    probe: (f) => f.simCapabilities.has("hooks"),
    caveat:
      "`damageTypeOverride` 能轉換傷害型別且有 `impactGateType` 處理擊倒閘，" +
      "但計畫要的是「以逐級機率把**該次普攻**完整轉成真傷」—— 逐級機率那一格沒有。" +
      "⛔ 不可以改成「另外補一段真傷」，那是不同的東西（計畫 §2.1.1 明列）。" +
      "⭐ 2026-08-09（G7）之後寫入點與 `defense.block-source@1` 一樣有**四個**：" +
      "道具、`ability@1.passive.ranks[].damageTypeOverride`、`augment@1.damageTypeOverride`、" +
      "以及 `applyBuff.damageTypeOverride`（限時 ——「接下來 5 秒你的普攻是真傷」，" +
      "到期走那份 buff 自己的 `expiresAtTick`，⛔ 不需要新的 effect kind）。" +
      "同一批也把**三圍授予**（`attributes`）放寬到同樣四個面。" +
      "四者走同一個 `ModifierSource` 欄位（`resolveDamageConversion` / `sourceAttrGrants` 都不看 `kind`），" +
      "轉發只有一份（`sim/stats/sourceGrants.ts`）。",
    evidence:
      "packages/shared/src/sim/combat/damageTypeOverride.ts + " +
      "packages/shared/src/sim/stats/sourceGrants.test.ts（授權格與轉發表逐鍵對齊，兩個突變都驗過會紅）",
  },

  // ── 2026-08-10（Lane 3）補：**出貨了但契約上沒有自己的一列**的兩個 kind ──────
  //
  // ⚠️ 它們與上面每一列的差別是「為什麼漏掉」而不是「做了沒有」：`delayed` 與
  // `proxyCast` 是 Lane 3 自己開的新 kind，**計畫 §12 G4 沒有點名它們**，所以
  // 這張「照計畫逐條對帳」的表天然不會長出它們的列。
  //
  // ⛔ 而「effectKinds 那張表裡看得到」不等於「對方拿得到 caveat」：
  // `effectKinds` 只回答**名詞**（這個名字存不存在），一列 `PLANNED_CAPABILITIES`
  // 才回答**邊界**（上界是多少、預設值是哪一個、哪一種寫法會靜默無效）。
  // 這正是檔頭 ② 說的那件事的另一面：`unsupported` 會撒謊，而**整列缺席**比撒謊
  // 更安靜 —— 對方連「這裡有一個要讀的限制」都不知道。
  //
  // ⛔ 兩列的 probe 一樣**從出貨註冊表推導**（`has()` 讀 `EFFECT_HANDLERS`），
  // 沒有任何一格是手寫的 true。
  {
    key: "effect.delayed-sequence@1",
    plan: "計畫未點名（Lane 3 / G12：20-002 連續七次斬擊 · 52-002 連續 100 下）",
    expected: "partial",
    probe: has("delayed"),
    nearestExisting:
      "`randomArea`（同樣是排在未來 tick 的一串）—— ⛔ 但它到期時用**圓心重解**目標，" +
      "所以目標走開就打空；`delayed` 到期時用**施放那一刻凍住的名單**。兩者長得像，" +
      "混用會安靜地做錯（兩支檔頭都寫了這一句）。`targetMode:\"reresolve\"` 就是把這一格" +
      "切回 `randomArea` 的語意，那是設計偏好不是缺陷。",
    caveat:
      "✅ 機制已出貨並接線（`SimWorld.step()` 的 7e′，排在 `combatResolveSystem` 之前，" +
      "所以這一 tick 落下的一刀在**同一個 tick** 被減傷、被護盾吃、被記分、被結算）。" +
      "⭐ 它**完全不碰 rng**（沒有落點要抽），所以一次施放推進亂數流 0 步 —— " +
      "⛔ 不必像 `scheduler.random-area@1` 那樣去算 draw 預算。排程是**絕對 tick**。" +
      "⛔ 四個邊界，寫技能的人一定會撞到：" +
      "① **發數有硬上界**（`sim/effects/kindLimits.ts::DELAYED_MAX_COUNT`，今天是 32）——" +
      "52-002 的「連續 100 下」**寫不到 100**，schema 在載入時就拒絕，⛔ 不要靠疊兩發 `delayed` 去湊，" +
      "那會變成兩串各自獨立的排程（`finalEffects` 也會跑兩次）；" +
      "② **間隔被夾成至少 1 tick** —— 0.001 秒與一個 tick 在 30Hz 下是同一件事，" +
      "所以「瞬間 32 連擊」拿不到，那是刻意的（整波塞進同一 tick 正是這個 kind 要修的症狀）；" +
      "③ `finalEffects` 是**追加**不是取代（省略 = 最後一發與其餘完全相同，⛔ 不是「最後一發不跑」）；" +
      "④ 三個會讓整串**提前停掉**的情境是欄位或規則，不是 bug：目標死亡（`dropDeadTargets`，" +
      "預設跳過）、施法者死亡（`stopOnCasterDeath`，**預設繼續**）、以及該分區的決鬥已經結束" +
      "（`settledZones`，⛔ 不可調 —— 回合結束後還在扣血是玩家看得見的缺陷）。" +
      "⚠️ payload 在**施法那一刻烘焙**（同 `randomArea.effects` / `leap.onLand`），" +
      "所以第七刀用的是施法時的 `comboBonus`，不是落地當下的。",
    evidence:
      "packages/shared/src/sim/effects/delayed.ts（`delayedEffect` + `delayedSystem`）+ " +
      "packages/shared/src/content/schema/effects/delayed.ts + " +
      "packages/shared/src/sim/effects/lane3Kinds.test.ts（「名單在施放那一刻凍住，" +
      "而且分散在不同的 tick 上落下」）",
  },
  {
    key: "effect.proxy-cast@1",
    plan: "計畫未點名（Lane 3 / S5：80-04 赤兔咆哮「攻擊時有 20% 機率使出弒鬼神」）",
    expected: "partial",
    probe: has("proxyCast"),
    nearestExisting:
      "⛔ **不是** `content/templates/expand.ts` 的 `\"proxy-cast\"` 模板家族 —— 同一個字已經" +
      "指過兩件事（那個家族自己的檔頭寫著「這裡不召喚任何東西」，展開結果只有 `damage` " +
      "＋選配 `applyStatus`）。在此之前這一族只能**手抄一份 payload**：80-04 帶著自己的 " +
      "`spawnProjectile` + damage 陣列，而 80-02 弒鬼神本人是另一份 —— 兩份會各自腐爛，" +
      "而畫面上看不出是哪一份在跑。",
    caveat:
      "✅ 代放走的是**目標技能自己的 payload**，所以改 80-02 就等於改 80-04 觸發的那一發。" +
      "`payCosts`（`none` 預設 / `mana` / `manaAndCooldown`）決定要不要付代價，後兩者走 " +
      "`castAbility` 的**同一排閘**（魔力／沉默／暈眩／擊倒／暴走／學過沒有／已在吟唱），" +
      "⛔ 不是在這裡重寫一次那些 if。" +
      "⛔ 四個邊界，寫技能的人一定會撞到：" +
      "① **鏈深上界**（`sim/effects/kindLimits.ts::PROXY_MAX_CHAIN_DEPTH`，今天是 3），" +
      "而 `maxDepth` **省略時是 0** —— 被代放的技能自己的代放直接被擋，那是終止性不是 bug；" +
      "② `abilityId` 是**軟參照**（代放一支還沒上架的技能不會讓內容載入失敗），代價是" +
      "**打錯的 id 不會在載入時被擋**，它只是永遠什麼都不發生 —— ⛔ 不要假裝它會紅；" +
      "③ 三個預設值是**刻意**的，改之前先想一遍：不付冷卻（`payCosts:\"none\"`）、" +
      "不看那一格的冷卻（`respectCooldown` 省略 = 冷卻中照樣代放）、要求已學會" +
      "（`requireLearned` 省略 = 沒點那一招時什麼都不發生）。⚠️ 一個每次普攻都可能觸發的 proc " +
      "若改成 `manaAndCooldown`，那支大招就會**自己把自己鎖住**，而畫面上只看得到「W 一直是灰的」；" +
      "④ `slot` 與 `abilityId` **恰好填一個**（superRefine 擋，不是由求值端替作者挑）；" +
      "代放的主詞永遠是**施法者自己**，⛔ 不會去掃 registry 找「誰有這支」。",
    evidence:
      "packages/shared/src/sim/effects/proxyCast.ts（雙載體深度：`EffectContext.proxyDepth` " +
      "＋呼叫堆疊上的 `proxyStackDepth`，閘門讀兩者最大值，所以混著走的鏈也停得下來）+ " +
      "packages/shared/src/content/schema/effects/proxyCast.ts + " +
      "packages/shared/src/sim/effects/lane3Kinds.test.ts（「代放的是那一支技能自己的 payload，" +
      "而且鏈一定會停」）",
  },

  // ── 2026-08-18 [EX∅ 根源] 五件寶具解鎖的五個機制 ──────────────────────
  // ⭐ 五列全部 `partial`，而且五個 caveat 都寫的是**寫卡片的人一定會撞到的邊界**，
  // ⛔ 不是複述 key。理由與這張表其餘每一列相同：一個「supported」而沒有邊界的宣告，
  // 會讓對方做出「schema 收得下、遊戲裡什麼都不發生」的內容（第一·五守則）。
  {
    key: "grant.type-streak-immunity@1",
    plan: "[EX∅ 根源] 史萊姆裝（owner 2026-08-18：「連續受到 2 次同型別傷害後免疫該型別」）",
    expected: "partial",
    // 它不是一個 effect kind，是**四個授權面共用的一格**（道具／天生技 rank／
    // 增益卡／applyBuff），所以 probe 問的是 `effectFields`（applyBuff 那一支帶著
    // `SOURCE_GRANT_SHAPE`）。⛔ 問 `effectKinds` 的話這一列永遠是 false。
    probe: (f) => f.effectFields.has("typeStreakImmunity"),
    caveat:
      "⛔ 四個邊界，寫這種卡的人一定會撞到：" +
      "① `damageTypes` **必填**且是雙向的 —— **沒被列進去的傷害型別既不累計也不打斷連擊**。" +
      "所以「只列 physical/magic」的卡，火圈真傷（#270）照樣燒得到你，但也不會替敵人洗掉你的物理連擊；" +
      "② **被免疫擋掉的那一發不會被記進連擊** ⇒ 連擊**凍結在門檻上**，免疫一直持續到" +
      "來了另一種被列進 `damageTypes` 的傷害為止 —— 那是這件寶具唯一的破解方式，⛔ 不是 bug，" +
      "但它必須印在卡片上，否則玩家不知道自己為什麼打不動；" +
      "③ `streakTimeoutSec` **省略 = 連擊在這一回合內永不逾時**，⛔ 但**不會跨回合**" +
      "（`sim/clearPools.ts::clearRoundScoped` 在 host 的 `enterCombat()` 逐席位把連擊表歸零，" +
      "owner 2026-08-18：「的確不應該跨回合殘留」）。回合**內**要不要有時鐘仍然由這一格決定 ——" +
      "省略它，面對一波純物理的敵人就是整回合免疫，而 `zInvulnerable.durationSec` 已經寫過" +
      "「an unbounded immunity is an unwinnable round」。⭐ 出貨的史萊姆裝刻意留空，" +
      "理由是 owner 的另一半：「場上一定會有其他敵方或特殊殭屍給 AP 傷害打斷」；" +
      "④ `resetMode` 省略 = `restart`（異型那一發**自己算新連擊第 1 發**），" +
      "`zero` 才是「歸零、下一發才算」。兩者只在「剛換型別的那一發」不同，一般驗證看不出差別。",
    evidence:
      "packages/shared/src/sim/combat/typeStreakImmunity.ts + " +
      "packages/shared/src/sim/combat/typeStreakImmunity.test.ts" +
      "（五發序列 physical×2 → 第三發 hp 逐位元不變並發出 `immune`，再用 magic / physical 各一發" +
      "證明它不是「隨便發一份 invulnerable」）+ content/items/slime-suit.json",
  },
  {
    key: "effect.taunt-reverse@1",
    plan: "[EX∅ 根源] 戰鬥力探測器（『指定我方去嘲諷指定目標』）",
    expected: "partial",
    probe: (f) => f.effectKinds.has("taunt") && f.effectFields.has("forcedTarget"),
    caveat:
      "⭐ 反向 = `side:\"allies\"` + `forcedTarget:\"target\"` 兩格一起填（各自省略時逐位元等於" +
      "2026-08-18 之前的行為，所以出貨的鍊金術之盾 `godie-i06q` 一個字都沒變）。⛔ 三個邊界：" +
      "① `includeNeutrals` **只在 `side:\"allies\"` 有作用** —— `enemies` 那一側的圓本來就含 " +
      "`MONSTER_TEAM`；② 「殭屍也會一起撲上去」有條件：`forcedTargetOf` 的 mob 分支要求" +
      "嘲弄者與那隻小怪**不同隊**，而殭屍全在同一隊 ⇒ 打你的如果是殭屍，隊友會被指過去，" +
      "**其他殭屍不會**；③ `config.taunt@1.overridesManualOrder` **出貨 false** ⇒ 一個正在" +
      "右鍵點名的隊友**不會**被強制轉頭（bot／召喚物／沒有手動指令的人會）。" +
      "⚠️ 掛在 `onDamageTaken` 上時 ⛔ **不可以**寫 `hook.target:\"self\"` —— `resolveAgainst` 會把" +
      "targets 換成持有者本人，於是 `forcedTarget:\"target\"` 指的是**自己**，全隊被指去打自己人，" +
      "而卡片上一個字都不會變（失敗形態②）。",
    evidence:
      "packages/shared/src/sim/effects/taunt.ts + " +
      "packages/shared/src/sim/tauntReverseDirection.test.ts" +
      "（⭐ 第三條斷言是 `forcedTargetOf(敵人)===null` —— 「方向真的反了」而不是「圓變寬了」；" +
      "第二個 it 從磁碟讀出貨的 `godie-i06q` 跑同一支 handler）+ content/items/scouter.json",
  },
  {
    key: "aura.scale-by-nearby@1",
    plan: "[EX∅ 根源] 討伐叉〈さすまた〉（『靈氣強度隨範圍內有幾個隊友變化』）",
    expected: "partial",
    // ⚠️ 靈氣**不在** `zEffectDefUnion` 裡（掛在 ability passive rank 與 item 上），
    // 所以這一列是 `auraFields` 存在的理由。⛔ 問 effectKinds/effectFields 永遠 false。
    probe: (f) => f.auraFields.has("scaleByNearby"),
    caveat:
      "⭐ 它做的事是把數到的人頭變成那一份投影的 `stacks`，而 `stacks` 對 Flat／PercentAdd／" +
      "PercentMult 三種 op 是**線性乘數** —— ⚠️ 所以一條 `pctMult -0.5` 配 2 層就是 ×0 把對方屬性" +
      "歸零，`max` 因此是**必填**。⛔ 三個邊界：" +
      "① 「一個人」的定義是**同隊 + 活著 + 有 StatsComp 的身體** ⇒ **召喚物與被復活的隊友算人頭**，" +
      "殭屍與中立守衛不算，倒地的隊友不算。引擎今天**沒有**「只數英雄」這根軸；" +
      "② 人數 < `min`（省略 = 1）⇒ **這一圈整份不掛**（連持有者自己都沒有），⛔ 不是「掛 0 層」；" +
      "③ 人數縮放與**發射源自己的 stacks 相乘**（2 層 buff 投出的圈在 3 名隊友旁邊是 6 層）。" +
      "⚠️ `.radius` 省略時與這圈共用同一次 `queryOverlap`（零成本）；填了會多查一次，" +
      "而**今天沒有任何出貨內容在用那條路徑**。",
    evidence:
      "packages/shared/src/sim/aura/aura.ts（auraSystem PASS 1 的兩步）+ " +
      "packages/shared/src/sim/aura/aura.test.ts（0 名 → 整份不掛／1 名 → stacks 1／" +
      "2 名 → stacks 2 **且屬性差正好是兩倍**／走出去掉回 1 **而來源 id 不變**）+ " +
      "content/items/sasumata.json",
  },
  {
    key: "effect.carry@1",
    plan: "[EX∅ 根源] 禰豆子的木箱（『背負／附著移動 + 不可選取』）",
    expected: "partial",
    probe: (f) => f.effectKinds.has("carry") && f.effectFields.has("untargetable"),
    caveat:
      "⛔ 五個邊界：" +
      "① `untargetable` 的四根軸逐字沿用 `sim/stealth.ts::StealthRules`，而 **`abilityAoe` 今天" +
      "沒有消費者** —— 填 `true` 的文件在引擎裡是空的（謂詞已匯出，閘點 `enemiesInCircle` 差一行）。" +
      "出貨的木箱填 `false`（＝今天的行為）所以卡片沒有說謊；" +
      "② `shape:\"circle\"` **一定要有 `radius`**（`radiusTier` 是註冊時才翻譯的，載入時的 refine 讀不到它）；" +
      "③ `side:\"allies\"` 的圓**含持有者自己而且他離圓心距離 0** ⇒ 拒載條件必須排在切 `maxTargets` " +
      "**之前**，否則那一刀每次都正好切下持有者本人，結果是一個人都收不進來（實測踩過）；" +
      "④ `onCarrierDeath:\"drop\"` 的引擎語意是「乘客**留在倒下的箱子裡**（位置凍住、仍不可選取）" +
      "直到 `durationSec` 走完」—— 引擎沒有「被擊倒」這個機制，也不能讓一件道具憑空造傷害；" +
      "⑤ **沒有任何東西在回合邊界清 `world.carried`**，它靠絕對 tick 到期自癒（上界 30 秒）。" +
      "⚠️ `ENTITY_FLAG.CARRIED` 已經過網，但**客戶端今天沒有為它畫任何東西** ⇒ 螢幕上看不出" +
      "那個人不能被選取。",
    evidence:
      "packages/shared/src/sim/carry.ts + sim/systems/CarrySystem.ts + sim/effects/carry.ts + " +
      "packages/shared/src/sim/carry.test.ts（①同一 tick 內乘客座標 == 載具座標 ②敵人的 " +
      "`acquireTarget` 在乘客「應該勝出」的夾具下仍回載具 ③到期後不再跟）+ content/items/nezuko-box.json",
  },
  {
    key: "effect.convert-team@1",
    plan: "[EX∅ 根源] 大師球（『陣營轉換 —— 把一個既有單位改成友軍』）",
    expected: "partial",
    probe: (f) => f.effectKinds.has("convertTeam") && f.effectFields.has("countsForOriginalTeam"),
    caveat:
      "⛔ 五個邊界：" +
      "① **`onHitTargets` 這一格 `convertTeam` 沒有**（`carry` 才有）⇒ 掛在同一個 `effects` 陣列裡的" +
      "回血／上鎖是**無條件**跑的，捕獲被拒絕的那一刻它們照樣發生。要「成功才給」今天寫不出來；" +
      "② **不對稱**：被借走的殭屍**會**被其他殭屍打，但它**打不到**其他殭屍" +
      "（`isMobTargetable` 對一隻沒被捕的普通 mob 一律回 false）。它仍然會去打敵方英雄，所以寶具是有用的；" +
      "③ **捕獲者死掉不會歸位** —— 歸位只有三條路（被捕者死亡／`until:\"duration\"` 到期／回合開始）。" +
      "`until` 那個 enum 沒有「載具死亡」這一格（`carry` 的 `onCarrierDeath` 才有）；" +
      "④ `countsForOriginalTeam` **預設 `false`**（owner 2026-08-18：被捕的單位實質上就是我方單位）—— `true` 是一鍵回頭（被借走的敵方英雄在勝負" +
      "判定上仍替原隊活著）。填 `false` 只是把原隊那一側的人頭拿掉，⛔ **不會**改算捕獲者那一隊 —— " +
      "座位是勝負判定的軸，而借調不動座位；" +
      "⑤ ⛔ 它**不發任何事件** —— 玩家的可見性靠 `ENTITY_FLAG.TEAM_OVERRIDE*` 三顆 bit 讓那具身體" +
      "當場換顏色。⇒ 想掛特效的話要自己在同一份 `effects` 裡加一發 `spawnVfx`。",
    evidence:
      "packages/shared/src/sim/mindControl.ts + sim/effects/mindControl.ts + " +
      "apps/game-server/src/net/mindControlWire.test.ts（⭐ 第三條斷言真的跑 `projectSnapshot` + " +
      "Colyseus encode→decode 再把隊伍序數解回來 —— 那是「遊戲邏輯全對、螢幕全錯」的唯一防線）+ " +
      "content/items/master-ball.json",
  },
  // ── 2026-08-19 GH#390：特效自帶的音效 ──────────────────────────────────
  {
    key: "vfx.bound-sound@1",
    plan: "GH#390 特效自帶的音效一個都沒移植",
    expected: "supported",
    // ⛔ 不可以問 effectKinds/hookEvents —— 音效不是一個 effect kind，它是**特效
    //    授權面上的四格**（`config.vfx-families@1` 的 families[] 與 abilities[]）。
    //    這一列正是 `vfxFields` 存在的理由。
    probe: (f) =>
      f.vfxFields.has("soundLaunch") &&
      f.vfxFields.has("soundImpact") &&
      f.vfxFields.has("soundLoop") &&
      f.vfxFields.has("soundDissipate"),
    caveat:
      "⭐ 四個時機（發射 / 命中 / 循環 / 消散）填的是 **`config.audio-map@1.sfx` 的 key**，" +
      "⛔ 不是檔名也不是 URL —— 音量 / 冷卻 / 同時發聲數住在 audio-map 那一份，" +
      "播放走 `AudioSystem.playSfx` ⇒ 玩家的總音量與 SFX 開關自動適用。" +
      "⚠️ 兩層逐格覆寫：`abilities[<id>].soundX` 蓋 `families[<fam>].soundX`，" +
      "⛔ 不是「填一格就整組換掉」。" +
      "⚠️ **循環音是重播不是真 loop**：每 `soundLoopMs` 重放一次，並在 " +
      "`soundLoopMaxMs` 絕對到期時自動回收並改播消散音（⛔ 沒有「一直響到有人叫停」）。" +
      "⚠️ 填一個 audio-map 沒有的 key = 這個時機安靜（⛔ 不是報錯）；" +
      "填 `wc3.*` 那一族要注意它們住在只有 full-asset build 才掛得上的 Blizzard overlay，" +
      "正式站上會**退回家族那一格**。",
    evidence:
      "packages/shared/src/content/schema/vfx.ts（`VFX_SOUND_CUES` / `resolveVfxSound`）+ " +
      "apps/client/src/audio/vfxSound.ts + apps/client/src/audio/vfxSoundWired.test.ts + " +
      "content/config/vfx-families.json（21 個家族原型 + 72 支原作 JASS 音效的逐支覆寫，" +
      "由 tools/w3x-import/build_vfx_sound_bindings.py 產生）",
    nearestExisting:
      "⚠️ `ability@1.sfxKey` 長得很像但**不是同一件事**：那是「這一支技能的身分音」" +
      "（一顆 `abilityCast` 一發），而這一列是「這一招的**特效**自己帶的那幾發」。" +
      "同一次施法兩邊都會響，這正是原作的樣子。",
  },
  // ── 2026-08-19 GH#392：球體附著 · 跟隨 · 播動畫 ──────────────────────────
  {
    key: "vfx.bone-attachment@1",
    plan: "GH#392 穿在骨頭上的模型（WC3 `Asph` 球體）",
    expected: "supported",
    // ⛔ 不問 effectKinds —— 掛件不是一個 effect，它是**一份文件**。三格分別對
    //    應 owner 那句話的三件事，⭐ 三格都要在：只驗 `points` 的話，一個
    //    「附著了但不跟隨、不播動畫」的引擎照樣宣稱 supported（失敗形態②）。
    probe: (f) =>
      f.vfxFields.has("points") && f.vfxFields.has("follow") && f.vfxFields.has("anim"),
    caveat:
      "⭐ **一份 `attachment@1` 綁在 `config.ambient-vfx@1.bindings` 上**，鍵可以是 " +
      "**modelKey**（所有穿這具身體的人都戴著）或 **championId**（形態感知）。" +
      "⚠️ 悟空兩態共用 `imported.goku`，所以「只有超三戴」**一定要用 championId** —— " +
      "填 modelKey 的話基本型也會戴上。" +
      "⚠️ `points[]` **一格掛一份拷貝**（= WC3 的 `atac`）：雙手就是 " +
      '`["left,hand","right,hand"]`。⛔ `"right,hand"` 是**一個**掛點的兩個逗號 token，' +
      "⛔ 不是兩個掛點。掛點名解析不出來 = 退回模型原點（那是 WC3 自己的行為，⛔ 不是缺陷）。" +
      "⚠️ `anim` 填的是**掛件自己的** glb 動畫軌名（出貨的三顆都只有一條 `Stand`）；" +
      "省略 = 播全部，填一個對不上的名字 = 一條都不播（⛔ 不會退回第一條）。" +
      "⚠️ `follow: false` 是**世界座標快照**，掛件從此和角色無關 —— " +
      "⛔ 不是「掛在模型根上」（那還是會跟著角色走）。" +
      "⚠️ 掛件的生命週期綁在那具 body 上：變身會整個重建 view，所以「變回本體 = 掛件消失」" +
      "不需要任何解除步驟。",
    evidence:
      "packages/shared/src/content/schema/vfx.ts（`zAttachmentDoc`）+ " +
      "packages/shared/src/content/wornAttachments.ts（兩個來源折成一個型別）+ " +
      "apps/client/src/render/views/ChampionView.ts（`attachOnePart`：parent = 跟隨、" +
      "`g.play()` = 播動畫）+ apps/client/src/render/boneAttachmentFollow.test.ts" +
      "（NullEngine 真的移動角色再讀掛件的**世界座標**）",
    nearestExisting:
      "⚠️ `vfx@1.anchorBone` 長得很像但**不是同一件事**：那是把一組**粒子發射器**掛到關節上" +
      "（`AmbientVfx` 那條路），這一列掛的是**一整個模型**（有網格、有骨架、有自己的動畫軌）。" +
      "⛔ 也不要跟 #73/#255「烘進 glb 的幾何」混淆：共用 modelKey 的變身對只能走執行期，" +
      "烘進去基本型也會長出來。",
  },

  // ══ GH#354 · owner 2026-08-17 的 21 個 Action ════════════════════════════
  //
  // ⭐ **事件那一半刻意不在這裡重複一份。** owner 同一天列的 18 個事件現在
  //    `zHookEvent` 裡**一個不缺**（GH#354 那一批 13 個 + 既有的 5 個），而
  //    `hookEvents` 是這份 manifest **推導出來**的一格 —— 對方直接讀得到。
  //    在這裡再抄 18 列會變成第二個住處，而它一定會與 enum 漂開（檔頭 ① 的形狀）。
  //
  // ⚠️ Action 那一半沒有這種好運：`redirectDamage` 這一族**不是一個 effect kind**，
  //    所以「引擎沒有它」在推導事實裡長得跟「我們從沒聽過這個詞」一模一樣。
  //    ⇒ 這 21 列存在的唯一理由，就是把後者變成前者。
  {
    key: "action.grant-shield@1",
    plan: "GH#354 owner 2026-08-17 的 Action 清單 —— 「grantShield」",
    expected: "supported",
    probe: has("shield"),
    evidence:
      "packages/shared/src/sim/effects/shield.ts —— ⭐ `absorbs` 是一格**傷害類型過濾器**" +
      "（「只擋魔法傷害」寫得出來），⛔ 它不是一個 effect kind，所以不要去 effectKinds 裡找它。",
  },
  {
    key: "action.summon-unit@1",
    plan: "GH#354 owner 2026-08-17 的 Action 清單 —— 「summonUnit」",
    expected: "supported",
    probe: has("summon"),
    evidence: "packages/shared/src/sim/effects/summon.ts（`SimWorld.summon` + summonSystem）",
  },
  {
    key: "action.revive-self@1",
    plan: "GH#354 owner 2026-08-17 的 Action 清單 —— 「reviveSelf」",
    expected: "supported",
    probe: has("revive"),
    evidence:
      "packages/shared/src/sim/effects/revive.ts —— handler 決定 WHO / WHERE / WHETHER，" +
      "「被復活的人長什麼樣」是 `sim/revive.ts::reviveChampionAt` 那一份契約。",
  },
  {
    key: "action.reset-cooldown@1",
    plan: "GH#354 owner 2026-08-17 的 Action 清單 —— 「resetCooldown」",
    expected: "supported",
    // ⛔ 只問 `modifyCooldown` 不夠：三個 mode 裡少了 `reset` 這一列就成了謊。
    probe: (f) => f.effectKinds.has("modifyCooldown") && f.effectFields.has("mode"),
    evidence:
      "packages/shared/src/content/schema/effects/modifyCooldown.ts 的 " +
      '`mode: z.enum(["reduce","reduceFlat","reset"])`。⚠️ `reduce` 的 `amount` 是**比例**' +
      "（上界 1），按秒縮短要用 `reduceFlat` —— 填錯 mode 會被 refine 擋下，⛔ 不會靜默夾掉。",
  },
  {
    key: "action.copy-ability@1",
    plan: "GH#354 owner 2026-08-17 的 Action 清單 —— 「copyAbility」",
    expected: "partial",
    probe: has("proxyCast"),
    caveat:
      "⭐ `proxyCast` 做到的是「**代放一次**」：一支技能施放另一支技能，" +
      "`payCosts` 非 none 時走 `castAbility` 的同一排閘（沉默／暈眩／魔力），" +
      "終止性靠深度嚴格遞增 + 有界上限。" +
      "⛔ **它不是「複製到自己的槽位」**：施法者的六格技能列一格都不會變，" +
      "所以「偷來的招之後可以再放」寫不出來 —— 那需要執行期改寫 `world.abilities`，" +
      "而那一格今天只在 `spawnChampion` 寫一次（同 #129 變身技能列的那個缺口）。",
    evidence: "packages/shared/src/sim/effects/proxyCast.ts",
    nearestExisting:
      "⚠️ `championForm` 會把**整份** runtime 定義換掉（含技能），形狀比 `proxyCast` 更接近" +
      "「換槽位」—— ⛔ 但它換的是一整個形態，不是單獨一格技能。",
  },
  {
    key: "action.change-target-rule@1",
    plan: "GH#354 owner 2026-08-17 的 Action 清單 —— 「changeTargetRule」",
    expected: "partial",
    probe: (f) => f.effectKinds.has("taunt") && f.effectFields.has("forcedTarget"),
    caveat:
      "⭐ 引擎有**一根**改寫瞄準的軸：`targeting.forcedTargetOf`（`sim/taunt.ts`），" +
      "而且 `taunt` 已經證明它可以**反向**用（`godie-i06q` 偵查鏡：讓敵人**不**選你）。" +
      "⛔ 但它是「指定一個人」這一種規則，⛔ 不是一個可組合的瞄準規則語言 ——" +
      "「優先打血最少的」「優先打施法者」這些今天只能靠 `effect` 上的 `targetPriority` / " +
      "`targetMode` 在**單一效果**的範圍內表達，⛔ 改不了那個單位平常的自動選敵。",
    evidence: "packages/shared/src/sim/taunt.ts + sim/tauntReverseDirection.test.ts",
    nearestExisting:
      "⚠️ `convertTeam`（大師球）也會改「誰打誰」，⛔ 但它是換陣營不是換規則，" +
      "而且 `isMobTargetable` 讓它是**不對稱**的（被借走的殭屍打不到其他殭屍）。",
  },
  {
    key: "action.modify-resource-rule@1",
    plan: "GH#354 owner 2026-08-17 的 Action 清單 —— 「modifyResourceRule」",
    expected: "partial",
    probe: (f) => f.effectKinds.has("swapResource") && f.effectKinds.has("manaBarrier"),
    caveat:
      "⭐ 兩個**具名的**規則改寫已經出貨：`swapResource`（原子交換雙方的 HP↔MP）與 " +
      "`manaBarrier`（扣血之前先把傷害換成扣魔，44-00 機警）。`eventValueConversion` 再補一條" +
      "「把這次事件的數值換成另一種資源」。" +
      "⛔ 但它們是**三條寫死的路**，⛔ 不是「這個單位從現在起用怒氣代替魔力」那種一般化的規則層 ——" +
      "資源條的種類今天是 HP / MP 兩根，內容側加不了第三根。",
    evidence:
      "packages/shared/src/sim/effects/swapResource.ts + manaBarrier.ts + eventValueConversion.ts",
    nearestExisting:
      "⚠️ `spendMana`（含 `bankAs` 記帳）示範了「一次施放要多付一種代價」，" +
      "⛔ 但它加的是額外支出，⛔ 不是換掉那個單位的資源規則。",
  },
  {
    key: "action.create-zone@1",
    plan: "GH#354 owner 2026-08-17 的 Action 清單 —— 「createZone」（票 body 的第 3 順位）",
    expected: "partial",
    probe: (f) => f.effectKinds.has("randomArea") && f.effectKinds.has("delayed"),
    caveat:
      "⛔ **今天所有的「範圍」都是瞬間的**：`damageArea` / `damageLine` / `randomArea` 在" +
      "結算的那一 tick 查一次重疊就結束。「留下一片持續 N 秒的區域」只能用 " +
      "`delayed`（凍住名單）或 `randomArea`（到期用圓心重解）硬湊成 N 次脈衝，" +
      "而且 ⚠️ **畫面上不會有那一圈** —— 沒有任何實體過網，玩家看不到自己站在裡面。" +
      "⇒ 毒圈／治療圈／減速場這一整族的骨架今天寫不出來。",
    evidence:
      "packages/shared/src/sim/effects/randomArea.ts（draw 預算 2×count，到期走絕對 tick）+ " +
      "delayed.ts（⛔ 與 randomArea 的差別是一句話：那邊到期用圓心重解，這邊用凍住的名單）",
    nearestExisting:
      "⭐ **最接近的是 `summon`**：它是引擎裡唯一「留在場上、有壽命、有位置」的實體，" +
      "配一份 `auras`（靈氣）可以做出一個會影響周圍的圈。⛔ 三個差別要知道："
      + "① 它是一具**身體**（會被打、會擋路、算人頭）；② 靈氣只投射 modifier，" +
      "⛔ 投不出持續傷害；③ 它的外觀是一個單位模型，⛔ 不是地上的一圈。",
  },
  {
    key: "action.delay-death@1",
    plan: "GH#354 owner 2026-08-17 的 Action 清單 —— 「delayDeath」",
    expected: "partial",
    probe: (f) => f.effectKinds.has("invulnerable") && f.hookEvents.has("onLethalDamage"),
    caveat:
      "⭐ 「這一發不會死」已經有兩條路：`invulnerable`（無條件擋，含真傷）與" +
      "**免死**（`sim/marks.ts` 的 `lethal` 標記 + `combat/lethalSave.ts`，攔在護盾之後扣血之前）。" +
      "⛔ 但引擎**沒有「死亡延後 N 秒」**：死亡是在同一 tick commit 的，" +
      "⛔ 沒有一個「已經死了但還站著」的中間狀態。" +
      "⇒ 「陣亡後 3 秒內仍可行動」這種卡片今天要改寫成「免死 + 一段短無敵」，" +
      "⚠️ 而那兩者的**可被驅散性**與畫面表現都不一樣，⛔ 不是同一句話。" +
      "⚠️ 免死的 `restoreMode` 預設是 `clamp`（見 `hook.on-lethal-damage@1`），" +
      "⛔ 寫「留在 N% 生命」的卡片一定要填 `restore`。",
    evidence:
      "packages/shared/src/sim/effects/invulnerable.ts + sim/combat/lethalSave.ts + sim/marks.ts",
    nearestExisting:
      "⚠️ `revive` 是「死了之後再站起來」，時序在死亡**之後**；`delayDeath` 要的是死亡**之前**" +
      "多出一段可以行動的時間。兩者在畫面上像，在狀態機上是相反的兩側。",
  },
  // ══ 2026-08-22 —— #541【連段】與 #147【吸引】═══════════════════════════
  {
    key: "effect.combo-strikes@1",
    plan: "#541 —— 01-04 超究武神霸斬「連斬七次」· 20-002「連續七次斬擊…最後施展約束與勝利之劍」",
    expected: "supported",
    // ⛔ 只問 `comboStrikes` 這個名字不夠：一個**不能分別結算**的連段就是 `dot`
    //    換一個名字，而外部編輯器分不出來。所以 probe 同時問「收尾那一格在不在」
    //    —— `finisher` 是「N 段各自結算 + 最後一發不一樣」這件事的簽名欄位。
    probe: (f) => f.effectKinds.has("comboStrikes") && f.effectFields.has("finisher"),
    evidence:
      "packages/shared/src/sim/effects/comboStrikes.ts —— 每一段是自己的一次 `runEffects`，" +
      "所以各觸發一次 on-hit、各吃一次減傷、各記一次分。⭐ 節奏（幾段／間隔／收尾延遲）" +
      "**在載入時**從 `config.combo-strikes@1` 解析（`sim/effects/comboFamilies.ts`），" +
      "⛔ 不烘進技能 JSON；不等間隔用 `steps[]`。" +
      "⚠️ 排程走的是**既有的** `SimWorld.delayed` 佇列與 `delayedSystem`，⛔ 不是第二個排程器。",
  },
  {
    key: "effect.pull@1",
    plan: "#147 —— A091 05-03 及喀爾度「2×等級 個錨點 + 250+100×等級 半徑」(war3map.j:28224-28233)",
    expected: "supported",
    // ⛔ 不可以只問 `knockback`：`from:"pull"` 是**一段長度**而且走 GH#193 的距離
    //    減法（對拉是反的），它答不出「搬到哪」。`destination` 才是這件事的簽名欄位。
    probe: (f) => f.effectKinds.has("pull") && f.effectFields.has("destination"),
    evidence:
      "packages/shared/src/sim/effects/pull.ts —— `destination` 三檔（caster / point / anchorRing）。" +
      "⭐ 等分錨點環用一張**單位旋轉常數表**做（`RING_UNIT_ROTATION`），" +
      "因為 `sim/**` 禁止三角函式（`sim/purity.test.ts`）。" +
      "位移走的是 `knockback` 已經在用的 `nav.override` 地面滑行 + `world.knockdown` 行動鎖，" +
      "⛔ 沒有第二套位移機制。",
  },
  // ══ 2026-08-22 —— #551【移動中的模型特效】· #543【螢幕回饋】· #549【特效文字】══
  {
    key: "effect.spawn-model-fx@1",
    plan:
      "#551 —— owner 2026-08-22「w3x jass + 球體 + 蝗蟲群單位 3d model 特效" +
      "(ex. Saber 約束勝利之劍的翻滾光束就是)」",
    expected: "partial",
    // ⛔ 只問 `spawnModelFx` 這個名字不夠：一顆**命中即消失**的飛行物就是
    //    `spawnProjectile` 換一個名字，而外部編輯器分不出來。`onTouch`（穿透式、
    //    一人一次）才是「locust dummy」這件事的簽名欄位。
    probe: (f) => f.effectKinds.has("spawnModelFx") && f.effectFields.has("onTouch"),
    caveat:
      "⭐ **玩法那一半已經全部落地**：路徑求值、`onTouch` 的逐段取樣（穿透式、預設一人一次）、" +
      "`onArrive` 的落點結算，全部在 sim 裡，而且班表推進**既有的** `SimWorld.delayed`。" +
      "⛔ **還缺兩件，兩件都不在 `packages/shared` 裡**：" +
      "① 客戶端要真的把 `modelFxSpawn` 這個事件畫成一具會走、會自轉的模型" +
      "（`spinDegPerSec` / `scale` / `modelKey` 是**純視覺**參數，sim 一個字都不讀）；" +
      "② 那個事件要進 `apps/game-server/src/net/eventFanout.ts` 的白名單 —— " +
      "⚠️ 白名單是**靜默**的，少一行就是「做完、測過、出貨，遊戲裡不存在」。" +
      "⇒ 在那兩件到齊之前，用這個 kind 寫出來的技能**傷害會發生、畫面上什麼都沒有**。",
    evidence:
      "packages/shared/src/sim/effects/spawnModelFx.ts —— ⭐ 等分角度讀的是 `pull.ts` 的" +
      "`ringPoints` / `RING_UNIT_ROTATION`（單位旋轉常數表），因為 `sim/**` 禁止三角函式" +
      "（`sim/purity.test.ts`）。⭐ `onTouch` 與 `onArrive` 是**兩串**佇列而不是一串：" +
      "`delayedSystem` 的 `struck` 過濾同時套用在 `effects` 與 `finalEffects` 上，" +
      "掛成同一串會讓「被光束掃到的人不會被落點爆炸打到」。",
    nearestExisting:
      "⚠️ `spawnVfx` 是**定點**演出（不動、不打人）；`spawnProjectile` 是會被碰撞擋下來、" +
      "**命中即消失**的實體。原作那一族兩者都不是：它是一隻帶 Locust 的 dummy 單位，" +
      "每 tick 硬推固定距離、穿過身體不消失。",
  },
  {
    key: "effect.screen-feedback@1",
    plan: "#543 —— owner 2026-08-22「畫面閃爍及震動 不然都不知道發生什麼事情」",
    expected: "partial",
    // ⛔ 一半不算：owner 點名的是**閃爍與震動兩件事**，只做一件的引擎會讓對方
    //    做出一支「該震卻只閃」的技能，而它不會被任何東西拒絕。
    probe: (f) => f.effectKinds.has("screenFlash") && f.effectKinds.has("screenShake"),
    caveat:
      "⭐ sim 這一半只負責**什麼時候發、發給誰**（`applyTo`：self／victim／all，三個 kind 共用" +
      "同一支解析器）。⛔ **畫面那一半不在 `packages/shared` 裡**，而且有三件事必須到齊：" +
      "① 客戶端把 `screenFlash` / `screenShake` 畫出來；" +
      "② 兩個事件進 `apps/game-server/src/net/eventFanout.ts` 的白名單（⚠️ 白名單靜默失敗）；" +
      "③ ⭐ **`prefers-reduced-motion` 與後台強度上限**（`config.screen-cues@1`）—— " +
      "`amplitude` 是一個 **0..1 的正規化強度，⛔ 不是像素**，真正的位移量由那份 config 乘出來。" +
      "⇒ 寫卡片時 ⛔ 不要假設 `amplitude: 1` 在每一台機器上都會震同樣多；" +
      "它是「這一發相對於全域上限有多用力」，而不是一個絕對值。",
    evidence: "packages/shared/src/sim/effects/clientCues.ts（三個 kind 共用 `cueRecipients`）",
    nearestExisting:
      "⚠️ `spawnVfx` 是**世界裡**的一個定點演出 —— 玩家把鏡頭轉開就看不到，" +
      "而「我剛剛被打了」這件事不可以取決於鏡頭朝哪。⛔ 兩者不能互相代替。",
  },
  {
    key: "effect.floating-text@1",
    plan: "#549 —— owner 2026-08-22「別忘了還有特效文字」（原作 `CreateTextTagUnitBJ`）",
    expected: "partial",
    // ⛔ 只問 kind 不夠：一段**寫死**的字冒出來只解決一半。owner 點名的例子是
    //    克勞德的「1Hit…7Hit」，而那要求段號在**執行時**解析（`{{i}}`）。
    probe: (f) => f.effectKinds.has("floatingText") && f.effectFields.has("text"),
    caveat:
      "⭐ `text` 支援佔位符 **`{{i}}`**（這一次執行是序列裡的第幾段，1 起算），所以" +
      "「1Hit…7Hit」是 `comboStrikes.perStrike` 裡的**一個**節點寫 `\"{{i}}Hit\"`，" +
      "⛔ 不是七個各寫死一個數字的節點。段號來自 `EffectContext.sequenceIndex`" +
      "（由 `delayedSystem` 填），不在序列裡時解析成 **1**。" +
      "⛔ **缺的兩件**：① 客戶端把 `floatingText` 事件畫成一段會往上飄、會淡出的字；" +
      "② 該事件進 `eventFanout.ts` 的白名單。" +
      "⚠️ 它 ⛔ **不是傷害數字**（那一族由 `damage` 事件在客戶端自己算），" +
      "也 ⛔ 不是 UI 字串 —— 它掛在一個**身體**上（所以 `applyTo` 沒有 `all`）。",
    evidence:
      "packages/shared/src/sim/effects/clientCues.ts::resolveCueText + " +
      "sim/effects/delayed.ts（`sequenceIndex: index + 1`，⛔ 這是 `{{i}}` 唯一的來源）",
    nearestExisting:
      "⚠️ 引擎裡最接近的是 `damage` 事件驅動的浮動傷害數字，⛔ 但那是客戶端自己從" +
      "數值算出來的，作者寫不出「這一刀要冒什麼字」。",
  },
  // ⭐ 12 個「引擎完全沒有」的 —— 一個模板 + 一張參數表（第零守則⑨），
  //    ⛔ 不是 12 段各自會腐爛的散文。表在 {@link OWNER_ACTIONS_ABSENT}。
  ...OWNER_ACTIONS_ABSENT.map(
    (r): CapabilityEntry => ({
      key: r.key,
      plan: `GH#354 owner 2026-08-17 的 Action 清單 —— 「${r.owner}」`,
      expected: "unsupported",
      probe: anyKind(...r.probeNames),
      reason: r.reason,
      nearestExisting: r.nearest,
    }),
  ),
];

export interface RuntimeCapabilityManifest {
  readonly schema: typeof RUNTIME_CAPABILITIES_SCHEMA;
  /** 推導事實的穩定指紋；編輯器用它 pin base（計畫 §4.1 的 fingerprint）。 */
  readonly fingerprint: string;
  readonly effectKinds: readonly string[];
  readonly hookEvents: readonly string[];
  /** `condition@1` 的葉子種類 —— 對方要靠它知道哪些 typed condition 寫得出來。 */
  readonly conditionLeafKinds: readonly string[];
  /**
   * 條件葉的欄位名（所有分支聯集）—— 有些 typed condition 是**既有葉子多一格**
   * 而不是一顆新葉子（`minStacks`），只看 `conditionLeafKinds` 會漏掉它們。
   */
  readonly conditionLeafFields: readonly string[];
  /** `HookDef` 的欄位名 —— 一次性消耗、節流、機率這幾格在不在，看這裡。 */
  readonly hookFields: readonly string[];
  /**
   * effect kind 的欄位名（所有分支聯集）—— 有些 capability 是**既有 kind 多一格**
   * 而不是一個新 kind（`onHitTargets`），只看 `effectKinds` 會漏掉它們。
   */
  readonly effectFields: readonly string[];
  /**
   * 靈氣定義（`zAuraDef`）的欄位名 —— 靈氣**不在** effect union 裡，
   * 所以「這一圈能不能隨人數變強」這種能力只有這一格看得到。
   */
  readonly auraFields: readonly string[];
  /**
   * ⭐ **特效授權面**（GH#372）—— 形狀名 → 欄位名，全部從出貨的 Zod 推導。
   *
   * ⚠️ 這一格補的不是「一個新欄位」，是**整個面**：在它之前，`vfx@1` 的每一格
   * （`emitter` / `mode` / `blendMode` / `stretched` / `orient` …）與
   * `ability@1.vfxLayers[]` 的每一格覆寫（`w3xScale` / `alpha` / `timeScale` /
   * `tint` / `facingDeg` / `pitchDeg` …）對外部編輯器**一個字都不存在**。
   * 量到的（v0.20.5）：`convertTeam` 在兩份合約文件裡各出現 2 次，
   * **`orient` 兩份都是 0** —— effect kind 那一面是通的，特效那一面整片是空的。
   *
   * ⛔ 而它的失敗方式是最安靜的一種：對方不會收到任何錯誤，它只是**不知道有這些
   * 格子**，於是它產得出來的每一支技能都沒有特效參數。
   * `unsupported` 至少會被拒絕，這個連拒絕都沒有。
   *
   * 鍵是**授權的位置**（`vfx@1` / `vfx@1.orient` / `ribbon@1` /
   * `ability@1.vfxLayers[]` / `config.vfx-families@1.abilities[]`），⛔ 不是 Zod
   * 匯出名 —— 對方沒有這個 repo，它要的是「我在哪一份 JSON 的哪一層寫這一格」。
   */
  readonly vfxSurface: Readonly<Record<string, readonly string[]>>;
  /**
   * ⭐ **`ability@1` 自己的頂層欄位**（GH#380）—— `castType` / `range` /
   * `radius` / `cooldown` / `manaCost` / `targetsEnemies` / `slot` …
   *
   * ⚠️ 它在 GH#380 之前**算出來了卻沒有 return**（失敗形態②）。後果不是少一格：
   * effect 那一面寫得完整，而「**這一支是指定還是範圍、射得多遠**」對外部編輯器
   * 不存在 —— 它產出的每一支技能都只能拿引擎的預設，而且不會收到任何錯誤。
   *
   * ⛔ 它與 `docSurface["ability@1"]` 是**同一個陣列**（同一份 Zod 推導），
   * 所以兩者不可能漂開。
   */
  readonly abilityFields: readonly string[];
  /**
   * ⭐ **文件授權面**（GH#380）—— 形狀名 → 欄位名，和 {@link vfxSurface} 是同一個
   * 機制的第二張表（`ability@1` / `ability@1.marks[]` / `projectile@1` /
   * `status-effect@1` / `item@1` / `champion@1` / `template@1`）。
   *
   * `vfxSurface` 回答「這一招長什麼樣子」，這一格回答「**這一招本身是什麼**」。
   * 兩者都全部從出貨的 Zod 推導，⛔ 沒有手抄的欄位清單。
   */
  readonly docSurface: Readonly<Record<string, readonly string[]>>;
  readonly templateFamilies: readonly string[];
  readonly simCapabilities: Readonly<Record<string, { available: boolean; caveat?: string }>>;
  readonly planned: readonly {
    key: string;
    plan: string;
    state: CapabilityState;
    caveat?: string;
    reason?: string;
    evidence?: string;
    /** ⭐ 見 {@link CapabilityEntry.nearestExisting}。`unsupported` 一定有。 */
    nearestExisting?: string;
  }[];
  /** ⛔ 編輯器**不可以**產出用到這些的內容 —— 遊戲端會回 `unsupported-runtime`。 */
  readonly unsupported: readonly string[];
  /**
   * ⛔ **枚舉裡有、schema 收得下、但今天在出貨路徑上是壞的。**
   *
   * ── 為什麼這一格非有不可 ───────────────────────────────────────────────
   * 上面的 `effectKinds` / `hookEvents` / `conditionLeafKinds` 都是從出貨的
   * 註冊表**推導**的，所以它們回答的是「這個名字存不存在」。那是一個**名詞**問題。
   * 而「這個 hook 真的會發嗎」是一個**關係**問題（發射點 × 過濾閘），
   * 而 CLAUDE.md 的部署教訓正是：只驗名詞的檢查在相容性故障面前**必然是綠的**。
   *
   * 2026-08-08 的對抗複驗實測到兩個活例，兩個都會讓對方做出「上線就是死的」內容：
   *   · `onDeath` —— `DeathSystem` 先寫 `alive=false` 才 emit，而 `fireHooks`
   *     開頭就擋死人 → 出貨路徑上一次都不會發（GH#293）。
   *   · `onRevive` —— 廣播表對復活圈那條路取到圈圈的 entity id 而不是英雄（GH#294）。
   *
   * ⚠️ 它們不在 `unsupported` 裡是刻意的：`unsupported` 的語意是「遊戲端會**回報**
   * `unsupported-runtime`」，而這兩個會被**安靜地收下**。那是更危險的一類，
   * 所以要有自己的欄位，不能混進去。
   *
   * 每一筆都要帶 issue 編號 —— 沒有 issue 的「已知壞掉」只是另一句會過期的散文。
   */
  readonly knownBroken: readonly { token: string; what: string; issue: string }[];
  /**
   * ⭐【GH#534】**還收得下、但⛔ 不要再填的欄位** —— 名字 → 該改填哪一格。
   *
   * ⚠️ 這一格補的洞與 {@link knownBroken} 是同一族、但更安靜：`flat` **會生效**、
   * Zod **會收**、載入**不會報錯** —— 它唯一的問題是它是**第二個住處**
   *（CLAUDE.md 第〇·四守則）。⇒ 外部編輯器照 {@link effectFields} 那個聯集去填，
   * 得到的是一個「合法、能跑、而且在 owner 改公式表的那天不會跟著動」的數字。
   *
   * ⛔ 光把 `flat` 從 {@link effectFields} 拿掉是**錯的**：那個聯集是從出貨 Zod
   * 推導的「引擎收不收」，而它**真的收**。宣稱不存在＝那份清單開始說謊，
   * 而這個檔案的整個存在理由就是「一份會說謊的能力清單」。
   * ⇒ 保留它在聯集裡，另外**宣告一格政策**。
   *
   * ⚠️ 這一份**必須手寫**（同 {@link KNOWN_BROKEN}）：「這一格雖然能用但不該用」
   * 是一個**決策**，推導不出來。代價是它會過期，所以每一筆帶 issue。
   */
  readonly deprecatedFields: readonly DeprecatedField[];
}

/** {@link RuntimeCapabilityManifest.deprecatedFields} 的一筆。 */
export interface DeprecatedField {
  /** 欄位名 —— 必須真的在 {@link RuntimeCapabilityManifest.effectFields} 裡。 */
  readonly field: string;
  /** 在哪一層／哪一族上不要填（同一個名字在別處可能完全正常）。 */
  readonly where: string;
  /** 改填哪一格 —— 必須是一個真的存在的欄位。 */
  readonly useInstead: string;
  /** 為什麼。⛔ 一個能被反駁的理由，不是「我們比較喜歡」。 */
  readonly why: string;
  /** ⭐ 仍然可以填的例外**判準**。⛔ 這裡不列名單（名單住豁免表，它會動）。 */
  readonly exceptions: readonly string[];
  readonly issue: string;
}

/**
 * {@link RuntimeCapabilityManifest.deprecatedFields} 的內容。
 *
 * ⭐ 這裡**一個級距數字都沒有**，而且⛔ 不列被豁免的節點名單 —— 兩者都會動，
 * 而這份契約的 `--check` 是逐位元組比對：把會動的東西寫進來，就是叫別人
 * 每天重新匯出一次一份沒有變的契約。數字在 `config.damage-tiers@1`，
 * 名單在豁免表，這裡只留**規則**。
 */
export const DEPRECATED_FIELDS: readonly DeprecatedField[] = [
  {
    field: "flat",
    where: "傷害系 effect 的 `amount`（`Scaling`）—— damage / damageArea / damageLine / dot / chainLightning",
    useInstead: "damageTier",
    why:
      "傷害五級距（`config.damage-tiers@1`）在**註冊時**把級別翻成數字，" +
      "⛔ 是**取代**不是相加 —— 兩格都填的那一份，`flat` 一個位元都不會被讀。" +
      "而且它是同一個值的**第二個住處**：owner 改一次公式表，填了級別的全庫跟著動，" +
      "填了字面值的那幾支不動，**沒有任何一步會報錯**。",
    exceptions: [
      "① 這個數字根本不是傷害（護盾／治療／耗魔）—— 五級距只有傷害一條軸",
      "② 判定用的一點（範圍／直線技用一個極小值當「有沒有打到」）—— 作用是觸發不是輸出",
      "③ 持續傷害的每一跳（`dot`）—— 級距錨的是**一次施法**的總量",
      "④ per-hit rider（法球效應／每次普攻追加／多段命中各打一次）",
      "⭐ ④ 的判準是「**這個數字一次施法會發生幾次？**」——" +
        "⛔ 不是「它的 kind 是不是傷害」。大於一次的就不屬於單發五級距。",
      "⚠️ 完整的分類鍵與逐筆理由在遊戲端的豁免表（`config.damage-tier-exemptions@1`）," +
        "⛔ 這裡只放判準：名單會動，而這份契約是逐位元組比對的。",
    ],
    issue: "GH#534",
  },
  {
    field: "perRank",
    where: "同上 —— 傷害系 effect 的 `amount`",
    useInstead: "damageTier",
    why:
      "與 `flat` 同一條規則、同一個取代路徑。⚠️ 額外一句：填了級別 = **每一階同一個值**，" +
      "所以「升階傷害變高」現在由 `ratios` / `attrRatios` 那一面負責，" +
      "⛔ 不是回頭手寫一條逐階陣列。",
    exceptions: ["同 `flat` 的四類"],
    issue: "GH#534",
  },
];

/**
 * {@link RuntimeCapabilityManifest.knownBroken} 的內容。
 *
 * ⛔ 這一份**必須手寫** —— 沒有辦法從註冊表推導出「它會不會真的發」，
 * 那正是它存在的理由。代價是它會過期，所以每一筆的 issue 關掉時要回來刪。
 */
export const KNOWN_BROKEN: readonly { token: string; what: string; issue: string }[] = [
  {
    token: "hook:onDeath",
    what:
      "⚠️ **一半修好，一半沒有 —— 兩半的成因不同，不要只讀一句結論。** " +
      "✅ **英雄那一半已修（GH#293）**：`WorldHookSystem` 的【死亡】那一列填了 " +
      "`firesWhenOwnerDead: true`，`fireHooks` 的存活閘改成逐事件放行，所以「自己死亡時 ⋯」寫得出來。" +
      "⛔ **小怪（`world.mob`）那一半仍然掛不上去，但成因在 2026-08-09 換了一個** —— " +
      "⚠️ 這一段先前寫的是「`mobSystem`（slot 9d′）在 `worldHookSystem`（9f）之前就 `destroy` 掉屍體」，" +
      "**那個成因已經被 GH#296 修掉了**（`MobSystem` 兩處改成 `destroyAfterHooks`，屍體留到 slot 9g）。" +
      "留著這句過期的理由比沒有理由更糟：對方會照一個假的閘去繞路，而真正的閘在別的地方。" +
      "**真正的閘是**：`spawnMobBody` 沒有 `world.stats.set`（殭屍沒有屬性表，owner 2026-08-04 的 A3a 裁決），" +
      "而 `attachSource` 第一句就是 `if (!sc) return` —— 所以沒有任何內容掛得上小怪的 onDeath。" +
      "⭐ 這是**被守著的**，不是疏忽：`mobs.statusVsStats.test.ts` 逐字斷言 `world.stats.has(mob) === false`。" +
      "→ 「殺死小怪時 ⋯」用 `onKill`（會發，掛在擊殺者身上）；" +
      "「**小怪死亡時** ⋯」要等殭屍拿到屬性表，⛔ 不可以用 `onKill` 近似 —— 沒有擊殺者的死亡它一次都不會發。",
    issue: "GH#296",
  },
  // GH#293 已修（`WorldHookSystem` 的【死亡】那一列填了 `firesWhenOwnerDead: true`，
  // `fireHooks` 的存活閘改成逐事件放行），所以 `hook:onDeath` 的**英雄那一半**撤掉 ——
  // 但小怪那一半（成因不同，見上面那一筆）仍然壞著，GH#296 開好之後加回來了。
  // ⚠️ 這裡示範了這張表最危險的失效方式：`onDeath` 是**一個 token 兩個實作**，
  // 寫「已修」或寫「壞掉」都只有一半是真的，而兩種寫法都會讓對方做出錯的決定
  // （前者做出上線就是死的內容，後者連能用的那一半也不敢用）。
  //
  // GH#294 已修（`reviveComplete` 那一列的 `actorKey` 從 `"id"`（圈圈）改成
  // `"ownerId"`（英雄）），所以 `hook:onRevive` 這一筆撤掉。
  //
  // GH#295 已修（`applyBuff.dispellable` / `.polarity` 兩格 authoring 欄位補上，
  // `applyBuff.ts` 真的寫進 `ModifierSource`），所以 `effect:dispel.pools.buffs`
  // 這一筆從這裡撤掉 —— 這份清單的規矩就是「issue 關掉時回來刪」。
  // ⚠️ `pools.shields` 從來不是壞的：它在 `polarity:"debuff"` 下整池跳過是刻意的
  // （護盾沒有極性，一發「解自己身上的減益」不該吃掉自己的盾），寫 `"any"`/`"buff"`
  // 或用 `shieldBreak` 就打得到。那是一句要寫在欄位說明裡的話，不是一筆已知壞掉。
];

/**
 * 走一棵 Zod union 收集每個分支的 `kind` 字面量。
 *
 * ⚠️ 要遞迴，因為 `zConditionLeaf` 的分支自己也可能是 union
 *（`zStatLeaf` / `zStatusLeaf` / `zEquipmentLeaf` 各是兩格的 union）。
 * 純函式：只讀 Zod 物件的 `_def`，沒有 I/O、沒有時鐘。
 *
 * ⛔ 為什麼不手打一張葉子清單：那就是這份檔案檔頭說「一定會撒謊」的東西。
 * 別人（另一路）今天正在 `schema/condition.ts` 加葉子，這裡自己會跟上。
 */
function literalKindsOf(schema: unknown, out: Set<string>): void {
  const node = schema as
    | { _def?: { typeName?: string; schema?: unknown }; options?: readonly unknown[]; shape?: Record<string, unknown> }
    | undefined;
  const typeName = node?._def?.typeName;
  if (typeName === "ZodEffects") {
    literalKindsOf(node?._def?.schema, out);
    return;
  }
  if (typeName === "ZodUnion" || typeName === "ZodDiscriminatedUnion") {
    for (const o of node?.options ?? []) literalKindsOf(o, out);
    return;
  }
  if (typeName === "ZodObject") {
    const k = node?.shape?.["kind"] as { _def?: { typeName?: string }; value?: unknown } | undefined;
    if (k?._def?.typeName === "ZodLiteral" && typeof k.value === "string") out.add(k.value);
  }
}

/**
 * 走同一棵 union 收集每個分支的**欄位名**（{@link literalKindsOf} 的姊妹）。
 *
 * ⛔ 為什麼不共用一支函式回 `{kinds, fields}`：`literalKindsOf` 只在看到
 * `kind` 字面量時才收，而這裡要收的是**每個物件分支的所有鍵**（含 `.strict()`
 * 包起來的與 optional 的）。硬塞成一支會長出一個 mode 參數，而兩種收法的
 * 終止條件不同 —— 那正是 CLAUDE.md 說的「同一件事兩種問法遲早分歧」的反面：
 * 這是兩件事，就該是兩支。
 */
function leafFieldsOf(schema: unknown, out: Set<string>): void {
  const node = schema as
    | { _def?: { typeName?: string; schema?: unknown }; options?: readonly unknown[]; shape?: Record<string, unknown> }
    | undefined;
  const typeName = node?._def?.typeName;
  if (typeName === "ZodEffects") {
    leafFieldsOf(node?._def?.schema, out);
    return;
  }
  if (typeName === "ZodUnion" || typeName === "ZodDiscriminatedUnion") {
    for (const o of node?.options ?? []) leafFieldsOf(o, out);
    return;
  }
  if (typeName === "ZodObject") {
    for (const k of Object.keys(node?.shape ?? {})) out.add(k);
  }
}

/** FNV-1a over the derived facts. 純函式、無時鐘、無 I/O。 */
function fingerprintOf(parts: readonly string[]): string {
  let h = 0x811c9dc5;
  for (const s of parts) {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x1f;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * {@link RuntimeCapabilityManifest.vfxSurface} 的來源表 —— **一張表，⛔ 不是五段程式**
 *（第零守則⑨：N 個同型項目 = K 個模板 + 一張表）。
 *
 * 每一列只有兩格：對方在 JSON 裡寫這一格的**位置**，以及出貨的 Zod 物件。
 * 欄位名由 {@link leafFieldsOf} 從那個物件推導，所以新增一格 schema 欄位不必回來
 * 改這裡 —— 只有**多開一個授權位置**才需要加一列。
 */
const VFX_SURFACE_SHAPES: readonly SurfaceShape[] = [
  { key: "vfx@1", schema: zVfxDoc },
  { key: "vfx@1.orient", schema: zVfxOrient },
  { key: "ribbon@1", schema: zRibbonDoc },
  /**
   * ⭐ GH#392 —— 「**穿在骨頭上的模型**」。owner 2026-08-19 點名的那三件事
   * （附著 · 跟隨 · 播動畫）在合約上的位置。⛔ 它**不是** `vfx@1` 的一格：
   * 一份掛件沒有 emitter、沒有 lifetimeSec，硬塞進粒子文件會讓外部編輯器
   * 產出一份執行期只會靜靜跳過的東西。
   */
  { key: "attachment@1", schema: zAttachmentDoc },
  { key: "ability@1.vfxLayers[]", schema: zAbilityVfxLayer },
  { key: "config.vfx-families@1.abilities[]", schema: zVfxAbilityFamilyBinding },
  /**
   * ⭐ GH#390 —— **家族原型**那一層。它在這之前整片不在合約裡，而它才是
   * 「K 個模板」的那一半：21 個原型決定形狀、顏色、大小、高度**與四個時機的音效**，
   * 258 支技能只是覆寫。⛔ 只暴露 `abilities[]` 的話，外部編輯器看得到覆寫、
   * 看不到被覆寫的那個東西。
   */
  { key: "config.vfx-families@1.families[]", schema: zVfxFamilyTuning },
  /**
   * ⭐ GH#384 —— **哪一支技能畫哪一組特效**。這是三張 TypeScript 常數表（617 筆
   * 逐 id 綁定）搬進 `content/` 之後長出來的授權面：在它之前，外部編輯器連
   * 「這一招用哪個家族原型／哪一個 `fx.prim` 顏色形狀」都問不到 —— 那些字面上
   * 不在任何一份 JSON 裡，⛔ 而它不會收到任何錯誤。
   *
   * ⚠️ 鍵刻意**沒有 `[]`**：`bindings` 是一張以技能 doc id 為鍵的**表**，不是陣列。
   */
  { key: "config.vfx-ability-art@1.bindings.prim", schema: zVfxPrimBinding },
  { key: "config.vfx-ability-art@1.bindings.family", schema: zVfxFamilyBinding },
  /**
   * ⭐ GH#431 —— **owner 的設計覆寫**那一格。它必須在合約裡，理由和 `family`
   * 那一格**不一樣**：`family` 是外部編輯器「讀得到證據」，這一格是它
   * **唯一寫得下設計決定的地方** —— 少了它，編輯器只能去改證據那一格，
   * 而那會被反捏造守衛擋掉，⛔ 而且它不會知道自己為什麼被擋。
   */
  { key: "config.vfx-ability-art@1.bindings.owner", schema: zVfxOwnerBinding },
  { key: "config.vfx-ability-art@1.bindings.promoted", schema: zVfxPromotedBinding },
];

/**
 * {@link RuntimeCapabilityManifest.docSurface} 的來源表（GH#380）——
 * **同一張表的形狀，⛔ 不是六段新程式**。
 *
 * ⚠️ 這一批補的洞和 GH#372 是**同一個**，只是位置不同：v0.20.6 之後特效參數進了
 * 合約，而「**這一支技能本身**長什麼樣」還是空的。量到的（v0.20.6，兩份文件）：
 * `castType` / `projectileKey` / `hitRadius` / `craftRole` / `authoringNote`
 * **全部 0/0**。
 *
 * ⛔ 後果比少一個欄位嚴重得多：`castType`（指定／範圍／自身）與 `range` 是一支
 * 技能**能不能被施放**的形狀。effect 那一面寫得再完整，外部編輯器不知道有這幾格，
 * 它產出的技能就只能拿引擎的預設 —— 而且**不會收到任何錯誤**。
 * `status-effect@1` 那一列更直接：欄位是 0 就代表對方**做不出新狀態**。
 *
 * ⭐ 鍵是**授權的位置**（你在哪一份 JSON 的哪一層寫它），⛔ 不是 Zod 匯出名。
 * `ability@1.marks[]` 是巢狀的一層（`item@1.marks[]` 用的是**同一份** spec）——
 * 只看 `ability@1` 只看得到 `marks` 這個名字，看不到裡面那八格。
 */
const DOC_SURFACE_SHAPES: readonly SurfaceShape[] = [
  { key: "ability@1", schema: zAbilityDef },
  { key: "ability@1.marks[]", schema: zMarkSpec },
  { key: "projectile@1", schema: zProjectileDoc },
  { key: "status-effect@1", schema: zStatusEffectDoc },
  { key: "item@1", schema: zItemDoc },
  { key: "champion@1", schema: zChampionDoc },
  { key: "template@1", schema: zTemplateDoc },
];

interface SurfaceShape {
  readonly key: string;
  readonly schema: unknown;
}

/**
 * 一張表 → 一個授權面。**兩張表共用這一支**（第零守則⑨）。
 *
 * ⛔ 空集合一定要吵：`zVfxDoc` / `zMarkSpec` / `zChampionDoc` 這幾份是
 * `.superRefine()` 包起來的（ZodEffects），有人在上面再多包一層的那天，
 * `leafFieldsOf` 會安靜地回一個空集合 —— 而**空的授權面看起來就跟「這個面
 * 不存在」一模一樣**，那正是 GH#372／#380 的形狀：沒有錯誤，只是不存在。
 */
function deriveSurface(shapes: readonly SurfaceShape[], what: string): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = {};
  for (const s of shapes) {
    const set = new Set<string>();
    leafFieldsOf(s.schema, set);
    if (set.size === 0) {
      throw new Error(
        `⛔ ${what}「${s.key}」的欄位推導回了空集合 —— 幾乎一定是有人在那個 Zod ` +
          "物件上多包了一層（ZodEffects / ZodPipeline）。修 editorCapabilities.ts 的那張表，" +
          "⛔ 不要讓這一列靜靜地變成空的：外部編輯器看不到我們的 registry，" +
          "它不會發現這些格子不見了，只會做出一批沒有這些格子的內容。",
      );
    }
    out[s.key] = [...set].sort();
  }
  return out;
}

/**
 * 從**出貨的註冊表**建出能力清單。
 *
 * ⚠️ 每一格都排序過：這份文件會被 hash 並被外部專案 pin，
 * 而 `Object.keys` 的順序不是規格的一部分。
 */
export function buildCapabilityManifest(): RuntimeCapabilityManifest {
  const effectKinds = Object.keys(EFFECT_HANDLERS).sort();
  const hookEvents = [...zHookEvent.options].sort();
  // 條件葉與 hook 欄位 —— 兩張表都從出貨的 Zod 物件推導（見 `literalKindsOf` 的檔頭）。
  const conditionLeafSet = new Set<string>();
  literalKindsOf(zConditionLeaf, conditionLeafSet);
  const conditionLeafKinds = [...conditionLeafSet].sort();
  const conditionFieldSet = new Set<string>();
  leafFieldsOf(zConditionLeaf, conditionFieldSet);
  const conditionLeafFields = [...conditionFieldSet].sort();
  const hookFields = Object.keys(zHookDefBase.shape).sort();
  // ⛔ 一定要傳 `zEffectDefUnion`（ZodDiscriminatedUnion），不是 `zEffectDef`
  //（那是 ZodLazy，`leafFieldsOf` 走不進去，會安靜地回一個空集合）。
  const effectFieldSet = new Set<string>();
  leafFieldsOf(zEffectDefUnion, effectFieldSet);
  const effectFields = [...effectFieldSet].sort();
  // 靈氣不在 effect union 裡（見 `CapabilityProbeInput.auraFields`）。
  // ⚠️ `zAuraDef` 是 `z.object(…).superRefine(…)` ⇒ ZodEffects，`.shape` 拿不到，
  //    要先剝一層 `.innerType()`。⛔ 它只剝**一層** —— 哪天有人在 `zAuraDef` 上再加
  //    一層 refine，這裡會回一個空集合而**不會報錯**（`schema/item.ts` 的
  //    `zItemAuraDef` 是同一個坑，2026-08-18 已經踩過一次）。所以下面顯式檢查空集合。
  const auraFieldSet = new Set<string>(Object.keys(zAuraDef.innerType().shape));
  if (auraFieldSet.size === 0) {
    throw new Error(
      "⛔ `zAuraDef` 的欄位推導回了空集合 —— 幾乎一定是有人在它上面多包了一層 " +
        "ZodEffects（`.innerType()` 只剝一層）。修 editorCapabilities.ts 的這一行，" +
        "⛔ 不要讓 `auraFields` 靜靜地變成空的：那會讓每一列靈氣 capability 自動宣告「引擎沒有」。",
    );
  }
  const auraFields = [...auraFieldSet].sort();
  // 特效授權面（GH#372）。⚠️ `zVfxDoc` 是 `.superRefine()` ⇒ ZodEffects，`.shape`
  // 拿不到 —— `leafFieldsOf` 自己會剝那一層。空集合 = 有人在上面多包了一層，
  // ⛔ 不可以讓它靜靜地變成空的（那會讓整個特效面**又一次**從合約裡消失，
  // 而這正是 GH#372 的形狀：沒有錯誤，只是不存在）。
  const vfxSurface = deriveSurface(VFX_SURFACE_SHAPES, "特效授權面");
  // 文件授權面（GH#380）—— 同一支推導器，第二張表。
  const docSurface = deriveSurface(DOC_SURFACE_SHAPES, "文件授權面");
  // ⭐ `ability@1` 的頂層欄位名。⛔ 這裡**不再**自己算一次 `Object.keys(zAbilityDef.shape)`
  //    —— 那會是第二個住處，而它和 `docSurface["ability@1"]` 是同一個問題的同一個答案。
  //    ⚠️ 它在 GH#380 之前**算了但沒 return**（失敗形態②：算出來了但從沒送到讀者手上，
  //    而這份文件的讀者是另一個專案）。
  const abilityFields = docSurface["ability@1"]!;
  const simCapabilities: Record<string, { available: boolean; caveat?: string }> = {};
  for (const key of Object.keys(SIM_CAPABILITIES).sort()) {
    const c = SIM_CAPABILITIES[key]!;
    simCapabilities[key] = {
      available: c.available,
      ...(c.caveat !== undefined ? { caveat: c.caveat } : {}),
    };
  }
  // 家族名從 `SIM_CAPABILITIES` 拿不到（那是能力不是家族），所以問展開器本人。
  // 這裡不讀檔案（純度）：家族清單由呼叫端傳模板文件時再補，缺席時給空陣列。
  const templateFamilies = FAMILY_PROBE_LIST.filter(isExpandable).sort();

  const facts: CapabilityProbeInput = {
    effectKinds: new Set(effectKinds),
    hookEvents: new Set(hookEvents),
    simCapabilities: new Set(Object.keys(simCapabilities).filter((k) => simCapabilities[k]!.available)),
    abilityFields: new Set(abilityFields),
    conditionLeafKinds: conditionLeafSet,
    conditionLeafFields: conditionFieldSet,
    hookFields: new Set(hookFields),
    effectFields: effectFieldSet,
    auraFields: auraFieldSet,
    vfxFields: new Set(Object.values(vfxSurface).flat()),
  };

  const planned = PLANNED_CAPABILITIES.map((e) => ({
    key: e.key,
    plan: e.plan,
    state: e.expected,
    ...(e.caveat !== undefined ? { caveat: e.caveat } : {}),
    ...(e.reason !== undefined ? { reason: e.reason } : {}),
    ...(e.evidence !== undefined ? { evidence: e.evidence } : {}),
    // ⭐ 一定要送出去。填了卻沒進 manifest = 七種失敗形態的第 ② 種
    //（算出來了但從沒送到讀者手上），而這份文件的讀者是另一個專案。
    ...(e.nearestExisting !== undefined ? { nearestExisting: e.nearestExisting } : {}),
  }));
  void facts;

  return {
    schema: RUNTIME_CAPABILITIES_SCHEMA,
    fingerprint: fingerprintOf([
      ...effectKinds,
      ...hookEvents,
      ...conditionLeafKinds,
      // 欄位也折進指紋：`minStacks` 這種「既有葉子多一格」的 capability 不會改動
      // 任何一個 kind，指紋不含它的話對方 pin 的 base 會在契約真的變了的那天不動。
      ...conditionLeafFields,
      ...hookFields,
      // 同一個理由：`onHitTargets` 這種「既有 kind 多一格」的 capability 不會改動
      // 任何一個 kind 名，指紋不含它的話對方 pin 的 base 會在契約真的變了的那天不動。
      ...effectFields,
      // 同一個理由：`scaleByNearby` 這種「靈氣多一格」的 capability 不改動任何一個
      // kind 名，指紋不含它的話對方 pin 的 base 會在契約真的變了的那天不動。
      ...auraFields,
      // 同一個理由，而且這一族是**整個面**：`orient` / `swirlDegPerSec` 這種格子
      // 不改動任何一個 effect kind 名，指紋不含它們的話，特效授權面整片改過了
      // 而對方 pin 的 base 完全不動。
      ...Object.entries(vfxSurface).map(([k, v]) => `vfx:${k}=${v.join(",")}`),
      // 同一個理由，而且這一族更靠近核心：`castType` / `hitRadius` / `craftRole`
      // 這些格子不改動任何一個 effect kind 名，指紋不含它們的話，「一支技能長什麼樣」
      // 整片改過了而對方 pin 的 base 完全不動。
      ...Object.entries(docSurface).map(([k, v]) => `doc:${k}=${v.join(",")}`),
      ...templateFamilies,
      ...PLANNED_CAPABILITIES.map((e) => `${e.key}=${e.expected}`),
      // 已知壞掉的清單也折進指紋：一筆進來或修好離開，對方 pin 的 base 就該換。
      ...KNOWN_BROKEN.map((b) => `broken:${b.token}=${b.issue}`),
      // ⭐ GH#534 —— 政策也折進指紋：一格從「隨你填」變成「⛔ 不要再填」，
      // 對方 pin 的 base 就該換。⛔ 少了這一行，這條規則進來的那天契約指紋不動，
      // 而對方會繼續照舊的規則產內容 —— 而且不會收到任何錯誤。
      ...DEPRECATED_FIELDS.map((d) => `deprecated:${d.field}→${d.useInstead}=${d.issue}`),
    ]),
    effectKinds,
    hookEvents,
    conditionLeafKinds,
    conditionLeafFields,
    hookFields,
    effectFields,
    auraFields,
    abilityFields,
    vfxSurface,
    docSurface,
    templateFamilies,
    simCapabilities,
    planned,
    unsupported: PLANNED_CAPABILITIES.filter((e) => e.expected === "unsupported")
      .map((e) => e.key)
      .sort(),
    knownBroken: KNOWN_BROKEN,
    deprecatedFields: DEPRECATED_FIELDS,
  };
}

/**
 * 出貨模板家族的候選名單。
 *
 * ⚠️ `FAMILIES` 在 `expand.ts` 裡**沒有匯出**，而這份清單要進對外契約，
 * 所以這裡列出候選再用 `isExpandable()` 過濾 —— 過濾器是出貨的那一個，
 * 所以「宣稱可展開但其實不能」不可能發生。多列一個不存在的名字是安全的
 * （會被濾掉），漏列一個才是問題 —— `editorCapabilities.test.ts` 用
 * `content/ability-templates/` 的實際家族名比對，漏了就紅。
 */
const FAMILY_PROBE_LIST: readonly string[] = [
  "barrier-domain", "beam-roll", "buff-self", "blink-strike", "channel-beam", "charge-push",
  "data-no-trigger", "death-mechanic", "drain-leech", "global-rule", "ground-nova",
  "growth-charge", "instant-blast", "leap-strike", "life-manipulate", "line-sweep",
  "lock-combo", "mark-stacks", "on-attack", "on-hit-react", "orbit-array",
  "periodic-field", "proxy-cast", "proxy-fanout", "pull-throw", "pure-cosmetic",
  "random-barrage", "range-gamble", "resource-ops", "single-strike", "strip-transform",
  "summon-agent", "team-synergy", "teleport", "traveling-wave",
];

/** probe 的實際結果 —— 守衛用它跟 `expected` 對帳。 */
export function probeCapability(e: CapabilityEntry): boolean {
  const m = buildCapabilityManifest();
  return e.probe({
    effectKinds: new Set(m.effectKinds),
    hookEvents: new Set(m.hookEvents),
    simCapabilities: new Set(
      Object.keys(m.simCapabilities).filter((k) => m.simCapabilities[k]!.available),
    ),
    abilityFields: new Set(Object.keys(zAbilityDef.shape)),
    conditionLeafKinds: new Set(m.conditionLeafKinds),
    conditionLeafFields: new Set(m.conditionLeafFields),
    hookFields: new Set(m.hookFields),
    effectFields: new Set(m.effectFields),
    auraFields: new Set(m.auraFields),
    vfxFields: new Set(Object.values(m.vfxSurface).flat()),
  });
}

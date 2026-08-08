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
import { zHookEvent, zHookDefBase } from "./schema/effect";
import { SIM_CAPABILITIES, isExpandable } from "./templates/expand";
import { zAbilityDef } from "./schema/ability";
import { zConditionLeaf } from "./schema/condition";

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
   * `HookDef` 的欄位名，從出貨的 `zHookDefBase.shape` 推導。
   *
   * ⚠️ `hook.consume-policy@1`（「下一次普攻」用掉就沒了）也不是 kind 或 event，
   * 它是 hook 自己身上的幾格（`maxTriggers` / `consumeOn` / …）。
   */
  readonly hookFields: ReadonlySet<string>;
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
 * 計畫 §12 G4 點名的 capability，逐筆對帳。
 *
 * ⛔ **這張表的順序與內容跟著 `main_load_editor_plan.md` 走**，不要按「我們做了
 * 什麼」重排 —— 對方是照計畫的章節找東西的。
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
      "⛔ 但**火圈燒傷攔不到** —— `FireRingSystem` 直寫 `hp.hp -=` 不走傷害佇列（無敵也一樣擋不住）。",
    evidence: "packages/shared/src/sim/combat/lethalSave.ts + lethalSave.test.ts（兩個突變都驗過）",
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
    evidence: "content/schema/effect.ts 的 zHookEvent",
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
      "守衛 packages/shared/src/sim/effects/lane1Kinds.test.ts。",
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
      "`devour`（`sim/effects/devour.ts` + `content/schema/effect.ts` 的 `devour` 分支）—— " +
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
      "（抵不完的部分原封不動往下走進 免死 → 血條）。三個決策點都是欄位" +
      "（`perMana` / `damageTypes` **必填明列** / `minManaReserve`）。" +
      "⛔ 但**接線還沒接**：它要 `combat/damage.ts` 的佇列排空迴圈呼叫一次（護盾池之後、免死之前），" +
      "而那支檔案不屬於這一路 —— 在那一行進去之前，44-00 掛得上但擋不了任何傷害。" +
      "要插的那一行與確切位置寫在 `sim/effects/manaBarrier.ts` 檔頭②。",
    evidence: "packages/shared/src/sim/effects/manaBarrier.ts + lane2Kinds.test.ts",
  },
  {
    key: "effect.control-restriction@1",
    plan: "§12 G4",
    expected: "unsupported",
    probe: has("controlRestriction"),
    nearestExisting:
      "`applyStatus` 的五個獨立布林（root / stun / silenced / berserk / feared）—— " +
      "它們**真的擋得住**移動、施法與普攻，所以「臥草泥馬不能動」寫得出來。" +
      "⛔ 不算數的理由是它不是一張表：計畫要的 move / basicAttack / cast / playerOrders / AI control " +
      "五個維度**不能分開組合**，每多一種控制就多一個布林，而「這個狀態擋住哪幾種行為」" +
      "散落在各個消費端的 `if` 裡。",
    reason:
      "`applyStatus` 目前有 root / stun / silenced / berserk / feared 五個獨立布林" +
      "（`feared` 是 2026-08-08 為 89-002 俄羅斯輪盤與 52-02/04/002 加的），" +
      "但**沒有可組合的 typed 控制限制模型** —— 每多一種控制就多一個布林，" +
      "而「這個狀態擋住哪幾種行為」散落在各個消費端的 if 裡，不是一張表。",
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
      "⛔ 但**接線還沒接**：`randomAreaSystem` 要被掛進 `SimWorld.step()` 的 7c″" +
      "（`intervalHookSystem` 之後、`combatResolveSystem` 之前），而 `SimWorld.ts` 不屬於這一路 —— " +
      "在那一行進去之前，13-04 / 70-04 排得出來但不會落地。見 `sim/effects/randomArea.ts` 檔頭④。" +
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
    expected: "unsupported",
    // ⚠️ 收四個候選名而不是一個 —— 見檔頭 ③：單一名字猜錯就永遠回 false。
    probe: anyHookField("maxTriggers", "consumeOn", "expiresAt", "perTarget"),
    nearestExisting:
      "`zHookDefBase` 的 `internalCooldown` / `internalCooldownScope` / `chance` / `chanceFrom` —— " +
      "節流與機率都有；限時也有（`schema/effect.ts` 自己的註解就寫著「要限時，把這個 hook 掛在一個帶 " +
      "`expiresAtTick` 的 buff source 上」）。" +
      "⛔ 不算數的理由是這些全部是**時間**與**機率**，不是**次數**：一條掛在 5 秒 buff 上的 " +
      "`onBasicAttack` hook，在攻速 4 的英雄身上會觸發 20 次，而卡上寫的是「下一次」。" +
      "`consumeOn` 的 `success` / `attempt` 之分（打空算不算用掉）也沒有任何欄位表達得出來。",
    reason:
      "一次性消耗沒有形狀 —— `maxTriggers` / `consumeOn` / `expiresAt` / `perTarget` 四格都不存在。" +
      "⛔ 不可以用 `internalCooldown` 近似成「每 N 秒一次」：攻速快的英雄會**多觸發**、" +
      "慢的會**漏觸發**，而兩種錯法在畫面上都看不出來（它只是偶爾多打或少打一下）。",
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
      "② `incomingPct.perRank` 的上界是 `INCOMING_PCT_MAX = 5`，所以「7 倍」要靠" +
      "`amount` 那一項補，不能寫成單一個 7。" +
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
    expected: "unsupported",
    probe: has("targetSetChain"),
    nearestExisting:
      "`shapeTargets`（每個 effect 自己解目標，`side: allies|enemies` 已經分得開敵我）+ " +
      "上游傳下來的 `ctx.targets`。⛔ 不算數的理由是計畫要的是**兩個具名 target set 同一 tick 並存** —— " +
      "而 `ctx.targets` 只有**一個**且是 mutable，所以「ally selector 回 MP、enemy selector 造成傷害」" +
      "今天只能靠後者覆寫前者，兩組必然互相汙染。",
    reason:
      "selector 選出的 victims 沒辦法安全傳進 nested Product chain。" +
      "現況：`shape:\"circle\"` 只在**單一 effect 內**解目標，跨 effect 傳遞要靠上游 ctx.targets。",
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
    expected: "unsupported",
    probe: has("dashOnEnd"),
    nearestExisting:
      "`leap.onLand` —— **固定落點**的版本今天就精確表達得出來（`sim/effects/leap.ts`，#247 那一批）。" +
      "⛔ 不算數的只有 collision-aware 的那一版（「撞到東西就停在那裡」），而計畫 §16.7 自己說" +
      "那要等 owner 選定停止語意才做。",
    reason:
      "計畫自己說這個**只有在 owner 選擇 collision-aware 停止語意時才要做**；" +
      "固定落點的案例用既有 `leap.onLand` 就精確表達得出來。⛔ 在 §16.7 freeze 前不要宣告它。",
  },
  {
    key: "state.exclusive-group@1",
    plan: "§12 G4 · §16.15（涅吉三形態）",
    expected: "partial",
    // 【變身】的互斥不是一個 effect kind，它是 `championForm` 這個 kind 的**結構**：
    // `SimWorld.championForm` 是 `Map<EntityId, ChampionFormComp>`（一實體一格），
    // 身體只有一個 `championId`，而 `setBody` 是唯一的寫入者。所以 kind 在 ⇒ 互斥在。
    probe: (f) => f.effectKinds.has("championForm"),
    caveat:
      "✅ 15-02/03/04 逐字寫的「([變身]為唯一狀態不可疊加)」**對變身成立，而且是結構性的**：" +
      "一個實體只有一格形態、一個身體只有一個 `championId`，所以第二個形態不可能與第一個" +
      "並存 —— ⛔ 技能文件**不需要、也不應該**自己檢查「我是不是已經變身了」。" +
      "重複進入時「舊形態的剩餘時間怎麼辦」是欄位（`champion@1.transform.reenter`：" +
      "`restart` / `keepLongest` / `reject`），預設 = 出貨現況，被回絕會走 `castRejected`。" +
      "⛔ 仍缺兩件，**涅吉三形態今天仍然表達不出來**：" +
      "① **它只是【變身】的互斥，不是泛化的互斥狀態群** —— 沒有「這三個 buff 互斥」的模型，" +
      "而 15-02/03/04 讀起來更像三個**屬性狀態**（移速倍率／攻速％／普攻附加傷害）而不是三個 3D body；" +
      "② **一個英雄只有一個 `transform.counterpartId`**，而 `championForm` effect 的 `to` 只有" +
      "`alternate`/`base`/`toggle`，沒有「變成指定的那一個形態」—— 所以第二個**不同**的形態" +
      "根本不是目的地：再施放一次只會刷新當前形態（WC3 Metamorphosis 的語意，刻意保留）。" +
      "⚠️ 這兩件都卡在計畫 §16.15 還沒裁決「三個 gameplay state 還是三個 3D body」——" +
      "⛔ 在那之前不要把三形態降級成三個獨立變身，那會是一個**看起來**能用的錯誤答案。",
    evidence:
      "packages/shared/src/sim/systems/ChampionFormSystem.ts + sim/championFormExclusive.test.ts" +
      "（四個突變都驗過會紅：拿掉 `sc.championId` 的寫入、`championForm.set` 改成不覆寫、" +
      "拿掉 `keepLongest`、拿掉整個 `reject` 分支）",
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
      "⛔ 仍缺三件：① **stable state key 與 exclusive group** —— 一顆按鈕一個切換，" +
      "沒有「這三個狀態互斥」的模型（那一半是 `state.exclusive-group@1`）；" +
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
    plan: "§2.1.1.2（層數門檻）· §12 G4",
    expected: "unsupported",
    probe: anyCondLeaf("stackCount", "stacks", "markCount", "charges"),
    nearestExisting:
      "⚠️ **層數本身是有的** —— `sim/marks.ts` 的具名標記帶 `count` / `spent` / `expiresAtTick` / " +
      "`resetOn`，這張表的 `effect.charge-ledger@1` 也已經宣告 `supported`。" +
      "⛔ 不算數的理由是**沒有任何條件葉讀得到它**：`zConditionLeaf` 今天只有 " +
      "chance / stat / kind / status / equipment 五種。所以層數寫得進去、**問不出來**。" +
      "最接近的葉是 `zStatLeaf`，但它讀的是屬性池（hp / mp / 三圍），不是標記池。",
    reason:
      "「≥N 層才觸發 / 滿層引爆」沒有 typed condition。" +
      "⛔ 不可以用 `chance` 近似（那是機率不是計數），也不可以用 `stat` 近似（讀的是別的池子）。",
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
      "四個剛好對上四支出貨卡（77-002 / 77-002 / 70-002 / 59-001），⛔ 沒有位置 JSON Pointer。" +
      "每個 op 的 `value` **兩端都有界**（`AUGMENT_OP_BOUNDS`），`mode` 只有 `set` / `add`。" +
      "**fail closed 在載入時**：目標指不到就 `DanglingRefError`（`content/refs.ts::abilityRefs` " +
      "推的是**硬** ref edge），不是執行期靜默跳過；`thresholdPct` 另外強制填 `nodeKind`，" +
      "那一格就是 §13「不得套到相鄰效果」的閘（一棵 condition 樹裡通常不只一個 `value`）。" +
      "⛔ 仍缺三件，寫技能的人一定會撞到：" +
      "① **這一版是執行期，不是編譯期** —— 計畫要的 reverse dependency closure 重編需要一個" +
      "住在 `content/registries.ts` 的 compiler。現在是 `abilityPassives.ts::rankBlock` 在把 " +
      "passive 區塊組成 `ModifierSource` 的那一刻讀 augment 表再算（**可觀測等價**：同一組 ops、" +
      "同一個目標解析、同一份界），但沒有 closure、不遞迴（強化一支自己也被強化的技能不成立）；" +
      "② **只有被動區塊這一個 seam 接上了** —— 主動施放路徑（`castAbility` 讀 `def.effects`）" +
      "還沒問過 augment，所以 70-002 / 92-002 那種「強化一支**主動技**的傷害」今天拿不到；" +
      "77-002（77-02 的 proc 機率 / 77-03 的持續時間）與 59-001（59-00 hook 的門檻）拿得到；" +
      "③ **`nodeKind` 是自由字串**（condition 的 kind 表住在另一份 schema，抄過來就是第二份" +
      "會過期的真相），所以打錯字 = 那條操作匹配不到任何節點、靜默無效。⛔ 不要假裝它會紅。",
    evidence:
      "packages/shared/src/sim/abilities/abilityAugment.ts（收集 + 純改寫）+ " +
      "packages/shared/src/sim/abilities/abilityPassives.ts（唯一接上的 seam）；" +
      "守衛 packages/shared/src/sim/abilities/abilityAugment.test.ts" +
      "（兩個方向一起讀：學了 → 真的變；沒學 → 一格不動。突變驗過會紅）",
  },
  {
    key: "defense.block-source@1",
    plan: "§2.1.1 P1 · §12 G4",
    expected: "partial",
    probe: (f) => f.simCapabilities.has("hooks"),
    caveat:
      "`BlockGrant`（含 `lethalOnly` / `lethalBasis` / `internalCooldown` / 鏈式獨立判定）已出貨且時序正確" +
      "（`mitigate()` 之後、護盾之前），寫入點現在有**兩個**：道具（`economy/itemSource.ts`）與" +
      "**技能被動**（`ability@1.passive.ranks[].block` → `abilities/abilityPassives.ts`，" +
      "配 `whileForm` 就寫得出「卍解狀態下才格擋」）。兩者走同一個 `ModifierSource.block`，" +
      "所以鏈式判定與型別過濾逐條相同。⛔ 仍然缺的是**限時 buff / status 授予格擋**：" +
      "`applyBuff` 掛上去的來源沒有這一格，所以「接下來 5 秒內格擋」還是沒有形狀。" +
      "⚠️ 另外 `internalCooldown` 的記帳住在 source 上，而技能被動的 source 在升級 / EX 解鎖 /" +
      "變身時會 detach + attach，等於冷卻歸零 —— 出貨的兩支技能格擋都沒有 ICD，所以今天不可觀測。",
    evidence: "packages/shared/src/sim/combat/blockFromPassive.test.ts",
  },
  {
    key: "effect.convert-hit-damage-type@1",
    plan: "§2.1.1 P1 · §12 G4",
    expected: "partial",
    probe: (f) => f.simCapabilities.has("hooks"),
    caveat:
      "`damageTypeOverride` 能轉換傷害型別且有 `impactGateType` 處理擊倒閘，" +
      "但計畫要的是「以逐級機率把**該次普攻**完整轉成真傷」—— 逐級機率那一格沒有。" +
      "⛔ 不可以改成「另外補一段真傷」，那是不同的東西（計畫 §2.1.1 明列）。",
    evidence: "packages/shared/src/sim/combat/damageTypeOverride.ts",
  },
];

export interface RuntimeCapabilityManifest {
  readonly schema: typeof RUNTIME_CAPABILITIES_SCHEMA;
  /** 推導事實的穩定指紋；編輯器用它 pin base（計畫 §4.1 的 fingerprint）。 */
  readonly fingerprint: string;
  readonly effectKinds: readonly string[];
  readonly hookEvents: readonly string[];
  /** `condition@1` 的葉子種類 —— 對方要靠它知道哪些 typed condition 寫得出來。 */
  readonly conditionLeafKinds: readonly string[];
  /** `HookDef` 的欄位名 —— 一次性消耗、節流、機率這幾格在不在，看這裡。 */
  readonly hookFields: readonly string[];
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
}

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
 * 從**出貨的註冊表**建出能力清單。
 *
 * ⚠️ 每一格都排序過：這份文件會被 hash 並被外部專案 pin，
 * 而 `Object.keys` 的順序不是規格的一部分。
 */
export function buildCapabilityManifest(): RuntimeCapabilityManifest {
  const effectKinds = Object.keys(EFFECT_HANDLERS).sort();
  const hookEvents = [...zHookEvent.options].sort();
  // `ability@1` 的頂層欄位名 —— 從出貨的 Zod 物件推導，不是手打（見
  // `CapabilityProbeInput.abilityFields`）。
  const abilityFields = Object.keys(zAbilityDef.shape).sort();
  // 條件葉與 hook 欄位 —— 兩張表都從出貨的 Zod 物件推導（見 `literalKindsOf` 的檔頭）。
  const conditionLeafSet = new Set<string>();
  literalKindsOf(zConditionLeaf, conditionLeafSet);
  const conditionLeafKinds = [...conditionLeafSet].sort();
  const hookFields = Object.keys(zHookDefBase.shape).sort();
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
    hookFields: new Set(hookFields),
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
      ...hookFields,
      ...templateFamilies,
      ...PLANNED_CAPABILITIES.map((e) => `${e.key}=${e.expected}`),
    ]),
    effectKinds,
    hookEvents,
    conditionLeafKinds,
    hookFields,
    templateFamilies,
    simCapabilities,
    planned,
    unsupported: PLANNED_CAPABILITIES.filter((e) => e.expected === "unsupported")
      .map((e) => e.key)
      .sort(),
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
  "barrier-domain", "blink-strike", "buff-self", "channel-beam", "charge-push",
  "data-no-trigger", "death-mechanic", "drain-leech", "global-rule", "ground-nova",
  "growth-charge", "instant-blast", "leap-strike", "life-manipulate", "line-sweep",
  "lock-combo", "mark-stacks", "on-attack", "on-hit-react", "orbit-array",
  "periodic-field", "proxy-cast", "proxy-fanout", "pull-throw", "pure-cosmetic",
  "random-barrage", "range-gamble", "resource-ops", "single-strike",
  "strip-transform", "summon-agent", "team-synergy", "teleport", "traveling-wave",
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
    hookFields: new Set(m.hookFields),
  });
}

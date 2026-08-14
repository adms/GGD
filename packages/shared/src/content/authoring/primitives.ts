/**
 * ⏸️【**已封存 —— 沒有出貨路徑會呼叫這個檔案**】（owner 2026-08-15 裁決）
 *
 * ── 為什麼它還在 repo 裡但沒有人用 ─────────────────────────────────────
 *
 * owner 2026-08-15 問「B/C/D′/E/F/G 難道真的都有必要做嗎」，而誠實的答案是
 * **B 群不必要**：`main_load_editor_plan.md` 是為一個**多作者、共享 effect
 * product、跨組織協商**的世界寫的，而 GGD 是一個 owner、一個編輯器、一個遊戲。
 *
 * ⭐ 便宜得多的模型：**編輯器直接產 `ability@1` runtime JSON**（帶
 * `template.cards` 保留模板 + 參數），我們用**已經存在的** Zod schema +
 * capability 清單 + `authoringRules.ts` 驗它。
 *
 * 這樣砍掉的「重編後逐位元比對」不是損失 —— 那個檢查存在的理由是**抓兩個
 * 編譯器漂移**，而只有一種表示法、一個驗證器時，沒有第二個實作可以漂。
 * 而且 `template.cards` 本來就存著模板與參數，所以**創作意圖也沒有遺失**，
 * 第〇·五守則（引擎做機制、JSON 做技能）反而被更直接地滿足。
 *
 * ── ⚠️ 那為什麼不刪掉 ────────────────────────────────────────────────
 *
 * owner 同一則：「**寫好的也先不要刪掉 避免以後要撿回來用 不要影響接下來使用
 * 就好**」。⇒ 保留，但：
 *
 *   ⛔ `buildEditorTargetProfile` **不再 import 它** —— 出貨契約不可以宣稱有一個
 *      不存在的編譯器（那正是這整份契約要防的東西）
 *   ⛔ 沒有任何 production 呼叫端；它只被自己的測試覆蓋
 *   ✅ 要撿回來時：接上 graph 求值器，再把 profile 的 `contract.compiler`
 *      從 null 換成 `compilerFingerprint()`
 *
 * ⚠️ 如果哪一天 GGD 真的變成多作者（外面的人也做技能包並互相引用），
 *    這個檔案就是那條路的第一步 —— 那時候它才會有出貨路徑。
 *
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ⭐【編譯器的 primitive 登錄表】—— `compiler.fingerprint` 蓋住的那個面。
 *
 * `GGD_EDITOR_PACKAGE_SPEC.md` §3.2.1：
 *
 *   > Compiler 必須使用**版本化 primitive registry**；每個 expression node、
 *   > control step、selector、unit conversion 與 lowering 都有 **stable
 *   > capability key**，並納入 `compiler.fingerprint`。未登記或版本不相容的
 *   > primitive 一律拒絕。
 *
 * 而計畫 §3.1 補了一句更重要的：
 *
 *   > Compiler fingerprint 至少覆蓋 compiler contract schema、primitive
 *   > registry、runtime output schema、ability／item patch 規則與 golden-vector
 *   > set；**只 hash 一小份 surface object 不能證明 parity**，遊戲端重編仍不可省略。
 *
 * ── ⛔ 為什麼這張表必須是一張**表**而不是散在 switch 裡 ──────────────
 *
 * 指紋的用途是：對方拿它跟自己的比，一樣才代表「我們對這批技能的理解相同」。
 * 如果 primitive 散在各處的 `switch (node.op)`，那麼**新增一個 op 不會改變指紋**
 * —— 兩邊的編譯器行為已經不同了，而那個唯一該叫的東西沒有叫。
 *
 * ⇒ 所有 primitive 集中在這裡，指紋由這張表算出來。加一個 op 而忘了登記，
 *   `graph.ts` 的求值器查不到它 ⇒ 直接拒絕（fail-closed），⛔ 不會安靜地跑。
 *
 * ── ⚠️ `since` 不是註解，它是**相容性協商**的欄位 ────────────────────
 *
 * 對方可能比我們舊。`since` 讓他們算得出「我支援到哪一版」，而不是只能比對
 * 一個全有全無的指紋然後整包退。⛔ 不要為了「看起來乾淨」把它拿掉。
 */
import { createHash } from "node:crypto";

/** 合約版本。⚠️ **語意版本**：primitive 只增不減時 bump minor，行為改變 bump major。 */
export const COMPILER_CONTRACT_VERSION = "1.0.0";

/** 一個 primitive 的分類。 */
export type PrimitiveKind =
  /** `program.outputs[]` 裡的 expression node（§3.2 的九個）。 */
  | "expression"
  /** `program.steps[]` 裡的 control step（§3.2 的四個）。 */
  | "control"
  /** `selectTargets` 用得到的 selector。 */
  | "selector"
  /** `unitConvert` 登記的單位轉換。 */
  | "unit"
  /** 把 graph 語意降到 runtime 的能力（§3.2 末的 `effect.target-set-chain@1`）。 */
  | "lowering"
  /** `formula` 的 `round` 模式（§3.2.1 要求明示）。 */
  | "rounding";

export interface PrimitiveDef {
  /** stable capability key。⛔ 一旦出貨就不可以改字面 —— 對方拿它 pin。 */
  readonly key: string;
  readonly kind: PrimitiveKind;
  /** 這個 primitive 是從哪一版開始有的（相容性協商用）。 */
  readonly since: string;
  /** 給人看的一句話。⚠️ 是「它做什麼」不是複述 key。 */
  readonly note: string;
}

const p = (
  kind: PrimitiveKind,
  key: string,
  note: string,
  since: string = COMPILER_CONTRACT_VERSION,
): PrimitiveDef => Object.freeze({ key, kind, since, note });

/**
 * 全部 primitive。⭐ **這是唯一的清單** —— 求值器查不到就拒絕。
 *
 * ⚠️ 順序無關（指紋前會排序），但**不要刪除已出貨的項目** —— 刪掉等於讓
 * 一份合法的舊 package 突然變成非法，而對方看不出原因。要退場請保留 key
 * 並在 note 註明。
 */
export const COMPILER_PRIMITIVES: readonly PrimitiveDef[] = Object.freeze([
  // ── expression（規格 §3.2 的九個，⛔ 不多不少）───────────────────────
  p("expression", "expr.literal@1", "JSON literal。⛔ 不做任何隱含轉型。"),
  p("expression", "expr.param@1", "讀一個已宣告的參數；path 不存在 = 拒絕。"),
  p("expression", "expr.object@1", "由已型別檢查的 fields 組物件。欄位次序由 schema 定，⛔ 不靠 hash-map。"),
  p("expression", "expr.list@1", "由 items 組陣列。"),
  p(
    "expression",
    "expr.ifPresent@1",
    "optional param 存在才產輸出。⚠️ 「absent」與「填了 default」是**兩個不同狀態**（§3.2.1 的四態）。",
  ),
  p(
    "expression",
    "expr.switch@1",
    "只可對 enum／boolean param 分支；所有成員必須覆蓋或有 default，⛔ 不允許漏掉一支。",
  ),
  p(
    "expression",
    "expr.formula@1",
    "add/sub/mul/div/min/max/clamp/round。⛔ 除零、NaN、Infinity、超界一律拒絕。",
  ),
  p("expression", "expr.unitConvert@1", "只可使用下面登記的單位轉換。"),
  p("expression", "expr.map@1", "迭代**有上限**的 param array；編譯器檢查最大輸出 cardinality。"),

  // ── control step（規格 §3.2 的四個）─────────────────────────────────
  p("control", "step.selectTargets@1", "以 typed selector 產生一個宣告過的 named target set。"),
  p(
    "control",
    "step.invokePort@1",
    "在**明確的新 context** 執行 Product 的 child chain。⛔ 不可攤平成平面陣列（會改變語意）。",
  ),
  p(
    "control",
    "step.sequence@1",
    "依序執行有上限的 steps。⛔ 不得用 array 順序隱含傳遞私有 target set。",
  ),
  p("control", "step.ifContext@1", "只判斷 inputContract 宣告的 typed context presence／enum。⛔ 不允許 expression string。"),

  // ── selector ────────────────────────────────────────────────────────
  p("selector", "sel.self@1", "施法者自己。"),
  p("selector", "sel.castTarget@1", "這次施法指定的目標（指向技）。"),
  p("selector", "sel.enemiesInRadius@1", "以某點為心、半徑內的敵方。半徑受 AoE 級距上界夾。"),
  p("selector", "sel.alliesInRadius@1", "同上，我方。"),
  p("selector", "sel.lowestHealthAlly@1", "我方當前生命最低的一位（治療類常用）。"),

  // ── unit conversion（⚠️ 這些是 w3x → GGD 的尺，⛔ 不是隨便的乘法）──
  p("unit", "unit.wc3Length@1", "w3x 長度 → GGD 單位（`GGD_PER_WC3`）。"),
  p("unit", "unit.wc3Apex@1", "w3x 高度 → GGD 單位。⚠️ **與長度是兩把不同的尺**（#247b）。"),
  p("unit", "unit.secToTick@1", "秒 → sim tick（30 Hz）。⚠️ 四捨五入到 0 tick = 瞬發，那是硬界。"),
  p("unit", "unit.percentToRatio@1", "百分比 → 0..1 比例。"),

  // ── rounding（§3.2.1：`round` 必須明示其一）─────────────────────────
  p("rounding", "round.floor@1", "向下取整（往負無窮）。"),
  p("rounding", "round.ceil@1", "向上取整（往正無窮）。"),
  p("rounding", "round.trunc@1", "向零取整（去掉小數）。"),
  p("rounding", "round.half-away-from-zero@1", "0.5 遠離零（一般人講的「四捨五入」）。"),
  p("rounding", "round.half-to-even@1", "0.5 進偶數（banker's rounding）。"),

  // ── lowering ────────────────────────────────────────────────────────
  p(
    "lowering",
    "effect.target-set-chain@1",
    "把 selector + child chain 降到 runtime 而**保留語意**。⚠️ runtime 沒宣告它就必須回 unsupported，" +
      "⛔ 不可以攤平（規格 §3.2 末明列）。",
  ),
]);

/** 用 key 查。⛔ 查不到 = 拒絕，這是 fail-closed 的那一半。 */
const BY_KEY = new Map(COMPILER_PRIMITIVES.map((d) => [d.key, d]));

export function primitive(key: string): PrimitiveDef | undefined {
  return BY_KEY.get(key);
}

export function hasPrimitive(key: string): boolean {
  return BY_KEY.has(key);
}

/** 某一類的全部 key（求值器用它做 allowlist）。 */
export function primitiveKeys(kind: PrimitiveKind): readonly string[] {
  return COMPILER_PRIMITIVES.filter((d) => d.kind === kind)
    .map((d) => d.key)
    .sort();
}

/**
 * ⭐ 編譯器指紋 —— 對方拿它跟自己的比。
 *
 * ⚠️ 它蓋住的東西必須**足以證明兩邊行為相同**（計畫 §3.1：「只 hash 一小份
 * surface object 不能證明 parity」）。所以輸入是：
 *
 *   ① 合約版本
 *   ② 全部 primitive 的 (key, kind, since) —— 排序後，⛔ 不依賴宣告順序
 *   ③ runtime 輸出的 schema tag（`ability@1` 等）—— 輸出形狀變了指紋就要變
 *   ④ 預算表 —— 兩邊上限不同 = 同一份 Definition 一邊過一邊不過
 *
 * ⛔ **它證明不了的**：兩邊求值器的實作有沒有 bug。那正是「遊戲端重編 + 逐位元
 *    比對」存在的理由 —— 指紋管「規格一致」，重編管「實作一致」。
 */
export function compilerFingerprint(): string {
  const surface = {
    contractVersion: COMPILER_CONTRACT_VERSION,
    primitives: [...COMPILER_PRIMITIVES]
      .map((d) => `${d.kind}:${d.key}:${d.since}`)
      .sort(),
    runtimeOutputs: ["ability@1", "item@1", "champion@1"].sort(),
    budgets: Object.entries(COMPILER_BUDGETS)
      .map(([k, v]) => `${k}=${String(v)}`)
      .sort(),
  };
  return createHash("sha256").update(JSON.stringify(surface)).digest("hex").slice(0, 8);
}

/**
 * 編譯預算（規格 §3.2.1）。
 *
 * ⚠️ **每一條都有上界不是只有下界**（第一守則）。這些不是效能調校 ——
 * 它們是「一份惡意或寫壞的 Definition 能造成多少傷害」的天花板，
 * 而且**納入指紋**：兩邊上限不同 = 同一份 Definition 一邊過一邊不過。
 */
export const COMPILER_BUDGETS = Object.freeze({
  /** graph 的節點總數。 */
  maxNodes: 2_000,
  /** 巢狀深度（expression + child chain 合計）。 */
  maxDepth: 32,
  /** `program.outputs[]` 的長度。 */
  maxOutputs: 256,
  /** 展開後的 `EffectDef` 總數。 */
  maxEffects: 512,
  /** 展開後的 hook 總數。 */
  maxHooks: 64,
  /** 具名 target set 的數量。 */
  maxTargetSets: 16,
  /** `map` 一次能迭代的元素上限。 */
  maxMapItems: 64,
  /** 展開結果序列化後的位元組上限。 */
  maxExpandedBytes: 512 * 1024,
});

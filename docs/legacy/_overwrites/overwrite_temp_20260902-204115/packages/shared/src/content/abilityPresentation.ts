/**
 * ⭐⭐ **預設演出的唯一登錄表**（Codex 阻塞清單 P0-3）。
 *
 * Codex 逐字：
 * > 請建立單一 `resolveAbilityPresentation()` 或等價登錄表，統一決定：
 * > 權威 trigger · 施法者 actor action · 目標 actor reaction · 預設 VFX／SFX ·
 * > 來源 identity · replacement channel · 缺 clip fallback · 專屬 script 與預設演出的取代關係。
 * >
 * > **`GameApp`、`VfxSystem`、`VfxScriptPlayer`、產生器不可各自維護不同規則。**
 *
 * ## ⛔ 在此之前這些規則散在六個 `case` 裡
 *
 * 2026-09-02 量到：`EntityViewRegistry.ts` 的
 * `abilityCast`（:641）· `basicAttack`（:685）· `hitImpact`（:717）·
 * `evade`（:759）· `displace`（:788）—— ⭐ **每一處各自寫死一行 `pulse(...)`**，
 * ⛔ 而「哪個事件該播誰的什麼動作」這件事**沒有一個住處**。
 *
 * ⇒ ⭐ 一個外部編輯器**問不出**這張表，只能逐個猜；
 * ⇒ ⛔ 而新增一個事件時，漏接不會有任何東西紅。
 *
 * ## ⭐ 這張表是**資料**，⛔ 不是 if 鏈
 *
 * 第〇·五守則：「⛔ 看到『為某支技能寫一個 if』就是越線了。」
 * ⇒ 這裡把**演出規則**也變成一張可以被讀出去的表 ——
 * ⭐ 收據（`ggd-presentation-receipt@1`）把它整份公開給 Editor。
 *
 * ## ⚠️ 它**不決定**的事（⛔ 刻意）
 *
 * · ⛔ 不決定技能專屬的時間軸／顏色／鏡頭（那是 Editor 的，owner 逐字分工）
 * · ⛔ 不決定 hitstop 的長度（那是 `impactFeel` 的三個住處）
 * · ⛔ 不取代 `vfx-script` —— ⭐ 它只說「**沒有 script 時**預設演什麼」
 */

/** ⭐ 觸發這一刻的**權威事件**（wire 上的名字，⛔ 不是語意別名）。 */
export type PresentationTrigger =
  | "abilityCast"
  | "basicAttack"
  | "comboStrike"
  | "projectileHit"
  | "hitImpact"
  | "hitImpactBlocked"
  | "evade"
  | "reflectSuccess"
  | "displace";

/** ⭐ 誰在演。 */
export type PresentationActor = "caster" | "target";

/**
 * ⭐ 一條預設規則。
 *
 * ⚠️ `pulse` 用的是 `AnimPulse` 的字面值 —— ⛔ 這裡刻意**不 import** 那個型別，
 * 因為 `animPulse.ts` 會 import 這一支（收據要讀它）⇒ 會形成循環。
 * ⭐ 而它們的一致性由 `abilityPresentation.test.ts` 逐格比對詞彙表保證。
 */
export interface PresentationRule {
  readonly trigger: PresentationTrigger;
  readonly actor: PresentationActor;
  /** 播哪一塊動作積木。 */
  readonly pulse: "attack" | "cast" | "hurt" | "guard" | "dodge";
  /**
   * ⭐ **取代通道** —— 同一個 `trigger:channel` 上，專屬 script 取代預設演出；
   * ⛔ 不同 channel 可以共存（Codex 逐字的取代規則）。
   */
  readonly channel: string;
  /** ⭐ 為什麼是這一塊 —— ⛔ 沒有理由的規則會變成一句過期的散文。 */
  readonly why: string;
}

/**
 * ⭐⭐ **出貨的預設演出表**。
 *
 * ⚠️ 順序無關（查表是 `trigger` × `actor`），⛔ 但同一格不可以有兩列
 * —— 守衛釘住這件事。
 */
export const PRESENTATION_RULES: readonly PresentationRule[] = Object.freeze([
  {
    trigger: "abilityCast",
    actor: "caster",
    pulse: "cast",
    channel: "caster.action",
    why:
      "⭐ Codex 逐字：「主動技能在 castStart/castEffect **必須有施法者 cast/attack**」。" +
      "⛔ 粒子或光束不能取代施法動作 —— 一個只有特效、身體不動的施放讀起來像 bug。",
  },
  {
    trigger: "basicAttack",
    actor: "caster",
    pulse: "attack",
    channel: "caster.action",
    why:
      "⭐ 普攻的揮擊。⚠️ 出貨接法帶 `restartClip: false` —— " +
      "Codex 逐字：「hitstop 應暫停或延長既有動作，⛔ 不得從頭重播剪輯」。",
  },
  {
    trigger: "comboStrike",
    actor: "caster",
    pulse: "attack",
    channel: "caster.action",
    why:
      "⭐ Codex 逐字：「每個權威 `strikeIndex` 必須有施法者 attack ＋ 目標 hurt/reaction」。" +
      "⚠️ 權威來源是 ability JSON 的 `comboStrikes`／`delayed` —— " +
      "⛔ 技能名稱或 VFX 自己排出的月牙數量**不能**取得連斬豁免。",
  },
  {
    trigger: "comboStrike",
    actor: "target",
    pulse: "hurt",
    channel: "target.reaction",
    why: "⭐ 同上的另一半 —— ⛔ 只有攻擊者動、被打的人不動，讀起來是打空氣。",
  },
  {
    trigger: "projectileHit",
    actor: "target",
    pulse: "hurt",
    channel: "target.reaction",
    why: "⭐ Codex 逐字：「`projectileHit` 必須有目標反應」。",
  },
  {
    trigger: "hitImpact",
    actor: "target",
    pulse: "hurt",
    channel: "target.reaction",
    why:
      "⭐ 沒擋下來的那一發 —— 受擊。⚠️ 判準是事件上的 `blocked` 旗標，" +
      "而 `VfxSystem` 的泛用火花讀**同一格** ⇒ ⛔ 兩邊不會對同一發做出不同判斷。",
  },
  {
    trigger: "hitImpactBlocked",
    actor: "target",
    pulse: "guard",
    channel: "target.reaction",
    why:
      "⭐ Codex 逐字：「格擋：防禦者播放 `guard`」。" +
      "⛔ **不是 `hurt`** —— 一次成功的格擋沒有被打穿，播受擊是一句謊。",
  },
  {
    trigger: "evade",
    actor: "target",
    pulse: "dodge",
    channel: "target.reaction",
    why:
      "⭐ Codex 逐字：「迴避：防禦者播放 `dodge`，**保留 MISS 回饋**」。" +
      "⚠️ MISS 的浮動文字走 `frameBus`（另一條路）⇒ ⛔ 不受這一格影響。",
  },
  {
    trigger: "reflectSuccess",
    actor: "target",
    pulse: "guard",
    channel: "target.reaction",
    why:
      "⭐ Codex 逐字：「反彈：從 `reflectSuccess` 播放防禦／反擊動作」。" +
      "⚠️ 反彈封包的 `source` 就是**防禦者**（`combat/damage.ts:61` 的 provenance）" +
      "⇒ ⭐ 歸屬乾淨，⛔ 不需要新的 dep。",
  },
  {
    trigger: "displace",
    actor: "caster",
    pulse: "cast",
    channel: "caster.action",
    why:
      "⭐ Codex 逐字：「`displace/leapStart` 等位移節點應有對應角色動作」。" +
      "⭐ 用 `cast` 而不是 `attack`：位移是**施法者自己發動的**，" +
      "⛔ 而 `attack` 的語意是打到人。" +
      "⚠️ 只在 `phase:\"start\"` 播 —— 三個發射站今天都只在起點發一則。",
  },
]);

/**
 * ⭐⭐ **唯一的查表入口**。
 *
 * ⛔ 消費端不可以自己寫「這個事件播那個動作」——
 * Codex 逐字：「`GameApp`、`VfxSystem`、`VfxScriptPlayer`、產生器**不可各自維護不同規則**」。
 *
 * ⚠️ 回傳空陣列是**合法**的（那個事件今天沒有預設演出）——
 * ⭐ 而「哪些事件該有而沒有」由守衛盯著，⛔ 不是靠這裡靜默。
 */
export function resolveAbilityPresentation(
  trigger: PresentationTrigger,
): readonly PresentationRule[] {
  return PRESENTATION_RULES.filter((r) => r.trigger === trigger);
}

/** ⭐ 純被動**不可以**生成假的 cast —— Codex 逐字。這一族的 trigger 永遠不在表上。 */
export const NEVER_FAKE_CAST_TRIGGERS: readonly string[] = Object.freeze([
  "passiveProc",
  "auraTick",
  "shieldGained",
]);

/**
 * Content definition schemas (champion / ability / item / augment / projectile).
 * Pure data shapes — authored as TS literals in the skeleton, migrated to
 * external JSON by the content pipeline (same shapes, Zod-validated).
 */
import type { AbilityId, AugmentId, ChampionId, ItemId, ProjectileId, StatusId } from "../../ids";
import type { Stat, StatBlock } from "../stats/statTypes";
import type { AttrGrant, ChampionAttributes } from "../stats/attributes";
import type { StatModifier, HookDef } from "../stats/modifiers";
import type { AuraDef } from "../aura/aura";
import type { ClassRequirement } from "./requirement";
import type { VisionGrant } from "../stealth";
import type { EffectDef } from "../effects/effect";
import type { MarkSpec } from "../marks";
import type { ChampionAbilitySlot, CoreAbilitySlot } from "../intents";
// ⭐ 「騎在來源上的授予」那一族 —— 一份表（第零守則⑨）。三個 def 都 `extends` 它，
// 所以下一個授予加進 `SourceGrantFields` 一格，三個授權面自動全部拿到，
// 而不是三個檔各補一行（漏掉的那一行**不會紅**）。見 sim/stats/sourceGrants.ts。
import type { SourceGrantFields } from "../stats/sourceGrants";
// ⚠️ `import type` 是**編譯期擦除**的，所以這一行與 `abilityAugment.ts` 反向
// import `AbilityDef` 之間沒有 runtime 環（`effectRegistry.ts` 檔頭記的那一種
// 「不是編譯錯誤、是某個打包順序下的執行期 undefined」在這裡不成立）。
import type { AbilityAugment } from "../abilities/abilityAugment";

export type CastType = "targeted" | "skillshot" | "ground" | "self" | "dash";

/**
 * One rank of an ability's PERMANENT passive. WC3 authors passives per ability
 * level, so this is a rank-indexed array rather than a single block: rank N
 * uses `ranks[N-1]` (clamped to the last entry), and rank 0 (unlearned) grants
 * nothing at all.
 */
export interface AbilityPassiveRank extends SourceGrantFields {
  modifiers?: StatModifier[];
  hooks?: HookDef[];
  /**
   * AURAS (靈氣) this rank projects — the 「範圍 R 內的敵人/隊友」 half of the
   * WC3 aura family (`AOae` Endurance, `AHab` Devotion, and the innate that
   * drove this: `79-00 靈壓`, −25 % attack speed to enemies within 500). Unlike
   * `modifiers`, which only ever touch the unit carrying the passive, these are
   * applied to OTHER units by proximity. See sim/aura/aura.ts.
   */
  auras?: AuraDef[];
  /**
   * 隱形 / 真視 this rank grants (see sim/stealth.ts). A THIRD kind of payload
   * next to `modifiers`/`auras`, because neither could carry it: 「看不看得見」
   * is not a number on a stat table and it is not projected onto other units.
   *
   * The three ported docs that need it: `godie-naka.passive` 27-00
   * 永久性的隱形術 (`Apiv`, fade 4.0 s), `godie-nplh.passive` /
   * `godie-u01f.passive` 16-00 通靈能力 and `godie-e008.passive` 21-00 灼眼
   * (true sight).
   */
  vision?: VisionGrant;
  /**
   * 飛行 (無視碰撞) this rank grants — see sim/flight.ts. A FOURTH payload kind
   * for the same reason `vision` was a third: 「碰不碰得到」 is not a number on a
   * stat table and is not projected onto anybody else. 04-00 翔封界
   * (`godie-h020.passive` / `godie-hjai.passive`) is the only user.
   */
  flight?: import("../flight").FlightGrant;
  /**
   * 格擋 this rank grants — see `sim/combat/block.ts`. A FIFTH payload kind for
   * the same reason `vision` was a third and `flight` a fourth: 「擋不擋得下
   * 這一發」 is not a number on a stat table (型別過濾 and `lethalOnly` vanish
   * the moment you sum it into a `Stat`) and it is not projected onto anybody.
   *
   * ⭐ It is THE SAME `ModifierSource.block` field an equipped item writes
   * (`economy/itemSource.ts`), NOT a second mechanism: `blockCutFor` walks
   * `StatsComp.sources` without caring about `kind`, so an ability-granted
   * block obeys the identical 鏈式獨立判定 / 型別過濾 / 致死判定 / 內部冷卻.
   * The whole wiring is one forward in `abilities/abilityPassives.ts rankBlock`.
   *
   * 20-00 銀色甲胄 (Saber 天生技, 「30%機率格擋 100% 魔法傷害」) and 79-002 虛化
   * (卍解 狀態下的物理格擋, so `whileForm: "alternate"`) were the first two users.
   *
   * ⚠️ ⭐ 2026-09-01 更正 —— 這一句在此之前寫著「are **the two** users」，⛔ 而那已經
   * 過期了（第三守則：註解會說謊）：**59-03 AT力場**（`godie-e00r.e`，⭐ **E 槽**，
   * `chance` 10/15/20/25%）也是使用者，而它正是 GH#650 那張票的主角。
   * ⇒ ⭐ 那句話害我在 2026-09-01 花了一輪去懷疑「E 槽的 passive 到底掛不掛得上」——
   *   ⭐ 答案是**掛得上**（`abilityPassives.ts:293` 逐字走 Q/W/E/R）。
   * ⛔ 不要在這裡再列一次使用者名單 —— 它只會再過期一次。
   *   查法：`grep -rl '"block"' content/abilities/`。
   */
  block?: import("../combat/block").BlockGrant;
  /**
   * 暴擊來源 this rank grants — see `sim/combat/critStrike.ts`. A SIXTH payload
   * kind, and the reason is owner's own (GH#299 第 2 條): 暴擊 has TWO axes,
   * 「%」 and 「幾倍」, and they belong to ONE source rather than to the champion.
   *
   * ⛔ `Stat.CritChance` + `Stat.CritDamage` cannot express it: those AGGREGATE,
   * so +8.25 critDamage turns EVERY crit this champion ever rolls into 10× —
   * 「6% 的那一次是 10 倍」 has no shape at all (`combat/critStrike.ts` ①).
   *
   * ⭐ THE SAME `ModifierSource.critStrike` field an equipped item writes:
   * `rankedGrants` walks `StatsComp.sources` without caring about `kind`
   * (measured 2026-08-09 — a grant on an `augment` / `passive` / `buff` source
   * all roll identically), so the whole wiring is one forward in
   * `abilities/abilityPassives.ts rankBlock` via `stats/sourceGrants.ts`.
   *
   * Pairs with `whileForm`: 「只有卍解狀態下才有的暴擊」 is one dropdown away.
   */
  critStrike?: import("../combat/critStrike").CritStrikeGrant;
  /**
   * 形態閘 (task #249 變身) — which BODY this rank's payload is attached to.
   * ABSENT = "any" = both, i.e. every passive authored before this field.
   *
   * `sim/auraCarrier.ts` states the hole this closes in its own words: there
   * was no seam that could make a passive exist 「只在變身時」, so 20-01 風王結界
   * — a toggle whose whole payload is an on-attack orb — had nowhere to live.
   * The carrier trick could only ever project AURAS; this is the same fact for
   * the OTHER two payloads (`modifiers` and `hooks`).
   *
   * Evaluated in `abilities/abilityPassives.ts rankBlock`; re-evaluated on every
   * body change because `ChampionFormSystem.setBody` calls `syncAbilityPassives`
   * — the ONE writer of `ChampionComp.championId`, so no transform path
   * (cast / expiry / death / revert / combat end) can skip it.
   */
  whileForm?: "any" | "base" | "alternate";
  /**
   * ⭐ M2(2026-08-23) 狀態閘 —— 「我**帶著這個具名狀態**的時候才掛上」。
   *
   * ⛔ 它**不是**第二套 `whileForm`，是同一顆閘多認得一種來源：兩格都填就是
   * **AND**（`rankBlock` 逐格問過去）。缺席 = 不問 = 1,900 份既有文件逐位元不變。
   *
   * ── 為什麼需要它（量到的，⛔ 不是偏好） ──────────────────────────────────
   * `whileForm` 把「這一階在不在」綁死在**換一整份英雄卡**上，於是那 19 對變身
   * 裡有 3 對的**全部強度**住在形態裡（20-01 風王結界的 100% 暴擊、79-002 虛化的
   * AD 翻倍、70-00 紮根的力量 +10）—— 而它們在畫面上**逐位元零差別**。
   * ⇒ 「這個變身態能不能退場」在這一格出現之前，答案結構性地是「不能」。
   *
   * ⭐ 79-04 卍解今天**已經**同時掛了 `championForm` 與 `statusId:"bankai"`
   *（`content/abilities/godie-h01n.r.json`），而 `content/status-effects/bankai.json`
   * 的說明逐字寫著它存在的理由就是「讓別的技能問得到『我現在在卍解嗎』」——
   * 那份說明也逐字寫著「條件系統今天**沒有形態這一種葉子**」。這一格就是那一句
   * 的另一半：**被動的閘**也不必再從形態問起。
   *
   * ── 到期由誰負責 ─────────────────────────────────────────────────────────
   * `whileForm` 靠 `ChampionFormSystem.setBody`（身體的唯一寫入者）重新求值；
   * 狀態沒有那樣的唯一寫入者（`applyStatus` 掛、`StatusSystem` 收），所以這一格
   * 的重新求值由 `sim/statusGatedPassives.ts` 每 tick 做 —— 而它**只在答案真的
   * 翻面時**才呼叫 `syncAbilityPassives`（那支是 detach+attach，每 tick 呼叫等於
   * 每 tick 重算整份屬性）。
   */
  whileStatus?: StatusId;
}

/**
 * `ability@1.passive` — the missing half of the ability schema.
 *
 * A large share of the imported WC3 kit is PERMANENT: Critical Strike (`AOcr`),
 * Bash (`AHbh`), Evasion (`AEev`), the aura family (`AOae`/`AHab`), the
 * attribute buttons (`Aamk`). Their native `Cool` is 0 — they are not cast.
 * Without this field the importer had nowhere to put them and every one shipped
 * as an ACTIVATED `self` + `applyBuff` with an invented cooldown and mana cost,
 * i.e. a different ability. A passive ability is attached as a `ModifierSource`
 * the moment its rank goes above 0 and re-attached (at the new rank's values)
 * on every rank-up — the same `attachSource`/`detachSource` path items use.
 */
export interface AbilityPassive {
  /** display name (defaults to the ability's own name) */
  name?: string;
  ranks: AbilityPassiveRank[];
}

export interface AbilityDef {
  id: AbilityId;
  name: string;
  slot: ChampionAbilitySlot;
  /**
   * ONLY on `slot: "PASSIVE"` — whether the level-1 innate (天生技) is a
   * permanent self-buff ("passive", modelled through `passive.ranks[0]`, never
   * castable) or a real cast with a cooldown ("active", the WC3 D-slot).
   * Mirrors `zInnateKind`; absent on every other slot.
   */
  innateKind?: "passive" | "active";
  /**
   * ⭐ G13-1 —— 一支 `innateKind: "active"` 的天生技，它的 `passive` 區塊要不要
   * **也**掛上去。Mirrors `zAbilityDoc.innateActivePassive`。
   *
   * 省略 = `"skip"` = 今天的行為逐字（`syncAbilityPassives` 對主動型天生技
   * `continue`，那個 passive 區塊一格都不掛）。1,900 份既有文件一份都不帶它
   *（grep 實測 0），所以全樹零變化。
   *
   * ⭐ 為什麼它是一格欄位而不是寫死：「一支有冷卻的 D 槽主動技能不能同時掛一個
   * 常駐光環」今天是寫死在程式裡的**決策**，而 WC3 那一族真的存在
   *（70-00 紮根 = 15 秒冷卻 + 芬多精光環）。第一守則：決策點變欄位，預設值選
   * 今天的行為。
   *
   * ⚠️ 掛上去的來源是**永久**的。「只有紮根形態才有的光環」要靠同一個 rank 區塊的
   * `whileForm: "alternate"`（`rankBlock` 已經在讀），⛔ 不是靠這一格。
   */
  innateActivePassive?: "skip" | "attach";
  castType: CastType;
  maxRank: number;
  /** per rank (index rank-1) */
  cooldown: number[]; // seconds
  manaCost: number[];
  /**
   * ⚠️ 可以是 `Number.POSITIVE_INFINITY` —— 「無上限施法距離」（GH#602）。
   * 文件寫的是 `rangeUnlimited: true` + `range: 0`，`content/rangeTiers.ts` 的
   * `resolveRangeTier` 在**載入時**把它翻成 Infinity（全專案唯一的翻譯處）。
   * `resolveAbilityRange` 乘上 `combatEnv.abilityRange` 之後仍是 Infinity，
   * 所以每一處 `distSq <= range*range` 的比較恆真、接近指令永遠不會被武裝。
   */
  range: number;
  /** ⭐ GH#602 —— 這支技能不受施法距離限制。Mirrors `zAbilityDoc.rangeUnlimited`。 */
  rangeUnlimited?: boolean;
  /** skillshot width or AoE radius */
  radius?: number;
  targetsEnemies?: boolean;
  effects: EffectDef[];
  /**
   * Permanent passive granted while this ability's rank > 0 (see
   * `AbilityPassive`). An ability with a passive AND an empty `effects` array
   * is passive-ONLY: `castAbility` rejects it with "passive" before paying any
   * cost, exactly as WC3 refuses to cast a passive button.
   */
  passive?: AbilityPassive;
  /**
   * 這支技能進場時要在持有者身上安裝哪些【具名標記】（層數）。
   * 語意與「為什麼不能用 applyBuff/applyStatus 表達」寫在 `sim/marks.ts` 檔頭。
   *
   * ⚠️ 它是**第二種**「純被動」的形狀。在它之前，`passive !== undefined &&
   * effects.length === 0` 是判斷純被動的唯一寫法（見上一段註解與
   * `content/castTimeFormula.ts` 的 EXEMPTION 1）。一支只安裝標記的天生技
   * （十二道試煉）**兩個條件都不符**：它沒有靜態 `passive` 屬性區塊，
   * 因為它的加成是「每失去一層才長出來」的。
   *
   * ⛔ 不要為了滿足舊判斷而補一個空的 `passive.ranks[].modifiers: []` ——
   * 那正是 #224（天生技空 modifier）修掉的形狀。正確的做法是讓每一個
   * 「什麼算純被動」的判斷點同時認得這一格。
   */
  marks?: readonly MarkSpec[];
  vfxKey?: string;
  /**
   * WC3-derived per-ability cast sound cue (audio-map SFX key, e.g.
   * "wc3.nocute"). Stamped onto the `abilityCast` event so the client's
   * combat-audio mapper plays the source map's own clip for this cast; absent
   * = the generic castBegin/abilityCast voice. Authored from
   * tools/w3x-import SFX_BINDINGS (owner directive: ability ports include 音效).
   */
  sfxKey?: string;
  /**
   * Cast time (seconds) — the wind-up before effects fire. Default 0 = instant
   * (skeleton behavior). With ct>0 the caster enters a cast state, pays mana +
   * cooldown up-front, and effects resolve `round(ct/dt)` ticks later.
   */
  castTimeSec?: number;
  /** Root the caster for the cast duration (default true). */
  rootWhileCasting?: boolean;
  /**
   * 被打會不會中斷施法. Absent = `"none"` = the pre-existing rule (death / stun /
   * knockdown only). `"damage"` additionally breaks the channel the moment the
   * caster's HP is below what it was at cast-begin — see `zAbilityDef` for the
   * full statement of what counts as 「被打」 and why it is a field.
   */
  interruptOn?: "none" | "damage";
  /**
   * RECOVERY (後搖) — seconds of post-resolve commitment (no cast, no basic
   * attack). Absent = `DEFAULT_RECOVERY_SEC` (0.6 s), not 0. A landed hit on an
   * enemy CANCELS it, which is the whole combo rule. See
   * `sim/abilities/abilityRecovery.ts`.
   */
  recoverySec?: number;
  /** Whether the recovery also roots (default false: output lock only). */
  recoveryRoots?: boolean;
  /**
   * Icon path relative to content/ ("assets/icons/abilities/<id>.png",
   * w3x BLP→PNG). Absent = client falls back to letter-tile rendering.
   */
  icon?: string;
  /**
   * 【切換】—— 這支技能是一顆開／關兩態的按鈕（20-01 風王結界 · 70-00 紮根）。
   * Mirrors `zAbilityToggle` in content/schema/ability.ts, which carries the
   * full authoring contract. Absent = 一般的一次性施放，切換管線整條不存在。
   */
  toggle?: AbilityToggle;
  /**
   * ⭐ G6 —— 【跨技能強化】：這支技能改寫**另一支**技能的數字
   *（70-002 / 77-002 / 92-002 那一族的 EX）。Mirrors `zAbilityAugment`；
   * ⛔ 授權契約（欄位語意、界、為什麼操作是 enum 而不是 JSON Pointer）住在
   * `content/schema/ability.ts`，執行期語意住在 `sim/abilities/abilityAugment.ts`
   * 的檔頭，這裡只放型別。
   *
   * 缺席 = 這支技能不強化任何東西 = 今天逐字（`content/` 帶 `augment` 的文件
   * grep 實測 **0 份**）。
   *
   * ⚠️ 這一格存在之前，`abilityAugment.ts::augmentOf` 用一個 `as` cast 繞過型別，
   * 而那支檔自己把它標記成暫時的 —— 現在 sim 端只有一份真相。
   */
  augment?: AbilityAugment;
}

/**
 * 【切換】的執行期形狀 —— mirrors `zAbilityToggle` (content/schema/ability.ts).
 * ⛔ 語意寫在 schema 上，不在這裡重複一份（兩份會分岔）。
 */
export interface AbilityToggle {
  upkeepCadence: "none" | "perAttack" | "perSecond";
  upkeepCost: readonly number[];
  upkeepResource?: "mana" | "health";
  upkeepIntervalSec?: number;
  onExit: readonly EffectDef[];
  exitOnResourceEmpty?: boolean;
  costOnExit?: boolean;
  cooldownOnExit?: boolean;
  /**
   * ⭐ G13-2 —— **開著的期間**身上多的那一份東西（70-00 紮根 · 20-01 風王結界）。
   * Mirrors `zAbilityToggle.whileOn`；⛔ 語意住在 schema 上。
   *
   * 缺席 = 開著什麼都不多 = 今天逐字（實測：`whileOn.ranks[0].modifiers` 填了
   * armor +77，開前開後 `final[armor]` 都是 37.3，`sources` 也完全沒變）。
   *
   * ⭐ **重用 `AbilityPassive`**（`{ name?, ranks: AbilityPassiveRank[] }`），
   * ⛔ 不是第二份 `EffectDef[]`：`EffectDef[]` 表達不出「開著期間」，因為那需要
   * 一個沒有人知道多長的 `duration`。
   *
   * ⚠️ 已知邊界（schema 明說，⛔ 不要順手補第三格）：`syncAbilityPassives` 不碰
   * 這條來源，所以**開著的時候升級不換 rank**。
   */
  whileOn?: AbilityPassive;
  /**
   * ⭐ G13-2 —— 關掉的時候，`whileOn` 的加成在 `onExit` **之前**卸下還是**之後**。
   *
   * 省略 = `false` = 先卸下加成再跑 `onExit`（＝沒有這個功能時的等價行為）。
   * ⚠️ 這一格決定的**只是順序** —— 「一定會卸下」不由欄位決定，所以「關掉之後加成
   * 還留著」在結構上不可能發生。
   */
  whileOnDuringExit?: boolean;
}

export interface ChampionDef {
  id: ChampionId;
  name: string;
  role: string;
  attackType: "melee" | "ranged";
  modelKey: string;
  /**
   * The RAW per-champion stat card. Since #248 the attribute-derived rows
   * (maxHealth / healthRegen / ad / armor / as / maxMana / manaRegen / ap) hold
   * the source map's own numbers WITHOUT the 三圍 term — read them through
   * `stats/attributes.ts championStatBase`, never directly, or you are showing
   * a champion 150 hp instead of 575.
   */
  baseStats: Partial<StatBlock>;
  /**
   * Additive per level beyond 1 — the per-hero designer knob. Since #248 it is
   * a deliberate SECOND, additive source alongside `attributes.*Growth`:
   * `stat(L) = baseStats + attr(L)·coef + growth·(L−1)`. `growth.mr` is the one
   * row with no attribute term at all (WC3 has no magic-resist attribute).
   */
  growth: Partial<Record<Stat, number>>;
  /**
   * 三圍 — STR/AGI/INT and their per-level growths, recovered from the source
   * map (task #248). Absent = no attribute derivation at all, which is the
   * pre-#248 behaviour and what the skeleton/test content uses.
   */
  attributes?: ChampionAttributes;
  /**
   * 身體放大倍數 (GH#252) —— 「這位英雄的身體是一個正常體型英雄的幾倍大」。
   * 缺 = 1.0(正常體型),113 位裡有 24 位不是 1。
   *
   * ⚠️ 它**不是**渲染那條路上的任何一個數字的複本,雖然出貨值是從那裡抄來的。
   * 螢幕上的大小由 `content/models/_standin-overrides.json` 決定,而那份檔案是
   * client-only(不在 `content/manifest.json` 裡),sim 從來讀不到 —— 這就是為什麼
   * 在 GH#252 之前「體型影響射程」在物理上不可能發生。出貨值取那份檔案的
   * `standinRelativeScale ?? relativeScale`(= `standinScale.ts` 的
   * `standinRelativeScaleOf`,語意正是「相對於正規化後的一般人有多大」),
   * 兩邊由 `content/championBodyScale.test.ts` 對帳,所以它不會靜默 drift。
   *
   * 唯一的消費端是 `sim/bodyScale.ts attackRangeScaleFactor` → `finalizeStat`
   * 的 `rangeScale` → `Stat.AttackRange`。技能距離**不**看它(見 bodyScale.ts)。
   */
  bodyScale?: number;
  /**
   * ⭐ 70-00【紮根】—— 這具身體不會走路（owner 2026-08-13「類似定身，
   * 可攻擊跟施展技能但不能移動，並非把移動速度調整到 0」）。
   * 缺席 = 會走。語意與**為什麼不是改 ms** 寫在 `content/schema/champion.ts`
   * 的同名欄位；唯一的消費端是 `sim/movementHold.ts`。
   */
  immobile?: boolean;
  /**
   * 每秒回復「最大生命的百分比」(GH#253)。`0.01` = 每秒 1%。
   * 缺 = 這位英雄沒有百分比回血,只吃 `Stat.HealthRegen` 那條固定值。
   *
   * ⚠️ **出貨內容目前沒有任何一位填它。** 2026-08-02 之前是 `godie-hapm`
   * (海克力斯 - Berserker)的 0.01,而 owner 那一天把方向反過來了 ——
   * 他改填 {@link healthDrainPctOfMax}。這一格留著是因為它是一個可調的能力。
   * 百分比與固定值的關係、以及「有沒有保底」都是 `config.regen@1` 的欄位 ——
   * 見 `sim/regenRules.ts`,消費端是 `systems/RegenSystem.ts`。
   */
  healthRegenPctOfMax?: number;
  /**
   * 每秒**流失**「最大生命的百分比」(owner 2026-08-02:「Berserker 是每秒損失
   * 1%生命, 直到生命不足1%」)。`0.01` = 每秒 1%。缺 = 這位英雄沒有自傷。
   *
   * 出貨只有 `godie-hapm` 填了。**它不是傷害** —— 不走 `combat/damage.ts`,
   * 所以不吃 `combatEnv.damageDealt`、不被護盾吸、不噴傷害數字、也扣不死人:
   * 停在哪裡是 `config.regen@1` 的 `drainFloorPctOfMax`(出貨 0.01 =
   * owner 的「直到生命不足 1%」)。語意見 `sim/regenRules.ts`。
   *
   * ⚠️ 這**不是**負的 `healthRegenPctOfMax`。分成兩格的理由(下游三個會把負號
   * 吃掉的地方)寫在 `regenRules.ts` 的檔頭。
   */
  healthDrainPctOfMax?: number;
  /**
   * Ranged auto-attack projectile speed (GGD units/sec, ~= WC3 missile speed
   * × the import distance factor). Ignored for melee. Default applied by the
   * BasicAttackSystem when absent.
   */
  missileSpeed?: number;
  /**
   * Wind-up before a basic attack's hit lands (seconds). Melee applies damage
   * at this point; ranged launches its projectile here. Default per attackType.
   */
  attackDamagePoint?: number;
  /**
   * Base attack-cadence multiplier (dimensionless, default 1.0). The real
   * interval = baseAttackTime / attackSpeed; 1.0 reproduces the classic 1/AS.
   */
  baseAttackTime?: number;
  abilities: Record<CoreAbilitySlot, AbilityDef>;
  /**
   * Optional per-hero "EX 技能" ability id (slot "EX"), unlocked at the arena
   * EX-unlock point. Absent = this hero has no EX skill. Resolved via the
   * Abilities registry (standalone ability doc), not embedded above.
   */
  exAbility?: AbilityId;
  /**
   * The per-hero 天生技 / PASSIVE ability id (slot "PASSIVE") — the SIXTH slot,
   * owned from level 1, resolved via the Abilities registry exactly like
   * `exAbility`. Absent = the source map has no NN-00 for this hero (3 of 111).
   * Unrelated to `passive` below, which is a legacy hook block, not a slot.
   */
  passiveAbility?: AbilityId;
  passive?: { name: string; hooks?: HookDef[]; modifiers?: StatModifier[] };
  /**
   * Icon path relative to content/ ("assets/icons/champions/<id>.png",
   * w3x BLP→PNG). Absent = client falls back to text-only rendering.
   */
  icon?: string;
  /**
   * WC3 vertex-colour MULTIPLY `[r,g,b]`, each 0..1 (task #49). Applied by the
   * client per-material as `texture.rgb * tint`; absent = untinted. Purely
   * visual — the sim never reads it, it rides along so registry reads stay
   * typed (same treatment as `icon`).
   */
  tint?: [number, number, number];
  /** Opacity 0..1; absent = 1 (opaque). Visual only, like `tint`. */
  alpha?: number;
  /**
   * 變身 form link recovered from the map's WC3 Metamorphosis fields `Eme1` /
   * `Emeu` (task #249) — see `content/schema/champion.ts` for the full contract
   * and `content/championForms.ts` for the shipped 26-pair table.
   *
   * ⚠️ 「DATA ONLY: the sim never reads this」曾經寫在這裡，而它已經是謊話
   * （第三守則）：`sim/systems/ChampionFormSystem.ts` 讀 `counterpartId`（目的地）
   * 與 `reenter`（重複進入形態時的計時規則）。`role: "alternate"` 仍然只是標記
   * 一個不可獨立挑選的身體。
   */
  transform?: {
    role: "base" | "alternate";
    counterpartId?: ChampionId;
    /**
     * 變身唯一狀態的碰撞規則 —— 見 `content/schema/champion.ts` 的 `zTransformLink`。
     * 缺省 = `DEFAULT_FORM_REENTER`（`sim/systems/ChampionFormSystem.ts`）。
     */
    reenter?: "restart" | "keepLongest" | "reject";
    normalUnitRawcode: string;
    alternateUnitRawcode: string;
    triggerAbility: {
      rawcode: string;
      name?: string;
      /** per level, keyed "1".."4"; absent = toggle / death-state morph */
      durationSec?: Record<string, number>;
      cooldownSec?: Record<string, number>;
    };
  };
  /** AI hints (Q/W/E/R only) */
  skillOrder: CoreAbilitySlot[];
  buildPriority: ItemId[];
  tags: string[];
}

/**
 * A static item modifier that may be gated on WHO is holding the weapon —
 * mirrors `zGatedItemStatModifier` in content/schema/item.ts, where the choice
 * of this shape (over a parallel `modifiersByAttackType` map) is argued.
 *
 * `requires` absent = every carrier gets it, which is every modifier authored
 * before this field existed. Resolved ONCE at equip time by
 * `sim/economy/itemSource.ts`; the `ModifierSource.modifiers` the stat pipeline
 * folds is always a plain, already-resolved `StatModifier[]`.
 */
export interface ItemStatModifier extends StatModifier {
  requires?: ClassRequirement;
}

/**
 * 套裝 — 「同時裝備 A、B、C，則…」. Mirrors `zItemSetBonus` in
 * content/schema/item.ts; the mechanism and the reason it is authored on the
 * ITEM rather than in a config doc are in `sim/economy/itemSets.ts`.
 *
 * ⚠️ The reward is granted ONCE per set (one `ModifierSource` keyed by `id`),
 * NOT once per piece held. Reading this array straight onto an item's own
 * source would give 死之王套裝 +300 % AP instead of +100 %.
 */
export interface ItemSetBonus {
  /** 套裝 id — THE de-duplication key. Every piece repeats the same block. */
  id: string;
  /** 套裝名 for a card/tooltip, e.g. 「死之王套裝」. */
  name?: string;
  /** every item that counts toward this set (must include the declaring doc). */
  pieces: ItemId[];
  /** how many pieces must be held. Absent = ALL of them. */
  requiredPieces?: number;
  /** do two copies of one piece count twice? Absent = false (distinct pieces). */
  countDuplicates?: boolean;
  /** off switch. Absent = true — authoring the set is enough to arm it. */
  enabled?: boolean;
  /** what a COMPLETED set grants the holder. May carry the 職業限定閘. */
  modifiers: ItemStatModifier[];
}

export interface ItemDef extends SourceGrantFields {
  id: ItemId;
  name: string;
  cost: number;
  tier: number;
  unique?: boolean;
  /**
   * 靜態加成. Entries may carry a `requires` 職業限定閘 — 貫雷槍's 「近戰攻擊
   * 距離+4；遠戰攻擊距離+2」 is two entries on this one array, not two arrays.
   * NEVER read this list straight onto a ModifierSource: go through
   * `sim/economy/itemSource.ts::attachItemSource`, which applies the gate.
   */
  modifiers?: ItemStatModifier[];
  /**
   * 三圍加成 — 力/敏/智 granted while this item is equipped. Mirrors
   * `item@1.attributes`. 四魂之玉 「力敏智+30」, 朗基努斯之槍 「力量+12 敏捷+12」.
   *
   * A SEPARATE payload from `modifiers`, not an entry in it, because 力/敏/智
   * are not members of `Stat`: they are the champion attribute model
   * (`stats/attributes.ts`), and one point fans out into up to three derived
   * stats under two different arithmetics (armor additively, attack speed
   * MULTIPLICATIVELY on the champion's own base). Forwarded onto the
   * `kind: "item"` ModifierSource by `economy/itemSource.ts` and folded into the
   * champion's BASE by `stats/statPipeline.ts` — the same seam the 能力屬性強化
   * 三選一 card (#260) uses, so an item's +30 STR and a card's +30 STR are the
   * same number by construction rather than by agreement.
   */
  attributes?: AttrGrant;
  /**
   * 套裝 this item belongs to — mirrors `item@1.sets`. Absent on every doc that
   * predates it, which is all but the three 死之王 pieces.
   *
   * ⚠️ NEVER fold these into the item's own `ModifierSource`. The set pays out
   * ONCE, through a separate `item-set:<id>` source built by
   * `sim/economy/itemSets.ts` — three pieces each carrying the reward is +300 %,
   * not +100 %.
   */
  sets?: ItemSetBonus[];
  passive?: HookDef[];
  /**
   * 光環 this item projects around its holder — mirrors `item@1.auras`.
   * Forwarded verbatim onto the `kind: "item"` ModifierSource by every attach
   * site in `economy/shop.ts`, so `sim/aura/aura.ts` drives it exactly as it
   * drives an ability's aura. Absent on every doc that predates it.
   *
   * ⚠️ A hook inside one of these fires with the RECIPIENT as its owner (the
   * ally standing in the radius), not the item's holder — that is what makes
   * `hooks[].requires` read as 「周圍的近戰友軍」.
   */
  auras?: AuraDef[];
  /**
   * 隱形 / 真視 granted while this item is equipped — mirrors `item@1.vision`.
   * Rides the `kind: "item"` ModifierSource exactly like an ability passive's
   * does, so `sim/stealth.ts` `syncVisionGrants` needs no new branch: it walks
   * every source on the StatsComp and reads `src.vision`.
   */
  vision?: VisionGrant;
  /**
   * 飛行 (無視碰撞) granted while this item is equipped — mirrors
   * `item@1.flight`. Same wiring as `vision`: `sim/flight.ts`
   * `syncFlightGrants` already reads `src.flight` off every source.
   */
  flight?: import("../flight").FlightGrant;
  /**
   * 傷害型別轉換 while equipped — mirrors `item@1.damageTypeOverride`.
   * 「[無視] 普攻無視敵方防禦真實傷害」/「[真實傷害] 所有裝備者技能傷害都轉為
   * 真實傷害」。Rides the `kind: "item"` ModifierSource; the whole wiring is one
   * forward in `economy/itemSource.ts`, and the only reader is the damage queue
   * (`combat/damageTypeOverride.ts`). Absent on every doc that predates it.
   */
  damageTypeOverride?: import("../combat/damageTypeOverride").DamageTypeOverride;
  /**
   * 格擋 while equipped — mirrors `item@1.block`.
   * 「[格擋] 50%格擋 AD 及 AP 傷害 (真實傷害無法阻擋)」/「50%機率抵擋 100% AP傷害」/
   * 「30%機率 抵擋致命一擊(超過現存生命的傷害)」—— 三句話、一組軸。Rides the
   * `kind: "item"` ModifierSource; the whole wiring is one forward in
   * `economy/itemSource.ts`, and the only reader is the damage queue
   * (`combat/block.ts::blockCutFor`). Absent on every doc that predates it.
   */
  block?: import("../combat/block").BlockGrant;
  /**
   * [暴擊吸血] —— 天堂之劍 (godie-i01n) 「6%機率造成10倍暴擊傷害，暴擊時吸血
   * 回復100%傷害」。Rides the `ModifierSource` through `economy/itemSource.ts`;
   * the readers are the swing point (`systems/BasicAttackSystem.ts`, the roll)
   * and the damage queue (`combat/damage.ts`, the lifesteal payout), both via
   * `combat/critStrike.ts`. Absent on every doc that predates it.
   */
  critStrike?: import("../combat/critStrike").CritStrikeGrant;
  iconKey?: string;
  /**
   * Icon path relative to content/ ("assets/icons/items/<id>.png", w3x
   * BLP→PNG). Absent = client falls back to text-only rendering. `iconKey`
   * above is the legacy skeleton-era symbolic key — unrelated.
   */
  icon?: string;
  tags: string[];
  /**
   * Crafting/provenance role, recovered from the source map's TRIGGERS by
   * tools/w3x-import/extract_item_roles.py — NOT inferred from cost or name at
   * runtime (task #70, reopened twice). This is the field the owner's two
   * rules are read off:
   *   - "final"     a crafted end product WITH a 製作書 — the ONLY thing the
   *                 shop may list (rule 1: 只有最終合成武器才能上架, 有製作書的).
   *   - "quest"     obtained by completing a quest — the ONLY thing the
   *                 3-choose-1 draft may offer (rule 2: 隨機三選一…所有任務道具).
   *   - "component" consumed by some recipe (every 製作書 is one). Never sold,
   *                 never drafted.
   *   - "token"     a 兌換/認領/交換 shop token — grants a component, is not one.
   *   - "direct"    sold for gold in the source map, never crafted, never a
   *                 quest reward (the 神器/mercenary shelf).
   *   - "service"   a shop MECHANIC (orb roll / stat tick), payload is code.
   *   - "none"      referenced by no recipe, shop or quest trigger.
   * Absent on legacy docs; treated as "none" everywhere it gates a surface.
   */
  craftRole?: ItemCraftRole;
  /**
   * For a "final" item, the recipe its own trigger implements: the 製作書 that
   * unlocks it and the component items it consumes. Present so the classifier
   * is auditable off the doc and a re-import can reconstruct it. The sim never
   * combines — GGD has no craft step — this is provenance, not mechanics.
   */
  recipe?: ItemRecipe;
  /**
   * WHO this item may be OFFERED to (#189, owner 2026-07-28: 傳說武器三選一
   * 「只出現在近戰英雄」). Absent = everybody, which is every pre-#189 doc.
   *
   * The legendary pool had NO attack-type dimension at all before this: both
   * roll sites (`economy/legendaryOrb.legendaryPool` for the 傳說寶玉 and
   * `economy/draft.offerItems` for the round weapon card) filtered on ownership
   * + operator whitelist + craftRole and nothing else, so a melee-only weapon
   * authored without this field lands on a ranged champion's card and its
   * on-hit design reads as a lie.
   *
   * It gates the OFFER, not the inventory: an item already held keeps working
   * (nothing in the sim re-checks it), because a mid-match champion swap must
   * not silently delete somebody's weapon.
   */
  requiresAttackType?: "melee" | "ranged";
  /**
   * May this item be OFFERED by a draft at all — the quest 3-choose-1, the
   * round weapon card, and the 傳說寶玉 roll. Absent = `true`, i.e. every doc
   * that predates the field.
   *
   * WHY IT IS A FIELD AND NOT A DELETION. Two imported quest items ship with
   * the w3x COST implemented and the PAYOFF missing — 天堂之劍 (godie-i01n) has
   * its 生命-500 but not the 「魂藏」 on-death revive that justified it, and
   * 仙后座 (godie-i01s) has neither its blink nor its 25% evasion. A purely
   * negative card in a 3-choose-1 is not a choice, it is a punishment for
   * drafting. Deleting them would make putting them back a code change; a
   * boolean makes it a toggle (CLAUDE.md 第一守則 —— 決策點要變成欄位).
   *
   * IT GATES THE OFFER, NOT THE INVENTORY, exactly like `requiresAttackType`:
   * an item already in a slot keeps working, and the whitelist still says the
   * item EXISTS. Enforced in `economy/offerEligibility.itemOfferableTo`, which
   * both roll sites consult BEFORE the roll.
   */
  draftEligible?: boolean;
  /**
   * Editor/audit-facing note. NEVER rendered to a player — `description` is the
   * player-facing text and this is not a second copy of it. Kept on the doc
   * rather than in a code comment so that "what this item is still missing"
   * travels in the same file, the same diff and the same admin form as the
   * numbers it is about (CLAUDE.md 第三守則 —— a comment in another file rots
   * unseen by whoever edits the data).
   */
  authoringNote?: string;
}

export type ItemCraftRole =
  | "final"
  | "component"
  | "quest"
  | "token"
  | "direct"
  | "service"
  | "none";

export interface ItemRecipe {
  /** The 製作書 (recipe book) item, when the recipe uses one. */
  book?: ItemId;
  /** The component items the recipe consumes (excluding the book). */
  components: ItemId[];
}

export type AugmentTier = "silver" | "gold" | "prismatic";

export interface AugmentDef extends SourceGrantFields {
  id: AugmentId;
  name: string;
  description: string;
  /**
   * ⭐ 2026-08-18（owner「順便補完其他沒有圖示的寶具跟固有能力」）—— 三選一卡片的圖。
   *
   * ⚠️ 在這一天之前 `augment@1` 沒有這一格，於是 91 張固有能力的圖示**畫好了躺在磁碟上
   * 卻沒有任何文件指得到它**（`tools/icon-gen/local/batch.py::set_icon_field` 當時對
   * augments 直接 `return False`，而那個拒寫閘的理由就是「schema 收不下」）。
   * 卡片畫得出來是因為 `ui/panels/resolveChoice.ts` **按 id 組路徑**繞過去了 ——
   * 那條慣例現在退居備援，欄位是主來源。
   *
   * 形狀與 `AbilityDef.icon` / `ItemDef.icon` 逐字相同（相對 `content/` 的 `assets/…`），
   * ⛔ 不發明第二種：三者走同一支渲染器與同一條靜態路由。
   */
  icon?: string;
  tier: AugmentTier;
  weight: number;
  modifiers?: StatModifier[];
  hooks?: HookDef[];
  /**
   * 格擋 / 暴擊來源 this augment grants (owner GH#299 第 2 · 6 條). Forwarded onto
   * the `kind: "augment"` ModifierSource by `economy/draft.ts::applyAugmentPick`
   * through `stats/sourceGrants.ts` — the SAME two fields an item writes, not a
   * second mechanism.
   *
   * The 三選一 side is where `critRules.stackMode: "multiply"` earns its keep:
   * the whole argument for multiplying (owner 2026-08-09) is 「玩家的第二張暴擊卡
   * 不可以是廢牌」, and before this field a card had no way to BE a second
   * independent crit source — it could only add to the aggregate two stats.
   */
  block?: import("../combat/block").BlockGrant;
  critStrike?: import("../combat/critStrike").CritStrikeGrant;
  tags: string[];
  /**
   * ⭐ **靈基適性條件**（聖杯願望設計規則 §15「⛔ 禁止死願望」）。缺席 = 無條件。
   *
   * 讀它的**只有** `economy/draft.ts::offerAugments` —— 這是一個**開牌時**的閘,
   * ⛔ 不是一個執行期效果。一張條件不成立的願望**不進卡池**,而不是進了之後
   * 靜靜地什麼都不做（那正是要關掉的失敗形態 ②）。
   */
  eligibility?: import("../economy/grailVocabulary").GrailEligibility;
  /** ⭐ §16 顯現位置偏好。缺席時開牌視同 `generic`。 */
  selectionSlot?: import("../economy/grailVocabulary").AugmentSelectionSlot;
}

export interface ProjectileDef {
  id: ProjectileId;
  speed: number;
  maxRange: number;
  hitRadius: number;
  pierce?: boolean;
  vfxKey?: string;
  /** RENDER-ONLY 3D body shape for the flying missile (see projectile@1). */
  meshShape?: "bolt" | "orb" | "shard";
  /**
   * RENDER-ONLY flight attitude (#394, see `projectile@1.flight`). Absent =
   * nose along the travel direction, level, no spin — the pre-#394 picture.
   * ⚠️ The sim never branches on it; it exists so the CLIENT stops drawing
   * every missile as the same nose-first dart.
   */
  flight?: {
    yawOffsetDeg?: number;
    pitchDeg?: number;
    rollDegPerUnit?: number;
  };
}

export interface LootTable {
  id: string;
  entries: { itemId: ItemId; weight: number }[];
}

/**
 * `status-effect@1` 裡**被 sim 讀到**的那幾格（A4b，#278；`tags` 於 2026-08-08 加）。
 *
 * ⚠️ 這份 def 刻意**只**收 sim 真的要做決定的欄位。`status-effect@1` 的其餘內容
 * （name / icon / description）是**顯示身分**，由 UI 那一側自己讀
 * `content/registries.ts` 的 `StatusEffects` —— sim 不需要、也不該把它們拉進純度
 * 閘裡面。加欄位之前先問：「sim 會拿它來分岔嗎？」不會就別加。
 *
 * ⛔ 而 `polarity` 必須走這條路，不可以在 `applyStatus` 裡從欄位猜：一個
 * `moveSpeedMult: 1.3` 的加速與 `0.7` 的減速在結構上長得一模一樣，任何啟發式
 * 都會在某一張卡上錯，而且從編輯器修不掉（`components.ts` 的 `StatusEffect.polarity`
 * 檔頭寫的就是這件事）。
 */
export interface StatusMeta {
  polarity?: "buff" | "debuff";
  /**
   * 這份狀態屬於哪幾**類**（`stun` / `cc` / `slow` / `banked` …），逐字取自
   * `status-effect@1` 的 `tags`。
   *
   * ⭐ 為什麼它必須進 sim，而 name/icon 不必：`condition.ts` 的
   * {@link StatusTagLeaf} 問的是「身上有沒有**任何一份**帶著這個 tag 的狀態」，
   * 那是一個**求值時的分岔**，不是顯示。而「暈眩」在出貨內容裡是五份不同的
   * 文件（`burnstun` / `fang-stun` / `ingredient` / `omnislash-lock` /
   * `trial-stun`），所以沒有這一格的話，89-00「敵方暈眩時追加致盲」就得由作者
   * 手寫五個 id 的 `any:[…]`，而第六份暈眩上架的那一天它會安靜地漏掉。
   *
   * ⛔ 不要在 sim 這一側另外開一份 id→tag 表（`hasEquipment` 的註解寫的是同一
   * 件事）：那是第二個答案，只會在某一份狀態改了 tags 的那天跟這裡分歧。
   */
  tags?: readonly string[];
}

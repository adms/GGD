/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { ResourcePctTerm } from "../dynamicTerms";
import type { DamageType, Scaling } from "../effect";

/* ═══════════════════════════════════════════════════════════════════════
 * RESERVED KINDS (GH#289) — the schema and the registry know them, the
 * handlers throw. Each is one parallel lane's landing pad; see the header of
 * effects/effectRegistry.ts for the three-file recipe, and the kind's own
 * module for why it does or does not need a new SimWorld store.
 *
 * They are declared HERE, up front and all at once, so that six lanes never
 * have to edit this union (or SimWorld's class body) concurrently — the
 * merge conflict this whole split exists to prevent. The FIELDS are a
 * first draft: a lane may reshape its own member, and only its own.
 * ═══════════════════════════════════════════════════════════════════════ */
/**
 * dot — 持續傷害 (lane P1). Periodic damage on a deadline, the WC3
 * 中毒/燃燒/腐蝕 family. A separate kind from `damage` because it needs
 * SCHEDULING: `world.dot` remembers who is burning and when the next payout
 * lands (see effects/dot.ts).
 */
export interface DotVariant {
  kind: "dot";
  /** ⭐ G11（GH#299）—— 燒在誰身上。省略 = `"target"`。 */
  applyTo?: "self" | "target";
  /**
   * Armour (physical) / MR (magic) / neither (true). Payouts go through the
   * damage QUEUE, so this is the same knob and the same mitigation curve as
   * the `damage` kind — a 「中毒」 that ignored armour would be `"true"` on
   * purpose, not by accident.
   */
  /**
   * 傷害型別。**省略 = `world.damageRules.defaultAbilityDamageType`**
   *（出貨 `magic` —— owner 2026-08-05「技能傷害預設都改成 AP 傷害」）。
   *
   * ⚠️ 這一格與**係數來源**（`amount` 的 `Scaling` 讀 ap/ad/str/agi/int）
   * 是兩件事：型別決定吃護甲還是魔抗，係數決定數字多大。
   */
  damageType?: DamageType;
  /** damage per PAYOUT (not per second) — resolved against the caster at apply */
  amountPerTick: Scaling;
  /**
   * 資源百分比項,**每一次付款**都加上它 —— 熾天使之弓 godie-i012 的
   * 「每秒燃燒 3% 最大生命,持續 2 秒」。形狀與上界見
   * {@link ResourcePctTerm}(effects/dynamicTerms.ts),與 `damage` 用的
   * 是同一個型別、同一個解算函式。
   *
   * ⚠️ **在 apply 當下就對每個受害者解算完,凍進 `DotInstance.amountPerTick`**,
   * 跟 `amountPerTick` 這一項的既有語意完全一致(dot.ts:「一次施放的每個
   * 受害者燒同一個數字,而那個數字在 APPLY 就凍住」)。每次付款重讀會是
   * 另一個機制(而且會讓一個死掉的施法者的燒傷還在跟著對方的裝備變動)。
   * 也因此 `effects/dotTick.ts` **一行都不用改**。
   *
   * ⚠️ 上界架在**整段燒完的總量**上,不是單次付款 —— 一次 `damage` 的
   * 0.35 是一下,而 dot 會付 `duration/interval` 次。推導與數字見
   * `DOT_RESOURCE_PCT_RATIO_TOTAL_MAX`,載入時的檢查在
   * `content/schema/effect.ts` 的 `dot` superRefine。
   */
  resourcePct?: ResourcePctTerm;
  /**
   * ⭐ 45-01 —— `resourcePct` 什麼時候解算。省略 = `"onApply"` = 在施加的
   * 那一刻算一次並凍進 `DotInstance.amountPerTick`（今天每一支的行為）。
   * `"onTick"` = **每一次付款**才用當下的條重算（「每秒受到**當下**現存生命 1%」）。
   * 完整語意與預設值的辯護在 `content/schema/effect.ts` 的同名欄位。
   */
  resourcePctPhase?: "onApply" | "onTick";
  /** seconds between payouts; converted to whole ticks once, at apply */
  intervalSec: number;
  /** total seconds the effect lasts */
  durationSec: number;
  /**
   * Re-applying the SAME `origin` from the SAME caster. THE decision point
   * of this primitive — all three behaviours are shippable and the owner
   * will want to move between them, so it is a field, not a branch.
   *
   *   · `"refresh"` (DEFAULT) — one instance; the deadline is extended and
   *     the payload re-resolved, the cadence is untouched. Chosen as the
   *     default because it is the WC3 buff idiom (re-casting replaces the
   *     buff) and because it is the only one of the three where spamming a
   *     button cannot multiply your damage — the conservative reading of an
   *     authored 「每秒 N 點、持續 M 秒」.
   *   · `"independent"` — every application is its own instance with its own
   *     cadence and deadline. Two casts = double damage.
   *   · `"stack"` — one instance whose payout is `N × stacks`, capped by
   *     {@link maxStacks}; the deadline refreshes with each application.
   *
   * Two DIFFERENT casters never merge under any mode: merging would hand
   * the second caster the first one's kill credit.
   */
  stacking?: "refresh" | "independent" | "stack";
  /** ceiling on the stack count (`"stack"` only). Absent = the schema's own ceiling. */
  maxStacks?: number;
  /**
   * Pay once on the CAST tick as well as on every interval boundary
   * (default false = the first payout is one interval away).
   *
   * Default false because a DoT is usually authored NEXT TO a direct
   * `damage` effect in the same list, and an immediate payout would make
   * the two land on the same tick and read as one double-strength hit. It
   * ADDS a payout rather than re-phasing the schedule, so turning it on is
   * never also a stealth nerf.
   */
  tickOnApply?: boolean;
  /**
   * What happens to a live burn when its caster dies.
   *
   *   · `"continue"` (DEFAULT) — it keeps ticking and keeps crediting the
   *     dead caster, so a poison that finishes someone still pays that
   *     caster the kill and the bounty. This is WC3's behaviour (the buff
   *     lives on the VICTIM) and the reading every 「中毒」 description
   *     implies.
   *   · `"stop"` — the burn dies with its caster, and does NOT resume if he
   *     is revived (a revive is not a re-cast).
   */
  onCasterDeath?: "continue" | "stop";
  /**
   * A4（#278 / GH#295）—— 這一筆延燒可不可以被【淨化】拔掉。
   * 省略 = `world.dispelRules.dotDefaultDispellable`（出貨 true）。
   */
  dispellable?: boolean;
}

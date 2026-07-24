/**
 * combatText — the PURE model behind RO-style floating combat text (task #92).
 *
 * The request: 造成傷害 / 受到傷害 / 補血 / 補魔 must each show a CLEAR number
 * in a colour that matches what it means, with the colours, presentation and
 * fade-in/out modelled on Ragnarok Online. All four categories, and 清晰
 * (legible) is a stated requirement, not an implied one.
 *
 * No DOM and no Babylon here: ui/WorldAnchorLayer is the only renderer and it
 * just stamps what these functions return, so vitest covers the palette, the
 * category split, the motion curve and the admission policy in node.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE AXIS IS *WHO*, NOT *WHAT*
 *
 * roBrowser's `Renderer/Effects/Damage.js` keys colour on the relationship to
 * the local player, not on the damage school: SP restore, HEAL, ENEMY (damage
 * on you) and "everything else" are four fixed tints. That is the axis this
 * module uses, and it is the axis the request names — the four categories are
 * *damage dealt / damage taken / HP restored / MP restored*, which are
 * relationships, not damage types.
 *
 * The previous implementation keyed colour on `dmgType` (physical / magic /
 * true). That channel is already spent: `vfx/vfxPresets.IMPACT_TINTS` tints the
 * spark burst by exactly that field on exactly that frame. Spending the number's
 * hue on it a second time is what made the four requested categories
 * indistinguishable. Damage type is expressed by the spark; the number expresses
 * who it happened to.
 *
 * TEAM COLOURS NEVER APPEAR HERE. Team identity already owns the bar, the name
 * and the minimap; spending the number's hue on it too is how a palette stops
 * meaning anything. Every hue was MEASURED against `TEAM_CSS`
 * (`["#4d7bf3","#e5483f","#47cc6a","#f2c637"]`), CIE76 ΔE to the nearest entry:
 *
 *     taken  #FF0000 → 33.9      dealt  #E8E8E8 → 71.1
 *     heal   #00FF00 → 55.5      guard  #B9C2CC → 68.0
 *     mana   #38D8FF → 66.5
 *
 * all clear of the ~25 confusability line. Retired by that same measurement:
 * the old `KILL_COLOR #ff5a2e` (ΔE 18.4 from team red — effectively team-red).
 * A killing blow is now SIZE and POP inside its own category's hue, which is
 * also what RO does: it does not recolour crits.
 *
 * TWO CORRECTIONS THE MEASUREMENT FORCED, recorded so they are not re-litigated:
 *
 *   · `taken` was going to be a slightly lightened red (#FF1B1B) on the theory
 *     that pure red sits too close to team red. It is the other way round:
 *     #FF1B1B measures ΔE **26.9**, pure #FF0000 measures **33.9**. RO's own
 *     `ENEMY → (1,0,0)` is both the more faithful AND the better separated
 *     choice, so it is what ships. Likewise `heal` is RO's `(0,1,0)` exactly.
 *   · the ALLY band originally had its own desaturated tints (#FF5555 /
 *     #5FE06E). Those measure ΔE **8.6** from team red and **9.7** from team
 *     green — they ARE the team colours. The band now reuses the primary hue of
 *     its category and separates on size and alpha instead, which also shrinks
 *     the palette to five authored hues.
 *
 * The one place RO is overruled is `mana`. RO's SP tint is `(0.13,0.19,0.75)` =
 * #2130BF, and it is team-safe (ΔE 35.2) — but it is a dark navy, and a dark
 * fill inside a black ring is a black blob: it measures **2.24:1 against its own
 * outline**, versus 12.43:1 for #38D8FF. The overrule is a legibility result,
 * not a team-collision one. RO's combo-total yellow `(0.9,0.9,0.15)` = #E6E626
 * is also declined at ΔE **25.0** from team gold, right on the line — which
 * costs nothing here, because nothing in this design aggregates a total.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 清晰: THE OUTLINE CARRIES LEGIBILITY, THE HUE CARRIES MEANING
 *
 * This is the load-bearing decision, and it is forced by measurement. A
 * floating number is anchored over the target's body, so the backgrounds it is
 * *guaranteed* to be born on are not the floor:
 *
 *   · the victim hit-flash — `render/combatFeedback.flashColorFor()` returns
 *     [1, .15, .15] at alpha .6 for 130 ms on EVERY damage type, started by the
 *     same event that spawns the number. `taken` on that flash: **1.04:1**.
 *   · the impact VFX — `vfxPresets.IMPACT_TINTS` flash quads are ADDITIVE and
 *     0.9–1.8u wide. `dealt` on a blown-out white field: **1.23:1**.
 *   · the rebuilt #80 ground is a mid-grey (lit luminance ≈ #575757–#8d8d8d),
 *     not the dark UI tone a palette gets designed against. #FF0000 has relative
 *     luminance 0.2126 and sits *inside* that band: **1.20–1.81:1**.
 *
 * No hue survives all three — which is the whole point. The treatment does:
 * against the BLACK RING the same five hues measure 5.25 / 15.30 / 12.43 /
 * 17.14 / 11.65, and each gradient's top stop measures 2.56–7.23 against the
 * grounds and 2.97 against the red flash where its core measured 1.04. The ring
 * and the gradient are carrying the legibility, exactly as claimed:
 *
 *   1. A HARD 8-DIRECTION BLACK RING (`OUTLINE_DIRS`), not the old
 *      `text-shadow: 0 1px 3px #000`, which is a *blur* — it smears at small
 *      sizes and adds nothing on a bright ground. Black-on-anything is the
 *      contrast floor: the ring itself measures 21:1 against the additive white
 *      flash, so the glyph always reads as a shape even in the 40 ms where its
 *      fill is washed out.
 *   2. A DARK HALO on the categories that spawn inside the red flash, which
 *      changes the background instead of the foreground — the number sits in
 *      its own dark pocket rather than fighting the flash on hue.
 *   3. A VERTICAL GRADIENT FILL (light top → saturated bottom), which is what
 *      RO's digit sprites actually look like. It buys the low-luminance hues
 *      (red especially) real luminance headroom at the top of every glyph
 *      without giving up the hue identity at the bottom.
 *   4. FIXED SIZE PER CATEGORY. The old `clamp(11 + amount * 0.14, 11, 30)` put
 *      a chip hit at **11 px** — illegible over the #80 ground, and the single
 *      biggest 清晰 defect. RO never scales digit height by magnitude; the
 *      digits carry the magnitude. Size here means *importance*, and it is
 *      constant per category.
 *   5. `tabular-nums`, so a number never reflows its own width.
 *
 * Colour-blind separation is built in rather than assumed: taken (dark red) and
 * dealt (white) separate on luminance alone under any CVD, and heal vs mana —
 * the pair tritanopia collapses — separate on weight, italic, anchor height and
 * drift direction, none of which are colour.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MOTION IS RO'S, INCLUDING THE FALL
 *
 * roBrowser, verbatim:
 *     position[2] = entity.position[2] + 2 + Math.sin(-PI/2 + PI*(0.5 + perc*1.5)) * 5
 *     color[3]    = 1.0 - perc
 * which is `BASE_LIFT + ARC * sin(1.5π · t)`: it PEAKS at t = 1/3, is back at
 * spawn height at t = 2/3, and ends a full peak-height BELOW where it was born.
 * It is a lob, not a rise. Rise-and-hold-above-the-head is the WoW/League
 * silhouette, and holding alpha at 1.0 for most of the life is precisely the
 * 停留成一大片光污染 the user rejected. This module implements the lob and the
 * linear decay.
 *
 * The one deliberate departure: the request says 淡入出 — fade IN and out — and
 * RO has no fade-in at all. `FADE_IN_MS` is 70 ms, 6 % of a life, so the alpha
 * envelope is a triangle whose integral is 0.50 × life, matching RO's 0.50
 * exactly. The fade-in is honoured without buying back any ink.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANTI-CLUTTER, AND WHY THERE IS NO MERGE WINDOW
 *
 * A tempting design accumulates repeat hits into one climbing number over a
 * ~260 ms window. It was rejected: re-popping a node mid-flight makes it snap
 * backwards down its own arc several times a second (RO numbers never reverse
 * direction), a merged node's life extension is what actually produces light
 * pollution, and a 250 ms DoT would merge while a 300 ms one would not — the
 * same ability changing presentation on a 40 ms margin.
 *
 * What is here instead:
 *   · `COALESCE_MS` = one sim tick. Two events on the SAME target in the SAME
 *     category within one tick (an AoE that double-dips, two lifesteal sources)
 *     add into the node that is still inside its own fade-in. It is invisible
 *     because the node is < 34 ms old, and it does NOT extend the life.
 *   · `SPAWN_STAGGER_MS`, RO's actual multi-hit answer
 *     (`ActivationTime = time + 0.2f * i`): simultaneous spawns on one body are
 *     released in sequence, so a burst arrives as a stream instead of a stack.
 *   · `MAX_LIVE_PER_TARGET`, so no body can ever carry a pile.
 *   · PRIORITY ADMISSION at the global cap. The old code did
 *     `list.splice(0, over)` — priority-blind, so YOUR OWN 受到傷害 number could
 *     be evicted by a stranger's chip damage two zones away. `worstEntryIndex`
 *     evicts the least important, most-faded entry, and refuses the newcomer
 *     outright if it is the least important thing on screen.
 *   · A SCOPE SETTING (`CombatTextScope`), because in a 4-team lobby most events
 *     on screen involve neither you nor your team.
 *
 * Anchors are also chosen to keep the number OFF the health bar it belongs to:
 * bars project from y = 2.45 (`render/overheadAnchors.anchorHeightFor`), every
 * category here anchors at 0.85–1.30 and its arc peaks well below the bar block.
 * A number that hides the HP readout you need in order to decide whether to keep
 * hitting is worse than no number.
 */
import type { CombatTextScope } from "../settings/types";
import {
  HUD_SLOTS,
  hudSlotRect,
  hudRectsOverlap,
  type HudRect,
  type HudSlotId,
  type HudViewport,
} from "./hud/hudLayout";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/**
 * The four categories the request names, plus the three third-party bands and
 * the guard read. Ordered by importance — `CATEGORY_RANK` mirrors this.
 */
export type CombatTextCategory =
  | "taken" // 受到傷害 — you were hit
  | "dodge" // 閃避 — an attack on YOU missed (task #92b)
  | "heal" // 補血 — HP restored on you
  | "mana" // 補魔 — MP restored on you
  | "dealt" // 造成傷害 — you hit something
  | "guard" // a hit on you that a shield/DR ate entirely
  | "whiff" // MISS — YOUR attack was dodged (task #92b)
  | "allyTaken"
  | "allyHeal"
  | "allyMana"
  | "allyDodge"
  | "other"; // neither you nor your team

/** How an entity relates to the local player. */
export type CombatTextRelation = "self" | "ally" | "enemy" | "unknown";

/**
 * What the sim event was. `evade` is the defender's 迴避 roll eating a basic
 * attack whole (packages/shared/src/sim/combat/evasion.ts) — it carries NO
 * amount, which is exactly why it needs its own kind: every other kind here is
 * a magnitude, and an evade is the absence of one.
 */
export type CombatTextKind = "damage" | "heal" | "mana" | "evade";

/**
 * How much of the fight the player wants numbered. The union itself lives in
 * settings/types (it is a PERSISTED shape) — re-exported here so consumers of
 * the model need only one import.
 */
export type { CombatTextScope };

export interface CombatTextEvent {
  kind: CombatTextKind;
  /** HP/MP actually moved (already post-mitigation, post-shield, post-clamp) */
  amount: number;
  sourceRel: CombatTextRelation;
  targetRel: CombatTextRelation;
  crit: boolean;
  blocked: boolean;
  killingBlow: boolean;
}

/**
 * Which category an event lands in, or null when it must not be drawn at all.
 *
 * `targetRel === "self"` always wins over `sourceRel === "self"`: hitting
 * yourself (a recoil/sacrifice cost) reads as damage TAKEN, because that is the
 * number that decides whether you retreat.
 */
export function combatTextCategory(ev: CombatTextEvent): CombatTextCategory | null {
  // 迴避 (task #92b). ONE sim event, TWO opposite readings — see the ASYMMETRY
  // block above the palette. `targetRel === "self"` wins over `sourceRel` for
  // the same reason it does on damage: what happened to YOUR health is the fact
  // you act on. (Self-targeted autos do not exist, so the two never collide.)
  if (ev.kind === "evade") {
    if (ev.targetRel === "self") return "dodge";
    if (ev.sourceRel === "self") return "whiff";
    if (ev.targetRel === "ally") return "allyDodge";
    // No local player resolved at all (spectating / pre-seat): pushCombatText's
    // spectator branch bypasses the scope gate, and a spectator watching a duel
    // must see the dodge or the fight reads as broken. Anything else — an enemy
    // slipping an attack that was neither yours nor your team's — is dropped:
    // an evade has no magnitude, so a stranger's dodge is a WORD carrying zero
    // information for you, and it is the cheapest event on the field to spam
    // (one 20%-evasion champion being autoed at ~1.2/s in each of three other
    // duels). Enemy `mana` is dropped for the same reason, at every scope.
    if (ev.targetRel === "unknown" && ev.sourceRel === "unknown") return "allyDodge";
    return null;
  }
  if (ev.kind === "heal") {
    if (ev.targetRel === "self") return "heal";
    if (ev.targetRel === "ally") return "allyHeal";
    return "other";
  }
  if (ev.kind === "mana") {
    if (ev.targetRel === "self") return "mana";
    if (ev.targetRel === "ally") return "allyMana";
    // An enemy topping up mana is not information you can act on, and it is the
    // single easiest event to spam. Never drawn, at any scope.
    return null;
  }
  // damage
  if (ev.targetRel === "self") {
    // Fully absorbed: the useful fact is "that was blocked", not "0".
    if (ev.amount <= 0) return ev.blocked ? "guard" : null;
    return "taken";
  }
  if (ev.amount <= 0) return null; // a 0 on someone else's body is noise
  if (ev.sourceRel === "self") return "dealt";
  if (ev.targetRel === "ally") return "allyTaken";
  return "other";
}

/** Categories each scope admits. */
const SELF_CATEGORIES: readonly CombatTextCategory[] = [
  "taken",
  "dodge",
  "heal",
  "mana",
  "dealt",
  "guard",
  "whiff",
];
const TEAM_CATEGORIES: readonly CombatTextCategory[] = [
  ...SELF_CATEGORIES,
  "allyTaken",
  "allyHeal",
  "allyMana",
  "allyDodge",
];

/** Does this scope draw this category? */
export function scopeAllows(scope: CombatTextScope, category: CombatTextCategory): boolean {
  switch (scope) {
    case "off":
      return false;
    case "self":
      return SELF_CATEGORIES.includes(category);
    case "team":
      return TEAM_CATEGORIES.includes(category);
    case "all":
      return true;
  }
}

// ---------------------------------------------------------------------------
// Palette + per-category presentation
// ---------------------------------------------------------------------------

export interface CombatTextStyle {
  /** px; CONSTANT per category — never a function of the amount (see module doc) */
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  /** gradient BOTTOM stop, and the flat fallback when background-clip:text is out */
  color: string;
  /** gradient TOP stop — the RO digit-sprite highlight that buys luminance headroom */
  tint: string;
  /** category-level dimming (third-party text recedes) */
  alpha: number;
  /** birth overshoot, settles over POP_MS */
  popScale: number;
  lifeMs: number;
  /** black ring radius, px */
  outlinePx: number;
  /** soft dark halo radius, px — the local dark pocket over a red hit-flash */
  haloPx: number;
  /** "+" on the restore categories, "" elsewhere */
  prefix: string;
  /** world-space Y the number is projected from (metres) */
  anchorY: number;
  /** peak of the RO lob, px */
  arcPx: number;
  /** lateral bias at end of life, px (heal and mana pull apart) */
  driftPx: number;
  /** admission priority — LOWER is kept when the screen is full */
  rank: number;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE 迴避 ASYMMETRY (task #92b) — one event, two opposite readings
 *
 * `evade` (packages/shared/src/sim/combat/evasion.ts) fires once, on the
 * defender's body, when their 迴避 stat eats a basic attack WHOLE: no damage
 * packet, no on-hit proc, no lifesteal, no `damage` event. Before this the
 * client drew nothing at all for it, so a dodge was indistinguishable from a
 * dropped packet — which is precisely the 「看不出剛剛發生什麼事」 complaint.
 *
 * The event is a WIN for the defender and a LOSS for the attacker, and the two
 * must never be confused at a glance. They are separated on FOUR independent
 * channels, none of which relies on reading a number (there is no number):
 *
 *              你閃過了 (dodge)              你被閃過了 (whiff)
 *   word       「閃避」                       「MISS」
 *   hue        lavender  #C9A7FF             slate     #9AA6B2
 *   body       YOURS                          THEIRS
 *   weight     26px / 900 / upright           20px / 800 / italic
 *
 * WHY TWO DIFFERENT WORDS, not one word in two colours. A colour-only split
 * fails exactly when it matters — a 4-team teamfight, motion, and (for ~8% of
 * men) a CVD viewer. 「閃避」 vs 「MISS」 cannot be confused by anyone, and the
 * asymmetry is honest: RO's own sprite over the *victim* is the English "miss",
 * so the attacker's read keeps the source's word and the defender's read gets
 * the Chinese one this UI speaks.
 *
 * WHY LAVENDER FOR THE DODGE. Measured, like every other hue here — CIE76 ΔE to
 * the nearest `TEAM_CSS` entry, and to every hue already in this palette:
 *
 *     dodge #C9A7FF → team 33.4 | taken 119.6  heal 168.9  mana 58.0
 *                                 dealt  52.1  guard 45.2   → contrast vs ring 10.45
 *     whiff #9AA6B2 → team 63.9 | taken 111.8  heal 125.6  mana 36.8
 *                                 dealt  25.7  guard 10.6   → contrast vs ring  8.47
 *
 * Violet is the one hue family this palette had not spent, and it is the only
 * free one that clears 25 against all four team colours (mint #7CFFD4 measures
 * 35.9 from team green and 45.7 from mana — it would have been the second
 * cyan-green on screen; amber #FFA640 measures 24.9 from team gold, i.e. it IS
 * team gold).
 *
 * WHY WHIFF IS DELIBERATELY IN THE GREY FAMILY, ΔE 10.6 from `guard`. That is
 * not a collision that slipped through — grey IS this palette's word for
 * "nothing landed", and `guard` and `whiff` are its two members: a hit you
 * absorbed and a hit you never connected. They are told apart by everything
 * except hue (different word, different body, 20px italic vs 16px upright), and
 * spending a sixth hue on the least consequential event on the field would have
 * cost the palette more than it bought. `whiff` sits ΔE 25.7 from `dealt`, its
 * real sibling — the damage number that did not happen — which is close enough
 * to read as the same family and far enough to read as a different member.
 *
 * WHY NEITHER CAN CRIT. `rollEvade` runs BEFORE mitigation and returns a total
 * miss (DECISION 3 in evasion.ts), so no crit/killingBlow modifier can ever
 * reach these two categories. Nothing enforces that here; the size multipliers
 * simply never fire on them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * The closed palette. Seven hue families, none of them a team colour.
 * `rank` is the admission order and reads top-to-bottom as "what a player must
 * not miss": your own health, then your own resources, then your output, then
 * everything happening to other people.
 */
const BASE: Record<CombatTextCategory, CombatTextStyle> = {
  // 受到傷害 — the number that decides whether you live. Biggest, heaviest,
  // thickest ring, and the strongest halo because it is born ON the red
  // hit-flash that the same event starts.
  taken: {
    fontSize: 30,
    fontWeight: 900,
    italic: false,
    // #FF5900, not #FF0000. Measured against the four real arena grounds
    // (土色 #6d6250, 暗土 #4a4238, 石地 #8a8578, 白岩 #ebebeb) under the rule the
    // ring architecture actually implies: EITHER the fill or the black ring must
    // clear 3.0:1 against the ground, and the fill must clear 3.0:1 against its
    // own ring or the glyph reads as one dark blob.
    //
    // Pure red fails that on 暗土 at 2.47:1 — red and black are both DARK, so on
    // dark dirt neither layer separates and the number is a smudge.
    //
    // The replacement had THREE constraints, not one, and the first candidate
    // (#FF5A5A) failed the third: it sat ΔE 9.4 from the red TEAM colour
    // #e5483f, so a damage number would have read as team chrome. Searching the
    // red→orange band for a colour that (a) clears 3.0:1 on every ground via
    // fill-or-ring, (b) clears 3.0:1 against its own ring, and (c) stays ΔE > 25
    // from all four team hues leaves 833 candidates; #FF5900 is the most
    // saturated, reddest of them — ΔE 31.0 from the nearest team colour, 6.68:1
    // against the ring, worst ground 3.14:1. It reads as a hot impact orange-red
    // and cannot be mistaken for team red.
    color: "#FF5900",
    tint: "#FFD9D9",
    alpha: 1,
    popScale: 1.14,
    lifeMs: 1150,
    outlinePx: 2,
    haloPx: 7,
    prefix: "",
    anchorY: 1.25,
    arcPx: 36,
    driftPx: -10,
    rank: 0,
  },
  // 閃避 — the attack that WOULD have produced the number above, and did not.
  // Deliberately shares `taken`'s anchor band and ranks immediately below it:
  // it occupies the same slot in the player's attention, because it answers the
  // same question ("did my health just move?"). Drifts the OPPOSITE way from
  // `taken`, so dodging one attacker while a second one connects fans the two
  // apart instead of stacking them.
  dodge: {
    fontSize: 26,
    fontWeight: 900,
    italic: false,
    color: "#C9A7FF",
    tint: "#F0E4FF",
    alpha: 1,
    popScale: 1.2,
    lifeMs: 950,
    outlinePx: 2,
    haloPx: 6,
    prefix: "",
    anchorY: 1.25,
    arcPx: 34,
    driftPx: 14,
    rank: 1,
  },
  // 補血
  heal: {
    fontSize: 23,
    fontWeight: 800,
    italic: false,
    color: "#00FF00",
    tint: "#DDFFE0",
    alpha: 1,
    popScale: 1.12,
    lifeMs: 1000,
    outlinePx: 1.5,
    haloPx: 4,
    prefix: "+",
    anchorY: 1.05,
    arcPx: 30,
    driftPx: -24,
    rank: 2,
  },
  // 補魔 — italic + lighter weight + its own anchor height + the OPPOSITE drift
  // from heal, so the one pair that tritanopia collapses stays separable
  // without relying on colour at all.
  mana: {
    fontSize: 21,
    fontWeight: 700,
    italic: true,
    color: "#38D8FF",
    tint: "#DAF6FF",
    alpha: 1,
    popScale: 1.1,
    lifeMs: 1000,
    outlinePx: 1.5,
    haloPx: 4,
    prefix: "+",
    anchorY: 0.85,
    arcPx: 28,
    driftPx: 24,
    rank: 3,
  },
  // 造成傷害 — RO's white. The gradient runs white → light grey so the glyph
  // keeps internal form when an ADDITIVE impact flash washes out behind it.
  dealt: {
    fontSize: 24,
    fontWeight: 800,
    italic: false,
    color: "#E8E8E8",
    tint: "#FFFFFF",
    alpha: 1,
    popScale: 1.1,
    lifeMs: 1050,
    outlinePx: 2,
    haloPx: 5,
    prefix: "",
    anchorY: 1.3,
    arcPx: 34,
    driftPx: 10,
    rank: 4,
  },
  guard: {
    fontSize: 16,
    fontWeight: 700,
    italic: false,
    color: "#B9C2CC",
    tint: "#EEF3F8",
    alpha: 0.95,
    popScale: 1,
    lifeMs: 800,
    outlinePx: 1.5,
    haloPx: 3,
    prefix: "",
    anchorY: 1.25,
    arcPx: 26,
    driftPx: 0,
    rank: 5,
  },
  // MISS — your swing was slipped. Sits in `dealt`'s anchor band and drifts the
  // OPPOSITE way, because it is the 造成傷害 number that did not happen: a hit
  // and a whiff on the same body in the same second must not pile up. Italic and
  // quieter than `dealt` on purpose — losing a swing costs you the cooldown, and
  // an event that costs you something should not shout louder than the ones that
  // earn you something.
  whiff: {
    fontSize: 20,
    fontWeight: 800,
    italic: true,
    color: "#9AA6B2",
    tint: "#DDE4EC",
    alpha: 0.85,
    popScale: 1.04,
    lifeMs: 780,
    outlinePx: 1.5,
    haloPx: 4,
    prefix: "",
    anchorY: 1.3,
    arcPx: 30,
    driftPx: -12,
    rank: 6,
  },
  allyTaken: {
    fontSize: 18,
    fontWeight: 700,
    italic: false,
    // #FF5900, not #FF0000. Measured against the four real arena grounds
    // (土色 #6d6250, 暗土 #4a4238, 石地 #8a8578, 白岩 #ebebeb) under the rule the
    // ring architecture actually implies: EITHER the fill or the black ring must
    // clear 3.0:1 against the ground, and the fill must clear 3.0:1 against its
    // own ring or the glyph reads as one dark blob.
    //
    // Pure red fails that on 暗土 at 2.47:1 — red and black are both DARK, so on
    // dark dirt neither layer separates and the number is a smudge.
    //
    // The replacement had THREE constraints, not one, and the first candidate
    // (#FF5A5A) failed the third: it sat ΔE 9.4 from the red TEAM colour
    // #e5483f, so a damage number would have read as team chrome. Searching the
    // red→orange band for a colour that (a) clears 3.0:1 on every ground via
    // fill-or-ring, (b) clears 3.0:1 against its own ring, and (c) stays ΔE > 25
    // from all four team hues leaves 833 candidates; #FF5900 is the most
    // saturated, reddest of them — ΔE 31.0 from the nearest team colour, 6.68:1
    // against the ring, worst ground 3.14:1. It reads as a hot impact orange-red
    // and cannot be mistaken for team red.
    color: "#FF5900",
    tint: "#FFD9D9",
    alpha: 0.6,
    popScale: 1,
    lifeMs: 850,
    outlinePx: 1.5,
    haloPx: 3,
    prefix: "",
    anchorY: 1.25,
    arcPx: 26,
    driftPx: -8,
    rank: 7,
  },
  allyHeal: {
    fontSize: 16,
    fontWeight: 700,
    italic: false,
    color: "#00FF00",
    tint: "#DDFFE0",
    alpha: 0.6,
    popScale: 1,
    lifeMs: 800,
    outlinePx: 1.5,
    haloPx: 3,
    prefix: "+",
    anchorY: 1.05,
    arcPx: 24,
    driftPx: -18,
    rank: 8,
  },
  allyMana: {
    fontSize: 15,
    fontWeight: 600,
    italic: true,
    color: "#38D8FF",
    tint: "#DAF6FF",
    alpha: 0.55,
    popScale: 1,
    lifeMs: 800,
    outlinePx: 1.5,
    haloPx: 3,
    prefix: "+",
    anchorY: 0.85,
    arcPx: 22,
    driftPx: 18,
    rank: 9,
  },
  // A TEAMMATE slipped one — and, because it is the only evade category a
  // spectator can reach, also every dodge seen with no local player resolved
  // (pre-seat / 觀戰). Same hue and word as your own dodge, receded to the ally
  // band: "someone on my side is hard to hit" is worth a glance, it is not worth
  // competing with your own health.
  allyDodge: {
    fontSize: 15,
    fontWeight: 700,
    italic: false,
    color: "#C9A7FF",
    tint: "#F0E4FF",
    alpha: 0.5,
    popScale: 1,
    lifeMs: 700,
    outlinePx: 1.5,
    haloPx: 3,
    prefix: "",
    anchorY: 1.25,
    arcPx: 22,
    driftPx: 12,
    rank: 10,
  },
  other: {
    fontSize: 15,
    fontWeight: 600,
    italic: false,
    color: "#E6E6E6",
    tint: "#FFFFFF",
    alpha: 0.42,
    popScale: 1,
    lifeMs: 700,
    outlinePx: 1.5,
    haloPx: 3,
    prefix: "",
    anchorY: 1.3,
    arcPx: 22,
    driftPx: 0,
    rank: 11,
  },
};

/** Every category, in rank order. Exported for the palette guard test. */
export const COMBAT_TEXT_CATEGORIES = Object.keys(BASE) as CombatTextCategory[];

/** Crit: bigger and punchier. NOT a different colour — RO does not recolour crits. */
export const CRIT_SIZE_MULT = 1.3;
export const CRIT_POP = 1.32;
/** Killing blow: the most emphasized thing on screen, still in its own hue. */
export const KILL_SIZE_MULT = 1.45;
export const KILL_POP = 1.5;
export const KILL_LIFE_BONUS_MS = 250;

export interface CombatTextMods {
  crit: boolean;
  killingBlow: boolean;
}

/**
 * Category + modifiers → the full presentation. Pure; the returned object is a
 * fresh copy, so callers may not mutate the table.
 */
export function combatTextStyle(
  category: CombatTextCategory,
  mods: CombatTextMods = { crit: false, killingBlow: false },
): CombatTextStyle {
  const base = BASE[category];
  let popScale = base.popScale;
  let lifeMs = base.lifeMs;
  let rank = base.rank;

  // Size takes the LARGER multiplier, it does not compound them. Crit and
  // killing blow both mean "this hit was special"; multiplying them puts a
  // crit-kill at 30 × 1.3 × 1.45 = 57 px — nearly half a champion's on-screen
  // height, for two emphases that say the same thing. RO does not compound
  // emphasis either. 44 px is already the largest thing on screen.
  let sizeMult = 1;
  if (mods.crit) {
    sizeMult = Math.max(sizeMult, CRIT_SIZE_MULT);
    popScale = Math.max(popScale, CRIT_POP);
    rank -= 0.5; // a crit outranks a plain hit of its own category, never the one above
  }
  if (mods.killingBlow) {
    sizeMult = Math.max(sizeMult, KILL_SIZE_MULT);
    popScale = Math.max(popScale, KILL_POP);
    lifeMs += KILL_LIFE_BONUS_MS;
    rank -= 0.75;
  }

  const fontSize = Math.round(base.fontSize * sizeMult);
  return {
    ...base,
    fontSize,
    popScale,
    lifeMs,
    rank,
    // the ring has to grow with the glyph or a 44 px crit reads as unoutlined
    outlinePx: fontSize >= 24 ? 2 : 1.5,
    haloPx: base.haloPx,
  };
}

/** Admission priority for a would-be entry (lower = more important). */
export function combatTextRank(category: CombatTextCategory, mods: CombatTextMods): number {
  return combatTextStyle(category, mods).rank;
}

/**
 * Categories that draw a WORD instead of a magnitude, because they have no
 * magnitude: nothing was absorbed-for-N, nothing was dodged-for-N.
 *
 * 「閃避」 and 「MISS」 are deliberately different words for the two halves of
 * ONE `evade` event (see THE 迴避 ASYMMETRY above) — that is the channel that
 * survives motion, a crowded teamfight and colour-vision deficiency, none of
 * which a hue split survives on its own.
 */
const WORD: Partial<Record<CombatTextCategory, string>> = {
  guard: "GUARD",
  dodge: "閃避",
  allyDodge: "閃避",
  whiff: "MISS",
};

/** Every wordless (magnitude-free) category, exported for the guard test. */
export const COMBAT_TEXT_WORDS: Readonly<Partial<Record<CombatTextCategory, string>>> = WORD;

/** The string that actually gets drawn. */
export function combatTextLabel(category: CombatTextCategory, amount: number): string {
  const word = WORD[category];
  if (word !== undefined) return word;
  const n = Math.max(0, Math.round(amount));
  return `${BASE[category].prefix}${n}`;
}

/**
 * Rendered width of a label in px, for the HUD-chrome overlap test only.
 *
 * The renderer used to assume `fontSize * 0.62 * length` — a Latin digit
 * advance. 「閃避」 is two FULL-WIDTH glyphs at ~1.0 em each, so that estimate
 * undercounts the box by ~40 % and a 閃避 drifting under the minimap would not
 * be damped when it should be. CJK ideographs, kana and full-width forms count
 * as 1.0 em; everything else keeps the measured digit advance.
 */
export function combatTextWidthPx(label: string, fontSize: number): number {
  let em = 0;
  for (const ch of label) {
    const c = ch.codePointAt(0)!;
    const wide =
      (c >= 0x1100 && c <= 0x115f) || // hangul jamo
      (c >= 0x2e80 && c <= 0xa4cf) || // CJK radicals … yi
      (c >= 0xac00 && c <= 0xd7a3) || // hangul syllables
      (c >= 0xf900 && c <= 0xfaff) || // CJK compatibility ideographs
      (c >= 0xfe30 && c <= 0xfe6f) || // CJK compatibility forms
      (c >= 0xff00 && c <= 0xff60) || // full-width forms
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x20000 && c <= 0x3fffd); // CJK ext B+
    em += wide ? 1.0 : 0.62;
  }
  return fontSize * em;
}

// ---------------------------------------------------------------------------
// Motion — roBrowser's curve, verbatim in shape
// ---------------------------------------------------------------------------

/**
 * `sin(RO_ARC_TURNS · π · t)`: peak at t = 1/3, back at spawn height at 2/3,
 * one full peak-height BELOW spawn at t = 1. The fall is the tell — a number
 * that rises and parks above the head is a different game's floating text.
 */
export const RO_ARC_TURNS = 1.5;
/** roBrowser's constant `+2` offset above the body, in px at our scale. */
export const BASE_LIFT_PX = 6;
/** 淡入 (the request) without buying back ink: 6 % of the shortest life. */
export const FADE_IN_MS = 70;
/** birth overshoot settle window */
export const POP_MS = 130;

/** Upward offset in px at normalized age `t` (negative = below spawn). */
export function combatTextLift(t: number, arcPx: number): number {
  const c = Math.min(1, Math.max(0, t));
  return BASE_LIFT_PX + arcPx * Math.sin(RO_ARC_TURNS * Math.PI * c);
}

/**
 * RO is `1.0 - perc`, flat linear from birth. The only addition is the short
 * fade-in the request asks for, which makes the envelope a triangle peaking at
 * `FADE_IN_MS`. Integral = 0.5 × life either way.
 */
export function combatTextAlpha(t: number, lifeMs: number): number {
  if (t < 0 || t > 1) return 0;
  const fi = lifeMs > 0 ? Math.min(0.5, FADE_IN_MS / lifeMs) : 0;
  if (fi > 0 && t < fi) return t / fi;
  return (1 - t) / (1 - fi);
}

/** Birth pop, settling to 1 over POP_MS. */
export function combatTextScale(ageMs: number, popScale: number): number {
  if (ageMs < 0) return popScale;
  const k = Math.min(1, ageMs / POP_MS);
  return 1 + (popScale - 1) * (1 - k);
}

/**
 * Lateral travel. Eased so numbers leave a common origin and fan apart rather
 * than translating rigidly — that separation is what keeps a stack of same-body
 * numbers readable, and it is why heal and mana carry opposite biases.
 */
export function combatTextDrift(t: number, driftPx: number): number {
  const c = Math.min(1, Math.max(0, t));
  return driftPx * (1 - (1 - c) * (1 - c));
}

/**
 * Extra lateral offset by lane. Fans alternately left/right of the bias so the
 * n-th live number on one body does not sit on the (n-1)-th. 3-digit glyphs are
 * ~55 px wide at closest zoom, so the steps have to clear that, not 26 px.
 */
const LANES = [0, 34, -34, 62, -62, 90, -90] as const;
export function combatTextLane(lane: number): number {
  const i = ((lane % LANES.length) + LANES.length) % LANES.length;
  return LANES[i]!;
}

// ---------------------------------------------------------------------------
// Density policy
// ---------------------------------------------------------------------------

/**
 * Hard pool size. The live cap is the `damageNumberCap` graphics setting
 * (4..64); this is the ceiling the DOM node pool is pre-allocated to, so the
 * frame loop never calls createElement (task #33's pooling discipline — a text
 * node per hit in a teamfight is how this costs frames).
 */
export const MAX_COMBAT_TEXT = 64;

/**
 * Same target + same category inside ONE sim tick adds into the live node
 * instead of spawning a second one. Deliberately a FRAME coalesce, not a merge
 * window: the node is still inside its own fade-in, so there is no visible
 * re-pop and no life extension (see the module doc on why a 260 ms merge window
 * was rejected).
 */
export const COALESCE_MS = 34;

/** RO's multi-hit answer (`ActivationTime = time + 0.2f * i`), scaled to our life. */
export const SPAWN_STAGGER_MS = 120;
/** Never delay a number more than this — a late number is a lie about timing. */
export const MAX_STAGGER_STEPS = 2;

/** No body may carry a pile. */
export const MAX_LIVE_PER_TARGET = 3;

export interface AdmissionEntry {
  active: boolean;
  rank: number;
  bornMs: number;
  lifeMs: number;
  targetId: number;
}

/**
 * Index of the entry that should give way, or -1 if nothing should.
 *
 * Replaces the old `list.splice(0, over)`, which was priority-blind: it evicted
 * the OLDEST regardless of importance, so your own 受到傷害 number could be
 * pushed off by a stranger's chip damage. Here the worst entry is the
 * least-important one, and among equals the most-faded one — evicting a node
 * that is already at 10 % alpha is nearly invisible.
 *
 * Returns -1 when every live entry outranks the newcomer: at that point the
 * right answer is to DROP the newcomer, not to displace something better.
 */
export function worstEntryIndex(
  entries: readonly AdmissionEntry[],
  incomingRank: number,
  nowMs: number,
): number {
  let worst = -1;
  let worstRank = -Infinity;
  let worstProgress = -Infinity;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (!e.active) continue;
    const progress = e.lifeMs > 0 ? (nowMs - e.bornMs) / e.lifeMs : 1;
    if (e.rank > worstRank || (e.rank === worstRank && progress > worstProgress)) {
      worst = i;
      worstRank = e.rank;
      worstProgress = progress;
    }
  }
  if (worst < 0) return -1;
  // strictly worse than the newcomer, or equally ranked and already older
  return worstRank > incomingRank || (worstRank === incomingRank && worstProgress > 0) ? worst : -1;
}

/**
 * Index of the entry a new spawn on `targetId` should displace when that body
 * already holds `MAX_LIVE_PER_TARGET`, or -1 if the body has room. Picks the
 * most-faded of that body's numbers, so the one that disappears is the one the
 * eye had already let go.
 */
export function overflowOnTargetIndex(
  entries: readonly AdmissionEntry[],
  targetId: number,
  nowMs: number,
): number {
  let count = 0;
  let oldest = -1;
  let oldestProgress = -Infinity;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (!e.active || e.targetId !== targetId) continue;
    count++;
    const progress = e.lifeMs > 0 ? (nowMs - e.bornMs) / e.lifeMs : 1;
    if (progress > oldestProgress) {
      oldest = i;
      oldestProgress = progress;
    }
  }
  return count >= MAX_LIVE_PER_TARGET ? oldest : -1;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

/**
 * 8-direction ring. A 4-way cross leaves the diagonals of a glyph naked, which
 * is exactly where a red digit dissolves into a red hit-flash.
 */
const OUTLINE_DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.71, 0.71],
  [-0.71, 0.71],
  [0.71, -0.71],
  [-0.71, -0.71],
];

/**
 * Chunky, legible, and present everywhere the client runs. Explicitly NOT the
 * UI font stack — combat text is read at a glance under motion, not scanned.
 */
export const COMBAT_TEXT_FONT =
  '"Trebuchet MS", "Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif';

const round1 = (n: number): string => (Math.round(n * 10) / 10).toString();

/** The black ring + soft halo, as a `text-shadow` value. */
export function combatTextShadow(outlinePx: number, haloPx: number): string {
  const parts = OUTLINE_DIRS.map(
    ([dx, dy]) => `${round1(dx * outlinePx)}px ${round1(dy * outlinePx)}px 0 #000`,
  );
  if (haloPx > 0) {
    parts.push(`0 0 ${round1(haloPx)}px rgba(0,0,0,0.95)`);
    parts.push(`0 0 ${round1(haloPx * 1.8)}px rgba(0,0,0,0.7)`);
  }
  return parts.join(",");
}

/**
 * Full inline style for one node. `gradient` is the RUNTIME-PROBED
 * `background-clip: text` capability (WorldAnchorLayer.probeTextGradientPaints) —
 * true only when the renderer was proven to actually PAINT a text-clipped
 * gradient, never just "recognises the property". That distinction is the whole
 * bug: an in-app browser / iOS WKWebView that reports support via `CSS.supports`
 * but does not paint the clip leaves a glyph whose fill is transparent and whose
 * only ink is the black ring — a number that reads as BLACK.
 *
 * The invariant this builder guarantees, so that failure can never recur:
 *
 *   · the SOLID category hue (`style.color`) is emitted as the base fill in
 *     BOTH paths. In the fallback it is the entire fill; in the gradient path it
 *     is what the glyph falls back to if the engine drops `-webkit-text-fill-color`
 *     — so even a mistaken `gradient:true` on a non-WebKit engine cannot blank it.
 *   · `color:transparent` is NEVER emitted. Only `-webkit-text-fill-color:transparent`
 *     makes the clipped gradient show, and it is emitted ONLY alongside the
 *     `linear-gradient(...)` + `background-clip:text` that it reveals. A
 *     transparent fill with no gradient behind it — the invisible number — is
 *     therefore impossible to produce.
 *
 * The gradient is the RO digit-sprite highlight (light top → saturated bottom);
 * the fallback is the same hue, just without the highlight, and the black ring
 * carries legibility in both (see the module doc).
 */
export function combatTextCss(style: CombatTextStyle, gradient: boolean): string {
  // THE GRADIENT FILL IS OFF, AND STAYS OFF. Reported twice by the owner as
  // 「傷害數字…看起來是黑色」, with a screenshot of a black 74 on brown dirt.
  //
  // The mechanism was `background-clip:text` + `-webkit-text-fill-color:
  // transparent`, gated by probeTextGradientPaints(). The gate cannot work:
  // it reads COMPUTED STYLE, which only proves the engine ACCEPTED the three
  // properties, never that the compositor PAINTED them. These nodes carry
  // `will-change:transform,opacity` and therefore live on their own compositing
  // layer, where a browser may accept background-clip:text and then not honour
  // it. When that happens the fill is transparent and the text-shadow — which
  // is NOT clipped — is the only thing left on screen. That is precisely a
  // black number, and it is why the failure reads as "black" rather than
  // "invisible".
  //
  // The gradient bought a subtle top-highlight. The downside it bought with it
  // is the single most important number in the game becoming unreadable on a
  // machine we cannot detect. Solid hue plus the dark ring and halo below is
  // what RO and LoL actually ship, it cannot fail this way, and the file's own
  // fallback comment already called it "fully legible".
  //
  // `gradient` stays in the signature so the probe, its tests and the call site
  // keep their shape while this is settled; it is deliberately ignored.
  void gradient;
  const fill = `color:${style.color};`;
  return (
    "position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;" +
    "will-change:transform,opacity;transform-origin:50% 50%;" +
    `font-family:${COMBAT_TEXT_FONT};font-variant-numeric:tabular-nums;` +
    `font-size:${style.fontSize}px;font-weight:${style.fontWeight};` +
    `font-style:${style.italic ? "italic" : "normal"};letter-spacing:0.02em;` +
    fill +
    `text-shadow:${combatTextShadow(style.outlinePx, style.haloPx)};`
  );
}

/** Cache key for a computed style — pooled nodes only restyle when this changes. */
export function combatTextStyleKey(category: CombatTextCategory, mods: CombatTextMods): string {
  return `${category}|${mods.crit ? "c" : ""}${mods.killingBlow ? "k" : ""}`;
}

// ---------------------------------------------------------------------------
// HUD chrome awareness (task #42's registry — consumed, never claimed)
// ---------------------------------------------------------------------------

/**
 * Floating combat text declares NO corner slot: it is world-anchored, it moves,
 * and reserving a corner for it would be a lie. What it does instead is CONSUME
 * the registry — a number that drifts under the minimap or the scoreboard turns
 * into visual mud, and 清晰 has to hold there too. Nodes over reserved chrome
 * are damped rather than hidden, so the number reads as "behind the panel"
 * instead of blinking out.
 *
 * Transient slots (the settings-gated perf panel) are skipped: an opt-in dev
 * overlay must not change how the game looks.
 */
export const CHROME_ALPHA_MULT = 0.18;

export type { HudRect };

/** Reserved rects of the PERSISTENT HUD chrome for a viewport. */
export function hudReservedRects(viewport: HudViewport, touch = false): HudRect[] {
  const out: HudRect[] = [];
  for (const s of HUD_SLOTS) {
    if (s.transient) continue;
    out.push(hudSlotRect(s.id as HudSlotId, viewport, touch));
  }
  return out;
}

/** Alpha multiplier for a glyph box that may be sitting over HUD chrome. */
export function chromeAlphaMult(box: HudRect, rects: readonly HudRect[]): number {
  for (const r of rects) if (hudRectsOverlap(box, r)) return CHROME_ALPHA_MULT;
  return 1;
}

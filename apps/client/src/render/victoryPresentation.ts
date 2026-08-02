/**
 * victoryPresentation — task #93, the ONE table that says what each victory beat
 * looks and sounds like. Pure: no Babylon, no React, no store, no clock.
 *
 * The requirement is two DELIBERATELY different presentations:
 *
 *   ROUND WIN  → 灰色底 (a desaturating grey wash behind the centred winner
 *                model), the SMALL firework volley, and a champion-flavoured
 *                taunt line.
 *   MATCH WIN  → 暗色底 (the dark settlement wash), the GIANT roast-chicken
 *                shaped firework, and a savage 吃雞 VO.
 *
 * Everything downstream reads this table instead of hard-coding a colour or a
 * duration, so the two beats can never quietly converge and a test can pin the
 * PARAMETERS of a visual that cannot itself be unit-tested:
 *
 *   render/RoundWinnerStage  — mounts the grey wash + subtitle, fires the taunt
 *   ui/panels/MatchEndPanel  — paints the dark wash, holds the settlement card
 *                              off the giant chicken, fires the savage VO
 *   vfx/VictoryFireworks     — already routes round→small / match→chicken
 *
 * The firework timings are IMPORTED from vfx/fireworkMath, never re-typed: the
 * settlement hold below is literally the shell's launch+expand+hold, so if the
 * bird's timeline is ever retuned the scoreboard follows it automatically.
 */
import { CHICKEN_TIMELINE, SMALL_VOLLEY_MS } from "../vfx/fireworkMath";
import { FOCUS_FADE_OUT_MS } from "./deathFocus";

/** Which victory beat this is. */
export type VictoryTier = "round" | "match";
/** The backdrop treatment: grey for a round, dark for the match. */
export type VictoryTint = "grey" | "dark";
/** Which shipped firework module plays (see vfx/VictoryFireworks). */
export type VictoryFireworkTier = "small" | "chicken";
/** Which taunt pool speaks (see audio/victoryTaunt). */
export type VictoryVoiceCue = "roundTaunt" | "matchTaunt";

/**
 * How long the round winner owns the screen. THE one definition — GameApp
 * (task #143, which owns the trigger) imports it rather than keeping its own
 * copy, so the presentation window can never be shortened below
 * ROUND_TAUNT_DELAY_MS and silently cancel the taunt before it speaks.
 */
export const ROUND_PRESENT_MS = 3600;

/**
 * The grey wash. Two independent mechanisms on one layer: a `backdrop-filter`
 * that actually desaturates the live arena where the browser supports it, and a
 * flat grey gradient that reads as "the colour drained out" where it does not.
 * Deliberately NOT the death-spectator greyscale (#85): that one is a per-player
 * Babylon post-process driven by entity state, and coupling two unrelated gates
 * to one effect is how both end up stuck on.
 */
export const ROUND_WASH_FILTER = "grayscale(0.88) saturate(0.18) brightness(0.88)";
export const ROUND_WASH_BACKGROUND =
  "radial-gradient(ellipse at 50% 46%, rgba(128,132,140,0.26) 0%, rgba(64,68,76,0.60) 66%, rgba(36,38,44,0.76) 100%)";

/**
 * PRECEDENCE OVER THE DEATH-SPECTATOR GREY (#85) — the one place the two
 * desaturations can meet.
 *
 * A player who died in combat is watching through the #85 post-process at full
 * strength. The round ends, the phase leaves `combat`, and #85's gate disarms
 * and ramps out linearly over FOCUS_FADE_OUT_MS — on the SAME frame this wash
 * is mounted. Painting the wash at full opacity there stacks grayscale(0.88)
 * plus a 0.76-alpha grey gradient on top of an already-drained frame: the arena
 * turns into an unreadable flat slab for a fifth of a second, exactly when the
 * winner's model is being introduced.
 *
 * The rule: THE VICTORY BEAT OWNS THE SCREEN, and it takes it over as a
 * CROSSFADE, not a stack. The wash mounts at opacity 0 and ramps in over
 * precisely the interval #85 ramps out, so total desaturation stays ~one layer
 * at every instant. Welded by importing #85's own constant — retuning the death
 * fade retunes the handover, and the two can never drift into an overlap.
 *
 * (There is no equivalent seam at match end: #85 disarms on `outcomeDecided`,
 * which precedes the settlement payload MatchEndPanel mounts on by seconds.)
 */
export const ROUND_WASH_FADE_MS = FOCUS_FADE_OUT_MS;

/**
 * The dark wash — the exact gradient the settlement already shipped with (task
 * #25), lifted here so the panel and this table cannot drift apart.
 */
export const MATCH_WASH_FILTER = "brightness(0.55) saturate(0.85)";
export const MATCH_WASH_BACKGROUND =
  "radial-gradient(ellipse at 50% 40%, rgba(10,14,24,0.55) 0%, rgba(6,8,14,0.86) 70%)";

/**
 * The wash while the settlement card is WITHHELD (`matchCardHeld`). The card is
 * held for MATCH_PANEL_HOLD_MS for exactly one reason — so the giant roast
 * chicken can be SEEN — and the full 暗色底 above defeats that on its own: a
 * 0.86-alpha near-black scrim with a further brightness(0.55) is the joke
 * viewed through smoked glass.
 *
 * So the hold gets a much lighter version: enough to seat the scoreboard's
 * colour world and separate it from the round beat's grey, but transparent
 * enough that the bird reads. No brightness() term at all — dimming is what
 * kills a firework — only a slight desaturation. It transitions to the full
 * 暗色底 on the same 420 ms curve the card fades in on.
 */
export const MATCH_WASH_FILTER_HELD = "saturate(0.92)";
export const MATCH_WASH_BACKGROUND_HELD =
  "radial-gradient(ellipse at 50% 40%, rgba(10,14,24,0.16) 0%, rgba(6,8,14,0.32) 70%)";
/** ms the held wash takes to become the full 暗色底 (matches the card fade). */
export const MATCH_WASH_SETTLE_MS = 420;

/**
 * Stacking for the round wash: above the world-anchored HP bars (#anchor-layer,
 * z 5 — they grey out with the arena) and BELOW the winner-model overlay canvas
 * (z 6), so the champion who won stays in full colour on a grey world. The HUD
 * (#hud-root, z 10) is untouched.
 */
export const ROUND_WASH_Z = 5;
/** Subtitle sits above the model card, still under the HUD. */
export const ROUND_SUBTITLE_Z = 7;

/**
 * How long the settlement CARD is withheld at match end so the giant chicken is
 * actually visible. Derived from the shell's own timeline: launch → break →
 * expand → the HOLD, which is the beat the silhouette is meant to be read (and
 * screenshotted) on. The card fades in over the droop.
 *
 * The panel implements this as a plain fail-open timer — never gated on a
 * firework callback, so a skipped or broken celebration still shows the score.
 *
 * ⚠️ This is the hold **when the bird actually flies**. Since the chicken became
 * a back-office toggle (`config/victory-fx@1`, shipped OFF), the panel must ask
 * {@link matchPanelHoldMs} rather than read this constant directly — see there.
 */
export const MATCH_PANEL_HOLD_MS =
  CHICKEN_TIMELINE.launchMs + CHICKEN_TIMELINE.expandMs + CHICKEN_TIMELINE.holdMs;

/**
 * 結算計分卡要被壓住幾毫秒 —— 給定「這一場的烤雞煙火到底會不會放」。
 *
 * 這一段延遲**存在的唯一理由**就是讓那隻鳥被看到（上面那段自己就是這樣寫的）。
 * owner 2026-08-02 把煙火變成後台開關並且出貨關閉之後，如果還照 2340 ms 壓住
 * 計分卡，玩家在贏下整場之後會盯著一個沒有煙火、也沒有分數的畫面兩秒多 ——
 * 那是一個由「關掉煙火」憑空製造出來的新缺陷，不是原本的行為。
 *
 * 所以：煙火關掉 → 完全不壓（0 ms，分數立刻出現）。
 */
export function matchPanelHoldMs(chickenEnabled: boolean): number {
  return chickenEnabled ? MATCH_PANEL_HOLD_MS : 0;
}

/**
 * 本地玩家的 名言 要在計分卡出現多久之後才唸。跟著 {@link matchPanelHoldMs} 走，
 * 所以煙火關掉時它會從 3240 ms 縮成 900 ms —— 「卡片露出來之後再唸」這個順序
 * （{@link MATCH_QUOTE_DELAY_MS} 的檔頭寫的）在兩種設定下都還是成立的。
 */
export function matchQuoteDelayMs(chickenEnabled: boolean): number {
  return matchPanelHoldMs(chickenEnabled) + 900;
}

/**
 * Round taunt lands AFTER the round-end 名言 (ui/RoundEndVoice fires that on the
 * same phase edge). Two VO clips on one beat is the most likely defect in this
 * feature, so the offset is a constant here rather than a guess at each call
 * site. Still inside ROUND_PRESENT_MS, so the line is heard while the winner is
 * on screen.
 */
export const ROUND_TAUNT_DELAY_MS = 2200;

/**
 * Match beat ordering — the savage 吃雞 line is the JOKE and rides the bird, so
 * it goes FIRST (right on the shell break) and the local player's 名言 follows
 * once the card is revealed. Both call sites live in MatchEndPanel, which is why
 * this ordering can be stated as data instead of negotiated at runtime.
 */
export const MATCH_TAUNT_DELAY_MS = CHICKEN_TIMELINE.launchMs + 120;
/** The 名言 delay with the chicken ON — the general case is {@link matchQuoteDelayMs}. */
export const MATCH_QUOTE_DELAY_MS = matchQuoteDelayMs(true);

/** Everything one victory beat needs, resolved from its tier. */
export interface VictoryPresentationSpec {
  tier: VictoryTier;
  tint: VictoryTint;
  /** css `background` of the wash layer */
  background: string;
  /** css `backdrop-filter` of the wash layer */
  backdropFilter: string;
  /**
   * The wash while this beat's firework is still being HELD for (match tier
   * only; identical to `background`/`backdropFilter` on the round tier, which
   * holds nothing). Deliberately much lighter — see MATCH_WASH_BACKGROUND_HELD.
   */
  backgroundHeld: string;
  backdropFilterHeld: string;
  /** how long this beat owns the screen (ms) */
  holdMs: number;
  /** how long its firework runs (ms) — informational, the fx own their clocks */
  fireworkMs: number;
  /** which shipped firework module plays */
  firework: VictoryFireworkTier;
  /** which taunt pool speaks */
  voice: VictoryVoiceCue;
  /** ms after the beat starts that the taunt VO fires */
  voiceDelayMs: number;
}

const ROUND_SPEC: VictoryPresentationSpec = {
  tier: "round",
  tint: "grey",
  background: ROUND_WASH_BACKGROUND,
  backdropFilter: ROUND_WASH_FILTER,
  // the round beat withholds nothing, so "held" is just the wash itself
  backgroundHeld: ROUND_WASH_BACKGROUND,
  backdropFilterHeld: ROUND_WASH_FILTER,
  holdMs: ROUND_PRESENT_MS,
  fireworkMs: SMALL_VOLLEY_MS,
  firework: "small",
  voice: "roundTaunt",
  voiceDelayMs: ROUND_TAUNT_DELAY_MS,
};

const MATCH_SPEC: VictoryPresentationSpec = {
  tier: "match",
  tint: "dark",
  background: MATCH_WASH_BACKGROUND,
  backdropFilter: MATCH_WASH_FILTER,
  backgroundHeld: MATCH_WASH_BACKGROUND_HELD,
  backdropFilterHeld: MATCH_WASH_FILTER_HELD,
  holdMs: MATCH_PANEL_HOLD_MS,
  fireworkMs:
    CHICKEN_TIMELINE.launchMs +
    CHICKEN_TIMELINE.expandMs +
    CHICKEN_TIMELINE.holdMs +
    CHICKEN_TIMELINE.droopMs,
  firework: "chicken",
  voice: "matchTaunt",
  voiceDelayMs: MATCH_TAUNT_DELAY_MS,
};

/**
 * The presentation for a tier. Frozen singletons — callers read them every frame
 * and must never be able to mutate the table for the next win.
 */
export function victoryPresentation(tier: VictoryTier): VictoryPresentationSpec {
  return tier === "match" ? MATCH_SPEC : ROUND_SPEC;
}

Object.freeze(ROUND_SPEC);
Object.freeze(MATCH_SPEC);

/**
 * Is the settlement CARD still withheld for the chicken? Only ever true for the
 * WINNER (a loser has no celebration to watch and gets the scoreboard at once),
 * and only for the first `MATCH_PANEL_HOLD_MS`. Pure so the panel's one piece of
 * real logic is testable in the node env.
 */
export function matchCardHeld(wonMatch: boolean, elapsedMs: number): boolean {
  if (!wonMatch) return false;
  if (!Number.isFinite(elapsedMs)) return false; // fail OPEN: always show the score
  return elapsedMs < MATCH_PANEL_HOLD_MS;
}

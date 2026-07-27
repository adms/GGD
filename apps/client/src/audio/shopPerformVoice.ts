/**
 * shopPerformVoice — the LINE that goes with the shop's idle performance.
 *
 * owner, 2026-07-27: 「在商店 shop 時，玩家角色會隨機輪播動作跟語音」. The action half
 * lives in `render/intermission/idlePerform.ts`; this is the audio half — given
 * the KIND of performance the hero just started, say something that fits it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT REUSES THE COMBAT VOICE LAYER, IT DOES NOT BUILD A SECOND ONE
 * ═══════════════════════════════════════════════════════════════════════════
 * Every line goes through `contextualVoice.playContextual`, so the shop
 * inherits, unchanged, everything that layer already guarantees:
 *   • the #14 autoplay-unlock gate and the SFX slider/mute;
 *   • the task-#62 test-mode silence gate — a headless/background run makes NO
 *     sound, which is why this module is unit-testable at all;
 *   • the no-immediate-repeat clip pick (#184's anti-pollution rule) and the
 *     in-flight de-dup 「同一個語音不會同時播放」;
 *   • the same generated CosyVoice3 pack the click and the combat lines read
 *     (`content/assets/audio/voices/champions/MANIFEST.json`), already warmed
 *     by GameApp before the shop ever opens.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHICH CATEGORIES — and why these seven were free to take
 * ═══════════════════════════════════════════════════════════════════════════
 * The pack ships 46 categories per champion for 51 champions. Grepping the call
 * sites, COMBAT already spends: skill-name.*, hurt / hurt-heavy, crit, defeat,
 * victory, kill-1..5, first-blood, unstoppable, stun / slow / bind, curse,
 * block, dodge, healed, sprint, attack-light, hum, quote. The categories paired
 * below are the ones nothing else plays — `taunt`, `thumbs-up`, `thanks`,
 * `watch`, `free-move`, `charge` — i.e. this feature is spending DEAD content
 * (the owner's 「充分利用生成的語音們」 directive), not stealing a combat cue.
 *
 * Two are shared on purpose and both are safe:
 *   • `quote` (名言) also plays at the settlement — a different screen, and its
 *     2.5 s per-category cooldown is far shorter than the shop's 7.5–11.5 s gap;
 *   • `hum` is the LAST resort for the degraded nod. It is combat's between-
 *     fights idle line, and its policy (prob 0.15 / 20 s) is why it is second in
 *     that pair rather than first.
 *
 * NOT `attack-light`, even for an attack pose: its policy is prob 0.08 with a
 * 12 s cooldown because a real auto-attack fires ~1.4×/s, and borrowing it here
 * would both be near-silent AND burn the cooldown of a combat cue.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO CANDIDATES PER KIND, TRIED IN ORDER
 * ═══════════════════════════════════════════════════════════════════════════
 * `playContextual` rolls a per-category probability (0.5–0.6 for these), so a
 * single attempt would leave ~45 % of performances mute. Each kind therefore
 * names TWO categories and the second is tried only when the first declines —
 * ~75 % of performances speak, and the ones that don't are the built-in
 * breathing room that keeps the hero from chattering over the BGM, the market
 * murmur and the merchant. The order also ROTATES: whichever category spoke
 * last is demoted to second next time, so the same flavour never leads twice
 * running even when the same kind is drawn twice.
 */
import { playContextualVoice, type ContextualPlayOptions } from "./contextualVoice";

/**
 * kind → the categories to try, best fit first.
 *
 * Keyed by `render/intermission/idlePerform.PerformKind`. Typed as a plain
 * string record ON PURPOSE: the audio layer must not import from render/, and
 * `shopPerformVoice.test.ts` cross-checks the two key sets so a new kind can
 * never ship without a line (failure shape ②, "computed but never delivered").
 */
export const PERFORM_VOICE_CATEGORIES: Readonly<Record<string, readonly string[]>> = {
  // a cheer / victory pose → gloat, or give the merchant a thumbs-up
  celebrate: ["taunt", "thumbs-up"],
  // a talking pose → the champion's 名言, else a word of thanks
  talk: ["quote", "thanks"],
  // an alternate standing pose → looking around the market, at ease
  pose: ["watch", "free-move"],
  // a spell/channel pose → winding something up
  spell: ["charge", "taunt"],
  // a swing → bravado (NEVER attack-light; see the header)
  attack: ["taunt", "charge"],
  // the degraded procedural nod → a quiet acknowledgement, then a hum
  nod: ["thanks", "hum"],
};

/** The seam the shop voice needs; `playContextualVoice` satisfies it. */
export type ContextualPort = (
  champId: string | null | undefined,
  category: string,
  opts?: ContextualPlayOptions,
) => boolean;

export interface ShopPerformVoiceOptions {
  /** injected in tests; defaults to the shared contextual voice layer */
  play?: ContextualPort;
}

/**
 * Speak for one performance. Returns the category that actually reached the
 * mixer, or null when every candidate declined (muted, locked, throttled,
 * rolled off, or the champion has no clip for it) — a silent no-op, never a
 * throw, in line with the rest of the voice layer.
 */
export class ShopPerformVoice {
  private readonly play: ContextualPort;
  /** the category that last SPOKE, so the pair order rotates (see header) */
  private lastSpoken: string | null = null;

  constructor(opts: ShopPerformVoiceOptions = {}) {
    this.play = opts.play ?? playContextualVoice;
  }

  /** Candidate order for a kind, with the last-spoken category demoted. */
  candidates(kind: string): readonly string[] {
    const pair = PERFORM_VOICE_CATEGORIES[kind];
    if (!pair || pair.length === 0) return [];
    if (pair.length < 2 || pair[0] !== this.lastSpoken) return pair;
    // rotate: the flavour that just spoke goes last, so two draws of the same
    // kind do not lead with the same line twice running (#184 anti-pollution).
    return [...pair.slice(1), pair[0] as string];
  }

  /** Fire the line for a performance; null when nothing spoke. */
  speak(champId: string | null | undefined, kind: string): string | null {
    if (!champId) return null;
    for (const category of this.candidates(kind)) {
      if (this.play(champId, category)) {
        this.lastSpoken = category;
        return category;
      }
    }
    return null;
  }

  /** Drop the rotation memory (tests / a new shop visit). */
  reset(): void {
    this.lastSpoken = null;
  }
}

/** Process-wide shop performer riding the process-wide contextual voice layer. */
export const shopPerformVoice = new ShopPerformVoice();

/** Speak for one shop performance (see {@link ShopPerformVoice.speak}). */
export function playShopPerformVoice(
  champId: string | null | undefined,
  kind: string,
): string | null {
  return shopPerformVoice.speak(champId, kind);
}

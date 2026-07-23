/**
 * RoundWinnerStage — the ROUND-WIN half of the victory presentation (#143 model
 * + #93 灰色底/嘲諷台詞). At each ROUND-end it:
 *
 *   1. drops a GREY WASH over the arena (灰色底) — the colour drains out of the
 *      world while the winner keeps it,
 *   2. stands the round WINNER's champion model in the CENTRE of the screen
 *      (front-view) for a few seconds, above that wash,
 *   3. speaks that champion's own flavoured TAUNT and prints it as a subtitle.
 *
 * The wash is a DOM layer, not a Babylon post-process: the death-spectator
 * greyscale (#85) is a per-player, entity-driven effect on the scene, and wiring
 * a second, unrelated gate into it is how both end up stuck on. Every colour,
 * duration and z-index comes from render/victoryPresentation, which is also what
 * the match-win beat reads — so 灰色底 and 暗色底 can never converge.
 *
 * It reuses the champ-select / store model viewer (render/StorePreview, the
 * #129 loader + auto-framing) on its OWN overlay canvas + engine, so there is
 * NO new glb loader here: it renders whatever ModelDoc it is handed, orbiting a
 * grounded, framed figure on a dark card — lighter than the full match-win
 * settlement front-view (#93/#25), which stays the match-end owner.
 *
 * GameApp owns the TRIGGER (the phase edge into `resolution`, resolving the
 * winner from the SAME authoritative seats/teams the #142 VO reads); this class
 * owns only the overlay lifecycle, the model swap and the taunt, and reads no
 * state — pure presentation, deterministic-agnostic. It is LAZY: no canvas, no
 * WebGL context and no audio element exist until the first `show()`, and
 * `clear()` tears the whole thing back down so an idle round costs nothing.
 *
 * Headless-testable: the canvas, element and previewer factories plus the taunt
 * port are injectable, so the lifecycle (mount → show → swap → clear → dispose),
 * the wash and the taunt selection unit-test in the node env without a DOM, a
 * WebGL context or a single sound.
 */
import type { ModelDoc } from "@ggd/shared/content";
import { StorePreview } from "./StorePreview";
import {
  victoryPresentation,
  ROUND_SUBTITLE_Z,
  ROUND_WASH_FADE_MS,
  ROUND_WASH_Z,
} from "./victoryPresentation";
import { victoryTaunts, type PlayTauntOptions, type VictoryTauntLine } from "../audio/victoryTaunt";

/** The slice of StorePreview this stage drives (injectable for headless tests). */
export interface WinnerPreview {
  show(doc: ModelDoc): Promise<void> | void;
  dispose(): void;
}

/** The slice of the taunt layer this stage drives (injectable for headless tests). */
export interface RoundTauntPort {
  playRound(
    championId: string,
    round: number,
    opts?: PlayTauntOptions,
  ): Promise<VictoryTauntLine | null>;
  cancel(): void;
}

/**
 * Who won this round, from the caller's already-resolved authoritative read.
 * Both fields feed the DETERMINISTIC taunt pick (audio/victoryTaunt), so every
 * client hears the same line about the same loser. Omitted ⇒ no taunt, no
 * subtitle: the grey wash and the model still play.
 */
export interface RoundWinnerContext {
  championId?: string;
  round?: number;
}

export interface RoundWinnerStageOptions {
  /** element the overlay layers are mounted into (production: document.body). */
  host: HTMLElement | null;
  /** overlay-canvas factory (default: document.createElement("canvas")). */
  createCanvas?: () => HTMLCanvasElement;
  /**
   * overlay-div factory (default: document.createElement, or null with no DOM —
   * a null layer is simply skipped, so the stage still works headless).
   */
  createElement?: (tag: string) => HTMLElement | null;
  /** previewer factory (default: new StorePreview(canvas)). */
  createPreview?: (canvas: HTMLCanvasElement) => WinnerPreview;
  /** taunt layer (default: the process-wide victoryTaunts; null disables VO). */
  taunt?: RoundTauntPort | null;
}

/**
 * Position the overlay canvas as a centred portrait card over the arena: fixed
 * to the viewport, above the world-anchored HP bars (#anchor-layer, z 5) and
 * below the HUD (#hud-root, z 10); never intercepts input.
 */
function styleOverlayCanvas(canvas: HTMLCanvasElement): void {
  const s = canvas.style;
  if (!s) return; // headless fake — nothing to style
  s.position = "fixed";
  s.left = "50%";
  s.top = "46%";
  s.transform = "translate(-50%, -50%)";
  s.width = "min(40vh, 84vw)";
  s.height = "min(54vh, 96vw)";
  s.zIndex = "6";
  s.pointerEvents = "none";
  s.borderRadius = "14px";
  s.outline = "none";
  s.boxShadow = "0 18px 60px rgba(0, 0, 0, 0.55)";
}

/**
 * 灰色底 — full-viewport desaturating scrim UNDER the winner's card. Two
 * independent mechanisms (backdrop-filter + a flat grey gradient) so the beat
 * reads even where backdrop-filter is unsupported. Never intercepts input.
 *
 * Mounts TRANSPARENT and is raised by `raiseWash` over ROUND_WASH_FADE_MS: a
 * dead spectator is still looking through the #85 death greyscale on this very
 * frame, and that effect ramps out over exactly the same interval. Crossfading
 * instead of stacking is the precedence rule (see victoryPresentation).
 */
function styleWash(el: HTMLElement | null): void {
  const s = el?.style;
  if (!s) return;
  const spec = victoryPresentation("round");
  s.position = "fixed";
  s.inset = "0";
  s.zIndex = String(ROUND_WASH_Z);
  s.pointerEvents = "none";
  s.background = spec.background;
  s.backdropFilter = spec.backdropFilter;
  (s as unknown as Record<string, string>)["webkitBackdropFilter"] = spec.backdropFilter;
  s.opacity = "0";
  s.transition = `opacity ${ROUND_WASH_FADE_MS}ms linear`;
}

/**
 * Kick the wash's opacity to 1 on a later frame so the transition above
 * actually runs (setting it in the same style pass would jump). rAF where the
 * browser has it, a macrotask otherwise, and a straight assignment in an
 * environment with neither — never a silent no-fade.
 */
function raiseWash(el: HTMLElement | null, stillCurrent: () => boolean): void {
  if (!el?.style) return;
  const bump = (): void => {
    if (stillCurrent() && el.style) el.style.opacity = "1";
  };
  const g = globalThis as unknown as {
    requestAnimationFrame?: (cb: () => void) => unknown;
    setTimeout?: (cb: () => void, ms: number) => unknown;
  };
  if (typeof g.requestAnimationFrame === "function") g.requestAnimationFrame(bump);
  else if (typeof g.setTimeout === "function") g.setTimeout(bump, 0);
  else bump();
}

/** The taunt subtitle, pinned under the winner's card and over the wash. */
function styleSubtitle(el: HTMLElement | null): void {
  const s = el?.style;
  if (!s) return;
  s.position = "fixed";
  s.left = "50%";
  s.bottom = "18%";
  s.transform = "translateX(-50%)";
  s.zIndex = String(ROUND_SUBTITLE_Z);
  s.pointerEvents = "none";
  s.maxWidth = "min(78vw, 720px)";
  s.textAlign = "center";
  s.fontSize = "clamp(15px, 2.2vh, 22px)";
  s.fontWeight = "700";
  s.lineHeight = "1.5";
  s.color = "#f4f6fb";
  s.textShadow = "0 2px 10px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)";
  s.letterSpacing = "0.5px";
}

export class RoundWinnerStage {
  private readonly host: HTMLElement | null;
  private readonly createCanvas: () => HTMLCanvasElement;
  private readonly createElement: (tag: string) => HTMLElement | null;
  private readonly createPreview: (canvas: HTMLCanvasElement) => WinnerPreview;
  private readonly taunt: RoundTauntPort | null;
  private canvas: HTMLCanvasElement | null = null;
  private wash: HTMLElement | null = null;
  private subtitle: HTMLElement | null = null;
  private preview: WinnerPreview | null = null;
  private disposed = false;
  /** monotonic show id — a late taunt never subtitles a later/cleared round */
  private showSeq = 0;

  constructor(opts: RoundWinnerStageOptions) {
    this.host = opts.host;
    this.createCanvas = opts.createCanvas ?? (() => document.createElement("canvas"));
    this.createElement =
      opts.createElement ??
      ((tag) => (typeof document !== "undefined" ? document.createElement(tag) : null));
    this.createPreview = opts.createPreview ?? ((c) => new StorePreview(c));
    this.taunt = opts.taunt === undefined ? victoryTaunts : opts.taunt;
  }

  /** True while a winner is currently on the stage. */
  get active(): boolean {
    return this.preview !== null;
  }

  /** The taunt currently subtitled (observability / tests). */
  get subtitleText(): string {
    return this.subtitle?.textContent ?? "";
  }

  /**
   * Present `doc` centre-screen on the grey wash, and — when `ctx` names the
   * winning champion — speak + subtitle that champion's taunt. Lazily spins up
   * the overlay layers on first use, then swaps the model on later shows. Never
   * throws (the model load and the taunt both self-degrade to nothing).
   */
  show(doc: ModelDoc, ctx: RoundWinnerContext = {}): void {
    if (this.disposed) return;
    const spec = victoryPresentation("round");
    if (!this.canvas) {
      // wash FIRST so it is under the card in both z-index and DOM order
      const wash = this.createElement("div");
      styleWash(wash);
      if (wash) this.host?.appendChild(wash);
      this.wash = wash;
      // hand the screen over from the #85 death greyscale as a CROSSFADE
      raiseWash(wash, () => this.wash === wash);

      const canvas = this.createCanvas();
      styleOverlayCanvas(canvas);
      this.host?.appendChild(canvas);
      this.canvas = canvas;
      this.preview = this.createPreview(canvas);

      const subtitle = this.createElement("div");
      styleSubtitle(subtitle);
      if (subtitle) this.host?.appendChild(subtitle);
      this.subtitle = subtitle;
    }
    void this.preview?.show(doc);

    const seq = ++this.showSeq;
    this.setSubtitle("");
    const champ = ctx.championId;
    if (!champ || !this.taunt) return;
    // The line is picked deterministically from replicated state, so every
    // client hears the SAME joke; it is delayed past the round-end 名言 so the
    // two voices never talk over each other (render/victoryPresentation).
    //
    // The subtitle is driven by `onSpeak`, NOT by the returned promise: the
    // promise resolves as soon as the line is CHOSEN (next microtask), so
    // subtitling from it would print the punchline ~2.2 s before the voice says
    // it — on top of the very 名言 the delay exists to clear.
    void this.taunt
      .playRound(champ, ctx.round ?? 0, {
        delayMs: spec.voiceDelayMs,
        onSpeak: (line) => {
          if (seq !== this.showSeq) return; // a newer round (or a clear) took over
          if (line.text) this.setSubtitle(line.text);
        },
      })
      .catch(() => {});
  }

  private setSubtitle(text: string): void {
    if (this.subtitle) this.subtitle.textContent = text;
  }

  /** Tear the stage down (dispose the previewer + remove every overlay layer). */
  clear(): void {
    this.showSeq += 1; // any in-flight taunt resolution is now stale
    this.taunt?.cancel();
    this.preview?.dispose();
    this.preview = null;
    for (const el of [this.canvas, this.wash, this.subtitle]) el?.remove();
    this.canvas = null;
    this.wash = null;
    this.subtitle = null;
  }

  /** Idempotent teardown; safe to call from GameApp.dispose more than once. */
  dispose(): void {
    this.disposed = true;
    this.clear();
  }
}

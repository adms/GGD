/**
 * RoundWinnerStage — task #143. At each ROUND-end, stand the round WINNER's
 * champion model in the CENTRE of the screen (front-view) for a few seconds,
 * then clear — the visual half of the round-end beat whose voice (#142) already
 * plays.
 *
 * It reuses the champ-select / store model viewer (render/StorePreview, the
 * #129 loader + auto-framing) on its OWN overlay canvas + engine, so there is
 * NO new glb loader here: it renders whatever ModelDoc it is handed, orbiting a
 * grounded, framed figure on a dark card — lighter than the full match-win
 * settlement front-view (#93/#25), which stays the match-end owner.
 *
 * GameApp owns the TRIGGER (the phase edge into `resolution`, resolving the
 * winner from the SAME authoritative seats/teams the #142 VO reads); this class
 * owns only the overlay-canvas lifecycle and the model swap, and reads no state
 * — pure presentation, deterministic-agnostic. It is LAZY: no canvas and no
 * WebGL context exist until the first `show()`, and `clear()` tears the whole
 * thing back down so an idle round costs nothing.
 *
 * Headless-testable: the canvas + previewer factories are injectable, so the
 * lifecycle (mount → show → swap → clear → dispose) unit-tests in the node env
 * without a DOM or a WebGL context.
 */
import type { ModelDoc } from "@ggd/shared/content";
import { StorePreview } from "./StorePreview";

/** The slice of StorePreview this stage drives (injectable for headless tests). */
export interface WinnerPreview {
  show(doc: ModelDoc): Promise<void> | void;
  dispose(): void;
}

export interface RoundWinnerStageOptions {
  /** element the overlay canvas is mounted into (production: document.body). */
  host: HTMLElement | null;
  /** overlay-canvas factory (default: document.createElement("canvas")). */
  createCanvas?: () => HTMLCanvasElement;
  /** previewer factory (default: new StorePreview(canvas)). */
  createPreview?: (canvas: HTMLCanvasElement) => WinnerPreview;
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

export class RoundWinnerStage {
  private readonly host: HTMLElement | null;
  private readonly createCanvas: () => HTMLCanvasElement;
  private readonly createPreview: (canvas: HTMLCanvasElement) => WinnerPreview;
  private canvas: HTMLCanvasElement | null = null;
  private preview: WinnerPreview | null = null;
  private disposed = false;

  constructor(opts: RoundWinnerStageOptions) {
    this.host = opts.host;
    this.createCanvas = opts.createCanvas ?? (() => document.createElement("canvas"));
    this.createPreview = opts.createPreview ?? ((c) => new StorePreview(c));
  }

  /** True while a winner is currently on the stage. */
  get active(): boolean {
    return this.preview !== null;
  }

  /**
   * Present `doc` centre-screen. Lazily spins up the overlay canvas + previewer
   * on first use, then swaps the model on later shows. Never throws (the model
   * load self-degrades to an empty stage).
   */
  show(doc: ModelDoc): void {
    if (this.disposed) return;
    if (!this.canvas) {
      const canvas = this.createCanvas();
      styleOverlayCanvas(canvas);
      this.host?.appendChild(canvas);
      this.canvas = canvas;
      this.preview = this.createPreview(canvas);
    }
    void this.preview?.show(doc);
  }

  /** Tear the stage down (dispose the previewer + remove the overlay canvas). */
  clear(): void {
    this.preview?.dispose();
    this.preview = null;
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
  }

  /** Idempotent teardown; safe to call from GameApp.dispose more than once. */
  dispose(): void {
    this.disposed = true;
    this.clear();
  }
}

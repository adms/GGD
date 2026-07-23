/**
 * previewGate — WHICH champion the champ-select 3D stage is allowed to LOAD.
 *
 * ---------------------------------------------------------------------------
 * THE LEAK THIS EXISTS TO CLOSE
 * ---------------------------------------------------------------------------
 * The roster grid used to wire `onPointerEnter` (and `onFocus`) straight to the
 * profile subject. That subject flows into StorePreviewCanvas → StorePreview.show
 * → AssetManager.load(<champion>.glb), so ONE CURSOR SWEEP down the grid
 * requested one .glb per card it crossed. Measured over the current roster: 55
 * distinct champion .glb files, 18,412,668 B (17.56 MB), mean 327 KB each. The
 * stale-result guards downstream were real but only discarded the RESULT — every
 * byte was already on the wire.
 *
 * The owner asked for 「滑鼠點選才載入」: LOAD ON CLICK, NOT HOVER. So:
 *
 *   • HOVER is free. It sets `hoveredId`, which the panel uses for the card's
 *     highlight ring and nothing else. No fetch of any kind is reachable from it.
 *   • CLICK is what previews. Clicking a card already picks that champion
 *     (picks are last-write-wins until 鎖定), and it is now also the only thing
 *     that moves the 3D stage and the 技能/數值/玩法/故事 body.
 *   • The COMMITTED PICK previews too, so a pick made elsewhere (🎲 random, a
 *     re-join, the auto-lock) still shows its champion without a click.
 *
 * Pure + framework-free so the "a sweep loads nothing" claim is a unit test over
 * a real event sequence, not a comment. The panel drives it with useReducer.
 */

/** What the roster grid can report. `leave` is the pointer-out of a card. */
export type RosterPointerEvent =
  | { readonly type: "hover"; readonly id: string }
  | { readonly type: "leave" }
  | { readonly type: "click"; readonly id: string };

export interface PreviewState {
  /** cosmetic only — drives the card highlight. NEVER drives a load. */
  readonly hoveredId: string | null;
  /** the clicked champion; the ONLY hover-independent source of a model load. */
  readonly clickedId: string | null;
}

export const INITIAL_PREVIEW_STATE: PreviewState = { hoveredId: null, clickedId: null };

/**
 * Fold one roster pointer event into the preview state.
 *
 * `locked` freezes the pick (champselect/lockGate): after it, clicks no longer
 * re-target the stage — the frozen pick stays on it — but hovering still
 * highlights, so the roster does not feel dead.
 */
export function previewReducer(
  state: PreviewState,
  event: RosterPointerEvent,
  locked = false,
): PreviewState {
  switch (event.type) {
    case "hover":
      return state.hoveredId === event.id ? state : { ...state, hoveredId: event.id };
    case "leave":
      return state.hoveredId === null ? state : { ...state, hoveredId: null };
    case "click":
      if (locked) return state;
      return state.clickedId === event.id ? state : { ...state, clickedId: event.id };
  }
}

/**
 * The champion whose model the stage may load: the clicked preview, else the
 * committed pick, else nothing. Hover is deliberately NOT an input here — that
 * absence is the fix, and `previewGate.test.ts` pins it.
 */
export function modelLoadSubject(state: PreviewState, pickedId: string | null): string | null {
  return state.clickedId ?? (pickedId !== null && pickedId !== "" ? pickedId : null);
}

/**
 * Every distinct model the stage WOULD request for a sequence of roster events.
 * Exists so the regression is expressed as bytes-on-the-wire, not as state:
 * replay a 24-card cursor sweep and assert this is empty.
 */
export function requestedSubjects(
  events: readonly RosterPointerEvent[],
  opts: { pickedId?: string | null; locked?: boolean } = {},
): string[] {
  const picked = opts.pickedId ?? null;
  let state = INITIAL_PREVIEW_STATE;
  const out: string[] = [];
  const push = (id: string | null): void => {
    if (id !== null && out[out.length - 1] !== id) out.push(id);
  };
  push(modelLoadSubject(state, picked));
  for (const e of events) {
    state = previewReducer(state, e, opts.locked ?? false);
    push(modelLoadSubject(state, picked));
  }
  return out;
}

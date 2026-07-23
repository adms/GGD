/**
 * champ-select preview gate — 「滑鼠點選才載入」.
 *
 * The defect this pins: the roster grid wired `onPointerEnter` straight to the
 * profile subject, and the profile subject is what StorePreviewCanvas hands to
 * StorePreview.show → AssetManager.load(<champion>.glb). One cursor sweep down
 * the grid therefore requested one .glb per card crossed. Measured over the
 * current roster on disk: 55 distinct champion .glb files, 18,412,668 B
 * (17.56 MB), mean 327 KB each.
 *
 * The cases below replay REAL EVENT SEQUENCES (a sweep, a slow browse, a click,
 * a click while locked) and assert on the set of models that WOULD be fetched —
 * so this is a statement about bytes on the wire, not about component state.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  INITIAL_PREVIEW_STATE,
  modelLoadSubject,
  previewReducer,
  requestedSubjects,
  type RosterPointerEvent,
} from "./previewGate";

/** A cursor dragged down a column of `n` cards: enter/leave, enter/leave, … */
function sweep(n: number): RosterPointerEvent[] {
  const out: RosterPointerEvent[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ type: "hover", id: `champ-${i}` }, { type: "leave" });
  }
  return out;
}

describe("previewGate — hover never loads a model", () => {
  it("a 24-card cursor sweep requests ZERO models", () => {
    cover("champselect-hover-loads-nothing");
    expect(requestedSubjects(sweep(24))).toEqual([]);
    // …and the same is true of a sweep over the whole 113-champion roster.
    expect(requestedSubjects(sweep(113))).toEqual([]);
  });

  it("resting on a card still requests nothing (no debounce fallback either)", () => {
    cover("champselect-hover-rest-loads-nothing");
    // "resting" is just a hover with no leave after it — there is no timer that
    // could turn dwell time into a fetch. Deliberate: the owner asked for
    // click-to-load, so hovering is unconditionally free.
    expect(requestedSubjects([{ type: "hover", id: "godie-e001" }])).toEqual([]);
  });

  it("a CLICK requests exactly one model, and only that one", () => {
    cover("champselect-click-loads-one-model");
    const events: RosterPointerEvent[] = [
      ...sweep(12),
      { type: "hover", id: "godie-e002" },
      { type: "click", id: "godie-e002" },
      ...sweep(9), // keep browsing after the pick — still free
    ];
    expect(requestedSubjects(events)).toEqual(["godie-e002"]);
  });

  it("switching picks loads the new model, and re-clicking the same one does not", () => {
    cover("champselect-repick-loads-once-each");
    const events: RosterPointerEvent[] = [
      { type: "click", id: "a" },
      { type: "hover", id: "b" },
      { type: "click", id: "b" },
      { type: "click", id: "b" }, // idempotent — same subject, no second load
      { type: "click", id: "a" },
    ];
    expect(requestedSubjects(events)).toEqual(["a", "b", "a"]);
  });

  it("the COMMITTED pick still previews without any click (🎲 / rejoin / auto-lock)", () => {
    cover("champselect-committed-pick-previews");
    // Nothing was clicked in this panel, yet the seat carries a champion: the
    // stage must show it, or a 🎲 random pick would sit on an empty podium.
    expect(requestedSubjects(sweep(30), { pickedId: "godie-u011" })).toEqual(["godie-u011"]);
  });

  it("once LOCKED, clicks no longer re-target the stage but hover still highlights", () => {
    cover("champselect-locked-preview-frozen");
    const locked = { pickedId: "frozen", locked: true };
    expect(requestedSubjects([{ type: "click", id: "other" }], locked)).toEqual(["frozen"]);
    // hover state is still tracked (the card lights up); it just loads nothing
    const after = previewReducer(INITIAL_PREVIEW_STATE, { type: "hover", id: "other" }, true);
    expect(after.hoveredId).toBe("other");
    expect(modelLoadSubject(after, null)).toBeNull();
  });

  it("hovering is not even representable as a load input", () => {
    cover("champselect-hover-not-a-load-input");
    // modelLoadSubject reads clickedId + the committed pick. If a future edit
    // reintroduced hover here, this case is what fails.
    const hovered = previewReducer(INITIAL_PREVIEW_STATE, { type: "hover", id: "x" });
    expect(hovered.hoveredId).toBe("x");
    expect(hovered.clickedId).toBeNull();
    expect(modelLoadSubject(hovered, null)).toBeNull();
    expect(modelLoadSubject(hovered, "")).toBeNull(); // empty pick is "no pick"
  });

  it("pointer-leave clears the highlight without touching the preview", () => {
    cover("champselect-leave-keeps-preview");
    let s = previewReducer(INITIAL_PREVIEW_STATE, { type: "click", id: "picked" });
    s = previewReducer(s, { type: "hover", id: "other" });
    s = previewReducer(s, { type: "leave" });
    expect(s.hoveredId).toBeNull();
    expect(modelLoadSubject(s, null)).toBe("picked"); // stage does NOT flicker away
  });

  it("identical events return the SAME state object (no wasted React renders)", () => {
    cover("champselect-preview-state-identity");
    const a = previewReducer(INITIAL_PREVIEW_STATE, { type: "hover", id: "x" });
    expect(previewReducer(a, { type: "hover", id: "x" })).toBe(a);
    expect(previewReducer(INITIAL_PREVIEW_STATE, { type: "leave" })).toBe(INITIAL_PREVIEW_STATE);
  });
});

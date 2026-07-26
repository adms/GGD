/**
 * Task #271 — "戰鬥中不應該讓手把按鍵一鍵退出,應該要移動過去甚至按 [確認/取消]
 * 的確認後才能退回大廳".
 *
 * WHAT THESE TESTS ARE ANCHORED ON. The defect was never a key binding, so a
 * test that asserts "no button is bound to leave" would have been green the
 * whole time it was broken. The one-press exit was a HEURISTIC:
 * `ui/PadFocusNav.findBackControl` regex-scanned every focusable in the scope
 * for 取消|關閉|返回|離開|leave|back|close|… and clicked the first hit — and with
 * no modal open the scope is `document.body`, where the top-right Leave chip
 * (`title="leave the match"`, text `Leave`) matched twice. That half is pinned
 * in input/padFocusNav.test.ts (`backControlIndex`), which is also the first
 * test that function has ever had.
 *
 * This file pins the other half, at the three joints where "we added a
 * confirmation" usually turns out to be false:
 *
 *   1. DOES EVERY TRIGGER GO THROUGH IT? — `useRequestLeave` is the one shared
 *      callback (chip · pause menu · pad · touch), so the assertion is that
 *      calling it does NOT return to the lobby, and that `confirm()` does.
 *   2. IS CANCEL THE DEFAULT? — the rendered markup is walked for BUTTON ORDER,
 *      because `initialFocusIndex` is geometric: the pad lands on whatever is
 *      top-most/left-most, so 取消 being FIRST is the mechanism, not decoration.
 *   3. CAN IT TRAP ANYONE? — matchEnd / disconnect / a kick must leave without
 *      asking, and the dialog must vanish if the match ends under it.
 *
 * The client's vitest env is `node`; `renderToStaticMarkup` is the repo's
 * convention for rendering React here (see ui/platform/announcements.test.ts),
 * and it sees live store state because `useApp` / `useLeaveConfirm` hand the
 * CURRENT snapshot to React's server-snapshot slot.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import {
  LEAVE_CONFIRM_ACCEPT,
  LEAVE_CONFIRM_CANCEL,
  LEAVE_CONFIRM_TITLE,
  LEAVE_NO_CONFIRM_PHASES,
  leaveConsequences,
  shouldConfirmLeave,
} from "./leaveConfirm";
import { leaveConfirmStore } from "./leaveFlow";
import { LeaveConfirmDialog } from "./LeaveConfirmDialog";
import { appStore } from "./platform/store";
import { hudStore, resetHudStore } from "../net/RoomStore";

const markup = (): string => renderToStaticMarkup(createElement(LeaveConfirmDialog));

beforeEach(() => {
  leaveConfirmStore.getState().cancel();
  resetHudStore();
});

describe("shouldConfirmLeave — which leaves need [確認 / 取消] (leave-confirm-gate)", () => {
  it("confirms every live match phase, including the two the pad defect fired in", () => {
    cover("leave-confirm-gate");
    // champSelect + intermission are where B actually clicked the Leave chip:
    // the focus layer stands DOWN during live combat, so those are the phases
    // in which `document.body` was the pad's scope.
    for (const phase of ["champSelect", "intermission", "combat", "resolution"]) {
      expect(shouldConfirmLeave({ screen: "match", phase })).toBe(true);
    }
  });

  it("never confirms off the match screen — the lobby/store have nothing to abandon", () => {
    cover("leave-confirm-gate");
    for (const screen of ["boot", "auth", "lobby"]) {
      expect(shouldConfirmLeave({ screen, phase: "combat" })).toBe(false);
    }
  });
});

describe("shouldConfirmLeave — the dialog must never be a cage (leave-confirm-no-trap)", () => {
  it("matchEnd leaves directly: the result is in, MatchEndPanel owns 返回大廳", () => {
    cover("leave-confirm-no-trap");
    expect(shouldConfirmLeave({ screen: "match", phase: "matchEnd" })).toBe(false);
  });

  it("`connecting` leaves directly — that is the state a WEDGED client sits in", () => {
    cover("leave-confirm-no-trap");
    expect(shouldConfirmLeave({ screen: "match", phase: "connecting" })).toBe(false);
    expect(LEAVE_NO_CONFIRM_PHASES.has("connecting")).toBe(true);
  });

  it("a disconnect / kick / room close moves `screen` off match, so it is never asked", () => {
    cover("leave-confirm-no-trap");
    // Those paths do not call useRequestLeave at all; they set screen/match
    // directly. This asserts the STRUCTURE that makes that safe: once the
    // screen is no longer "match", no confirmation can be demanded.
    expect(shouldConfirmLeave({ screen: "lobby", phase: "combat" })).toBe(false);
  });

  it("the dialog closes itself if the match ends while it is open", () => {
    cover("leave-confirm-no-trap");
    appStore.setState({ screen: "match" });
    hudStore.setState({ phase: "combat" });
    leaveConfirmStore.getState().ask(() => undefined);
    expect(markup()).toContain(LEAVE_CONFIRM_TITLE);

    hudStore.setState({ phase: "matchEnd" });
    // renders nothing even while `open` is still latched; the effect that
    // clears the latch only runs in a real browser, so the guard must be in
    // the render path too or a settled match would sit behind a prompt.
    expect(markup()).toBe("");
  });
});

describe("LeaveConfirmDialog — cancel is the default (leave-confirm-default-cancel)", () => {
  beforeEach(() => {
    appStore.setState({ screen: "match" });
    hudStore.setState({ phase: "combat" });
    leaveConfirmStore.getState().ask(() => undefined);
  });

  it("取消 comes FIRST in the DOM, so initialFocusIndex lands the pad on it", () => {
    cover("leave-confirm-default-cancel");
    const html = markup();
    const cancelAt = html.indexOf(LEAVE_CONFIRM_CANCEL);
    const acceptAt = html.indexOf(LEAVE_CONFIRM_ACCEPT);
    expect(cancelAt).toBeGreaterThanOrEqual(0);
    expect(acceptAt).toBeGreaterThanOrEqual(0);
    // top-most-then-left-most (input/padFocusNav.initialFocusIndex) — same row,
    // so document order IS the left-to-right order the pad will resolve.
    expect(cancelAt).toBeLessThan(acceptAt);
  });

  it("B is cancel: the cancel button carries data-pad-back", () => {
    cover("leave-confirm-default-cancel");
    const html = markup();
    const backAt = html.indexOf("data-pad-back");
    const acceptAt = html.indexOf(LEAVE_CONFIRM_ACCEPT);
    expect(backAt).toBeGreaterThanOrEqual(0);
    expect(backAt).toBeLessThan(acceptAt); // it is on the cancel button, not 確認離開
  });
});

describe("LeaveConfirmDialog — pad-operable and named (leave-confirm-a11y)", () => {
  beforeEach(() => {
    appStore.setState({ screen: "match" });
    hudStore.setState({ phase: "combat" });
    leaveConfirmStore.getState().ask(() => undefined);
  });

  it("declares a pad scope above the pause menu's 50, or a pad cannot reach it at all", () => {
    cover("leave-confirm-a11y");
    const html = markup();
    expect(html).toContain('data-pad-scope="leave-confirm"');
    const m = /data-pad-scope-priority="(\d+)"/.exec(html);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(50);
  });

  it("is a labelled dialog and BOTH buttons have accessible names", () => {
    cover("leave-confirm-a11y");
    const html = markup();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain("aria-describedby=");
    expect(html).toContain(`aria-label="${LEAVE_CONFIRM_CANCEL}"`);
    expect(html).toContain(`aria-label="${LEAVE_CONFIRM_ACCEPT}"`);
  });

  it("renders nothing at all when nobody asked to leave", () => {
    cover("leave-confirm-a11y");
    leaveConfirmStore.getState().cancel();
    expect(markup()).toBe("");
  });
});

describe("leaveConsequences — the cost is stated, per mode (leave-confirm-copy)", () => {
  it("online: AI takeover, no way back, rewards settle only at match end", () => {
    cover("leave-confirm-copy");
    const lines = leaveConsequences("platform");
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.join("")).toContain("AI"); // MatchRoom.onLeave → new AIDriver()
    expect(lines.join("")).toContain("60 秒"); // grace is for a DROP, not a leave
    expect(lines.join("")).toContain("藍水晶"); // settleToPlatform runs at finishMatch only
  });

  it("offline: says the practice match simply ends, not that teammates suffer", () => {
    cover("leave-confirm-copy");
    const lines = leaveConsequences("offline");
    expect(lines.join("")).toContain("單機");
    expect(lines.join("")).not.toContain("隊友");
  });
});

describe("useRequestLeave — one gate, every trigger (leave-confirm-one-gate)", () => {
  it("asking does NOT leave; only confirm() runs the commit, cancel() drops it", () => {
    cover("leave-confirm-one-gate");
    const commit = vi.fn();
    leaveConfirmStore.getState().ask(commit);
    expect(leaveConfirmStore.getState().open).toBe(true);
    expect(commit).not.toHaveBeenCalled();

    leaveConfirmStore.getState().cancel();
    expect(leaveConfirmStore.getState().open).toBe(false);
    expect(commit).not.toHaveBeenCalled();

    leaveConfirmStore.getState().ask(commit);
    leaveConfirmStore.getState().confirm();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(leaveConfirmStore.getState().open).toBe(false);
  });

  it("confirm() twice cannot leave twice — the commit is consumed", () => {
    cover("leave-confirm-one-gate");
    const commit = vi.fn();
    leaveConfirmStore.getState().ask(commit);
    leaveConfirmStore.getState().confirm();
    leaveConfirmStore.getState().confirm();
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

/**
 * ⛔ THE MUTATION BOTH ADVERSARIAL PASSES LANDED ON.
 *
 * Restore the literal pre-#271 one-click leave — delete the `shouldConfirmLeave`
 * branch out of `useRequestLeave` so it calls `commit()` unconditionally — and
 * every gate this delivery cited stayed byte-identically green. The owner filed
 * this as a SAFETY requirement (「戰鬥中不應該讓手把按鍵一鍵退出」: one stray B
 * press and a teammate's whole match is gone), and it shipped with zero
 * regression protection.
 *
 * WHY NOTHING ELSE COVERS IT. `useRequestLeave` holds 100% of the confirmation
 * gate AND 100% of #193's settlement routing, is imported by exactly two
 * production files (ui/PauseMenu.tsx, ui/platform/AppRoot.tsx), and by ZERO test
 * files. The tests above drive `leaveConfirmStore.ask/cancel/confirm()` — the
 * zustand primitive the DIALOG uses — and never the callback that decides
 * whether to confirm at all. Proving the dialog works is not proving anything
 * asks for it.
 *
 * A hook that calls `useApp`/`useHud` cannot be instantiated headlessly here, so
 * a source scan is this seam's only available guard. That is fine — it just has
 * to scan for the thing that actually carries the requirement.
 *
 * THIS IS THE SEVENTH SELF-PROVING-TEST FINDING OF THE SESSION, and the third in
 * three consecutive deliveries (#259 spatial voice, #258 valhalla, #271 here).
 * The shape is always the same: the test exercises the PURE HELPER, while the
 * deletable thing is the WIRING.
 */
describe("#271 the gate must actually be wired into the one leave callback", () => {
  const SRC = readFileSync(
    fileURLToPath(new URL("./leaveFlow.ts", import.meta.url)),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("useRequestLeave ASKS before committing, instead of leaving straight away", () => {
    cover("leave-confirm-271");
    // the branch itself: consult the predicate, and park the leave behind ask()
    expect(SRC).toMatch(/shouldConfirmLeave\(\{[\s\S]{0,120}\}\)/);
    expect(SRC).toMatch(/leaveConfirmStore\.getState\(\)\.ask\(commit\)/);
    // …and it must RETURN, or it would ask and leave in the same breath
    expect(SRC).toMatch(/ask\(commit\);\s*return;/);
  });

  it("an eliminated player is not asked twice (#193's card IS the confirmation)", () => {
    cover("leave-confirm-271");
    expect(SRC).toMatch(/!settles && shouldConfirmLeave\(/);
  });

  it("the confirmation lives in useRequestLeave, NOT in returnToLobby", () => {
    cover("leave-confirm-271");
    // returnToLobby is also called by automatic flows (host-less restart, etc);
    // gating it there would freeze those. The gate belongs on the human path.
    const STORE = readFileSync(
      fileURLToPath(new URL("./platform/store.ts", import.meta.url)),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(STORE).not.toMatch(/leaveConfirmStore/);
  });
});

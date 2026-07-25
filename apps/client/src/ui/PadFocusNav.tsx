/**
 * PadFocusNav — the DOM half of "a pad drives the menus" (task #197).
 *
 * The pure core (input/padFocusNav) turns pad snapshots into discrete nav
 * actions and does the focus geometry; THIS renderless component owns the parts
 * that need a real browser: it polls the pad each frame, finds the active focus
 * SCOPE (the top-most modal/overlay marked `data-pad-scope`, else the whole
 * screen), enumerates the focusable controls inside it, and moves DOM focus with
 * the D-pad/stick, activates with A, and backs out with B. The focused control
 * is marked via ./focusGlow (`applyPadFocus`) and painted by ./focusGlow.css —
 * the ONE shared focus glow (#222), because most of these controls have none of
 * their own. This file no longer carries any focus CSS.
 *
 * IT DEFERS TO THE CHAMPION IN LIVE COMBAT. `focusNavActive` keeps this layer
 * OUT of `combat`/`resolution` (unless a modal is open over them), so the pad
 * still aims the hero there; everywhere else — auth, lobby, store, champ-select,
 * the intermission shop/draft, match-end, and every modal/scrim — it drives the
 * DOM. While it owns pad 0 it raises `setPadMenuCapture`, so the combat pad
 * system stops feeding player 0's champion off the same sticks/buttons.
 *
 * The node test env has no DOM, so the geometry/edge/repeat logic is proven in
 * input/padFocusNav.test.ts; this file is the thin, browser-only wiring.
 */
import { useEffect } from "react";
import { listPadSources } from "../input/GamepadInput";
import {
  firstConnectedPad,
  focusNavActive,
  initialFocusIndex,
  PadMenuNav,
  pickSpatial,
  type FocusRect,
  type NavAction,
} from "../input/padFocusNav";
import { setPadMenuCapture } from "../input/padMenuCapture";
import { PAD_FOCUS_ATTR, applyPadFocus, clearPadFocus } from "./focusGlow";
import { appStore } from "./platform/store";
import { hudStore } from "../net/RoomStore";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  "[data-pad-focusable]",
].join(",");

function isVisible(el: Element): boolean {
  if ((el as HTMLElement).getAttribute?.("aria-hidden") === "true") return false;
  const cs = window.getComputedStyle(el);
  // a face-down / hidden control (e.g. an un-revealed draft card at opacity:0
  // with pointer-events:none) must never be focused OR clicked by the pad.
  if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 1 || r.height <= 1) return false;
  // on-screen (allow partial): reject fully off-viewport controls
  return (
    r.bottom > 0 &&
    r.right > 0 &&
    r.top < (window.innerHeight || 0) &&
    r.left < (window.innerWidth || 0)
  );
}

function rectOf(el: Element): FocusRect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** The top-most `data-pad-scope` overlay currently visible, or null. */
function topScope(): HTMLElement | null {
  const scopes = Array.from(document.querySelectorAll<HTMLElement>("[data-pad-scope]")).filter(
    isVisible,
  );
  if (scopes.length === 0) return null;
  // highest explicit priority; document order (querySelectorAll order) breaks ties
  let best = scopes[0]!;
  let bestP = Number(best.dataset.padScopePriority ?? 0);
  for (const s of scopes) {
    const p = Number(s.dataset.padScopePriority ?? 0);
    if (p >= bestP) {
      bestP = p;
      best = s;
    }
  }
  return best;
}

function getFocusables(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

function setFocus(el: HTMLElement): void {
  applyPadFocus(el); // exclusive: clears the previous holder, then marks this one
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
  el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

/** B → a close/back/cancel control within the scope, or null (nothing to back out of). */
function findBackControl(root: ParentNode): HTMLElement | null {
  const explicit = root.querySelector<HTMLElement>("[data-pad-back]");
  if (explicit && isVisible(explicit)) return explicit;
  const re = /取消|關閉|返回|離開|leave|back|close|cancel|✕|×|╳/i;
  for (const el of getFocusables(root)) {
    const label = `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""} ${el.textContent ?? ""}`;
    if (re.test(label)) return el;
  }
  return null;
}

export function PadFocusNav(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nav = new PadMenuNav();
    let raf = 0;
    // START (menu) button edge — the pad's route to the in-match menu during live
    // combat, where the focus layer is otherwise standing down. It toggles the
    // pause menu (Resume / Restart / Leave) via the same Escape the ☰ button and
    // keyboard use, so a keyboard-less player can leave a match.
    const START_BTN = 9;
    let prevStart = false;

    // a REAL mouse/keyboard interaction drops the pad ring — it is a pad-only
    // cue. Synthetic events WE dispatch (the activate click, the Start→Escape
    // bridge) have isTrusted=false and must never clear it.
    const onUserInput = (e: Event): void => {
      if (!e.isTrusted) return;
      clearPadFocus();
    };
    window.addEventListener("pointerdown", onUserInput, { capture: true, passive: true });
    window.addEventListener("keydown", onUserInput, { capture: true, passive: true });

    const focusedInScope = (root: ParentNode): HTMLElement | null => {
      const active = document.querySelector<HTMLElement>(`[${PAD_FOCUS_ATTR}]`);
      if (active && (root === document.body ? true : (root as HTMLElement).contains(active)) && isVisible(active)) {
        return active;
      }
      return null;
    };

    const handle = (ev: NavAction, root: ParentNode): void => {
      const focusables = getFocusables(root);
      if (focusables.length === 0) return;

      if (ev === "activate") {
        const cur = focusedInScope(root);
        if (cur) cur.click();
        return;
      }
      if (ev === "back") {
        const back = findBackControl(root);
        if (back) back.click();
        return;
      }
      // a direction
      const cur = focusedInScope(root);
      if (!cur) {
        // first nudge with nothing focused → land on the natural start
        const idx = initialFocusIndex(focusables.map(rectOf));
        if (idx >= 0) setFocus(focusables[idx]!);
        return;
      }
      const idx = focusables.indexOf(cur);
      const others = focusables.filter((_, i) => i !== idx);
      const pick = pickSpatial(rectOf(cur), others.map(rectOf), ev);
      if (pick >= 0) setFocus(others[pick]!);
    };

    const loop = (): void => {
      raf = requestAnimationFrame(loop);
      const pads = listPadSources();
      const pad = firstConnectedPad(pads);
      if (!pad) {
        setPadMenuCapture(false);
        nav.reset();
        prevStart = false;
        return;
      }
      const scope = topScope();
      const inMatch = appStore.getState().screen === "match";
      const active = focusNavActive({
        screen: appStore.getState().screen,
        phase: hudStore.getState().phase,
        hasScope: scope !== null,
      });
      setPadMenuCapture(active);

      // START edge → open the in-match menu (only in live combat, i.e. when the
      // focus layer is standing down; once a menu is open, B/A close it).
      const start = pad.buttons[START_BTN]?.pressed === true;
      if (inMatch && !active && start && !prevStart) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }
      prevStart = start;

      if (!active) {
        nav.reset();
        return;
      }
      const events = nav.read(pads, performance.now());
      if (events.length === 0) return;
      const root: ParentNode = scope ?? document.body;
      for (const ev of events) handle(ev, root);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerdown", onUserInput, { capture: true } as EventListenerOptions);
      window.removeEventListener("keydown", onUserInput, { capture: true } as EventListenerOptions);
      setPadMenuCapture(false);
      clearPadFocus();
    };
  }, []);

  return null;
}

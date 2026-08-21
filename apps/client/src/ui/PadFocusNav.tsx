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
 * FOUR THINGS A "MOVE FOCUS + CLICK" LAYER CANNOT DO, ADDED FOR #505/#506:
 *   • `<select>`/`<input type=range>` are EDITED IN PLACE — left/right steps the
 *     value and dispatches input+change; up/down still leaves. A synthetic click
 *     cannot open a native dropdown, so before this every dropdown and slider in
 *     the game was reachable, lit, and unchangeable on a pad.
 *   • Scrollable panes SCROLL — from the right stick anywhere, and from the
 *     D-pad when nothing lies that way. Content with no focusable children (the
 *     champ-select tab bodies) was otherwise unreachable past the first screen.
 *   • A new scope ARRIVES WITH FOCUS, so the first press of A is never dead.
 *   • Disabled controls are FOCUSABLE BUT INERT, so rows the player cannot use
 *     stay visible to the stick instead of silently reshaping the grid.
 *
 * ⭐ …UNTIL THE PLAYER SAYS OTHERWISE (#508). Deferring cost the pad EVERY HUD
 * control in combat — 陣亡投幣, 前往觀戰, 記分板, 設定/音效, 操作說明的 ✕, 屬性
 * 面板 were all mouse-only for a whole match. So the deferral is now STAGE ONE of
 * two: one explicit key (Back/View, a field) toggles a HUD FOCUS MODE that hands
 * this layer the pad mid-combat, with a loud on-screen state, and B or the same
 * key hands it back. ⛔ combat was NOT taken out of COMBAT_LIVE_PHASES — the
 * default is still "the pad drives the hero". See ./hud/padHudFocus.
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
  backControlIndex,
  firstConnectedPad,
  focusNavActive,
  initialFocusIndex,
  nextOptionIndex,
  nextRangeValue,
  padValueKind,
  PadMenuNav,
  pickSpatial,
  scrollStepPx,
  type FocusRect,
  type NavAction,
  type NavDir,
  type PadValueKind,
} from "../input/padFocusNav";
import { setPadMenuCapture } from "../input/padMenuCapture";
import {
  PAD_HUD_FOCUS_BACK_BTN,
  nextHudFocusMode,
  padHudFocusActive,
  padHudFocusTuning,
  setPadHudFocusMode,
} from "./hud/padHudFocus";
import { PAD_FOCUS_ATTR, applyPadFocus, clearPadFocus } from "./focusGlow";
// GH#503/K1 — A 停在文字欄位上時開螢幕小鍵盤（見下面 activate 分支）。
import { openPadKeyboard } from "./PadKeyboard";
import { shouldOpenPadKeyboard } from "../input/padKeyboard";
import { appStore } from "./platform/store";
import { hudStore } from "../net/RoomStore";

/**
 * ⚠️ `:not([disabled])` USED TO BE ON EVERY LINE HERE, AND IT MADE THE PAD BLIND.
 *
 * A mouse player can see a greyed-out control, read its label and its price, and
 * understand why it is greyed out. A pad player navigates by STEPPING, so a
 * control excluded from this set does not read as "disabled" — it does not
 * exist. Whole rows vanish (the skins you cannot afford, the champions you do
 * not own, a Ready button that is not armed yet) and, worse, the rows AFTER them
 * silently move: focus jumps across the hole and the grid the player sees stops
 * matching the grid the stick walks. Disabled controls are therefore FOCUSABLE
 * (they glow, they can be inspected, tooltips fire on focus) and INERT — see the
 * `activate` branch, which refuses to click them.
 */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  '[tabindex]:not([tabindex="-1"])',
  "[data-pad-focusable]",
].join(",");

function isDisabled(el: Element): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";
}

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

// ------------------------------------------------- value controls (#505/K3) --

/**
 * Write a value the way a REAL user gesture would, so React notices.
 *
 * A controlled `<select>`/`<input>` carries React's `_valueTracker`, and React
 * swaps in its own `value` setter on the instance to feed it. Assigning
 * `el.value = x` therefore updates the DOM, updates the tracker, and then React
 * compares the two, sees no change, and drops the event on the floor — the
 * dropdown would visibly move and then snap back on the next render. Going
 * through the PROTOTYPE setter skips React's instance setter, leaves the tracker
 * stale, and the dispatched event is accepted. (Same mechanism react-dom's own
 * test utils use; it is the only route that works on a controlled input.)
 */
function setNativeValue(el: HTMLElement, value: string): void {
  const proto =
    el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else (el as HTMLInputElement).value = value;
}

/**
 * Step a focused `<select>`/`range` by `delta` and tell the app about it.
 * Returns false when the control could not move (a disabled one, an empty
 * `<select>`, a slider already at its stop) so the caller can fall through.
 */
function adjustValue(el: HTMLElement, kind: Exclude<PadValueKind, null>, delta: number, wrap = false): boolean {
  if (isDisabled(el)) return false;
  if (kind === "select") {
    const sel = el as HTMLSelectElement;
    const next = nextOptionIndex(sel.selectedIndex, sel.options.length, delta, wrap);
    if (next < 0 || next === sel.selectedIndex) return false;
    setNativeValue(sel, sel.options[next]!.value);
  } else {
    const r = el as HTMLInputElement;
    const cur = Number(r.value);
    const next = nextRangeValue(
      { value: cur, min: Number(r.min), max: Number(r.max), step: Number(r.step) },
      delta,
    );
    if (next === cur) return false;
    setNativeValue(r, String(next));
  }
  // both, always: React routes `<select>` through `change` and `range` through
  // `input`, and plain listeners in this codebase use either.
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

// --------------------------------------------- scrollable panes (#506/K4) --

function overflowsAlong(el: HTMLElement, dir: NavDir): boolean {
  const vertical = dir === "up" || dir === "down";
  const cs = window.getComputedStyle(el);
  const mode = vertical ? cs.overflowY : cs.overflowX;
  if (!/^(auto|scroll|overlay)$/.test(mode)) return false;
  return vertical
    ? el.scrollHeight - el.clientHeight > 1
    : el.scrollWidth - el.clientWidth > 1;
}

/** Is there room left to travel this way? (An exhausted box must not swallow the nudge.) */
function hasRoom(el: HTMLElement, dir: NavDir): boolean {
  if (dir === "up") return el.scrollTop > 1;
  if (dir === "down") return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  if (dir === "left") return el.scrollLeft > 1;
  return el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}

/**
 * Which box should this nudge scroll? Nearest scrollable ANCESTOR of the focused
 * control first — that is the pane the player is standing in. Failing that (the
 * champ-select tab body is a sibling of the tab buttons, and its contents are
 * plain `<div>`s the focus layer cannot even see), the largest scrollable box
 * inside the scope, which is the one filling the screen.
 */
function scrollTargetFor(from: HTMLElement | null, root: ParentNode, dir: NavDir): HTMLElement | null {
  for (let el: HTMLElement | null = from; el; el = el.parentElement) {
    if (overflowsAlong(el, dir) && hasRoom(el, dir)) return el;
    if ((el as Element) === (root as Element)) break;
  }
  const rootEl = (root === document.body ? document.body : (root as HTMLElement)) as HTMLElement;
  let best: HTMLElement | null = null;
  let bestArea = 0;
  for (const el of Array.from(rootEl.querySelectorAll<HTMLElement>("*"))) {
    if (!isVisible(el) || !overflowsAlong(el, dir) || !hasRoom(el, dir)) continue;
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    if (area > bestArea) {
      bestArea = area;
      best = el;
    }
  }
  return best;
}

function scrollBox(el: HTMLElement, dir: NavDir): void {
  const vertical = dir === "up" || dir === "down";
  const sign = dir === "down" || dir === "right" ? 1 : -1;
  const step = scrollStepPx(vertical ? el.clientHeight : el.clientWidth) * sign;
  const delta = vertical ? { top: step, left: 0 } : { top: 0, left: step };
  if (typeof el.scrollBy === "function") el.scrollBy(delta);
  else if (vertical) el.scrollTop += step;
  else el.scrollLeft += step;
}

/**
 * B → a close/back/cancel control within the scope, or null (nothing to back
 * out of).
 *
 * An explicit `data-pad-back` is the contract and always wins. The label scan
 * behind it is a courtesy for scopes that declare none — and it is the exact
 * mechanism task #271 was filed about: it used to accept `離開|leave`, so with
 * no modal open (scope = `document.body`) B clicked the top-right Leave chip on
 * sight, ending the match with one press, no focus and no confirmation. The
 * allow/veto decision now lives in the PURE `backControlIndex`, where the
 * client's DOM-less test env can actually pin it (see input/padFocusNav.test).
 */
function findBackControl(root: ParentNode): HTMLElement | null {
  const explicit = root.querySelector<HTMLElement>("[data-pad-back]");
  if (explicit && isVisible(explicit) && !isDisabled(explicit)) return explicit;
  // disabled controls are in the focusable set on purpose (see FOCUSABLE_SELECTOR)
  // but B must never "press" one — it would look like B is simply dead.
  const candidates = getFocusables(root).filter((el) => !isDisabled(el));
  const labels = candidates.map(
    (el) =>
      `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""} ${el.textContent ?? ""}`,
  );
  const idx = backControlIndex(labels);
  return idx >= 0 ? candidates[idx]! : null;
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
    /** The scope we have already dropped initial focus into (see the loop). */
    let landedScope: ParentNode | null = null;
    // GH#508 — the SECOND STAGE. In live combat stage 1 (`focusNavActive`)
    // stands this layer down so the pad aims the hero; ONE explicit key
    // (Back/View by default — a field) hands the pad to the HUD and back,
    // which is the only way 陣亡投幣 / 前往觀戰 / 記分板 / 設定 / 操作說明的 ✕ /
    // 屬性面板 are reachable at all without a mouse. The rules are PURE in
    // ./hud/padHudFocus; this only reads button edges and publishes the mode.
    let hudMode = false;
    let prevToggle = false;
    let prevBack = false;

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

    const kindOf = (el: HTMLElement): PadValueKind =>
      padValueKind({ tag: el.tagName, type: el.getAttribute("type") });

    /** Land focus on the natural start of a scope; true if anything was focused. */
    const landInitialFocus = (root: ParentNode): boolean => {
      const focusables = getFocusables(root);
      if (focusables.length === 0) return false;
      const idx = initialFocusIndex(focusables.map(rectOf));
      if (idx < 0) return false;
      setFocus(focusables[idx]!);
      return true;
    };

    const handle = (ev: NavAction, root: ParentNode): void => {
      if (ev === "activate") {
        const cur = focusedInScope(root);
        if (!cur) return;
        // focusable-but-inert (see FOCUSABLE_SELECTOR): a real browser would
        // swallow the click anyway; refusing here keeps the two halves honest.
        if (isDisabled(cur)) return;
        // A on a dropdown = "next option, wrapping". A synthetic click cannot
        // open a native <select>, so cycling is the only thing A can honestly do.
        if (kindOf(cur) === "select") {
          adjustValue(cur, "select", 1, true);
          return;
        }
        // ⭐ GH#503/K1 — 文字欄位按 A 要**叫出螢幕小鍵盤**。`cur.click()` 對一個
        // `<input>` 只是把游標放進去，一個字元都產生不了，而全 repo 沒有任何
        // 輸入手段 ⇒ 登入 / 註冊 / 改密碼 / 房名 / 邀請碼 / 聊天 / 兩個搜尋框
        // 對純手把玩家全部是死的（16 個缺口，同一個根因）。
        if (
          shouldOpenPadKeyboard({
            tag: cur.tagName,
            type: cur.getAttribute("type"),
            readOnly: (cur as HTMLInputElement).readOnly === true,
          })
        ) {
          openPadKeyboard(cur as HTMLInputElement);
          return;
        }
        cur.click();
        return;
      }
      if (ev === "back") {
        const back = findBackControl(root);
        if (back) back.click();
        return;
      }
      // listed member by member (⛔ not `startsWith`) so TS narrows `ev` to a
      // NavDir below instead of needing a cast that would outlive the union.
      if (ev === "scroll-up" || ev === "scroll-down" || ev === "scroll-left" || ev === "scroll-right") {
        const dir = ev.slice("scroll-".length) as NavDir;
        const box = scrollTargetFor(focusedInScope(root), root, dir);
        if (box) scrollBox(box, dir);
        return;
      }
      // a direction
      const cur = focusedInScope(root);
      if (!cur) {
        // first nudge with nothing focused → land on the natural start
        landInitialFocus(root);
        return;
      }
      // ⭐ left/right EDITS a value control instead of stepping off it (#505/K3);
      // up/down still moves, so the player is never trapped inside a slider.
      const kind = kindOf(cur);
      if (kind && (ev === "left" || ev === "right")) {
        adjustValue(cur, kind, ev === "right" ? 1 : -1);
        return;
      }
      const focusables = getFocusables(root);
      const idx = focusables.indexOf(cur);
      const others = focusables.filter((_, i) => i !== idx);
      const pick = pickSpatial(rectOf(cur), others.map(rectOf), ev);
      if (pick >= 0) {
        setFocus(others[pick]!);
        return;
      }
      // nothing that way → the D-pad reaches the rest of the pane instead of
      // dying at the edge (#506/K4), so content below the fold is not stranded.
      const box = scrollTargetFor(cur, root, ev);
      if (box) scrollBox(box, ev);
    };

    const loop = (): void => {
      raf = requestAnimationFrame(loop);
      const pads = listPadSources();
      const pad = firstConnectedPad(pads);
      if (!pad) {
        setPadMenuCapture(false);
        setPadHudFocusMode(false);
        nav.reset();
        hudMode = false;
        prevStart = false;
        prevToggle = false;
        prevBack = false;
        landedScope = null;
        return;
      }
      const scope = topScope();
      const screen = appStore.getState().screen;
      const phase = hudStore.getState().phase;
      const inMatch = screen === "match";
      // stage 1 — the rule that has always decided menu-vs-champion.
      const menuOwns = focusNavActive({ screen, phase, hasScope: scope !== null });
      // stage 2 (#508) — while stage 1 is standing down, ONE key toggles the HUD in.
      const tuning = padHudFocusTuning();
      const toggle = pad.buttons[tuning.toggleButton]?.pressed === true;
      const backBtn = pad.buttons[PAD_HUD_FOCUS_BACK_BTN]?.pressed === true;
      const wasHudMode = hudMode;
      hudMode = nextHudFocusMode(
        hudMode,
        {
          standingDown: !menuOwns,
          togglePressed: toggle && !prevToggle,
          backPressed: backBtn && !prevBack,
          padPresent: true,
        },
        tuning,
      );
      // the B that CLOSED the mode is SPENT. Without this the same frame's
      // "back" event also runs findBackControl over `document.body`, i.e. B
      // exits the mode AND presses whatever the label scan finds behind it.
      const backConsumed = wasHudMode && !hudMode && backBtn && !prevBack;
      prevToggle = toggle;
      prevBack = backBtn;
      setPadHudFocusMode(hudMode);
      const active = padHudFocusActive({
        screen,
        phase,
        hasScope: scope !== null,
        hudFocusMode: hudMode,
      });
      setPadMenuCapture(active);
      // `autoFocusOnEnter: false` = the operator wants the ring to wait for a
      // deliberate nudge. Marking the scope as already-landed is how you say
      // that to the landing rule below WITHOUT a second copy of it.
      if (!wasHudMode && hudMode && !tuning.autoFocusOnEnter) {
        landedScope = scope ?? document.body;
      }

      // START edge → open the in-match menu (only in live combat, i.e. when the
      // focus layer is standing down; once a menu is open, B/A close it).
      const start = pad.buttons[START_BTN]?.pressed === true;
      if (inMatch && !menuOwns && start && !prevStart) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }
      prevStart = start;

      if (!active) {
        nav.reset();
        landedScope = null;
        return;
      }
      const root: ParentNode = scope ?? document.body;

      // ⭐ A NEW SCOPE MUST ARRIVE WITH FOCUS ALREADY ON IT. Before this, focus
      // only appeared on the first D-pad nudge, so the very first press of A on
      // any freshly-opened dialog/screen was silently dead — the player's first
      // impression of the pad is that it does nothing. `landedScope` makes this
      // once per scope: we keep retrying while the scope is still mounting
      // (React renders it empty for a frame), and we stop the moment we land, so
      // a player who then picks up the mouse (which clears the ring) is not
      // yanked back by the next frame.
      if (landedScope !== (scope ?? document.body)) {
        if (landInitialFocus(root)) landedScope = scope ?? document.body;
      }

      const events = nav.read(pads, performance.now());
      if (events.length === 0 || backConsumed) return;
      for (const ev of events) handle(ev, root);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerdown", onUserInput, { capture: true } as EventListenerOptions);
      window.removeEventListener("keydown", onUserInput, { capture: true } as EventListenerOptions);
      setPadMenuCapture(false);
      setPadHudFocusMode(false);
      clearPadFocus();
    };
  }, []);

  return null;
}

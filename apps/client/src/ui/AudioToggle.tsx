/**
 * AudioToggle — the GLOBAL, always-accessible audio quick-control. Pinned to
 * the top layer of EVERY screen (auth, lobby, room, champ-select, in-match,
 * settlement), so the player can silence or RE-BALANCE the mix from anywhere —
 * no digging into Settings.
 *
 * TWO STATES
 *   collapsed  🎚 🎵 🔊 — the original one-tap per-bus mutes, unchanged, plus
 *              the 🎚 disclosure. Muscle memory is preserved: 🎚 is PREPENDED,
 *              so 🎵 and 🔊 keep the exact screen positions they always had.
 *   expanded   a tray of sliders — Master / Music / SFX volume and the cursor
 *              size — that opens LEFTWARD, in the cluster's own row.
 *
 * REAL TIME IS THE POINT (「音樂音量處應該也要能即時調整音樂大小」). Each slider
 * writes on `input`, i.e. on every pointer move of a drag, NOT on release:
 *   slider → audioSystem.setVolume → audioSettings.patch (persist + notify)
 *          → AudioSystem.applyVolumes → the LIVE bus gain node ramps (25 ms)
 * The bed keeps playing throughout — no source is recreated, so the loop never
 * restarts and the music simply gets louder/quieter under the player's finger.
 * (React maps `onChange` on `<input type="range">` to the DOM `input` event,
 * which is the per-move one; `onInput` is wired too so the behaviour does not
 * depend on that detail.)
 *
 * MUTE AND VOLUME STAY INDEPENDENT. A 🎵/🔊 tap flips ONLY that bus's mute; the
 * slider level underneath is untouched and comes straight back on unmute. Per-bus
 * mute is likewise independent of the master mute (which lives in SettingsScreen).
 *
 * CURSOR SIZE rides along because it is the same kind of "adjust it where you
 * are, not three menus deep" control. None of its state lives here: the tray
 * renders `CURSOR_SIZE_OPTIONS` and calls `setCursorSize` from the `../cursor`
 * barrel — the agreed seam — and only when the device actually has a fine
 * pointer (cursor.css is gated on `(hover: hover) and (pointer: fine)`, so on a
 * phone the setting would do nothing and is not offered).
 *
 * LAYOUT — why the tray opens SIDEWAYS: see ./audioClusterLayout, which owns
 * the geometry and the reasoning. In short, the cluster lives in the
 * `audio-toggle` slot of the top-right corner stack (ui/hud/hudLayout, task
 * #42); growing only along X keeps the expanded tray inside that slot's
 * declared vertical band, and band-disjointness is already guard-tested — so it
 * provably cannot cover the scoreboard above it or the settings gear below it.
 *
 * Placement: mounted ONCE at AppRoot (a sibling of AudioDirector, above the
 * screen switch) and PORTALED to <body>, so its fixed / very-high-z-index box
 * escapes #hud-root's stacking context and sits above the in-match HUD and
 * every overlay (SettingsScreen, PauseMenu, touch controls). The container is
 * pointer-events:none — only the controls are tappable — so it never blocks
 * gameplay input. Mobile safe-area insets are respected.
 *
 * AND BECAUSE IT RIDES ABOVE EVERYTHING, IT PUBLISHES ITS OWN RECT (task #107,
 * ./chromeReserve). Riding above every screen means every screen has to know
 * where it is: the lobby header laid its ⚙ Settings / Logout buttons out in
 * normal flow all the way to the right edge and they ended up UNDERNEATH this
 * cluster. So the persistent button group is measured with a ResizeObserver
 * and its gutter written to --ggd-chrome-top-right-w/-h on :root, which every
 * screen with its own top-right chrome reserves. The tray is deliberately
 * OUTSIDE the measured group — it is a transient popover, not persistent
 * chrome, and reserving room for it would reflow headers on every 🎚 tap.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { audioSettings, audioSystem, type AudioBus } from "../audio";
import { buttonPressFx, buttonSfx } from "./buttonSfx";
import { CURSOR_SIZE_OPTIONS } from "../cursor";
import { useAudioVolumes } from "./useAudio";
import { useCursorSize } from "./useCursor";
import { hudTouch } from "./hud/HudSlot";
import { HUD_EDGE, hudSlotHeight, hudSlotOffset } from "./hud/hudLayout";
import {
  AUDIO_BTN_GAP,
  AUDIO_BTN_SIZE,
  AUDIO_CELL_GAP,
  AUDIO_CELL_W,
  AUDIO_CLUSTER_BUTTONS,
  AUDIO_MENU_TOP,
  AUDIO_TRAY_BORDER,
  AUDIO_TRAY_GAP,
  AUDIO_TRAY_PAD,
  audioButtonsWidth,
} from "./audioClusterLayout";
import { browserChromeEnv, observeChromeReserve } from "./chromeReserve";
import { useApp } from "./platform/store";
import { TEXT_DIM, TEXT_MAIN } from "./theme";

/** Above #hud-root (z-index 10) and every in-match overlay. */
const Z_TOP = 2147483000;

/** Menu screens have no HUD stack, so the cluster hugs the corner there. */
const MENU_TOP = AUDIO_MENU_TOP;

interface BusButtonProps {
  bus: AudioBus;
  muted: boolean;
  icon: string;
  label: string;
  onToggle: (bus: AudioBus) => void;
}

/**
 * GH#113 — every button in this cluster speaks. `clusterBtnProps` is the ONE
 * place that says how: hover → `uiHoverCyber`, click → `unlock()` + `uiToggle`
 * (an on/off switch cue, not the generic blip), plus the press-scale + ripple.
 * Before this existed the 🎚 disclosure was fully silent and 🎵/🔊 were silent
 * on HOVER — they only got a click sound because the container happened to call
 * `playSfx("uiToggle")` by hand inside its own state handler.
 *
 * ⚠️ ORDER MATTERS AND IT IS `buttonSfx`'S, NOT OURS: unlock → play → run the
 * caller's handler. Muting the SFX bus therefore still gets its confirmation
 * blip, because the cue is emitted BEFORE the mute flips.
 */
function clusterBtnProps(onActivate: () => void): Record<string, unknown> {
  return { ...buttonSfx(onActivate, { clickSfx: "uiToggle" }), ...buttonPressFx() };
}

const BTN_BASE: React.CSSProperties = {
  pointerEvents: "auto",
  // `position`/`overflow` are here for the ripple: it is an absolutely
  // positioned child that must clip to the button's rounded box.
  position: "relative",
  overflow: "hidden",
  width: AUDIO_BTN_SIZE,
  height: AUDIO_BTN_SIZE,
  minWidth: AUDIO_BTN_SIZE,
  minHeight: AUDIO_BTN_SIZE,
  padding: 0,
  borderRadius: 10,
  border: "1px solid rgba(120, 140, 190, 0.25)",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "opacity 0.12s, background 0.12s, color 0.12s",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
  userSelect: "none",
};

function BusButton({ bus, muted, icon, label, onToggle }: BusButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className="ggd-tap"
      data-bus={bus}
      data-muted={muted}
      aria-pressed={!muted}
      aria-label={`${label} ${muted ? "off" : "on"}`}
      title={`${label}: ${muted ? "off (tap to unmute)" : "on (tap to mute)"}`}
      {...clusterBtnProps(() => onToggle(bus))}
      style={{
        ...BTN_BASE,
        background: muted ? "rgba(12, 16, 26, 0.42)" : "rgba(12, 16, 26, 0.62)",
        color: muted ? "#5a6478" : "#aeb8cc",
        opacity: muted ? 0.62 : 0.9,
      }}
    >
      <span aria-hidden="true">{icon}</span>
      {muted && (
        // diagonal "disabled" slash — the universal off cue, drawn over the icon
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 8,
            right: 8,
            top: "50%",
            height: 2,
            borderRadius: 2,
            background: "#c85a54",
            transform: "rotate(-45deg)",
            pointerEvents: "none",
          }}
        />
      )}
    </button>
  );
}

/**
 * One tray control. Deliberately dumb: a labelled range input driven by
 * `onInput`. The tray does not know whether a cell is a volume or the cursor
 * size — which is what keeps cursor state out of this file.
 */
export interface AudioTrayCell {
  /** stable id, also the `data-ctl` test hook */
  id: string;
  /** short visible name (the cell is 96px wide) */
  label: string;
  /** full name for assistive tech */
  ariaLabel: string;
  icon?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** formatted current value, e.g. "50%" or "M" */
  display: string;
  onInput: (v: number) => void;
}

function TrayCell({ cell }: { cell: AudioTrayCell }): React.JSX.Element {
  const apply = (raw: string): void => {
    const v = Number(raw);
    if (Number.isFinite(v)) cell.onInput(v);
  };
  return (
    <div
      data-ctl={cell.id}
      style={{
        width: AUDIO_CELL_W,
        minWidth: AUDIO_CELL_W,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 4,
          height: 11,
          lineHeight: "11px",
          fontSize: 10,
          color: TEXT_DIM,
        }}
      >
        <span style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {cell.icon ? `${cell.icon} ` : ""}
          {cell.label}
        </span>
        <span style={{ flexShrink: 0, color: TEXT_MAIN, fontVariantNumeric: "tabular-nums" }}>
          {cell.display}
        </span>
      </div>
      <input
        type="range"
        className="ggd-audio-range"
        aria-label={`${cell.ariaLabel} ${cell.display}`}
        min={cell.min}
        max={cell.max}
        step={cell.step}
        value={cell.value}
        // BOTH handlers on purpose: React routes range `onChange` to the DOM
        // `input` event (fires on every move of a drag), and `onInput` is the
        // explicit belt-and-braces so real-time never depends on that mapping.
        onChange={(e) => apply(e.target.value)}
        onInput={(e) => apply((e.target as HTMLInputElement).value)}
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          margin: 0,
          accentColor: "#6f8fe0",
          cursor: "pointer",
          // a horizontal drag on the thumb must not be stolen as a page gesture
          touchAction: "none",
        }}
      />
    </div>
  );
}

/**
 * Pure presentational cluster — no store, no portal. Exported so it renders in
 * a non-DOM (node / SSR) test env, where every piece of state is a prop.
 */
export function AudioToggleView({
  bgmMuted,
  sfxMuted,
  onToggle,
  cells = [],
  expanded = false,
  onToggleExpanded,
  onCollapse,
  topPx = MENU_TOP,
  rightPx = HUD_EDGE,
  heightPx = AUDIO_BTN_SIZE,
  groupRef,
}: {
  bgmMuted: boolean;
  sfxMuted: boolean;
  onToggle: (bus: AudioBus) => void;
  /** tray controls; rendered only while `expanded` */
  cells?: readonly AudioTrayCell[];
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onCollapse?: () => void;
  topPx?: number;
  rightPx?: number;
  heightPx?: number;
  /**
   * Handle on the PERSISTENT button group — the box `ui/chromeReserve`
   * measures and publishes so every screen's top-right chrome can reserve it.
   */
  groupRef?: React.Ref<HTMLDivElement>;
}): React.JSX.Element {
  const open = expanded && cells.length > 0;
  // The tray may never wrap to a second row (that would leave the declared HUD
  // band); on a viewport too narrow for it, it scrolls sideways instead.
  const trayMaxWidth =
    `calc(100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)` +
    ` - ${rightPx + audioButtonsWidth(AUDIO_CLUSTER_BUTTONS) + AUDIO_TRAY_GAP}px)`;

  return (
    <div
      data-ggd-audio-toggle=""
      data-expanded={open}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) onCollapse?.();
      }}
      style={{
        position: "fixed",
        top: `calc(env(safe-area-inset-top, 0px) + ${topPx}px)`,
        right: `calc(env(safe-area-inset-right, 0px) + ${rightPx}px)`,
        zIndex: Z_TOP,
        height: heightPx,
        display: "flex",
        alignItems: "center",
        gap: AUDIO_BTN_GAP,
        pointerEvents: "none",
      }}
    >
      {open && (
        <div
          id="ggd-audio-tray"
          data-ggd-audio-tray=""
          role="group"
          aria-label="Volume and cursor size"
          style={{
            pointerEvents: "auto",
            display: "flex",
            alignItems: "stretch",
            gap: AUDIO_CELL_GAP,
            height: "100%",
            boxSizing: "border-box",
            padding: AUDIO_TRAY_PAD,
            border: `${AUDIO_TRAY_BORDER}px solid rgba(120, 140, 190, 0.25)`,
            borderRadius: 10,
            // Denser than the shared PANEL_BG: this floats over the login
            // artwork and the arena, and 10px labels need the contrast.
            background: "rgba(8, 11, 19, 0.94)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            maxWidth: trayMaxWidth,
            overflowX: "auto",
            overflowY: "hidden",
          }}
        >
          {cells.map((cell) => (
            <TrayCell key={cell.id} cell={cell} />
          ))}
        </div>
      )}
      {/* THE PUBLISHED RECT (task #107). The buttons are wrapped in their own
          group so the measured box is the PERSISTENT chrome only — the tray
          above is a transient popover, and reserving room for it would reflow
          every screen's header the instant a player tapped 🎚. Its gap equals
          AUDIO_TRAY_GAP, so this wrapper is layout-identical to the flat row
          it replaced. `ui/chromeReserve` observes it and writes
          --ggd-chrome-top-right-w/-h onto :root. */}
      <div
        ref={groupRef}
        data-ggd-chrome="top-right"
        style={{
          display: "flex",
          alignItems: "center",
          gap: AUDIO_BTN_GAP,
          pointerEvents: "none",
        }}
      >
        <button
          type="button"
          className="ggd-tap"
          data-ggd-audio-expand=""
          aria-expanded={open}
          aria-controls="ggd-audio-tray"
          aria-label={open ? "Hide volume and cursor size" : "Show volume and cursor size"}
          title={open ? "hide the sliders" : "volume + cursor size"}
          {...clusterBtnProps(() => onToggleExpanded?.())}
          style={{
            ...BTN_BASE,
            background: open ? "rgba(44, 63, 107, 0.86)" : "rgba(12, 16, 26, 0.62)",
            color: open ? "#cfe0ff" : "#aeb8cc",
            opacity: 0.9,
          }}
        >
          <span aria-hidden="true">🎚</span>
        </button>
        <BusButton bus="bgm" muted={bgmMuted} icon="🎵" label="Music" onToggle={onToggle} />
        <BusButton bus="sfx" muted={sfxMuted} icon="🔊" label="Sound effects" onToggle={onToggle} />
      </div>
    </div>
  );
}

/** Percent formatter shared by the three volume cells. */
function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/**
 * PURE: the tray's control list. Split out of the component so the wiring —
 * which bus each slider drives, which ladder the cursor cell walks — is
 * assertable in a node test instead of only through a rendered DOM.
 *
 * The cursor cell walks `CURSOR_SIZE_OPTIONS` by INDEX (a 4-step range input)
 * rather than owning a size: the ladder, its labels and its pixel sizes all
 * come from the shared `../cursor` module, so adding an "xxl" step there shows
 * up here with no edit.
 */
export function buildAudioTrayCells(opts: {
  master: number;
  bgm: number;
  sfx: number;
  /** index into CURSOR_SIZE_OPTIONS */
  cursorIndex: number;
  /** false on a device with no fine pointer — the cursor cell is dropped */
  showCursor: boolean;
  onVolume: (bus: "master" | "bgm" | "sfx", v: number) => void;
  onCursorIndex: (index: number) => void;
}): AudioTrayCell[] {
  const vol = (
    id: "master" | "bgm" | "sfx",
    label: string,
    ariaLabel: string,
    value: number,
    icon?: string,
  ): AudioTrayCell => ({
    id,
    label,
    ariaLabel,
    icon,
    value,
    min: 0,
    max: 1,
    step: 0.05,
    display: pct(value),
    onInput: (v) => opts.onVolume(id, v),
  });

  const cells: AudioTrayCell[] = [
    vol("master", "Master", "Master volume", opts.master),
    vol("bgm", "Music", "Music volume", opts.bgm, "🎵"),
    vol("sfx", "SFX", "Sound effects volume", opts.sfx, "🔊"),
  ];
  if (opts.showCursor) {
    const last = CURSOR_SIZE_OPTIONS.length - 1;
    const index = Math.min(last, Math.max(0, Math.round(opts.cursorIndex)));
    cells.push({
      id: "cursor",
      label: "Cursor",
      ariaLabel: "Cursor size",
      icon: "🖱",
      value: index,
      min: 0,
      max: last,
      step: 1,
      display: CURSOR_SIZE_OPTIONS[index]?.label ?? "",
      onInput: (i) => opts.onCursorIndex(Math.min(last, Math.max(0, Math.round(i)))),
    });
  }
  return cells;
}

/**
 * Does this device have a real pointer? Mirrors the media query cursor.css is
 * gated on, so the cursor-size cell is offered exactly when it can do anything.
 * Read at render time (like `hudTouch()`): pointer capability does not change
 * mid-session, and a hybrid device reports fine as soon as a mouse is attached.
 */
function finePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  try {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch {
    return true;
  }
}

export function AudioToggle(): React.JSX.Element {
  const vol = useAudioVolumes();
  // `{ size, setSize, options }` straight from the cursor module's own React
  // adapter — this component reads and writes the setting, it never owns it.
  const cursor = useCursorSize();
  const [expanded, setExpanded] = useState(false);
  // In a match the top-right corner is a declared stack (ui/hud/hudLayout):
  // take the offset AND the reserved height of our slot instead of guessing
  // what sits above us. On menu screens there is no HUD, so it hugs the corner.
  const inMatch = useApp((s) => s.screen === "match");
  const touch = hudTouch();
  const matchTop = hudSlotOffset("audio-toggle", touch);
  const bandHeight = hudSlotHeight("audio-toggle", touch);

  // ⚠️ GH#113: the unlock + `playSfx("uiToggle")` that used to be inline here
  // moved into `clusterBtnProps` (i.e. into the shared `buttonSfx`), so all
  // THREE buttons get the same cue — and the same hover. Doing it here made the
  // sound a property of "the mute action" rather than of "a button in this
  // cluster", which is exactly why the 🎚 disclosure never made a sound.
  const onToggle = (bus: AudioBus): void => {
    audioSettings.toggleBusMuted(bus);
  };

  const setVolume = (bus: "master" | "bgm" | "sfx", v: number): void => {
    // A drag is a user gesture too, so the very first one also starts audio —
    // but only once: unlock() restarts nothing, yet re-running it per input
    // event would resume the context dozens of times a second for nothing.
    if (!audioSystem.isUnlocked) audioSystem.unlock();
    audioSystem.setVolume(bus, v); // → audioSettings → live bus gain, this frame
  };

  // PUBLISH the box this cluster occupies (task #107, ui/chromeReserve), so
  // every screen that draws its OWN top-right chrome can reserve exactly the
  // gutter we really use — measured, never a constant, so a cluster that gains
  // or loses a button cannot silently start covering a header again.
  // Re-runs when `inMatch`/`touch` change the cluster's top offset: that moves
  // it without resizing it, which a ResizeObserver alone would never report.
  const groupRef = useRef<HTMLDivElement | null>(null);
  useEffect(
    () => observeChromeReserve(groupRef.current, browserChromeEnv()),
    [inMatch, touch, matchTop, bandHeight],
  );

  const cursorIndex = Math.max(
    0,
    cursor.options.findIndex((o) => o.value === cursor.size),
  );
  const showCursor = finePointer();

  const cells = useMemo<AudioTrayCell[]>(
    () =>
      buildAudioTrayCells({
        master: vol.master,
        bgm: vol.bgm,
        sfx: vol.sfx,
        cursorIndex,
        showCursor,
        onVolume: setVolume,
        onCursorIndex: (i) => {
          const opt = cursor.options[i];
          if (opt) cursor.setSize(opt.value); // persists + applies instantly
        },
      }),
    // `setVolume` / `onCursorIndex` only touch module singletons, so the cell
    // list is a pure function of the values shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vol.master, vol.bgm, vol.sfx, cursorIndex, showCursor],
  );

  const view = (
    <AudioToggleView
      bgmMuted={!!vol.bgmMuted}
      sfxMuted={!!vol.sfxMuted}
      onToggle={onToggle}
      cells={cells}
      expanded={expanded}
      onToggleExpanded={() => setExpanded((v) => !v)}
      onCollapse={() => setExpanded(false)}
      topPx={inMatch ? matchTop : MENU_TOP}
      heightPx={inMatch ? bandHeight : AUDIO_BTN_SIZE}
      groupRef={groupRef}
    />
  );

  // Portal to <body> so we sit above #hud-root and MatchOverlay on every
  // screen. In a non-DOM env (tests / SSR) fall back to inline rendering.
  if (typeof document !== "undefined" && document.body) {
    return createPortal(view, document.body);
  }
  return view;
}

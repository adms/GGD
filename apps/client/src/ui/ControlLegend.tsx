/**
 * ControlLegend — the semi-transparent 操作說明 shown BESIDE the arena during
 * the first combat round, for the input the player is actually holding.
 *
 * The reason it exists is a first evening: four people who have never played
 * sit down with pads and a keyboard, and round 1 is otherwise spent asking the
 * owner which button is which. It is a reference card, not a tutorial and not
 * a modal — it must be readable at a glance and completely ignorable.
 *
 * EVERYTHING INTERESTING IS IN `ui/controlLegendModel.ts` — the rows are derived
 * from the real key maps (the pad rows by RUNNING `mapGamepadFrame`), the
 * rectangle is derived from the `hud/hudLayout` registry, and the round-1 gate
 * is a pure predicate. This file only paints them and owns the two pieces of
 * React state that cannot be pure: the viewport size and the dismissal.
 *
 * THREE RULES IT MUST NOT BREAK
 *   1. NEVER COVERS THE HUD (#107). The rect comes from the registry's own
 *      stack ends and slot widths, `controlLegendModel.test.ts` proves it touches
 *      no slot on any guard viewport, and the whole thing yields the moment a
 *      corner-covering panel opens — chrome always yields, panels never move.
 *   2. NEVER EATS A CLICK. The layer is `pointerEvents: "none"`; only the ✕
 *      opts back in. A misclick during a fight because a hint box was in the
 *      way would be worse than the confusion it exists to remove.
 *   3. CALM. Low-contrast, blurred, no animation, no sound on appear. It sits
 *      still while the fight happens in front of it.
 */
import { useEffect, useState } from "react";
import { useHud } from "../net/RoomStore";
import {
  controlLegendRect,
  controlLegendVisible,
  legendRows,
  readLegendDismissed,
  writeLegendDismissed,
  type LegendRect,
  type LegendRow,
} from "./controlLegendModel";
import { hudTouch } from "./hud/HudSlot";
import { HUD_Z } from "./hud/hudLayout";
import { useActiveHudPanels } from "./hud/useHudPanels";
import { attachInputModeDetection, INPUT_MODE_LABEL, useInputMode } from "./inputMode";
import { SfxButton } from "./SfxButton";
import { TEXT_DIM, TEXT_MAIN } from "./theme";

/** Deliberately lighter than PANEL_BG (0.88): this is a hint, not a panel. */
const LEGEND_BG = "rgba(10, 14, 24, 0.44)";
const LEGEND_BORDER = "1px solid rgba(120, 140, 190, 0.22)";
/** The key-cap chip: readable, but never brighter than the ability bar. */
const CHIP_BG = "rgba(30, 40, 64, 0.55)";
const CHIP_BORDER = "1px solid rgba(130, 152, 205, 0.3)";

function useViewport(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height: typeof window === "undefined" ? 800 : window.innerHeight,
  }));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = (): void => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

function Chip({ text }: { text: string }): React.JSX.Element {
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: 20,
        padding: "1px 6px",
        borderRadius: 5,
        background: CHIP_BG,
        border: CHIP_BORDER,
        color: TEXT_MAIN,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: "16px",
        textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function Header({
  modeLabel,
  onDismiss,
  inline,
}: {
  modeLabel: string;
  onDismiss: () => void;
  inline: boolean;
}): React.JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: inline ? 0 : 5,
        flex: inline ? "0 0 auto" : undefined,
      }}
    >
      <span style={{ fontSize: 11, color: TEXT_MAIN, fontWeight: 700, whiteSpace: "nowrap" }}>
        操作說明
      </span>
      <span style={{ fontSize: 10, color: TEXT_DIM, whiteSpace: "nowrap" }}>{modeLabel}</span>
      {/* the ONE interactive pixel on this layer */}
      <SfxButton
        onClick={onDismiss}
        kind="ghost"
        sfxVolume={0.35}
        title="不再顯示操作說明"
        aria-label="關閉操作說明"
        style={{
          marginLeft: inline ? 2 : "auto",
          pointerEvents: "auto",
          width: 20,
          height: 20,
          padding: 0,
          lineHeight: "18px",
          borderRadius: 5,
          background: "transparent",
          border: CHIP_BORDER,
          color: TEXT_DIM,
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        ✕
      </SfxButton>
    </div>
  );
}

function Column({
  rect,
  rows,
  modeLabel,
  onDismiss,
}: {
  rect: LegendRect;
  rows: LegendRow[];
  modeLabel: string;
  onDismiss: () => void;
}): React.JSX.Element {
  return (
    <div
      data-control-legend="column"
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        maxHeight: rect.h,
        zIndex: HUD_Z.slot,
        boxSizing: "border-box",
        padding: "7px 9px",
        background: LEGEND_BG,
        border: LEGEND_BORDER,
        borderRadius: 9,
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <Header modeLabel={modeLabel} onDismiss={onDismiss} inline={false} />
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {rows.map((row) => (
          <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ flex: "0 0 62px", textAlign: "right" }}>
              <Chip text={row.control} />
            </span>
            <span
              style={{
                flex: 1,
                fontSize: 11,
                color: TEXT_DIM,
                lineHeight: "16px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {row.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Strip({
  rect,
  rows,
  modeLabel,
  onDismiss,
}: {
  rect: LegendRect;
  rows: LegendRow[];
  modeLabel: string;
  onDismiss: () => void;
}): React.JSX.Element {
  return (
    <div
      data-control-legend="strip"
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: HUD_Z.slot,
        boxSizing: "border-box",
        padding: "5px 8px",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        background: LEGEND_BG,
        border: LEGEND_BORDER,
        borderRadius: 9,
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <Header modeLabel={modeLabel} onDismiss={onDismiss} inline />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 8px", alignContent: "flex-start" }}>
        {rows.map((row) => (
          <span key={row.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Chip text={row.control} />
            <span style={{ fontSize: 10.5, color: TEXT_DIM, lineHeight: "16px", whiteSpace: "nowrap" }}>
              {row.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function ControlLegend(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const round = useHud((s) => s.round);
  const couchPlayers = useHud((s) => s.localPlayers.length);
  // #107: a corner-covering panel (the shop for a defeated player) owns its
  // edge outright, and this box is chrome — so it vacates rather than fights.
  const panels = useActiveHudPanels();
  const [dismissed, setDismissed] = useState(readLegendDismissed);
  const viewport = useViewport();
  const mode = useInputMode();

  const visible = controlLegendVisible({
    phase,
    round,
    dismissed,
    panelCovering: panels.length > 0,
  });

  // Device sniffing runs ONLY while the legend is up — nothing else in the
  // client needs the answer, and a 250ms poll for the whole match to feed a
  // box that is not on screen would be pure cost.
  useEffect(() => {
    if (!visible) return;
    return attachInputModeDetection();
  }, [visible]);

  if (!visible) return null;
  const rows = legendRows(mode);
  // rowCount sizes the strip: the touch set is 5 rows, the pad set is 13, and
  // one shared height would either waste a third of a phone screen or clip the
  // pad's last row (天生技 — the binding nobody guesses).
  const rect = controlLegendRect(viewport, { touch: hudTouch(), couchPlayers, rowCount: rows.length });
  // null = this viewport genuinely has no free room. Showing nothing is the
  // correct answer; overlapping the HUD is not.
  if (!rect) return null;

  const onDismiss = (): void => {
    writeLegendDismissed(true);
    setDismissed(true);
  };
  const modeLabel = INPUT_MODE_LABEL[mode];

  return rect.shape === "column" ? (
    <Column rect={rect} rows={rows} modeLabel={modeLabel} onDismiss={onDismiss} />
  ) : (
    <Strip rect={rect} rows={rows} modeLabel={modeLabel} onDismiss={onDismiss} />
  );
}

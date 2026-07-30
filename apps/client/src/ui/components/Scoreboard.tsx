/**
 * Scoreboard — K/D per seat (client-tallied from death events), by team.
 * Top-right corner stack, slot 1 (under the Leave button) — ui/hud/hudLayout.
 *
 * ── WHY THE LIST IS NOT INSIDE THE SLOT ANY MORE (owner, 2026-07-30) ────────
 * 「scoreboard 展開會被音量設定擋到」.
 *
 * The slot reserves 26px (44 on touch); the expanded K/D list is ~300px tall.
 * As flow content inside the slot div it grew straight DOWN the top-right
 * column, through `audio-toggle` (78→122 on a desktop) and on through
 * `settings` and `cheats`. And the audio cluster is declared `portal: true` —
 * <body>-portaled at z 2147483000, DECLARED to ride above every panel and never
 * to yield — so no z-index here could ever have won. The list had to leave the
 * column, not out-rank it.
 *
 * So the button keeps its slot and the DRAWER is a declared #107 SURFACE
 * (`scoreboard-list` in ui/hud/hudSurfaces): it opens INWARD, its far edge one
 * gap short of the widest slot the corner paints, its top on a ladder — aligned
 * with this button where there is room, and lower down where a 812×375 phone's
 * centred phase cluster splits the only free interval. `null` means there is no
 * honest room and the drawer simply does not open.
 *
 * The drawer is split into a PURE view ({@link ScoreboardDrawer}) so
 * `hud/hudSurfacePaint.test.ts` can render it under `react-dom/server` and read
 * its real `top` / `left` / `width` / `max-height` back — a source scan for
 * `hudSurfaceStyle("scoreboard-list"` is satisfied by a file that spreads the
 * registry style and then pins its own coordinates one line later (failure ⑥).
 *
 * ⚠️ Rendering the VIEW is not enough either: {@link Scoreboard} chooses what
 * `rect` the view gets, so `rect={{ ...drawer, y: 120 }}` here would be
 * invisible to it (failure ⑤). Since 2026-07-30 the same guard also mounts THIS
 * component — see the `defaultOpen` seam below.
 */
import { useState } from "react";
import { useHud } from "../../net/RoomStore";
import { championIconUrl } from "../icons";
import { IconImg } from "./IconImg";
import { SfxButton } from "../SfxButton";
import { hudTouch } from "../hud/HudSlot";
import type { HudRect } from "../hud/hudLayout";
import { HUD_Z, hudSlotHeight, hudSlotStyle } from "../hud/hudLayout";
import { hudSurfaceStyle } from "../hud/hudSurfaces";
import { useHudSurface } from "../hud/useHudSurface";
import { PANEL_BG, PANEL_BORDER, teamCss, TEXT_DIM, TEXT_MAIN } from "../theme";

/** The subset of a `SeatView` one K/D row needs. */
export interface ScoreboardSeatRow {
  seatId: number;
  teamId: number;
  displayName: string;
  driver: string;
  championId: string;
  level: number;
}

/**
 * The expanded K/D list, as a pure function of its data and its resolved rect.
 *
 * ⚠️ EVERY coordinate comes from `hudSurfaceStyle`. A `top` / `left` /
 * `transform` added below the spread silently re-creates the reported bug, and
 * `hud/hudSurfacePaint.test.ts` reads the rendered style back to prove none was.
 */
export function ScoreboardDrawer({
  seats,
  kills,
  deaths,
  localSeatId,
  rect,
}: {
  seats: readonly ScoreboardSeatRow[];
  kills: Record<number, number>;
  deaths: Record<number, number>;
  localSeatId: number | null;
  rect: HudRect;
}): React.JSX.Element {
  return (
    <div
      data-hud-surface="scoreboard-list"
      style={{
        // placement from the #107 surface registry — never a number here
        ...hudSurfaceStyle("scoreboard-list", rect),
        boxSizing: "border-box",
        overflowY: "auto",
        pointerEvents: "auto",
        padding: 8,
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 8,
        fontSize: 11,
        color: TEXT_MAIN,
      }}
    >
      {seats.map((seat) => (
        <div
          key={seat.seatId}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            padding: "2px 4px",
            background: seat.seatId === localSeatId ? "rgba(80,100,160,0.25)" : "transparent",
            borderRadius: 3,
          }}
        >
          <span style={{ color: teamCss(seat.teamId), width: 90, overflow: "hidden", whiteSpace: "nowrap" }}>
            {seat.displayName || `Seat ${seat.seatId}`}
            {seat.driver === "ai" ? " (AI)" : ""}
          </span>
          <span style={{ color: TEXT_DIM, display: "inline-flex", alignItems: "center", gap: 4 }}>
            {/* champion portrait — icon-less heroes keep the id text alone */}
            <IconImg src={championIconUrl(seat.championId)} size={14} alt="" />
            {seat.championId || "—"}
          </span>
          <span>
            {kills[seat.seatId] ?? 0}/{deaths[seat.seatId] ?? 0}
          </span>
          <span style={{ color: TEXT_DIM }}>Lv{seat.level}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * `defaultOpen` is the UNCONTROLLED-COMPONENT seam, and it exists for a reason
 * that is not cosmetic: the drawer is behind a click, this package's vitest runs
 * `environment: "node"` (no DOM, nothing to click), and without a way to open it
 * the SHIPPED component is unreachable from any guard — only the pure
 * {@link ScoreboardDrawer} could be rendered, which is failure shape ⑤
 * (「被測的不是出貨的那個」). HudRoot mounts `<Scoreboard />` and gets `false`;
 * `hud/hudSurfacePaint.test.ts` mounts it with `true` and reads the drawer's
 * real coordinates back off the markup THIS function produced.
 *
 * ⚠️ AND THE SEAM ALONE IS NOT ENOUGH. A guard that opens the drawer this way
 * proves its PLACEMENT and says nothing about whether HudRoot mounts the
 * component at all — measured 2026-07-30 (mutation M12): replacing HudRoot's
 * `{!couch && <Scoreboard />}` with `{false && …}` deleted the button, the
 * drawer and the whole of owner report ② with 140 files / 1920 `src/ui` tests
 * green (failure shape ③). The same guard now also renders HudRoot at `combat`
 * and requires the `data-hud-slot="scoreboard"` button below to be in its tree.
 */
export function Scoreboard({ defaultOpen = false }: { defaultOpen?: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const seats = useHud((s) => s.seats);
  const kills = useHud((s) => s.kills);
  const deaths = useHud((s) => s.deaths);
  const localSeatId = useHud((s) => s.localSeatId);
  const touch = hudTouch();
  const drawer = useHudSurface("scoreboard-list");

  return (
    <>
      <div
        data-hud-slot="scoreboard"
        style={{ ...hudSlotStyle("scoreboard", touch, HUD_Z.slot), pointerEvents: "auto" }}
      >
        <SfxButton
          onClick={() => setOpen((v) => !v)}
          sfxVolume={0.6}
          // A drawer that cannot be placed must not advertise itself as
          // openable — pressing a dead button is worse than a missing one.
          disabled={!drawer}
          style={{
            minHeight: hudSlotHeight("scoreboard", touch),
            padding: "5px 10px",
            background: PANEL_BG,
            border: PANEL_BORDER,
            borderRadius: 6,
            color: TEXT_MAIN,
            fontSize: 11,
            cursor: drawer ? "pointer" : "default",
            opacity: drawer ? 1 : 0.5,
          }}
        >
          {open && drawer ? "Hide" : "Scoreboard"}
        </SfxButton>
      </div>
      {open && drawer && (
        <ScoreboardDrawer
          seats={seats}
          kills={kills}
          deaths={deaths}
          localSeatId={localSeatId}
          rect={drawer}
        />
      )}
    </>
  );
}

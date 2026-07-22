/**
 * TeamLivesBar — shared lives for all 4 teams (PairedDuels). Lives in the
 * top-left corner stack (slot 1, under the ☰ menu) — see ui/hud/hudLayout.
 */
import { useHud } from "../../net/RoomStore";
import { hudTouch } from "../hud/HudSlot";
import { hudSlotHeight, hudSlotStyle } from "../hud/hudLayout";
import { useHudSlotHidden } from "../hud/useHudPanels";
import { PANEL_BG, PANEL_BORDER, teamCss, TEXT_DIM } from "../theme";

export function TeamLivesBar(): React.JSX.Element | null {
  const teams = useHud((s) => s.teams);
  const localTeamId = useHud((s) => {
    if (s.localSeatId === null) return null;
    return s.seats.find((v) => v.seatId === s.localSeatId)?.teamId ?? null;
  });
  const touch = hudTouch();
  // hides while a left-docked shop covers the top-left corner (task #107)
  const covered = useHudSlotHidden("team-lives", touch);
  if (teams.length === 0 || covered) return null;
  return (
    <div
      data-hud-slot="team-lives"
      style={{
        ...hudSlotStyle("team-lives", touch),
        boxSizing: "border-box",
        minHeight: hudSlotHeight("team-lives", touch),
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 12px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 8,
      }}
    >
      {teams.map((t) => (
        <div key={t.teamId} style={{ textAlign: "center", opacity: t.eliminated ? 0.45 : 1 }}>
          <div style={{ fontSize: 10, color: teamCss(t.teamId), fontWeight: t.teamId === localTeamId ? "bold" : "normal" }}>
            T{t.teamId + 1}
            {t.teamId === localTeamId ? " ★" : ""}
          </div>
          <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 2 }}>
            {Array.from({ length: Math.max(t.lives, 0) }, (_, i) => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: 4, background: teamCss(t.teamId) }} />
            ))}
            {t.eliminated && <span style={{ fontSize: 9, color: TEXT_DIM }}>#{t.placement || "-"}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * TeamLivesBar — shared team health for all 4 teams (PairedDuels). Top-left
 * corner stack, slot 1 under the ☰ menu — see ui/hud/hudLayout.
 *
 * WHY A NUMBER, AND WHY NOT DURING COMBAT.
 *
 * This drew one pip per point. That was legible under the old 8-life rule and
 * became unreadable the moment #118 adopted LoL Arena's 20-point team health:
 * four teams × up to 20 dots is EIGHTY circles in a HUD corner, and the owner
 * called it exactly that — 「那麼多圈圈也很難看懂」. A count you have to count is
 * not a readout.
 *
 * He also said it does not belong in combat at all — 「團隊的生命在戰鬥畫面沒有
 * 意義」 — and he is right about when the number matters: team health only moves
 * at round settlement, and what you act on mid-fight is the enemy trio's HP,
 * not a standings tally that cannot change until the round ends. So it shows
 * everywhere the number can actually change or be read (intermission, shop,
 * settlement) and stays out of the way while you are fighting.
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
  const phase = useHud((s) => s.phase);
  const touch = hudTouch();
  // hides while a left-docked shop covers the top-left corner (task #107)
  const covered = useHudSlotHidden("team-lives", touch);
  // Not during combat: the number cannot move until the round settles, and the
  // corner is better spent on what the player acts on.
  if (teams.length === 0 || covered || phase === "combat") return null;
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
          <div style={{ display: "flex", gap: 3, alignItems: "baseline", justifyContent: "center", marginTop: 1 }}>
            <span
              style={{
                fontSize: 15,
                fontWeight: "bold",
                lineHeight: 1,
                color: teamCss(t.teamId),
                // digits in four columns must not jitter as they change width
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {Math.max(t.lives, 0)}
            </span>
            {t.eliminated && <span style={{ fontSize: 9, color: TEXT_DIM }}>#{t.placement || "-"}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

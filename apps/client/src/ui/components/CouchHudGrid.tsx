/**
 * CouchHudGrid — split-screen per-player mini-HUD. One cell per local player,
 * positioned over that player's viewport (same rect math as the Babylon
 * cameras): hp/mana bars, QWER cooldown chips, gold + level, player badge.
 * With 3 players the empty bottom-right quadrant shows a mini scoreboard.
 */
import { TICK_HZ } from "@ggd/shared/constants";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import type { CoreAbilitySlot } from "@ggd/shared/sim/intents";
import { useHud, type LocalPlayerView, type SeatView } from "../../net/RoomStore";
import { cssRects, emptyQuadrantCss, type CssRect } from "../../render/viewportRects";
import { playerBadge } from "../platform/couch";
import { GOLD, PANEL_BG, PANEL_BORDER, teamCss, TEXT_DIM, TEXT_MAIN } from "../theme";

const SLOTS: CoreAbilitySlot[] = ["Q", "W", "E", "R"];

function Bar({ pct, color, height = 7 }: { pct: number; color: string; height?: number }): React.JSX.Element {
  return (
    <div style={{ height, borderRadius: 3, background: "#10141f", overflow: "hidden", marginTop: 2 }}>
      <div style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%`, height: "100%", background: color }} />
    </div>
  );
}

function PlayerCell({ lp, seat, rect }: { lp: LocalPlayerView; seat: SeatView | null; rect: CssRect }): React.JSX.Element {
  const def = seat?.championId ? Champions.tryGet(seat.championId as ChampionId) : null;
  return (
    <div
      style={{
        position: "absolute",
        left: `${rect.left}%`,
        top: `${rect.top}%`,
        width: `${rect.w}%`,
        height: `${rect.h}%`,
        pointerEvents: "none",
        border: "1px solid rgba(60, 72, 100, 0.55)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 8,
          transform: "translateX(-50%)",
          minWidth: 210,
          padding: "6px 10px",
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 8,
          fontSize: 11,
          color: TEXT_MAIN,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontWeight: 700,
              color: teamCss(lp.teamId),
              border: `1px solid ${teamCss(lp.teamId)}`,
              borderRadius: 4,
              padding: "0 4px",
            }}
          >
            {playerBadge(lp.player)}
          </span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {lp.displayName || `Seat ${lp.seatId}`}
          </span>
          <span style={{ color: GOLD }}>{seat ? `${seat.gold}g` : ""}</span>
          <span style={{ color: TEXT_DIM }}>{seat ? `Lv${seat.level}` : ""}</span>
        </div>
        <Bar pct={lp.maxHp > 0 ? lp.hp / lp.maxHp : 0} color="#4caf6d" />
        <Bar pct={lp.maxMana > 0 ? lp.mana / lp.maxMana : 0} color="#4f74d9" height={5} />
        <div style={{ display: "flex", gap: 4, marginTop: 4, justifyContent: "center" }}>
          {SLOTS.map((slot, i) => {
            const rank = seat?.abilityRanks[i] ?? 0;
            const cdSecs = (seat?.cooldowns[i] ?? 0) / TICK_HZ;
            const onCd = rank > 0 && cdSecs > 0;
            return (
              <div
                key={slot}
                title={def ? def.abilities[slot].name : slot}
                style={{
                  width: 24,
                  height: 20,
                  borderRadius: 4,
                  textAlign: "center",
                  lineHeight: "20px",
                  fontSize: 10,
                  fontWeight: 700,
                  background: rank > 0 ? (onCd ? "#161b26" : "#243252") : "#12151d",
                  border: `1px solid ${rank > 0 ? "#51649b" : "#2a3040"}`,
                  color: onCd ? TEXT_DIM : rank > 0 ? TEXT_MAIN : "#3a4256",
                }}
              >
                {onCd ? Math.ceil(cdSecs) : slot}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Mini scoreboard for the empty quadrant of a 3-player couch. */
function QuadScoreboard({ rect }: { rect: CssRect }): React.JSX.Element {
  const teams = useHud((s) => s.teams);
  const kills = useHud((s) => s.kills);
  const seats = useHud((s) => s.seats);
  const killsOfTeam = (teamId: number): number =>
    seats.filter((s) => s.teamId === teamId).reduce((sum, s) => sum + (kills[s.seatId] ?? 0), 0);
  return (
    <div
      style={{
        position: "absolute",
        left: `${rect.left}%`,
        top: `${rect.top}%`,
        width: `${rect.w}%`,
        height: `${rect.h}%`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          minWidth: 200,
          padding: "10px 14px",
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 10,
          fontSize: 12,
          color: TEXT_MAIN,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6, color: TEXT_DIM }}>Scoreboard</div>
        {teams.map((t) => (
          <div key={t.teamId} style={{ display: "flex", gap: 8, marginBottom: 3 }}>
            <span style={{ color: teamCss(t.teamId), fontWeight: 700, width: 52 }}>Team {t.teamId + 1}</span>
            <span style={{ flex: 1, color: t.eliminated ? "#f08c8c" : TEXT_MAIN }}>
              {t.eliminated ? `out (#${t.placement})` : `${t.lives} ❤`}
            </span>
            <span style={{ color: TEXT_DIM }}>{killsOfTeam(t.teamId)} K</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CouchHudGrid(): React.JSX.Element | null {
  const locals = useHud((s) => s.localPlayers);
  const seats = useHud((s) => s.seats);
  if (locals.length <= 1) return null;
  const rects = cssRects(locals.length);
  const empty = emptyQuadrantCss(locals.length);
  return (
    <>
      {locals.map((lp) => {
        const rect = rects[lp.player];
        if (!rect) return null;
        const seat = seats.find((s) => s.seatId === lp.seatId) ?? null;
        return <PlayerCell key={lp.player} lp={lp} seat={seat} rect={rect} />;
      })}
      {empty && <QuadScoreboard rect={empty} />}
    </>
  );
}

/**
 * ChampSelectPanel — the champion-select takeover (task #76). A two-region
 * layout over the fixed 60 s server clock (config.match.json champSelectSec):
 *
 *   left  — the PROFILE block: a 3D stage + tabbed detail (技能/數值/玩法/故事)
 *           for the FOCUSED champion (hover previews, else the confirmed pick).
 *   right — the ROSTER: the searchable grid + 🎲 + everyone's picks, with the
 *           whitelist gate, reject banner and empty-state all preserved.
 *   over  — for the first 10 s, a SILENT rules briefing (see RulesBriefing);
 *           跳過 or any roster interaction dismisses it instantly.
 *
 * PICKS ARE LAST-WRITE-WINS (there is no lock). Hover previews without
 * committing; a click sends the normal SELECT_CHAMPION (the existing flow, incl.
 * the champion-name call-out and the confirm SFX). The phase is an
 * uninterruptible 60 s server-side; the ONLY thing skippable here is the
 * briefing, which never shortens the clock.
 *
 * SAFE AREA (#107): the panel reads the HUD layout to inset below the persistent
 * top chrome (the centred clock, the team-lives bar, the scoreboard) rather than
 * hard-coding a top offset, and leaves the corners click-through (its container
 * is pointer-events:none; only the two cards capture the pointer).
 */
import { useMemo, useReducer, useState } from "react";
import { Champions } from "@ggd/shared/sim/content/registry";
import { useHud } from "../../net/RoomStore";
import { hudActions } from "../actions";
import { iconSrc } from "../icons";
import { IconImg } from "../components/IconImg";
import { SfxButton } from "../SfxButton";
import { isTouchDevice, readTouchEnv } from "../../input/mobileDetect";
import { hudSlotBand } from "../hud/hudLayout";
import { GOLD, PANEL_BG, PANEL_BORDER, teamCss, TEXT_DIM, TEXT_MAIN } from "../theme";
import {
  applyChampionWhitelist,
  filterChampions,
  pickRandomId,
  whitelistedChampionIds,
  type RosterChampion,
} from "./champSelectFilter";
import { useWhitelist } from "./whitelist";
import { ChampionProfile } from "./champselect/ProfileBlock";
import { RulesBriefing } from "./champselect/RulesBriefing";
import { observeBriefing, dismissCurrentBriefing } from "./champselect/briefingGate";
import { champSelectStage, profileSubjectId } from "./champselect/championProfile";

/** inline <code> chip used by the whitelist empty-state instructions */
const CODE: React.CSSProperties = {
  background: "#0f1420",
  border: "1px solid #2c3448",
  borderRadius: 4,
  padding: "1px 5px",
  fontSize: "0.92em",
  whiteSpace: "nowrap",
};

export function ChampSelectPanel(): React.JSX.Element {
  const seats = useHud((s) => s.seats);
  const localSeatId = useHud((s) => s.localSeatId);
  const couch = useHud((s) => s.localPlayers.length > 1);
  const lastReject = useHud((s) => s.lastReject);
  const phase = useHud((s) => s.phase);
  const secondsLeft = useHud((s) => s.phaseSecondsLeft);
  const matchId = useHud((s) => s.matchId);
  const myPick = seats.find((s) => s.seatId === localSeatId)?.championId ?? "";

  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  // operator content whitelist for this match (fetched once; NO_FILTER offline)
  const { whitelist, loading: wlLoading } = useWhitelist();

  // registry contents are static after boot; snapshot once (roster is ~93)
  const roster = useMemo<RosterChampion[]>(
    () =>
      Champions.all().map((c) => {
        const entry: RosterChampion = { id: c.id, name: c.name, role: c.role, tags: c.tags };
        if (c.icon !== undefined) entry.icon = c.icon; // w3x icon (optional)
        return entry;
      }),
    [],
  );
  const available = useMemo(() => applyChampionWhitelist(roster, whitelist), [roster, whitelist]);
  const shown = useMemo(() => filterChampions(available, query), [available, query]);
  const rosterEmpty = whitelist.enforced && available.length === 0;

  // The rules briefing: self-calibrating gate (survives a remount within the
  // match). Observing here is idempotent + monotonic, so calling it in render is
  // safe; a dismiss forces one re-render to hide the overlay.
  const briefingActive = observeBriefing({ phase, secondsLeft, matchId });
  const dismissBriefing = (): void => {
    dismissCurrentBriefing();
    forceRender();
  };

  const stage = champSelectStage({ briefingActive, localPick: myPick, secondsLeft });

  // the champion the profile is looking at (hover previews, else the pick)
  const subjectId = profileSubjectId(hoveredId, myPick || null);

  // Hover is STICKY: the last-previewed champion stays on the stage until
  // another is hovered or the pick changes (like LoL). Not clearing on
  // mouse-leave keeps the 3D stage from flickering to the empty prompt — and its
  // Babylon engine from churning — as the cursor crosses the grid.
  const focus = (id: string): void => {
    setHoveredId(id);
    dismissBriefing(); // first roster interaction skips the briefing
  };
  const commit = (id: string): void => {
    dismissBriefing();
    hudActions.selectChampion(id); // normal SELECT_CHAMPION (+ name call-out, confirm SFX)
  };

  const pickRandom = (): void => {
    dismissBriefing();
    const id = pickRandomId(whitelistedChampionIds(Champions.ids(), whitelist));
    if (id) hudActions.selectChampion(id);
  };

  // inset below the persistent top chrome instead of hard-coding a top offset
  const touch = isTouchDevice(readTouchEnv());
  const topInset =
    Math.max(hudSlotBand("team-lives", touch).end, hudSlotBand("scoreboard", touch).end, 58) + 12;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none", // corners (clock / scoreboard / audio toggle) stay clickable
        display: "flex",
        justifyContent: "center",
        alignItems: "stretch",
        boxSizing: "border-box",
        paddingTop: topInset,
        paddingBottom: 12,
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          width: "min(980px, 100%)",
          maxHeight: "100%",
          alignItems: "stretch",
        }}
      >
        {/* ── LEFT: profile block ─────────────────────────────────────────── */}
        <div
          style={{
            flex: "1 1 360px",
            minWidth: 300,
            maxHeight: "100%",
            padding: 14,
            background: PANEL_BG,
            border: PANEL_BORDER,
            borderRadius: 12,
            color: TEXT_MAIN,
            pointerEvents: "auto",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          <ChampionProfile championId={subjectId} />
        </div>

        {/* ── RIGHT: roster ───────────────────────────────────────────────── */}
        <div
          style={{
            flex: "1 1 380px",
            minWidth: 300,
            maxHeight: "100%",
            padding: 16,
            background: PANEL_BG,
            border: PANEL_BORDER,
            borderRadius: 12,
            color: TEXT_MAIN,
            pointerEvents: "auto",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: "bold" }}>Choose your champion 選擇你的英雄</div>
            {myPick && (
              <div style={{ fontSize: 11, color: TEXT_DIM }}>
                已選：<span style={{ color: TEXT_MAIN }}>{roster.find((c) => c.id === myPick)?.name ?? myPick}</span>
              </div>
            )}
          </div>

          {/* server rejected the last pick (e.g. off the whitelist) */}
          {lastReject && (
            <div
              style={{
                marginBottom: 10,
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 12,
                color: "#f6b7b3",
                background: "#3a1c1e",
                border: "1px solid #e5483f",
              }}
            >
              {lastReject === "bad-champion" ? "此英雄尚未開放，請改選其他英雄。" : `選擇被拒：${lastReject}`}
            </div>
          )}

          {/* time nearly up and still no pick → the server will auto-pick a random */}
          {stage.autoPickImminent && (
            <div
              style={{
                marginBottom: 10,
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 12,
                color: "#f2d59a",
                background: "#3a2f14",
                border: "1px solid #e0a878",
              }}
            >
              ⏰ 時間快到了 — 再不選，系統就隨機幫你抽一隻。
            </div>
          )}

          {rosterEmpty ? (
            <div
              style={{
                padding: "24px 18px",
                textAlign: "left",
                color: TEXT_DIM,
                border: "1px dashed #2c3448",
                borderRadius: 10,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8, textAlign: "center" }}>🚧</div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: "bold",
                  color: TEXT_MAIN,
                  marginBottom: 10,
                  textAlign: "center",
                }}
              >
                尚未啟用任何英雄
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.8, color: TEXT_MAIN }}>
                管理員請依序操作：
                <ol style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                  <li>
                    開啟後台 <code style={CODE}>/admin/</code>（本機開發：
                    <code style={CODE}>http://127.0.0.1:60721/admin/</code>）
                  </li>
                  <li>
                    左側選單進入 <b style={{ color: TEXT_MAIN }}>✅ 內容白名單</b>
                  </li>
                  <li>
                    按 <b style={{ color: TEXT_MAIN }}>⭐ 啟用示範組合</b>，再按{" "}
                    <b style={{ color: TEXT_MAIN }}>儲存</b>
                  </li>
                </ol>
                <div style={{ marginTop: 8 }}>
                  指令等效寫法：<code style={CODE}>make seed-demo</code>
                </div>
              </div>
              <div style={{ fontSize: 10, marginTop: 10, color: TEXT_DIM }}>
                No champions are enabled yet. An operator must enable content in the ops console
                (/admin/ → 內容白名單 → ⭐ 啟用示範組合 → 儲存), or run <code style={CODE}>make seed-demo</code>.
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search champions… 搜尋英雄"
                  aria-label="Search champions"
                  style={{
                    flex: 1,
                    minHeight: 40,
                    padding: "8px 12px",
                    fontSize: 16, // 16px stops iOS focus auto-zoom
                    borderRadius: 8,
                    background: "#0f1420",
                    border: "1px solid #2c3448",
                    color: TEXT_MAIN,
                  }}
                />
                <SfxButton
                  onClick={pickRandom}
                  title="pick a random champion"
                  style={{
                    minHeight: 40,
                    padding: "0 14px",
                    borderRadius: 8,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    background: "#2c3f6b",
                    border: "1px solid #6f8fe0",
                    color: TEXT_MAIN,
                    fontWeight: "bold",
                  }}
                >
                  🎲 隨機英雄
                </SfxButton>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  padding: 2,
                }}
              >
                {shown.map((c) => {
                  const picked = myPick === c.id;
                  const focused = subjectId === c.id;
                  return (
                    <SfxButton
                      key={c.id}
                      onClick={() => commit(c.id)}
                      onPointerEnter={() => focus(c.id)}
                      onFocus={() => focus(c.id)}
                      style={{
                        minHeight: 44,
                        padding: "8px 10px",
                        borderRadius: 8,
                        cursor: "pointer",
                        textAlign: "left",
                        background: picked ? "#2c3f6b" : focused ? "#1d2740" : "#171d2b",
                        border: picked
                          ? "2px solid #6f8fe0"
                          : focused
                            ? "1px solid #4a6099"
                            : "1px solid #2c3448",
                        color: TEXT_MAIN,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <IconImg src={iconSrc(c.icon)} size={32} alt={c.name} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: "bold" }}>{c.name}</div>
                        <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 3 }}>
                          {[c.role, ...(c.tags ?? [])].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </SfxButton>
                  );
                })}
                {shown.length === 0 && (
                  <div style={{ gridColumn: "1 / -1", fontSize: 12, color: TEXT_DIM, padding: 12 }}>
                    No champions match “{query}”.
                  </div>
                )}
              </div>

              <div style={{ marginTop: 10, fontSize: 10, color: TEXT_DIM }}>
                {shown.length} / {available.length} champions
                {wlLoading && " · 載入白名單…"}
              </div>
            </>
          )}

          {/* everyone's pick — a one-line strip */}
          <div
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: "1px solid #1b2233",
              fontSize: 11,
              color: TEXT_DIM,
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {seats.map((s) => (
              <span key={s.seatId} style={{ color: teamCss(s.teamId) }}>
                {s.displayName || `Seat ${s.seatId}`}: {s.championId || "…"}
              </span>
            ))}
          </div>
          {couch && (
            <div style={{ marginTop: 8, fontSize: 11, color: TEXT_DIM }}>
              🎮 couch play — each pad presses <b>A</b> to cycle its own champion
            </div>
          )}
        </div>
      </div>

      {/* ── the first-10-seconds rules briefing (silent, layered above) ────── */}
      {briefingActive && <RulesBriefing onDismiss={dismissBriefing} />}

      {/* a hairline hint that the clock is real and fixed */}
      <div
        style={{
          position: "absolute",
          bottom: 6,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 10,
          color: GOLD,
          opacity: 0.55,
          pointerEvents: "none",
        }}
      >
        {stage.stage === "briefing" ? "開打前 10 秒 · 逛一下就開始選人" : "隨時可改選 · 最後一次點選為準"}
      </div>
    </div>
  );
}

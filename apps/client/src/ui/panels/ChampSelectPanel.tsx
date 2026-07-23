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
 * PICKS ARE LAST-WRITE-WINS UNTIL LOCKED. Hover previews without committing; a
 * click sends the normal SELECT_CHAMPION (the existing flow, incl. the
 * champion-name call-out and the confirm SFX) and the player may keep changing
 * their mind — UNTIL they press 鎖定 (or the clock runs out). Locking (see
 * champselect/lockGate) commits the current pick and freezes it: the roster, the
 * 🎲 button and every re-pick stop landing, and a 🔒 已鎖定 badge appears. The
 * lock is CLIENT-side only for now — a crafted client and the other players'
 * view still need a server `locked` flag (a documented apps/game-server
 * follow-up). The phase is an uninterruptible 60 s server-side; the only thing
 * skippable here is the briefing, which never shortens the clock.
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
import { champSelectStage, champSelectProfileLayout, profileSubjectId } from "./champselect/championProfile";
import { useWalletMeta, sortFavouritesFirst } from "./champselect/walletMeta";
import { CrystalBadge, ChampMetaOverlay } from "./champselect/ChampMetaControls";
import { observeLock, lockCurrentPick, pickAllowed, pickToCommitOnLock } from "./champselect/lockGate";

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

  // Meta progression (task #118): crystal balance, champion unlock + favourites.
  // Degrades to `available:false` offline / when the platform is unreachable, so
  // everything below is gated on it and the base champ-select is untouched.
  const meta = useWalletMeta();
  // Favourited champions float to the TOP of the roster (order otherwise intact).
  const ordered = useMemo(
    () => (meta.available ? sortFavouritesFirst(shown, meta.favourites) : shown),
    [shown, meta.available, meta.favourites],
  );

  // The rules briefing: self-calibrating gate (survives a remount within the
  // match). Observing here is idempotent + monotonic, so calling it in render is
  // safe; a dismiss forces one re-render to hide the overlay.
  const briefingActive = observeBriefing({ phase, secondsLeft, matchId });
  const dismissBriefing = (): void => {
    dismissCurrentBriefing();
    forceRender();
  };

  const stage = champSelectStage({ briefingActive, localPick: myPick, secondsLeft });

  // CLIENT-side pick LOCK (champselect/lockGate). Observing here is idempotent +
  // monotonic (a steady clock never flips it), so calling it in render is safe;
  // it also AUTO-LOCKS when the clock hits 0 (the pick is final then, #130). An
  // explicit 鎖定 forces one re-render to reflect the frozen state.
  const locked = observeLock({ phase, secondsLeft, matchId });

  // the champion the profile is looking at (hover previews, else the pick). Once
  // locked the hover preview is dropped so the profile stays on the frozen pick.
  const subjectId = profileSubjectId(locked ? null : hoveredId, myPick || null);

  // Hover is STICKY: the last-previewed champion stays on the stage until
  // another is hovered or the pick changes (like LoL). Not clearing on
  // mouse-leave keeps the 3D stage from flickering to the empty prompt — and its
  // Babylon engine from churning — as the cursor crosses the grid.
  const focus = (id: string): void => {
    setHoveredId(id);
    dismissBriefing(); // first roster interaction skips the briefing
  };
  const commit = (id: string): void => {
    if (!pickAllowed(locked)) return; // frozen after lock — the roster can no longer switch
    dismissBriefing();
    hudActions.selectChampion(id); // normal SELECT_CHAMPION (+ name call-out, confirm SFX)
  };

  const pickRandom = (): void => {
    if (!pickAllowed(locked)) return; // 🎲 is disabled once locked
    dismissBriefing();
    const id = pickRandomId(whitelistedChampionIds(Champions.ids(), whitelist));
    if (id) hudActions.selectChampion(id);
  };

  // 鎖定 / Lock In: commit the CURRENT pick one last time, then freeze it. Guarded
  // to a non-empty pick (you cannot manually lock nothing — the timeout auto-lock
  // handles a never-picked seat, whose empty pick the server fills with a random).
  const lockIn = (): void => {
    if (locked || !myPick) return;
    dismissBriefing();
    hudActions.selectChampion(pickToCommitOnLock(myPick)); // re-send the final pick as the commit
    lockCurrentPick();
    forceRender();
  };

  // inset below the persistent top chrome instead of hard-coding a top offset
  const touch = isTouchDevice(readTouchEnv());
  const topInset =
    Math.max(hudSlotBand("team-lives", touch).end, hudSlotBand("scoreboard", touch).end, 58) + 12;

  // Phone layout: the desktop two-column card is taller than the ~260px of
  // content height a phone-landscape viewport leaves once the top chrome is
  // cleared, and the profile's fixed 300px 3D stage pushed the tabs + intro text
  // out of the clipped card. On touch the picker becomes a single vertical
  // scroll (profile over roster) with a shrunk stage; desktop is unchanged.
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const layout = champSelectProfileLayout({ touch, viewportHeight });

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
          flexDirection: layout.stacked ? "column" : "row",
          flexWrap: layout.stacked ? "nowrap" : "wrap",
          gap: layout.stacked ? 12 : 16,
          width: layout.stacked ? "min(560px, 100%)" : "min(980px, 100%)",
          maxHeight: "100%",
          alignItems: "stretch",
          // phone: the whole picker scrolls as one column (nothing is clipped);
          // desktop is left at its default overflow (each column scrolls internally).
          ...(layout.stacked
            ? { overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }
            : {}),
        }}
      >
        {/* ── LEFT: profile block ─────────────────────────────────────────── */}
        <div
          style={{
            flex: layout.stacked ? "0 0 auto" : "1 1 360px",
            minWidth: layout.stacked ? 0 : 300,
            maxHeight: layout.stacked ? "none" : "100%",
            padding: 14,
            background: PANEL_BG,
            border: PANEL_BORDER,
            borderRadius: 12,
            color: TEXT_MAIN,
            pointerEvents: "auto",
            boxSizing: "border-box",
            // desktop clips the fixed-height card; phone flows and lets the outer
            // container scroll, so the intro is never cut off.
            overflow: layout.stacked ? "visible" : "hidden",
          }}
        >
          <ChampionProfile championId={subjectId} compact={layout.compact} stageHeight={layout.stageHeight} />
        </div>

        {/* ── RIGHT: roster ───────────────────────────────────────────────── */}
        <div
          style={{
            flex: layout.stacked ? "0 0 auto" : "1 1 380px",
            minWidth: layout.stacked ? 0 : 300,
            maxHeight: layout.stacked ? "none" : "100%",
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
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {meta.available && <CrystalBadge crystal={meta.crystal} />}
              {myPick &&
                (locked ? (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: "bold",
                      color: "#7fd898",
                      background: "#123322",
                      border: "1px solid #2f7d4f",
                      borderRadius: 999,
                      padding: "2px 10px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    🔒 已鎖定：{roster.find((c) => c.id === myPick)?.name ?? myPick}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: TEXT_DIM }}>
                    已選：<span style={{ color: TEXT_MAIN }}>{roster.find((c) => c.id === myPick)?.name ?? myPick}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* meta action failed (e.g. insufficient crystals) — dismissible note */}
          {meta.available && meta.error && (
            <div
              style={{
                marginBottom: 10,
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 12,
                color: "#f6b7b3",
                background: "#3a1c1e",
                border: "1px solid #e5483f",
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span>{meta.error}</span>
              <button
                onClick={meta.dismissError}
                aria-label="dismiss"
                style={{ background: "none", border: "none", color: "#f6b7b3", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
          )}

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
                  disabled={locked}
                  title={locked ? "已鎖定 — 無法再隨機" : "pick a random champion"}
                  style={{
                    minHeight: 40,
                    padding: "0 14px",
                    borderRadius: 8,
                    cursor: locked ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                    background: locked ? "#1a2030" : "#2c3f6b",
                    border: locked ? "1px solid #2c3448" : "1px solid #6f8fe0",
                    color: locked ? TEXT_DIM : TEXT_MAIN,
                    fontWeight: "bold",
                    opacity: locked ? 0.6 : 1,
                  }}
                >
                  🎲 隨機英雄
                </SfxButton>
              </div>

              {/* 鎖定 / Lock In — the commit step. Full-width + prominent so it is
                  reachable at the top of the roster on a phone (the whole picker
                  is a single vertical scroll there). Disabled until a pick exists,
                  and once locked it becomes the frozen 🔒 已鎖定 state. */}
              <SfxButton
                onClick={lockIn}
                disabled={locked || !myPick}
                title={
                  locked ? "已鎖定" : myPick ? "鎖定你的英雄 — 之後無法再更換" : "先選一隻英雄再鎖定"
                }
                style={{
                  width: "100%",
                  minHeight: 44,
                  marginBottom: 10,
                  borderRadius: 8,
                  boxSizing: "border-box",
                  fontSize: 15,
                  fontWeight: "bold",
                  cursor: locked || !myPick ? "not-allowed" : "pointer",
                  background: locked ? "#123322" : myPick ? "#2f7d4f" : "#1a2030",
                  border: locked
                    ? "1px solid #2f7d4f"
                    : myPick
                      ? "1px solid #57c98a"
                      : "1px solid #2c3448",
                  color: locked ? "#7fd898" : myPick ? "#eafff2" : TEXT_DIM,
                  opacity: !locked && !myPick ? 0.7 : 1,
                }}
              >
                {locked ? "🔒 已鎖定 LOCKED" : "🔒 鎖定英雄 Lock In"}
              </SfxButton>

              <div
                style={{
                  // phone: the grid flows at natural height and the outer column
                  // scrolls; desktop: the grid is the internally-scrolling region.
                  ...(layout.stacked
                    ? { flex: "0 0 auto", overflowY: "visible" }
                    : { flex: 1, minHeight: 0, overflowY: "auto" }),
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  padding: 2,
                }}
              >
                {ordered.map((c) => {
                  const picked = myPick === c.id;
                  const focused = subjectId === c.id;
                  // once locked the whole roster is frozen; the locked pick stays
                  // highlighted (with a 🔒), every other card is disabled + dimmed.
                  const frozenOther = locked && !picked;
                  return (
                    // relative column wrapper: the pick button, the favourite
                    // star (absolute overlay) and the optional unlock button
                    // (in-flow, below the card) all live here.
                    <div key={c.id} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 4 }}>
                      <SfxButton
                        onClick={() => commit(c.id)}
                        disabled={locked}
                        onPointerEnter={locked ? undefined : () => focus(c.id)}
                        onFocus={locked ? undefined : () => focus(c.id)}
                        style={{
                          width: "100%",
                          minHeight: 44,
                          padding: "8px 10px",
                          paddingRight: meta.available ? 34 : 10, // clear the star
                          borderRadius: 8,
                          boxSizing: "border-box",
                          cursor: locked ? "not-allowed" : "pointer",
                          textAlign: "left",
                          background: picked ? "#2c3f6b" : focused ? "#1d2740" : "#171d2b",
                          border: picked
                            ? locked
                              ? "2px solid #57c98a"
                              : "2px solid #6f8fe0"
                            : focused
                              ? "1px solid #4a6099"
                              : "1px solid #2c3448",
                          color: TEXT_MAIN,
                          opacity: frozenOther ? 0.45 : 1,
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
                      {/* 🔒 badge pinned to the locked pick */}
                      {locked && picked && (
                        <div
                          style={{
                            position: "absolute",
                            top: -6,
                            left: -6,
                            fontSize: 13,
                            lineHeight: 1,
                            background: "#123322",
                            border: "1px solid #2f7d4f",
                            borderRadius: 999,
                            padding: "2px 4px",
                            pointerEvents: "none",
                          }}
                          aria-label="locked"
                        >
                          🔒
                        </div>
                      )}
                      <ChampMetaOverlay meta={meta} championId={c.id} />
                    </div>
                  );
                })}
                {ordered.length === 0 && (
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
                {locked && s.seatId === localSeatId ? " 🔒" : ""}
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
        {stage.stage === "briefing"
          ? "開打前 10 秒 · 逛一下就開始選人"
          : locked
            ? "🔒 已鎖定 · 無法再更換英雄"
            : "選好後按🔒鎖定 · 未鎖定時可隨時改選"}
      </div>
    </div>
  );
}

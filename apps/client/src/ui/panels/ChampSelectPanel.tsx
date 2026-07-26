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
 * 🎲 button and every re-pick stop landing, and a 🔒 已鎖定 badge appears.
 *
 * THE COMMIT IS ALWAYS NAMED (playtest P1). Nothing here renders 🔒 已鎖定 off
 * the raw `locked` boolean — every 「this is final」 surface (the header badge,
 * the Lock In button, the banner, the seat strip, the footer hint) reads
 * `lock.status`, which is "locked" only with a REAL champion in hand and
 * "awaiting-auto" while the server's random is still on its way. So a seat can
 * never present itself as 「… 🔒」 — locked onto nothing. The
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
import { HUD_GAP, HUD_STAMP_BAND, hudSlotBand } from "../hud/hudLayout";
import { topRightReserve } from "../chromeReserve";
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
import {
  INITIAL_PREVIEW_STATE,
  modelLoadSubject,
  previewReducer,
} from "./champselect/previewGate";
import {
  useWalletMeta,
  sortFavouritesFirst,
  rosterDisplayAndSelectable,
  selectableIdsByOwnership,
} from "./champselect/walletMeta";
import { CrystalBadge, ChampMetaOverlay } from "./champselect/ChampMetaControls";
import {
  observeLock,
  lockBanner,
  lockCurrentPick,
  pickAllowed,
  pickToCommitOnLock,
} from "./champselect/lockGate";

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
  // 「滑鼠點選才載入」 — hover only highlights; CLICK is what loads the model.
  // See champselect/previewGate for why (a sweep used to pull up to 17.56 MB).
  // No `locked` argument is needed here: while locked the panel simply never
  // dispatches a "click" (commit() returns early), and hover costs nothing.
  const [preview, dispatchPreview] = useReducer(previewReducer, INITIAL_PREVIEW_STATE);
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
  // Meta progression (task #118): crystal balance, champion unlock + favourites.
  // Degrades to `available:false` offline / when the platform is unreachable, so
  // everything below is gated on it and the base champ-select is untouched.
  // Read BEFORE the roster is built because the SELECTABLE set now depends on
  // ownership, not just on the curation whitelist (task #201).
  const meta = useWalletMeta();

  // The grid SHOWS every available (whitelisted) champion — INCLUDING a locked
  // (priced, un-owned) one — because the 「🔓 解鎖 (N 水晶)」 button (#118) lives on
  // the locked champion's own card. SELECTION and 🎲 random are gated to
  // `selectableIds` (owned ∩ available) instead: a locked champion previews +
  // unlocks but never LOCKS IN. #201 first filtered locked champions out of the
  // grid too, which removed the only way to spend crystals — that was the
  // 「藍水晶解鎖角色不見了」 regression. `selectableIds` is null when meta is
  // unavailable (offline): ownership is unknown, so everything is selectable and
  // the SERVER's MatchController.selectChampion stays the authoritative reject.
  const whitelisted = useMemo(() => applyChampionWhitelist(roster, whitelist), [roster, whitelist]);
  const { available, selectableIds } = useMemo(() => {
    if (!meta.available) return { available: whitelisted, selectableIds: null as ReadonlySet<string> | null };
    const { display, selectableIds } = rosterDisplayAndSelectable(whitelisted, meta.prices, meta.owned);
    return { available: display, selectableIds };
  }, [whitelisted, meta.available, meta.prices, meta.owned]);
  const shown = useMemo(() => filterChampions(available, query), [available, query]);
  const rosterEmpty = whitelist.enforced && available.length === 0;

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
  // it also AUTO-LOCKS when the clock hits 0 (the pick is final then, #130) —
  // but ONLY once a running clock has actually been seen, so the pre-roll
  // snapshot (phase=champSelect + phaseTicksLeft=0, published by MatchRoom
  // .onCreate before the first projectSnapshot) can no longer latch a lock onto
  // an empty seat. An explicit 鎖定 forces one re-render to reflect the freeze.
  // `lock.status` is never "locked" without a champion, so the panel physically
  // cannot render 🔒 已鎖定 over nothing.
  const lock = observeLock({ phase, secondsLeft, matchId, pick: myPick });
  const locked = lock.locked;
  const champName = (id: string): string => roster.find((c) => c.id === id)?.name ?? id;
  const banner = lockBanner(lock.status, lock.autoAssigned, myPick ? champName(myPick) : "");

  // The champion the profile (and its 3D stage) is looking at: the CLICKED
  // preview, else the committed pick. Once locked the preview is dropped so the
  // profile stays on the frozen pick. HOVER IS NOT AN INPUT HERE — that is the
  // 「滑鼠點選才載入」 fix; see champselect/previewGate.
  const subjectId = profileSubjectId(
    locked ? null : modelLoadSubject(preview, null),
    myPick || null,
  );

  // Hover: highlight only. Costs zero bytes, so a cursor sweep across the whole
  // grid downloads nothing. It still counts as a roster interaction, which is
  // what dismisses the briefing.
  const hover = (id: string): void => {
    dispatchPreview({ type: "hover", id });
    dismissBriefing(); // first roster interaction skips the briefing
  };
  const unhover = (): void => dispatchPreview({ type: "leave" });
  const commit = (id: string): void => {
    if (!pickAllowed(locked)) return; // frozen after lock — the roster can no longer switch
    dismissBriefing();
    // A click is BOTH the pick and the preview: the stage/tabs switch instantly
    // and locally, without waiting for the server to echo the seat back.
    dispatchPreview({ type: "click", id });
    // #201: a LOCKED (priced, un-owned) champion previews but is NOT picked — its
    // card's 「🔓 解鎖」 button is the way in, and the server rejects an unowned
    // lock-in regardless. `selectableIds` is null offline (ownership unknown), so
    // everything is pickable and the server stays the authoritative gate.
    if (selectableIds && !selectableIds.has(id)) return;
    hudActions.selectChampion(id); // normal SELECT_CHAMPION (+ name call-out, confirm SFX)
  };

  const pickRandom = (): void => {
    if (!pickAllowed(locked)) return; // 🎲 is disabled once locked
    dismissBriefing();
    // Draw from `owned ∩ available`: whitelist first (availability), then drop
    // any locked champion so 🎲 can NEVER roll a champion the account has not
    // unlocked (task #201). Ownership is only known when meta is available; the
    // server rejects an unowned pick regardless, so an offline fallback to
    // whitelist-only is still safe.
    let pool = whitelistedChampionIds(Champions.ids(), whitelist);
    if (meta.available) pool = selectableIdsByOwnership(pool, meta.prices, meta.owned);
    const id = pickRandomId(pool);
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
        // task #107: the card is only CENTRED, not narrow — at 1280px its right
        // edge lands 4px inside the <body>-portaled audio cluster, and on a
        // phone-landscape viewport it runs straight under it. Reserve the
        // cluster's PUBLISHED gutter (ui/chromeReserve) so the card shifts left
        // instead. Deliberately the horizontal axis and not extra paddingTop:
        // task #151 already has iPhone landscape at 390px of height to spend.
        paddingRight: topRightReserve({ min: 16 }),
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
              {/* the committed state is ALWAYS named — a 🔒 with no champion is
                  exactly the P1 trap, so lock.status gates it, not `locked`. */}
              {myPick &&
                (lock.status === "locked" ? (
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
                    {lock.autoAssigned ? "🎲 隨機：" : "🔒 已鎖定："}
                    {champName(myPick)}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: TEXT_DIM }}>
                    已選：<span style={{ color: TEXT_MAIN }}>{champName(myPick)}</span>
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
              {/* #24: the dismiss ✕ on a real failure notice (e.g. not enough
                  crystals). A control that removes the only explanation of why
                  the last action failed should answer the click like every
                  other button. `kind="ghost"` keeps it chromeless; the shared
                  primitive supplies hover/click SFX + the press scale. */}
              <SfxButton
                kind="ghost"
                sfxVolume={0.4}
                onClick={meta.dismissError}
                aria-label="dismiss"
                style={{ background: "none", border: "none", color: "#f6b7b3", cursor: "pointer" }}
              >
                ✕
              </SfxButton>
            </div>
          )}

          {/* #213: tapping 「解鎖」 without enough 藍水晶 answers with a HINT (how
              to earn crystals), not a silent no-op. Crystal-blue, not error-red —
              it's guidance, not a failure — and dismissible like the note above. */}
          {meta.available && meta.hint && (
            <div
              role="status"
              style={{
                marginBottom: 10,
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 12,
                color: "#cfeaff",
                background: "rgba(120, 200, 255, 0.12)",
                border: "1px solid rgba(120, 200, 255, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span>
                <span aria-hidden style={{ marginRight: 6 }}>💎</span>
                {meta.hint}
              </span>
              <SfxButton
                kind="ghost"
                sfxVolume={0.4}
                onClick={meta.dismissHint}
                aria-label="dismiss"
                style={{ background: "none", border: "none", color: "#cfeaff", cursor: "pointer" }}
              >
                ✕
              </SfxButton>
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

          {/* THE COMMIT, SPELLED OUT (playtest P1). A frozen seat must never be a
              silent 「… 🔒」: either it names the champion, or it says the system
              is choosing one. lockBanner owns the wording + the invariant. */}
          {banner && (
            <div
              style={{
                marginBottom: 10,
                padding: "7px 10px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: "bold",
                color:
                  banner.tone === "waiting" ? "#f2d59a" : banner.tone === "auto" ? "#cfe0ff" : "#7fd898",
                background:
                  banner.tone === "waiting" ? "#3a2f14" : banner.tone === "auto" ? "#1d2740" : "#123322",
                border:
                  banner.tone === "waiting"
                    ? "1px solid #e0a878"
                    : banner.tone === "auto"
                      ? "1px solid #6f8fe0"
                      : "1px solid #2f7d4f",
              }}
            >
              {banner.text}
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
                  lock.status === "locked"
                    ? `已鎖定：${champName(myPick)}`
                    : lock.status === "awaiting-auto"
                      ? "時間到 — 系統正在幫你選一隻英雄"
                      : myPick
                        ? "鎖定你的英雄 — 之後無法再更換"
                        : "先選一隻英雄再鎖定"
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
                {lock.status === "locked"
                  ? `🔒 已鎖定 LOCKED · ${champName(myPick)}`
                  : lock.status === "awaiting-auto"
                    ? "⏳ 系統選擇中… Assigning"
                    : "🔒 鎖定英雄 Lock In"}
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
                  // pure highlight — hovering costs nothing and loads nothing
                  const hovered = !locked && preview.hoveredId === c.id && !focused;
                  // once locked the whole roster is frozen; the locked pick stays
                  // highlighted (with a 🔒), every other card is disabled + dimmed.
                  const frozenOther = locked && !picked;
                  // a champion the account has NOT unlocked (priced, un-owned):
                  // still SHOWN so its 「🔓 解鎖」 button (below) is reachable, but
                  // dimmed + marked so a click reads as "unlock me", not "pick me".
                  const lockedOut = !!selectableIds && !selectableIds.has(c.id);
                  return (
                    // relative column wrapper: the pick button, the favourite
                    // star (absolute overlay) and the optional unlock button
                    // (in-flow, below the card) all live here.
                    <div key={c.id} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 4 }}>
                      <SfxButton
                        onClick={() => commit(c.id)}
                        disabled={locked}
                        // hover/keyboard-focus = HIGHLIGHT ONLY (「滑鼠點選才載入」).
                        // These handlers cannot reach a fetch: the 3D stage
                        // follows `preview.clickedId`, which only onClick sets.
                        onPointerEnter={locked ? undefined : () => hover(c.id)}
                        onPointerLeave={locked ? undefined : unhover}
                        onFocus={locked ? undefined : () => hover(c.id)}
                        onBlur={locked ? undefined : unhover}
                        style={{
                          width: "100%",
                          minHeight: 44,
                          padding: "8px 10px",
                          paddingRight: meta.available ? 34 : 10, // clear the star
                          borderRadius: 8,
                          boxSizing: "border-box",
                          cursor: locked ? "not-allowed" : "pointer",
                          textAlign: "left",
                          background: picked
                            ? "#2c3f6b"
                            : focused
                              ? "#1d2740"
                              : hovered
                                ? "#1a2233"
                                : "#171d2b",
                          border: picked
                            ? locked
                              ? "2px solid #57c98a"
                              : "2px solid #6f8fe0"
                            : focused
                              ? "1px solid #4a6099"
                              : hovered
                                ? "1px solid #3d4d74"
                                : "1px solid #2c3448",
                          color: TEXT_MAIN,
                          opacity: frozenOther ? 0.45 : lockedOut ? 0.62 : 1,
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
                      {/* 🔒 badge on a champion the account has not unlocked yet —
                          the 「🔓 解鎖」 button (ChampMetaOverlay, below) is the way in */}
                      {lockedOut && !locked && (
                        <div
                          style={{
                            position: "absolute",
                            top: -6,
                            left: -6,
                            fontSize: 13,
                            lineHeight: 1,
                            background: "#2a2030",
                            border: "1px solid #6b5a3a",
                            borderRadius: 999,
                            padding: "2px 4px",
                            pointerEvents: "none",
                          }}
                          aria-label="尚未解鎖"
                        >
                          🔒
                        </div>
                      )}
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
            {/* the seat strip shows the champion's NAME (not the raw id), and the
                🔒 only ever sits next to a real one — 「Player 0: … 🔒」 was the
                exact P1 symptom. A seat with no pick reads 選擇中…, not a lock. */}
            {seats.map((s) => (
              <span key={s.seatId} style={{ color: teamCss(s.teamId) }}>
                {s.displayName || `Seat ${s.seatId}`}: {s.championId ? champName(s.championId) : "選擇中…"}
                {s.championId && lock.status === "locked" && s.seatId === localSeatId ? " 🔒" : ""}
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

      {/*
        A hairline hint that the clock is real and fixed.

        ITS OFFSET IS DERIVED, NOT CHOSEN (task #245). This panel's root is
        `position:absolute; inset:0` — a full-screen layer — so this `bottom` is
        measured from the bottom of the viewport, not from the card above it. At
        its original `bottom: 6` this line sat INSIDE the build stamp's reserved
        band (`HUD_STAMP_BAND`), horizontally centred: exactly the pixels the
        badge occupies on every screen. The badge is what has to stay put — its
        entire purpose is that a screenshot of ANY screen carries the build id in
        the SAME place, and it is a <body> child that cannot know which screen is
        mounted. This hint is one screen's decorative, `pointerEvents:"none"`
        status line whose only requirement is "near the bottom, centred, out of
        the way", so it is the one that moves.

        Reading HUD_STAMP_BAND rather than hard-coding 18 means a later change to
        the band moves this line with it instead of silently re-colliding;
        versionBadgeBand.test.ts enumerates every bottom offset under ui/ and
        would fail here otherwise.
      */}
      <div
        style={{
          position: "absolute",
          bottom: HUD_STAMP_BAND + HUD_GAP,
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
          : lock.status === "locked"
            ? `🔒 ${champName(myPick)} 已鎖定 · 無法再更換英雄`
            : lock.status === "awaiting-auto"
              ? "⏳ 時間到 · 系統正在幫你選一隻英雄"
              : "選好後按🔒鎖定 · 未鎖定時可隨時改選"}
      </div>
    </div>
  );
}

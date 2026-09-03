/**
 * MatchEndPanel — the victory-settlement screen (task #25, part C). Once the
 * match ends the server broadcasts the full per-player scoreboard; this renders:
 *   - the local player's big COLORED grade (S+ gold … C- grey) + headline,
 *   - a per-stat breakdown with short data-driven reflection hints,
 *   - the full per-player RANKING table (rank · portrait · name · grade · KDA),
 *   - a "查看戰績變化" button (+ auto-advance) to the leaderboard delta screen.
 *
 * The ranking list AUTO-SCROLLS (task #36): it opens pinned at rank 1, holds so
 * the top of the board is readable, then eases down until the local player's row
 * is centered and pulses it — nobody has to hunt for their own name. The first
 * manual wheel/touch/drag/key input cancels it for good, and reduced-motion
 * renders already-scrolled. Rules + math: ../scroll/autoScroll.
 *
 * All numeric/textual logic lives in ./settlementModel (pure, unit-tested); this
 * file is the JSX shell. Falls back to the old team-placement list until the
 * settlement payload arrives (or if it never does — e.g. a very old server).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import type { MatchSettlement, SettlementPlayer } from "@ggd/shared/protocol/messages";
import { useHud } from "../../net/RoomStore";
import { HUD_Z } from "../hud/hudLayout";
import {
  MATCH_END_PAD,
  matchEndCardCap,
  matchEndCardWidth,
  matchEndReserveRight,
  progressChartSurfaceStyle,
} from "../hud/hudSurfaces";
import { useHudViewport } from "../hud/useHudSurface";
import { hudTouch } from "../hud/HudSlot";
import { useApp } from "../platform/store";
import { useSettings } from "../useSettings";
import { settingsStore } from "../../settings";
import { championIconUrl } from "../icons";
import { GlyphTile } from "../components/GlyphTile";
import { Btn } from "../platform/widgets";
import {
  buildStatBreakdown,
  gradeColor,
  gradeHeadline,
  isWinner,
  localSettlementCard,
  localWinQuoteChampion,
  formatKda,
  reflectionHints,
  settlementExtras,
  settlementTeamLives,
  sortSettlementRanking,
} from "./settlementModel";
import { audioSystem } from "../../audio";
import { playChampionQuote } from "../../audio/nameVoice";
import { playContextualVoice } from "../../audio/contextualVoice";
import { cancelVictoryTaunt, playMatchTaunt } from "../../audio/victoryTaunt";
import { MATCH_WIN_STING, matchEndBedScene } from "../../audio/matchEndBed";
import { useBedEnded, useBgmSceneOverride } from "../useAudio";
import {
  MATCH_PANEL_HOLD_MS,
  MATCH_WASH_SETTLE_MS,
  matchCardHeld,
  matchPanelHoldMs,
  matchQuoteDelayMs,
  victoryPresentation,
} from "../../render/victoryPresentation";
import { victoryFxPolicy } from "../../vfx/victoryFxPolicy";
import {
  AUTO_SCROLL_HIGHLIGHT_CSS,
  highlightClass,
  useAutoScrollToRow,
  type AutoScrollToRowHandle,
} from "../scroll/useAutoScrollToRow";
import { PANEL_BG, PANEL_BORDER, teamCss, TEXT_DIM, TEXT_MAIN } from "../theme";
import { applyPadFocus } from "../focusGlow";
import { padModalScope } from "../padModalScope";
import { ProgressChartPanel } from "./ProgressChartPanel";
import { buildProgressSeries, progressAdvice } from "./progressChart";
import { TeamPointsRows } from "./RoundVictoryPanel";
import { teamLedger, teamStandings } from "./teamLedger";

/**
 * REMOVED — the settlement no longer auto-advances (owner, 2026-07-27:
 * 「戰鬥勝利/失敗 最後結算的時候要停留 不要自動轉到大廳」). See MatchEndPanel's
 * body where the countdown used to live.
 *
 * Kept as a comment rather than deleted silently, because the constant carried
 * a real, hard-won finding worth not re-discovering: it was counted from the
 * moment the victory sting ENDS, never from mount, because the sting's length
 * is not a constant this file may assume (#137 rotates it per scene entry and
 * tools/bgm-gen can re-render it). Any future timed transition on this screen
 * inherits that constraint — and a test still forbids writing a sting duration
 * down here.
 */

/**
 * Height of the ranking list's own scroll window. Bounded (rather than letting
 * the whole card scroll) so "pinned at rank 1 → centered on you" is a real,
 * legible travel on a 12-player board instead of a page-length jump.
 */
const RANK_LIST_MAX_H = "min(38vh, 252px)";

const PLACE_LABEL = ["", "1st", "2nd", "3rd", "4th"];

function championName(champ: string): string {
  return Champions.tryGet(champ as ChampionId)?.name ?? champ;
}

/** Champion portrait, or the shared procedural tile when the w3x art is absent. */
function ChampPortrait(props: { champ: string; size: number }): React.JSX.Element {
  return (
    <GlyphTile
      seed={props.champ}
      src={championIconUrl(props.champ)}
      label={championName(props.champ)}
      size={props.size}
      radius={6}
    />
  );
}

/** The big colored grade splash for the local player's card. */
function GradeSplash(props: { player: SettlementPlayer; won: boolean }): React.JSX.Element {
  const { player, won } = props;
  const color = gradeColor(player.grade);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 14 }}>
      <div
        style={{
          fontSize: 72,
          lineHeight: 1,
          fontWeight: 900,
          color,
          textShadow: `0 0 22px ${color}66`,
          minWidth: 120,
          textAlign: "center",
        }}
      >
        {player.grade}
      </div>
      <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: won ? "#f2c637" : TEXT_MAIN }}>
          {won ? "勝利！" : "戰鬥結束"}
        </div>
        <div style={{ fontSize: 14, color, fontWeight: 700, marginTop: 2 }}>{gradeHeadline(player.grade)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <ChampPortrait champ={player.champ} size={30} />
          <span style={{ fontSize: 14, color: TEXT_MAIN, fontWeight: 700 }}>{championName(player.champ)}</span>
          <span style={{ fontSize: 12, color: TEXT_DIM }}>#{player.rank} · {formatKda(player.stats)}</span>
        </div>
      </div>
    </div>
  );
}

/** Data-driven coaching lines for the local player. */
function Reflections(props: { player: SettlementPlayer }): React.JSX.Element {
  const hints = reflectionHints(props.player.stats, props.player.role, props.player.grade);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
      {hints.map((h, i) => {
        const praise = h.tone === "praise";
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 12.5,
              color: TEXT_MAIN,
              background: praise ? "rgba(71,204,106,0.12)" : "rgba(242,198,55,0.10)",
              border: `1px solid ${praise ? "rgba(71,204,106,0.5)" : "rgba(242,198,55,0.45)"}`,
            }}
          >
            <span aria-hidden>{praise ? "✦" : "◆"}</span>
            <span>{h.text}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The local player's full per-stat breakdown grid.
 *
 * ⭐ GH#973 —— 吃**整份結算**而不是只吃 `player.stats`：殭屍擊殺那一欄的數字
 * 住在 `settlement.rounds` 的每回合差值裡，`settlementExtras` 把它加總。
 */
function StatBreakdown(props: {
  player: SettlementPlayer;
  settlement: MatchSettlement | null;
}): React.JSX.Element {
  const rows = buildStatBreakdown(
    props.player.stats,
    settlementExtras(props.settlement, props.player.seatId),
  );
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "4px 18px",
        marginBottom: 16,
      }}
    >
      {rows.map((r) => (
        <div
          key={r.key}
          style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0", borderBottom: "1px solid rgba(120,140,190,0.12)" }}
        >
          <span style={{ color: TEXT_DIM }}>{r.label}</span>
          <span style={{ color: TEXT_MAIN, fontWeight: 600 }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The full per-player ranking table (rank · portrait · name · grade · KDA · dmg).
 * The header stays put; only the rows scroll — the auto-scroll drives that inner
 * list (props.scroll.listRef) and reveals the local row (props.scroll.rowRef).
 */
function RankingTable(props: {
  players: readonly SettlementPlayer[];
  localSeatId: number | null;
  winnerTeam: number;
  nameForSeat: (seatId: number) => string;
  scroll: AutoScrollToRowHandle<HTMLDivElement, HTMLDivElement>;
}): React.JSX.Element {
  const ordered = sortSettlementRanking(props.players);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: TEXT_DIM, letterSpacing: 0.6, textTransform: "uppercase", padding: "0 8px 4px" }}>
        <span style={{ width: 26 }}>#</span>
        <span style={{ width: 26 }} />
        <span style={{ flex: 1 }}>玩家</span>
        <span style={{ width: 34, textAlign: "center" }}>評級</span>
        <span style={{ width: 76, textAlign: "right" }}>分數</span>
        <span style={{ width: 66, textAlign: "right" }}>K / D / A</span>
        <span style={{ width: 60, textAlign: "right" }}>傷害</span>
      </div>
      <div
        ref={props.scroll.listRef}
        style={{ maxHeight: RANK_LIST_MAX_H, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}
      >
        {ordered.map((p) => {
          const isLocal = p.seatId === props.localSeatId;
          const won = isWinner(props.winnerTeam, p.teamId);
          const gc = gradeColor(p.grade);
          return (
            <div
              key={p.seatId}
              {...(isLocal ? { ref: props.scroll.rowRef, className: highlightClass(props.scroll.highlight) } : {})}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 8px",
                borderRadius: 6,
                fontSize: 12,
                flexShrink: 0,
                // stable row height (portrait 26 + 2×5 padding + 2×1 border) so a
                // late/404 portrait can never reflow the list under the auto-scroll
                minHeight: 38,
                boxSizing: "border-box",
                background: isLocal ? "rgba(80,100,160,0.32)" : "rgba(30,36,52,0.5)",
                border: isLocal ? "1px solid rgba(140,160,220,0.5)" : "1px solid transparent",
              }}
            >
              <span style={{ width: 26, fontWeight: 800, color: p.rank <= 3 ? "#f2c637" : TEXT_DIM }}>{p.rank}</span>
              <ChampPortrait champ={p.champ} size={26} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: teamCss(p.teamId), fontWeight: 600 }}>
                {props.nameForSeat(p.seatId)}
                {won && <span style={{ color: "#f2c637", marginLeft: 5 }}>👑</span>}
              </span>
              <span style={{ width: 34, textAlign: "center", fontWeight: 900, color: gc }}>{p.grade}</span>
              {/* THE SCORE THE RANK WAS SORTED ON (owner: 「存活下來的人額外
                  +200分」). Shown with its survival half broken out, because a
                  bonus nobody can see is a bonus nobody believes in — and the
                  whole complaint was 「明明活到最後卻不是贏家很怪」. */}
              <span
                style={{ width: 76, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
                title="RANK 分數 = 戰鬥表現 + 生存加成"
              >
                <span style={{ color: TEXT_MAIN, fontWeight: 700 }}>
                  {p.score === undefined ? "—" : p.score.toLocaleString("en-US")}
                </span>
                {p.survivalBonus !== undefined && p.survivalBonus > 0 && (
                  <span style={{ color: "#6fdc9a", fontSize: 11, marginLeft: 4 }}>
                    +{p.survivalBonus}
                  </span>
                )}
              </span>
              <span style={{ width: 66, textAlign: "right", color: TEXT_MAIN }}>{formatKda(p.stats)}</span>
              <span style={{ width: 60, textAlign: "right", color: TEXT_DIM }}>{Math.round(p.stats.damageDealt).toLocaleString("en-US")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * ⭐ GH#126 —— 團隊生命值，畫在結算卡**裡面**。
 *
 * ⛔ 這不是「調 z-index 就好」的那種缺陷：`hud/hudLayout.ts` 的 `match-end`
 * panel 宣告 `covers` **四個角落**，`useHudPanels` 在 `phase === "matchEnd"` 把
 * 它判為 active，於是 `useHudSlotHidden("team-lives")` 為 true，
 * `components/TeamLivesBar.tsx` 直接 `return null` —— 結算時那條 bar **根本沒進
 * DOM**。所以唯一解就是主面板自己印。
 *
 * 為什麼非印不可：commit 97944609「取消淘汰」之後團隊生命是純計分板，而伺服器
 * 的 `finalStandings()` 拿 teamHealth 遞減決定全場 2/3/4 名 ——
 * **生命值就是「你為什麼是第 3 名」的唯一解釋**，卻在唯一會看名次的畫面上缺席。
 *
 * 讀的是 `useHud(s => s.teams)`（`net/RoomStore` 的 `TeamView` 從快照投影，
 * 帶著 `lives`），⛔ 不是本地重算；排序共用 `settlementTeamLives`，⛔ 不是第二
 * 份比較器。0 生命**照樣印 0**：那是它進商店還在花錢的那一隊。
 */
function TeamLivesRows(props: { localTeamId: number | null }): React.JSX.Element | null {
  const teams = useHud((s) => s.teams);
  if (teams.length === 0) return null;
  const ordered = settlementTeamLives(teams);
  return (
    <div data-ggd-team-lives="" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {ordered.map((t, i) => (
        <div
          key={t.teamId}
          data-ggd-team-lives-row={t.teamId}
          style={{
            display: "flex",
            gap: 6,
            alignItems: "baseline",
            fontSize: 11,
            opacity: t.eliminated ? 0.55 : 1,
            fontWeight: t.teamId === props.localTeamId ? "bold" : "normal",
          }}
        >
          <span style={{ color: TEXT_DIM, width: 16 }}>#{t.placement || i + 1}</span>
          <span style={{ flex: 1, minWidth: 0, color: teamCss(t.teamId) }}>
            隊伍 {t.teamId + 1}
            {t.teamId === props.localTeamId ? "（你）" : ""}
          </span>
          <span
            style={{
              color: teamCss(t.teamId),
              fontWeight: 700,
              // 四隊的數字在同一欄，變寬度會抖
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {Math.max(t.lives, 0)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Legacy fallback: team placements only (settlement payload not yet received). */
function TeamPlacementFallback(): React.JSX.Element {
  const teams = useHud((s) => s.teams);
  const seats = useHud((s) => s.seats);
  const localTeamId = useHud((s) => {
    if (s.localSeatId === null) return null;
    return s.seats.find((v) => v.seatId === s.localSeatId)?.teamId ?? null;
  });
  const returnToLobby = useApp((s) => s.returnToLobby);
  const ordered = [...teams].sort((a, b) => (a.placement || 9) - (b.placement || 9));
  return (
    <div style={cardStyle(380)}>
      <div style={{ fontSize: 20, fontWeight: "bold", marginBottom: 4 }}>
        {localTeamId !== null && ordered[0]?.teamId === localTeamId ? "勝利！" : "戰鬥結束"}
      </div>
      <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 14 }}>最終名次</div>
      {/* GH#126 —— 連這條退路也要印生命值：名次就是拿它排出來的 */}
      <div style={{ marginBottom: 10, textAlign: "left" }}>
        <div style={{ fontSize: 10, color: TEXT_DIM, letterSpacing: "0.04em", marginBottom: 2 }}>團隊生命值</div>
        <TeamLivesRows localTeamId={localTeamId} />
      </div>
      {ordered.map((t) => (
        <div
          key={t.teamId}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "6px 10px",
            marginBottom: 4,
            borderRadius: 6,
            background: t.teamId === localTeamId ? "rgba(80,100,160,0.3)" : "rgba(30,36,52,0.6)",
          }}
        >
          <span style={{ fontWeight: "bold", color: teamCss(t.teamId) }}>
            {PLACE_LABEL[t.placement] ?? "—"} · Team {t.teamId + 1}
          </span>
          <span style={{ fontSize: 11, color: TEXT_DIM }}>
            {seats.filter((s) => s.teamId === t.teamId).map((s) => s.displayName || `Seat ${s.seatId}`).join(", ")}
          </span>
        </div>
      ))}
      <Btn kind="primary" onClick={() => void returnToLobby()} style={{ marginTop: 12 }}>
        返回大廳
      </Btn>
    </div>
  );
}

function cardStyle(width: number | string): React.CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width,
    padding: 20,
    background: PANEL_BG,
    border: PANEL_BORDER,
    borderRadius: 12,
    color: TEXT_MAIN,
    pointerEvents: "auto",
    textAlign: "center",
  };
}

/**
 * `defaultChartOpen` is the UNCONTROLLED-COMPONENT seam for the 戰績變化 card.
 * The chart is behind a button press and this package's vitest runs
 * `environment: "node"` — no DOM, nothing to click — so without it the SHIPPED
 * panel could never be rendered with the chart up, and the only thing a guard
 * could reach would be `ProgressChartPanel` with a hand-passed `surface` prop.
 * That is failure shape ⑤: the measured bypass was changing `surface={chartStyle}`
 * to `surface={null}` on the mount below, which sends the chart back into the
 * card's `marginTop: 12` flow (the owner's 「太低」 bug) with the whole suite green.
 * HudRoot mounts `<MatchEndPanel />` and gets `false`;
 * `hud/hudSurfacePaint.test.ts` mounts it with `true`.
 *
 * ⚠️ AND THE SEAM ALONE IS NOT ENOUGH — a guard that renders this component
 * directly proves the chart's PLACEMENT and never asks whether HudRoot mounts
 * the settlement at all (mutation M11, measured green over the whole client
 * suite). The `data-hud-mount="match-end"` attribute on the wash below is what
 * that guard looks for; see the comment at its declaration.
 */
/**
 * 收合鍵（owner 2026-08-15：「全戰鬥結算以後 戰績評價可以收到最小」）。
 *
 * ⚠️ 貼在卡片右上，⛔ 不是塞進底部的按鈕列 —— 那一列是出口（返回大廳／戰績變化），
 * 而「把畫面縮小」跟「離開這個畫面」是兩種動作，混在一起會誤按。
 */
export function MatchEndCollapseToggle({
  collapsed,
  onToggle,
}: {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}): React.JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -6 }}>
      <button
        type="button"
        data-testid="match-end-collapse"
        // ⭐ GH#511 —— B 鍵在結算畫面**曾經是死鍵**。`findBackControl` 先找
        //    `data-pad-back`，找不到才掃標籤 `BACK_ALLOW_RE`（取消/關閉/收起/返回/
        //    back/close/cancel/dismiss/✕）—— 而這顆的字面是「▴ 收到最小」與
        //    「▾ 展開戰績」，**一個都不 match**（allow-list 有「收起」沒有「收到」），
        //    同時底部的 `返回大廳` 被 `BACK_VETO_RE` 明著擋掉。⇒ B 什麼都不做，
        //    而手把玩家的反射是「B＝退一層」，於是畫面看起來卡住。
        // ⛔ 修法**不是**去擴 `BACK_ALLOW_RE` 猜字面（那條正則已經是啟發式債，
        //    GH#271 就是它惹的）—— 顯式契約永遠贏過標籤掃描（padFocusNav.ts:249）。
        // ⚠️ 兩個狀態**都**帶著它是刻意的：收合之後如果拿掉，B 又變回死鍵，
        //    那正是這張票在抱怨的東西。B 在這個畫面 = 切換戰績大小，
        //    ⛔ 不是離開（離開仍然只有 `返回大廳`，它被 VETO 保護著）。
        data-pad-back
        onClick={onToggle}
        aria-expanded={!collapsed}
        // 手把／鍵盤唸得出來的名字（#252 的教訓：一個只有圖示的按鈕對焦點沒東西可念）
        aria-label={collapsed ? "展開完整戰績" : "收合戰績到最小"}
        title={collapsed ? "展開完整戰績" : "收合戰績到最小"}
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.16)",
          borderRadius: 6,
          color: TEXT_DIM,
          fontSize: 11,
          lineHeight: 1,
          padding: "5px 9px",
          cursor: "pointer",
        }}
      >
        {collapsed ? "▾ 展開戰績" : "▴ 收到最小"}
      </button>
    </div>
  );
}

export function MatchEndPanel({
  defaultChartOpen = false,
}: { defaultChartOpen?: boolean }): React.JSX.Element {
  const settlement = useHud((s) => s.settlement);
  const localSeatId = useHud((s) => s.localSeatId);
  const seats = useHud((s) => s.seats);
  const returnToLobby = useApp((s) => s.returnToLobby);

  const hasPayload = settlement !== null && settlement.perPlayer.length > 0;
  const players = hasPayload ? settlement.perPlayer : [];
  const local = localSettlementCard(players, localSeatId);
  // Did MY team take the match? Resolved from the authoritative settlement
  // payload (winnerTeam vs my card's team), so the celebration is never a local
  // tally — and a loser is never celebrated at.
  const wonMatch = hasPayload && isWinner(settlement.winnerTeam, local?.teamId ?? null);

  // 主題曲 · 寧靜女聲 (task #134, landing on #93's screen). The winner's bed is the
  // `victory` ONE-SHOT: it plays, it stops, and the player is then left reading
  // the grade, the breakdown and the auto-scrolling ranking in silence. So once
  // that sting has played itself out, the serene looping nocturne takes the bed
  // for as long as this screen is up, and the ref-counted override releases on
  // unmount — the director's derived scene takes back over on the way to the
  // lobby. No timing constant anywhere, deliberately: the sting has no single
  // length (the #137 rotation alternates the authored file with a shorter
  // Samantha variant, and bgm-gen can re-render either), so `useBedEnded`
  // reports the NATURAL end of whichever file actually played. That is also why
  // the handover cannot land early on the chicken beat or the savage 吃雞 VO —
  // both finish seconds before any version of the sting does. A LOSS declares
  // nothing: it keeps its own sting. Durations live in audio/matchEndBed.
  const winStingEnded = useBedEnded(wonMatch ? MATCH_WIN_STING : null);
  useBgmSceneOverride(matchEndBedScene(wonMatch, winStingEnded));

  // THE SETTLEMENT DOES NOT LEAVE ON ITS OWN (owner, 2026-07-27: 「戰鬥勝利/失敗
  // 最後結算的時候要停留 不要自動轉到大廳」).
  //
  // There used to be an AUTO_ADVANCE_SEC countdown here that called
  // viewRankChange() the moment it hit 0, with a 「Ns 後自動前往」 caption. It is
  // gone — not paused, not lengthened. A timer is the wrong shape for this
  // screen: it is the ONLY place a player reads their grade, their KDA, the
  // damage they did and where they placed on the ranking that auto-scrolls to
  // their own row (#36), and a fixed budget cannot know when they have finished
  // reading. Worse, it fired hardest exactly when there was most to read — a
  // winner's card is withheld for the chicken firework (MATCH_PANEL_HOLD_MS)
  // and then had less of the same countdown left to read it in.
  //
  // Both exits stay explicit and stay visible: 返回大廳 and the rank-delta
  // screen are buttons. Nothing about this screen expires.

  // task #93 — 暗色底 + 巨大烤雞煙火. The giant roast-chicken shell launches on the
  // very frame the match is decided, which is the same frame this panel mounts —
  // so the scoreboard would sit on top of the joke. Withhold the CARD (never the
  // dark wash, which IS the 暗色底 the beat asks for) for exactly the shell's
  // launch+expand+hold, then let it fade in over the droop. Winner-only, and a
  // plain fail-open timer: if the firework is skipped or never fires, the score
  // still appears on schedule.
  //
  // DERIVED, not stored: `cardHeld` must be true on the very FIRST render that
  // has a winning payload. Storing it and setting it from an effect renders the
  // card at full opacity for one commit before snapping it away (a visible
  // flash of the scoreboard over the launching shell) and arms/re-arms the #36
  // auto-scroll on that same commit. Only the "hold is OVER" edge needs state.
  //
  // ⚠️ 煙火現在有後台開關（`config/victory-fx@1`，出貨**關**）。壓住計分卡的
  // 唯一理由就是讓那隻鳥被看到,所以煙火關掉時 `holdMs` 是 0 —— 不然玩家贏下
  // 整場之後會盯著一個沒有煙火也沒有分數的畫面兩秒多,那是關掉煙火憑空造出來
  // 的新缺陷。
  const holdMs = matchPanelHoldMs(victoryFxPolicy().matchChicken.enabled);
  const [holdDone, setHoldDone] = useState(false);
  const cardHeld = holdMs > 0 && matchCardHeld(wonMatch, holdDone ? MATCH_PANEL_HOLD_MS : 0);
  useEffect(() => {
    setHoldDone(false);
    if (!wonMatch || holdMs <= 0) return;
    const t = setTimeout(() => setHoldDone(true), holdMs);
    return () => clearTimeout(t);
  }, [wonMatch, holdMs]);

  // task #93 — the SAVAGE 吃雞 VO. Picked deterministically from the replicated
  // match id + winning team (audio/victoryTaunt), so every winner hears the same
  // line; scheduled onto the shell break so it lands with the bird. The subtitle
  // renders even when the mixer is muted or still autoplay-locked.
  const matchId = hasPayload ? settlement.matchId : "";
  const winnerTeam = hasPayload ? settlement.winnerTeam : -1;
  const [tauntText, setTauntText] = useState("");
  useEffect(() => {
    if (!wonMatch) {
      setTauntText("");
      return;
    }
    let live = true;
    const spec = victoryPresentation("match");
    // The subtitle rides `onSpeak`, not the promise: the promise settles as soon
    // as the LINE IS CHOSEN, so subtitling from it would print the punchline
    // before the bird has even broken and before the voice says a word.
    void playMatchTaunt(matchId || "offline", winnerTeam, {
      delayMs: spec.voiceDelayMs,
      onSpeak: (line) => {
        if (live && line.text) setTauntText(line.text);
      },
    }).catch(() => {});
    return () => {
      live = false;
      cancelVictoryTaunt(); // leaving settlement drops a taunt still queued
    };
  }, [wonMatch, matchId, winnerTeam]);

  // task #139 — on a VICTORY settlement the LOCAL player's champion speaks its
  // famous quote (名言). Win-only + local-only (each client plays only its own
  // champion; nothing is broadcast). The pure resolver is null until the payload
  // arrives AND the local team won, so this fires exactly once per winning match;
  // a champion with no quote clip is a silent skip inside playChampionQuote.
  // task #93 DEFERS it past the savage taunt: two VO clips on one beat is the
  // likeliest defect here, and the joke rides the bird, so the 名言 follows once
  // the card is revealed rather than talking over it.
  // 煙火關掉時計分卡不再被壓住,所以「卡片露出來之後再唸」這個順序要跟著縮短 ——
  // 不然 名言 會在卡片已經在畫面上兩秒多之後才突然出聲。
  const quoteDelayMs = matchQuoteDelayMs(holdMs > 0);
  const winQuoteChamp = localWinQuoteChampion(settlement, localSeatId);
  useEffect(() => {
    if (!winQuoteChamp) return;
    const t = setTimeout(() => {
      void playChampionQuote(winQuoteChamp).catch(() => {});
      // the local match-winner's own cloned 勝利宣言 alongside the 名言 (client-only;
      // no generated pack → silent no-op).
      playContextualVoice(winQuoteChamp, "victory");
    }, quoteDelayMs);
    return () => clearTimeout(t);
  }, [winQuoteChamp, quoteDelayMs]);

  // Arm the ranking auto-scroll once per match — only when there IS a local row
  // to reveal (spectators / a missing seat leave the list untouched), and not
  // while the card is withheld for the chicken (task #36's reveal must happen
  // where the player can actually see it). Hooks must run before the fallback
  // early-return below.
  const scroll = useAutoScrollToRow<HTMLDivElement, HTMLDivElement>({
    runKey: local && !cardHeld ? `settle-${settlement?.matchId || "offline"}` : null,
  });

  // 効果音ラボ データ表示 score-screen cue (#51 settlement-reveal): a single
  // flourish the instant the ranking card is actually revealed — the same
  // moment the auto-scroll arms (payload present, a local row to show, and the
  // card no longer held for the chicken). Ref-guarded per match so a re-render
  // can't re-fire it; a new matchId re-arms.
  const revealedMatch = useRef<string | null>(null);
  const cardShown = hasPayload && Boolean(local) && !cardHeld;
  useEffect(() => {
    if (!cardShown) return;
    const key = settlement?.matchId || "offline";
    if (revealedMatch.current === key) return;
    revealedMatch.current = key;
    audioSystem.playSfx("settlementReveal");
  }, [cardShown, settlement]);

  /**
   * ⭐ GH#528 —— 結算畫面的**起始焦點**。
   *
   * 缺陷（#502 稽核逐字）：「結算畫面沒有起始焦點：第一次推搖桿落在最上最左，
   * ⛔ 不是『返回大廳』」。`PadFocusNav` 在**沒有任何東西持有** `PAD_FOCUS_ATTR`
   * 時走 `initialFocusIndex`，而那支是純幾何的「最上、再最左」—— 在這張卡上
   * 那是右上角的收合鍵或排名列，⛔ 不是這個畫面唯一的出口。
   * ⇒ 一個純手把玩家要盲推好幾次才找得到 `返回大廳`。
   *
   * 做法照 `ui/LeaveConfirmDialog` 的同一個模板（⛔ 不是第二套機制）：真的
   * `el.focus()` **加上** `applyPadFocus` 的光暈 —— 光暈是 pad-only 的提示，
   * 而 `focusedInScope()` 只認得那個屬性，所以只做 DOM focus 是「說了但不會
   * 發生」（第一·五守則）。⚠️ `Btn` 沒有 `...rest`，寫 `data-*` 會被靜默丟掉，
   * 所以拿到把手的是它明文開的 `btnRef`。
   *
   * ⚠️ 等 `cardHeld` 放開才做：贏家的卡片被烤雞煙火扣住那段時間，整片 wash 是
   * `pointerEvents: "none"`、卡片還沒淡入，把焦點放到一個**按不下去**的按鈕上
   * 比沒有起始焦點更糟。第一次真的滑鼠／鍵盤輸入會由 `PadFocusNav` 的
   * `onUserInput` 把光暈收掉，所以這對非手把玩家不留痕跡。
   */
  const exitRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (cardHeld) return;
    const el = exitRef.current;
    if (!el) return;
    applyPadFocus(el);
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }, [cardHeld]);

  // 「查看戰績變化」 — the per-round panel (owner, 2026-07-27). Closed by
  // default: the grade, the breakdown and the auto-scrolling ranking are what
  // this screen opens with, and the chart is what a player asks for afterwards.
  const [showProgress, setShowProgress] = useState(defaultChartOpen);

  // ⭐ 收到最小（owner 2026-08-15：「全戰鬥結算以後 戰績評價可以收到最小」）。
  //
  // ⚠️ 狀態住在**玩家設定**而不是這裡的 `useState`：一個每場都要重按一次的
  //    收合鍵等於沒有做。`settings.ui.matchEndCollapsed` 會被存起來。
  // ⛔ 收合**不會**藏掉 `返回大廳` —— 那是這個畫面的 `providesExit`（#107 的
  //    版面表就是這樣宣告的）。把唯一的出口收進一個折疊區裡 = 玩家出不去。
  const collapsed = useSettings((st) => st.ui.matchEndCollapsed);
  const toggleCollapsed = (): void =>
    settingsStore.patchUi({ matchEndCollapsed: !collapsed });

  // WHERE the chart opens (owner, 2026-07-30: 「查看戰績變化折線圖太低,縮小一點
  // 顯示在右邊比較好」). It used to be the LAST child of this card, under the
  // 返回大廳 row and inside `maxHeight: 92vh; overflowY: auto` — i.e. below the
  // fold. It is now the `progress-chart` #107 surface: a narrower card docked at
  // the TOP of the right-hand strip, inside the top-right slot column so it can
  // never land under the portal-ed audio cluster.
  //
  // THREE MODES, and the table on `MATCH_END_CARD_MIN_W` is where they are
  // documented with their measured boundaries: side-by-side (the card shrinks),
  // overlay (the chart paints over a full-width card), and no docked strip at
  // all (the panel falls back into the card's own flow). ⚠️ `chartStyle` comes
  // from `progressChartSurfaceStyle`, NOT from `useHudSurface`: the latter
  // resolves against the LIVE scene while `matchEndCardWidth` resolves against
  // `matchEndScene()`, and a reserved strip computed from one scene while the
  // card is placed from another is a covered settlement waiting to happen.
  const viewport = useHudViewport();
  const touch = hudTouch();
  const chartStyle = progressChartSurfaceStyle(viewport, touch);
  const chartOpen = showProgress && chartStyle !== null;
  const cardWidth = matchEndCardWidth(viewport, touch, chartOpen) ?? matchEndCardCap(viewport);
  const reserveRight = matchEndReserveRight(viewport, touch, chartOpen);

  // The chart's inputs, derived once per settlement rather than per render: the
  // MVP ranking re-scores all 12 players in every round, so recomputing it on a
  // re-render (the chicken hold, the taunt subtitle, the auto-scroll) would be
  // pure waste. Hooks run before the fallback early-return below.
  const myTeamSeats = useMemo(() => {
    const myTeam = players.find((p) => p.seatId === localSeatId)?.teamId ?? null;
    if (myTeam === null) return localSeatId === null ? [] : [localSeatId];
    // team order, so the legend and the line colours are stable
    return players.filter((p) => p.teamId === myTeam).map((p) => p.seatId).sort((a, b) => a - b);
  }, [players, localSeatId]);

  const progressSeries = useMemo(
    () => buildProgressSeries(settlement?.rounds ?? [], myTeamSeats, localSeatId),
    [settlement, myTeamSeats, localSeatId],
  );

  // The signed-in seat's UNSPENT gold at match end — the settlement payload has
  // `goldEarned` (lifetime income) but not the balance, and 「你還有 3200 金沒花」
  // is a claim about the BALANCE. SeatView.gold is that balance.
  const myGoldLeft = seats.find((s) => s.seatId === localSeatId)?.gold ?? 0;
  const progressTips = useMemo(() => {
    if (localSeatId === null || !local) return [];
    return progressAdvice({
      rounds: settlement?.rounds ?? [],
      localSeatId,
      teamSeatIds: myTeamSeats,
      stats: local.stats,
      goldLeft: myGoldLeft,
    });
  }, [settlement, localSeatId, local, myTeamSeats, myGoldLeft]);

  if (!hasPayload) return <TeamPlacementFallback />;

  const won = wonMatch;
  const victory = victoryPresentation("match");
  const nameForSeat = (seatId: number): string =>
    seats.find((s) => s.seatId === seatId)?.displayName || `Seat ${seatId}`;

  return (
    <div
      // THE MOUNT FINGERPRINT. The 戰績變化 surface is behind a button press and
      // this package's vitest env is `node`, so a guard can prove its PLACEMENT
      // only by rendering this component directly through `defaultChartOpen` —
      // which leaves 「is it mounted in HudRoot at all?」 unasked. Measured
      // 2026-07-30 (mutation M11): replacing HudRoot's
      // `{phase === "matchEnd" && <MatchEndPanel />}` with `{false && …}` deleted
      // the whole settlement screen and left 378 files / 4517 client tests green
      // (failure shape ③). `hud/hudSurfacePaint.test.ts` now renders HudRoot at
      // `matchEnd` and looks for this attribute.
      data-hud-mount="match-end"
      // GH#504 — 55, over pause(50). Without it the pad's root was
      // `document.body`, and `HudRoot` mounts `<Scoreboard />` in EVERY phase:
      // the D-pad moved focus onto a button painted at HUD_Z.slot (25) and
      // buried under this panel — `isVisible` does no occlusion test — so A
      // opened a drawer nobody could see.
      {...padModalScope("match-end")}
      style={{
        position: "absolute",
        inset: 0,
        // #107: the "match-end" registry row declares `z: HUD_Z.screen` and
        // `providesExit: true` — persistent chrome is allowed to HIDE under
        // this panel precisely because it out-ranks it. Say the number, for the
        // same reason the shop now does: managed slots really paint at
        // HUD_Z.slot (25), and DOM order is not a contract.
        zIndex: HUD_Z.screen,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // 暗色底 (task #93). While the card is HELD for the giant chicken the
        // wash runs at its light variant — the full 0.86-alpha near-black plus
        // brightness(0.55) would dim the very firework the hold exists to show.
        // It settles into the real 暗色底 on the same curve the card fades in on.
        background: cardHeld ? victory.backgroundHeld : victory.background,
        backdropFilter: cardHeld ? victory.backdropFilterHeld : victory.backdropFilter,
        WebkitBackdropFilter: cardHeld ? victory.backdropFilterHeld : victory.backdropFilter,
        transition: `background ${MATCH_WASH_SETTLE_MS}ms ease-out, backdrop-filter ${MATCH_WASH_SETTLE_MS}ms ease-out`,
        pointerEvents: cardHeld ? "none" : "auto",
        padding: MATCH_END_PAD,
        // the strip the 戰績變化 card takes, so the centred settlement card
        // shifts left instead of being covered by it (#219, owner ③)
        paddingRight: reserveRight,
        boxSizing: "border-box",
      }}
    >
      {cardHeld && tauntText ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: "18%",
            transform: "translateX(-50%)",
            maxWidth: "min(78vw, 720px)",
            textAlign: "center",
            fontSize: "clamp(16px, 2.4vh, 24px)",
            fontWeight: 800,
            lineHeight: 1.5,
            color: "#f6e7c8",
            textShadow: "0 2px 12px rgba(0,0,0,0.9)",
            pointerEvents: "none",
          }}
        >
          {tauntText}
        </div>
      ) : null}
      <div
        style={{
          // held: transparent + click-through so the giant chicken reads; the
          // card stays MOUNTED (refs alive) so nothing below has to re-arm.
          opacity: cardHeld ? 0 : 1,
          transition: "opacity 420ms ease-out",
          // was `min(760px, 96vw)`; the cap is unchanged, but it now GIVES BACK
          // the strip the 戰績變化 card takes (hud/hudSurfaces).
          width: cardWidth,
          maxHeight: "92vh",
          overflowY: "auto",
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 14,
          padding: 20,
          color: TEXT_MAIN,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <style>{AUTO_SCROLL_HIGHLIGHT_CSS}</style>
        <MatchEndCollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} />
        {local ? (
          <>
            <GradeSplash player={local} won={won} />
            {/* 收合時只留 GradeSplash（名次 + 評價 + 名字）。⛔ 不是把整張卡片
                藏掉 —— owner 要的是「收到最小」，最小仍然要看得到自己拿了什麼。 */}
            {collapsed ? null : (
              <>
                <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>個人數據</div>
                <StatBreakdown player={local} settlement={settlement} />
                <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>賽後檢討</div>
                <Reflections player={local} />
              </>
            )}
          </>
        ) : (
          <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 12, textAlign: "center", color: won ? "#f2c637" : TEXT_MAIN }}>
            {won ? "勝利！" : "戰鬥結束"}
          </div>
        )}

        {/* 團隊累積積分 (task #212). 讀的是 `teamStandings()` —— 回合勝利畫面
            讀的**同一支**,而且連格式化都共用同一個 component。owner 的要求是
            「團隊累積積分」在兩個畫面是同一個數字;做法只能是兩邊呼叫同一支
            函式,各自算一次遲早會在某一回合分岔而玩家分不出哪個是真的。
            這份帳的範圍與代價(重連會失去先前回合)見 panels/teamLedger §3,
            所以「累積 N 回合」也印在旁邊。 */}
        {collapsed ? null : (
          <>
            {/* GH#126 —— 團隊生命值。⛔ 與上面的「累積積分」是兩個不同的數字：
                積分是回合表現的帳（panels/teamLedger，重連會斷），生命值是
                伺服器權威的計分板，而 `finalStandings()` 正是拿它排全場名次。
                放在積分**前面**，因為它才是「你為什麼是這個名次」的答案。 */}
            <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>團隊生命值</div>
            <TeamLivesRows localTeamId={local?.teamId ?? null} />

            <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, marginTop: 12 }}>團隊累積積分</div>
            <TeamPointsRows
              standings={teamStandings()}
              localTeamId={local?.teamId ?? null}
              roundsSeen={teamLedger.roundsSeen()}
            />

            <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, marginTop: 12 }}>本場排名</div>
            <RankingTable
              players={players}
              localSeatId={localSeatId}
              winnerTeam={settlement.winnerTeam}
              nameForSeat={nameForSeat}
              scroll={scroll}
            />
          </>
        )}

        {/* 查看戰績變化 — expands IN PLACE (owner, 2026-07-27). It used to call
            store.viewRankChange(), which IS a navigation: it sets lobbyView and
            then awaits returnToLobby(). That flow is correct and untouched where
            it belongs (the lobby leaderboard); what was wrong was hanging it on
            the one screen the owner had just asked to STAY on. There were TWO
            such buttons here (查看戰績變化 + 查看排名變化) — both left. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
          <Btn
            kind="primary"
            onClick={() => setShowProgress((v) => !v)}
            style={{ flex: 1 }}
            aria-expanded={showProgress}
          >
            {showProgress ? "收起戰績變化" : "查看戰績變化"}
          </Btn>
          {/* GH#528 — 這顆是手把的起始焦點（見上面 `exitRef` 的效果）。 */}
          <Btn btnRef={exitRef} onClick={() => void returnToLobby()}>
            返回大廳
          </Btn>
        </div>
      </div>

      {/* 戰績變化 — a SIBLING of the card, not its last child. Absolutely
          positioned by the #107 surface registry when there is a strip for it
          (so it never re-flows the settlement and never sits below the fold),
          and a plain flex sibling on a viewport with no room for a docked card. */}
      {showProgress ? (
        <ProgressChartPanel
          series={progressSeries}
          advice={progressTips}
          nameForSeat={nameForSeat}
          onClose={() => setShowProgress(false)}
          surface={chartStyle}
        />
      ) : null}
    </div>
  );
}

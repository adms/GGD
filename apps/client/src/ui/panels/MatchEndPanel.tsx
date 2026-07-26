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
import { useEffect, useRef, useState } from "react";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import type { SettlementPlayer } from "@ggd/shared/protocol/messages";
import { useHud } from "../../net/RoomStore";
import { HUD_Z } from "../hud/hudLayout";
import { useApp } from "../platform/store";
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
  MATCH_QUOTE_DELAY_MS,
  MATCH_WASH_SETTLE_MS,
  matchCardHeld,
  victoryPresentation,
} from "../../render/victoryPresentation";
import {
  AUTO_SCROLL_HIGHLIGHT_CSS,
  highlightClass,
  useAutoScrollToRow,
  type AutoScrollToRowHandle,
} from "../scroll/useAutoScrollToRow";
import { PANEL_BG, PANEL_BORDER, teamCss, TEXT_DIM, TEXT_MAIN } from "../theme";

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

/** The local player's full per-stat breakdown grid. */
function StatBreakdown(props: { player: SettlementPlayer }): React.JSX.Element {
  const rows = buildStatBreakdown(props.player.stats);
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
              <span style={{ width: 66, textAlign: "right", color: TEXT_MAIN }}>{formatKda(p.stats)}</span>
              <span style={{ width: 60, textAlign: "right", color: TEXT_DIM }}>{Math.round(p.stats.damageDealt).toLocaleString("en-US")}</span>
            </div>
          );
        })}
      </div>
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

export function MatchEndPanel(): React.JSX.Element {
  const settlement = useHud((s) => s.settlement);
  const localSeatId = useHud((s) => s.localSeatId);
  const seats = useHud((s) => s.seats);
  const viewRankChange = useApp((s) => s.viewRankChange);
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
  const [holdDone, setHoldDone] = useState(false);
  const cardHeld = matchCardHeld(wonMatch, holdDone ? MATCH_PANEL_HOLD_MS : 0);
  useEffect(() => {
    setHoldDone(false);
    if (!wonMatch) return;
    const t = setTimeout(() => setHoldDone(true), MATCH_PANEL_HOLD_MS);
    return () => clearTimeout(t);
  }, [wonMatch]);

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
  const winQuoteChamp = localWinQuoteChampion(settlement, localSeatId);
  useEffect(() => {
    if (!winQuoteChamp) return;
    const t = setTimeout(() => {
      void playChampionQuote(winQuoteChamp).catch(() => {});
      // the local match-winner's own cloned 勝利宣言 alongside the 名言 (client-only;
      // no generated pack → silent no-op).
      playContextualVoice(winQuoteChamp, "victory");
    }, MATCH_QUOTE_DELAY_MS);
    return () => clearTimeout(t);
  }, [winQuoteChamp]);

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

  if (!hasPayload) return <TeamPlacementFallback />;

  const won = wonMatch;
  const victory = victoryPresentation("match");
  const nameForSeat = (seatId: number): string =>
    seats.find((s) => s.seatId === seatId)?.displayName || `Seat ${seatId}`;

  return (
    <div
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
        padding: 16,
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
          width: "min(760px, 96vw)",
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
        {local ? (
          <>
            <GradeSplash player={local} won={won} />
            <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>個人數據</div>
            <StatBreakdown player={local} />
            <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>賽後檢討</div>
            <Reflections player={local} />
          </>
        ) : (
          <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 12, textAlign: "center", color: won ? "#f2c637" : TEXT_MAIN }}>
            {won ? "勝利！" : "戰鬥結束"}
          </div>
        )}

        <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>本場排名</div>
        <RankingTable
          players={players}
          localSeatId={localSeatId}
          winnerTeam={settlement.winnerTeam}
          nameForSeat={nameForSeat}
          scroll={scroll}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
          <Btn kind="primary" onClick={() => viewRankChange()} style={{ flex: 1 }}>
            查看戰績變化
          </Btn>
          <Btn onClick={() => void returnToLobby()}>返回大廳</Btn>
          <Btn kind="primary" onClick={() => viewRankChange()}>
            查看排名變化
          </Btn>
        </div>
      </div>
    </div>
  );
}

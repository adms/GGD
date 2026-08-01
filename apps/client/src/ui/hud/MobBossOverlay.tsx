/**
 * MobBossOverlay — 殭屍王降臨橫幅 + 分紅結算面板 (task #262, GH #190).
 *
 * Three pieces, deliberately, exactly like `KillCombo`:
 *   • `MobBossBannerView` / `MobBossSettlementView` — PURE presentation. Props
 *     in, markup out; no store, no timers, no clock. That is what lets
 *     `mobBoss.test.ts` render them with `renderToStaticMarkup` in the node env
 *     and read the NUMBERS AND THE RULE SENTENCE back out of the DOM — the
 *     difference between 「the model is right」 and 「the player can see it」.
 *   • `MobBossOverlay` — the container HudRoot mounts: the gate, the expiry
 *     poll, and the placement.
 *
 * THE GATE
 *   • combat only. Between rounds the shop owns the screen and a leftover king
 *     panel would float over a shopping card.
 *   • not in couch (split-screen) play — one centred panel for up to four seats
 *     on one screen is worse than none, the same call `KillCombo` makes.
 *   • a placement must exist. `mobBossOverlayRect` returns null when the
 *     corridor cannot hold the box without covering chrome, and null means
 *     NOTHING IS DRAWN, not 「draw it anyway at 0,0」 (#107).
 *
 * NOT SEAT-GATED. Everyone in the duel fought the king and everyone on the
 * payout sheet may read the sheet; `view.mine` only changes the WORDS on the
 * banner (「你累積擊殺 …」) and highlights your own row on the panel.
 *
 * Z-ORDER `HUD_Z.slot`, `pointer-events: none` on everything — a settlement
 * table that ate a click mid-fight would be worse than the fight being illegible.
 */
import React, { useEffect, useState } from "react";
import { comboNowMs, localDuelZone, useHud } from "../../net/RoomStore";
import { controlLegendVisible, readLegendDismissed } from "../controlLegendModel";
import { hudTouch } from "./HudSlot";
import { HUD_Z, type HudRect } from "./hudLayout";
import { useActiveHudPanels } from "./useHudPanels";
import {
  BOSS_BANNER_TITLE,
  BOSS_LAST_HIT_TAG,
  BOSS_POLL_MS,
  BOSS_SETTLEMENT_TITLE,
  bossLifetime,
  bossRuleNote,
  bossVisibleInZone,
  bossRuleNoteShort,
  bossSettlementLayout,
  bossSummonLine,
  bossTotalLine,
  mobBossOverlayRect,
  type BossLifetime,
  type BossSettlementLayout,
} from "./mobBossModel";
import { useBossHealthBarSpec } from "./BossHealthBar";
import type { MobBossView } from "../../net/RoomStore";

/** Same shape as ControlLegend's / KillCombo's: the HUD has no shared hook. */
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

const SHELL_BG = "rgba(14,10,16,0.93)";

function shell(rect: HudRect, life: BossLifetime, accent: string): React.CSSProperties {
  return {
    position: "absolute",
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: rect.h,
    zIndex: HUD_Z.slot,
    pointerEvents: "none",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    padding: "6px 12px",
    borderRadius: 8,
    border: `1px solid ${accent}`,
    background: SHELL_BG,
    boxShadow: `0 0 22px ${accent}66, 0 4px 14px rgba(0,0,0,0.6)`,
    opacity: life.opacity,
    transform: `scale(${life.phase === "out" ? 0.94 + 0.06 * life.opacity : 1})`,
    transformOrigin: "50% 0%",
    overflow: "hidden",
    userSelect: "none",
  };
}

/* ── 降臨 ─────────────────────────────────────────────────────────────────── */

export function MobBossBannerView({
  rect,
  life,
  view,
  summonerName,
}: {
  rect: HudRect;
  life: BossLifetime;
  view: MobBossView;
  summonerName: string;
}): React.JSX.Element {
  const accent = view.mine ? "#ff6b3d" : "#8f5bd9";
  return (
    <div
      data-mob-boss="banner"
      data-mob-boss-mine={view.mine ? "1" : "0"}
      style={{ ...shell(rect, life, accent), alignItems: "center", justifyContent: "center", gap: 2 }}
      role="status"
      aria-live="off"
    >
      <span
        data-mob-boss="banner-title"
        style={{
          fontSize: 26,
          lineHeight: 1.1,
          fontWeight: 900,
          letterSpacing: "0.22em",
          textIndent: "0.22em",
          color: accent,
          whiteSpace: "nowrap",
          textShadow: `0 0 14px ${accent}, 0 2px 4px rgba(0,0,0,0.95)`,
          animation: `ggd-boss-pop-${view.seq % 2} 320ms cubic-bezier(.2,1.6,.4,1)`,
        }}
      >
        {BOSS_BANNER_TITLE}
      </span>
      <span
        data-mob-boss="banner-line"
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#e8d8ff",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
          textShadow: "0 1px 3px rgba(0,0,0,0.9)",
        }}
      >
        {bossSummonLine(view, summonerName)}
      </span>
      <BossKeyframes />
    </div>
  );
}

/* ── 分紅結算 ─────────────────────────────────────────────────────────────── */

export function MobBossSettlementView({
  rect,
  life,
  view,
  layout,
}: {
  rect: HudRect;
  life: BossLifetime;
  view: MobBossView;
  layout: BossSettlementLayout;
}): React.JSX.Element {
  const accent = "#ffd76a";
  const compact = layout.mode === "compact";
  return (
    <div
      data-mob-boss="settlement"
      data-mob-boss-mode={layout.mode}
      style={{ ...shell(rect, life, accent), gap: compact ? 1 : 3 }}
      role="status"
      aria-live="off"
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
        <span
          data-mob-boss="settlement-title"
          style={{
            fontSize: compact ? 13 : 16,
            fontWeight: 900,
            letterSpacing: "0.08em",
            color: accent,
            textShadow: `0 0 12px ${accent}88, 0 2px 4px rgba(0,0,0,0.95)`,
            animation: `ggd-boss-pop-${view.seq % 2} 320ms cubic-bezier(.2,1.6,.4,1)`,
          }}
        >
          {BOSS_SETTLEMENT_TITLE}
        </span>
        <span
          data-mob-boss="settlement-total"
          style={{
            fontSize: compact ? 11 : 12,
            fontWeight: 700,
            color: "#ffeaa8",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {bossTotalLine(view)}
        </span>
      </div>
      {layout.rows.map((r) => (
        <div
          key={`${r.seatId}:${r.name}`}
          data-mob-boss="row"
          data-mob-boss-you={r.you ? "1" : "0"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: r.you ? 800 : 600,
            color: r.you ? "#fff6d6" : "#cfc6b4",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            borderLeft: r.you ? `3px solid ${accent}` : "3px solid transparent",
            paddingLeft: 5,
          }}
        >
          <span style={{ flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis" }}>
            {r.name}
            {r.lastHit ? (
              <span
                data-mob-boss="lasthit-tag"
                style={{
                  marginLeft: 5,
                  padding: "0 4px",
                  borderRadius: 3,
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#1a1206",
                  background: accent,
                }}
              >
                {BOSS_LAST_HIT_TAG}
              </span>
            ) : null}
          </span>
          <span style={{ flex: "0 0 auto", color: "#ff9b7a" }}>傷害 {r.damage}</span>
          <span style={{ flex: "0 0 auto", color: "#ffd76a" }}>{r.gold} 金</span>
          <span style={{ flex: "0 0 auto", color: "#9fd7ff" }}>{r.xp} XP</span>
          {/* 等級 (GH#206). Rendered only when a level was really GRANTED: most
              configs set `bountyLevels: 0` and `grantLevels` stops at LEVEL_CAP,
              so an always-on 「+0 等」 would be permanent noise on a row that is
              already tight. A non-zero grant is the news. */}
          {r.levels > 0 ? (
            <span data-mob-boss="levels" style={{ flex: "0 0 auto", color: "#b8ff9f" }}>
              +{r.levels} 等
            </span>
          ) : null}
        </div>
      ))}
      {layout.hiddenCount > 0 ? (
        <span data-mob-boss="hidden-count" style={{ fontSize: 10, color: "#9b9384" }}>
          另有 {layout.hiddenCount} 名參戰者分得獎金
        </span>
      ) : null}
      <span
        data-mob-boss="rule-note"
        style={{
          marginTop: "auto",
          fontSize: compact ? 10 : 11,
          lineHeight: 1.35,
          fontWeight: 600,
          color: "#b9ae95",
        }}
      >
        {/* ⚠️ BOTH ARGUMENTS COME OFF THE EVENT. `lastHitMode` decides which of
            the two rules is true for THIS king (GH#206), and the panel shipped
            for one release printing the `"weight"` sentence — 「總獎金固定」 —
            under a `"bonus"` total that had just overshot the pool. */}
        {compact
          ? bossRuleNoteShort(view.lastHitMultiplier, view.lastHitMode)
          : bossRuleNote(view.lastHitMultiplier, view.lastHitMode)}
      </span>
      <BossKeyframes />
    </div>
  );
}

/** Scoped keyframes, carried by the components rather than a global sheet. TWO
 * pop names alternating on `seq`, for the same reason KillCombo needs them:
 * re-assigning the SAME animation name does not restart it. */
function BossKeyframes(): React.JSX.Element {
  return (
    <style>{`
      @keyframes ggd-boss-pop-0 { from { transform: scale(1.35); opacity: 0 } to { transform: scale(1); opacity: 1 } }
      @keyframes ggd-boss-pop-1 { from { transform: scale(1.35); opacity: 0 } to { transform: scale(1); opacity: 1 } }
      @media (prefers-reduced-motion: reduce) {
        [data-mob-boss="banner-title"], [data-mob-boss="settlement-title"] { animation: none !important }
      }
    `}</style>
  );
}

/* ── the container ────────────────────────────────────────────────────────── */

export function MobBossOverlay(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const round = useHud((s) => s.round);
  const couch = useHud((s) => s.localPlayers.length > 1);
  const boss = useHud((s) => s.mobBoss);
  const seats = useHud((s) => s.seats);
  const localSeatId = useHud((s) => s.localSeatId);
  const panels = useActiveHudPanels();
  const viewport = useViewport();

  // No per-frame stream to ride, so a cheap timer retires it. Kept OUT of the
  // pure model: the model answers 「given this instant」, this only decides how
  // often to ask.
  const [now, setNow] = useState(() => comboNowMs());
  useEffect(() => {
    const iv = setInterval(() => setNow(comboNowMs()), BOSS_POLL_MS);
    return () => clearInterval(iv);
  }, []);

  if (phase !== "combat" || couch) return null;
  const life = bossLifetime(boss, now);
  if (!life || !boss) return null;
  // …and it has to be YOUR arena's king. Both events reach every client in the
  // match; only one duel zone ever fought this one. See `bossVisibleInZone` —
  // the same rule the 恐怖 cue has always applied, finally applied to the
  // picture as well. Fails OPEN on an unresolved zone.
  if (!bossVisibleInZone(boss, localDuelZone())) return null;

  const legendUp = controlLegendVisible({
    phase,
    round,
    dismissed: readLegendDismissed(),
    panelCovering: panels.length > 0,
  });
  // #247 —— 長血條 owns the top of this corridor while the king is alive, and it
  // is PERSISTENT while this banner/panel is a 4.6 s / 8.2 s beat, so this one
  // yields. Same one entry point the bar draws from.
  const barRect = useBossHealthBarSpec()?.rect ?? null;
  const rect = mobBossOverlayRect(boss, viewport, {
    touch: hudTouch(),
    legendUp,
    couchPlayers: 1,
    barRect,
  });
  // null = this viewport genuinely has no free room. Nothing is the correct
  // answer; painting over the player's own bars is not.
  if (!rect) return null;

  const nameOf = (seatId: number): string =>
    seats.find((s) => s.seatId === seatId)?.displayName || (seatId >= 0 ? `座位 ${seatId}` : "未知英雄");

  if (boss.kind === "spawn") {
    return (
      <MobBossBannerView
        rect={rect}
        life={life}
        view={boss}
        summonerName={nameOf(boss.summonerSeatId)}
      />
    );
  }
  // `rect.h` is what the corridor could actually give, so the table decides
  // full-vs-compact against the SAME number the box was drawn at.
  const layout = bossSettlementLayout(boss, localSeatId, nameOf, rect.h);
  if (!layout) return null;
  return <MobBossSettlementView rect={rect} life={life} view={boss} layout={layout} />;
}

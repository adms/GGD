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
  bossLifetime,
  bossRuleNote,
  bossVisibleInZone,
  bossRuleNoteShort,
  bossSettlementLayout,
  bossSettlementMode,
  bossSettlementTitle,
  bossSummonLine,
  bossToastLine,
  bossTotalLine,
  mobBossOverlayRect,
  mobSettlementWording,
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
  title,
}: {
  rect: HudRect;
  life: BossLifetime;
  view: MobBossView;
  layout: BossSettlementLayout;
  /**
   * #291 —— 抬頭是**傳進來的**，不是這個檔的常數。owner 2026-08-03:
   * 「特殊殭屍 不應該用殭屍王 分紅結算畫面」。以前這裡直接印
   * `BOSS_SETTLEMENT_TITLE`，所以一隻特殊殭屍的結算永遠寫著「殭屍王 分紅結算」。
   */
  title: string;
}): React.JSX.Element {
  const accent = "#ffd76a";
  const compact = layout.mode === "compact";
  return (
    <div
      data-mob-boss="settlement"
      data-mob-boss-mob={view.mobKind}
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
          {title}
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

/* ── 分紅結算 · toast (#291) ──────────────────────────────────────────────── */

/**
 * `special.settlementMode: "toast"` 的那一行。
 *
 * 為什麼它是一個**真的元件**而不是「面板但矮一點」：owner 抱怨過「怎麼會收到好幾次
 * 分紅結算」，而一隻特殊殭屍現在一回合會死好幾隻。`toast` 要的是「知道有這件事、
 * 知道自己拿多少」，不是一張要讀的表 —— 所以它沒有列、沒有規則句，只有一行。
 */
export function MobBossToastView({
  rect,
  life,
  view,
  line,
}: {
  rect: HudRect;
  life: BossLifetime;
  view: MobBossView;
  line: string;
}): React.JSX.Element {
  const accent = "#ffd76a";
  return (
    <div
      data-mob-boss="settlement-toast"
      data-mob-boss-mob={view.mobKind}
      style={{
        ...shell(rect, life, accent),
        alignItems: "center",
        justifyContent: "center",
        padding: "4px 12px",
      }}
      role="status"
      aria-live="off"
    >
      <span
        data-mob-boss="toast-line"
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "#ffeaa8",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {line}
      </span>
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

  // ⚠️ **這個 hook 必須在每一個 `return null` 之前** —— 它是 2026-08-01 起
  // owner 回報五次「所有介面突然都消失」的 root cause。
  //
  // 它原本寫在下面那兩個 early return 之後（`4af1b5c1` / v0.9.17 插進來的）。
  // `useBossHealthBarSpec` 是真的 hook 鏈（≥12 個 hook：4×useHud +
  // useActiveHudPanels + useViewport + useBossMarker）。於是：
  //   · 沒有連殺時 → 提早 return → 這一格的 hook 數是 N
  //   · 連殺出現時 → 走到底 → hook 數變成 N+12
  //   → React 丟 `Rendered more hooks than during the previous render.`
  //     （production 是 minified #310；退場時反向丟 #300）
  //   → **render 期間的未捕捉例外 = React 18 卸載整個 root**，而 `main.tsx`
  //     的 `root.render` 只在開機呼叫一次 → 這個分頁剩下的時間都沒有介面。
  //
  // 為什麼是「殭屍波出現後才消失」：`KILL_COMBO_MIN_SHOWN = 2`（5 秒內 2 殺），
  // 而 owner 裁定**殭屍與英雄都算同一個連殺數**（見 sim/combat/killCombo.ts）。
  // 第 1–2 回合沒有殭屍波，英雄擊殺幾乎不可能 5 秒內連 2 殺 → 這個 hook 從來
  // 沒被呼叫過 → hook 數穩定。第 3 回合殭屍波進場，一發 AoE 掃過殭屍堆就是
  // 同一 tick 連殺 → 當場踩爆。owner 的第五句話一字不差。
  //
  // 守衛：`ui/hud/hookOrder.test.ts` 用真的 react-dom + jsdom 做兩次 render
  // （第一次回 null、第二次有內容），把這一行搬回去就會紅。
  const barRect = useBossHealthBarSpec()?.rect ?? null;

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
  // #291 —— 「這一則是王還是特殊殭屍」決定抬頭與呈現模式。讀的是同一份
  // arena-rules（後台 overlay ?? content/），所以後台改完字，玩家重新整理就換。
  const wording = mobSettlementWording();
  const settlementMode = bossSettlementMode(boss, wording);
  // #247 —— 長血條 owns the top of this corridor while the king is alive, and it
  // is PERSISTENT while this banner/panel is a 4.6 s / 8.2 s beat, so this one
  // yields. Same one entry point the bar draws from.
  const rect = mobBossOverlayRect(boss, viewport, {
    touch: hudTouch(),
    legendUp,
    couchPlayers: 1,
    barRect,
    settlementMode,
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
  const title = bossSettlementTitle(boss, wording);
  // #291 —— `"toast"`：一行帶過。`"off"` 已經在 `mobBossOverlayRect` 回 null 了,
  // 所以走到這裡只剩 panel / toast 兩種。
  if (settlementMode === "toast") {
    return (
      <MobBossToastView
        rect={rect}
        life={life}
        view={boss}
        line={bossToastLine(boss, title, localSeatId)}
      />
    );
  }
  // `rect.h` is what the corridor could actually give, so the table decides
  // full-vs-compact against the SAME number the box was drawn at.
  const layout = bossSettlementLayout(boss, localSeatId, nameOf, rect.h);
  if (!layout) return null;
  return (
    <MobBossSettlementView rect={rect} life={life} view={boss} layout={layout} title={title} />
  );
}

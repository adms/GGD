/**
 * BossIntroOverlay —— 殭屍王出場演出的畫面 (owner 2026-08-02).
 *
 * 音效不在這裡，而且**刻意不在**：`mobBossSpawn` 早就對到
 * `audio/combatSfx.bossHorrorKey` 的 4.4 秒恐怖音效（區域閘過的）。在這裡再播
 * 一次只會變成兩層疊在一起的同一段聲音 —— 這個 repo 的 `eventFanout` 檔頭把
 * 「同一個事件被兩邊各響一次」列成第 3 條要先檢查的事，就是為了這個。
 * 所以演出的三拍是：**音效（既有）→ 大字名言 → 描述/要點/弱點面板 → 淡出**。
 *
 * 兩塊，和 `MobBossOverlay` 同一個形狀：
 *   · {@link BossIntroView} —— 純表現。props 進、markup 出，沒有 store 沒有時鐘，
 *     所以 `bossIntro.test.ts` 可以用 `renderToStaticMarkup` 把**畫面上的字**讀
 *     回來（「模型算對了」和「玩家看得到」是兩件事）。
 *   · {@link BossIntroOverlay} —— HudRoot 掛的那個：閘、過期輪詢、擺放。
 *
 * ⚠️ 全程 `pointer-events: none`。王一出場戰鬥就開始，一個吃掉點擊的提示面板
 * 比看不到提示糟得多。
 */
import React, { useEffect, useState } from "react";
import { comboNowMs, localDuelZone, useHud } from "../../net/RoomStore";
import { controlLegendVisible, readLegendDismissed } from "../controlLegendModel";
import { hudTouch } from "./HudSlot";
import { HUD_Z, type HudRect } from "./hudLayout";
import { useActiveHudPanels } from "./useHudPanels";
import { BOSS_POLL_MS, bossVisibleInZone } from "./mobBossModel";
import { useBossHealthBarSpec } from "./BossHealthBar";
import {
  bossIntroContentFor,
  bossIntroLifetime,
  bossIntroPlacement,
  bossIntroRules,
  type BossIntroLayout,
  type BossIntroLifetime,
} from "./bossIntroModel";

/** 和 KillCombo / MobBossOverlay 同一個形狀：HUD 沒有共用的 viewport hook。 */
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

export const BOSS_INTRO_TIPS_HEAD = "攻略要點";
export const BOSS_INTRO_WEAK_HEAD = "弱點";

const ACCENT = "#8f5bd9";
const WEAK_ACCENT = "#ff8a5c";

export function BossIntroView({
  rect,
  life,
  layout,
}: {
  rect: HudRect;
  life: BossIntroLifetime;
  layout: BossIntroLayout;
}): React.JSX.Element {
  return (
    <div
      data-boss-intro="panel"
      data-boss-intro-phase={life.phase}
      style={{
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
        gap: 2,
        padding: "6px 12px",
        borderRadius: 8,
        border: `1px solid ${ACCENT}`,
        background: "rgba(14,10,16,0.93)",
        boxShadow: `0 0 22px ${ACCENT}66, 0 4px 14px rgba(0,0,0,0.6)`,
        opacity: life.opacity,
        overflow: "hidden",
        userSelect: "none",
      }}
      role="status"
      aria-live="off"
    >
      {/* 大字名言。**沒有資料時整段不畫** —— 不是一個空框（見 bossIntroModel 檔頭②）。 */}
      {layout.quote === null ? null : (
        <span
          data-boss-intro="quote"
          style={{
            fontSize: 24,
            lineHeight: 1.25,
            fontWeight: 900,
            letterSpacing: "0.06em",
            color: "#f4e9ff",
            textShadow: `0 0 16px ${ACCENT}, 0 2px 4px rgba(0,0,0,0.95)`,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          「{layout.quote}」
        </span>
      )}
      <span
        data-boss-intro="name"
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: ACCENT,
          letterSpacing: "0.08em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {layout.name}
      </span>
      {layout.description === null ? null : (
        <span
          data-boss-intro="description"
          style={{
            fontSize: 12,
            lineHeight: 1.35,
            fontWeight: 600,
            color: "#d8cfe6",
            overflow: "hidden",
          }}
        >
          {layout.description}
        </span>
      )}
      {layout.tips.length === 0 ? null : (
        <div data-boss-intro="tips" style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#9fd7ff" }}>
            {BOSS_INTRO_TIPS_HEAD}
          </span>
          {layout.tips.map((t) => (
            <span
              key={t}
              data-boss-intro="tip"
              style={{ fontSize: 12, lineHeight: 1.35, color: "#cfe6ff", fontWeight: 600 }}
            >
              ・{t}
            </span>
          ))}
        </div>
      )}
      {layout.weaknesses.length === 0 ? null : (
        <div data-boss-intro="weaknesses" style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: WEAK_ACCENT }}>
            {BOSS_INTRO_WEAK_HEAD}
          </span>
          {layout.weaknesses.map((w) => (
            <span
              key={w}
              data-boss-intro="weakness"
              style={{ fontSize: 12, lineHeight: 1.35, color: "#ffd6c4", fontWeight: 600 }}
            >
              ・{w}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 容器。閘的每一條都和 `MobBossOverlay` 對齊，理由也一樣：
 *   · 只在戰鬥階段（回商店之後留一面王的提示會浮在購物卡上）；
 *   · 不在同機多人（一面置中面板服務四個座位比不畫還糟）；
 *   · 只給**自己那個競技場**看（`bossVisibleInZone`，和恐怖音效同一條規則）；
 *   · 擺不下就 `null` ＝ 什麼都不畫。
 */
export function BossIntroOverlay(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const round = useHud((s) => s.round);
  const couch = useHud((s) => s.localPlayers.length > 1);
  const boss = useHud((s) => s.mobBoss);
  const panels = useActiveHudPanels();
  const viewport = useViewport();
  const [now, setNow] = useState(() => comboNowMs());
  useEffect(() => {
    const iv = setInterval(() => setNow(comboNowMs()), BOSS_POLL_MS);
    return () => clearInterval(iv);
  }, []);
  const barRect = useBossHealthBarSpec()?.rect ?? null;

  if (phase !== "combat" || couch) return null;
  const rules = bossIntroRules();
  const life = bossIntroLifetime(boss, now, rules);
  if (!life || !boss) return null;
  if (!bossVisibleInZone(boss, localDuelZone())) return null;
  const content = bossIntroContentFor(boss.championId, rules);
  if (!content) return null;

  const legendUp = controlLegendVisible({
    phase,
    round,
    dismissed: readLegendDismissed(),
    panelCovering: panels.length > 0,
  });
  const placed = bossIntroPlacement(content, viewport, {
    touch: hudTouch(),
    legendUp,
    couchPlayers: 1,
    barRect,
  });
  if (!placed) return null;
  return <BossIntroView rect={placed.rect} life={life} layout={placed.layout} />;
}

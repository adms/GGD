/**
 * BossHealthBar — 殭屍王長血條 (#247, owner 2026-08-01).
 *
 * 兩塊,跟 `MobBossOverlay` / `KillCombo` 同一個切法:
 *   • {@link BossHealthBarView} —— 純呈現。props 進、markup 出,沒有 store、沒有
 *     計時器、沒有時鐘。這就是 `bossHealthBar.test.ts` 能用
 *     `renderToStaticMarkup` 在 node 環境把**數字與寬度**讀回來的原因 ——
 *     「模型算對了」跟「玩家看得到」是兩件事(失敗形態 ①③)。
 *   • {@link BossHealthBar} —— HudRoot 掛的容器:閘門 + 每幀取樣 + 位置。
 *
 * 為什麼是**每幀取樣**而不是 store 訂閱:王的 hp 住在 `frameBus.mobBoss`
 * (`GameApp` 每一幀從快照重建),不在 zustand 裡 —— 而且它必須不在,快照率的
 * 數字灌進 store 會讓整棵 HUD 每一幀 re-render。所以這裡跟 `Minimap` 一樣騎
 * `requestAnimationFrame`,只把**這一條**的 state 換掉。
 *
 * Z-ORDER `HUD_Z.slot`, `pointer-events: none` —— 一條吃掉點擊的血條比看不懂的
 * 戰鬥更糟。
 */
import React, { useEffect, useRef, useState } from "react";
import { parseMobVisualJson } from "@ggd/shared/sim/mobs";
import { frameBus, type MobBossMarker } from "../../frameBus";
import { localDuelZone, useHud } from "../../net/RoomStore";
import { controlLegendVisible, readLegendDismissed } from "../controlLegendModel";
import { hudTouch } from "./HudSlot";
import { HUD_Z } from "./hudLayout";
import { useActiveHudPanels } from "./useHudPanels";
import {
  BOSS_BAR_COLOR,
  BOSS_BAR_TITLE,
  bossHealthBarSpec,
  bossHpText,
  type BossHealthBarSpec,
} from "./bossHealthBarModel";

/** Same shape as the other HUD components': the HUD has no shared hook. */
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

/* ── the picture ──────────────────────────────────────────────────────────── */

export function BossHealthBarView({ spec }: { spec: BossHealthBarSpec }): React.JSX.Element {
  const pct = Math.max(0, Math.min(1, spec.hpPct));
  return (
    <div
      data-boss-bar="root"
      data-boss-bar-anchor={spec.anchor}
      style={{
        position: "absolute",
        left: spec.rect.x,
        top: spec.rect.y,
        width: spec.rect.w,
        height: spec.rect.h,
        zIndex: HUD_Z.slot,
        pointerEvents: "none",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        padding: "4px 10px 6px",
        borderRadius: 6,
        border: `1px solid ${BOSS_BAR_COLOR}`,
        background: "rgba(14,10,16,0.86)",
        boxShadow: `0 0 20px ${BOSS_BAR_COLOR}55, 0 3px 12px rgba(0,0,0,0.6)`,
        userSelect: "none",
      }}
      role="status"
      aria-live="off"
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span
          data-boss-bar="title"
          style={{
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: "0.18em",
            color: BOSS_BAR_COLOR,
            textShadow: `0 0 10px ${BOSS_BAR_COLOR}, 0 1px 3px rgba(0,0,0,0.95)`,
            whiteSpace: "nowrap",
          }}
        >
          {BOSS_BAR_TITLE}
        </span>
        {/* ⚠️ 真實數字,不是百分比。`hpPct` 在 276k 的池子上 0.4% 還有 1,100 血,
            一條只會說「0%」的血條會告訴玩家仗打完了,而它沒有。 */}
        <span
          data-boss-bar="hp-text"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#ffd9e1",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {bossHpText(spec.hp, spec.maxHp)}
        </span>
      </div>
      <div
        data-boss-bar="track"
        style={{
          position: "relative",
          height: 10,
          borderRadius: 5,
          background: "rgba(255,255,255,0.10)",
          overflow: "hidden",
        }}
      >
        <div
          data-boss-bar="fill"
          // `data-boss-bar-pct` 是給守衛讀的:CSS 百分比字串在 jsdom-less 的
          // `renderToStaticMarkup` 裡也讀得到,但一個明確的數字屬性讓斷言不必
          // 去 parse style 字串(那種斷言對壞掉的實作也常常會過)。
          data-boss-bar-pct={pct.toFixed(4)}
          style={{
            position: "absolute",
            inset: 0,
            width: `${(pct * 100).toFixed(2)}%`,
            borderRadius: 5,
            background: `linear-gradient(90deg, #8f0f2c 0%, ${BOSS_BAR_COLOR} 100%)`,
            boxShadow: `0 0 12px ${BOSS_BAR_COLOR}aa`,
          }}
        />
      </div>
    </div>
  );
}

/* ── the container ────────────────────────────────────────────────────────── */

/**
 * `frameBus.mobBoss` sampled once per animation frame.
 *
 * A COPY, not the live object: the bus reuses its marker across frames, so
 * handing React the same reference would make every `useState` write look
 * unchanged. Returns null on the frames with no king (which is most of them).
 */
function useBossMarker(): MobBossMarker | null {
  const [marker, setMarker] = useState<MobBossMarker | null>(null);
  const raf = useRef(0);
  useEffect(() => {
    if (typeof window === "undefined" || typeof requestAnimationFrame !== "function") return;
    let alive = true;
    const tick = (): void => {
      if (!alive) return;
      const m = frameBus.mobBoss;
      setMarker((prev) => {
        if (!m) return prev === null ? prev : null;
        if (
          prev &&
          prev.entityId === m.entityId &&
          prev.hp === m.hp &&
          prev.maxHp === m.maxHp &&
          prev.zone === m.zone &&
          prev.worldX === m.worldX &&
          prev.worldZ === m.worldZ
        ) {
          return prev;
        }
        return { ...m };
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf.current);
    };
  }, []);
  return marker;
}

/**
 * THE ONE resolver for 「這一幀長血條在哪」, or null.
 *
 * Exported and shared, because THREE components need the SAME answer: this bar
 * draws it, and the 降臨橫幅 (`MobBossOverlay`) plus the 連殺計數器 (`KillCombo`)
 * both YIELD to it. Two resolvers would be two rectangles, and the yield would
 * be to a box the bar is not actually in — which is exactly the class of defect
 * `mobBossOverlayRect`'s 「ONE entry point」 note describes.
 */
export function useBossHealthBarSpec(): BossHealthBarSpec | null {
  const phase = useHud((s) => s.phase);
  const round = useHud((s) => s.round);
  const couch = useHud((s) => s.localPlayers.length > 1);
  const mobVisualJson = useHud((s) => s.mobVisualJson);
  const panels = useActiveHudPanels();
  const viewport = useViewport();
  const marker = useBossMarker();

  if (phase !== "combat" || couch) return null;
  // ⚠️ 這一行就是「後台那三格真的到得了畫面」的那一段。`parseMobVisualJson` 逐
  // 欄位降級,所以一台跑在舊 shard 前面的客戶端拿到的是出貨值,不是關掉。
  const table = parseMobVisualJson(mobVisualJson);
  const legendUp = controlLegendVisible({
    phase,
    round,
    dismissed: readLegendDismissed(),
    panelCovering: panels.length > 0,
  });
  return bossHealthBarSpec(marker, viewport, {
    touch: hudTouch(),
    legendUp,
    couchPlayers: 1,
    anchor: table.bossHealthBarAnchor,
    enabled: table.bossHealthBar,
    reveal: table.bossHealthBarReveal,
    localZone: localDuelZone(),
    camera: frameBus.cameraView,
  });
}

export function BossHealthBar(): React.JSX.Element | null {
  const spec = useBossHealthBarSpec();
  if (!spec) return null;
  return <BossHealthBarView spec={spec} />;
}

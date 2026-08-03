/**
 * 特殊殭屍頭上的小血條 —— 畫面那一半 (owner 2026-08-03).
 *
 * 兩塊，跟 `BossHealthBar` 同一個切法：
 *   • {@link MobHealthBarsView} —— 純呈現。props 進、markup 出，沒有 store、
 *     沒有計時器。這就是 `mobHealthBar.test.ts` 能在 node 環境用
 *     `renderToStaticMarkup` 把**節點與寬度**讀回來的原因：「模型算對了」跟
 *     「渲染樹上真的多了那個東西」是兩件事（失敗形態 ①③）。
 *   • {@link MobHealthBars} —— HudRoot 掛的容器：每幀取樣 `frameBus.mobBars`。
 *
 * 為什麼是每幀取樣而不是 store 訂閱：血量住在 `frameBus`（`GameApp` 每一幀從快照
 * 重建），不在 zustand 裡 —— 而且必須不在，快照率的數字灌進 store 會讓整棵 HUD
 * 每一幀 re-render（client-08）。這裡跟 `BossHealthBar` / `Minimap` 一樣騎
 * `requestAnimationFrame`，而且**只有在這一幀的規格真的變了才 setState**，所以
 * 一場沒有精英殭屍的比賽這個元件一次都不會重畫。
 *
 * `pointer-events: none` —— 一條吃掉點擊的血條比看不懂的戰鬥更糟。
 */
import React, { useEffect, useRef, useState } from "react";
import { frameBus } from "../../frameBus";
import { useHud } from "../../net/RoomStore";
import { HUD_Z } from "./hudLayout";
import {
  MOB_BAR_COLOR,
  mobBarSpecs,
  mobHealthBarConfigFrom,
  type MobBarSpec,
  type MobHealthBarConfig,
} from "./mobHealthBarModel";

/* ── the picture ──────────────────────────────────────────────────────────── */

/**
 * 每一條血條一個節點。`data-mob-bar` 是守衛認得的抓手 —— 用 data 屬性而不是
 * class，因為 class 是樣式的自由，而這個屬性是**契約**。
 */
export function MobHealthBarsView({ specs }: { specs: readonly MobBarSpec[] }): React.JSX.Element {
  return (
    <div
      data-mob-bar-layer="root"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: HUD_Z.slot,
      }}
    >
      {specs.map((s) => {
        const pct = Math.max(0, Math.min(1, s.hpPct));
        return (
          <div
            key={s.entityId}
            data-mob-bar="root"
            data-mob-bar-entity={s.entityId}
            style={{
              position: "absolute",
              left: Math.round(s.sx - s.width / 2),
              top: Math.round(s.sy),
              width: s.width,
              height: s.height,
              boxSizing: "border-box",
              border: "1px solid rgba(0,0,0,0.8)",
              borderRadius: 2,
              background: "rgba(0,0,0,0.65)",
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            <div
              data-mob-bar="fill"
              // ⚠️ 百分比寬度，不是 px：守衛讀的是這個字串，而它必須直接說出
              // 「剩多少血」，不能是一個要拿寬度回推的數字。
              style={{ height: "100%", width: `${(pct * 100).toFixed(1)}%`, background: MOB_BAR_COLOR }}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ── the container ────────────────────────────────────────────────────────── */

/** 兩幀的規格一不一樣 —— setState 的閘門（沒變就不重畫）。 */
function sameSpecs(a: readonly MobBarSpec[], b: readonly MobBarSpec[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.entityId !== y.entityId ||
      x.width !== y.width ||
      x.height !== y.height ||
      x.hpPct !== y.hpPct ||
      x.sx !== y.sx ||
      x.sy !== y.sy
    )
      return false;
  }
  return true;
}

export function MobHealthBars(): React.JSX.Element | null {
  // ⚠️ 目前 `mobVisualJson` 還沒有帶這四格（見 mobHealthBarModel 的 ② 段），所以
  // 這裡拿到的是出貨值。讀取器是逐欄位的，那條路補上的當天就會自己生效。
  const mobVisualJson = useHud((s) => s.mobVisualJson);
  const cfg: MobHealthBarConfig = mobHealthBarConfigFrom(safeParse(mobVisualJson));
  const [specs, setSpecs] = useState<MobBarSpec[]>([]);
  const live = useRef<MobBarSpec[]>([]);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  useEffect(() => {
    if (typeof requestAnimationFrame !== "function") return;
    let raf = 0;
    const loop = (): void => {
      const next = mobBarSpecs(frameBus.mobBars, cfgRef.current);
      if (!sameSpecs(next, live.current)) {
        live.current = next;
        setSpecs(next);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (specs.length === 0) return null;
  return <MobHealthBarsView specs={specs} />;
}

/** `mobVisualJson` 壞掉/沒有 → null，讀取器再降級成出貨值。 */
function safeParse(json: string | null | undefined): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

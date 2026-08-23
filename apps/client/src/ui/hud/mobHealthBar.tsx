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
export function MobHealthBarsView({
  specs,
  bindNode,
}: {
  specs: readonly MobBarSpec[];
  /**
   * 🔴 **GH#620** —— 把每一條血條的節點交給容器，讓它**每幀直寫 DOM**
   * （位置與血量），⛔ 而不是每幀 `setState` 讓 React 重跑整棵。
   * ⛔ 留白時這個元件仍然是純的（`renderToStaticMarkup` 讀得到全部，守衛不變）。
   */
  bindNode?: (entityId: number, root: HTMLDivElement | null, fill: HTMLDivElement | null) => void;
}): React.JSX.Element {
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
            ref={
              bindNode
                ? (el) => {
                    bindNode(
                      s.entityId,
                      el,
                      el?.querySelector<HTMLDivElement>('[data-mob-bar="fill"]') ?? null,
                    );
                  }
                : undefined
            }
            style={{
              position: "absolute",
              // 🔴 GH#620 —— 定位改走 `transform`，⛔ 不是 `left/top`：
              // 每幀直寫 `transform` 只重算合成，寫 `left/top` 會逼一次 layout，
              // 而 R7 場上有 60 條。⭐ 這裡仍然把**這一幀**的位置寫進 style，
              // 所以 `renderToStaticMarkup` 與掛載後的第一幀都是對的
              //（rAF 之後每幀由容器覆寫同一個屬性）。
              left: 0,
              top: 0,
              transform: `translate3d(${Math.round(s.sx - s.width / 2)}px, ${Math.round(s.sy)}px, 0)`,
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

/**
 * 🔴 **GH#620 —— 這裡只比「名冊」：誰在場、多大。**
 *
 * ⛔ 它在 2026-08-23 之前**還比 `sx`／`sy`／`hpPct`**，而那三樣**每一幀都在變**
 * （殭屍在走、在挨打）⇒ `setState` 每一幀都射 ⇒ 整棵 `MobHealthBarsView`
 * 每一幀 reconcile。檔頭那句「只有在這一幀的規格真的變了才 setState」
 * 對**移動中**的目標從來就是假的（第三守則）。
 *
 * ⚠️ 而它的規模跟著波次表走：`arena-rules.json` 的 `mobWaves.schedule`
 * 在 **R7 跳到 `maxAlivePerZone: 30` × 2 區 = 60 隻** ——
 * ⭐ 那正好是 owner 2026-08-23 說「**到第七回合就很難動作**」的那一回合。
 *
 * ⇒ 位置與血量改成**每幀直寫 DOM**（`transform` / `width`，⛔ 不碰 React），
 *   React 只在**名冊變了**（有人生、有人死、後台改了尺寸）時重跑一次。
 */
function sameSpecs(a: readonly MobBarSpec[], b: readonly MobBarSpec[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.entityId !== y.entityId || x.width !== y.width || x.height !== y.height) return false;
  }
  return true;
}

export function MobHealthBars(): React.JSX.Element | null {
  // `mobVisualJson` 真的帶著這五格（arena-rules → Zod → MobRules → MobVisualTable，
  // 見 mobHealthBarModel 的 ② 段）。讀取器是逐欄位降級的，所以跑在舊 shard 前面
  // 的客戶端拿到的是出貨值，不是一張歸零的表。
  const mobVisualJson = useHud((s) => s.mobVisualJson);
  const cfg: MobHealthBarConfig = mobHealthBarConfigFrom(safeParse(mobVisualJson));
  // ⚠️ LAZY INITIALISER，不是 `useState([])`：`frameBus.mobBars` 這一幀已經有東西了
  // （`GameApp` 在 render 之前就寫好了），從空陣列起跑等於**第一幀一定沒有血條**，
  // 而掛載這件事在戰鬥中會發生很多次（phase/round 換 key、boundary 重試）。
  // 它同時也是守衛 B 能在 jsdom 裡不轉 rAF 就讀到節點的原因。
  const [specs, setSpecs] = useState<MobBarSpec[]>(() => mobBarSpecs(frameBus.mobBars, cfg));
  const live = useRef<MobBarSpec[]>(specs);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  /** 🔴 GH#620 —— 每幀直寫的落點。React 只負責「這一條存不存在」。 */
  const nodes = useRef(new Map<number, { root: HTMLDivElement; fill: HTMLDivElement | null }>());
  const bindNode = useRef(
    (entityId: number, root: HTMLDivElement | null, fill: HTMLDivElement | null): void => {
      if (root) nodes.current.set(entityId, { root, fill });
      else nodes.current.delete(entityId);
    },
  ).current;

  useEffect(() => {
    if (typeof requestAnimationFrame !== "function") return;
    let raf = 0;
    const loop = (): void => {
      const next = mobBarSpecs(frameBus.mobBars, cfgRef.current);
      // ① 名冊變了才驚動 React（有人生 / 有人死 / 後台改尺寸）。
      if (!sameSpecs(next, live.current)) setSpecs(next);
      live.current = next;
      // ② 位置與血量**直寫**：60 條血條在動的時候，這裡是 60 次 style 寫入，
      //    ⛔ 而不是一整棵 60 個元件的 reconcile + diff + commit。
      //    ⚠️ 用 `transform` ⛔ 不是 `left/top` —— 後者每一條都會觸發 layout。
      for (const s of next) {
        const n = nodes.current.get(s.entityId);
        if (!n) continue;
        const x = Math.round(s.sx - s.width / 2);
        const y = Math.round(s.sy);
        n.root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        if (n.fill) {
          const pct = Math.max(0, Math.min(1, s.hpPct));
          n.fill.style.width = `${(pct * 100).toFixed(1)}%`;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (specs.length === 0) return null;
  return <MobHealthBarsView specs={specs} bindNode={bindNode} />;
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

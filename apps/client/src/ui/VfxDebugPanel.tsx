/**
 * VfxDebugPanel —「現在有哪些粒子發射器在跑、在哪裡」，畫在畫面上。
 *
 * GH#270：owner 回報「第二回合才出現的大片橘黃色飄浮火焰，而且有一團完全在
 * 場地外的黑色空間裡」。這條缺陷已經被**猜**錯兩次（復活圈 → v0.9.30 白改一次；
 * 火把 `arenaFire` → 出貨值早就是 `enabled:false`）。issue 裡下一步寫的是
 * 「量，不要猜」，而 owner 明說**不想開 console**。這一片就是那張 console.table，
 * 做成他在戰鬥中打得開的東西。
 *
 * ── 每一欄為什麼在這裡（少一欄這個面板就沒有結案能力）─────────────────────
 *   名字     前綴就是來源：`torch-flame-` / 技能的 vfxKey / `revive-` / …
 *   x, z     ⚠️ 最重要的一欄。截圖裡那一團在**場地外**，位置就是那條線索
 *   ●/○      `isStarted()` ——「還在生」與「只是舊粒子還沒消」是兩種缺陷
 *   活粒子   區分「一個瘋狂發射器」與「一百個各發一點」
 *   rate     同上
 *
 * 排序是活粒子由多到少（一眼看到誰佔畫面），列數有上界，超過的用「還有 N 個」
 * 說出來 —— 不靜默截斷。
 *
 * ── 三件它刻意不做的事 ─────────────────────────────────────────────────────
 * ① **不碰它在量的東西**：整支只有讀取，沒有 start/stop/dispose，取樣走自己的
 *    ~3 Hz interval（不是每幀，也不進 React 的每幀路徑）。
 * ② **不新開 bottom-left 槽位**：`hudLayout.test.ts` 釘住了那個角落的 skipTransient
 *    堆疊尾端是 `fps`，而且 780×360（#151）上離 minimap 只剩 4px。它是一個從
 *    `cheats` 槽位（右上角最後一格，既有的 dev 工具區）開出來的**抽屜**
 *    （`hudSlotPanelStyle`，第三種形狀，不進任何登錄表），開在整個右上堆疊之後，
 *    誰都不蓋。#107 的邊由那支純函式算，不是這裡手寫的座標。
 * ③ **不接任何指標事件**（`pointerEvents: "none"`）：右上角被一層透明的接收層
 *    蓋住的話，整場比賽在那裡按右鍵都不會移動。
 *
 * 開關是 `network.showVfxDebug`（設定 → Network），**自己一個閘**，不掛在
 * `showPerfOverlay` 底下 —— 見 settings/types.ts 那一格的註解與 `showPing` 的前例。
 */
import { useEffect, useState } from "react";
import {
  EMPTY_VFX_SNAPSHOT,
  VFX_DEBUG_ROW_CAP,
  readVfxEmitters,
  type VfxEmitterRow,
  type VfxEmitterSnapshot,
} from "../vfxDebugBus";
import { useSettings } from "./useSettings";
import { hudTouch } from "./hud/HudSlot";
import { hudSlotPanelMaxHeight, hudSlotPanelStyle, type HudViewport } from "./hud/hudLayout";
import { useHudSlotHidden } from "./hud/useHudPanels";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";

/** 抽屜掛在哪一格：右上角最後一格（既有的 dev 工具區）。 */
export const VFX_DEBUG_ANCHOR = "cheats" as const;

/** ~3 Hz。刻意不是每幀：面板不可以擾動它在量的東西，也不該吃畫面預算。 */
const SAMPLE_MS = 320;

const PANEL_WIDTH = 320;
/** 一列大約多高（px）—— 用來從可用高度反推真的畫得下幾列。fontSize 10.5 × 1.4。 */
const ROW_H = 15;
/** 摘要列 + 欄名列 + 頁尾那句「還有 N 個」，三行。 */
const CHROME_H = ROW_H * 3 + 5;

function readViewport(): HudViewport {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * 自己的 interval 取樣。`active` 為 false 時**完全不取樣**（interval 都不建），
 * 所以關著的時候這個面板對 scene 是零成本的。
 *
 * 開啟的那一刻先同步取一次，不然玩家要等最多 320ms 才看到第一張表。
 */
function useEmitterSample(active: boolean, limit: number): VfxEmitterSnapshot {
  const [snap, setSnap] = useState<VfxEmitterSnapshot>(() =>
    active ? readVfxEmitters(limit) : EMPTY_VFX_SNAPSHOT,
  );
  useEffect(() => {
    if (!active) {
      setSnap(EMPTY_VFX_SNAPSHOT);
      return;
    }
    setSnap(readVfxEmitters(limit));
    const id = setInterval(() => setSnap(readVfxEmitters(limit)), SAMPLE_MS);
    return () => clearInterval(id);
  }, [active, limit]);
  return snap;
}

function useViewport(): HudViewport {
  const [vp, setVp] = useState<HudViewport>(readViewport);
  useEffect(() => {
    const onResize = (): void => setVp(readViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return vp;
}

/**
 * 一律一位小數 —— **刻意不做「大數字就省略小數」的分支**：那會讓同一列的
 * x 與 z 用不同的格式印（`140, -96.0`），讀起來像資料有問題而不是像座標。
 */
const n1 = (v: number): string => v.toFixed(1);

/** 「在哪裡」那一欄的字串。⚠️ 沒有位置就說「無」，不可以印成 0,0。 */
export function formatEmitterPos(row: VfxEmitterRow): string {
  if (row.pos === null) return "—";
  return `${n1(row.pos.x)}, ${n1(row.pos.z)}`;
}

function Row({ row }: { row: VfxEmitterRow }): React.JSX.Element {
  return (
    <>
      <span
        data-vfx-name
        title={row.attachedTo === null ? row.name : `${row.name} @ ${row.attachedTo}`}
        style={{
          color: TEXT_MAIN,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {row.attach === "mesh" && <span style={{ color: "#7fa8e0" }}>⊙</span>}
        {row.name}
      </span>
      <span data-vfx-pos style={{ color: row.pos === null ? "#e5483f" : "#f2c637", textAlign: "right" }}>
        {formatEmitterPos(row)}
      </span>
      <span
        data-vfx-emitting={row.emitting ? "1" : "0"}
        title={row.emitting ? "還在發射" : "已停，畫面上只剩舊粒子"}
        style={{ color: row.emitting ? "#47cc6a" : "#8d97ad", textAlign: "center" }}
      >
        {row.emitting ? "●" : "○"}
      </span>
      <span data-vfx-alive style={{ color: TEXT_MAIN, textAlign: "right" }}>
        {row.alive}
      </span>
      <span data-vfx-rate style={{ color: TEXT_DIM, textAlign: "right" }}>
        {n1(row.emitRate)}
      </span>
    </>
  );
}

function Head(): React.JSX.Element {
  return (
    <>
      <span style={{ color: TEXT_DIM }}>名稱</span>
      <span style={{ color: TEXT_DIM, textAlign: "right" }}>x, z</span>
      <span style={{ color: TEXT_DIM, textAlign: "center" }}>發</span>
      <span style={{ color: TEXT_DIM, textAlign: "right" }}>粒子</span>
      <span style={{ color: TEXT_DIM, textAlign: "right" }}>rate</span>
    </>
  );
}

export function VfxDebugPanel(): React.JSX.Element | null {
  const show = useSettings((s) => s.network.showVfxDebug);
  const touch = hudTouch();
  const viewport = useViewport();
  // 可用高度 → 真的畫得下幾列。先算 limit 再取樣，因為「被截掉幾個」必須是
  // 真話：如果只截到 30 列卻畫了 12 列，頁尾那句「還有 N 個」就會少算。
  const maxH = hudSlotPanelMaxHeight(VFX_DEBUG_ANCHOR, viewport, touch, "stack");
  const fits = Math.max(1, Math.floor((maxH - CHROME_H) / ROW_H));
  const limit = Math.min(VFX_DEBUG_ROW_CAP, fits);
  const snap = useEmitterSample(show, limit);
  // dev 診斷，跟 fps pill / perf overlay 同一個政策：被 docked 面板蓋住就讓位。
  const covered = useHudSlotHidden(VFX_DEBUG_ANCHOR, touch);
  if (!show || covered) return null;

  const width = Math.min(PANEL_WIDTH, Math.max(0, viewport.width - 20));

  return (
    <div
      data-testid="vfx-debug"
      data-hud-drawer="vfx-debug"
      data-hud-drawer-anchor={VFX_DEBUG_ANCHOR}
      style={{
        ...hudSlotPanelStyle(VFX_DEBUG_ANCHOR, touch, "stack"),
        width,
        maxHeight: Math.max(0, maxH),
        boxSizing: "border-box",
        overflow: "hidden",
        // ⚠️ flex 欄 + 只有中間那格會被壓：780×360（#151）上右上堆疊已經吃到
        // 308px，這個抽屜只剩 ~42px。誰先被切掉是一個決定，而正確答案是
        // **列**，不是那兩行字 —— 摘要（總數）與「還有 N 個」正是這個面板的
        // 反-靜默截斷保證，它們被切掉才是缺陷（列被切掉只是資訊少一點）。
        display: "flex",
        flexDirection: "column",
        padding: "6px 8px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 8,
        color: TEXT_MAIN,
        fontSize: 10.5,
        lineHeight: 1.4,
        fontFamily: "ui-monospace, Menlo, monospace",
        fontVariantNumeric: "tabular-nums",
        // 它永遠不吃點擊 —— 見檔頭 ③
        pointerEvents: "none",
      }}
    >
      <div
        data-vfx-summary
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontWeight: 700,
          marginBottom: 3,
          flexShrink: 0,
        }}
      >
        <span>特效發射器</span>
        <span style={{ color: TEXT_DIM, fontWeight: 400 }}>
          {snap.bound ? `${snap.total} 個 · 活粒子 ${snap.aliveTotal}` : "尚未接上場景"}
        </span>
      </div>
      {!snap.bound ? (
        // fail-loud：沒接上 scene 就直說。畫成一張空表的話，「場上真的什麼都
        // 沒有」跟「面板沒接線」長得一模一樣 —— 那正是這條 issue 被誤判兩次的形狀。
        <div style={{ color: "#e5483f" }}>沒有可讀的場景（還沒進戰鬥？）</div>
      ) : snap.total === 0 ? (
        <div style={{ color: TEXT_DIM }}>場上沒有任何粒子系統</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto auto auto",
            columnGap: 7,
            // 這一格是唯一會被壓的：minHeight 0 讓 flex 真的能縮它
            flex: "1 1 auto",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <Head />
          {snap.rows.map((r, i) => (
            <Row key={`${r.name}#${i}`} row={r} />
          ))}
        </div>
      )}
      {snap.hidden > 0 && (
        // 不准靜默截斷（CLAUDE.md）：截掉幾個就寫幾個
        <div data-vfx-hidden={snap.hidden} style={{ color: TEXT_DIM, marginTop: 2, flexShrink: 0 }}>
          還有 {snap.hidden} 個沒顯示（依活粒子數排序，已顯示最多的那些）
        </div>
      )}
    </div>
  );
}

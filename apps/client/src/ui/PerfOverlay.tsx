/**
 * PerfOverlay — reads the plain-mutable perfBus (written by the rAF loop) and
 * samples it on its OWN ~4 Hz interval into React state. Per-frame perf data
 * NEVER drives React re-renders (same rule as the frameBus world anchors).
 *
 * Two surfaces, both DEV TELEMETRY — they sit in the bottom-left corner stack
 * (ui/hud/hudLayout), away from the gameplay-critical top corners:
 *  - a compact always-available FPS pill (bottom-left, above the gamepad chip),
 *  - the full overlay (fps avg/min, frame ms, ping/jitter, quality level +
 *    resolution, entity/draw/particle counts, connection chip) — toggled by
 *    the `showPerfOverlay` network setting. It is the LAST slot of its corner,
 *    so it opens clear of the whole stack instead of a hard-coded offset.
 */
import { useEffect, useState } from "react";
import { perfBus, type ConnectionQuality, type PerfBus } from "../perfBus";
import { lifecycleLedger } from "../render/lifecycleLedger";
// 🩺 owner 2026-08-23「監控 LAG 縮小找 root cause⋯**之前應該有做類似功能請整合起來**」——
//    import 這一支同時做兩件事：註冊 `__ggdDiag()`，並把 longtask/凍結量表接上
//    ⭐ **這一班既有的 4 Hz 計時器**（⛔ 不新增任何計時器、⛔ 不碰 rAF）。
import { diagSnapshot, diagWarnings } from "../perf/diag";
import { perfWatch } from "../perf/longTasks";
import { useSettings } from "./useSettings";
import { hudTouch } from "./hud/HudSlot";
import { HUD_Z, hudSlotHeight, hudSlotStyle } from "./hud/hudLayout";
import { useHudSlotHidden } from "./hud/useHudPanels";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";

const SAMPLE_MS = 250; // 4 Hz — decoupled from the render rate

/** Snapshot the plain perfBus (no per-frame React state). */
interface Snap {
  fps: number;
  avgFps: number;
  minFps: number;
  frameMs: number;
  workMs: number;
  capabilityFps: number;
  fpsCap: number;
  pingMs: number;
  jitterMs: number;
  snapshotGapMs: number;
  connection: ConnectionQuality;
  qualityLevel: number;
  resolutionScale: number;
  particleDensity: number;
  shadows: boolean;
  adaptiveActive: boolean;
  entityCount: number;
  drawCount: number;
  particleCount: number;
  /** ⭐ GH#609 —— 四格「有東西不對勁」的計數器（見 `healthWarnings`）。 */
  renderLoopErrors: number;
  orphanRooms: number;
  foreignSnapshots: number;
  unexpectedDisconnects: number;
  /** 🔬 生命週期登記表：現在有幾類東西「還在長」＋最嚴重的那一類。 */
  lifecycleGrowth: number;
  lifecycleWorst: string;
  /**
   * 🩺 幀外開銷 —— ⭐ **wall − rAF 工作 − 上限刻意閒置**（`perf/diag.frameBudget`）。
   * ⚠️ `AdaptiveQuality` 只讀 `workMs`，所以**這一段再大它也不會降畫質** ——
   * 「fps 儀表很好看卻很卡」就住在這一格。⛔ 可以是負的（兩個滾動視窗不同步）。
   */
  unaccountedMs: number;
  /** 🩺 4Hz 取樣計時器實測的最長凍結（ms）—— ⭐ **沒有夾**，`minFps` 說不出這個數字。 */
  stallMs: number;
  /** 🩺 近 10 秒每秒被 >50ms 的 task 吃掉幾 ms；⛔ **-1 = 瀏覽器不支援**，不是 0。 */
  longTaskMsPerSec: number;
  /** 🩺 `perf/diag.diagWarnings()` —— 凍結／長任務／幀外開銷的門檻警報。 */
  diagWarn: readonly string[];
}

function snapshot(): Snap {
  const d = diagSnapshot(globalThis.performance?.now() ?? 0);
  return {
    unaccountedMs: d.budget.unaccountedMs,
    stallMs: d.stalls.worstMs,
    // ⛔ 不支援回 **-1**：「這個瀏覽器量不到」與「完全沒有長任務」在 0 上長得一模一樣。
    longTaskMsPerSec: d.longTasks.supported ? d.longTasks.msPerSec : -1,
    diagWarn: diagWarnings(d),
    fps: perfBus.fps,
    avgFps: perfBus.avgFps,
    minFps: perfBus.minFps,
    frameMs: perfBus.frameMs,
    workMs: perfBus.workMs,
    capabilityFps: perfBus.capabilityFps,
    fpsCap: perfBus.fpsCap,
    pingMs: perfBus.pingMs,
    jitterMs: perfBus.jitterMs,
    snapshotGapMs: perfBus.snapshotGapMs,
    connection: perfBus.connection,
    qualityLevel: perfBus.qualityLevel,
    resolutionScale: perfBus.resolutionScale,
    particleDensity: perfBus.particleDensity,
    shadows: perfBus.shadows,
    adaptiveActive: perfBus.adaptiveActive,
    entityCount: perfBus.entityCount,
    drawCount: perfBus.drawCount,
    particleCount: perfBus.particleCount,
    renderLoopErrors: perfBus.renderLoopErrors,
    orphanRooms: perfBus.orphanRooms,
    foreignSnapshots: perfBus.foreignSnapshots,
    unexpectedDisconnects: perfBus.unexpectedDisconnects,
    lifecycleGrowth: perfBus.lifecycleGrowth,
    lifecycleWorst: perfBus.lifecycleWorst,
  };
}

/** Sample the perfBus at SAMPLE_MS regardless of frame rate. */
function usePerfSample(active: boolean): Snap {
  const [snap, setSnap] = useState<Snap>(snapshot);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      // ⭐ 生命週期普查搭這一班車（4 Hz），⛔ **不掛在 rAF 迴圈上** ——
      //    儀表自己不可以變成成本。`tick()` 內部再節流到 `lifecycleSampleSec`
      //    （出貨 2 秒），關掉時是一個 boolean 判斷就返回。
      const nowMs = performance.now();
      // 🩺 ⭐ **同一班車**（owner：「整合起來」）。這一行有兩個作用：掛上 longtask
      //    觀察者（冪等），並且把**這個計時器自己晚了多久**記下來 ——
      //    ⭐ 那就是誠實的凍結長度，而 `perfBus.minFps` 因為 dt 被夾在 100ms
      //    永遠 ≥ 10 fps，⛔ 說不出 2 秒凍結與 300ms 卡頓的差別。
      perfWatch.note(nowMs, SAMPLE_MS);
      lifecycleLedger.tick(nowMs / 1000);
      setSnap(snapshot());
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, [active]);
  return snap;
}

const CONN_COLOR: Record<ConnectionQuality, string> = {
  good: "#47cc6a",
  fair: "#f2c637",
  poor: "#e5483f",
  offline: "#8d97ad",
};

function fpsColor(fps: number): string {
  if (fps >= 55) return "#47cc6a";
  if (fps >= 30) return "#f2c637";
  return "#e5483f";
}

/**
 * ⛔⛔ **健康度徽章** —— 四格「有東西不對勁」的計數器，**非零才出現**（GH#609）。
 *
 * ⚠️ 這一段補的是**我自己寫的一句謊**：`perfBus` 那四格的註解逐字寫著
 * 「非零就要**畫在畫面上**，⛔ 不是一行沒有人讀的 console」——
 * 而在 2026-08-23 之前 `apps/client/src/ui/` 底下**零個讀取端**（第一·五守則:
 * 說了但不會發生的字）。
 *
 * ⭐ 而且它**刻意不掛在 `showPerfOverlay` 底下** —— 那一格出貨預設是 **false**，
 * 掛上去等於「擋得掉」，而第二守則要的是「⛔ 擋不掉的東西說出來」。
 * ⇒ 它住在**永遠可用**的 fps 藥丸旁邊，而且**只在非零時**佔位置
 *（⛔ 正常情況下畫面上一個像素都不多）。
 */
export function healthWarnings(
  snap: Pick<
    PerfBus,
    | "renderLoopErrors"
    | "orphanRooms"
    | "foreignSnapshots"
    | "unexpectedDisconnects"
    | "lifecycleGrowth"
    | "lifecycleWorst"
  > & {
    /**
     * 🩺 `perf/diag.diagWarnings()` 的結果（凍結／長任務／幀外開銷）。
     * ⭐ **選填**：這一支的既有呼叫端全部只給 perfBus 那六格，⛔ 不必為了整合而改它們。
     */
    readonly diagWarn?: readonly string[];
  },
): string[] {
  const out: string[] = [...(snap.diagWarn ?? [])];
  if (snap.renderLoopErrors > 0) out.push(`繪製例外 ${snap.renderLoopErrors}`);
  if (snap.orphanRooms > 0) out.push(`孤兒房 ${snap.orphanRooms}`);
  if (snap.foreignSnapshots > 0) out.push(`外來快照 ${snap.foreignSnapshots}`);
  if (snap.unexpectedDisconnects > 0) out.push(`非預期斷線 ${snap.unexpectedDisconnects}`);
  // 🔬 owner 2026-08-23「到第七回合就很難動作⋯累積，沒清理到殘留物」——
  //    ⭐ 把**最嚴重的那一類的名字**印出來，⛔ 不是只印一個總數：
  //    他要的逐字是「精準縮小範圍」，而 `__ggdLifecycle()` 給整張表。
  if (snap.lifecycleGrowth > 0) {
    out.push(`殘留累積 ${snap.lifecycleGrowth} 類${snap.lifecycleWorst ? `（${snap.lifecycleWorst}）` : ""}`);
  }
  return out;
}

/** Compact FPS pill — always available (independent of the full overlay). */
export function FpsPill(): React.JSX.Element | null {
  const snap = usePerfSample(true);
  const touch = hudTouch();
  const hidden = useHudSlotHidden("fps", touch);
  const warns = healthWarnings(snap);
  // The reported task #107 collision: this pill painted over the left-docked
  // shop card. Dev telemetry yields (hides) while a panel covers its corner.
  // 🧹 GH#782 —— ⛔ **警報不讓位**：owner 2026-08-27「回到商店又開始 lag」——
  // 而商店正是這個角落被面板蓋住、藥丸自動讓位的時刻 ⇒ 洩漏警報恰好在
  // 最該被看到的畫面上結構性隱形（fail-open 靜默的形狀）。遙測讓位、警報不讓。
  if (hidden && warns.length === 0) return null;
  // GH#271: this pill's number said 「frames per second」 while printing
  // 1000/avg(workMs) — the machine's CAPABILITY, which ignores the fps cap
  // entirely (a 60-capped session with 4.4 ms frames printed 「228 fps」).
  // `perfBus.avgFps` is the DELIVERED rate now; headroom + the cap in force
  // are two separate rows in the expanded panel below.
  return (
    <div
      data-hud-slot="fps"
      style={{
        ...hudSlotStyle("fps", touch),
        boxSizing: "border-box",
        minHeight: hudSlotHeight("fps", touch),
        padding: "3px 8px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 8,
        color: fpsColor(snap.avgFps),
        fontSize: 12,
        fontVariantNumeric: "tabular-nums",
        fontWeight: 700,
        pointerEvents: "none",
        display: "flex",
        gap: 6,
        alignItems: "center",
      }}
      title="frames per second actually drawn (avg over the perf window)"
    >
      <span>{Math.round(snap.avgFps)} fps</span>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: CONN_COLOR[snap.connection],
        }}
      />
      {/* ⭐ GH#609 —— 非零才出現。⛔ 不受 showPerfOverlay 管（那一格預設是關的）。 */}
      {warns.length > 0 && (
        <span
          data-testid="perf-health-warn"
          title={warns.join(" · ")}
          style={{ color: "#ff8a5c", fontWeight: 700 }}
        >
          ⚠{warns.length}
        </span>
      )}
      {/* 🧹 GH#782 —— 殘留累積要是**畫面上讀得到的紅字**，⛔ 不是一個要 hover
          才展開的 ⚠ 數字：owner 看到的是 lag，⛔ 不是 tooltip（票上原話
          「你不是有在監控特效生命週期跟lag嗎？」——監控在叫而輸出沒到達他）。 */}
      {snap.lifecycleGrowth > 0 && (
        <span data-testid="perf-lifecycle-warn" style={{ color: "#e5483f", fontWeight: 700 }}>
          殘留累積 {snap.lifecycleGrowth} 類{snap.lifecycleWorst ? `（${snap.lifecycleWorst}）` : ""}
        </span>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
      <span style={{ color: TEXT_DIM }}>{label}</span>
      <span style={{ color: TEXT_MAIN, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

/** Full perf overlay — gated by the showPerfOverlay network setting. */
export function PerfOverlay(): React.JSX.Element | null {
  const show = useSettings((s) => s.network.showPerfOverlay);
  const showPing = useSettings((s) => s.network.showPing);
  const snap = usePerfSample(show);
  const touch = hudTouch();
  // yields the same way the pill does: a settings-gated dev overlay never paints
  // over a docked panel (it opens at HUD_Z.expanded, so it WOULD otherwise).
  const covered = useHudSlotHidden("perf-panel", touch);
  if (!show || covered) return null;

  return (
    <div
      data-testid="perf-overlay"
      data-hud-slot="perf-panel"
      style={{
        // an EXPANDED panel opened from the fps pill: it deliberately paints
        // over the corner stacks (and, on a phone, over the minimap) instead
        // of fighting them for space — see the HUD_Z scale in hud/hudLayout.
        ...hudSlotStyle("perf-panel", touch, HUD_Z.expanded),
        width: 194,
        padding: "8px 10px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 10,
        color: TEXT_MAIN,
        fontSize: 11,
        lineHeight: 1.7,
        pointerEvents: "none",
        fontFamily: "ui-monospace, Menlo, monospace",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ color: fpsColor(snap.avgFps), fontWeight: 700 }}>
          {Math.round(snap.avgFps)} fps
        </span>
        <span style={{ color: CONN_COLOR[snap.connection], fontWeight: 700 }}>
          {snap.connection}
        </span>
      </div>
      <Row label="min / avg" value={`${Math.round(snap.minFps)} / ${Math.round(snap.avgFps)}`} />
      {/* GH#271 — the two numbers that make the pill falsifiable. `cap` is the
          limit actually in force (renderParams.fpsCap, 0 = uncapped); `headroom`
          is 1000/avg(workMs), i.e. what the box COULD draw. When the cap works,
          avg ≈ cap and headroom sits far above it — which is exactly the state
          that used to be printed as 「228 fps」. */}
      <Row
        label="cap / headroom"
        value={`${snap.fpsCap === 0 ? "max" : snap.fpsCap} / ${Math.round(snap.capabilityFps)}`}
      />
      <Row label="frame ms" value={`${snap.frameMs.toFixed(1)} (${snap.workMs.toFixed(1)})`} />
      {showPing && <Row label="ping / jitter" value={`${Math.round(snap.pingMs)} / ${Math.round(snap.jitterMs)} ms`} />}
      <Row
        label="quality"
        value={`L${snap.qualityLevel}${snap.adaptiveActive ? " auto" : ""}`}
      />
      <Row label="resolution" value={`${Math.round(snap.resolutionScale * 100)}%`} />
      <Row
        label="particles"
        value={`${Math.round(snap.particleDensity * 100)}%${snap.shadows ? " +sh" : ""}`}
      />
      {/* ⚠️ 標籤從 `ent / draw / fx` 改成誠實的名字（owner 2026-08-23 點名的儀表謊言）：
          `drawCount` 是 `scene.meshes.length`（含 disabled／池子裡的），⛔ **不是 draw call**；
          `particleCount` 是**系統數**，⛔ 不是活粒子數。⭐ 真的那兩個數字在 `__ggdDiag()` 第④節，
          ⛔ 這裡不覆寫 perfBus（那兩格有自己的消費端與守衛）。 */}
      <Row
        label="ent / mesh / psys"
        value={`${snap.entityCount} / ${snap.drawCount} / ${snap.particleCount}`}
      />
      {/* 🩺 ⭐ 幀外開銷 —— wall − rAF 工作 − 上限刻意閒置。這一段沒有任何既有儀表看得到，
          而 AdaptiveQuality 只讀 workMs ⇒ 它再大也不會降畫質。 */}
      <Row label="幀外開銷" value={`${snap.unaccountedMs.toFixed(1)} ms`} />
      <Row
        label="長任務"
        value={snap.longTaskMsPerSec < 0 ? "不支援" : `${Math.round(snap.longTaskMsPerSec)} ms/s`}
      />
      {/* ⚠️ 上面那個 min fps 永遠 ≥ 10（dt 被夾在 100ms）；這一格**沒有夾**。 */}
      <Row label="最長凍結" value={`${Math.round(snap.stallMs)} ms`} />
      {/* ⭐ 展開面板裡逐項列出來（藥丸只印一個數字）。⛔ 全部是 0 就整段不畫。 */}
      {healthWarnings(snap).map((w) => (
        <Row key={w} label="⚠" value={w} />
      ))}
    </div>
  );
}

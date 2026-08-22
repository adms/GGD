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
}

function snapshot(): Snap {
  return {
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
  };
}

/** Sample the perfBus at SAMPLE_MS regardless of frame rate. */
function usePerfSample(active: boolean): Snap {
  const [snap, setSnap] = useState<Snap>(snapshot);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setSnap(snapshot()), SAMPLE_MS);
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
    "renderLoopErrors" | "orphanRooms" | "foreignSnapshots" | "unexpectedDisconnects"
  >,
): string[] {
  const out: string[] = [];
  if (snap.renderLoopErrors > 0) out.push(`繪製例外 ${snap.renderLoopErrors}`);
  if (snap.orphanRooms > 0) out.push(`孤兒房 ${snap.orphanRooms}`);
  if (snap.foreignSnapshots > 0) out.push(`外來快照 ${snap.foreignSnapshots}`);
  if (snap.unexpectedDisconnects > 0) out.push(`非預期斷線 ${snap.unexpectedDisconnects}`);
  return out;
}

/** Compact FPS pill — always available (independent of the full overlay). */
export function FpsPill(): React.JSX.Element | null {
  const snap = usePerfSample(true);
  const touch = hudTouch();
  // The reported task #107 collision: this pill painted over the left-docked
  // shop card. Dev telemetry yields (hides) while a panel covers its corner.
  if (useHudSlotHidden("fps", touch)) return null;
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
      {healthWarnings(snap).length > 0 && (
        <span
          data-testid="perf-health-warn"
          title={healthWarnings(snap).join(" · ")}
          style={{ color: "#ff8a5c", fontWeight: 700 }}
        >
          ⚠{healthWarnings(snap).length}
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
      <Row
        label="ent / draw / fx"
        value={`${snap.entityCount} / ${snap.drawCount} / ${snap.particleCount}`}
      />
      {/* ⭐ 展開面板裡逐項列出來（藥丸只印一個數字）。⛔ 全部是 0 就整段不畫。 */}
      {healthWarnings(snap).map((w) => (
        <Row key={w} label="⚠" value={w} />
      ))}
    </div>
  );
}

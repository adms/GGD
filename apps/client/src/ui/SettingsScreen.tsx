/**
 * SettingsScreen — the full grouped settings panel (graphics + network). All
 * controls live-apply through the SettingsStore (which persists to
 * localStorage immediately). Shows the current measured FPS next to the preset
 * row so the user sees the effect of a change, and a "Reset to recommended"
 * that re-runs the hardware auto-detect. Mounted from the lobby menu and from
 * the in-match pause button; mobile-friendly (existing ui/mobile.css targets).
 */
import { useEffect, useState } from "react";
import { SNAPSHOT_MS } from "@ggd/shared/constants";
import {
  settingsStore,
  detectEnv,
  INTERP_MIN_DELAY_MS,
  INTERP_MAX_DELAY_MS,
  type CombatTextScope,
  type FpsCap,
  type GoreSetting,
  type QualityPreset,
} from "../settings";
import { lodTierForPreset, type ModelLodTier } from "../render/modelLod";
import { defaultFpsCap } from "../render/frameCap";
import { isTouchDevice, readTouchEnv } from "../input/mobileDetect";
import { perfBus } from "../perfBus";
import { audioSystem } from "../audio";
import { SfxButton } from "./SfxButton";
import { useAllSettings } from "./useSettings";
import { useAudioVolumes } from "./useAudio";
import { HUD_Z } from "./hud/hudLayout";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";

/** What each model tier means in the file the client downloads (task #115). */
const MODEL_LOD_LABEL: Record<ModelLodTier, string> = {
  high: "full (authored .glb)",
  mid: "reduced (-mid .glb, ~half the triangles)",
  small: "minimal (-small .glb, ~a third of the triangles)",
};

const PRESETS: { value: QualityPreset; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "auto", label: "Auto" },
];

/**
 * Floating combat text scope (task #92). Ordered least→most so the segmented
 * control reads as a volume knob; "Team" is the default because in a 4-team
 * lobby most events on screen involve neither you nor your side.
 */
const COMBAT_TEXT_SCOPES: { value: CombatTextScope; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "self", label: "Me" },
  { value: "team", label: "Team" },
  { value: "all", label: "All" },
];

/**
 * 血花 spray style (task #39 gore pipeline). "Default" defers to the content
 * config/gore.json; the others force a look, and "Off" disables spray entirely
 * (the intensity=0 / off branch the pipeline was built to serve but no UI ever
 * reached — goreSettings.ts pushes this into setGoreOverride on every change).
 */
const GORE_STYLE_OPTIONS: { value: GoreSetting; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "blood", label: "Blood" },
  { value: "stylized", label: "Stylized" },
  { value: "off", label: "Off" },
];

const FPS_CAPS: { value: FpsCap; label: string }[] = [
  { value: 30, label: "30" },
  { value: 60, label: "60" },
  { value: 120, label: "120" },
  { value: 0, label: "Max" },
];

function useLiveFps(): number {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFps(perfBus.avgFps), 250);
    return () => clearInterval(id);
  }, []);
  return fps;
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ color: TEXT_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function label(text: string): React.JSX.Element {
  return <span style={{ color: TEXT_MAIN, fontSize: 12 }}>{text}</span>;
}

function Segmented<T extends string | number>({
  options,
  value,
  onPick,
}: {
  options: { value: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
}): React.JSX.Element {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {options.map((o) => (
        <SfxButton
          key={String(o.value)}
          className="ggd-tap"
          clickSfx="uiTabSwitch"
          onClick={() => onPick(o.value)}
          style={{
            flex: 1,
            padding: "6px 0",
            borderRadius: 6,
            fontSize: 11,
            cursor: "pointer",
            color: TEXT_MAIN,
            background: value === o.value ? "#2c3f6b" : "#171d2b",
            border: `1px solid ${value === o.value ? "#6f8fe0" : "#2c3448"}`,
          }}
        >
          {o.label}
        </SfxButton>
      ))}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  text,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  text: string;
}): React.JSX.Element {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
      {label(text)}
      <SfxButton
        className="ggd-tap"
        clickSfx="uiToggle"
        onClick={() => onChange(!on)}
        aria-pressed={on}
        style={{
          width: 42,
          height: 24,
          borderRadius: 12,
          border: "1px solid #2c3448",
          background: on ? "#2c3f6b" : "#171d2b",
          position: "relative",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: on ? 20 : 2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: on ? "#9fb6f0" : "#5a6478",
            transition: "left 0.12s",
          }}
        />
      </SfxButton>
    </label>
  );
}

function Slider({
  text,
  value,
  min,
  max,
  step,
  fmt,
  onChange,
}: {
  text: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
}): React.JSX.Element {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        {label(text)}
        <span style={{ color: TEXT_DIM, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmt(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#6f8fe0" }}
      />
    </div>
  );
}

/** Audio mixer controls — master / BGM / SFX sliders + a mute toggle. */
function AudioSection(): React.JSX.Element {
  const vol = useAudioVolumes();
  return (
    <Section title="Audio">
      <Toggle on={vol.muted} onChange={(v) => audioSystem.setMuted(v)} text="Mute all" />
      <Slider
        text="Master volume"
        value={vol.master}
        min={0}
        max={1}
        step={0.05}
        fmt={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => audioSystem.setVolume("master", v)}
      />
      <Slider
        text="Music"
        value={vol.bgm}
        min={0}
        max={1}
        step={0.05}
        fmt={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => audioSystem.setVolume("bgm", v)}
      />
      <Slider
        text="Sound effects"
        value={vol.sfx}
        min={0}
        max={1}
        step={0.05}
        fmt={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => audioSystem.setVolume("sfx", v)}
      />
    </Section>
  );
}

export function SettingsScreen({ onClose }: { onClose: () => void }): React.JSX.Element {
  const settings = useAllSettings();
  const g = settings.graphics;
  const n = settings.network;
  const fps = useLiveFps();
  const store = settingsStore;

  return (
    <div
      className="ggd-platform"
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(4, 6, 12, 0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        pointerEvents: "auto",
        overflowY: "auto",
        padding: "24px 12px",
        zIndex: HUD_Z.screen, // above the HUD corner slots, below the pause modal
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        // task #197 — the pad focus layer scopes to the settings panel (its ✕
        // close button answers B); priority below the pause modal.
        data-pad-scope="settings"
        data-pad-scope-priority="45"
        style={{
          width: 320,
          maxWidth: "92vw",
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 12,
          padding: 16,
          color: TEXT_MAIN,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Settings</div>
          <SfxButton
            className="ggd-tap"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "1px solid #2c3448",
              background: "#171d2b",
              color: TEXT_DIM,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ✕
          </SfxButton>
        </div>

        <Section title="Graphics">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            {label("Quality preset")}
            <span style={{ color: fps >= 55 ? "#47cc6a" : fps >= 30 ? "#f2c637" : "#e5483f", fontSize: 12, fontWeight: 700 }}>
              {Math.round(fps)} fps
            </span>
          </div>
          <Segmented options={PRESETS} value={g.qualityPreset} onPick={(v) => store.setPreset(v)} />
          {g.qualityPreset === "auto" && (
            <div style={{ color: TEXT_DIM, fontSize: 10 }}>
              Auto adjusts resolution/particles to hold {g.fpsCap === 0 ? 60 : g.fpsCap} fps.
            </div>
          )}
          {/* task #115: the preset also picks WHICH .glb is downloaded. Shown
              because a download tier is otherwise invisible — you cannot see it
              in the frame the way you can see resolution or particles. */}
          <div style={{ color: TEXT_DIM, fontSize: 10 }}>
            Model detail: <b style={{ color: TEXT_DIM }}>{MODEL_LOD_LABEL[lodTierForPreset(g.qualityPreset)]}</b>
            {" — applies to models loaded from the next round on."}
          </div>

          <Slider
            text="Resolution scale"
            value={g.resolutionScale}
            min={0.5}
            max={1}
            step={0.05}
            fmt={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => store.patchGraphics({ resolutionScale: v })}
          />
          <div>
            {label("Frame rate cap")}
            <div style={{ marginTop: 4 }}>
              <Segmented options={FPS_CAPS} value={g.fpsCap} onPick={(v) => store.patchGraphics({ fpsCap: v })} />
            </div>
          </div>
          {/* GH#271 決策點:「畫質預設要不要覆蓋玩家的明確選擇」。出貨值 = 不要。
              放在 fps 那一排的正下方,因為它唯一影響的就是上面那個選擇會不會活著。 */}
          <Toggle
            on={g.fpsCapFollowsPreset}
            onChange={(v) => store.patchGraphics({ fpsCapFollowsPreset: v })}
            text="Quality presets reset the fps cap"
          />
          <div style={{ color: TEXT_DIM, fontSize: 10 }}>
            {g.fpsCapFollowsPreset
              ? `On: picking Low/Medium/High also puts the cap back to this device's default (${defaultFpsCap(isTouchDevice(readTouchEnv()))} fps).`
              : "Off: picking Low/Medium/High changes resolution, particles, shadows and draw distance only — your frame-rate choice above stays."}
          </div>
          <Slider
            text="Particle density"
            value={g.particleDensity}
            min={0}
            max={1}
            step={0.05}
            fmt={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => store.patchGraphics({ particleDensity: v })}
          />
          <Slider
            text="Draw distance"
            value={g.drawDistance}
            min={40}
            max={200}
            step={5}
            fmt={(v) => `${v} u`}
            onChange={(v) => store.patchGraphics({ drawDistance: v })}
          />
          <div>
            {label("Combat text")}
            <div style={{ marginTop: 4 }}>
              <Segmented
                options={COMBAT_TEXT_SCOPES}
                value={g.combatTextScope}
                onPick={(v) => store.patchGraphics({ combatTextScope: v })}
              />
            </div>
          </div>
          <div style={{ color: TEXT_DIM, fontSize: 10 }}>
            Whose damage / healing / mana shows a floating number.
          </div>
          <Slider
            text="Damage numbers"
            value={g.damageNumberCap}
            min={8}
            max={64}
            step={4}
            fmt={(v) => `${v}`}
            onChange={(v) => store.patchGraphics({ damageNumberCap: v })}
          />
          <Toggle on={g.shadows} onChange={(v) => store.patchGraphics({ shadows: v })} text="Shadows" />
          <Toggle
            on={g.dynamicResolution}
            onChange={(v) => store.patchGraphics({ dynamicResolution: v })}
            text="Dynamic resolution"
          />
          <Toggle on={g.antialias} onChange={(v) => store.patchGraphics({ antialias: v })} text="Antialiasing" />
          <div style={{ color: TEXT_DIM, fontSize: 10 }}>Antialiasing applies on the next match.</div>
          <div>
            {label("Gore")}
            <div style={{ marginTop: 4 }}>
              <Segmented
                options={GORE_STYLE_OPTIONS}
                value={g.goreStyle}
                onPick={(v) => store.patchGraphics({ goreStyle: v })}
              />
            </div>
          </div>
          <div style={{ color: TEXT_DIM, fontSize: 10 }}>
            血花 spray style. "Default" follows the content config; "Off" disables it entirely.
          </div>
          <Slider
            text="Gore intensity"
            value={g.goreIntensity}
            min={0}
            max={1}
            step={0.1}
            fmt={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => store.patchGraphics({ goreIntensity: v })}
          />
        </Section>

        <Section title="Network">
          <Slider
            text="Interpolation delay"
            value={n.interpolationDelayMs}
            // bounds are DERIVED from the snapshot rate, not literals: the floor
            // is two snapshot intervals, below which one late packet freezes
            // remotes (InterpolationBuffer clamps, it never extrapolates).
            min={INTERP_MIN_DELAY_MS}
            max={INTERP_MAX_DELAY_MS}
            step={10}
            // show the headroom, not just the milliseconds — the interval count
            // is the number that actually predicts stutter
            fmt={(v) => `${v} ms · ${(v / SNAPSHOT_MS).toFixed(1)}× snapshot`}
            onChange={(v) => store.patchNetwork({ interpolationDelayMs: v })}
          />
          <Toggle
            on={n.showPerfOverlay}
            onChange={(v) => store.patchNetwork({ showPerfOverlay: v })}
            text="Performance overlay"
          />
          <Toggle on={n.showPing} onChange={(v) => store.patchNetwork({ showPing: v })} text="Show ping" />
          {/* GH#270 —— 「現在有哪些粒子發射器在跑、在哪裡」。
              ⚠️ 它**不掛在 Performance overlay 底下**：上面那個 Show ping 就是
              反例，它只 gate 了 overlay 裡的一行，而整個 overlay 在
              showPerfOverlay=false 時就 return null，所以對沒開 overlay 的人
              那個開關是死的。這一個自己就是 VfxDebugPanel 的唯一閘。 */}
          <Toggle
            on={n.showVfxDebug}
            onChange={(v) => store.patchNetwork({ showVfxDebug: v })}
            text="特效發射器診斷"
          />
          <div style={{ color: TEXT_DIM, fontSize: 10 }}>
            右上角列出場上每一個粒子發射器：名稱、x/z 座標、是否還在發射、活粒子數、emitRate。
            追「憑空出現／跑到場地外」的特效用的（GH#270）。獨立開關，不需要開 Performance
            overlay。
          </div>
        </Section>

        <AudioSection />

        <SfxButton
          className="ggd-tap"
          onClick={() => store.resetToRecommended(detectEnv())}
          style={{
            width: "100%",
            padding: "9px 0",
            borderRadius: 8,
            border: "1px solid #2c3448",
            background: "#171d2b",
            color: TEXT_MAIN,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Reset to recommended
        </SfxButton>
      </div>
    </div>
  );
}

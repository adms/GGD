/**
 * TouchControls — the touch HUD chrome (iPhone landscape): floating virtual
 * joystick on the left, Q/W/E/R ability arc + big basic-attack button on the
 * right. React renders ONLY the discrete chrome (button faces, cooldown
 * sweeps, rank-up badges — from the Zustand RoomStore); the per-frame
 * joystick knob / aim highlight is patched imperatively from the plain
 * mutable `touchFrame` in this component's own rAF (frameBus pattern —
 * per-frame data never touches React state, client-08).
 */
import { useEffect, useRef } from "react";
import { TICK_HZ } from "@ggd/shared/constants";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import type { CoreAbilitySlot } from "@ggd/shared/sim/intents";
import {
  activeTouchController,
  touchFrame,
  JOYSTICK_RADIUS_PX,
  type TouchButton,
} from "../input/TouchInput";
import { useHud } from "../net/RoomStore";
import { hudActions } from "./actions";
import { exSlotView } from "./exSlot";
import { SfxButton } from "./SfxButton";
import { GOLD, PANEL_BG, TEXT_DIM, TEXT_MAIN } from "./theme";

const SLOTS: CoreAbilitySlot[] = ["Q", "W", "E", "R"];
const EX_ACCENT = "#f2a13c";

/** attack-button center offset from the bottom-right corner (CSS px) */
const ATTACK_CENTER = 84;
const ATTACK_SIZE = 88;
const ABILITY_SIZE = 58;
/** ability arc radius around the attack button */
const ARC_RADIUS = 122;

/** Q at due-left of the attack button, R due-above, W/E on the arc between. */
function arcCenter(i: number): { right: number; bottom: number } {
  const angle = (i / (SLOTS.length - 1)) * (Math.PI / 2);
  return {
    right: ATTACK_CENTER + Math.cos(angle) * ARC_RADIUS,
    bottom: ATTACK_CENTER + Math.sin(angle) * ARC_RADIUS,
  };
}

function pressHandler(button: TouchButton): (e: React.TouchEvent) => void {
  return (e) => {
    const t = e.changedTouches[0];
    if (!t) return;
    activeTouchController()?.buttonTouchStart(button, {
      identifier: t.identifier,
      clientX: t.clientX,
      clientY: t.clientY,
    });
  };
}

const circleBase: React.CSSProperties = {
  position: "absolute",
  borderRadius: "50%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "auto",
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  overflow: "hidden",
};

export function TouchControls(): React.JSX.Element | null {
  const seat = useHud((s) =>
    s.localSeatId === null ? null : (s.seats.find((v) => v.seatId === s.localSeatId) ?? null),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

  // per-frame chrome: joystick base/knob transforms + aim highlight — reads
  // the plain touchFrame, patches DOM imperatively (never React state)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const joyBase = root.querySelector<HTMLDivElement>('[data-role="joy-base"]');
    const joyKnob = root.querySelector<HTMLDivElement>('[data-role="joy-knob"]');
    let raf = 0;
    const frame = (): void => {
      raf = requestAnimationFrame(frame);
      const j = touchFrame.joystick;
      if (joyBase && joyKnob) {
        joyBase.style.opacity = j.active ? "1" : "0.4";
        if (j.active) {
          joyBase.style.transform = `translate(${(j.baseX - JOYSTICK_RADIUS_PX).toFixed(1)}px, ${(j.baseY - JOYSTICK_RADIUS_PX).toFixed(1)}px)`;
          joyKnob.style.transform = `translate(${(j.knobX - 26).toFixed(1)}px, ${(j.knobY - 26).toFixed(1)}px)`;
          joyKnob.style.opacity = "1";
        } else {
          joyKnob.style.opacity = "0";
        }
      }
      const aim = touchFrame.aim;
      for (const slot of SLOTS) {
        const el = root.querySelector<HTMLDivElement>(`[data-touch-slot="${slot}"]`);
        if (!el) continue;
        const isActive = aim.active && aim.slot === slot;
        el.style.boxShadow = isActive
          ? aim.inCancelZone
            ? "0 0 0 3px #e5483f"
            : "0 0 0 3px #47cc6a"
          : "none";
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [seat !== null]);

  if (!seat || !seat.championId) return null;
  const def = Champions.tryGet(seat.championId as ChampionId);
  if (!def) return null;

  return (
    <div ref={rootRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 20 }}>
      {/* floating joystick chrome (left half; input is captured on the canvas) */}
      <div
        data-role="joy-base"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: JOYSTICK_RADIUS_PX * 2,
          height: JOYSTICK_RADIUS_PX * 2,
          borderRadius: "50%",
          border: "2px solid rgba(150, 170, 220, 0.5)",
          background: "rgba(20, 26, 42, 0.25)",
          transform: "translate(64px, calc(100vh - 200px))",
          opacity: 0.4,
          pointerEvents: "none",
          willChange: "transform",
        }}
      />
      <div
        data-role="joy-knob"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "rgba(150, 170, 220, 0.55)",
          border: "2px solid rgba(220, 230, 250, 0.7)",
          opacity: 0,
          pointerEvents: "none",
          willChange: "transform",
        }}
      />

      {/* basic-attack button (LT semantics: nearest enemy) */}
      <div
        data-touch-attack=""
        onTouchStart={pressHandler("ATTACK")}
        style={{
          ...circleBase,
          right: ATTACK_CENTER - ATTACK_SIZE / 2,
          bottom: ATTACK_CENTER - ATTACK_SIZE / 2,
          width: ATTACK_SIZE,
          height: ATTACK_SIZE,
          background: "rgba(58, 28, 30, 0.85)",
          border: "2px solid #7a3230",
          color: TEXT_MAIN,
          fontSize: 30,
        }}
      >
        ⚔
      </div>

      {/* Q/W/E/R ability arc */}
      {SLOTS.map((slot, i) => {
        const ability = def.abilities[slot];
        const rank = seat.abilityRanks[i] ?? 0;
        const learned = rank > 0;
        const cdSecs = (seat.cooldowns[i] ?? 0) / TICK_HZ;
        const maxCd = learned ? (ability.cooldown[rank - 1] ?? 1) : 1;
        const sweep = learned && cdSecs > 0 ? Math.min(1, cdSecs / maxCd) : 0;
        const { right, bottom } = arcCenter(i);
        return (
          <div
            key={slot}
            style={{
              position: "absolute",
              right: right - ABILITY_SIZE / 2,
              bottom: bottom - ABILITY_SIZE / 2,
              width: ABILITY_SIZE,
              height: ABILITY_SIZE,
              pointerEvents: "none",
            }}
          >
            <div
              data-touch-slot={slot}
              onTouchStart={learned ? pressHandler(slot) : undefined}
              style={{
                ...circleBase,
                inset: 0,
                background: learned ? "rgba(36, 50, 82, 0.9)" : "rgba(22, 27, 38, 0.75)",
                border: `2px solid ${learned ? "#51649b" : "#2a3040"}`,
                color: learned ? TEXT_MAIN : TEXT_DIM,
              }}
            >
              <div style={{ fontSize: 19, fontWeight: "bold" }}>{slot}</div>
              {sweep > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: `${sweep * 100}%`,
                    background: "rgba(8, 10, 16, 0.78)",
                  }}
                />
              )}
              {sweep > 0 && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    fontWeight: "bold",
                    color: "#fff",
                  }}
                >
                  {Math.ceil(cdSecs)}
                </div>
              )}
            </div>
            {seat.unspentPoints > 0 && rank < ability.maxRank && (
              <SfxButton
                kind="subdued" // thin glow, no sheen — combat stays quiet
                sfxVolume={0.5}
                pressScale={1} // keeps its translateX(-50%) centering (no scale clobber)
                onClick={() => hudActions.sendCommand({ kind: "rankUpAbility", slot })}
                style={{
                  position: "absolute",
                  top: -18,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  border: "1px solid #f2c637",
                  background: "#5d4a12",
                  color: GOLD,
                  fontSize: 14,
                  padding: 0,
                  pointerEvents: "auto",
                  touchAction: "none",
                }}
              >
                +
              </SfxButton>
            )}
          </div>
        );
      })}

      {/* EX 技能 touch button — amber, shown only once unlocked (exRank > 0) */}
      {(() => {
        const ex = exSlotView(seat);
        if (!ex) return null;
        const sweep = ex.sweep;
        return (
          <div
            data-touch-slot="EX"
            onTouchStart={pressHandler("EX")}
            style={{
              ...circleBase,
              right: ATTACK_CENTER + ARC_RADIUS - ABILITY_SIZE / 2,
              bottom: ATTACK_CENTER + ARC_RADIUS - ABILITY_SIZE / 2,
              width: ABILITY_SIZE,
              height: ABILITY_SIZE,
              background: "rgba(58, 42, 18, 0.92)",
              border: `2px solid ${EX_ACCENT}`,
              boxShadow: `0 0 8px ${EX_ACCENT}88`,
              color: EX_ACCENT,
              fontSize: 18,
              fontWeight: "bold",
            }}
          >
            EX
            {sweep > 0 && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: `${sweep * 100}%`,
                  background: "rgba(8, 10, 16, 0.78)",
                }}
              />
            )}
          </div>
        );
      })()}

      {/* recall — small utility button above the ability arc */}
      <div
        onTouchStart={() => hudActions.sendCommand({ kind: "recall" })}
        style={{
          ...circleBase,
          right: ATTACK_CENTER - 22,
          bottom: ATTACK_CENTER + ARC_RADIUS + 46,
          width: 44,
          height: 44,
          background: PANEL_BG,
          border: "1px solid #2c3448",
          color: TEXT_DIM,
          fontSize: 16,
        }}
      >
        ⌂
      </div>
    </div>
  );
}

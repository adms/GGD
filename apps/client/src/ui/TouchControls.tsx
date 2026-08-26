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
import { arcCenter, touchMetrics, TOUCH_ARC_SLOTS } from "./hud/touchControlsRect";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import { isPassiveOnly } from "@ggd/shared/sim/abilities/abilityPassives";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import { INNATE_SLOT } from "@ggd/shared/sim/intents";
import {
  activeTouchController,
  touchFrame,
  JOYSTICK_RADIUS_PX,
  type TouchButton,
} from "../input/TouchInput";
import { useHud } from "../net/RoomStore";
import { hudActions } from "./actions";
import { exSlotView } from "./exSlot";
import { cooldownView } from "./cooldownView";
import { CooldownChrome } from "./components/CooldownChrome";
import { displayFinal, useDisplayEnv } from "./displayFinal";
import { innateKindLabel, passiveSlotView, PASSIVE_ACCENT, PASSIVE_SLOT_LABEL } from "./passiveSlot";
import {
  AbilityTileFrame,
  seatToggleOn,
  READY_RGB_ACTIVE,
  READY_RGB_EX,
  READY_RGB_PASSIVE,
} from "./abilityReadyFrame";
import { INNATE_ACTIVE_CASTABLE } from "./castAnnounce";
import { setHeldAbility } from "./abilityHold";
import { rangeGuide } from "./rangeGuideConfig";
import { abilityActivationCue } from "./abilityCue";
import { coinThrowAffordable, coinThrowGreysWhenPoor, coinThrowRules } from "./coinThrow";
import { prefersReducedMotion } from "./buttonSfx";
import { stripAbilityNumber } from "./components/abilityText";
import { SfxButton } from "./SfxButton";
import { GOLD, PANEL_BG, TEXT_DIM, TEXT_MAIN } from "./theme";

/**
 * ⭐ GH#765 —— 排版常數與 `touchMetrics` / `arcCenter` **搬到** `hud/touchControlsRect.ts`。
 *
 * ⚠️ 搬家的唯一理由是「守衛要算得出這幾顆按鈕在畫面上的哪裡」：這個檔是 `.tsx`
 * 且抓著 React / Zustand / rAF，一條純幾何的守衛 import 它就等於把整個 HUD
 * 拉進 node 測試。`028aa3bf` 逐字寫的第二個盲點正是「**TouchControls 完全不在
 * hudLayout 的世界裡**」—— 而它的代價是 844×390 上一塊 88×38 的攻擊鈕被裝備欄吃掉。
 *
 * ⛔ **不要在這個檔重新宣告任何一個排版數字** —— 那就是第二個住處，
 * 而守衛會繼續綠著量另一份已經不是畫面的座標。
 */
const SLOTS = TOUCH_ARC_SLOTS;
const EX_ACCENT = "#f2a13c";

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

// Press-visual: a quick scale-down + brightness flash (skipped under
// reduced-motion). Uses transform/filter only — the per-frame aim-highlight
// rAF owns `boxShadow` on the same tile, so touching it here would fight.
function pressVisualDown(el: HTMLElement): void {
  if (prefersReducedMotion()) return;
  el.style.transform = "scale(0.9)";
  el.style.filter = "brightness(1.4)";
}
function pressVisualClear(el: HTMLElement): void {
  el.style.transform = "";
  el.style.filter = "";
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

/** 丟金幣 — the same command the desktop G key and the spectator button send. */
function dropCoin(): void {
  hudActions.sendCommand({ kind: "dropCoin" });
}

export function TouchControls(): React.JSX.Element | null {
  const seat = useHud((s) =>
    s.localSeatId === null ? null : (s.seats.find((v) => v.seatId === s.localSeatId) ?? null),
  );
  const phase = useHud((s) => s.phase);
  const localAlive = useHud((s) => s.localAlive);
  const localMaxHp = useHud((s) => s.localMaxHp);
  // ⭐ 就緒框的第二個條件（owner：「CD 好了、**MP 足夠**」）。
  const localMana = useHud((s) => s.localMana);
  // live combat-env table — the cooldown denominator must be the env-scaled
  // final the sim charged, not the authored base (#219; see ui/cooldownView)
  const env = useDisplayEnv();
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

  // 陣亡投幣 (task #191). NEVER `!localAlive` alone: a player who has not locked
  // a champion, or who is watching a round their team sat out, is also "not
  // alive" — offering them a button the server will only ever refuse is the
  // dead-button defect this campaign deletes. `coinsLeft` (server-projected,
  // reset each combat entry) is 0 for exactly those seats, and `localMaxHp > 0`
  // additionally proves a champion exists at all.
  const coinMode = phase === "combat" && !localAlive && localMaxHp > 0 && seat.coinsLeft > 0;
  // ⭐ 「丟 N 金」的 N 與「x/y」的 y 從 `config.arena-rules@1 goldDrop` 讀
  // （`ui/coinThrow`），⛔ 不是這個檔裡的 `COINS_PER_ROUND = 10` 與字面值
  // 「100金」—— 那是 owner 一調 `coinValue` 就同時說謊的兩份文案（第〇·四守則）。
  const coinRules = coinThrowRules();
  // ⭐ 金幣不足時變不變灰＝後台一格（`config.ui-cues@1 coinThrowButtonMode`），
  // 出貨 `always-enabled`。⚠️ 兩種模式下**送得出去的那一次**都會拿到一句話 ——
  // `ui/coinThrow` 是 `coinDropRejected` 的消費端，⛔ 這一格管不到回饋。
  const coinPoor = coinMode && coinThrowGreysWhenPoor() && !coinThrowAffordable(seat.gold, coinRules);
  // ⭐ 這一次繪製的尺寸。⚠️ 讀模組單例（不是 React state）—— 與 `AbilityBar` /
  // `EnemyTeamPanel` 同一個做法，所以改設定要等下一次 hud snapshot 才重繪。
  const m = touchMetrics();

  return (
    <div ref={rootRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 20 }}>
      {/* held-button description panel across the top of the screen (task #152) */}
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

      {/* The CENTRE button. While the local player is DEAD with throws left it
          becomes 陣亡投幣 (task #191); otherwise it is the basic attack (LT
          semantics: nearest enemy).

          Reusing this slot rather than adding a control is deliberate. The ⚔
          button is INERT for a corpse — a dead champion has nothing to swing at
          — so the biggest, best-placed target on the screen is going spare at
          exactly the moment the player has one thing left to do. A new button
          would also have to find room: phone landscape is ~390px tall, the left
          corners belong to the defeated player's own shop panel, and the touch
          top-right has ~23px of headroom before the essential ☰ leaves the
          screen. Swapping the face costs no layout and no HUD_PANELS row. */}
      <div
        data-touch-attack={coinMode ? undefined : ""}
        data-touch-coin={coinMode ? "" : undefined}
        data-touch-coin-poor={coinPoor ? "" : undefined}
        onTouchStart={coinMode ? (coinPoor ? undefined : dropCoin) : pressHandler("ATTACK")}
        style={{
          ...circleBase,
          right: m.attackCenter - m.attackSize / 2,
          bottom: m.attackCenter - m.attackSize / 2,
          width: m.attackSize,
          height: m.attackSize,
          background: coinMode
            ? coinPoor
              ? "rgba(38, 34, 26, 0.9)"
              : "rgba(58, 46, 18, 0.9)"
            : "rgba(58, 28, 30, 0.85)",
          border: coinMode ? `2px solid ${coinPoor ? "#6a5c34" : GOLD}` : "2px solid #7a3230",
          color: coinMode ? (coinPoor ? "#8d8163" : GOLD) : TEXT_MAIN,
          fontSize: coinMode ? m.s(13) : m.s(30),
          lineHeight: 1.25,
          fontWeight: coinMode ? 700 : 400,
        }}
      >
        {coinMode ? (
          <>
            <div>丟 {coinRules.coinValue}金</div>
            <div style={{ fontSize: m.s(11), opacity: 0.85 }}>
              {seat.coinsLeft}/{coinRules.coinsPerRound}
            </div>
          </>
        ) : (
          "⚔"
        )}
      </div>

      {/* Q/W/E/R ability arc */}
      {SLOTS.map((slot, i) => {
        const ability = def.abilities[slot];
        const rank = seat.abilityRanks[i] ?? 0;
        const learned = rank > 0;
        const cd = cooldownView(
          learned ? (seat.cooldowns[i] ?? 0) : 0,
          learned ? displayFinal(ability.cooldown[rank - 1] ?? 0, "cooldown", env) : 0,
        );
        // passive-only skill (no castable effects) — dashed tile + soft cue
        const passive = isPassiveOnly(ability);
        const { right, bottom } = arcCenter(i, m);
        return (
          <div
            key={slot}
            style={{
              position: "absolute",
              right: right - m.abilitySize / 2,
              bottom: bottom - m.abilitySize / 2,
              width: m.abilitySize,
              height: m.abilitySize,
              pointerEvents: "none",
            }}
          >
            <div
              data-touch-slot={slot}
              // tap/drag still casts (pressHandler); the press ALSO latches the
              // hold-preview seam (task #152) so a held finger shows the name
              // panel + floor range, cleared on lift. Every press now answers
              // with a click cue (or the refusal cue when cooling down),
              // haptic pulse, and a scale/flash — even an unlearned tile.
              onTouchStart={(e) => {
                // ⭐ owner 2026-08-13：「被動技的按鈕應該不能被按下」——
                //    ⇒ 被動不播按下動畫（桌機 `holdProps` 的同一條規則）。
                if (!passive) pressVisualDown(e.currentTarget);
                if (learned) {
                  pressHandler(slot)(e);
                  setHeldAbility(slot, "aim");
                  abilityActivationCue(slot, { denied: cd.onCd, passive });
                } else {
                  abilityActivationCue(slot, { denied: true, passive });
                }
              }}
              onTouchEnd={(e) => {
                pressVisualClear(e.currentTarget);
                if (learned) setHeldAbility(null);
              }}
              onTouchCancel={(e) => {
                pressVisualClear(e.currentTarget);
                if (learned) setHeldAbility(null);
              }}
              style={{
                ...circleBase,
                inset: 0,
                background: learned ? "rgba(36, 50, 82, 0.9)" : "rgba(22, 27, 38, 0.75)",
                // passive skills read as a DASHED outline (虛線外框) vs solid actives
                border: `2px ${passive ? "dashed" : "solid"} ${learned ? "#51649b" : "#2a3040"}`,
                color: learned ? TEXT_MAIN : TEXT_DIM,
                transition: "transform 80ms ease, filter 80ms ease",
              }}
            >
              {/* slot letter as a small badge, ability NAME under it (task #152) */}
              <div style={{ fontSize: m.s(13), fontWeight: "bold", lineHeight: 1 }}>{slot}</div>
              <div
                style={{
                  marginTop: 2,
                  maxWidth: m.abilitySize - m.s(12),
                  fontSize: m.s(9),
                  lineHeight: 1.1,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  color: learned ? TEXT_MAIN : TEXT_DIM,
                }}
              >
                {stripAbilityNumber(ability.name)}
              </div>
              {/* cooldown chrome — the shared radial wipe + number + ready bloom */}
              <CooldownChrome cd={cd} fontSize={m.s(20)} />
              {/* ⭐ 三態框 —— 被動的 pressable 是 false ⇒ 永遠不亮就緒框 */}
              <AbilityTileFrame
                rgb={READY_RGB_ACTIVE}
                state={{
                  pressable: !passive,
                  offCooldown: !cd.onCd,
                  manaOk: localMana >= (ability.manaCost[Math.max(0, rank - 1)] ?? 0),
                  learned,
                  toggleOn: seatToggleOn(seat, slot),
                }}
              />
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
                  borderRadius: m.s(13),
                  border: "1px solid #f2c637",
                  background: "#5d4a12",
                  color: GOLD,
                  fontSize: m.s(14),
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
        const cd = cooldownView(seat.exCooldown, displayFinal(ex.cooldownSec, "cooldown", env));
        // EX can (rarely) be a passive-only skill → dashed tile + soft cue
        const exDef = Abilities.tryGet(seat.exAbilityId as AbilityId);
        const exPassive = exDef ? isPassiveOnly(exDef) : false;
        return (
          <div
            data-touch-slot="EX"
            onTouchStart={(e) => {
              pressVisualDown(e.currentTarget);
              pressHandler("EX")(e);
              setHeldAbility("EX", "aim");
              abilityActivationCue("EX", { denied: cd.onCd, passive: exPassive });
            }}
            onTouchEnd={(e) => {
              pressVisualClear(e.currentTarget);
              setHeldAbility(null);
            }}
            onTouchCancel={(e) => {
              pressVisualClear(e.currentTarget);
              setHeldAbility(null);
            }}
            style={{
              ...circleBase,
              right: m.attackCenter + m.arcRadius - m.abilitySize / 2,
              bottom: m.attackCenter + m.arcRadius - m.abilitySize / 2,
              width: m.abilitySize,
              height: m.abilitySize,
              background: "rgba(58, 42, 18, 0.92)",
              border: `2px ${exPassive ? "dashed" : "solid"} ${EX_ACCENT}`,
              boxShadow: `0 0 8px ${EX_ACCENT}88`,
              color: EX_ACCENT,
              fontWeight: "bold",
              transition: "transform 80ms ease, filter 80ms ease",
            }}
          >
            {/* EX badge + ability NAME under it (task #152) */}
            <div style={{ fontSize: m.s(14), fontWeight: "bold", lineHeight: 1 }}>EX</div>
            <div
              style={{
                marginTop: 2,
                maxWidth: m.abilitySize - m.s(12),
                fontSize: 9,
                lineHeight: 1.1,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                color: EX_ACCENT,
              }}
            >
              {stripAbilityNumber(ex.name)}
            </div>
            {/* cooldown chrome. Before #219 the touch EX painted the dark rect
                and NO NUMBER at all — the phone could see that the EX was down
                but never how long for. Same component as every other tile. */}
            <CooldownChrome cd={cd} fontSize={m.s(20)} />
            {/* ⭐ 三態框 —— 被動的 pressable 是 false ⇒ 永遠不亮就緒框 */}
            <AbilityTileFrame
              rgb={READY_RGB_EX}
              state={{
                pressable: !exPassive,
                offCooldown: !cd.onCd,
                manaOk: localMana >= (ex.manaCost ?? 0),
                toggleOn: seatToggleOn(seat, "EX"),
              }}
            />
          </div>
        );
      })()}

      {/* 天生技 (the SIXTH slot) — the NN-00 innate owned from LEVEL 1. Violet,
          dashed for a pure 被動 / solid for an 主動 innate, a 天生 badge and a Lv1
          chip.
          TWO BUTTONS IN ONE, by kind:
            • 主動 innate — a REAL cast button: `pressHandler("PASSIVE")` hands
              the finger to the same tap/drag-aim path Q/W/E/R use, so a phone
              player fires it exactly like any other ability (the keyboard has D
              and the pad has d-pad-up; leaving touch out would have made the
              sixth slot a desktop-only feature).
            • 被動 innate — still no cast path at all: the press only opens the
              description panel and plays the soft tick, and an INERT one (doc
              grants nothing) is dimmed and captioned 未實作 so it cannot pass
              for one that works. */}
      {(() => {
        const innate = passiveSlotView(seat.championId);
        if (!innate) return null;
        const active = innate.innateKind === "active";
        const castable = active && INNATE_ACTIVE_CASTABLE;
        const inert = !active && !innate.effective;
        const cd = cooldownView(
          seat.passiveCooldown ?? 0,
          displayFinal(innate.cooldownSec ?? 0, "cooldown", env),
        );
        return (
          <div
            data-touch-slot="PASSIVE"
            onTouchStart={(e) => {
              pressVisualDown(e.currentTarget);
              if (castable) pressHandler("PASSIVE")(e);
              setHeldAbility("PASSIVE", "aim");
              abilityActivationCue(
                "PASSIVE",
                castable ? { denied: cd.onCd } : { passive: true },
              );
            }}
            onTouchEnd={(e) => {
              pressVisualClear(e.currentTarget);
              setHeldAbility(null);
            }}
            onTouchCancel={(e) => {
              pressVisualClear(e.currentTarget);
              setHeldAbility(null);
            }}
            style={{
              ...circleBase,
              right: m.attackCenter + m.arcRadius + m.abilitySize - m.abilitySize / 2,
              bottom: m.attackCenter - m.abilitySize / 2,
              width: m.abilitySize,
              height: m.abilitySize,
              background: active ? "rgba(43, 35, 64, 0.92)" : "rgba(30, 27, 44, 0.9)",
              border: `2px ${active ? "solid" : "dashed"} ${PASSIVE_ACCENT}`,
              color: PASSIVE_ACCENT,
              fontWeight: "bold",
              // dimmed when the doc grants nothing — see passiveSlot.effective
              opacity: inert ? 0.55 : 1,
              transition: "transform 80ms ease, filter 80ms ease",
            }}
          >
            <div style={{ fontSize: m.s(11), fontWeight: "bold", lineHeight: 1 }}>
              {PASSIVE_SLOT_LABEL}
              <span style={{ fontSize: m.s(8), marginLeft: m.s(2) }}>{innateKindLabel(innate.innateKind)}</span>
            </div>
            <div
              style={{
                marginTop: 2,
                maxWidth: m.abilitySize - m.s(12),
                fontSize: 9,
                lineHeight: 1.1,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                color: PASSIVE_ACCENT,
              }}
            >
              {innate.displayName}
            </div>
            <div style={{ fontSize: m.s(7.5), color: TEXT_DIM, lineHeight: 1.1 }}>
              {inert ? "未實作" : "Lv1"}
            </div>
            {/* cooldown chrome — only an active innate can carry one, and it
                must be readable on the phone too or the button looks ready for
                its whole 40 s. Before #219 this tile showed the dark rect and
                NO NUMBER; it now speaks the same language as every other. */}
            <CooldownChrome cd={cd} fontSize={m.s(20)} />
            {/* ⭐ 三態框 —— 純被動不亮就緒框，但它**可以**是開著的（70-00 紮根） */}
            <AbilityTileFrame
              rgb={READY_RGB_PASSIVE}
              state={{
                pressable: castable,
                offCooldown: !cd.onCd,
                manaOk: localMana >= (innate.manaCost ?? 0),
                toggleOn: seatToggleOn(seat, INNATE_SLOT),
              }}
            />
          </div>
        );
      })()}

      {/* recall — small utility button above the ability arc */}
      <div
        onTouchStart={() => hudActions.sendCommand({ kind: "recall" })}
        style={{
          ...circleBase,
          right: m.attackCenter - m.tap(44) / 2,
          bottom: m.attackCenter + m.arcRadius + m.s(46),
          width: m.tap(44),
          height: m.tap(44),
          background: PANEL_BG,
          border: "1px solid #2c3448",
          color: TEXT_DIM,
          fontSize: m.s(16),
        }}
      >
        ⌂
      </div>
    </div>
  );
}

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
import { hudScale, hudScaleTappable, hudScaleTier } from "./hudScale";
import { HUD_STAMP_BAND } from "./hud/hudLayout";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import { isPassiveOnly } from "@ggd/shared/sim/abilities/abilityPassives";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
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
import { cooldownView } from "./cooldownView";
import { CooldownChrome } from "./components/CooldownChrome";
import { displayFinal, useDisplayEnv } from "./displayFinal";
import { innateKindLabel, passiveSlotView, PASSIVE_ACCENT, PASSIVE_SLOT_LABEL } from "./passiveSlot";
import {
  abilityReadyFrameStyle,
  isAbilityTileReady,
  READY_RGB_ACTIVE,
  READY_RGB_EX,
  READY_RGB_PASSIVE,
} from "./abilityReadyFrame";
import { INNATE_ACTIVE_CASTABLE } from "./castAnnounce";
import { setHeldAbility } from "./abilityHold";
import { rangeGuide } from "./rangeGuideConfig";
import { abilityActivationCue } from "./abilityCue";
import { prefersReducedMotion } from "./buttonSfx";
import { AbilityDescriptionOverlay } from "./AbilityDescriptionOverlay";
import { stripAbilityNumber } from "./components/abilityText";
import { SfxButton } from "./SfxButton";
import { GOLD, PANEL_BG, TEXT_DIM, TEXT_MAIN } from "./theme";

const SLOTS: CoreAbilitySlot[] = ["Q", "W", "E", "R"];
const EX_ACCENT = "#f2a13c";

/** attack-button center offset from the bottom-right corner (CSS px) */
/**
 * ⭐ HUD 縮放（owner 2026-08-10）—— 手機/平板走的是**這一支**，不是 `AbilityBar`
 * （`HudRoot.tsx` 的 `abilities={!touchControls && <AbilityBar />}`）。owner 逐字點名
 * 「最小適合 iphone、小適合 ipad」，所以這支不接的話那兩個場景一格都不會動。
 *
 * ⛔ 這裡沒有任何 `* 倍率` 的算術：倍率、四捨五入、觸控下限全部只住在 `ui/hudScale.ts`
 * 的算子裡（第零守則⑨：一個模板不是 N 份）。可點擊的走 `hudScaleTappable`
 * （最小 10% 時停在 44px 而不是 5.8px），純視覺的走 `hudScale`。
 *
 * ⚠️ **極座標的半徑一定要跟著縮**：`ARC_RADIUS` 不縮而按鈕縮，放大時圓弧上的六個
 * 按鈕會互相重疊 —— 那是「畫的變大、排的沒變」同一個失敗形態（⑤）的極座標版本。
 */
const ATTACK_CENTER = 84;
const ATTACK_SIZE = 88;
const ABILITY_SIZE = 58;
/** ability arc radius around the attack button */
const ARC_RADIUS = 122;

/**
 * 天生技 button center — one tile FURTHER LEFT than Q, on the attack button's
 * own row. Kept OFF the Q/W/E/R arc even though an active innate is now a real
 * cast button: the sixth slot is a once-per-40-seconds press, not part of the
 * rotation the thumb sweeps, and a phone-landscape viewport is only ~390px
 * tall so nothing may grow upward (#151/#159). Off-arc also keeps it out of the
 * path of a mis-swiped Q.
 */
// ⚠️ `PASSIVE_CENTER` 拿掉了：它是三個基準常數的算術，而縮放之後那三個都變成
// `touchMetrics()` 的欄位 —— 留著一份用未縮放常數算的座標，就是「畫的縮了、
// 排的沒縮」（失敗形態⑤）。天生技的位置現在直接從 `m` 算，與圓弧同一組數字。

/** Q at due-left of the attack button, R due-above, W/E on the arc between. */
/** 這一次繪製的實際尺寸。⛔ 全部從 `hudScale*` 來，這裡不做算術。 */
function touchMetrics(tier = hudScaleTier()): {
  attackCenter: number;
  attackSize: number;
  abilitySize: number;
  arcRadius: number;
  s: (px: number) => number;
  tap: (px: number) => number;
} {
  const s = (px: number): number => hudScale(px, tier);
  const tap = (px: number): number => hudScaleTappable(px, tier);
  const attackSize = tap(ATTACK_SIZE);
  /**
   * ⭐ **錨點不可以縮進版本徽章的保留帶**（`versionBadgeBand.test.ts` 抓到的）。
   *
   * 整個觸控叢集都是從 `attackCenter` 往上長的，而 `hudScale(84,"min") = 8` ——
   * 比 `HUD_STAMP_BAND`（10px，版本徽章在**每一個畫面**都畫在那裡）還低。
   * 也就是最小檔位會把攻擊鈕壓進徽章底下：按鈕在那裡、字也在那裡，兩個疊著。
   *
   * ⛔ 這不是「把徽章讓開」可以解的 —— 徽章是 #245 刻意提到最上層的（它是
   * 「這是哪一版」的唯一答案）。所以是**錨點有下限**：叢集的最低點至少要在
   * 帶子之上。⚠️ 下限是 `HUD_STAMP_BAND`，⛔ 不是一個新發明的數字。
   */
  const anchorFloor = HUD_STAMP_BAND + attackSize / 2;
  return {
    attackCenter: Math.max(s(ATTACK_CENTER), anchorFloor),
    attackSize,
    abilitySize: tap(ABILITY_SIZE),
    arcRadius: s(ARC_RADIUS),
    s,
    tap,
  };
}

function arcCenter(i: number, m = touchMetrics()): { right: number; bottom: number } {
  const angle = (i / (SLOTS.length - 1)) * (Math.PI / 2);
  return {
    right: m.attackCenter + Math.cos(angle) * m.arcRadius,
    bottom: m.attackCenter + Math.sin(angle) * m.arcRadius,
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

/** The 陣亡投幣 cap, mirrored from `config.arena-rules@1 goldDrop.coinsPerRound`. */
const COINS_PER_ROUND = 10;

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
  // ⭐ 這一次繪製的尺寸。⚠️ 讀模組單例（不是 React state）—— 與 `AbilityBar` /
  // `EnemyTeamPanel` 同一個做法，所以改設定要等下一次 hud snapshot 才重繪。
  const m = touchMetrics();

  return (
    <div ref={rootRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 20 }}>
      {/* held-button description panel across the top of the screen (task #152) */}
      <AbilityDescriptionOverlay />
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
        onTouchStart={coinMode ? dropCoin : pressHandler("ATTACK")}
        style={{
          ...circleBase,
          right: m.attackCenter - m.attackSize / 2,
          bottom: m.attackCenter - m.attackSize / 2,
          width: m.attackSize,
          height: m.attackSize,
          background: coinMode ? "rgba(58, 46, 18, 0.9)" : "rgba(58, 28, 30, 0.85)",
          border: coinMode ? `2px solid ${GOLD}` : "2px solid #7a3230",
          color: coinMode ? GOLD : TEXT_MAIN,
          fontSize: coinMode ? m.s(13) : m.s(30),
          lineHeight: 1.25,
          fontWeight: coinMode ? 700 : 400,
        }}
      >
        {coinMode ? (
          <>
            <div>丟 100金</div>
            <div style={{ fontSize: m.s(11), opacity: 0.85 }}>{seat.coinsLeft}/{COINS_PER_ROUND}</div>
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
                  setHeldAbility(slot, rangeGuide().pressOpensBanner ? "full" : "aim");
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
              {/* ⭐ 就緒框（owner 2026-08-13）—— 被動的 pressable 是 false ⇒ 永遠不亮 */}
              {isAbilityTileReady({
                pressable: !passive,
                offCooldown: !cd.onCd,
                manaOk: localMana >= (ability.manaCost[Math.max(0, rank - 1)] ?? 0),
                learned,
              }) && <div style={abilityReadyFrameStyle(READY_RGB_ACTIVE)} />}
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
              setHeldAbility("EX", rangeGuide().pressOpensBanner ? "full" : "aim");
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
            {/* ⭐ 就緒框（owner 2026-08-13）—— 被動的 pressable 是 false ⇒ 永遠不亮 */}
            {isAbilityTileReady({
              pressable: !exPassive,
              offCooldown: !cd.onCd,
              manaOk: localMana >= (ex.manaCost ?? 0),
            }) && <div style={abilityReadyFrameStyle(READY_RGB_EX)} />}
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
              setHeldAbility("PASSIVE");
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
            {/* ⭐ 就緒框（owner 2026-08-13）—— 被動的 pressable 是 false ⇒ 永遠不亮 */}
            {isAbilityTileReady({
              pressable: castable,
              offCooldown: !cd.onCd,
              manaOk: localMana >= (innate.manaCost ?? 0),
            }) && <div style={abilityReadyFrameStyle(READY_RGB_PASSIVE)} />}
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

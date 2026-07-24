/**
 * AbilityBar — the SIX-slot bar: Q/W/E/R icons with ranks + cooldown sweeps
 * (SeatState.cooldowns, ticks → seconds) and rank-up buttons when points are
 * unspent, then the EX, then the 天生技 (innate) the champion owns from level 1.
 * Ability names/castTypes come from the SHARED content registry — same defs the
 * server casts with.
 *
 * The sixth tile is deliberately NOT shaped like the other five: no hotkey
 * caption, no rank pips, no rank-up button, a violet accent and a 天生 badge,
 * because it is not something the player presses or spends a point on. See
 * `ui/passiveSlot` for why the slot exists and how 被動 vs 主動 differ.
 *
 * ---------------------------------------------------------------------------
 * CAST FEEDBACK (playtest P7) — every press answers, one way or the other
 * ---------------------------------------------------------------------------
 * 「按了 Q，沒有特效，也沒有『不能施放』」. Two halves, both painted here:
 *
 *   • ACCEPTED — the sim's `castBegin`/`abilityCast` comes back and the tile
 *     gets a bright confirm rim (`ui/castFeedback.noteCastConfirmed`). This is
 *     NOT redundant with the cast-fill below: an INSTANT ability has no channel
 *     to fill and its cooldown sweep starts a frame later at a snapshot rate,
 *     so before this the fastest abilities in the game confirmed nothing at all.
 *     The world-space VFX is another lane's job — the button read is this one's.
 *
 *   • REFUSED — the tile shakes red and `components/CastNotice` says why
 *     (冷卻中還有 3 秒 / 魔力不足 / 尚未學習…). The refusal is predicted locally on
 *     the press for the reasons the client is certain about, then corrected by
 *     the server's authoritative `castRejected` for the aiming ones.
 *
 * Both are sampled per-frame in the SAME rAF loop that drives the cast fill —
 * per-frame data never passes through React state (client-08). Tiles carry a
 * `data-slot-key` so the loop can find the one that was pressed.
 */
import { useEffect, useRef } from "react";
import { TICK_HZ } from "@ggd/shared/constants";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import { isPassiveOnly } from "@ggd/shared/sim/abilities/abilityPassives";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import type { ChampionAbilitySlot, CoreAbilitySlot } from "@ggd/shared/sim/intents";
import { useHud } from "../../net/RoomStore";
import { frameBus } from "../../frameBus";
import { hudActions } from "../actions";
import { setHeldAbility } from "../abilityHold";
import { abilityActivationCue } from "../abilityCue";
import { prefersReducedMotion } from "../buttonSfx";
import { AbilityDescriptionOverlay } from "../AbilityDescriptionOverlay";
import { exSlotView } from "../exSlot";
import { denyShakeOffset, sampleCastFlash } from "../castFeedback";
import { INNATE_ACTIVE_CASTABLE } from "../castAnnounce";
import { CastNoticeLine } from "./CastNotice";
import {
  innateCastNote,
  innateKindLabel,
  passiveSlotView,
  PASSIVE_ACCENT,
  PASSIVE_SLOT_LABEL,
} from "../passiveSlot";
import { iconSrc } from "../icons";
import { IconImg } from "./IconImg";
import { Tooltip, type TooltipMeta } from "./Tooltip";
import { castTypeLabel, docDescription, stripAbilityNumber } from "./abilityText";
import { SfxButton } from "../SfxButton";
import { GOLD, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

const SLOTS: CoreAbilitySlot[] = ["Q", "W", "E", "R"];
const EX_ACCENT = "#f2a13c"; // distinct amber for the EX slot

/** Quick scale-down + brightness flash on press (skipped under reduced-motion). */
function pressVisualDown(el: HTMLElement): void {
  if (prefersReducedMotion()) return;
  el.style.transform = "scale(0.9)";
  el.style.filter = "brightness(1.35)";
}
function pressVisualClear(el: HTMLElement): void {
  el.style.transform = "";
  el.style.filter = "";
}

/**
 * Mouse-hold → floor + top-of-screen preview (task #152): press latches the slot
 * onto the ui/abilityHold seam; release / leaving the tile clears it. Covers
 * mouse via pointer events; the touch bar wires the same seam with touch events.
 *
 * The press ALSO gives button feedback the sim cast never did on desktop: a
 * click cue (abilityCue — de-duped so it can't double with the keyboard
 * shortcut) plus a scale/flash press animation. The cue options tune the sound:
 * `denied` → refusal on an unlearned / cooling-down tile; `passive` → a soft
 * neutral tick for a passive-only tile (pressing it does nothing). Every press
 * still answers with SOME feedback.
 */
function holdProps(
  slot: ChampionAbilitySlot,
  cue: { denied?: boolean; passive?: boolean },
): React.DOMAttributes<HTMLDivElement> {
  return {
    onPointerDown: (e) => {
      setHeldAbility(slot);
      abilityActivationCue(slot, cue);
      pressVisualDown(e.currentTarget);
    },
    onPointerUp: (e) => {
      setHeldAbility(null);
      pressVisualClear(e.currentTarget);
    },
    onPointerLeave: (e) => {
      setHeldAbility(null);
      pressVisualClear(e.currentTarget);
    },
    onPointerCancel: (e) => {
      setHeldAbility(null);
      pressVisualClear(e.currentTarget);
    },
  };
}
const CAST_FILL = "rgba(84,176,240,0.45)"; // ability channel — blue
const WINDUP_FILL = "rgba(240,168,64,0.45)"; // basic-attack wind-up — orange

/** Confirm rim — the same cyan family as the cast fill, so they read as one idea. */
const CONFIRM_RIM = "120, 220, 255";
/** Refusal — red, and it MOVES (denyShakeOffset), so it survives a muted device. */
const DENY_RIM = "255, 96, 96";

/**
 * Paint one tile's press verdict for this frame. Split out and PURE-ish (it
 * only writes styles) so both the rAF loop and the tests can reason about it:
 * a `null` sample must restore the tile exactly, or a refused press would leave
 * a red button behind forever.
 */
export function paintCastFlash(
  el: HTMLElement,
  sample: { kind: "confirm" | "deny"; strength: number } | null,
): void {
  if (!sample) {
    el.style.boxShadow = "";
    el.style.removeProperty("--ggd-cast-shake");
    if (el.dataset.castShake === "1") {
      el.style.transform = "";
      delete el.dataset.castShake;
    }
    return;
  }
  const rgb = sample.kind === "deny" ? DENY_RIM : CONFIRM_RIM;
  const spread = (sample.kind === "deny" ? 9 : 12) * sample.strength;
  el.style.boxShadow = `0 0 ${spread.toFixed(1)}px ${(spread / 2).toFixed(1)}px rgba(${rgb},${(
    0.85 * sample.strength
  ).toFixed(2)}), inset 0 0 0 2px rgba(${rgb},${(0.9 * sample.strength).toFixed(2)})`;
  if (sample.kind === "deny") {
    // The shake is written onto `transform` directly rather than a class, since
    // the press animation already owns that property on this element.
    el.style.transform = `translateX(${denyShakeOffset(sample.strength).toFixed(2)}px)`;
    el.dataset.castShake = "1";
  }
}

export function AbilityBar(): React.JSX.Element | null {
  const seat = useHud((s) => (s.localSeatId === null ? null : (s.seats.find((v) => v.seatId === s.localSeatId) ?? null)));
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Imperative cast-fill overlay: reads frameBus.localCast every frame and
  // grows the fill on the slot that's casting — off the React/per-frame path.
  useEffect(() => {
    let raf = 0;
    const frame = (): void => {
      raf = requestAnimationFrame(frame);
      const root = rootRef.current;
      if (!root) return;
      const lc = frameBus.localCast;
      const fills = root.querySelectorAll<HTMLDivElement>("[data-cast-slot]");
      fills.forEach((el) => {
        const slot = Number(el.dataset.castSlot);
        if (lc && lc.slot === slot) {
          el.style.height = `${Math.max(0, Math.min(100, lc.fraction * 100)).toFixed(1)}%`;
          el.style.background = lc.kind === "windup" ? WINDUP_FILL : CAST_FILL;
        } else {
          el.style.height = "0%";
        }
      });
      // press verdict (task P7): confirm rim / deny shake, per tile
      const now = performance.now();
      const tiles = root.querySelectorAll<HTMLDivElement>("[data-slot-key]");
      tiles.forEach((el) => {
        const key = el.dataset.slotKey as ChampionAbilitySlot | undefined;
        if (!key) return;
        paintCastFlash(el, sampleCastFlash(key, now));
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!seat || !seat.championId) return null;
  const def = Champions.tryGet(seat.championId as ChampionId);
  if (!def) return null;

  return (
    <>
    {/* held-button description panel across the top of the screen (task #152) */}
    <AbilityDescriptionOverlay />
    {/* why a press was refused, right above the bar that refused it (P7) */}
    <CastNoticeLine />
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        left: "50%",
        bottom: 14,
        transform: "translateX(-50%)",
        display: "flex",
        gap: 6,
        padding: "8px 10px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 8,
        pointerEvents: "auto",
      }}
    >
      {SLOTS.map((slot, i) => {
        const ability = def.abilities[slot];
        const rank = seat.abilityRanks[i] ?? 0;
        const cdTicks = seat.cooldowns[i] ?? 0;
        const cdSecs = cdTicks / TICK_HZ;
        const maxCdSecs = rank > 0 ? (ability.cooldown[rank - 1] ?? 1) : 1;
        const sweep = rank > 0 && cdSecs > 0 ? Math.min(1, cdSecs / maxCdSecs) : 0;
        const learned = rank > 0;
        // passive-only skill (no castable effects) — dashed tile + soft cue
        const passive = isPassiveOnly(ability);
        // rank-scaled numbers (rank-1 values before the ability is learned)
        const cdMeta = ability.cooldown[Math.max(0, rank - 1)] ?? ability.cooldown[0] ?? 0;
        const manaMeta = ability.manaCost[Math.max(0, rank - 1)] ?? ability.manaCost[0] ?? 0;
        const meta: TooltipMeta[] = [
          { label: "施法", value: castTypeLabel(ability.castType) },
          { label: "冷卻", base: cdMeta, factor: "cooldown", unit: "s" },
        ];
        if (manaMeta > 0) meta.push({ label: "魔力", value: `${manaMeta}` });
        return (
          <div key={slot} style={{ position: "relative", width: 52, textAlign: "center" }}>
            <Tooltip title={ability.name} body={docDescription(ability)} meta={meta} style={{ display: "block" }}>
            <div
              data-slot-key={slot}
              {...holdProps(slot, { denied: !learned || sweep > 0, passive })}
              style={{
                position: "relative",
                width: 52,
                height: 52,
                borderRadius: 6,
                overflow: "hidden",
                background: learned ? "#243252" : "#161b26",
                // passive skills read as a DASHED outline so they're easy to
                // tell apart from active/castable tiles (虛線外框)
                border: `1px ${passive ? "dashed" : "solid"} ${learned ? "#51649b" : "#2a3040"}`,
                color: learned ? TEXT_MAIN : TEXT_DIM,
                transition: "transform 80ms ease, filter 80ms ease",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: "bold", marginTop: 6 }}>{slot}</div>
              <div style={{ fontSize: 8, color: TEXT_DIM, overflow: "hidden", whiteSpace: "nowrap" }}>
                {stripAbilityNumber(ability.name)}
              </div>
              {/* w3x icon covers the letter tile when present; missing/404 →
                  renders nothing and the letter tile above stays visible.
                  Cooldown sweep + cast fill come AFTER in the DOM → on top. */}
              <IconImg
                fill
                src={iconSrc(ability.icon)}
                alt={ability.name}
                style={learned ? undefined : { filter: "grayscale(1) brightness(0.55)" }}
              />
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
              {/* cast-fill overlay (imperative; grows while this slot casts) */}
              <div
                data-cast-slot={i}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: "0%",
                  background: CAST_FILL,
                  pointerEvents: "none",
                }}
              />
            </div>
            </Tooltip>
            <div style={{ display: "flex", justifyContent: "center", gap: 2, marginTop: 3 }}>
              {Array.from({ length: ability.maxRank }, (_, r) => (
                <div
                  key={r}
                  style={{
                    width: 6,
                    height: 4,
                    borderRadius: 1,
                    background: r < rank ? GOLD : "#333c4f",
                  }}
                />
              ))}
            </div>
            {seat.unspentPoints > 0 && rank < ability.maxRank && (
              <SfxButton
                kind="subdued" // thin glow, no sheen — combat stays quiet
                sfxVolume={0.5}
                pressScale={1} // keeps its translateX(-50%) centering (no scale clobber)
                onClick={() => hudActions.sendCommand({ kind: "rankUpAbility", slot })}
                style={{
                  position: "absolute",
                  top: -12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  border: "1px solid #f2c637",
                  background: "#5d4a12",
                  color: GOLD,
                  fontSize: 12,
                  lineHeight: "16px",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                +
              </SfxButton>
            )}
          </div>
        );
      })}
      {(() => {
        // EX 技能 (5th slot) — rendered only once unlocked (exRank > 0). Distinct
        // amber styling; single-rank, so no rank pips / rank-up button.
        const ex = exSlotView(seat);
        if (!ex) return null;
        const { cdSecs, sweep } = ex;
        // EX can (rarely) be a passive-only skill → dashed tile + soft cue
        const exDef = Abilities.tryGet(seat.exAbilityId as AbilityId);
        const exPassive = exDef ? isPassiveOnly(exDef) : false;
        const exMeta: TooltipMeta[] = [
          { label: "EX 技能", value: castTypeLabel(ex.castType) },
          { label: "冷卻", base: ex.cooldownSec, factor: "cooldown", unit: "s" },
        ];
        if (ex.manaCost !== undefined) exMeta.push({ label: "魔力", value: `${ex.manaCost}` });
        exMeta.push({ label: "快捷", value: "F / Back" });
        return (
          <div style={{ position: "relative", width: 52, textAlign: "center" }}>
            <Tooltip title={ex.name} body={ex.description} meta={exMeta} style={{ display: "block" }}>
            <div
              data-slot-key="EX"
              {...holdProps("EX", { denied: sweep > 0, passive: exPassive })}
              style={{
                position: "relative",
                width: 52,
                height: 52,
                borderRadius: 6,
                overflow: "hidden",
                background: "#3a2a12",
                border: `2px ${exPassive ? "dashed" : "solid"} ${EX_ACCENT}`,
                boxShadow: `0 0 8px ${EX_ACCENT}88`,
                color: TEXT_MAIN,
                transition: "transform 80ms ease, filter 80ms ease",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: "bold", marginTop: 7, color: EX_ACCENT }}>EX</div>
              <div style={{ fontSize: 8, color: TEXT_DIM, overflow: "hidden", whiteSpace: "nowrap" }}>
                {stripAbilityNumber(ex.name)}
              </div>
              {/* w3x EX icon under the sweep/cast overlays; fallback = amber tile */}
              <IconImg fill src={iconSrc(ex.icon)} alt={ex.name} />
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
              <div
                data-cast-slot={4}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: "0%",
                  background: CAST_FILL,
                  pointerEvents: "none",
                }}
              />
            </div>
            </Tooltip>
            <div style={{ marginTop: 3, fontSize: 9, color: EX_ACCENT, letterSpacing: 1 }}>F</div>
          </div>
        );
      })()}
      {(() => {
        // 天生技 (the SIXTH slot) — the recovered NN-00 innate the champion owns
        // from LEVEL 1. Null for the three heroes that genuinely have none.
        //
        // It is deliberately NOT tile-shaped like the five above it:
        //   • a 天生 badge instead of a hotkey letter, and a 「Lv1」 corner chip,
        //     so the "you already own this" fact is on the tile, not just in a
        //     tooltip nobody opens;
        //   • dashed border + no glow for innateKind "passive" (#166's language:
        //     dashed = you do not press this);
        //   • SOLID border + a 主動 chip for innateKind "active" — the map's
        //     D-slot innates are real abilities and must not read as auras.
        // No rank pips and no + button either way: it is never ranked.
        const innate = passiveSlotView(seat.championId);
        if (!innate) return null;
        const active = innate.innateKind === "active";
        // The ONE castability seam for the sixth slot (castAnnounce owns the
        // flag). Now TRUE for an active innate: the tile is a real button —
        // pointer cursor, D caption, cooldown sweep and cast fill.
        const castableInnate = active && INNATE_ACTIVE_CASTABLE;
        // Live cooldown off the wire (seat.passiveCooldown), swept exactly like
        // the EX tile. A 40 s innate that painted no sweep would look ready and
        // refuse every press until it silently wasn't.
        const innateCdSecs = (seat.passiveCooldown ?? 0) / TICK_HZ;
        const innateSweep =
          innateCdSecs > 0 ? Math.min(1, innateCdSecs / (innate.cooldownSec ?? innateCdSecs)) : 0;
        // A permanent innate whose doc grants nothing (29 of 48) must not read
        // like the 19 that work — see passiveSlot.effective.
        const inert = !active && !innate.effective;
        const meta: TooltipMeta[] = [
          { label: PASSIVE_SLOT_LABEL, value: innateKindLabel(innate.innateKind) },
        ];
        if (active) {
          meta.push({ label: "施法", value: castTypeLabel(innate.castType) });
          if (innate.cooldownSec !== undefined)
            meta.push({ label: "冷卻", base: innate.cooldownSec, factor: "cooldown", unit: "s" });
          if (innate.manaCost !== undefined) meta.push({ label: "魔力", value: `${innate.manaCost}` });
          if (castableInnate) meta.push({ label: "快捷", value: "D / ✛↑" });
        }
        meta.push({ label: "取得", value: innateCastNote(innate.innateKind, innate.effective) });
        return (
          <div style={{ position: "relative", width: 52, textAlign: "center" }}>
            <Tooltip title={innate.name} body={innate.description} meta={meta} style={{ display: "block" }}>
            <div
              data-slot-key="PASSIVE"
              // held → the top-of-screen description panel (task #152). It never
              // reaches the floor aim ring: getHeldAimSlot() drops PASSIVE, so a
              // non-castable tile cannot draw a cast-range telegraph.
              //
              // `passive` is true for a PURE passive (and for an active innate
              // if the castability flag were ever switched back off): the press
              // is not a failed cast, so it gets the soft tick, never the error
              // beep. A CASTABLE innate is treated like any other button — on
              // cooldown it is a real refusal. `castAnnounce` supplies the words
              // in every case and can still upgrade the tone (mana, dead …).
              {...holdProps(
                "PASSIVE",
                castableInnate ? { denied: innateSweep > 0 } : { passive: true },
              )}
              style={{
                position: "relative",
                width: 52,
                height: 52,
                borderRadius: 6,
                overflow: "hidden",
                background: active ? "#2b2340" : "#1e1b2c",
                border: `${active ? 2 : 1}px ${active ? "solid" : "dashed"} ${PASSIVE_ACCENT}`,
                color: TEXT_MAIN,
                // An INERT permanent innate (no modifier/hook/aura in its doc)
                // is dimmed on top of the dashed border every passive gets, so
                // "owned but doing nothing" is visible at a glance and not only
                // in the caption underneath.
                opacity: inert ? 0.55 : 1,
                // A pointer cursor on a tile that cannot fire is the exact lie
                // #166 removed from pure passives — so it appears only for an
                // innate that really is pressable.
                cursor: castableInnate ? "pointer" : "default",
                transition: "transform 80ms ease, filter 80ms ease",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: "bold", marginTop: 7, color: PASSIVE_ACCENT }}>
                {PASSIVE_SLOT_LABEL}
              </div>
              <div style={{ fontSize: 8, color: TEXT_DIM, overflow: "hidden", whiteSpace: "nowrap" }}>
                {innate.displayName}
              </div>
              <IconImg fill src={iconSrc(innate.icon)} alt={innate.name} />
              {/* 「等級1就獲得」 stated ON the tile — the owner's whole point */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  padding: "0 3px",
                  borderBottomRightRadius: 5,
                  background: "rgba(10,8,20,0.85)",
                  color: PASSIVE_ACCENT,
                  fontSize: 8,
                  lineHeight: "11px",
                }}
              >
                Lv1
              </div>
              {/* 被動 / 主動 — the two shapes an innate takes */}
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: 0,
                  padding: "0 3px",
                  borderTopLeftRadius: 5,
                  background: "rgba(10,8,20,0.85)",
                  color: PASSIVE_ACCENT,
                  fontSize: 8,
                  lineHeight: "11px",
                }}
              >
                {innateKindLabel(innate.innateKind)}
              </div>
              {/* cooldown sweep + seconds — the same two overlays the EX tile
                  draws, so the sixth slot reads as the same kind of thing. Only
                  an active innate can ever be on cooldown. */}
              {innateSweep > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: `${innateSweep * 100}%`,
                    background: "rgba(8, 10, 16, 0.78)",
                  }}
                />
              )}
              {innateSweep > 0 && (
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
                  {Math.ceil(innateCdSecs)}
                </div>
              )}
              {/* channel fill — index 5, matching CastTracker.SLOT_INDEX. Only
                  mounted for a castable innate: a tile that cannot cast must
                  never carry a cast surface that could half-paint. */}
              {castableInnate && (
                <div
                  data-cast-slot={5}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: "0%",
                    background: CAST_FILL,
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
            </Tooltip>
            {/* The caption row. An ACTIVE innate now shows a real hotkey here,
                exactly where the EX shows F — that is how a player learns the
                key exists at all. The permanent half keeps a sentence instead of
                a key, and it tells the truth about ITSELF: 「無需施放」 for one
                that is genuinely running, 「未實作」 for the 29 whose doc grants
                nothing, because those two must not look the same. */}
            <div
              style={{
                marginTop: 3,
                fontSize: castableInnate ? 9 : 8,
                color: castableInnate ? PASSIVE_ACCENT : inert ? "#c98a8a" : TEXT_DIM,
                letterSpacing: castableInnate ? 1 : 0.5,
              }}
            >
              {active ? (castableInnate ? "D" : "自動擁有 · 待接") : inert ? "未實作" : "無需施放"}
            </div>
          </div>
        );
      })()}
    </div>
    </>
  );
}

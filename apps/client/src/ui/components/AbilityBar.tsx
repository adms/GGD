/**
 * AbilityBar — QWER icons with ranks, cooldown sweeps (SeatState.cooldowns,
 * ticks → seconds) and rank-up buttons when points are unspent. Ability
 * names/castTypes come from the SHARED content registry — same defs the
 * server casts with.
 */
import { useEffect, useRef } from "react";
import { TICK_HZ } from "@ggd/shared/constants";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import type { CoreAbilitySlot } from "@ggd/shared/sim/intents";
import { useHud } from "../../net/RoomStore";
import { frameBus } from "../../frameBus";
import { hudActions } from "../actions";
import { exSlotView } from "../exSlot";
import { iconSrc } from "../icons";
import { IconImg } from "./IconImg";
import { Tooltip, type TooltipMeta } from "./Tooltip";
import { castTypeLabel, docDescription, stripAbilityNumber } from "./abilityText";
import { SfxButton } from "../SfxButton";
import { GOLD, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

const SLOTS: CoreAbilitySlot[] = ["Q", "W", "E", "R"];
const EX_ACCENT = "#f2a13c"; // distinct amber for the EX slot
const CAST_FILL = "rgba(84,176,240,0.45)"; // ability channel — blue
const WINDUP_FILL = "rgba(240,168,64,0.45)"; // basic-attack wind-up — orange

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
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!seat || !seat.championId) return null;
  const def = Champions.tryGet(seat.championId as ChampionId);
  if (!def) return null;

  return (
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
              style={{
                position: "relative",
                width: 52,
                height: 52,
                borderRadius: 6,
                overflow: "hidden",
                background: learned ? "#243252" : "#161b26",
                border: `1px solid ${learned ? "#51649b" : "#2a3040"}`,
                color: learned ? TEXT_MAIN : TEXT_DIM,
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
              style={{
                position: "relative",
                width: 52,
                height: 52,
                borderRadius: 6,
                overflow: "hidden",
                background: "#3a2a12",
                border: `2px solid ${EX_ACCENT}`,
                boxShadow: `0 0 8px ${EX_ACCENT}88`,
                color: TEXT_MAIN,
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
    </div>
  );
}

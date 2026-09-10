import { CASTABLE_SLOTS, type ChampionAbilitySlot } from "@ggd/shared/sim/intents";
import { TICK_HZ } from "@ggd/shared/constants";
import type { SeatView } from "../net/RoomStore";

type RecastSeat = Pick<SeatView, "recastStages" | "recastWindows" | "recastFreeMask">;
export function recastFree(seat: RecastSeat, slot: ChampionAbilitySlot): boolean {
  const index = CASTABLE_SLOTS.indexOf(slot);
  return (seat.recastStages?.[index] ?? 0) > 0 && (seat.recastWindows?.[index] ?? 0) > 0 &&
    ((seat.recastFreeMask ?? 0) & (1 << index)) !== 0;
}
export function RecastBadge({ seat, slot }: { seat: RecastSeat; slot: ChampionAbilitySlot }) {
  const index = CASTABLE_SLOTS.indexOf(slot);
  const stage = seat.recastStages?.[index] ?? 0, ticks = seat.recastWindows?.[index] ?? 0;
  if (!stage || !ticks) return null;
  return <span data-recast-slot={slot} style={{ position: "absolute", top: 0, left: 0, right: 0,
    zIndex: 5, pointerEvents: "none", background: "#381453", color: "#fff", fontSize: 11, textAlign: "center" }}>
    第 {stage} 段 · {(ticks / TICK_HZ).toFixed(1)}s
  </span>;
}

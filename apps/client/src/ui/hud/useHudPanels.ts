/**
 * useHudPanels — the RUNTIME half of the panel-edge contract (task #107).
 *
 * hudLayout.ts declares, statically, which edge each panel owns and how each
 * slot yields when covered (`resolveSlotUnderPanels`, all pure + node-tested).
 * This file is the only glue to the live store: it reads the discrete HUD state
 * to decide which panels are OPEN right now, then resolves a slot's placement
 * through the same pure function the guard uses — so the guard and the running
 * HUD can never disagree.
 *
 * WHY A PHASE/GATE PREDICATE, not the panel's own open-state: the shop owns its
 * closable open/closed toggle privately (panels/MerchantShop.tsx, #106) and this
 * module must not reach into it. It instead mirrors the shop's MOUNT gate —
 * `shopGate(...).mounted`, the exact rule the shop itself uses — which is a pure
 * function of state the store already publishes. So chrome yields for as long as
 * the shop surface is present in this phase (prep, or combat for a defeated
 * player), which is precisely when the left edge is the shop's.
 */
import type { CSSProperties } from "react";
import { useHud } from "../../net/RoomStore";
import { shopGate } from "../panels/shopGate";
import {
  HUD_PANELS,
  HUD_Z,
  hudDisplacedStyle,
  hudSlotStyle,
  resolveSlotUnderPanels,
  type HudPanelSpec,
  type HudSlotId,
} from "./hudLayout";

interface PanelSignals {
  phase: string;
  alive: boolean;
  hasChampion: boolean;
  /** couch/split-screen: HudRoot mounts no shop card in this mode */
  couch: boolean;
  /**
   * The LOCAL player's team is out of the MATCH (team health reached 0) — not
   * merely down for a round. `alive` cannot express it, and a slot reserved for
   * a panel that will never mount is a hole in the layout.
   */
  teamEliminated: boolean;
}

/**
 * Is a corner-COVERING panel open right now? Only panels whose `covers` is
 * non-empty can change a slot's placement, so those are the only ids handled
 * here; a new edge panel that covers a corner must be added to this switch.
 */
function isPanelActive(id: string, s: PanelSignals): boolean {
  switch (id) {
    case "shop":
      // the shop SURFACE (card + re-open button) is present exactly while its
      // gate is mounted: prep for everyone, combat for a defeated player only —
      // and NEVER in couch play, where HudRoot renders no shop (`!couch`).
      // The elimination check must live here too, or the shop's HUD SLOT stays
      // reserved for a panel that will never mount.
      return !s.couch && shopGate(s.phase, s.alive, s.hasChampion, s.teamEliminated).mounted;
    case "match-end":
      return s.phase === "matchEnd";
    default:
      // centred panels (champ-select, augment-draft) cover no corner and so
      // never affect chrome placement; anything unknown is treated as closed.
      return false;
  }
}

/** The corner-covering panels open right now, derived from the discrete store. */
export function useActiveHudPanels(): HudPanelSpec[] {
  const phase = useHud((s) => s.phase);
  const alive = useHud((s) => s.localAlive);
  const hasChampion = useHud((s) => s.localMaxHp > 0);
  const couch = useHud((s) => s.localPlayers.length > 1);
  const teamEliminated = useHud((s) => {
    if (s.localSeatId === null) return false;
    const t = s.seats.find((v) => v.seatId === s.localSeatId)?.teamId;
    return t === undefined ? false : (s.teams.find((v) => v.teamId === t)?.eliminated ?? false);
  });
  return HUD_PANELS.filter(
    (p) =>
      p.covers.length > 0 &&
      isPanelActive(p.id, { phase, alive, hasChampion, couch, teamEliminated }),
  );
}

/**
 * Just the "should I vanish?" bit, for the hide-only slots (dev telemetry and
 * wide status bars). They keep their own `hudSlotStyle(...)` call — position is
 * unchanged, they simply stop rendering while covered:
 *   if (useHudSlotHidden("fps", touch)) return null;
 */
export function useHudSlotHidden(slotId: HudSlotId, touch: boolean): boolean {
  const panels = useActiveHudPanels();
  return resolveSlotUnderPanels(slotId, touch, panels).hidden;
}

export interface HudSlotPlacementStyle {
  /** true = an open panel covers this slot and its policy is to vanish */
  hidden: boolean;
  /** the absolute-position style to spread — relocated if the slot re-homed */
  style: CSSProperties;
}

/**
 * The live placement of a slot: normally `hudSlotStyle`, but when an open panel
 * covers its corner the slot's `displaced` policy applies — it either reports
 * `hidden` (the component returns null) or hands back a relocated style.
 *
 * Drop-in for a `hudSlotStyle(id, touch)` call:
 *   const { hidden, style } = useHudSlotPlacement("fps", touch);
 *   if (hidden) return null;
 *   return <div style={{ ...style, … }} />;
 */
export function useHudSlotPlacement(
  slotId: HudSlotId,
  touch: boolean,
  z: number = HUD_Z.slot,
): HudSlotPlacementStyle {
  const panels = useActiveHudPanels();
  const { relocated, hidden } = resolveSlotUnderPanels(slotId, touch, panels);
  const style = relocated ? hudDisplacedStyle(slotId, touch, z) : hudSlotStyle(slotId, touch, z);
  return { hidden, style };
}

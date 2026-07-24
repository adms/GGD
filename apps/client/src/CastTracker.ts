/**
 * CastTracker — pure, per-entity ability-cast / attack-windup timing for the
 * cast bar. Fed the server's MSG.EVENT stream (castBegin / castEnd /
 * castInterrupt / attackWindup / death) and queried each render frame for a
 * 0→1 progress fraction. NO DOM, NO Babylon, NO React — the render loop writes
 * the result into the frameBus and the WorldAnchorLayer / AbilityBar draw it
 * imperatively (per-frame data never touches React state; client-08).
 *
 * A `castBegin` starts a bar that fills over its `castTimeSec` and is cleared
 * by the matching `castEnd`/`castInterrupt` (or dropped if the end is missed).
 * An `attackWindup` starts a short, self-expiring bar; an in-progress ability
 * cast is NOT overwritten by an auto-attack wind-up.
 */
import { TICK_MS } from "@ggd/shared/constants";

export type CastKind = "cast" | "windup";

export interface CastProgress {
  /** 0..1 fill */
  fraction: number;
  kind: CastKind;
  /** ability slot index Q/W/E/R = 0..3, or -1 for a basic-attack wind-up */
  slot: number;
}

interface Active {
  kind: CastKind;
  startMs: number;
  durationMs: number;
  slot: number;
}

/**
 * Slot name → the bar's tile index, for the cast-fill overlay. PASSIVE is the
 * sixth tile: the innate is cast like anything else and the ~60 active ones
 * include real cast-time abilities, so without this entry a channelling 天生技
 * filled nothing while every other slot did.
 */
const SLOT_INDEX: Record<string, number> = { Q: 0, W: 1, E: 2, R: 3, EX: 4, PASSIVE: 5 };
/** keep a finished cast briefly in case its castEnd event is late/dropped */
const CAST_GRACE_MS = 250;

/** A minimal event shape (matches protocol EventMessage). */
export interface CastEventLike {
  type: string;
  data: Record<string, unknown>;
}

export class CastTracker {
  private readonly active = new Map<number, Active>();

  /** Fold one server event into the per-entity cast/windup state. */
  handleEvent(ev: CastEventLike, nowMs: number): void {
    const d = ev.data ?? {};
    switch (ev.type) {
      case "castBegin": {
        const caster = d.caster as number;
        if (typeof caster !== "number") return;
        const secs = typeof d.castTimeSec === "number" ? d.castTimeSec : 0;
        const ticks = typeof d.ticks === "number" ? d.ticks : 0;
        const durationMs = Math.max(1, secs > 0 ? secs * 1000 : ticks * TICK_MS);
        this.active.set(caster, {
          kind: "cast",
          startMs: nowMs,
          durationMs,
          slot: SLOT_INDEX[String(d.slot)] ?? -1,
        });
        break;
      }
      case "castEnd":
      case "castInterrupt": {
        const caster = d.caster as number;
        const a = this.active.get(caster);
        if (a && a.kind === "cast") this.active.delete(caster);
        break;
      }
      case "attackWindup": {
        const src = d.source as number;
        if (typeof src !== "number") return;
        const existing = this.active.get(src);
        if (existing && existing.kind === "cast") break; // don't clobber an ability cast
        const ticks = typeof d.ticks === "number" ? d.ticks : 0;
        this.active.set(src, { kind: "windup", startMs: nowMs, durationMs: Math.max(1, ticks * TICK_MS), slot: -1 });
        break;
      }
      case "death": {
        this.active.delete(d.id as number);
        break;
      }
    }
  }

  /** Current 0→1 progress for an entity, or null when nothing is casting. */
  progressFor(entityId: number, nowMs: number): CastProgress | null {
    const a = this.active.get(entityId);
    if (!a) return null;
    const elapsed = nowMs - a.startMs;
    const overdue = a.kind === "windup" ? a.durationMs : a.durationMs + CAST_GRACE_MS;
    if (elapsed >= overdue) {
      this.active.delete(entityId);
      return null;
    }
    return { fraction: Math.max(0, Math.min(1, elapsed / a.durationMs)), kind: a.kind, slot: a.slot };
  }

  clear(entityId: number): void {
    this.active.delete(entityId);
  }

  clearAll(): void {
    this.active.clear();
  }
}

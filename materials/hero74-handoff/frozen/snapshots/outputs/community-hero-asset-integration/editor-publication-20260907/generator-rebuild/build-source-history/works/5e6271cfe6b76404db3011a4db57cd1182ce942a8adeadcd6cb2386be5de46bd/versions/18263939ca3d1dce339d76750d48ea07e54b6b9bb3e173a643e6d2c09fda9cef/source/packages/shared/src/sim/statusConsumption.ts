import type { EntityId, StatusId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { StatusEffect } from "./components";
import type { ModifierSource } from "./stats/modifiers";
import { detachSource } from "./stats/statPipeline";
import { adjustMarkCount } from "./marks";
import { clampMarkCount, MARK_MAX_COUNT, markExpired } from "./markLimits";

/** Only transient status records, named counters and buff sources are consumable.
 * Equipment, passives and aura projections must keep their owning lifecycle. */
type Entry = {
  count: number; expiry: number; key: string; index: number;
} & ({ pool: 0; record: StatusEffect } | { pool: 1 } | { pool: 2; record: ModifierSource });

function entries(world: SimWorld, target: EntityId, statusId: StatusId, applierId?: EntityId): Entry[] {
  const out: Entry[] = [];
  for (const [index, s] of (world.status.get(target)?.effects ?? []).entries()) {
    if (s.statusId !== statusId || s.expiresAtTick <= world.tick ||
      (applierId !== undefined && s.applierId !== applierId)) continue;
    const count = clampMarkCount(s.stacks ?? 1);
    if (count > 0) out.push({ pool: 0, record: s, count, expiry: s.expiresAtTick, key: s.sourceId, index });
  }
  const mark = world.marks.get(target)?.get(statusId);
  // Named counters have no applier identity. Never treat one as an owned curse.
  if (applierId === undefined && mark && !markExpired(mark.expiresAtTick, world.tick) && mark.count > 0) {
    out.push({ pool: 1, count: mark.count, expiry: mark.expiresAtTick < 0 ? Infinity : mark.expiresAtTick,
      key: statusId, index: 0 });
  }
  for (const [index, s] of (world.stats.get(target)?.sources ?? []).entries()) {
    if (s.kind !== "buff" || s.statusId !== statusId ||
      (s.expiresAtTick !== undefined && s.expiresAtTick <= world.tick) ||
      (applierId !== undefined && s.applierId !== applierId)) continue;
    // Buff stacks are not capped at the named-counter/HUD limit. Keep their
    // real amount so a partial debit cannot accidentally remove the whole buff.
    const count = s.stacks ?? 1;
    if (Number.isSafeInteger(count) && count > 0) out.push({ pool: 2, record: s, count, expiry: s.expiresAtTick ?? Infinity, key: s.id, index });
  }
  // Consume the first expiring layers first. Pool, key and insertion index make
  // ties explicit; Infinity is local sorting data and never enters world state.
  return out.sort((a, b) => (a.expiry === b.expiry ? 0 : a.expiry < b.expiry ? -1 : 1) ||
    a.pool - b.pool || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || a.index - b.index);
}

export function consumableStatusStacks(world: SimWorld, target: EntityId, statusId: StatusId, applierId?: EntityId): number {
  return clampMarkCount(entries(world, target, statusId, applierId).reduce((n, e) => n + e.count, 0));
}

/** All-or-nothing debit; no hooks or effects run between the check and removal.
 * Returns zero without changing anything when insufficient. `all` requires at
 * least one live layer and removes every matching layer, even above the HUD cap.
 * This is a resource operation, independent of cleanse/dispellable policy. */
export function consumeStatusStacks(
  world: SimWorld, target: EntityId, statusId: StatusId, count: number | "all", applierId?: EntityId,
): number {
  if (count !== "all" && (!Number.isInteger(count) || count < 1 || count > MARK_MAX_COUNT)) return 0;
  const held = entries(world, target, statusId, applierId);
  const total = held.reduce((n, e) => n + e.count, 0);
  const need = count === "all" ? total : count;
  if (need === 0 || total < need) return 0;
  let left = need;
  for (const e of held) {
    const take = Math.min(left, e.count);
    if (take === 0) break;
    if (e.pool === 1) {
      // Keep the installed counter at zero so future hits can refill it, and
      // preserve perStackLost grants and the existing HUD markChanged event.
      adjustMarkCount(world, target, statusId, -take);
    } else if (e.pool === 0) {
      if (take < e.count) e.record.stacks = e.count - take;
      else {
        const status = world.status.get(target)!;
        status.effects = status.effects.filter(s => s !== e.record);
      }
    } else {
      const stats = world.stats.get(target)!;
      if (take < e.count) e.record.stacks = e.count - take;
      // Remove this exact instance; compound buffs can share a same-tick id.
      else detachSource(world, target, e.record);
      stats.dirty = true;
    }
    left -= take;
  }
  return need;
}

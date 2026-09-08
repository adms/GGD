import type { EntityId } from "../../ids";
import type { Health } from "../components";

type Pool = Health["shields"][number];

/** Consume exactly the part absorbed; never credit an unowned older shield to a later caster. */
export function consumeShieldCredit(pool: Pool, absorbed: number, totals: Map<EntityId, number>): void {
  let remaining = absorbed;
  for (const credit of pool.credits ?? []) {
    const used = Math.min(remaining, credit.amount);
    credit.amount -= used;
    remaining -= used;
    if (used > 0 && credit.source !== undefined) {
      totals.set(credit.source, (totals.get(credit.source) ?? 0) + used);
    }
    if (remaining <= 0) break;
  }
  if (pool.credits) pool.credits = pool.credits.filter(c => c.amount > 0);
}

/** Merge attribution under the same policy as the amount. A weaker refresh cannot steal credit. */
export function mergeShieldCredit(pool: Pool, amount: number, source: EntityId | undefined, mode: "replace" | "keepLarger" | "stack"): void {
  const fresh = amount > 0 ? [{ ...(source !== undefined ? { source } : {}), amount }] : [];
  if (mode === "keepLarger" && amount <= pool.amount) return;
  if (mode !== "stack") {
    if (source !== undefined) pool.credits = fresh;
    else delete pool.credits;
    return;
  }
  if (!pool.credits && source === undefined) return;
  pool.credits ??= [{ amount: pool.amount }];
  const last = pool.credits[pool.credits.length - 1];
  if (last && last.source === source) last.amount += amount;
  else pool.credits.push(...fresh);
}

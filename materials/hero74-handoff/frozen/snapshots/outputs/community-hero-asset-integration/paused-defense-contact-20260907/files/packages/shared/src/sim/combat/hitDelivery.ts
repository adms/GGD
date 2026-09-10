import type { EffectContext } from "../effects/effect";

/** Runtime provenance, assigned by the delivery path rather than attacker range. */
export type HitDelivery = "contact" | "projectile" | "periodic" | "other";
export const HIT_DELIVERY_FILTERS = ["any", "direct", "contact", "projectile", "periodic", "other"] as const;
export type HitDeliveryFilter = typeof HIT_DELIVERY_FILTERS[number];

export function hitDeliveryPasses(filter: HitDeliveryFilter, actual: HitDelivery | undefined): boolean {
  if (filter === "any") return true;
  if (filter === "direct") return actual === "contact" || actual === "projectile";
  return filter === (actual ?? "other");
}

/** A contact checkbox cannot turn a projectile, proc or unknown carrier into melee.
 * Only a real direct cast (or a carrier preserving that provenance) may opt in.
 */
export function effectHitDelivery(effect: { contact?: boolean }, ctx: EffectContext): HitDelivery | undefined {
  if (ctx.hitDelivery === "projectile" || ctx.hitDelivery === "periodic" || ctx.hitDelivery === "other") return ctx.hitDelivery;
  if (effect.contact === true && ctx.hitDelivery === "contact" && ctx.incoming === undefined &&
      ctx.castInstance?.caster === ctx.caster && ctx.origin === `ability:${ctx.castInstance.abilityId}`) return "contact";
  return undefined;
}

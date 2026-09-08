import type { EffectDef } from "../effect";
/** A stationary, single-use basic-attack interceptor. */
export interface TrapVariant {
  kind: "trap";
  radius: number;
  durationSec: number;
  armDelaySec?: number;
  maxAlive?: number;
  triggerAt?: "attacker" | "victim";
  cancelAttack?: boolean;
  onOwnerDeath?: "despawn" | "persist";
  onTrigger: EffectDef[];
}

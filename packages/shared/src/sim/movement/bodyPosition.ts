import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";

export interface BodyPosition { x: number; z: number; y: number; zone: number }
export function bodyPosition(world: SimWorld, id: EntityId): BodyPosition | undefined {
  const t = world.transform.get(id);
  return t ? { ...t.pos, y: world.airborne.get(id)?.y ?? 0, zone: t.zone } : undefined;
}
/** Position, not input or facing: a blocked order does not count as movement. */
export function bodyMoved(a: BodyPosition, b: BodyPosition): boolean {
  const x = a.x - b.x, z = a.z - b.z, y = a.y - b.y;
  return a.zone !== b.zone || x * x + z * z + y * y > 1e-8;
}

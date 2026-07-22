/**
 * Uniform-grid spatial hash for broad-phase queries. Rebuilt (or incrementally
 * updated) once per tick; queried by movement resolution, ability overlap tests,
 * and AI perception. Deterministic: results are returned sorted by EntityId.
 */
import type { EntityId } from "../../ids";
import type { Vec2 } from "../math/vec2";
import type { AABB } from "./shapes";

export class SpatialHash {
  private cells = new Map<number, EntityId[]>();
  private entityBounds = new Map<EntityId, AABB>();

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cz: number): number {
    // pack two 16-bit signed cell coords into one int key
    return ((cx & 0xffff) << 16) | (cz & 0xffff);
  }

  private cellOf(x: number): number {
    return Math.floor(x / this.cellSize);
  }

  clear(): void {
    this.cells.clear();
    this.entityBounds.clear();
  }

  insert(id: EntityId, bounds: AABB): void {
    this.entityBounds.set(id, bounds);
    const x0 = this.cellOf(bounds.min.x);
    const x1 = this.cellOf(bounds.max.x);
    const z0 = this.cellOf(bounds.min.z);
    const z1 = this.cellOf(bounds.max.z);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz);
        let arr = this.cells.get(k);
        if (!arr) {
          arr = [];
          this.cells.set(k, arr);
        }
        arr.push(id);
      }
    }
  }

  /** Insert a circle (common case: a unit at pos with radius r). */
  insertCircle(id: EntityId, center: Vec2, radius: number): void {
    this.insert(id, {
      kind: "aabb",
      min: { x: center.x - radius, z: center.z - radius },
      max: { x: center.x + radius, z: center.z + radius },
    });
  }

  /**
   * All entity ids whose bounds may intersect the query AABB.
   * Sorted ascending & deduplicated → deterministic iteration downstream.
   */
  queryAABB(min: Vec2, max: Vec2): EntityId[] {
    const x0 = this.cellOf(min.x);
    const x1 = this.cellOf(max.x);
    const z0 = this.cellOf(min.z);
    const z1 = this.cellOf(max.z);
    const seen = new Set<EntityId>();
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.cells.get(this.key(cx, cz));
        if (!arr) continue;
        for (const id of arr) {
          const b = this.entityBounds.get(id)!;
          // AABB-vs-AABB precise filter
          if (b.min.x <= max.x && b.max.x >= min.x && b.min.z <= max.z && b.max.z >= min.z) {
            seen.add(id);
          }
        }
      }
    }
    return [...seen].sort((a, b) => a - b);
  }

  queryCircle(center: Vec2, radius: number): EntityId[] {
    return this.queryAABB(
      { x: center.x - radius, z: center.z - radius },
      { x: center.x + radius, z: center.z + radius },
    );
  }
}

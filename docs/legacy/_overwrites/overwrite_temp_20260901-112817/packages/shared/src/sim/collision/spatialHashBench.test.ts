import { describe, it } from "vitest";
import { SpatialHash } from "./spatialHash";
import type { EntityId } from "../../ids";

describe("bench", () => {
  it("N=1000 rebuild+query", () => {
    const N = 1000, TICKS = 200;
    const xs = new Float64Array(N), zs = new Float64Array(N);
    let s = 12345;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < N; i++) { xs[i] = rnd() * 120 - 60; zs[i] = rnd() * 120 - 60; }
    const g = new SpatialHash(4);
    let sink = 0;
    const t0 = performance.now();
    for (let t = 0; t < TICKS; t++) {
      g.clear();
      for (let i = 0; i < N; i++) g.insertCircle(i as EntityId, { x: xs[i]!, z: zs[i]! }, 0.6);
      for (let i = 0; i < N; i++) sink += g.queryCircle({ x: xs[i]!, z: zs[i]! }, 2.6).length;
    }
    const ms = performance.now() - t0;
    // ⭐ 拆開量：rebuild 那一半 vs query 那一半（⛔ 不猜）
    let tb = 0, tq = 0;
    for (let t = 0; t < TICKS; t++) {
      const a = performance.now();
      g.clear();
      for (let i = 0; i < N; i++) g.insertCircle(i as EntityId, { x: xs[i]!, z: zs[i]! }, 0.6);
      g.queryCircle({ x: 0, z: 0 }, 0.1); // 逼它 build
      const b = performance.now();
      for (let i = 0; i < N; i++) sink += g.queryCircle({ x: xs[i]!, z: zs[i]! }, 2.6).length;
      tq += performance.now() - b;
      tb += b - a;
    }
    console.log(`  ⭐ ${(ms / TICKS).toFixed(3)} ms/tick 總 · rebuild ${(tb / TICKS).toFixed(3)} · query ${(tq / TICKS).toFixed(3)}`);
  }, 120_000);
});

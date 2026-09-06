import { expect, it } from "vitest";
import { observeParticleWarmup } from "./particleWarmup";

it("retains each observed emission even when a later paused-scene seek clears it", async () => {
  const counts = [0, 0];
  const systems = counts.map((_, i) => ({ getActiveCount: () => counts[i]! }));
  let rendered = 0;
  const cold = await observeParticleWarmup(systems, () => { counts[rendered++] = 1; }, async () => { counts.fill(0); }, () => rendered < 3);
  expect(cold).toEqual([]);
  expect(rendered).toBe(2);
});

it("returns buffers that never emitted when the bounded warmup stops", async () => {
  const neverReady = { getActiveCount: () => 0 };
  let frames = 0;
  const cold = await observeParticleWarmup([neverReady], () => { frames++; }, async () => {}, () => frames < 2);
  expect(cold).toEqual([neverReady]);
  expect(frames).toBe(2);
});

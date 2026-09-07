import { afterEach, expect, it, vi } from "vitest";
import { ACTOR_MODEL_LOAD_BUDGET_MS, waitForActorModel } from "./waitForActorModel";

afterEach(() => vi.useRealTimers());

it("keeps loading when a cold GLB takes longer than the scene warm-up window", async () => {
  vi.useFakeTimers();
  let adopted = false;
  const render = vi.fn();
  const result = waitForActorModel({ ready: () => adopted, cancelled: () => false, render });
  const settled = vi.fn(); void result.then(settled);
  await vi.advanceTimersByTimeAsync(900);
  expect(settled).not.toHaveBeenCalled();
  adopted = true;
  await vi.advanceTimersByTimeAsync(20);
  expect(await result).toBe("ready");
  expect(render).toHaveBeenCalled();
});

it("bounds a model that never adopts and stops pumping after timeout", async () => {
  vi.useFakeTimers();
  const render = vi.fn();
  const result = waitForActorModel({ ready: () => false, cancelled: () => false, render });
  await vi.advanceTimersByTimeAsync(ACTOR_MODEL_LOAD_BUDGET_MS + 20);
  expect(await result).toBe("timeout");
  const count = render.mock.calls.length;
  await vi.advanceTimersByTimeAsync(1000);
  expect(render).toHaveBeenCalledTimes(count);
});

it("abandons a replaced scene even if its model subsequently finishes", async () => {
  vi.useFakeTimers();
  let disposed = false, adopted = false;
  const render = vi.fn();
  const result = waitForActorModel({ ready: () => adopted, cancelled: () => disposed, render });
  await vi.advanceTimersByTimeAsync(100);
  disposed = true; adopted = true;
  await vi.advanceTimersByTimeAsync(20);
  expect(await result).toBe("cancelled");
});

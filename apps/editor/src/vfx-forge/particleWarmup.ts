/** Observe buffers on the frame that creates them, before another UI callback
 * can seek/reset a paused scene. A later zero count does not undo that proof. */
export async function observeParticleWarmup<T extends { getActiveCount(): number }>(
  systems: readonly T[], render: () => void, nextFrame: () => Promise<void>,
  canContinue: () => boolean,
): Promise<T[]> {
  const cold = new Set(systems);
  while (cold.size && canContinue()) {
    render();
    for (const system of cold) if (system.getActiveCount() > 0) cold.delete(system);
    if (cold.size) await nextFrame();
  }
  return [...cold];
}

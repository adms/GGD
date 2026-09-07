/** Loading/decoding a GLB is separate from warming an already-loaded scene. */
export const ACTOR_MODEL_LOAD_BUDGET_MS = 10_000;

export async function waitForActorModel(options: {
  ready(): boolean;
  cancelled(): boolean;
  render(): void;
}): Promise<"ready" | "timeout" | "cancelled"> {
  const deadline = Date.now() + ACTOR_MODEL_LOAD_BUDGET_MS;
  for (;;) {
    if (options.cancelled()) return "cancelled";
    if (options.ready()) return "ready";
    if (Date.now() >= deadline) return "timeout";
    options.render();
    await new Promise<void>(resolve => globalThis.setTimeout(resolve, 1000 / 60));
  }
}

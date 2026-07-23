/**
 * render/vfx — the shared VFX-primitive library (task #123) and the 48-champion
 * roster bindings (task #79) + per-invocation art params (task #50).
 *
 * Primitives are PURE data (VfxDoc) with no Babylon import, so they both ship
 * at runtime (through `vfx/particleFactory.toParticleSystem`) and generate the
 * authored `content/vfx/fx.prim.*.json` docs the game resolves via `vfxKey`.
 */
export * from "./primitives";
export * from "./elements";
export * from "./artParams";
export * from "./bindings";

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
// The FAITHFUL layer beneath the primitives (task #98): the WC3 `PRE2` emitter
// parameter block → `vfx@1`, attachment-point resolution, and the particle
// budget. All three are PURE, so this barrel stays importable from the doc
// generator and from Node tests.
export * from "./w3xEmitter";
export * from "./attachment";
export * from "./emitterBudget";
// The three families the owner named — 球體 / 蝗蟲群 / 粒子 — as data
// (`content/vfx/_w3x-families.json`) plus the pure bridge that turns one of
// them into a rig spec. Both are Babylon-free, same as everything above.
export * from "./w3xFamilies";
export * from "./w3xFamilyRuntime";
// NOTE: `W3xEmitterRig` (the Babylon runtime for the above) is deliberately NOT
// re-exported here — it imports `@babylonjs/*`, and this barrel must stay
// GPU-free. Import it directly: `render/vfx/W3xEmitterRig`.

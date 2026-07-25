/**
 * @ggd/shared/voxel — the in-house procedural blocky-humanoid generator.
 *
 * ONE CORE, THREE CONSUMERS (owner directive #229, 「不要 fork 第二個產生器」):
 *
 *   tools/voxel-gen/      offline bake → deterministic, sha256-pinned .glb (#226)
 *   apps/admin  鑄形工坊   live preview + model@1 authoring (this task)
 *   apps/client           the in-game figure and its procedural fallback (#226)
 *
 * Everything here is PURE: no Babylon, no node `Buffer`, no `Math.random`, no
 * `Date`, no locale-sensitive formatting. That is not stylistic — it is the
 * only way one module can be imported by a browser bundle, a CLI and a test
 * runner at once, and it is what makes "the admin preview and the shipped
 * character follow byte-for-byte the same rules" checkable instead of hopeful.
 *
 * IP: every number in this directory was written for this project. Nothing is
 * downloaded from, copied from or derived from any Mojang/Microsoft model,
 * skin or texture. The blocky STYLE is not protectable; their assets are, and
 * none are present. There is no import, upload or file-picker path anywhere in
 * the generator or the studio — the pipeline is structurally incapable of
 * ingesting a third-party asset.
 */
export * from "./boxman";
export * from "./clips";
export * from "./archetypes";
export * from "./look";
export * from "./figure";
export * from "./texture";
export * from "./doc";

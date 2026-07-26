/**
 * `@ggd/shared/content/voxelSkin` — task #231's per-champion voxel skin: a pure
 * deterministic generator (champion identity → recipe) plus a pure painter
 * (recipe → 64×64 RGBA atlas). Zero texture bytes ship; the atlas is painted on
 * the client at view-construction time.
 *
 * Consumed by the client render layer (render/views/voxelSkin*), by the admin
 * 體素外觀對照表 contact sheet, and by the tests that hold the whole thing to
 * "114 champions, 114 distinct looks".
 */
export * from "./types";
export * from "./hash";
export * from "./palette";
export * from "./rules";
export * from "./hints";
export * from "./generate";
// task #231's second half: WHY a champion came out that colour, per axis.
export * from "./explain";
export * from "./paint";
export * from "./roster";

/**
 * `spawnVfx` — the WC3 "dummy effect unit" idiom as a one-shot cosmetic event.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 *
 * ⭐ GH#649/#565 —— `at:"bone"`：payload 多帶 `attach`（WC3 掛點字串），
 * 客戶端解析到施法者模型的骨頭節點。座標仍然送（施法者腳下）——
 * 那是「替身骨架／模型還在載」時客戶端**退回胸口**用的世界座標，
 * ⛔ 不是不畫（見 `VfxSystem` 的 vfxSpawn case）。
 */
import type { EntityId } from "../../ids";
import type { EffectKindSpec } from "./effectKind";

/**
 * ⭐ `vfxSpawn` 的酬載型別 —— GH#608 的規矩：**payload 型別住 emit 站旁邊，
 * 兩邊 import 同一個**。客戶端（`VfxSystem` 的 vfxSpawn case）讀的每一格
 * 都要在這裡有名字，⛔ 不要在消費端 `as` 一個 sim 從來沒送過的欄位
 * （失敗形態⑧：消費端存在，但它消費不到）。
 *
 * ⚠️ 刻意是 **type alias 不是 interface**：只有 alias 拿得到隱含索引簽章，
 * 於是 `world.emit(…, payload)`（要 `Record<string, unknown>`）與客戶端的
 * `ev.data as Partial<VfxSpawnEvent>` **兩個方向都直接成立** ——
 * ⛔ 不必 `as unknown as`，而每一個 `as unknown as` 都是一個靜默的洞
 * （interface 沒有隱含索引簽章 ⇒ 兩邊都會是 tsc 的紅）。
 */
export type VfxSpawnEvent = {
  vfxId: string;
  /** world point — `at:"bone"` 時是施法者腳下（客戶端無模型可掛時的退路） */
  x: number;
  z: number;
  caster: EntityId;
  durationSec?: number;
  /** ⭐ `at:"bone"` 才有：WC3 掛點字串（chest / hand,right / weapon / …） */
  attach?: string;
  /**
   * ⭐【這一發的連續參數覆寫】GH#838（owner 2026-08-28「用 silder 調大小、透明度、
   * 顏色、轉向、高度、動畫速度」）。詞彙是 `AbilityVfxLayerOverride`
   * （w3xScale / alpha / tint / facingDeg / pitchDeg / flyHeight / timeScale）。
   *
   * ⚠️ **唯一的寫入端是客戶端的 `VfxScriptPlayer`** —— 演出腳本本來就在客戶端
   * 合成 wire 酬載（那是它的設計）。⛔ sim 的 `spawnVfx` 不寫它：粒子的外觀是
   * 演出，⛔ 不是權威狀態，讓 sim 帶它只會多一份要對帳的東西。
   * ⇒ 這一格刻意**沒有** Zod（wire 型別不是內容 schema），而它的內容 schema
   * 住在 `vfx-script@1` 的 vfx 段上（`zAbilityVfxLayerOverride.shape`）。
   *
   * 缺席 ⇒ 客戶端走 `applyVfxOverrides` 的 identity 快速路徑 ⇒ 逐位元同以前。
   */
  overrides?: Record<string, unknown>;
};

export const spawnVfxEffect: EffectKindSpec<"spawnVfx"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // Cosmetic only: resolve a world point and emit a vfxSpawn event for the
    // client's VfxSystem. No world mutation, no rng → deterministic (two
    // seeded runs emit identical events from identical transforms).
    const at = e.at ?? "self";
    let pos: { x: number; z: number } | undefined;
    if (at === "point") {
      pos = ctx.point;
    } else if (at === "target") {
      const tid = ctx.targets[0];
      pos = (tid !== undefined ? world.transform.get(tid)?.pos : undefined) ?? ctx.point;
    }
    // `at:"bone"` 與 `self` 同路：錨定單位是施法者，骨頭在客戶端才解析。
    if (!pos) pos = world.transform.get(ctx.caster)?.pos;
    if (!pos) return;
    const payload: VfxSpawnEvent = {
      vfxId: e.vfxId,
      x: pos.x,
      z: pos.z,
      caster: ctx.caster,
      ...(e.durationSec !== undefined ? { durationSec: e.durationSec } : {}),
      ...(at === "bone" && e.attach !== undefined ? { attach: e.attach } : {}),
    };
    world.emit("vfxSpawn", payload);
  },
};

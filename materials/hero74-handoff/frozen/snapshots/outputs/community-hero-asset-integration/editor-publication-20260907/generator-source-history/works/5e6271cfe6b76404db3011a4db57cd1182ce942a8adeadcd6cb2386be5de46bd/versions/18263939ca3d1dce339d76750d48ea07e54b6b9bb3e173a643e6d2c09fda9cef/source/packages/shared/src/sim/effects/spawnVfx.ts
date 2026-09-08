/**
 * `spawnVfx` — the WC3 "dummy effect unit" idiom as a one-shot cosmetic event.
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 *
 * ⭐ GH#649/#565 —— `at:"bone"`：payload 多帶 `attach`（WC3 掛點字串），
 * 客戶端解析到**錨定單位**模型的骨頭節點。座標仍然送（錨定單位腳下）——
 * 那是「替身骨架／模型還在載」時客戶端**退回胸口**用的世界座標，
 * ⛔ 不是不畫（見 `VfxSystem` 的 vfxSpawn case）。
 *
 * ⭐ GH#809 —— 錨定單位可以是**受擊者**（`boneOn:"victim"`，payload 多帶
 * `attachTo`）。在此之前這一行寫的是「錨定單位是施法者」而那是**恆真**的，
 * 於是原作 317 次 `AddSpecialEffectTargetUnitBJ` 裡明確掛在受擊者身上的
 * **92 次**（`GetEnumUnit()` 83 ＋ `GetSpellTargetUnit()` 9）表達不出來。
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
  /**
   * world point — `at:"bone"` 時是**錨定單位**腳下（客戶端無模型可掛時的退路）。
   * ⭐ GH#809：錨定單位預設是施法者，`boneOn:"victim"` 時是受擊者。
   */
  x: number;
  z: number;
  caster: EntityId;
  /** Authored provenance; lets a VFX script replace ability-owned presentation. */
  origin?: string;
  durationSec?: number;
  /** ⭐ `at:"bone"` 才有：WC3 掛點字串（chest / hand,right / weapon / …） */
  attach?: string;
  /**
   * ⭐ GH#809 —— 骨頭要掛在**哪一個單位**的模型上（entity id）。
   *
   * ⚠️ 它**不是** `caster` 的別名，兩格都要在：`caster` 仍然是「誰放的這一招」，
   * 而客戶端有三個消費端各自讀它 ——【移動拖曳光束】的心跳
   * （`moveTrail.mark(vfxId, data.caster, …)`）、瞄準向量
   * （施法者 → 落點，`orient.yawFrom:"aim"` 讀它）、反彈電弧的種子。
   * ⛔ 把 `caster` 覆寫成受擊者會**同時**弄壞那三條（第八條：轉換不可以帶走
   * 一個玩家看得到的東西）。
   *
   * 缺席 ⇒ 客戶端退回 `caster` ⇒ 逐位元組同這一格出現之前。
   * ⭐ 而 sim 只在 `boneOn:"victim"` 真的解到人時才寫它 ——
   * ⛔ 沒有「送了一個客戶端讀不到的欄位」或反過來（失敗形態⑧）。
   */
  attachTo?: EntityId;
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
    // ⭐ GH#809 —— 錨定單位。`at:"bone"` 在此之前**恆為施法者**，於是原作那
    //    92 次「掛在受擊者身上」（`GetEnumUnit()` 83 ＋ `GetSpellTargetUnit()` 9）
    //    表達不出來。⛔ 這裡不重解一次圓：受擊者就是上游解好的 `ctx.targets[0]`
    //    （與 `at:"target"`、`delayed.who:"victim"` 同一份詞彙）。
    const boneOnVictim = at === "bone" && e.boneOn === "victim";
    const victim = ctx.targets[0];
    // ⭐ 一個受擊者都沒有 ⇒ **什麼都不發**，⛔ 不是退回施法者。
    //    這是逐字的翻譯：原作那一族是 `ForGroup` 的迴圈體，群組空的時候
    //    `AddSpecialEffectTargetUnitBJ` 一次都不會跑。⛔ 退回施法者會讓
    //    「血從被打的人身上噴」在沒打中時變成「血從自己身上噴」——
    //    一個比不畫糟得多的畫面，而且它與正常長得一模一樣。
    if (boneOnVictim && victim === undefined) return;
    const anchor = boneOnVictim ? victim! : ctx.caster;
    let pos: { x: number; z: number } | undefined;
    if (at === "point") {
      pos = ctx.point;
    } else if (at === "target") {
      const tid = ctx.targets[0];
      pos = (tid !== undefined ? world.transform.get(tid)?.pos : undefined) ?? ctx.point;
    }
    // `at:"bone"` 與 `self` 同路：骨頭在客戶端才解析，這裡只送**錨定單位腳下**的
    // 世界座標（客戶端沒有那具模型時的退路）。⭐ 錨定單位預設是施法者，
    // `boneOn:"victim"` 時是受擊者 —— 落點必須跟著換，否則模型還沒載入的那一格
    // 退路會把特效丟回施法者腳下（＝這張票要修的那個病，只是換一格發生）。
    if (!pos) pos = world.transform.get(anchor)?.pos;
    if (!pos) return;
    const payload: VfxSpawnEvent = {
      vfxId: e.vfxId,
      x: pos.x,
      z: pos.z,
      caster: ctx.caster,
      origin: ctx.origin,
      ...(e.durationSec !== undefined ? { durationSec: e.durationSec } : {}),
      ...(at === "bone" && e.attach !== undefined ? { attach: e.attach } : {}),
      // ⭐ 只有真的換了錨定單位才多這一格 ⇒ 既有內容送出的位元組逐位元不變。
      ...(boneOnVictim ? { attachTo: anchor } : {}),
    };
    world.emit("vfxSpawn", payload);
  },
};

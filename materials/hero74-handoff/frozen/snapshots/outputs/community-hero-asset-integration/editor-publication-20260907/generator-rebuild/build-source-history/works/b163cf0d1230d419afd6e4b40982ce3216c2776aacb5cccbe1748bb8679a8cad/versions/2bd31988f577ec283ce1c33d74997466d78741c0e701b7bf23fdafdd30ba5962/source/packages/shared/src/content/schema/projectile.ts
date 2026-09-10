/** projectile@1 — mirrors `ProjectileDef` in sim/content/defs.ts. */
import { z } from "zod";
import type { ProjectileId } from "../../ids";
import { zIdFor, zRef } from "./common";

/**
 * 飛行姿態 (#394) —— 「32 支投射物請接上正確的特效」的那一格。
 *
 * ---------------------------------------------------------------------------
 * 這裡在補什麼洞（量到的，2026-08-19）
 * ---------------------------------------------------------------------------
 * `vfx@1.orient`（#366/#377/#379）只被 `vfx/particleFactory.toParticleSystem`
 * 消費，而**飛行中的投射物不走那條路**：`ProjectileView` 自己 `new
 * ParticleSystem(...)`，只從文件讀顏色 / 貼圖 / 密度 / 壽命 / 混色。所以在一顆
 * 子彈的 vfx 文件上填 `orient` 是**逐位元等於不存在**的宣稱（第一·五守則）。
 *
 * ⛔ 修法**不是**「讓飛行段去讀 vfx 的 `orient`」：那些 vfx 文件是**共用**的
 * （`imported.wave.ki` 與 `imported.bolt.ki` 指同一份 `fx.prim.ki.bolt`，而同一份
 * 文件又是好幾支技能的施法爆點）—— 在共用文件上寫姿態，一動就是三個地方一起動。
 * 姿態是**這一顆飛彈**的性質，所以它住在 `projectile@1` 自己身上。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼**沒有** `yawFrom`（和 `familyOrient.ts` 同一個理由）
 * ---------------------------------------------------------------------------
 * `vfx@1.orient.yawFrom` 有 `"world"` 這個值，因為一個站在地上的爆點確實可以朝
 * 世界的某個方向噴。**一顆飛行中的飛彈沒有這個狀態**：它的方位就是它的行進方向，
 * 填一個世界方位角的意思是「這發子彈永遠頭朝東北飛」——那不是一個效果，那是一個
 * 看起來會動、實際上指錯邊的錯誤。所以這裡只有**偏移**，⛔ 沒有絕對角。
 * 推導出來的東西沒有那個空狀態可以進入（閘，⛔ 不是判準）。
 *
 * ⭐ 三格**全部省略 = 出貨前的畫面一位元不差**：鼻子朝行進方向、水平、不自轉。
 * 所以「關掉」這個功能的方法就是把欄位刪掉，⛔ 不需要第二個總開關。
 */
export const zProjectileFlight = z
  .object({
    /**
     * 疊在**行進方向**上的偏航，度。0 = 鼻子朝前（出貨行為）；
     * **90 = 側身**——一道貫穿波（`pierce: true`）在畫面上該是一彎橫著飛的新月，
     * ⛔ 不是一支頭朝前的飛鏢。上下界 ±180：再多就繞回來了。
     */
    yawOffsetDeg: z.number().min(-180).max(180).optional(),
    /**
     * 鼻子的**抬頭角**，度。0 = 水平（出貨行為）；正 = 鼻子朝上。
     * 土爪那種「從地面竄出的石刺」就是這一格。上下界 ±90（垂直朝上／朝下為止）。
     */
    pitchDeg: z.number().min(-90).max(90).optional(),
    /**
     * 繞**飛行軸**自轉的角速度，度／**每飛行一個世界單位**。0 = 不轉（出貨行為）。
     *
     * ⚠️ 單位刻意是「每單位距離」而不是「每秒」：`ProjectileView.setPose` 只拿得到
     * 位置，拿不到 dt（它是每幀被同步呼叫的，⛔ 沒有時鐘）。用距離累積的另一個
     * 好處是它**與幀率無關**、而且對同一條彈道是決定性的 —— 守衛因此不需要假時鐘。
     * ⚠️ 只有**不是旋轉對稱**的彈體看得出來（`meshShape: "shard"` 的扁刃）；
     * `bolt`/`orb` 是旋轉對稱的，填了也不會動 ⇒ ⛔ 不要填在它們身上。
     * 上下界 ±1440 = 每飛一個世界單位最多四圈。
     */
    rollDegPerUnit: z.number().min(-1440).max(1440).optional(),
  })
  .strict();

export type ProjectileFlight = z.infer<typeof zProjectileFlight>;

export const zProjectileDef = z
  .object({
    id: zIdFor<ProjectileId>(),
    speed: z.number().positive(),
    maxRange: z.number().positive(),
    hitRadius: z.number().positive(),
    pierce: z.boolean().optional(),
    vfxKey: zRef("vfx", { soft: true }).optional(),
    /**
     * RENDER-ONLY (never read by the sim): the 3D body the client builds for
     * the flying projectile, under the particle trail. Omitted → "bolt".
     * A missile that is only a billboard sprite reads as a flat decal from the
     * fixed camera; a real oriented mesh is what makes a ranged auto read as a
     * projectile travelling toward its victim.
     */
    meshShape: z.enum(["bolt", "orb", "shard"]).optional(),
    /**
     * RENDER-ONLY (never read by the sim): 這一顆飛彈在飛行中的**姿態** (#394)。
     * 省略 = 鼻朝行進方向、水平、不自轉 = 升級前的畫面。
     */
    flight: zProjectileFlight.optional(),
  })
  .strict();

export const zProjectileDoc = zProjectileDef
  .extend({ schema: z.literal("projectile@1") })
  .strict();

export type ProjectileDoc = z.infer<typeof zProjectileDoc>;

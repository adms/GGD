import { z } from "zod";
import type { ProjectileId } from "../../../ids";
import { zRef } from "../common";
import {
  EFFECT_COMMON_SHAPE,
  zEffectDef,
} from "./_shared";

export const zSpawnProjectile =
z
  .object({
    kind: z.literal("spawnProjectile"),
    ...EFFECT_COMMON_SHAPE,
    projectileId: zRef<ProjectileId>("projectiles"),
    onHit: z.array(z.lazy(() => zEffectDef)),
    /**
     * GH#1187 鄂爾 R：從哪裡射。`caster`（預設，⭐ 舊行為逐位元不變）＝從施法者身上朝瞄準方向；
     * `rangeEnd` ＝ 在瞄準方向**射程盡頭**生成（出了決鬥區就拉回邊界內），**朝施法者飛回來**，飛到施法者施放時站的地方為止。
     * 距離住在投射物自己的 `maxRange`（⛔ 不在這裡抄第二份）。
     */
    launchFrom: z
      .enum(["caster", "rangeEnd"])
      .optional()
      .describe("從哪裡射：caster（預設，從施法者朝瞄準方向）／rangeEnd（在瞄準方向的射程盡頭生成，朝施法者飛回來）"),
    /**
     * ⭐ GH#1187【撞擊改向】鄂爾 R 後段 —— 這一格有寫，這發投射物就能被**同一次施放的再次施放**改向：
     * 施法者按下後段（`ability.recast`）之後、衝刺途中**身體碰到它** ⇒ 它改朝施法者衝刺方向飛、射程重新算滿、
     * 命中記錄清空、之後命中改跑**這一串**（例：擊飛）。
     * 沒按後段就先被它碰到身體 ⇒ 改向機會作廢且後段窗口當場結束；它飛完仍沒被改向 ⇒ 同樣結束窗口。
     * 規則開關：`config.displacement-tiers@1` 的 `projectileRedirect.mode`（contact／press／off）。缺 = 不能被改向。
     * ⚠️ 刻意是一條**直接的子效果鏈**（⛔ 不包成 `{ onHit }` 物件）：`effectChildChains.ts` 的型別閘才抓得到它，
     * 強化／AP 係數／說明產生器那些走子鏈的讀端才不會漏掉這一串。
     */
    onRedirectHit: z
      .array(z.lazy(() => zEffectDef))
      .min(1)
      .optional()
      .describe("撞擊改向：施法者再次施放後衝刺撞到這發投射物，它改朝衝刺方向飛，之後命中改跑這裡的效果。留空＝不能被改向"),
  })
  .strict();

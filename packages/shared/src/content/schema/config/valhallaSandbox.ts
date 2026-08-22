import { z } from "zod";
import { zId } from "../common";

/**
 * config.valhalla-sandbox@1 — 英靈殿技能試放空間的規則（GH#254）。
 *
 * owner 原話:「英靈殿 多一個施展技能小模擬空間(但人不會移動，鏡頭永遠跟著人)
 * 以及一個生命 10,000 的假人 (生命歸零3秒後自動補滿)」——
 * `dummyHealth` 與 `dummyRespawnSec` 兩格是他明說的,其餘五格是被寫成欄位的
 * 決策點（CLAUDE.md 第一守則:「心裡出現要選 A 還是 B」的那些）。
 *
 * ⚠️ 值與上下界的**唯一真相**是
 * `apps/client/src/ui/platform/valhalla/valhallaSandboxRules.ts` 的
 * `DEFAULT_VALHALLA_SANDBOX` / `VALHALLA_SANDBOX_BOUNDS`;這裡是內容層的鏡像,
 * `apps/admin/src/laneConfigDocs.test.ts` 逐格比對。
 *
 * ⚠️ 同樣**還沒有執行期消費端**（沙盒直接吃常數）,見 `configDocCoverage.ts`。
 */
export const zConfigValhallaSandboxDoc = z
  .object({
    id: zId,
    schema: z.literal("config.valhalla-sandbox@1"),
    note: z.string().optional(),
    /** 假人的生命上限。owner 明說 10,000。 */
    dummyHealth: z.number().int().min(1).max(1_000_000),
    /** 假人歸零之後幾秒補滿。owner 明說 3 秒;0 = 立刻補滿也是合法玩法。 */
    dummyRespawnSec: z.number().min(0).max(60),
    /** 假人站在英雄正前方幾公尺。太遠近戰會完全空揮（房間裡不能走路）。 */
    dummyDistance: z.number().min(0.5).max(30),
    /** 沙盒要不要套用線上的 combat-env 全域倍率（#125:預覽不可以說謊）。 */
    applyCombatEnv: z.boolean(),
    /** `anchor` = 連擊退/衝刺都推不動;`input` = 只吃掉走位指令。 */
    movementLock: z.enum(["anchor", "input"]),
    /** 進場就把 W/E/R 升到 1 級並解鎖 EX。關掉的話六格裡有五格是死的。 */
    unlockAllSlots: z.boolean(),
    /** 魔力不消耗。關掉的話多數英雄放兩三發就會 `no-mana`。 */
    infiniteMana: z.boolean(),
  })
  .strict();
export type ConfigValhallaSandboxDoc = z.infer<typeof zConfigValhallaSandboxDoc>;
export type ValhallaSandboxPolicyDoc = Omit<ConfigValhallaSandboxDoc, "id" | "schema" | "note">;

/**
 * 出貨預設。owner 明說的兩格是 `dummyHealth: 10000` 與 `dummyRespawnSec: 3`。
 *
 * ⚠️ 同上,唯一真相是 `valhallaSandboxRules.ts` 的 `DEFAULT_VALHALLA_SANDBOX`。
 */
export const DEFAULT_VALHALLA_SANDBOX_POLICY: ValhallaSandboxPolicyDoc = {
  dummyHealth: 10_000,
  dummyRespawnSec: 3,
  dummyDistance: 3.2,
  applyCombatEnv: true,
  movementLock: "anchor",
  unlockAllSlots: true,
  infiniteMana: true,
};

/** 同上。文件缺席時沙盒仍然要開得起來（假人 10,000 血、三秒補滿）。 */
export function resolveValhallaSandbox(
  doc: ConfigValhallaSandboxDoc | null | undefined,
): ValhallaSandboxPolicyDoc {
  if (!doc) return DEFAULT_VALHALLA_SANDBOX_POLICY;
  return {
    dummyHealth: doc.dummyHealth,
    dummyRespawnSec: doc.dummyRespawnSec,
    dummyDistance: doc.dummyDistance,
    applyCombatEnv: doc.applyCombatEnv,
    movementLock: doc.movementLock,
    unlockAllSlots: doc.unlockAllSlots,
    infiniteMana: doc.infiniteMana,
  };
}

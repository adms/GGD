/**
 * vfxCleanupPolicy —— 回合邊界要把特效層的共用池子回收到什麼程度 (task #262)。
 *
 * owner 2026-07-30:「#262 殘留特效。**洩漏的粒子/mesh 回收 很重要**」，更早的
 * 描述是「越打越鈍」「一場就很燙」，而且他親眼看過殘留特效。
 *
 * 為什麼要一個 policy 模組而不是在 `VfxSystem.resetForRound()` 裡寫死一個數字：
 * 第一守則。「回合之間要不要把暖好的池子丟掉」是體感取捨 —— 丟掉 = 穩態記憶體
 * 最低，代價是下一回合第一次施法要重新配置；留著 = 第一次施法不卡，代價是那些
 * 網格整場都在。哪一邊比較好只有 owner 在真機上打過才知道，而寫死等於改一格
 * 就要 rebuild client + 重新部署（client 是 build 時烘進映像的，只有 `content/`
 * 是 live bind-mount）。
 *
 * 讀法照抄 `render/modelLod.ts`：**用到的時候才讀** `Configs.tryGet`，所以不需要
 * 在 boot 接任何線，也就沒有「文件到了但已經太晚」的失敗形態②。任何不是
 * `config.vfx-cleanup@1` 的東西（缺檔、schema 不對、寫壞的 override）一律退回
 * `DEFAULT_VFX_CLEANUP` —— 「讀不到」必須是「出貨政策」，不可以是「不回收」，
 * 也不可以是兩者的半套混合。
 */
import { Configs, DEFAULT_VFX_CLEANUP, type ConfigVfxCleanupDoc } from "@ggd/shared/content";

/**
 * 把任意輸入解讀成一份政策。欄位逐格檢查（不是只看 `schema`）：一份被截斷的
 * override 會有正確的 schema 而少一半欄位，那時候 `maxPooledRings` 會是
 * `undefined`，`trimTelegraphPools` 收到 NaN 就會變成「一個都不留」——
 * 靜默地把設定變成它的相反。
 */
export function readVfxCleanupPolicy(doc: unknown): ConfigVfxCleanupDoc {
  const d = doc as ConfigVfxCleanupDoc | null | undefined;
  const ok =
    !!d &&
    typeof d === "object" &&
    d.schema === "config.vfx-cleanup@1" &&
    typeof d.enabled === "boolean" &&
    typeof d.purgeSharedPoolsOnRoundEnd === "boolean" &&
    typeof d.maxPooledRings === "number" &&
    Number.isFinite(d.maxPooledRings) &&
    d.maxPooledRings >= 0;
  return ok ? d : DEFAULT_VFX_CLEANUP;
}

/**
 * 現在生效的政策。`readPolicy` 是測試 / audition 頁的接縫；出貨路徑走
 * `Configs.tryGet("vfx-cleanup")`，也就是後台存檔之後**下一個回合邊界就生效**，
 * 不需要重開一場。
 */
export function vfxCleanupPolicy(
  readPolicy: () => unknown = () => Configs.tryGet("vfx-cleanup"),
): ConfigVfxCleanupDoc {
  return readVfxCleanupPolicy(readPolicy());
}

/**
 * 這一次回合邊界，共用的預告圈 free-list 允許留下幾個網格。
 *
 *   · `enabled === false`                 → `Infinity`（完全不修剪 = #259 的行為，止血閥）
 *   · `purgeSharedPoolsOnRoundEnd`        → 0（全部還回去）
 *   · 其他                                 → `maxPooledRings`
 */
export function ringCapForRoundBoundary(policy: ConfigVfxCleanupDoc): number {
  if (!policy.enabled) return Infinity;
  return policy.purgeSharedPoolsOnRoundEnd ? 0 : policy.maxPooledRings;
}

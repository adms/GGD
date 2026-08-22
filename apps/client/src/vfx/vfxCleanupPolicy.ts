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
import {
  Configs,
  DEFAULT_VFX_CLEANUP,
  VFX_FADE_OUT_MAX_SEC_BOUNDS,
  type ConfigVfxCleanupDoc,
} from "@ggd/shared/content";

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

// ---------------------------------------------------------------------------
// GH#270 —— 一次性粒子發射器的預算
// ---------------------------------------------------------------------------

/**
 * 三格新欄位都是 `.optional()`（線上已經有耐久覆蓋層，一份存於新欄位之前的
 * override 少了必填欄會讓整份 config 被 Zod 退回 → 內容載入失敗 → 退回骨架，
 * 見 schema 的註解）。所以讀的時候要**逐格**降級，不能整份二選一：一份只存過
 * `deathFx*` 的舊 override 仍然要拿得到這三格的出貨值。
 *
 * ⚠️ 每一格都自己夾回 schema 的上下界。`Configs.tryGet` 走的是**寬鬆**路徑
 * （`readVfxCleanupPolicy` 只檢查 #262 那幾格），所以一個界外的數字有可能走到
 * 這裡；夾在這裡而不是在消費端，是因為消費端有三個。
 */
const ONE_SHOT_EMITTER_BOUNDS = { min: 16, max: 1024 } as const;
const SWEEP_SEC_BOUNDS = { min: 0.5, max: 60 } as const;

/** 同時允許閒置的一次性發射器上限（`enabled=false` ⇒ 不設限，止血閥）。 */
export function oneShotEmitterCap(policy: ConfigVfxCleanupDoc): number {
  if (!policy.enabled) return Infinity;
  const v = policy.maxOneShotEmitters;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return DEFAULT_VFX_CLEANUP.maxOneShotEmitters ?? 96;
  }
  return Math.min(ONE_SHOT_EMITTER_BOUNDS.max, Math.max(ONE_SHOT_EMITTER_BOUNDS.min, Math.floor(v)));
}

/** 掃描間隔（毫秒）。`enabled=false` ⇒ `Infinity`（永遠不掃）。 */
export function emitterSweepMs(policy: ConfigVfxCleanupDoc): number {
  if (!policy.enabled) return Infinity;
  const v = policy.emitterSweepSec;
  const sec =
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(SWEEP_SEC_BOUNDS.max, Math.max(SWEEP_SEC_BOUNDS.min, v))
      : (DEFAULT_VFX_CLEANUP.emitterSweepSec ?? 2);
  return sec * 1000;
}

/** 回合結束要不要把打擊感共用池整個丟掉。`enabled=false` ⇒ false。 */
export function purgeImpactPoolOnRoundEnd(policy: ConfigVfxCleanupDoc): boolean {
  if (!policy.enabled) return false;
  return policy.purgeImpactPoolOnRoundEnd ?? DEFAULT_VFX_CLEANUP.purgeImpactPoolOnRoundEnd ?? true;
}

/**
 * 下一回合**開打的那一幀**要不要停掉上一回合還在飛的勝利煙火並重新武裝勝利偵測
 * （owner 2026-08-17「場地莫名其妙的特效又回來了」）。
 *
 * `enabled=false` ⇒ false，和上面三格同一個止血閥語意：整份政策關掉 = 回到
 * 這些回收動作全都不做的行為。缺這一格（舊的耐久 override）⇒ 出貨值。
 *
 * ⚠️ 這一格只在 **`"enter"`** 那一側被讀。`"leave"` 也停煙火的話，回合勝利煙火
 * 會在它發射的同一幀被清掉 —— 見 `render/roundVfxLifecycle` 的 `RoundEdge`。
 */
export function purgeVictoryFxOnCombatStart(policy: ConfigVfxCleanupDoc): boolean {
  if (!policy.enabled) return false;
  return (
    policy.purgeVictoryFxOnCombatStart ?? DEFAULT_VFX_CLEANUP.purgeVictoryFxOnCombatStart ?? true
  );
}

// ---------------------------------------------------------------------------
// ⏱ GH#569 —— 尾段 fade out 的常設上限 + 施法餘燼的生成窗口
// ---------------------------------------------------------------------------

/**
 * 現在生效的「尾段 fade out 最多幾秒」（owner 2026-08-23 的常設規定，出貨 0.5）。
 *
 * ⚠️ 這一格**不吃 `enabled`**。上面那幾格管的是「回合邊界要不要回收池子」，
 * 關掉它們是止血閥；而這一條是 owner 對**畫面**下的規定 —— 把它綁在回收總開關
 * 上，等於「有人為了查一個池子問題關掉 enabled」就順手把他的規定也關掉了，
 * 而畫面上沒有任何東西會說出來。要回頭就把這一格調到上界（3 秒）。
 *
 * 界外的數字（寬鬆路徑 `Configs.tryGet` 收得下）在這裡夾回上下界，⛔ 不是在
 * 消費端 —— 消費端有兩個（`toParticleSystem` 與 `W3xEmitterRig`），夾在兩邊
 * 就會有兩份會各自腐爛的規則。
 */
export function vfxFadeOutMaxSec(policy: ConfigVfxCleanupDoc = vfxCleanupPolicy()): number {
  const v = policy.vfxFadeOutMaxSec;
  const fallback = DEFAULT_VFX_CLEANUP.vfxFadeOutMaxSec ?? 0.5;
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(VFX_FADE_OUT_MAX_SEC_BOUNDS.max, Math.max(VFX_FADE_OUT_MAX_SEC_BOUNDS.min, v));
}

/**
 * 施法光柱的上升餘燼在施法窗口的**前幾成**生成（0–1，出貨 0.5 = owner 的「減半」）。
 *
 * 同上，⛔ 不吃 `enabled`：1 才是「回到 GH#569 之前」的那條路。
 */
export function castMoteEmitShare(policy: ConfigVfxCleanupDoc = vfxCleanupPolicy()): number {
  const v = policy.castMoteEmitShare;
  const fallback = DEFAULT_VFX_CLEANUP.castMoteEmitShare ?? 0.5;
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

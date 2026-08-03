/**
 * deathFxBurn ——「角色死亡後留在場上的那團火，要燒多久」(GH#267)。
 *
 * ── owner 的回報 ────────────────────────────────────────────────────────────
 * 「我找到場地天空火的兇手了，是角色死亡後的特效，持續太久了變得很干擾」
 *
 * 兇手是**復活圈的火**（`ReviveCircleView`）。它由 `death` 事件掉在屍體上
 * （`ReviveSystem.spawnCirclesForDeaths`），而 #196 把它的**存續時間整個拿掉了**
 * —— 圈圈只在「被復活 / 隊伍全滅 / 戰鬥結束 / 完成」時才消失，否則就一路燒到
 * 回合結束。它燒的東西正好是 owner 描述的那個：
 *
 *   · 一根 2.3u 高的**火柱**（additive，FLAME_RGB 暖橘）
 *   · 20 根繞著圈的**火舌**
 *   · 一台**持續**噴的餘燼粒子系統（26/s、向上重力、additive）
 *
 * 也就是說：每死一位英雄，場上就多一團**永遠不會滅**、往天上飄的橘色火。
 * 三分鐘的回合裡這是幾百秒的畫面污染，而不是一次 0.6 秒的擊殺特效
 * （擊殺爆點走 `VfxSystem` 的 `oneShotMaxLifeSec`，出貨 0.6 秒，那一條是好的）。
 *
 * ⚠️ 這**不是** #220。#220 是「屍體躺 3 秒後半透明升天」——**角色本體**的淡出。
 * 這裡動的是屍體旁邊那團**特效**，兩個計時器完全無關，這個檔一行都不碰 #220。
 *
 * ── 為什麼是一個政策模組，而不是把 6 秒寫在 view 裡 ──────────────────────────
 * 第一守則。「特效要燒多久」正是 owner 會反覆推翻的那種數字，而 client 是
 * **build 時**烘進映像的 —— 寫死一個 6，他想改成 3 或 12 就得 rebuild + 重新
 * 部署；做成後台欄位，存檔就生效。而且「要不要收斂」本身是一個**決策點**
 * （收斂 = 畫面乾淨，代價是圈圈比較不搶眼；不收斂 = 今天的行為），所以
 * `calmScale = 1` 一格就是完整的止血閥，等於一鍵回到 #196 的樣子。
 *
 * ── 收斂只碰「火」，不碰「地上那圈」──────────────────────────────────────────
 * 圈圈本體（`ringMat`）是玩家用來走位、判斷「這裡還救得回來」的錨點，暗掉會
 * 讓機制不可讀。所以收斂只降**火柱 / 火舌 / 餘燼**——也就是往天上跑的那部分，
 * 正好就是 owner 抱怨的東西。地上的環一格都不動。
 *
 * ── 讀法 ──────────────────────────────────────────────────────────────────
 * 照抄 `vfx/vfxCleanupPolicy.ts`：**用到的時候才讀** `Configs.tryGet`，所以不必
 * 在 boot 接任何線，也沒有「文件到了但已經太晚」的失敗形態②。任何讀不到 /
 * 型別不對 / 界外的值，一律**逐格**退回出貨預設 —— 一份被截斷的 override 會有
 * 正確的 schema 而少一半欄位，整份丟掉會連好的那幾格一起丟。
 *
 * ⚠️ 欄位還沒進 `config.vfx-cleanup@1` 的 Zod（第二階段的專線統一收）。在那之前
 * 這裡讀到的永遠是 `undefined` → 出貨預設，行為與升級前**完全一致**；欄位一落地
 * 就自動生效，不需要再改這個檔。
 */
import { Configs } from "@ggd/shared/content";

/** 出貨值：火全亮幾秒。之後收斂成 `calmScale`。 */
export const DEFAULT_DEATH_FX_BURN_SEC = 6;
/** 出貨值：收斂後火剩下的亮度比例。1 = 永遠不收斂（#196 的行為）。 */
export const DEFAULT_DEATH_FX_CALM_SCALE = 0.25;
/** 出貨值：有人真的在復活（或被卡住）時，火重新燒旺。 */
export const DEFAULT_DEATH_FX_RELIGHT_ON_CHANNEL = true;

/**
 * 收斂的過渡長度（秒）。這**不是**決策點，是一個純美術的緩衝：直接階梯式跳下去
 * 會在畫面上「啪」一聲，比火本身還顯眼。owner 要調的是「燒多久」與「剩多亮」，
 * 不是「過渡幾秒」。
 */
const CALM_FADE_SEC = 1.5;

export interface DeathFxBurnPolicy {
  /** 全亮秒數（0 = 立刻收斂）。 */
  burnSec: number;
  /** 收斂後的亮度比例 0..1（1 = 不收斂）。 */
  calmScale: number;
  /** 有人在復活/爭奪時是否燒回全亮。 */
  relightOnChannel: boolean;
}

export const DEFAULT_DEATH_FX_BURN: DeathFxBurnPolicy = {
  burnSec: DEFAULT_DEATH_FX_BURN_SEC,
  calmScale: DEFAULT_DEATH_FX_CALM_SCALE,
  relightOnChannel: DEFAULT_DEATH_FX_RELIGHT_ON_CHANNEL,
};

/** 有限、在界內才採用；否則退回那一格的出貨值。 */
function num(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
}

/**
 * 把任意輸入解讀成一份政策。**逐格**檢查，不是只看 `schema`。
 */
export function readDeathFxBurnPolicy(doc: unknown): DeathFxBurnPolicy {
  const d = (doc ?? {}) as Record<string, unknown>;
  const relight = d.deathFxRelightOnChannel;
  return {
    burnSec: num(d.deathFxBurnSec, DEFAULT_DEATH_FX_BURN_SEC, 0, 600),
    calmScale: num(d.deathFxCalmScale, DEFAULT_DEATH_FX_CALM_SCALE, 0, 1),
    relightOnChannel:
      typeof relight === "boolean" ? relight : DEFAULT_DEATH_FX_RELIGHT_ON_CHANNEL,
  };
}

/**
 * 現在生效的政策。`read` 是測試 / audition 頁的接縫；出貨路徑走
 * `Configs.tryGet("vfx-cleanup")`，也就是後台存檔 → 下一次內容載入就生效。
 */
export function deathFxBurnPolicy(
  read: () => unknown = () => Configs.tryGet("vfx-cleanup"),
): DeathFxBurnPolicy {
  return readDeathFxBurnPolicy(read());
}

/** 這一幀的火要不要燒旺（有人在復活 / 有敵人卡著）。 */
export interface DeathFxDrive {
  channelling: boolean;
  contested: boolean;
}

/**
 * 這一團死亡火在 `ageMs`（圈圈出現到現在）該有的強度 0..1。
 *
 * 1 = 今天的樣子；`calmScale` = 收斂後的低調狀態。乘在**火柱 / 火舌 / 餘燼**上，
 * 不乘在地上那圈。
 */
export function deathFxIntensity(
  ageMs: number,
  policy: DeathFxBurnPolicy = DEFAULT_DEATH_FX_BURN,
  drive: DeathFxDrive = { channelling: false, contested: false },
): number {
  if (policy.relightOnChannel && (drive.channelling || drive.contested)) return 1;
  const age = Number.isFinite(ageMs) && ageMs > 0 ? ageMs / 1000 : 0;
  const past = age - policy.burnSec;
  if (past <= 0) return 1;
  const k = Math.min(1, past / CALM_FADE_SEC);
  return 1 + (policy.calmScale - 1) * k;
}

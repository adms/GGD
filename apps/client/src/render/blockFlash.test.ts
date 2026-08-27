/**
 * ⭐⭐ GH#741（舊 #43）—— **擋下的一擊不閃「受傷紅」。**
 *
 * 這條是這一批的**承重線**（突變就挑它）：`ImpactProfile.isBlock` 一直騎在同一份
 * payload 上（宣告／解析／塞進 plan 三處俱全），而 `resolveVictimFlash()` 從來沒有
 * 讀過它 ⇒ ⭐ 接觸點放的是 `sparkKind:"block"` 的**冷白**火花，身體卻同時閃**物理紅**
 * —— 兩個通道對**同一次命中**說相反的話。
 *
 * ── 這個檔**拒絕**斷言什麼 ──────────────────────────────────────────────────
 * ⛔ 沒有一條斷言寫死顏色值／毫秒／alpha（第零守則：驗機制不驗數字 —— 出貨值已經
 * 有三個住處，測試裡再抄一份就是第四個，而它會用**錯誤的訊息**紅）。
 * 每一條都是**兩個東西的關係**：擋下的 ≠ 學派色 · 擋下的色清得過可見度地板 ·
 * 沒擋下的**逐位元**沒變 · rollback 那一格**逐位元**回到舊行為。
 *
 * ── 突變（2026-08-27，做過）─────────────────────────────────────────────────
 * `combatFeedback.resolveVictimFlash` 的 `if (profile.isBlock && …)` 整段刪掉
 * ⇒ 「擋下的一擊 ⛔ 不可以閃學派的受傷色」對三個學派各紅一次，訊息指名
 * `physical/magic/true`。改回來即綠。
 */
import { describe, expect, it, afterEach } from "vitest";
import {
  BLOCK_FLASH_RGB,
  FLASH_MIN_SPREAD,
  SHIPPED_BLOCK_FLASH_MODE,
  blockFlashMode,
  flashColorFor,
  resolveVictimFlash,
  setBlockFlashMode,
  type ImpactProfile,
} from "./combatFeedback";

/** 一份最小的 profile —— 只有 `isBlock` 這一軸在動。 */
function profile(isBlock: boolean, extra: Partial<ImpactProfile> = {}): ImpactProfile {
  return {
    tier: "medium",
    hitstopTicks: 3,
    hitstunTicks: 3,
    knockbackDir: { x: 1, z: 0 },
    knockbackMag: 0,
    isEX: false,
    isBlock,
    shakeMag: 0.6,
    shakeStyle: "directional",
    sparkKind: isBlock ? "block" : "hit",
    camKick: 0.3,
    exFreeze: 0,
    ...extra,
  };
}

const SCHOOLS = ["physical", "magic", "true"] as const;
const same = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

afterEach(() => setBlockFlashMode(undefined)); // 每一條都從出貨值開始

describe("GH#741 格擋的身體閃光", () => {
  it("⭐ 擋下的一擊 ⛔ 不可以閃學派的受傷色（三個學派各一次）", () => {
    const wrong = SCHOOLS.filter((s) =>
      same(resolveVictimFlash(profile(true), s).rgb, flashColorFor(s)),
    );
    expect(wrong, "這幾個學派的格擋仍然閃受傷色 —— 粒子說擋下了、模型說被打中").toEqual([]);
  });

  it("⭐ 這把尺**不是**「一律回不同」：**沒擋下**的一擊仍然逐位元是學派色", () => {
    const wrong = SCHOOLS.filter(
      (s) => !same(resolveVictimFlash(profile(false), s).rgb, flashColorFor(s)),
    );
    expect(wrong, "未被格擋的命中被動到了 —— 這一次改動不該碰它").toEqual([]);
  });

  it("⭐ 格擋**覆蓋**技能自己寫的元素色（「被擋下」是系統狀態，比「這是火」重要）", () => {
    const authored: [number, number, number] = [1, 0.55, 0.1]; // 火橘
    const blocked = resolveVictimFlash(profile(true, { flashColor: authored }), "physical");
    const landed = resolveVictimFlash(profile(false, { flashColor: authored }), "physical");
    expect(same(blocked.rgb, BLOCK_FLASH_RGB)).toBe(true);
    // 而同一支技能**沒被擋下**時，作者的色照樣贏 —— ⛔ 這一格不是被拿掉了
    expect(same(landed.rgb, BLOCK_FLASH_RGB)).toBe(false);
  });

  it("⛔ 格擋色不可以掉進 ALPHA_COMBINE 的隱形陷阱（清得過可見度地板）", () => {
    // 這個檔頭量過：白／灰在 `out = base·(1−a) + flash·a` 下只推得動 ΔL 0.03–0.09
    // ⇒ 在最需要它的淡色模型上等於沒閃。地板本身是 combatFeedback 的常數，
    // ⛔ 這裡不抄一個數字。
    const spread = Math.max(...BLOCK_FLASH_RGB) - Math.min(...BLOCK_FLASH_RGB);
    expect(spread).toBeGreaterThanOrEqual(FLASH_MIN_SPREAD);
    // 而且它與三個學派色都不是同一個答案
    for (const s of SCHOOLS) expect(same(BLOCK_FLASH_RGB, flashColorFor(s))).toBe(false);
  });

  it('⭐ 一鍵 rollback：`"damage"` 逐位元回到 2026-08-27 之前', () => {
    setBlockFlashMode("damage");
    for (const s of SCHOOLS) {
      const blocked = resolveVictimFlash(profile(true), s);
      const landed = resolveVictimFlash(profile(false), s);
      expect(same(blocked.rgb, landed.rgb)).toBe(true);
      expect(blocked.alpha).toBe(landed.alpha);
      expect(blocked.ms).toBe(landed.ms);
    }
  });

  it('⭐ `"none"` 是「⛔ 不要呼叫 flash」，⛔ 不是「閃一個 0 長度」', () => {
    setBlockFlashMode("none");
    const spec = resolveVictimFlash(profile(true), "physical");
    // `ChampionView.flash` 無條件寫 flashRgb/flashAlpha ⇒ 消費端要靠 `ms > 0` 擋，
    // 所以這一格必須真的是 0（見 EntityViewRegistry 的那個 if）。
    expect(spec.ms).toBe(0);
    expect(spec.alpha).toBe(0);
  });

  it("⭐ 認不得的設定值 = 出貨預設，⛔ 不是「關掉」", () => {
    setBlockFlashMode("鋼灰色");
    expect(blockFlashMode()).toBe(SHIPPED_BLOCK_FLASH_MODE);
  });
});

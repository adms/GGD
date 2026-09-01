/**
 * ⭐⭐ P1-2 —— **實際生效**的 VFX 限制，⛔ 不是 schema 的上界。
 *
 * ── ⛔ 為什麼「回 schema 上界」是錯的 ─────────────────────────────────────
 * schema 的 `.max()` 是**誤打守衛**（50 打成 500 那一類）。一份把它當成 effective
 * limit 的 profile 會讓編輯器以為「我可以噴 20,000 顆」——⭐ 而遊戲夾在 1,200。
 *
 * ── ⭐ 兩格 ribbon 在此之前是**客戶端常數** ────────────────────────────────
 * `MAX_ACTIVE_RIBBONS = 10` · `RIBBON_MAX_LIFESPAN_SEC = 0.2` ——
 * ⛔ 外部編輯器看不到它們：它做得出一份會同時開 30 條刀光的內容，
 * 而遊戲會**靜默偷走** 20 條。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `effectiveVfxLimits` 改成回 schema 上界（20000/5000）→ 🔴（②）
 *   · `RibbonTrail` 的 `maxActiveRibbons()` 改回常數 10 → 🔴（④：後台調了而遊戲不動）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { effectiveVfxLimits } from "./effectiveVfxLimits";
import {
  MAX_MAX_PARTICLES_PER_SYSTEM,
  MAX_MAX_RATE_PER_SYSTEM,
} from "../schema/vfx";

const ROOT = resolve(__dirname, "../../../../..");
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const BUDGET = read("content/config/vfx-budget.json") as Record<string, unknown>;
const CLEANUP = read("content/config/vfx-cleanup.json") as Record<string, unknown>;

describe("P1-2 實際生效的 VFX 限制", () => {
  it("★ ⭐ 出貨設定 → 出貨數字（七格都有，⛔ 沒有 null）", () => {
    const l = effectiveVfxLimits(BUDGET as never, CLEANUP as never);
    for (const [k, v] of Object.entries(l)) {
      expect(v, `⛔ \`${k}\` 是 ${String(v)} —— 一格拿不到的限制等於沒有限制`).not.toBeNull();
      expect(v, `⛔ \`${k}\` 是 undefined`).toBeDefined();
    }
    // ⭐ 逐格等於出貨設定（⛔ 這裡**從設定檔讀**，不抄字面值 —— 抄一份就是第四個住處）。
    expect(l.maxParticlesPerSystem).toBe(BUDGET["maxParticlesPerSystem"]);
    expect(l.maxRatePerSystem).toBe(BUDGET["maxRatePerSystem"]);
    expect(l.maxActiveRibbons).toBe(CLEANUP["maxActiveRibbons"]);
    expect(l.ribbonFadeBudgetSec).toBe(CLEANUP["ribbonFadeBudgetSec"]);
    expect(l.hardMaxLifeSec).toBe(CLEANUP["vfxHardMaxLifeSec"]);
    expect(l.hardCapScope).toBe(CLEANUP["vfxHardCapScope"]);
    expect(l.maxOneShotEmitters).toBe(CLEANUP["maxOneShotEmitters"]);
    expect(l.roundPurgeMode).toBe(CLEANUP["roundPurgeMode"]);
  });

  it("★★ ⭐ ⛔ **不是** schema 上界 —— 出貨值遠低於它", () => {
    const l = effectiveVfxLimits(BUDGET as never, CLEANUP as never);
    expect(
      l.maxParticlesPerSystem,
      `⛔⛔ 回的是 schema 上界（${MAX_MAX_PARTICLES_PER_SYSTEM}）⇒ 編輯器會以為它可以噴那麼多，\n` +
        `   而遊戲夾在 ${String(BUDGET["maxParticlesPerSystem"])}。`,
    ).toBeLessThan(MAX_MAX_PARTICLES_PER_SYSTEM);
    expect(l.maxRatePerSystem).toBeLessThan(MAX_MAX_RATE_PER_SYSTEM);
  });

  it("⭐ 缺席 ⇒ 出貨預設（⛔ **不是 0** —— vfx-budget 的 note 逐字這麼寫）", () => {
    const l = effectiveVfxLimits(null, null);
    expect(l.maxParticlesPerSystem).toBeGreaterThan(0);
    expect(l.maxRatePerSystem).toBeGreaterThan(0);
    expect(l.maxActiveRibbons).toBeGreaterThan(0);
    expect(l.hardMaxLifeSec).toBeGreaterThan(0);
    // 界外的值夾回範圍內（⛔ 不是丟掉整份）
    expect(effectiveVfxLimits({ maxParticlesPerSystem: 999_999 } as never, null).maxParticlesPerSystem)
      .toBe(MAX_MAX_PARTICLES_PER_SYSTEM);
    expect(effectiveVfxLimits(null, { maxActiveRibbons: 0 } as never).maxActiveRibbons).toBe(1);
  });

  it("⭐ ④ profile 裡的那一份**就是**這一支算出來的（⛔ 不是另一份抄寫）", () => {
    const profile = read("content/editor-target-profile.json") as {
      effectiveVfxLimits?: Record<string, unknown>;
    };
    expect(
      profile.effectiveVfxLimits,
      "⛔ profile 沒有 `effectiveVfxLimits` ⇒ 編輯器仍然只看得到 schema 上界",
    ).toBeDefined();
    expect(profile.effectiveVfxLimits).toEqual(effectiveVfxLimits(BUDGET as never, CLEANUP as never));
  });
});

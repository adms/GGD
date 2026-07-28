/**
 * 基礎加成 的三層區間守衛 —— 第 1 層(sim)與第 2 層(Zod schema) (task #277).
 *
 * ⚠️ 這個缺陷的形狀:`zConfigBaseBonusDoc` 只寫 `z.number().finite()`,
 * `normalizeBaseBonus` 只丟掉非有限數,後台頁面只檢查 `Number.isFinite`。
 * 也就是說 `maxHealth: -9999` 是一份三層都認可的合法文件,而它會讓 115 位
 * 英雄的最終生命上限變成負數 —— 全場開局即死,而且畫面上沒有任何一個字。
 *
 * 語意相反的鄰居 combat-env 三層都有 per-key 區間 (`combatenv.Bounds` /
 * `zEnvFactor` / `minFactorFor`),這裡照著補。下面每一條都對著**同一個具體
 * 情境**斷言,而不是「有沒有呼叫某個函式」。
 *
 * 第 3 層(頁面)在 apps/admin/src/baseBonusPage.test.ts —— 那一支**驅動真的
 * 頁面**,因為上一輪就是只測了純函式而漏掉頁面(失敗形狀 ⑤)。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import {
  BASE_BONUS_MAX,
  BASE_BONUS_MIN,
  baseBonusBounds,
  baseBonusFinalClamp,
  baseBonusFor,
  finalizeStat,
  normalizeBaseBonus,
} from "./baseBonus";
import { ALL_STATS, STAT_CLAMPS, Stat } from "./stats/statTypes";
import { DEFAULT_COMBAT_ENV } from "./combatEnv";
import { zConfigBaseBonusDoc } from "../content/schema/config";

const docWith = (bonus: Record<string, number>): unknown => ({
  id: "base-bonus",
  schema: "config.base-bonus@1",
  bonus,
});

describe("基礎加成 區間 — sim 層 (basebonus-bounds-sim)", () => {
  it("負數被夾成 0 —— 一份 -9999 的文件不會讓所有英雄開場即死", () => {
    cover("basebonus-bounds-sim");
    const t = normalizeBaseBonus({ maxHealth: -9999 });
    expect(baseBonusFor(t, Stat.MaxHealth)).toBe(0);
    // 而且真的走一次 finalizeStat:2000 點血的英雄還是 2000,不是 -7999
    expect(finalizeStat(2000, Stat.MaxHealth, { env: DEFAULT_COMBAT_ENV, baseBonus: t })).toBe(2000);
  });

  it("超過上限的值被夾到上限,不是照收", () => {
    cover("basebonus-bounds-sim");
    const t = normalizeBaseBonus({ maxHealth: 999999 });
    expect(baseBonusFor(t, Stat.MaxHealth)).toBe(BASE_BONUS_MAX[Stat.MaxHealth]);
  });

  it("區間內的值原封不動 —— 守衛不可以順手改掉合法設定", () => {
    cover("basebonus-bounds-sim");
    const t = normalizeBaseBonus({ maxHealth: 300, ad: 12.5 });
    expect(baseBonusFor(t, Stat.MaxHealth)).toBe(300);
    expect(baseBonusFor(t, Stat.AttackDamage)).toBe(12.5);
  });

  it("每個 stat 都有區間,而且下限一律是 0(這是贈禮,不是懲罰)", () => {
    cover("basebonus-bounds-sim");
    for (const s of ALL_STATS) {
      const [lo, hi] = baseBonusBounds(s);
      expect(lo, `${s} 的下限`).toBe(BASE_BONUS_MIN);
      expect(hi, `${s} 的上限必須是正的有限數`).toBeGreaterThan(0);
      expect(Number.isFinite(hi)).toBe(true);
    }
  });

  it("有 clamp 的六個 stat,上限 = 自己的區間跨度(推導,不是拍腦袋)", () => {
    cover("basebonus-bounds-sim");
    const clamped = ALL_STATS.filter((s) => STAT_CLAMPS[s] !== undefined);
    expect(clamped.length, "STAT_CLAMPS 的成員數變了,這條推導要重新檢查").toBe(6);
    for (const s of clamped) {
      const [lo, hi] = STAT_CLAMPS[s]!;
      expect(BASE_BONUS_MAX[s], `${s} 的加成上限應等於 ${hi} - ${lo}`).toBeCloseTo(hi - lo, 10);
      expect(baseBonusFinalClamp(s)).toEqual([lo, hi]);
    }
  });

  it("沒有 clamp 的 stat 回報 finalClamp = null(後台才知道要不要警告)", () => {
    cover("basebonus-bounds-sim");
    expect(baseBonusFinalClamp(Stat.MaxHealth)).toBeNull();
    expect(baseBonusFinalClamp(Stat.AttackSpeed)).not.toBeNull();
  });
});

describe("基礎加成 區間 — schema 層 (basebonus-bounds-schema)", () => {
  it("負的生命加成被 schema 擋下 —— 這份文件根本不該存在", () => {
    cover("basebonus-bounds-schema");
    const r = zConfigBaseBonusDoc.safeParse(docWith({ maxHealth: -9999 }));
    expect(r.success, "schema 收下了一份會讓全英雄開場即死的文件").toBe(false);
  });

  it("超過上限也被擋下", () => {
    cover("basebonus-bounds-schema");
    expect(zConfigBaseBonusDoc.safeParse(docWith({ maxHealth: 999999 })).success).toBe(false);
    // 攻速的上限是區間跨度 3.8,4 超過
    expect(zConfigBaseBonusDoc.safeParse(docWith({ as: 4 })).success).toBe(false);
  });

  it("出貨文件(maxHealth 300)仍然通過 —— 守衛不可以把現有內容鎖死", () => {
    cover("basebonus-bounds-schema");
    expect(zConfigBaseBonusDoc.safeParse(docWith({ maxHealth: 300 })).success).toBe(true);
    expect(zConfigBaseBonusDoc.safeParse(docWith({})).success).toBe(true);
  });

  it("未知的鍵仍然被接受(只要是有限數字)—— 打錯字不該讓整棵內容樹載不起來", () => {
    cover("basebonus-bounds-schema");
    expect(zConfigBaseBonusDoc.safeParse(docWith({ maxHelth: 300 })).success).toBe(true);
    // 但它在 normalize 時就被丟掉,不會偷偷生效
    expect(normalizeBaseBonus({ maxHelth: 300 })).toEqual({});
  });
});

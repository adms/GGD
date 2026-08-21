/**
 * ⚠️ 豁免警告的**承重那一條**：讀不到那份文件時，畫面必須說「尚未產生」，
 * ⛔ 不可以畫一張空表。
 *
 * 空表的意思是「零個豁免節點」，而那是這一頁存在的理由的**反面** ——
 * 它會讓 owner 以為改「傷害五級距」那一頁就管得到全部傷害。
 *
 * 突變（2026-08-22）：`exemptionView` 的 `input.present &&` 拿掉
 * ⇒「present=false 但手上有一份舊快取」變成 generated=true ⇒ 這一條紅。
 */
import { describe, it, expect } from "vitest";
import {
  exemptionRowsFrom,
  exemptionView,
  warningBanner,
  NOT_GENERATED_NOTICE,
} from "./damageTierWarnings";

/** 四類各一列 + 一列文件沒宣告分類、kind 也對不上（＝可能漏掉的第 ④ 類）。 */
const DOC = {
  schema: "config.damage-tier-exemptions@1",
  exemptions: [
    { ability: "godie-h01u.q", path: "effects[0].amount", kind: "shield", why: "護盾不是傷害", flat: 300 },
    { ability: "godie-h02u.w", path: "effects[1].amount", kind: "damageArea", why: "判定用的 1 點", flat: 1, group: "probe" },
    { ability: "godie-h03u.e", path: "effects[0].amount", kind: "dot", why: "每一跳", flat: 40 },
    { ability: "godie-e00l.w", path: "effects[0].amount", kind: "damage", why: "法球，只吃普攻", flat: 10, group: "per-hit" },
    { ability: "godie-h09u.r", path: "effects[2].amount", kind: "damageLine", why: "", flat: 800 },
  ],
};

describe("不吃五級距的傷害節點 (adminui-damage-tier-warnings)", () => {
  it("讀不到那份文件 ⇒ 說「尚未產生」，⛔ 不是一張「零個豁免節點」的空表", () => {
    // 手上就是有一份看起來合法的內容，但平台說 present=false（檔案不在出貨樹上）。
    const v = exemptionView({ doc: DOC, present: false, source: "shipped" });
    expect(v.generated).toBe(false);
    expect(v.rows).toEqual([]);
    expect(v.groups).toEqual([]);
    expect(v.source).toBe("none");
    // 那段文案不可以說「沒有豁免節點」—— 它要說的是「這一頁現在數不出來」。
    expect(NOT_GENERATED_NOTICE).toContain("不代表沒有豁免節點");
  });

  it("讀得到 ⇒ 分組、數量現算，而未宣告分類的那一列落在「未分類」⛔ 不猜", () => {
    const v = exemptionView({ doc: DOC, present: true, source: "shipped" });
    expect(v.generated).toBe(true);
    expect(v.rows.length).toBe(DOC.exemptions.length);

    // 分類：宣告的優先，沒宣告就用 kind 對照，對不上一律 other。
    const byKey = Object.fromEntries(v.groups.map((g) => [g.key, g.rows.length]));
    expect(byKey).toEqual({ "not-damage": 1, probe: 1, "per-tick": 1, "per-hit": 1, other: 1 });
    // ⛔ `damageLine` 沒有對照，所以它是「未分類」而不是被猜成某一類。
    expect(v.rows.find((r) => r.kind === "damageLine")!.group).toBe("other");
    // 順序固定：①②③⑤ 然後未分類。
    expect(v.groups.map((g) => g.key)).toEqual([
      "not-damage",
      "probe",
      "per-tick",
      "per-hit",
      "other",
    ]);

    // 警告裡的數字是**現算**的，⛔ 不是文案裡手打的（第〇·四守則）。
    const kinds = new Set(v.rows.map((r) => r.kind)).size;
    expect(v.banner).toContain(`**${v.rows.length}**`);
    expect(v.banner).toContain(`${kinds} 種`);
    expect(warningBanner(v.rows.slice(0, 2))).toContain("**2**");
  });

  it("形狀變了也還看得見：陣列換個鍵名 / 缺欄位都不會變成空表", () => {
    expect(exemptionRowsFrom({ nodes: DOC.exemptions }).length).toBe(DOC.exemptions.length);
    expect(exemptionRowsFrom(DOC.exemptions).length).toBe(DOC.exemptions.length);
    // 讀不到值的那幾格是 null / 空字串，⛔ 不是 0（0 會被當成「這一格真的是 0」）。
    expect(exemptionRowsFrom({ exemptions: [{ kind: "heal" }] })[0]).toMatchObject({
      flat: null,
      why: "",
      group: "not-damage",
    });
    expect(exemptionRowsFrom({ totallyDifferent: 1 })).toEqual([]);
  });
});

/**
 * 🧩 技能積木的承重守衛（GH#992 Scope 2，體驗層：一條薄守衛，接線類突變一次）。
 *
 * ① **積木來源只有一份**：清冊 `ggd-bricks.json` 的 effect 積木 ＝ 出貨 `zEffectDefUnion`
 *    的 kind，**兩個方向**（清冊多一顆 ⇒ 後台會讓人加一顆引擎不認得的；union 多一顆 ⇒
 *    後台少一顆可以加的，而畫面上看不出來）。
 * ② **表單從 Zod 推導**：拿掉一個 Zod 欄位 ⇒ 表單少一格（票文的驗收條件，在積木上再驗一次）。
 * ③ **新積木過得了它自己的 schema**：`newEffect()` 的起始值不可以是一張看起來填好、
 *    存的時候才 422 的卡（walk.ts 檔頭講的那個坑）。
 *
 * MUTATION（2026-09-06 驗過）：`formFromSchema()` 的 `case "object": for (const f of node.fields) visit(f)`
 * 改成不遞迴 ⇒ ② 紅（`amount.flat` 不見了）。
 */
import { describe, it, expect } from "vitest";
import {
  EFFECT_BRICKS,
  brickForm,
  brickSchema,
  editorQaUrl,
  formFromSchema,
  moveEffect,
  newEffect,
  parseRowInput,
  setAt,
  shippedEffectKinds,
} from "./abilityNodes";

describe("技能積木", () => {
  it("⭐ 清冊上的 effect 積木 ＝ 出貨 union 的 kind，兩個方向", () => {
    const listed = new Set(EFFECT_BRICKS.map((b) => b.id));
    const shipped = new Set(shippedEffectKinds());
    expect(shipped.size).toBeGreaterThan(30);
    expect([...listed].filter((k) => !shipped.has(k)), "清冊有、引擎沒有（先跑 pnpm bricks:build）").toEqual([]);
    expect([...shipped].filter((k) => !listed.has(k)), "引擎有、清冊沒有（先跑 pnpm bricks:build）").toEqual([]);
  });

  it("⭐ 表單從 Zod 推導：damage 有 damageType 下拉；拿掉一個欄位 ⇒ 少一格", () => {
    const rows = brickForm("damage");
    const dt = rows.find((r) => r.path === "damageType");
    expect(dt?.kind).toBe("enum");
    expect(dt?.options).toContain("physical");
    // 巢狀物件也走得進去（amount.flat 是 zScaling 的葉）—— 突變靶。
    expect(rows.some((r) => r.path.startsWith("amount."))).toBe(true);
    // 拿掉一格 ⇒ 正好少一格，而且少的就是那一格。
    const omitted = (brickSchema("damage") as { omit: (m: Record<string, true>) => unknown }).omit({ damageType: true });
    const fewer = formFromSchema(omitted, "damage");
    expect(fewer.length).toBe(rows.length - 1);
    expect(fewer.some((r) => r.path === "damageType")).toBe(false);
  });

  it("⭐ 新積木帶著 kind；純數值的那幾顆起始值過得了自己的 schema", () => {
    for (const kind of ["damage", "heal", "applyStatus", "dash"]) expect(newEffect(kind).kind).toBe(kind);
    // ⚠️ 只驗**沒有 ref／union 欄位**的那幾顆：`applyStatus.statusId` 是 `zRef("status-effects")`，
    //    走訪器給不出一個合法的 id（那是作者要挑的），所以它的起始值本來就要靠畫面上的紅字
    //    擋在存檔之前（`validateAbilityDoc` 同一道閘）。⛔ 這裡不假裝它會過。
    for (const kind of ["damage", "heal"]) {
      const r = (brickSchema(kind) as { safeParse: (v: unknown) => { success: boolean; error?: unknown } }).safeParse(newEffect(kind));
      expect(r.success, `${kind} 的起始值被自己的 schema 拒絕：${JSON.stringify(r.error ?? null)}`).toBe(true);
    }
  });

  it("輸入解析與路徑寫入：數字看上下界、選填留白＝刪掉、JSON 框收陣列", () => {
    const num = { path: "amount.flat", kind: "number" as const, zh: "", note: "", optional: false, min: 0, max: 10 };
    expect(parseRowInput(num, "11")).toEqual({ ok: false, error: "不可以大於 10" });
    expect(parseRowInput(num, "3")).toEqual({ ok: true, value: 3 });
    expect(parseRowInput({ ...num, optional: true }, "")).toEqual({ ok: true, value: undefined });
    expect(parseRowInput({ ...num, kind: "json" }, "[1]")).toEqual({ ok: true, value: [1] });
    const e = setAt({ kind: "damage", amount: { flat: 1, perRank: [1] } }, "amount.flat", 5);
    expect(e).toEqual({ kind: "damage", amount: { flat: 5, perRank: [1] } });
    expect(setAt(e, "amount.flat", undefined)).toEqual({ kind: "damage", amount: { perRank: [1] } });
    expect(moveEffect(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("QA 擷取連結指到 editor:accept harness 開的那一條路（/editor/vfx-forge?qa=accept-46）", () => {
    expect(editorQaUrl("/editor/", "godie-x.q")).toBe("/editor/vfx-forge?qa=accept-46&ids=godie-x.q");
    expect(editorQaUrl("http://127.0.0.1:5174/editor/", "a.b")).toBe("http://127.0.0.1:5174/editor/vfx-forge?qa=accept-46&ids=a.b");
  });
});

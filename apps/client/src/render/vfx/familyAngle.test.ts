/**
 * GH#456 —— 家族**錐角**(扇形張多寬)真的從後台走到出去播的那份文件。
 *
 * ---------------------------------------------------------------------------
 * 這條守衛在守哪一行
 * ---------------------------------------------------------------------------
 * `applyFamilyOrient` 裡錐角那一段刻意放在**仰角的提早返回之前**。放在後面的話
 * `tornado`(仰角 90 = 恆等 ⇒ `return doc`)會在那一行就走掉,於是「龍捲錐角」
 * 這一格後台有欄位、有上下界、有標籤、存檔會成功 —— 而畫面一位元都不會變。
 * 那正是第一·五守則點名的形狀:每一個零件都是對的,只有它們的組合是空的
 * (`abilityOrientOverrideFor` 的檔頭記著同一個坑的前一次發作)。
 *
 * ⭐ 所以斷言刻意跨**兩個方向**:`slash`(仰角 ≠ 90,會走完整條路)與
 * `tornado`(仰角 = 90,只有把錐角提前才拿得到)。只測 slash 的話,把那一段搬回
 * 仰角後面測試照樣全綠。
 *
 * 用的是**出貨的那兩份 vfx 文件**,⛔ 不是手寫夾具(失敗形態⑤:被測的不是出貨的
 * 那個 —— 手寫的 emitter 只要 primitives.ts 動過就開始說謊)。
 *
 * 突變紀錄(2026-08-19):
 *   · 把 `applyFamilyOrient` 的錐角那一段移到仰角的提早返回**之後**
 *     → tornado 那條斷言紅(拿到 34 而不是後台填的 120),slash 仍綠 ✅
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { VfxDoc } from "@ggd/shared/content";
import { zConfigVfxFamiliesDoc, zVfxDoc } from "@ggd/shared/content/schema/vfx";
import { applyFamilyOrient, setFamilyPitchDefaults } from "./familyOrient";

const root = (p: string): string => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));
const readDoc = (p: string): VfxDoc => zVfxDoc.parse(JSON.parse(readFileSync(root(p), "utf8")));

/** 出貨的那份總表 —— 手寫一份就是失敗形態⑤。 */
const SHIPPED = zConfigVfxFamiliesDoc.parse(
  JSON.parse(readFileSync(root("content/config/vfx-families.json"), "utf8")),
);
const SLASH = readDoc("content/vfx/fx.prim.physical.slash.json");
const TORNADO = readDoc("content/vfx/fx.prim.wind.tornado.json");

const coneAngle = (doc: VfxDoc): number | undefined =>
  doc.emitter.shape === "cone" ? doc.emitter.angleDeg : undefined;

afterEach(() => setFamilyPitchDefaults(SHIPPED));

describe("家族錐角 (GH#456)", () => {
  it("⭐ 後台改一格,兩個家族的發射錐都真的跟著變 —— 包含仰角直立的那一個", () => {
    setFamilyPitchDefaults({ ...SHIPPED, slashAngleDeg: 20, tornadoAngleDeg: 120 });
    expect(coneAngle(applyFamilyOrient(SLASH))).toBe(20);
    // ⭐ tornado 的仰角是 90(恆等),錐角只有在提早返回**之前**才拿得到。
    expect(coneAngle(applyFamilyOrient(TORNADO))).toBe(120);
  });

  it("出貨值 = primitives.ts 烘進文件的那個 ⇒ 回傳同一個物件(零改動走舊路徑)", () => {
    setFamilyPitchDefaults(SHIPPED);
    expect(coneAngle(applyFamilyOrient(TORNADO))).toBe(coneAngle(TORNADO));
    expect(applyFamilyOrient(TORNADO)).toBe(TORNADO);
  });
});

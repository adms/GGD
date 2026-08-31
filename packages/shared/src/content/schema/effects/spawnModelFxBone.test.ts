/**
 * ⭐⭐ GH#761 AC② —— **模型特效掛得到骨頭**（原作的 `attachedModels`）。
 *
 * ── ⛔ 在此之前 ────────────────────────────────────────────────────────────
 * `spawnModelFx` 表達得出「生幾具、多大、走什麼路徑」，
 * ⛔ **而表達不出「掛在誰的哪一根骨頭上」** —— `anchor` 只有腳下三選一。
 * ⇒ ⭐ 原作那一族「劍掛在手上、光環掛在胸口」的模型特效**寫不出來**，
 * ⛔ 只能靠 `attachment@1` 的**常駐**綁定去逼近（⇒ 它一直亮著）。
 *
 * ── ⭐ 詞彙逐字照抄 `spawnVfx`，⛔ 不發明第二套 ────────────────────────────
 * `bone` / `attach` / `boneOn` 那一組在 GH#809 就定案了。
 * ⛔ 兩套骨頭詞彙 ＝ 編輯器要問兩次「掛哪裡」，而它們遲早會分岔。
 *
 * ── ⚠️ AC④：型別有**三份**，⛔ 而它們必須一起動 ──────────────────────────
 * schema · `variants/spawnModelFx.ts` · `modelFxPlacement.ts`。
 * ⭐ 實際踩到過：只改前兩份 ⇒ `tsc` 紅（def 指派不進擺位那一層）。
 *
 * MUTATION LOG：schema 的 `"bone"` 從 anchor 列舉拿掉 → ①紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");

describe("GH#761 AC② spawnModelFx 掛得到骨頭", () => {
  it("★ ⭐ schema 的 `anchor` 收得下 `bone`，並帶 `attach` / `boneOn`", () => {
    const s = read("packages/shared/src/content/schema/effects/spawnModelFx.ts");
    expect(s, "⛔ anchor 沒有 bone").toContain('"self", "point", "target", "bone"');
    expect(s, "⛔ 沒有 attach（掛哪一根）").toMatch(/attach: z\n\s*\.string\(\)/);
    expect(s, "⛔ 沒有 boneOn（掛誰身上）").toMatch(/boneOn: z\n\s*\.enum\(\["caster", "victim"\]\)/);
  });

  it("★ ⭐ **三份型別一起動**（AC④：同一份型別，⛔ 不是抄一份）", () => {
    // ⚠️ 實際踩到過：只改前兩份 ⇒ tsc 紅（def 指派不進擺位那一層）。
    for (const f of [
      "packages/shared/src/sim/effects/variants/spawnModelFx.ts",
      "packages/shared/src/sim/effects/modelFxPlacement.ts",
    ]) {
      expect(read(f), `⛔ ${f} 的 anchor 沒有 bone —— 型別漂了`).toContain(
        '"self" | "point" | "target" | "bone"',
      );
    }
  });

  it("★ ⭐ 詞彙**與 `spawnVfx` 同一組**（⛔ 不是第二套）", () => {
    const vfx = read("packages/shared/src/content/schema/effects/spawnVfx.ts");
    const model = read("packages/shared/src/content/schema/effects/spawnModelFx.ts");
    for (const w of ["attach", "boneOn", "caster", "victim"]) {
      expect(vfx, `⛔ spawnVfx 少了 ${w}`).toContain(w);
      expect(model, `⛔ spawnModelFx 少了 ${w} —— 兩套詞彙會分岔`).toContain(w);
    }
  });

  it("⭐ 擺位層**明說它不處理 bone**（⛔ 一個沉默的 fallthrough 會被讀成缺陷）", () => {
    const s = read("packages/shared/src/sim/effects/modelFxPlacement.ts");
    expect(s, "⛔ 沒有寫下「骨頭掛點是渲染層的事」").toContain("渲染層");
  });
});

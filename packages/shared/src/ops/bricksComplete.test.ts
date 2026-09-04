/**
 * ⭐⭐ **積木完整性閘**（GH#989）—— owner 2026-09-05：
 * 「所以後台編輯器的抽象化、**完整性**、視覺化可操作性很重要」
 *
 * ⭐ 「完整性」在這裡有一個**會變的數字**：`layer ∈ {effect, hook, template,
 * vfx-subtype}` 的每一顆積木，在**兩個編輯器**都要有表單。缺的那些逐顆列在
 * `ggd-bricks.json` 的 `gaps`，⛔ 而這支測試是**棘輪** —— 只能變少。
 *
 * ⚠️ ⭐ **雙向**：缺口變多 ⇒ 紅（回歸）；缺口變少 ⇒ **也紅**，並叫你把基準線降下來。
 * ⛔ 少了第二個方向，棘輪就只是一個永遠鬆的上界。
 *
 * ⚠️ ⭐ `editorForm` 今天是**代理值**（`ggd-editor-coverage.json` 的 `required`）——
 * 收據來之前它不代表「apps/editor 真的有表單」，量法逐字寫在產物的 `editorFormSource`。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../../..");
const GATED = new Set(["effect", "hook", "template", "vfx-subtype"]);

/** ⭐ 2026-09-05 量到的缺口數。⛔ 只能往下改，⛔ 不可以往上。 */
const BASELINE_GAPS = 119;

interface Brick {
  id: string;
  layer: string;
  adminForm: boolean;
  editorForm: boolean;
}

/** ⭐ 檢查器本體 —— 抽出來是為了讓 sentinel 餵得進假積木（⛔ 不是為了漂亮）。 */
function gapsOf(bricks: Brick[]): string[] {
  return bricks
    .filter((b) => GATED.has(b.layer))
    .filter((b) => !b.adminForm || !b.editorForm)
    .map(
      (b) =>
        `${b.layer}/${b.id} 缺 ${[
          ...(b.adminForm ? [] : ["後台表單"]),
          ...(b.editorForm ? [] : ["編輯器表單"]),
        ].join(" + ")}`,
    )
    .sort();
}

const doc = JSON.parse(
  readFileSync(resolve(ROOT, "docs/editor-contract/ggd-bricks.json"), "utf8"),
) as { bricks: Brick[]; gaps: Array<{ id: string }> };

describe("ggd-bricks 完整性棘輪", () => {
  it("⭐ 缺口數只能變少，而且訊息指名每一顆積木", () => {
    const gaps = gapsOf(doc.bricks);
    // 產物自己算的那一份要和這裡算的一致 —— 兩邊分岔 ⇒ 產物過期或檢查器漂了。
    expect(gaps.length).toBe(doc.gaps.length);
    expect(
      gaps.length,
      `⛔ 缺表單的積木變多了（${BASELINE_GAPS} → ${gaps.length}）：\n${gaps.join("\n")}`,
    ).toBeLessThanOrEqual(BASELINE_GAPS);
    expect(
      gaps.length,
      `⭐ 缺口變少了（${BASELINE_GAPS} → ${gaps.length}）—— 把 BASELINE_GAPS 改成 ${gaps.length}`,
    ).toBeGreaterThanOrEqual(BASELINE_GAPS);
  });

  it("⭐ sentinel：自造一顆缺後台表單的積木，檢查器抓得到它", () => {
    // ⛔ 沒有這一條,上面那條證明不了自己還活著（一個永遠回空陣列的檢查器也會綠）。
    const fake: Brick[] = [
      { id: "sentinel-ok", layer: "effect", adminForm: true, editorForm: true },
      { id: "sentinel-bad", layer: "effect", adminForm: false, editorForm: true },
      // ⛔ 不在閘的四層裡 ⇒ 就算兩邊都缺也不該被算進來。
      { id: "sentinel-out", layer: "vfx-prim", adminForm: false, editorForm: false },
    ];
    expect(gapsOf(fake)).toEqual(["effect/sentinel-bad 缺 後台表單"]);
  });
});

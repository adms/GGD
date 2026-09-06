/**
 * ⭐⭐ **積木完整性閘**（GH#989）—— owner 2026-09-05：
 * 「所以後台編輯器的抽象化、**完整性**、視覺化可操作性很重要」
 *
 * ⭐ 「完整性」在這裡有一個**會變的數字**：`layer ∈ {effect, hook, template,
 * vfx-subtype, vfx-call}` 的每一顆積木，在**兩個編輯器**都要有表單。缺的那些逐顆列在
 * `ggd-bricks.json` 的 `gaps`，⛔ 而這支測試是**棘輪** —— 只能變少。
 *
 * ⭐ GH#1075：`vfx-call` 是 GH#990 的可呼叫子模組（`content/vfx-subtypes/sub.*.json`）——
 * ⛔ 不是 `vfx-subtype`（那一層是 `vfx@1.presentation` 的 enum）。第三條斷言把清冊那一層
 * 與磁碟上的子模組對起來：拿掉／加一顆而沒 `bricks:build` ⇒ 紅；產生器漏推那一層 ⇒ 紅。
 *
 * ⚠️ ⭐ **雙向**：缺口變多 ⇒ 紅（回歸）；缺口變少 ⇒ **也紅**，並叫你把基準線降下來。
 * ⛔ 少了第二個方向，棘輪就只是一個永遠鬆的上界。
 *
 * ⚠️ ⭐ `editorForm` 今天是**代理值**（`ggd-editor-coverage.json` 的 `required`）——
 * 收據來之前它不代表「apps/editor 真的有表單」，量法逐字寫在產物的 `editorFormSource`。
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../../..");
const GATED = new Set(["effect", "hook", "template", "vfx-subtype", "vfx-call"]);

/**
 * ⭐ 2026-09-05 量到的缺口數。⛔ 只能往下改，⛔ 不可以往上 —— 唯一的例外是**分母變了**
 * （閘多管一層），而那要在這裡寫下是哪一層、幾顆。
 * · 2026-09-06 GH#992：後台技能積木頁開得了 abilities ⇒ 119 → 39
 * · 2026-09-06 GH#1075：分母加 `vfx-call` 層（4 顆子模組，兩個編輯器今天都沒有 picker）⇒ 39 → 43
 */
const BASELINE_GAPS = 47 // 2026-09-07 GH#1066/#1068/#1069/#1071/#1072：四個新模板家族（blink／apply-status／heal／projectile-strike）進清冊 ⇒ 分母變大；它們的後台表單走 #992 的 schemaToForm、編輯器表單走 Codex packet

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
      // ⛔ 不在閘的五層裡 ⇒ 就算兩邊都缺也不該被算進來。
      { id: "sentinel-out", layer: "vfx-prim", adminForm: false, editorForm: false },
      // ⭐ GH#1075：子模組層在閘裡 —— 兩邊都缺要被點名。
      { id: "sentinel-call", layer: "vfx-call", adminForm: false, editorForm: false },
    ];
    expect(gapsOf(fake)).toEqual([
      "effect/sentinel-bad 缺 後台表單",
      "vfx-call/sentinel-call 缺 後台表單 + 編輯器表單",
    ]);
  });

  it("⭐ GH#1075：清冊的 vfx-call 層 ＝ content/vfx-subtypes 的每一份子模組", () => {
    const dir = resolve(ROOT, "content/vfx-subtypes");
    const onDisk = readdirSync(dir)
      .filter((f) => f.endsWith(".json") && f !== "_index.json")
      .map((f) => (JSON.parse(readFileSync(resolve(dir, f), "utf8")) as { id: string }).id)
      .sort();
    expect(onDisk.length, "content/vfx-subtypes 讀不到任何子模組 —— 掃面壞了").toBeGreaterThan(0);
    const listed = doc.bricks.filter((b) => b.layer === "vfx-call").map((b) => b.id).sort();
    expect(
      listed,
      "⛔ 清冊的 vfx-call 層與 content/vfx-subtypes 對不上（子模組加了／拿掉了，或產生器漏推那一層）—— 跑 pnpm bricks:build 然後 git add",
    ).toEqual(onDisk);
  });
});

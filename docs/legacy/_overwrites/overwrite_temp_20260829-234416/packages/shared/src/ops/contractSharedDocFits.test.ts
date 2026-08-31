/**
 * 契約裡的說明，**不可以講的是另一個欄位**（GH#877）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼（2026-08-29 對抗性複驗量到）
 * ---------------------------------------------------------------------------
 * `gen_spec.ts` 把共用分片（`effects/_*.ts`）當成**名字對名字**的說明後備 ——
 * ⛔ 只驗名詞，⛔ 不問「是不是同一個欄位」。⇒ 三格拿到了**別的欄位**的說明：
 *
 * | 契約列 | 真正的 schema | 曾經印出的說明 | 那句話真正的出處 |
 * |---|---|---|---|
 * | `spawnModelFx.scale` | `z.number().max(20)` | 叫人填 `"ratio"` / `"points"` | `_shared.ts` 的 `zResourcePctTerm.scale`（一個 **enum**）|
 * | `extendBuff.basis` | `raw`/`mitigated`/`hpLost` | 「現存 / 最大 / 已損失」 | `_shared.ts` 另一個 `basis`（`current`/`max`/`missing`）|
 * | `modifyCooldown.basis` | `remaining`/`base` | 同上 | 同上 |
 *
 * ⭐ `scale` 那一列**自己跟自己打架**：型別欄寫「數字 ≤20」、說明欄叫人填字串
 * ⇒ 外部編輯器（Codex）照著寫會被 schema **當場拒絕**。
 *
 * ⚠️ ⭐ **一格錯的說明比 `—` 更糟**：`—` 說「去看 schema」，錯的說明說「不用看了」
 * （第一·五守則：⛔ 不放任何無效說明）。
 *
 * ⚠️ ⭐ 而四道綠燈全部沒叫，因為驗收量的是「**0 列退化成空白**」——
 * 一把**只問空不空**的尺 ⇒ **一句錯的說明比空白更綠**。
 * （CLAUDE.md：「這一欄的分母是什麼」——表頭靜靜地把「正確」偷換成「非空」。）
 *
 * ⇒ 這一條問的是**關係**：enum 欄位的說明，有沒有提到**它自己的**任何一個值？
 *
 * 突變紀錄：把 `enumDocMentionsOwnValues` 改成恆為 true → 兩格 `basis` 紅並指名。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTRACT = join(REPO, "docs/技能標記機制與效果規則.md");

type Row = { type: string; desc: string; line: number };

/** 撈出契約表格裡「型別欄是列舉」的那些列。 */
function enumRows(): Row[] {
  const out: Row[] = [];
  readFileSync(CONTRACT, "utf-8")
    .split("\n")
    .forEach((l, i) => {
      if (!l.startsWith("| `")) return;
      const c = l.split("|").map((x) => x.trim());
      if (c.length < 6) return;
      const [, , type, , , ...rest] = c;
      const desc = rest.join(" | ").trim();
      // 型別欄長成 `a` / `b` / `c` ⇒ 那是列舉
      const vals = [...(type ?? "").matchAll(/`([a-zA-Z][\w-]*)`/g)].map((m) => m[1]!);
      if (vals.length >= 2) out.push({ type: type ?? "", desc, line: i + 1 });
    });
  return out;
}

describe("契約的說明講的是**這一格**（GH#877）", () => {
  it("GUARD THE GUARD：真的撈到列舉列了", () => {
    expect(enumRows().length, "⛔ 一列都沒撈到 —— 表格格式變了？").toBeGreaterThan(5);
  });

  /**
   * ⭐ **缺陷的形狀**：一個 `數字` 欄位的說明在**列舉字串值**。
   *
   * ⚠️ 我試過兩個更聰明的判準，⛔ 兩個突變都**沒咬**（＝那不是守衛，第二守則）：
   *   ① 「說明有沒有提到自己的值」⇒ **109 列誤報**（中文說明本來就不引用值）
   *   ② 「同一句掛在 num 與 enum 兩列上」⇒ ⛔ 缺陷的來源列（巢狀子 schema）
   *      **根本不在契約裡** ⇒ 對不出來
   *
   * ⇒ ⭐ 直接抓**看得出來的自相矛盾**：型別欄寫「數字」，而說明叫人填 `"points"`。
   *   外部編輯器（Codex）照著寫會被 schema **當場拒絕**（第一·五守則）。
   */
  it("⭐ `數字` 欄位的說明⛔ 不可以列舉字串值", () => {
    const bad: string[] = [];
    readFileSync(CONTRACT, "utf-8")
      .split("\n")
      .forEach((l, i) => {
        if (!l.startsWith("| `")) return;
        const c = l.split("|").map((x) => x.trim());
        if (c.length < 6) return;
        const type = c[2] ?? "";
        if (!/^數字|^布林/.test(type)) return;
        const desc = [...c].reverse().find((x) => x !== "") ?? "";
        if (desc === "" || desc === "—" || desc === "-") return;
        // 說明裡以引號括起來的**英數識別字** ⇒ 那是在列舉字串值
        const quoted = [...desc.matchAll(/["「'`]([a-zA-Z][\w-]{2,20})["」'`]/g)].map((m) => m[1]!);
        if (quoted.length >= 2) bad.push(`:${i + 1}  型別「${type}」↔ 說明列舉 ${quoted.slice(0, 3).join(" / ")}`);
      });
    expect(
      bad,
      "⛔ 這些列**自己跟自己打架**：型別欄是數字，說明欄卻叫人填字串值。\n" +
        "⭐ 指紋：共用分片（`effects/_*.ts`）被當成**名字對名字**的說明後備（只驗名詞⛔不驗關係）——\n" +
        "  一個 enum 的說明被掛到 number 上。外部編輯器照著寫會被 schema **當場拒絕**。\n" +
        "⚠️ 一格錯的說明比 `—` 更糟：`—` 說「去看 schema」，錯的說明說「不用看了」。\n" +
        "⇒ 修 `tools/skill-spec/gen_spec.ts` 的 `sharedDocFits`，⛔ 不是把說明手抄進產物。\n" +
        bad.map((b) => `  · ${b}`).join("\n"),
    ).toEqual([]);
  });
});

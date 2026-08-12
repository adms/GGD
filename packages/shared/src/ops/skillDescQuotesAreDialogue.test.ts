/**
 * ⭐ owner 2026-08-12 立的規則，逐字：
 *
 *     「技能內文說明會有一個 **「」代表角色施展技能的對白，不是真正的效果**，
 *      請不要被迷惑了」
 *
 * ⛔ 任何讀技能說明找機制的東西（正則、閘、LLM、編輯器的自動建議）都必須先剝掉
 * 整段 `「…」`。這條規則的代價已經量到過：44-04 心臟麻痺的台詞是
 * 「不，還不能笑，我一定要忍住……**在35秒後**宣布勝利吧。」——
 * 產生器的時序閘掃整段，把它判成一支帶 35 秒延遲的技能（假紅，擋住作者）。
 *
 * 這條守衛驗的是**行為**（真的把 `batch1.py` 的 `_mechanics_text()` 跑起來），
 * ⛔ 不是掃原始碼字串（失敗形態⑥），也不是驗 CLAUDE.md 有沒有寫那段話。
 *
 * 突變紀錄：
 *   · `_mechanics_text` 改成 `return desc` → 紅（三個台詞詞全部殘留）
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 出貨規格裡真的存在的三句台詞，每一句都含一個會被誤讀成機制的詞。 */
const CASES = [
  { quote: "「不，還不能笑，我一定要忍住……在35秒後宣布勝利吧。」", trap: "35秒後" },
  { quote: "「站著不要動，我...我要射了」", trap: "不要動" },
  { quote: "「放了這招我就要補魔了」", trap: "補魔" },
];

describe("技能說明的「」是角色對白，不是效果", () => {
  it("⭐ 讀機制的那一關會剝掉整段「」—— 含行中與跨行", () => {
    cover("skill-desc-quotes-are-dialogue");
    const desc = `[主動][範圍]\n造成 300 傷害${CASES[0]!.quote}再造成 100 傷害\n${CASES[1]!.quote}\n${CASES[2]!.quote}`;
    const out = execFileSync(
      "python3",
      [
        "-c",
        [
          "import importlib.util,sys,json",
          `spec=importlib.util.spec_from_file_location('b','${ROOT}/tools/skill-remake/batch1.py')`,
          "b=importlib.util.module_from_spec(spec);sys.modules['b']=b;spec.loader.exec_module(b)",
          "print(json.dumps(b._mechanics_text(sys.argv[1])))",
        ].join("\n"),
        desc,
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    const stripped = JSON.parse(out) as string;

    // 夾具前提：機制那幾句要留著，否則下面的「台詞不見了」是因為整段被吃掉。
    expect(stripped, "機制文字被一起剝掉了 —— 那不是剝台詞，是剝全部").toContain("造成 300 傷害");
    for (const c of CASES) {
      expect(
        stripped,
        `台詞裡的「${c.trap}」還在 —— 讀機制的閘會把它當成一個真的效果`,
      ).not.toContain(c.trap);
    }
  });
});

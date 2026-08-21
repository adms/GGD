/**
 * ⛔ 後台欄位的**說明**不可以自己抄一份出貨值。
 *
 * owner 2026-08-21：「**其他說明也應該以設定檔內容為準**」。
 *
 * ⚠️ 這條不是潔癖，是量到的：`ConfigDocPage` **本來就**在每一格旁邊印
 * 「出貨值 …」（從伺服器抓真的 `content/config/*.json`）。說明裡再寫一次
 * 就是**第四個住處**，而它沒有守衛 ⇒ 它一定會過期。
 *
 * 前例（2026-08-21 抓到）：`lobby-rally.waitSeconds` 的說明寫著
 * 「owner 明說 **10**」而出貨值是 **5** —— owner 在後台看到的說明
 * 跟旁邊的數字打架，⛔ 而 `content:build` 與全套測試都是綠的。
 *
 * ⭐ 要在句子裡用到那個值就寫 `{{出貨值}}`（`SHIPPED_TOKEN`），
 * 渲染時代入真的值。⛔ 不要手打數字。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DOC_SPECS } from "./configForms";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const CLAIM = /(?:出貨(?:值)?(?:是)?|預設(?:值)?(?:是)?|明說|現在(?:是)?|目前(?:是)?)\s*\**\s*$/;

function at(doc: unknown, path: string): unknown {
  let cur: unknown = doc;
  for (const part of path.split(".")) {
    const m = /^([^[]+)((?:\[\d+\])*)$/.exec(part);
    const key = m?.[1];
    if (!m || key === undefined) return undefined;
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
    for (const idx of m[2]?.matchAll(/\[(\d+)\]/g) ?? []) {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[Number(idx[1])];
    }
  }
  return cur;
}

describe("後台說明以設定檔為準", () => {
  it("⛔ 說明不可以複述自己的出貨值 —— 要用就寫 {{出貨值}}", () => {
    const bad: string[] = [];
    let checked = 0;
    for (const spec of CONFIG_DOC_SPECS) {
      let doc: unknown;
      try {
        doc = JSON.parse(readFileSync(join(ROOT, `content/config/${spec.docId}.json`), "utf8"));
      } catch {
        continue;
      }
      for (const f of spec.fields ?? []) {
        const v = at(doc, f.path);
        if (typeof v !== "number") continue;
        checked++;
        const tok = Number.isInteger(v) ? String(v) : String(v);
        for (const m of f.note.matchAll(new RegExp(`(?<![\\d.])${tok.replace(".", "\\.")}(?![\\d.])`, "g"))) {
          const i = m.index ?? 0;
          if (CLAIM.test(f.note.slice(Math.max(0, i - 14), i))) {
            bad.push(`${spec.docId}.${f.path} = ${tok} ⟦${f.note.slice(Math.max(0, i - 30), i + tok.length + 6)}⟧`);
            break;
          }
        }
      }
    }
    // ⚠️ 母體不可以是 0：那代表解析壞了,而壞掉的解析對任何說明都是綠的（失敗形態⑥）。
    expect(checked).toBeGreaterThan(80);
    expect(bad.join("\n")).toBe("");
  });
});

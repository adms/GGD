/**
 * configProseBooleanDefaults.test.ts —— 後台說明**不可以宣稱一個與出貨相反的布林預設**（GH#1095）。
 *
 * ⚠️ 量到的（2026-09-07）：`stat-normalization.skipTransformedBodies` 的說明逐字寫著
 * 「出貨**開著**」，而 `content/config/stat-normalization.json` 是 **`false`**
 * （owner 2026-08-13「請把變身也排除考慮行列」之後改的）。
 * ⭐ 而它是**載重**的：那一格開著時變身態整份跳過正規化 ⇒ 同一頁的 `transformBandShift`
 * 與 `transformInheritsOrigin` 兩格都讀不到。照那句話讀，操作者會以為在調兩格死的。
 *
 * ⛔ **為什麼既有的閘看不見它**：`apps/admin/src/configFormsShippedProse.test.ts` 的第一行
 * 迴圈是 `if (typeof v !== "number") continue` —— 它只掃**數字**出貨值。
 * ⇒ 布林那一半（96 格 `enabled` 那一族的近親）在結構上沒有任何守衛。
 * ⭐ 這正是「只驗一個方向的量尺」：它證明得了數字沒說謊，⛔ 證明不了布林沒說謊。
 *
 * ⭐ 修法一律是 `{{出貨值}}`（渲染時代入真的那一份，布林顯示「開啟」／「關閉」），
 * ⛔ 不是把那個字改對一次 —— 改對一次的下一次翻面又是同一個病。
 *
 * ⚠️ 突變驗過（2026-09-07）：把 `NORM_PROSE.skipTransformedBodies` 的 `{{出貨值}}`
 * 換回「**開著**」⇒ 紅，訊息指名 `stat-normalization.skipTransformedBodies`。
 *
 * ⚠️⚠️ 動態 import 的理由與 `adminFormsHandWrittenRatchet.test.ts` 同一個：
 * `packages/shared` 的 `rootDir` 不含 `apps/admin` ⇒ 普通 import 會讓 tsc 吐 TS6059。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 「這一格出貨是 X」的宣稱。⭐ 詞彙兩邊對稱，⛔ 不要只收其中一半。 */
const ON = ["開著", "開啟", "打開", "開的", "true"];
const OFF = ["關著", "關閉", "關掉", "關的", "false"];
const CLAIM = new RegExp(
  "(?:出貨(?:值)?(?:是)?|預設(?:值)?(?:是)?|明說(?:是)?|現在(?:是)?|目前(?:是)?)\\s*\\**\\s*(" +
    [...ON, ...OFF].join("|") +
    ")",
  "g",
);

interface Spec {
  docId: string;
  fields?: readonly { path: string; note: string }[];
}

function at(doc: unknown, path: string): unknown {
  let cur: unknown = doc;
  for (const key of path.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

describe("後台說明的布林出貨值", () => {
  it("⛔ 不可以宣稱一個與出貨相反的布林預設 —— 要講就寫 {{出貨值}}", async () => {
    const mod = (await import(
      /* @vite-ignore */ pathToFileURL(join(ROOT, "apps/admin/src/configForms.ts")).href
    )) as Record<string, unknown>;
    const specs = mod.CONFIG_DOC_SPECS as readonly Spec[];
    const bad: string[] = [];
    let checked = 0;
    for (const spec of specs) {
      let doc: unknown;
      try {
        doc = JSON.parse(readFileSync(join(ROOT, `content/config/${spec.docId}.json`), "utf8"));
      } catch {
        continue;
      }
      for (const f of spec.fields ?? []) {
        const v = at(doc, f.path);
        if (typeof v !== "boolean") continue;
        checked++;
        for (const m of f.note.matchAll(CLAIM)) {
          if (ON.includes(m[1]!) !== v) bad.push(`${spec.docId}.${f.path} 出貨 ${v} 而說明寫「${m[0]}」`);
        }
      }
    }
    // ⚠️ 母體不可以塌掉：解析壞掉時它會誠實地回 0，而 0 個違規讀起來跟「全過」一樣（形態⑥）。
    expect(specs.length).toBeGreaterThan(50);
    expect(checked).toBeGreaterThan(40);
    expect(bad.join("\n")).toBe("");
  });
});

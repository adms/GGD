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
import { readFileSync, readdirSync } from "node:fs";
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

/**
 * ⚠️ 一句說明常常在講**別的那一格**，而那不是這條要抓的東西（實測的誤報）：
 * `vfx-cleanup.lifecycleLedgerEnabled` 出貨 `true`，而它的說明裡有
 * 「⛔ 不受「顯示效能面板」那格影響，因為**那格預設是關的**」——
 * ⭐ 那句話講的是**另一格**，而且它是對的。同一段後面也誠實寫著「出貨開著」。
 * ⇒ 宣稱前面 10 個字裡出現這幾個指示詞 ⇒ 它指的不是這一格，跳過。
 */
const POINTS_ELSEWHERE = ["那格", "那一格", "上面", "下面", "另一格", "別的", "其他", "旁邊"];

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
          const before = f.note.slice(Math.max(0, (m.index ?? 0) - 10), m.index ?? 0);
          if (POINTS_ELSEWHERE.some((w) => before.includes(w))) continue;
          if (ON.includes(m[1]!) !== v) bad.push(`${spec.docId}.${f.path} 出貨 ${v} 而說明寫「${m[0]}」`);
        }
      }
    }
    // ⚠️ 母體不可以塌掉：解析壞掉時它會誠實地回 0，而 0 個違規讀起來跟「全過」一樣（形態⑥）。
    expect(specs.length).toBeGreaterThan(50);
    expect(checked).toBeGreaterThan(40);
    expect(bad.join("\n")).toBe("");
  });

  /**
   * ⛔⛔ **上面那一條只走了一頭。** 它掃的是 `configForms.ts` 的**欄位** note ——
   * ⭐ 而同一句假話還有**另外兩個住處**，2026-09-09 兩個都中了：
   *
   *   ① `content/config/<id>.json` 的**文件級 `note`**
   *   ② `packages/shared/src/content/schema/config/<id>.ts` 的**檔頭註解**
   *
   * ⚠️ 量到的實例：`ugc.json` 的 `note` 與 `ugc.ts` 的檔頭都逐字寫著
   * 「⛔⛔ `enabled` 出貨是 **false**」,⭐ 而 owner 2026-09-09 逐字說「**開**」
   * ⇒ 出貨值當天變成 `true`,⛔ 而**兩句散文都沒有變紅**。
   *
   * ⭐ 這是「⭐ 這條掃描**從哪一頭走**」那條元規則的實例:
   * ⛔ 從「admin 欄位」走 ⇒ 一定漏掉「住在 JSON 與 schema 檔頭裡的」。⇒ ⭐ 兩頭都要走。
   *
   * ⭐ 判準只認**綁定到具體欄位**的宣稱（`` `enabled` … 出貨 **false** ``）——
   * ⛔ 泛泛的散文不管,那不可判。
   */
  it("⭐ 另一頭:`content/config/*.json` 的 note 與 schema 檔頭也不可以宣稱相反的布林", () => {
    const bad: string[] = [];
    let checked = 0;
    const dir = join(ROOT, "content/config");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "_index.json");
    // ⚠️ 母體不可以塌掉
    expect(files.length).toBeGreaterThan(50);

    /**
     * ⭐ 在一段散文裡找「`欄位` … 出貨 **X**」,只認同一句話裡的(80 字內)。
     *
     * ⚠️ ⭐ **兩個過濾器,兩個都是被誤報逼出來的(2026-09-09 首跑各中一次)**:
     *
     * ① ⭐ **視窗要在下一個 `` `欄位` `` 前截斷** —— ⛔ 否則一句講**別的欄位**的話會被算到
     *    前一個欄位頭上。實例:`assetCdn.ts` 檔頭的「`fallbackToLocal` 為什麼預設 true」
     *    被算成 `enabled`(出貨 false)在說謊。⇒ ⭐ 宣稱屬於**最近的前一個**欄位提及。
     *
     * ② ⭐ **先剝掉 `「…」`** —— ⛔ 引用一句**過期的舊宣稱**不是一個宣稱。
     *    實例:`ugc.ts` 的新檔頭逐字寫著「這一段在 2026-09-09 之前寫著『出貨是 false』」,
     *    ⭐ 那是**歷史**,⛔ 不是主張。⚠️ 這與 CLAUDE.md 第〇·六守則那條
     *    「`「」` 裡面是角色對白,不是效果」是**同一條規矩的第二個載體**。
     */
    const scan = (where: string, rawText: string, doc: Record<string, unknown>): void => {
      // ② ⭐ 剝掉引號內容(⭐ 用等長空白替換,⛔ 不要改變位移 —— 那會讓 ① 的截斷算錯)
      const text = rawText.replace(/「[^」]*」/g, (m) => " ".repeat(m.length));
      const NEXT_FIELD = /`[A-Za-z_][A-Za-z0-9_.]*`/;
      for (const [field, v] of Object.entries(doc)) {
        if (typeof v !== "boolean") continue;
        const tick = "`" + field + "`";
        let from = 0;
        for (;;) {
          const i = text.indexOf(tick, from);
          if (i < 0) break;
          from = i + tick.length;
          let window = text.slice(from, from + 80);
          // ① ⭐ 下一個欄位提及開始就不是這一格的事了
          const nxt = NEXT_FIELD.exec(window);
          if (nxt) window = window.slice(0, nxt.index);
          checked++;
          for (const m of window.matchAll(CLAIM)) {
            const before = window.slice(Math.max(0, (m.index ?? 0) - 10), m.index ?? 0);
            if (POINTS_ELSEWHERE.some((w) => before.includes(w))) continue;
            if (ON.includes(m[1]!) !== v) {
              bad.push(`${where}: \`${field}\` 出貨 ${v} 而散文寫「${m[0]}」`);
            }
            break; // ⭐ 同一次提及只記一筆
          }
        }
      }
    };

    for (const f of files) {
      let doc: Record<string, unknown>;
      try {
        doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
      } catch {
        continue;
      }
      const note = typeof doc.note === "string" ? doc.note : "";
      if (note) scan(`content/config/${f}`, note, doc);

      // ② 對應的 Zod 檔頭(檔名慣例:kebab → camel)
      const camel = f.replace(/\.json$/, "").replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      const zod = join(ROOT, `packages/shared/src/content/schema/config/${camel}.ts`);
      let src: string;
      try {
        src = readFileSync(zod, "utf8");
      } catch {
        continue;
      }
      const head = src.slice(0, src.indexOf("export const") + 1 || src.length);
      scan(`schema/config/${camel}.ts(檔頭)`, head, doc);
    }

    /**
     * ⭐⭐ **量尺自證 —— 兩個方向,⛔ 不是一個門檻。**
     *
     * ⚠️ 一個裸的 `checked > N` 只證明「它掃過東西」,⛔ 證明不了「它抓得到」——
     * 而這一族缺陷長成的正是**後者**(掃過了,而該紅的沒紅)。
     * ⇒ ⭐ 自造兩份輸入餵進**同一個** `scan`:
     */
    {
      const probe: string[] = [];
      const savedBad = bad.length;
      // ① 已知**有**:一句與出貨相反的宣稱 ⇒ 必須抓到
      scan("sentinel", "`flag` 這一格出貨 **關閉**。", { flag: true });
      expect(bad.length, "⛔ 量尺瞎了:已知的假話沒抓到 ⇒ 這一條的一切結論作廢").toBe(savedBad + 1);
      probe.push(bad.pop()!);
      // ② 已知**沒有**:同一句話但方向對了 ⇒ 必須不抓
      scan("sentinel", "`flag` 這一格出貨 **開啟**。", { flag: true });
      expect(bad.length, `⛔ 量尺過敏:對的宣稱被判成假話 ${bad.slice(savedBad).join()}`).toBe(savedBad);
      // ③ 已知**不該算**:講的是別的欄位(過濾器①)
      scan("sentinel", "`flag` 而 `other` 出貨 **關閉**。", { flag: true, other: false });
      expect(bad.length, "⛔ 過濾器①壞了:別的欄位的宣稱被算到 flag 頭上").toBe(savedBad);
      // ④ 已知**不該算**:引號裡的歷史(過濾器②)
      scan("sentinel", "`flag` 在此之前寫著「出貨 **關閉**」,現在不是了。", { flag: true });
      expect(bad.length, "⛔ 過濾器②壞了:引號裡的舊宣稱被當成主張").toBe(savedBad);
      expect(probe[0]).toContain("flag");
    }

    // ⭐ 母體不可以塌掉(⛔ 0 個「看過」讀起來跟全過一樣)
    expect(checked).toBeGreaterThan(10);
    expect(bad.join("\n")).toBe("");
  });
});

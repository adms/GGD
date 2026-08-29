/**
 * live 設定頁宣告的 `{min,max}` 必須落在**出貨 Zod schema** 收得下的範圍內。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼（2026-08-29 對抗性複驗量到的真缺陷，GH#830）
 * ---------------------------------------------------------------------------
 * `tools/admin-live/datasets/*.mjs` 的 `write.rules[].value` 各自宣告一組上下界，
 * 而**出貨的 Zod schema 也有一組** —— ⛔ 那是同一個事實的**第二個住處**（第〇·四守則），
 * 於是它們會漂開。量到的兩筆：
 *
 * | 欄位 | dataset 宣告 | 出貨 schema | 後果 |
 * |---|---|---|---|
 * | `offerCount` | `max: 6` | `.max(5)` | 後台存得下 **6**，內容驗證**拒收** |
 * | loot `weight` | `min: 0` | `.positive()` | 後台存得下 **0**，內容驗證**拒收** |
 *
 * ⚠️ 而症狀是**最難查的那一種**：後台按下去成功、檔案真的變了，
 * 然後**整份內容驗證失敗** ⇒ fail-open 退回骨架（2026-08-01/08-02 事故的形狀）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 它驗的是**關係**，⛔ 不是名詞（第〇·二守則）
 * ---------------------------------------------------------------------------
 * ⛔ 不比對「兩個數字相不相等」（那要抄一份 schema 的字面值 ＝ 第三個住處）。
 * ⭐ 做法：把**宣告的邊界值**真的寫進一份**真的出貨文件**，然後跑**出貨的**
 * `validateDoc()` —— 邊界值被拒 ⇒ 紅。
 *
 * 突變紀錄：把 `ex-roots.mjs` 的 `max: 5` 改回 `6` → 紅並指名 `/offerCount`。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDoc } from "../content/loader";
import { isCollectionName } from "../content/schema/index";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DATASETS = join(REPO, "tools/admin-live/datasets");

type Bound = { file: string; path: string; pointer: string; min?: number; max?: number };

/** 把帶萬用字元的 JSON pointer（例 /a/b/星/c）套到 doc 上，回傳所有實際命中的具體 pointer。 */
function expand(doc: unknown, parts: string[], acc: string[] = []): string[][] {
  if (parts.length === 0) return [acc];
  const [head, ...rest] = parts;
  if (head === "*") {
    if (Array.isArray(doc)) return doc.flatMap((_, i) => expand(doc[i], rest, [...acc, String(i)]));
    if (doc && typeof doc === "object")
      return Object.keys(doc).flatMap((k) => expand((doc as Record<string, unknown>)[k], rest, [...acc, k]));
    return [];
  }
  const next = doc && typeof doc === "object" ? (doc as Record<string, unknown>)[head!] : undefined;
  return next === undefined ? [] : expand(next, rest, [...acc, head!]);
}

function setAt(doc: unknown, parts: string[], value: number): void {
  let cur = doc as Record<string, unknown>;
  for (const p of parts.slice(0, -1)) cur = cur[p] as Record<string, unknown>;
  cur[parts[parts.length - 1]!] = value;
}

/**
 * 從 dataset 原始碼撈出 `value: { type:"number", …, min:N, max:M }` 與它的
 * `paths` / `pointers`。⭐ 用正則而不是 import：那些 .mjs 會在 import 時做檔案 IO。
 */
function declaredBounds(): Bound[] {
  const out: Bound[] = [];
  for (const f of readdirSync(DATASETS).filter((x) => x.endsWith(".mjs"))) {
    const src = readFileSync(join(DATASETS, f), "utf-8");
    const block = src.match(/export const write\s*=\s*\{[\s\S]*?\n\};/)?.[0];
    if (!block) continue;
    // 逐條 rule：paths[…] · pointers[…] · value{…}
    for (const m of block.matchAll(
      /paths:\s*\[([^\]]*)\][\s\S]*?pointers:\s*\[([^\]]*)\][\s\S]*?value:\s*\{([^}]*)\}/g,
    )) {
      const v = m[3]!;
      if (!/type:\s*"number"/.test(v)) continue;
      const min = v.match(/\bmin:\s*(-?[\d.]+)/)?.[1];
      const max = v.match(/\bmax:\s*(-?[\d.]+)/)?.[1];
      if (min === undefined && max === undefined) continue;
      const paths = [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
      const ptrs = [...m[2]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
      // 常數形的 paths（例 `[CONFIG]`）⇒ 回去原始碼解那個常數
      const resolved = paths.length
        ? paths
        : [...m[1]!.matchAll(/([A-Z_][A-Z0-9_]*)/g)]
            .map((x) => src.match(new RegExp(`const ${x[1]}\\s*=\\s*"([^"]+)"`))?.[1])
            .filter((x): x is string => Boolean(x));
      for (const p of resolved)
        for (const ptr of ptrs)
          out.push({ file: f, path: p, pointer: ptr, ...(min !== undefined ? { min: Number(min) } : {}), ...(max !== undefined ? { max: Number(max) } : {}) });
    }
  }
  return out;
}

/** glob（只有 `*` 這一種）→ 實際檔案清單。 */
function globFiles(pattern: string): string[] {
  if (!pattern.includes("*")) return existsSync(join(REPO, pattern)) ? [pattern] : [];
  const dir = pattern.slice(0, pattern.lastIndexOf("/"));
  const abs = join(REPO, dir);
  if (!existsSync(abs)) return [];
  const re = new RegExp("^" + pattern.slice(dir.length + 1).replace(/\*/g, ".*") + "$");
  return readdirSync(abs).filter((f) => re.test(f)).map((f) => `${dir}/${f}`);
}

describe("live 設定頁的上下界 ⊆ 出貨 schema（GH#830）", () => {
  const bounds = declaredBounds();

  it("GUARD THE GUARD：真的撈到宣告了（⛔ 正則寫壞會空轉全綠）", () => {
    expect(bounds.length, "⛔ 一條數值上下界都沒撈到 —— 正則過期了").toBeGreaterThan(0);
  });

  it("每一個宣告的邊界值，出貨驗證器都收得下", () => {
    const bad: string[] = [];
    for (const b of bounds) {
      for (const file of globFiles(b.path)) {
        const collection = file.split("/")[1]!;
        if (!isCollectionName(collection)) continue;
        const parts = b.pointer.split("/").filter(Boolean);
        for (const [label, value] of [["min", b.min], ["max", b.max]] as const) {
          if (value === undefined) continue;
          for (const concrete of expand(JSON.parse(readFileSync(join(REPO, file), "utf-8")), parts)) {
            const doc = JSON.parse(readFileSync(join(REPO, file), "utf-8"));
            setAt(doc, concrete, value);
            const r = validateDoc(collection, doc);
            if (!r.ok)
              bad.push(
                `${b.file} 宣告 ${b.pointer} 的 ${label}=${value}，` +
                  `而出貨 schema 拒收（${file} /${concrete.join("/")}）：` +
                  r.issues.slice(0, 1).map((i) => `${i.path ?? ""} ${i.message}`).join(""),
              );
            break; // 一個具體命中就夠證明
          }
        }
      }
    }
    expect(
      bad,
      "⛔ 後台**存得下**、而內容驗證**拒收** —— 存下去會讓整份內容載入失敗（fail-open 退回骨架）。\n" +
        "⭐ 修法：把 dataset 的界收窄到 schema 收得下的範圍。\n" +
        bad.map((x) => `  · ${x}`).join("\n"),
    ).toEqual([]);
  });
});

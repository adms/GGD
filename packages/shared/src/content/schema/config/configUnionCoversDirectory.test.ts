/**
 * ⛔ **一份 config schema 進了這個資料夾，卻沒進 union，不可以靜靜地過去。**
 *
 * 2026-08-22 把 9,169 行的 `schema/config.ts` 拆成一份 config 一個檔
 * （owner：「分析優化 config.ts 檔⋯以能平行化有利的方式優化這個檔案，拆檔也可以」）。
 * 拆完之後新增一份 config = **新開一個檔** + `config/index.ts` 的 union 加一行。
 *
 * ⚠️ **那一行就是這條閘存在的理由。** union 漏掉一員的後果不是「那一份被忽略」——
 * 是 `zConfigDoc` 拒絕整份文件 → ContentLoader 驗證失敗 → `main.tsx` 的 fail-open
 * 註冊 2 隻骨架英雄 → 選人畫面整個空掉，**而網站看起來完全正常**。那正是 2026-08-02
 * 線上壞掉四小時的形狀，而 `config.ts` 裡有 **20 幾條**手寫的「⚠️ 漏掉這一行 = 骨架英雄」
 * 註解在替它擋 —— 那是**判準**（要記得讀），這一條才是**閘**。
 *
 * ⭐ 為什麼 union 不能改成掃資料夾自動組出來：`z.discriminatedUnion` 吃的是一個
 * **元組**，`ConfigDoc = z.infer<…>` 的精度完全來自它（`config.ts` 自己記著一次
 * 「ConfigDoc 型別不夠準 ⇒ 一個永遠 false 的死比對」）。⇒ 表手寫，代價由這裡擋。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zConfigDoc } from "./index";

const DIR = dirname(fileURLToPath(import.meta.url));
const TAG = /z\.literal\("(config[^"]*)"\)/g;

/** 資料夾裡每一個宣告了 `config.*@1` 標籤的檔 → 它宣告的標籤。 */
function tagsOnDisk(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of readdirSync(DIR).sort()) {
    if (!f.endsWith(".ts") || f.endsWith(".test.ts") || f === "index.ts") continue;
    const tags = [...readFileSync(join(DIR, f), "utf8").matchAll(TAG)].map((m) => m[1]!);
    if (tags.length) out.set(f, [...new Set(tags)]);
  }
  return out;
}

const unionTags = zConfigDoc.options.map((o) => o.shape.schema.value as string);

describe("schema/config/ 的每一份 schema 都在 zConfigDoc 的 union 裡", () => {
  it("資料夾裡宣告的每一個 schema tag 都掛上了 union", () => {
    const orphans: string[] = [];
    for (const [file, tags] of tagsOnDisk()) {
      for (const t of tags) {
        if (!unionTags.includes(t)) orphans.push(`${file} 宣告了 ${t}，但 union 沒有它`);
      }
    }
    expect(
      orphans,
      `⛔ 這幾份 config 進不了線上：\n  ${orphans.join("\n  ")}\n` +
        "修法：在 config/index.ts 的 zConfigDoc union 裡加上它們（⛔ 不要改這條測試）。",
    ).toEqual([]);
  });

  it("一個 tag 只有一個住處，而且 union 沒有重複成員", () => {
    const seen = new Map<string, string>();
    for (const [file, tags] of tagsOnDisk()) {
      for (const t of tags) {
        expect(seen.has(t), `${t} 同時住在 ${seen.get(t)} 與 ${file}`).toBe(false);
        seen.set(t, file);
      }
    }
    expect(new Set(unionTags).size).toBe(unionTags.length);
  });

  it("⛔ 拆檔前的私有零件不可以被 index.ts 洩漏成公開名字", async () => {
    const surface = Object.keys(await import("../config"));
    expect(surface).not.toContain("zColorHex");
    expect(surface).not.toContain("zAudioAssetPath");
  });
});

/**
 * ⭐ 名言別名的閘 —— 驗**出貨的那一份清單**（`voices/champions/MANIFEST.json`），⛔ 不是掃產生器原始碼。
 *
 * > owner 2026-09-17：「你可以把預設先對應好 我看你有很多已經有名言 若沒有第二順位是勝利 第三順位是嘲諷」
 * > owner 2026-09-17：「其他都可以用勝利宣言」
 *
 * `QUOTE_ALIAS.json` 說「這位的名言用他自己的哪一格」，`tools/voice-gen/index-lines.mjs` 把那一格
 * 的**同一個檔**再指一次給名言 —— ⛔ 不複製檔案（複製出來的那一份沒有人認領，GH#771）。
 * 這條閘問三件事：① 每一位別名英雄在清單裡真的有名言 ② 名言指的就是來源那一段的**同一個檔**
 * ③ 別名表裡的來源格真的存在（打錯格名就紅）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => JSON.parse(readFileSync(join(REPO, p), "utf8"));
type Alias = { from: string; to: string; why: string };
const RAW = read("content/assets/audio/voices/lines/QUOTE_ALIAS.json").champions as Record<string, Alias | Alias[]>;
// ⭐ 一位可以有多筆（陣列）——攤平成 [id, 一筆] 逐筆驗
const ALIAS: [string, Alias][] = Object.entries(RAW).flatMap(([id, v]) => [v].flat().map((a) => [id, a] as [string, Alias]));
const PACK = read("content/assets/audio/voices/champions/MANIFEST.json").champions as Record<string, { lines: Record<string, { clip: string; aliasOf?: string }[]> }>;

describe("名言別名（QUOTE_ALIAS.json）", () => {
  it("每一位別名英雄的名言都指到自己那一段的同一個檔", () => {
    expect(ALIAS.length, "別名表空的 ⇒ 這條閘會空轉").toBeGreaterThan(0);
    for (const [id, a] of ALIAS) {
      const lines = PACK[id]?.lines;
      expect(lines, `${id} 不在出貨的語音清單裡`).toBeTruthy();
      expect(lines?.[a.from], `${id}：別名表說借「${a.from}」，但清單裡沒有這一格`).toBeTruthy();
      const target = lines?.[a.to];
      expect(target, `${id}：${a.to} 應該由 ${a.from} 借過來，清單裡卻沒有`).toBeTruthy();
      expect(target?.[0]?.clip, `${id}：${a.to} 指的檔要跟 ${a.from} 同一個`).toBe(lines?.[a.from]?.[0]?.clip);
      expect(target?.[0]?.aliasOf, `${id}：借來的那一格要標明是從哪一格借的`).toBe(a.from);
    }
  });

  it("每一筆別名都寫得出 owner 的理由", () => {
    for (const [id, a] of ALIAS) {
      expect(a.why, `${id} 的別名沒有理由 —— ⛔ 沒有出處的對應不可以出貨`).toMatch(/owner/);
    }
  });
});

/**
 * ⭐【每一份技能文件都說得出自己是階梯第幾層】—— 2026-08-13 事故的閘。
 *
 * owner 給了 70-002 樹海降臨的裁決，助手把它套到 70-00 的 w3x 遺留光環上，
 * 因為它讀了那支技能 JSON 裡**舊的** description。owner：
 *   「你不是有做一個最新版本的英雄的技能列表及說明(JSON & MD)? **怎麼會搞混呢?**」
 *
 * ⛔ 根因不是不小心：461 份文件的 29 個頂層欄位裡**沒有一個**說得出來源，
 *    而 owner 新版規格（90 支）與 w3x 匯入文案（371 支）長得一模一樣權威。
 *
 * ⚠️ `provenance` 在 Zod 上是 optional（fail-open，舊文件載得進來）——
 *    所以這一條是那個 fail-open 的**fail-loud 對照物**：
 *    「選擇 fail-open 的同時，必須有一個會回非零、或畫面上擋不掉的東西說出來」。
 *
 * ⛔ 這一條讀**磁碟上出貨的那 461 份**，不是掃原始碼字串（失敗形態⑥），
 *    也不是問 schema 有沒有這個欄位（失敗形態⑦：掃屬性代替掃行為）。
 *
 * 突變紀錄：把任何一份 ability 的 `provenance` 刪掉 → 第一條紅並指名那一份。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ABIL = join(REPO, "content", "abilities");
const GEN = join(REPO, "tools", "skill-remake", "batch1.py");
const CHAMPS = join(REPO, "content", "champions");

/**
 * ⭐ 這一份技能文件的**主人**在不在英雄目錄裡。
 *
 * ⚠️ 2026-08-23（GH#602）—— 註冊表裡出現了第一支**沒有主人**的技能：
 * 殭屍王的內建 [leap吸血]（`godie-zombieking.passive`）。它不是任何一位英雄的技能，
 * 所以 w3x 裡**根本沒有它的來源**：把它標成 `w3x-import` 是一句謊話，
 * 而那正是這整支守衛要消滅的東西（「兩份都長得像權威」）。
 *
 * ⭐ 判準是**推導**的（磁碟上查得到那張英雄卡就算有主人），⛔ 不是一張會腐爛的
 * id 白名單 —— 哪天 `godie-zombieking` 真的變成一位可選英雄，這一支就會自動回到
 * 上面那條 `prefixes` 的規則裡。
 */
function championHeads(): Set<string> {
  return new Set(
    readdirSync(CHAMPS)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => f.replace(/\.json$/, "")),
  );
}

interface Doc {
  readonly file: string;
  readonly provenance?: string;
}

function shipped(): Doc[] {
  return readdirSync(ABIL)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => ({
      file: f,
      ...(JSON.parse(readFileSync(join(ABIL, f), "utf8")) as { provenance?: string }),
    }));
}

/** `batch1.py` 的 HERO 對照表 —— ⛔ 不是手抄一份 id 清單（那會過期）。 */
function remadePrefixes(): Set<string> {
  const src = readFileSync(GEN, "utf8");
  const m = /^HERO\s*=\s*\{([\s\S]*?)^\}/m.exec(src);
  expect(m, "batch1.py 的 HERO 對照表找不到了 —— 它改形狀了，先看過再改這條測試").not.toBeNull();
  return new Set([...m![1]!.matchAll(/"(godie-[a-z0-9]+)"/g)].map((x) => x[1]!));
}

describe("技能文件的來源層級（owner 2026-08-13「怎麼會搞混呢?」）", () => {
  it("⭐ 每一份出貨技能都宣告 provenance —— ⛔ 沒有『不知道是哪一層』這個選項", () => {
    const docs = shipped();
    expect(docs.length, "母體要真的是整個出貨目錄").toBeGreaterThan(100);
    const missing = docs.filter((d) => d.provenance === undefined).map((d) => d.file);
    expect(
      missing,
      "這些技能文件說不出自己是階梯第幾層。⛔ 不要改這條測試，跑：\n" +
        "  python3 tools/skill-remake/stamp_provenance.py && pnpm content:build",
    ).toEqual([]);
  });

  it("⭐ owner 新版規格的那一批，恰好是產生器管的那一批", () => {
    // 承重的一半：如果有人手改一份 w3x 文件並把它標成 owner-spec，
    // 或者產生器多/少管了一支，這一條會紅 —— 而那正是「兩份都長得像權威」的復發。
    const prefixes = remadePrefixes();
    const champs = championHeads();
    const docs = shipped();
    const wrong = docs
      .filter((d) => {
        const head = d.file.replace(/\.json$/, "").split(".")[0]!;
        // 沒有主人 ⇒ 原創 ⇒ 只可能是 owner 的規格（w3x 裡沒有它的來源）。
        const want = prefixes.has(head) || !champs.has(head) ? "owner-spec" : "w3x-import";
        return d.provenance !== want;
      })
      .map((d) => `${d.file}: ${String(d.provenance)}`);
    expect(wrong, "provenance 與『這支歸不歸產生器管』對不上").toEqual([]);
    // ⛔ 驗機制不驗數字：這裡不釘「90 支」那個出貨值（owner 隨時會再重製一批），
    //    只釘「兩邊是同一個集合」。但兩邊都不可以是空的 —— 空集合會讓上面那條空轉。
    expect(docs.filter((d) => d.provenance === "owner-spec").length).toBeGreaterThan(0);
    expect(docs.filter((d) => d.provenance === "w3x-import").length).toBeGreaterThan(0);
  });
});

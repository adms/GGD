/**
 * 狀態標籤的「開放架構」閘 —— owner 2026-08-08:
 *
 *   「[狀態 tag] 應該要做成開放架構，tag 盡可能多不要共用」
 *
 * 那句話否決的是「同類壓成一個 tag」的做法（破魔與破甲共用 `shred`、致盲與詛咒
 * 共用 `miss`）：共用把「**這是什麼**」與「**它屬於哪一類**」擠進同一格，於是想精確
 * 問「他身上有沒有【破魔】」的人只查得到「所有破防」。開放架構是**兩個都給** ——
 * 每份狀態帶自己的專屬 tag，再加上所有適用的類別 tag。
 *
 * ⚠️ 這是一個**會腐爛的規格**：下一個人建狀態文件時只填一兩個類別 tag，
 * `hasStatusTag` 照樣跑、schema 照樣過、沒有任何東西會紅。CLAUDE.md 的元規則說
 * 判準沒用、閘才有用，所以這支把那句話變成三條會紅的斷言。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 驗什麼 —— 以及**為什麼不驗另外那兩個顯而易見的東西**
 *
 * ⛔ 不驗「每份至少 N 個 tag」：N 是一個沒有住處的數字（第零守則⑦），而且它答錯了
 *    問題 —— 一份填了 `["cc","hard-cc","debuff"]` 的文件數量達標卻仍然查不到自己，
 *    一份真的獨一無二的狀態填 1 個 tag 也完全正當。數量從來不是 owner 要的東西。
 * ⛔ 不驗「一張允許的 tag 清單」：那份清單會是繼 `content/status-effects/` 之後的
 *    第二個住處，而且它**與開放架構直接對立** —— 開放架構的意思就是新的類別 tag
 *    不必先跟誰報備。閘應該擋「查不到」與「打錯字」，不是擋「你發明了新類別」。
 *
 * 所以驗三件事，每一件都只從檔案本身推導，不抄任何清單：
 *
 *   1. 專屬 tag —— `tags` 必須包含**逐字等同 `id`** 的那一個。抓「只填了類別、
 *      沒填自己」。⭐ 為什麼是逐字 id 而不是某種推導規則：id 已經是這份文件唯一的
 *      handle，而且已經是小寫 kebab-case，任何「由 id 推導」的規則都是第二套約定，
 *      而第二套約定會漂。
 *   2. 形狀 —— 全部小寫 kebab-case。混用大小寫或底線不會壞掉，會**靜默查不到**
 *      （`hasStatusTag` 是逐字比對），那是最貴的一種壞。硬紅。
 *   3. 近似孤兒 —— 見下。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 孤兒 tag：報表還是閘？—— 兩個都要，切在「會不會誤報」上
 *
 * 「只有一份文件用的 tag」既可能是打錯字（`shred` 打成 `shread`），也可能是一個
 * 真的獨一無二的類別（`channel` / `combo` / `banked` 第一次出現的那一天）。
 * 把整類孤兒做成閘，第一個發明新類別的人就會被誤擋 —— 而**一個會誤報的閘會被關掉，
 * 那比沒有閘更糟**。把整類孤兒做成報表，又回到「一行沒有人讀的 log」。
 *
 * 所以切一刀：**孤兒 + 與另一個 tag 相距一個編輯距離 = 紅**，其餘孤兒 = 印出來給人看。
 * 打錯字必然落在紅的那一邊（你是想打那個既有的 tag 才會打成那樣），發明新類別必然
 * 落在報表那一邊（新類別跟既有的每一個都差很遠）。
 * 專屬 tag 天生只有一份文件在用，所以它們**不當候選** —— 否則每一份都會誤報。
 *
 * ⚠️ 兩個試出來的細節，都是模擬注入之後才發現的，寫下來免得有人「簡化」掉：
 *  · 比對的對手是**全部的 tag**，不是「≥2 份文件在用的既有 tag」。第一版寫成後者，
 *    結果注入 `shred`→`shread` **沒有紅** —— 因為破防只有兩份文件，打錯一份之後
 *    正確的那個也掉到 1，兩邊都不算「既有」。而在 owner 的「tag 盡可能多不要共用」
 *    之下，兩個成員的類別正是常態，所以那一版剛好在最該響的地方是啞的。
 *  · 只差數字的一族（`slow30` / `slow40`）要跳過。它們是正當的強度變體，不是打錯字，
 *    而且是這裡唯一一個會系統性誤報的形狀。
 *
 * 讀真實檔案（不是 bundle）：bundle 可能還沒 rebuild，而規格管的是來源檔。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "../../../..", "content", "status-effects");
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const docs = readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as { id: string; tags?: string[] })
  .map((d) => ({ id: d.id, tags: d.tags ?? [] }));

/** 用了這個 tag 的文件數。 */
const uses = new Map<string, number>();
for (const d of docs) for (const t of new Set(d.tags)) uses.set(t, (uses.get(t) ?? 0) + 1);

const digitless = (t: string): string => t.replace(/[0-9]/g, "");

/** 編輯距離 ≤ 1（替換／插入／刪除各一次）。 */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (l.length - s.length > 1) return false;
  let i = 0;
  let edits = 0;
  for (let j = 0; j < l.length && i < s.length; j++) {
    if (s[i] === l[j]) i++;
    else if (++edits > 1) return false;
    else if (s.length === l.length) i++;
  }
  return true;
}

describe("狀態 tag 的開放架構", () => {
  it("每份狀態都帶著等同自己 id 的專屬 tag", () => {
    const missing = docs.filter((d) => !d.tags.includes(d.id)).map((d) => d.id);
    expect(missing, `這些狀態只填了類別、查不到自己（tags 要含 "${missing[0] ?? ""}"）`).toEqual([]);
  });

  it("所有 tag 都是小寫 kebab-case（逐字比對，混寫會靜默查不到）", () => {
    const bad = docs.flatMap((d) => d.tags.filter((t) => !KEBAB.test(t)).map((t) => `${d.id}:${t}`));
    expect(bad).toEqual([]);
  });

  it("沒有跟別的 tag 只差一個字的孤兒 tag（打錯字）；其餘孤兒列出來給人看", () => {
    const all = [...uses.keys()];
    const orphans = all.filter((t) => uses.get(t) === 1 && !docs.some((d) => d.id === t));
    const flagged = new Set<string>();
    const pairs = new Set<string>();
    for (const o of orphans) {
      for (const e of all) {
        // 只差數字的一族（`slow30` / `slow40`）是正當變體，不是打錯字。
        if (e === o || digitless(e) === digitless(o) || !withinOneEdit(o, e)) continue;
        flagged.add(o);
        pairs.add([o, e].sort().join(" ≈ "));
      }
    }
    expect([...pairs], "疑似打錯字：孤兒 tag 與另一個 tag 只差一個字").toEqual([]);
    const fresh = orphans.filter((o) => !flagged.has(o));
    if (fresh.length > 0) console.info(`[status-tags] 目前獨一無二的類別 tag：${fresh.join(", ")}`);
  });
});

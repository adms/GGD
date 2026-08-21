/**
 * GH#497 —— 後台兩張英雄名單（🎭 英雄上下架 / 💰 免費名單）**每一列都要有名字**，
 * 變身態那幾列要有標註。
 *
 * ⛔ 這裡一個英雄 id、一個數字都沒有寫死：名單讀出貨的 `content/config/*.json`，
 * 名字與 `transform.role` 讀 `content/champions/` ＋ `content/_legacy/champions/`
 * （走出貨的 `rowFromDoc`，⛔ 不是另一份解析器）。owner 改名單、內容側新增變身英雄，
 * 這條守衛都跟著動。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { rowFromDoc } from "./content";
import type { ContentRow } from "./curation";
import { buildChampionLabelIndex, championFormNote, championLabelText, championLabelsFor } from "./championLabels";

const ROOT = join(__dirname, "../../..");
const read = (p: string): unknown => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const rowsIn = (dir: string): ContentRow[] =>
  readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => rowFromDoc(f.replace(/\.json$/, ""), read(`${dir}/${f}`)));

const INDEX = buildChampionLabelIndex(rowsIn("content/champions"), rowsIn("content/_legacy/champions"));

/** 出貨的三張名單，逐張從 config 推導 —— ⛔ 不抄 id。 */
const roster = read("content/config/roster.json") as { retiredChampions: string[]; hiddenChampions?: string[] };
const store = read("content/config/store.json") as { freeChampionIds: string[] };
const LISTS: readonly (readonly [string, readonly string[]])[] = [
  ["下架名單", roster.retiredChampions],
  ["隱藏名單", roster.hiddenChampions ?? []],
  ["免費名單", store.freeChampionIds],
];

describe("#497 後台英雄名單：id 旁邊有名字，變身態有標註", () => {
  for (const [list, ids] of LISTS) {
    it(`${list}的每一列都印得出英雄名稱`, () => {
      expect(ids.length, `${list}是空的 —— 這條守衛就驗不到任何東西了`).toBeGreaterThan(0);
      for (const l of championLabelsFor(INDEX, ids)) {
        expect(l.known, `${list} 的 ${l.id} 兩棵樹裡都沒有 doc`).toBe(true);
        expect(l.name, `${list} 的 ${l.id} 只印得出 id，owner 說「看不出來是誰」`).not.toBe("");
        expect(championLabelText(l)).toContain(l.name);
      }
    });
  }

  it("變身態一定帶著「[變身態 ← 本體 id]」，⛔ 不是靠一張手寫名單", () => {
    const alternates = [...INDEX.values()].filter((l) => l.alternate);
    expect(alternates.length, "一個變身態都沒有？那 transform.role 讀錯了").toBeGreaterThan(0);
    for (const l of alternates) {
      expect(championFormNote(l), `${l.id} 沒有被標成變身態`).toContain("變身態");
      if (l.counterpartId) expect(championFormNote(l)).toContain(l.counterpartId);
    }
  });

  it("⭐ 同名的成對英雄，光看「名字＋標註」就分得出來（只加名字是不夠的）", () => {
    const byName = new Map<string, string[]>();
    for (const l of INDEX.values()) {
      if (l.name !== "") byName.set(l.name, [...(byName.get(l.name) ?? []), l.id]);
    }
    const collisions = [...byName.values()].filter((ids) => ids.length > 1);
    expect(collisions.length, "沒有同名的兩張卡？那這條守衛的前提消失了").toBeGreaterThan(0);
    for (const ids of collisions) {
      // ⛔ 刻意不含 id：id 一定不同，把它算進去這條斷言對壞掉的實作也會過（形態④）。
      const seen = championLabelsFor(INDEX, ids).map((l) => l.name + championFormNote(l));
      expect(new Set(seen).size, `這幾張卡在名單上長得一模一樣：${ids.join(" / ")}`).toBe(ids.length);
    }
  });

  it("兩頁都真的把這份清單畫出來（拿掉接線 = 功能消失）", () => {
    for (const page of ["RosterPage", "StoreEconomyPage"]) {
      const src = readFileSync(join(__dirname, `ui/${page}.tsx`), "utf8");
      expect(src, `${page} 沒有畫 ChampionIdList`).toContain("<ChampionIdList");
      expect(src).toContain("useChampionLabelIndex(");
    }
  });
});

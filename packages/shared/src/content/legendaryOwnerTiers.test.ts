/**
 * GH#470 —— owner 的**上架寶具階級表**與三張抽獎池對帳。
 *
 * owner 2026-08-18（M51）：「我重新給你上架開放的寶具列表，你核對看看有哪些落差，
 * **並且作為預設**」。那份清單是**規格**；三張 `content/loot-tables/*.json` 是它
 * 被翻成資料的樣子。⛔ 在這條之前**沒有任何東西**在比這兩者 —— 所以 2026-08-20
 * 才會靠人眼撈出「晨曦之光 `godie-i016` owner 標 EX、實際在 `ex-release-weapons`」。
 *
 * ⭐ ① 基準線是 **owner 的訊息**，⛔ 不是從 loot table 反推的（反推的基準線對任何
 * 漂移都是綠的，失敗形態⑤）。② 斷言「這件**實際**落在哪一張池」，由三張池反查，
 * ⛔ 不是數筆數也不是比對 note 那句字。⚠️ 刻意不寫死任何筆數 —— 讀 fixture。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");

interface OwnerTiers {
  _tierPools: Record<string, string>;
  items: Record<string, string>;
}

const owner = JSON.parse(
  readFileSync(join(HERE, "__fixtures__/legendaryOwnerTiers.json"), "utf8"),
) as OwnerTiers;

/** 道具名 → id。名字是 owner 表的 join key（他寫的是名字不是 rawcode）。 */
function itemIdsByName(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of readdirSync(join(CONTENT, "items"))) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(CONTENT, "items", f), "utf8")) as {
      id: string;
      name?: string;
    };
    if (!doc.name) continue;
    out.set(doc.name, [...(out.get(doc.name) ?? []), doc.id]);
  }
  return out;
}

/** itemId → 它實際住在哪一張 loot table（三張全掃，所以「兩個池都有」也會被抓到）。 */
function poolByItemId(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of readdirSync(join(CONTENT, "loot-tables"))) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(CONTENT, "loot-tables", f), "utf8")) as {
      id: string;
      entries: { itemId: string }[];
    };
    for (const e of doc.entries) out.set(e.itemId, [...(out.get(e.itemId) ?? []), doc.id]);
  }
  return out;
}

describe("owner 的上架寶具階級表 ↔ 抽獎池（GH#470）", () => {
  it("每一件都在 owner 標的那一階，而且只在一張池裡", () => {
    const byName = itemIdsByName();
    const byId = poolByItemId();
    const drift: string[] = [];

    for (const [name, tier] of Object.entries(owner.items)) {
      const ids = byName.get(name);
      if (!ids || ids.length !== 1) {
        drift.push(`${name}｜owner 標 ${tier}｜content/items 找到 ${ids?.length ?? 0} 份同名文件`);
        continue;
      }
      const id = ids[0]!;
      const want = owner._tierPools[tier];
      expect(want, `fixture 的 _tierPools 少了 "${tier}" 這一階`).toBeTruthy();
      const pools = byId.get(id) ?? [];
      if (pools.length !== 1 || pools[0] !== want) {
        drift.push(`${name} ${id}｜owner 標 ${tier}（=${want}）｜實際在 [${pools.join(", ") || "沒有任何池"}]`);
      }
    }

    expect(
      drift,
      `owner 的階級表與抽獎池對不上。⛔ 不要改 fixture —— 它是 owner 的訊息。\n` +
        drift.map((d) => `  · ${d}`).join("\n"),
    ).toEqual([]);
  });
});

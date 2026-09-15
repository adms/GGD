/**
 * ⭐ GH#1227 —— 上架名單**逐群**對得上 owner 的範圍，而且卡與宣告**兩個方向**都對得上（涵蓋 content/_legacy）。
 *
 * 邏輯住 `packages/shared/testkit/rosterDeclaration.ts`（`pnpm roster:check` 也呼叫它）；
 * 宣告住 `tools/roster-guard/batch-declaration.json`。⛔ 這裡不寫任何 id 或人數。
 *
 * ⭐ 量尺自證（兩個方向）：先證明出貨的世界是綠的，再在**記憶體裡**把世界改壞，
 *    證明每一個方向都會紅 —— ⛔ 一把只驗過單邊的尺，會在它最需要說話的時候沉默。
 */
import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRosterDeclaration, loadRosterWorld, type RosterWorld } from "../../testkit/rosterDeclaration";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const world = loadRosterWorld(ROOT);
const report = (w: RosterWorld) => checkRosterDeclaration(w).map((f) => `✗ ${f.pair}\n   ${f.detail}\n   → ${f.fix}`);

describe("上架名單逐群宣告 ↔ 權威文件 ↔ starterChampions ↔ 兩棵樹的卡（GH#1227）", () => {
  it("⭐ 出貨的宣告、名單、126 名文件與兩棵樹逐群逐名對得上", () => {
    expect(report(world), "⛔ 不要改這條測試 —— 訊息指名了該改哪一份").toEqual([]);
  });

  it("⛔ 任何一批的宣告人數改成 0 ⇒ 紅（⛔ 總數不變也要紅）", () => {
    for (const b of world.declaration.batches) {
      const batches = world.declaration.batches.map((x) => (x === b ? { ...x, expected: 0 } : x));
      const out = report({ ...world, declaration: { ...world.declaration, batches } });
      expect(out.join("\n"), b.section).toContain(b.section);
    }
  });

  it("⛔ 一批的 starter 宣告翻面 ⇒ 紅（組成錯了）", () => {
    const [b] = world.declaration.batches;
    const flipped = { ...b!, starter: b!.starter === "all" ? ("none" as const) : ("all" as const) };
    const batches = [flipped, ...world.declaration.batches.slice(1)];
    expect(report({ ...world, declaration: { ...world.declaration, batches } }).join("\n")).toContain("starterChampions");
  });

  it("⛔ 卡 → 宣告：退休區多一張沒人宣告的卡 ⇒ 紅並指名", () => {
    const cards = new Map(world.cards).set("sentinel-orphan", { tree: "content/_legacy/champions", base: null });
    expect(report({ ...world, cards }).join("\n")).toContain("sentinel-orphan");
  });

  it("⛔ 宣告 → 卡：回收桶／待重上架名單上的人沒有卡，或豁免被拿掉 ⇒ 紅並指名", () => {
    const [unlisted] = world.declaration.legacyUnlisted.ids;
    const cards = new Map(world.cards);
    cards.delete(unlisted!);
    expect(report({ ...world, cards }).join("\n")).toContain(unlisted!);
    for (const { id } of world.declaration.missingCardExemptions) {
      const bare = { ...world.declaration, missingCardExemptions: [] };
      expect(report({ ...world, declaration: bare }).join("\n")).toContain(id);
    }
  });
});

/**
 * ⭐ GH#1227 —— 上架名單**逐群**對得上 owner 的範圍，而且退休卡與宣告**兩個方向**都對得上。
 *
 * 邏輯住 `packages/shared/testkit/rosterDeclaration.ts`（`pnpm roster:check` 也呼叫它）；
 * 宣告住 `tools/roster-guard/batch-declaration.json`；退休卡狀態讀 `docs/legacy-index-champions.json`
 * （build_index.py 的產物，過期由 legacyIndexFresh.test.ts 紅）。⛔ 這裡不寫任何 id 或人數。
 *
 * ⭐ 量尺自證（兩個方向）：先證明出貨的世界是綠的，再在**記憶體裡**把世界改壞，證明每一個方向都會紅。
 */
import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRosterDeclaration, loadRosterWorld, type RosterWorld } from "../../testkit/rosterDeclaration";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const world = loadRosterWorld(ROOT);
const report = (w: RosterWorld) => checkRosterDeclaration(w).map((f) => `✗ ${f.pair}\n   ${f.detail}\n   → ${f.fix}`);
const withBatches = (batches: RosterWorld["declaration"]["batches"]): RosterWorld => ({
  ...world,
  declaration: { ...world.declaration, batches },
});

describe("上架名單逐群宣告 ↔ 權威文件 ↔ starterChampions ↔ 退休卡（GH#1227）", () => {
  it("⭐ 出貨的宣告、名單、126 名文件與退休卡狀態逐群逐名對得上", () => {
    expect(report(world), "⛔ 不要改這條測試 —— 訊息指名了該改哪一份").toEqual([]);
  });

  it("⛔ 任何一批的宣告人數改成 0 ⇒ 紅；最後一批改成 owner 的合計數 ⇒ 「owner 原話」那一對也要紅", () => {
    const bs = world.declaration.batches;
    for (const b of bs) {
      expect(report(withBatches(bs.map((x) => (x === b ? { ...x, expected: 0 } : x)))).join("\n"), b.section).toContain(b.section);
    }
    const last = bs[bs.length - 1]!;
    const total = bs.reduce((n, b) => n + b.expected, 0);
    const out = report(withBatches(bs.map((x) => (x === last ? { ...x, expected: total } : x)))).join("\n");
    expect(out, "⛔ 同一行的「合計」不可以替這一項作證").toContain("宣告人數 ↔ owner 原話");
  });

  it("⭐ 單一名先上架：宣告 none ⇒ 紅且修法指向 partial；宣告 partial ⇒ 綠", () => {
    const bs = world.declaration.batches;
    // ⭐⭐ GH#1281（2026-09-17）—— 夾具原本去**出貨宣告**裡找一個 `starter:"none"` 的群。
    //   第四批 37 名上架之後（owner 2026-09-16「全部英雄上架是預設的」）出貨宣告裡
    //   ⛔ 一個 `none` 都沒有了 ⇒ `find` 回 undefined ⇒ 這一條當場 TypeError。
    //   ⭐ 而它要驗的是**規則**（宣告 none 卻有人上架 ⇒ 紅、改 partial ⇒ 綠），
    //   ⛔ 不是「出貨資料裡剛好有這種群」—— 所以夾具自己造一個，⛔ 不再依賴出貨狀態。
    const base = bs.find((x) => (world.batchDoc.get(x.section)?.length ?? 0) > 1)!;
    const b = { ...base, starter: "none" as const };
    const withNone = bs.map((x) => (x === base ? b : x));
    // ⭐ 夾具的語意是「**這一群只有一名先上架**」⇒ 其餘成員要從 starter 拿掉，
    //   ⛔ 否則規則答的是另一格（「整批都在 starterChampions」）——那是對的答案、錯的題目。
    const members = world.batchDoc.get(b.section)!;
    const one = members[0]!;
    const w = {
      ...world,
      starter: [...world.starter.filter((id) => !members.includes(id)), one],
      declaration: { ...world.declaration, batches: withNone },
    };
    const none = checkRosterDeclaration(w).find((f) => f.pair === "逐群宣告 ↔ starterChampions");
    expect(none?.detail).toContain(one);
    expect(none?.fix).toContain('"partial"');
    const partial = withNone.map((x) => (x === b ? { ...x, starter: "partial" as const } : x));
    expect(report({ ...w, declaration: { ...w.declaration, batches: partial } })).toEqual([]);
  });

  it("⛔ 卡 → 宣告：退休區多一張「從未開放」而沒人宣告的卡 ⇒ 紅並指名", () => {
    const cards = [...world.legacy.cards, { id: "sentinel-orphan", base: null, status: "never" }];
    expect(report({ ...world, legacy: { ...world.legacy, cards } }).join("\n")).toContain("sentinel-orphan");
  });

  it("⛔ 宣告 → 卡：宣告的本體沒有退休卡、宣告了變身態，或豁免被拿掉 ⇒ 紅並指名", () => {
    const [declared] = world.declaration.legacyNeverOpened.ids;
    const gone = world.legacy.cards.filter((c) => c.id !== declared);
    expect(report({ ...world, legacy: { ...world.legacy, cards: gone } }).join("\n")).toContain(declared!);
    const alt = world.legacy.cards.find((c) => c.base !== null && c.status === "never")!;
    const ids = [...world.declaration.legacyNeverOpened.ids, alt.id];
    expect(report({ ...world, declaration: { ...world.declaration, legacyNeverOpened: { ids } } }).join("\n")).toContain(alt.id);
    for (const { id } of world.declaration.missingCardExemptions) {
      expect(report({ ...world, declaration: { ...world.declaration, missingCardExemptions: [] } }).join("\n")).toContain(id);
    }
  });
});

/**
 * placement —— **擺放數不是宣稱，是一條會紅的線**（GH#386 ①）。
 *
 * 每一條 per-import gate 的 warn/limit 都是「場景額度 ÷ `simultaneous`」。所以
 * `simultaneous` 本身錯了的時候，四個軸**全部**跟著錯，而報告頁會很有自信地印出
 * 那四個錯的數字 —— 沒有任何東西會紅。實際發生過兩次：
 *   · `arena-decor` 的「godie 放了 50 棵」在 GH#362 加進散佈規則之後變成 78，
 *     而那句話原封不動留在 `limits.ts` 裡；
 *   · GH#386 給 `arena-decor-cc0` 的除數 10 —— 一個**還沒有人違反過**的假設。
 *
 * 這條守衛把兩者變成同一件事：逐張 arena 數出「同一個模型被擺了幾份」（手擺的
 * `decor[]` + 散佈規則展開的 `count × 分區數`），跟它那條 gate 宣告的
 * `simultaneous` 比。⛔ 它不驗顏色、不驗座標、不驗任何數值調整。
 *
 * 突變紀錄（2026-08-19）：`arena-decor-cc0.simultaneous` 10 → 5 ⇒ 紅
 * （colosseum 8 份 TempleColumn_Art、castle 6 份 TempleWall01_Art）。
 *
 * ⛔ 它紅了不要改這個檔案：要嘛少擺幾件，要嘛把 gate 的 `simultaneous` **連同
 * warn/limit 一起**重新推導（那是一個決定，不是一次改數字）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { GATES } from "./limits";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ARENAS = path.join(ROOT, "content/arenas");

/** 同一份成員判準：先看 `pathPrefix`，沒有命中的擺設一律是 `arena-decor`。 */
const gateFor = (model: string): (typeof GATES)[number] =>
  GATES.find((g) => g.pathPrefix && model.startsWith(g.pathPrefix)) ??
  GATES.find((g) => g.role === "arena-decor")!;

interface Placement {
  arena: string;
  model: string;
  count: number;
}

/** 逐張 arena 數出每個模型的擺放數。⚠️ 散佈規則是**每個分區** count 件。 */
function placements(): Placement[] {
  const out: Placement[] = [];
  for (const f of fs.readdirSync(ARENAS).filter((n) => n.startsWith("arena.") && n.endsWith(".json"))) {
    const doc = JSON.parse(fs.readFileSync(path.join(ARENAS, f), "utf8"));
    const per = new Map<string, number>();
    const bump = (m: string, n: number): void => {
      per.set(m, (per.get(m) ?? 0) + n);
    };
    for (const d of doc.decor ?? []) bump(d.model, 1);
    for (const r of doc.scenery?.props ?? []) bump(r.model, r.count * (doc.zones?.length ?? 1));
    for (const [model, count] of per) out.push({ arena: doc.id, model, count });
  }
  return out;
}

describe("擺放數 —— gate 的除數是量到的，不是寫在註解裡的", () => {
  it("★ 沒有任何一張 arena 擺的份數超過那條 gate 宣告的 simultaneous", () => {
    const rows = placements();
    expect(rows.length, "一張 arena 都沒讀到 —— 這條守衛在測空氣").toBeGreaterThan(20);
    const over = rows
      .filter((r) => r.count > gateFor(r.model).simultaneous)
      .map((r) => `${r.arena} 擺了 ${r.count} 份 ${r.model}（${gateFor(r.model).role} 的上限是 ${gateFor(r.model).simultaneous}）`);
    expect(over, "擺放數超過 gate 的假設 ⇒ 那條 gate 的 warn/limit 是用錯的除數算的").toEqual([]);
  });
});

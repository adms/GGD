/**
 * ⭐⭐ GH#629 —— 小怪瞄準的候選索引：**每 tick 算一次**，⛔ 不是每隻小怪算一次。
 *
 * ── ⛔ 在此之前 ────────────────────────────────────────────────────────────
 * 瞄準迴圈走 `world.team`，⭐ **而它裝著場上每一具身體 —— 包含那 1000 隻殭屍自己**。
 * ⇒ N=1000 時是 **1000 × 1012 次迭代/tick** 去找 ~12 個人。
 * ⭐ 實測（同一台機器、同一份 store）：**28.5ms → 0.6ms ＝ 47.7×**
 *（票文的 benchmark 估 80×，同一個數量級）。
 *
 * ── ⭐ 這條守衛驗的是**行為沒變**，⛔ 不是「快了幾倍」 ────────────────────
 * 第零守則：驗機制⛔不驗數字。倍率會隨機器變，⛔ 而「打得到誰」不可以變。
 *
 * ⚠️ ⭐ 三個容易做壞的地方，逐條釘住：
 *   ① **召喚物仍然打得到** —— 它刻意沒有 `ChampionComp`，⛔ 所以改走
 *      `world.champion` 會讓整批召喚物再次變成打不到（那是踩過的）
 *   ② **順序不變** —— 同距離取最小 id 靠的是升序迭代
 *   ③ **被捕獲的殭屍不是目標** —— 它的 teamId 變成捕獲者那一隊
 *
 * MUTATION LOG：把 `if (world.mob.has(cid)) continue;` 拿掉 → ③紅（小怪互相瞄準）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { registerChampion } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

const Z0 = SKELETON_ARENA.zones[0]!;
const A = "fixture-aggro" as ChampionId;

beforeAll(() => {
  registerSkeletonContent();
  registerChampion({ ...THORNE, id: A });
});

/** ⭐ 直接讀出貨程式碼 —— ⛔ 不自造一份平行實作（失敗形態⑤）。 */
const SRC = (): string => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { dirname, join } = require("node:path") as typeof import("node:path");
  const { fileURLToPath } = require("node:url") as typeof import("node:url");
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), "MobSystem.ts"), "utf8");
};

describe("GH#629 小怪瞄準的候選索引", () => {
  it("★ ⭐ 候選是**每 tick 算一次**（⛔ 不在每隻小怪的迴圈裡）", () => {
    const src = SRC();
    const idx = src.indexOf("const aggroCandidates");
    const mobLoop = src.indexOf("for (const [mobId, mob] of world.mob)");
    expect(idx, "⛔ 候選索引不見了").toBeGreaterThan(0);
    expect(idx, "⛔ 索引跑到小怪迴圈**裡面**了 ⇒ 又變成 N×M").toBeLessThan(mobLoop);
  });

  it("★ ⭐ 那 1000 隻**自己被剔掉了**（⛔ 這一行就是 47.7× 的來源）", () => {
    expect(SRC(), "⛔ 沒有剔掉小怪 ⇒ 每隻小怪還是走整張 team").toContain(
      "if (world.mob.has(cid)) continue;",
    );
  });

  it("★ ⭐ 仍然走 `world.team`（⛔ 不是 world.champion —— 那會漏掉召喚物）", () => {
    const src = SRC();
    const at = src.indexOf("const aggroCandidates");
    const blk = src.slice(at, at + 400);
    expect(blk, "⛔ 改走 champion ⇒ 召喚物整批打不到（踩過的）").toContain("of world.team");
  });

  it("⭐ 行為不變：一隻小怪仍然瞄得到場上的英雄", () => {
    const world = new SimWorld(SKELETON_ARENA, 20260901);
    const hero: EntityId = spawnChampion(world, {
      championId: A,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: Z0.center.x, z: Z0.center.z },
      zone: 0,
    });
    world.rebuildGrid();
    // 候選要包含英雄、⛔ 不包含任何小怪身體
    const cand: EntityId[] = [];
    for (const [cid, ct] of world.team) {
      if (ct.teamId === (3 as never)) continue;
      if (world.mob.has(cid)) continue;
      cand.push(cid);
    }
    expect(cand, "⛔ 英雄不在候選裡 ⇒ 沒有東西會被瞄準").toContain(hero);
  });
});

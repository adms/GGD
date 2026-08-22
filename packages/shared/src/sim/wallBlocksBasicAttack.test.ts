/**
 * ⭐【牆擋普攻，**不擋技能**】—— GH#324 A4 的承重守衛。
 *
 * owner 2026-08-14 逐字：「**擋普攻 不然會風箏到死 但不擋技能**」
 *
 * ⚠️ ⭐ **這道閘從 2026-08-23 起出貨是關著的**（`sim/vision.ts` 的
 * `wallBlocksBasicAttack`，owner 同日改判「全視野⋯我卻看不到也**打不到**」）。
 * 下面驗的是 `hasLineOfSight` 這條**幾何規則**本身 —— 它在閘打開時仍然是
 * 普攻讀的那一份，所以這幾條照樣是承重的：後台把那一格翻回 `true`，
 * GH#324 的行為就是這裡寫的樣子。⛔ 只有最後那一條（技能不穿這條路）
 * 與開關無關，它永遠成立。
 *
 * ⚠️ 這條**兩個方向一起讀**（失敗形態④：斷言方向跟缺陷無關）。
 * 只驗「擋得住」的話，一個把普攻與技能**全部**擋掉的實作也會過 ——
 * 而那正好是 owner 明確否決的那一半。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { hasLineOfSight } from "./map/lineOfSight";
import type { Obstacle } from "./world/ArenaDef";

/** 一面擋在中間的牆（graybox 的盒）。 */
const WALL: Obstacle = { kind: "box", center: { x: 0, z: 0 }, halfW: 4, halfD: 0.5 };

describe("牆擋普攻不擋技能（GH#324 A4）", () => {
  it("⭐ 牆兩側：普攻的視線斷掉", () => {
    cover("map-los-basic-attack");
    const a = { x: 0, z: -3 };
    const b = { x: 0, z: 3 };
    expect(hasLineOfSight(a, b, [WALL]), "一面實心牆擋在中間，普攻不該看得到").toBe(false);
  });

  it("⭐ 同一組位置：**沒有**牆時看得到 —— 證明上一條不是恆假", () => {
    cover("map-los-basic-attack");
    expect(hasLineOfSight({ x: 0, z: -3 }, { x: 0, z: 3 }, [])).toBe(true);
  });

  it("⭐ 繞過牆的兩端仍然看得到 —— 證明擋的是牆本身，不是「有牆就全擋」", () => {
    cover("map-los-basic-attack");
    // 兩人都在牆的同一側，連線不穿過牆
    expect(hasLineOfSight({ x: -6, z: -3 }, { x: 6, z: -3 }, [WALL])).toBe(true);
  });

  it("⛔ 貼著柱子站的人打得到旁邊的人 —— 掠過餘裕", () => {
    cover("map-los-basic-attack");
    // 實測逼出來的：身體被 pushOutOfObstacle 頂在柱面上，距離剛好等於半徑。
    // 沒有餘裕的話這條射線在數值上「擦到」柱子，他連 1.2 單位外的敵人都打不到。
    const pillar: Obstacle = { kind: "circle", center: { x: 0, z: 0 }, radius: 1.8 };
    const me = { x: 1.8, z: 0 };
    expect(hasLineOfSight(me, { x: 3.0, z: 0 }, [pillar])).toBe(true);
  });

  it("⛔ 技能不呼叫這條路 —— 投射物系統一個字都沒動（原始碼層）", async () => {
    cover("map-los-basic-attack");
    // ⚠️ 這一條是**故意**掃原始碼的（一般來說掃字串不算守衛）。
    // 理由：要證明的是「某件事**沒有**發生」，而行為測試證明不了不存在。
    // 一旦有人把視線接進投射物，這裡會紅並逼他回來讀 owner 的裁決。
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const p = fileURLToPath(new URL("./systems/ProjectileSystem.ts", import.meta.url));
    const src = readFileSync(p, "utf8");
    expect(
      src.includes("hasLineOfSight"),
      "投射物系統引用了視線檢查 —— owner 2026-08-14 的裁決是「不擋技能」。" +
        "要改這個決定請先回去問他，⛔ 不要改這條測試。",
    ).toBe(false);
  });
});

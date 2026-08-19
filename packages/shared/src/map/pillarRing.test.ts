/**
 * ⭐【出貨的柱環**真的是**那五個參數算出來的】—— GH#409。
 *
 * 沒有這一條，`pillarRing.ts` 只是一支「長得很像」出貨資料的函式 ——
 * 而 #409 的整個重點是「owner 改一列參數就能換一個配置」。
 * 只要這兩者有一格對不上，那句話就是假的（第三守則）。
 *
 * ⛔ 這一條**不驗**通道餘裕／掩體覆蓋率那些數字：它們是 owner 的取捨，
 * 而且量測腳本每次跑都會給同一組答案 —— 抄進斷言就是第四個住處（第零守則）。
 *
 * 突變紀錄：把 `COLOSSEUM_PILLAR_RING.endRadius` 改成 2 → 紅，
 * 訊息指名 `arena.colosseum z0` 少了一根 `(21, 0) r=1`。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COLOSSEUM_PILLAR_RING, pillarRing } from "./pillarRing";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

interface Circle {
  kind: string;
  center: { x: number; z: number };
  radius: number;
}

it("⭐ arena.colosseum 每一區的柱環都逐筆等於 pillarRing(COLOSSEUM_PILLAR_RING)", () => {
  const doc = JSON.parse(
    readFileSync(join(ROOT, "content/arenas/arena.colosseum.json"), "utf8"),
  ) as { zones: { center: { x: number; z: number }; obstacles: Circle[] }[] };
  const want = pillarRing(COLOSSEUM_PILLAR_RING);
  expect(doc.zones.length, "掃不到分區 —— 這條守衛等於沒跑").toBeGreaterThan(0);

  for (let z = 0; z < doc.zones.length; z++) {
    const { center, obstacles } = doc.zones[z]!;
    // 出貨檔是世界座標；柱環參數是相對座標。⛔ 不比順序（環柱與裝飾物混在同一個陣列）。
    const have = new Set(
      obstacles.map(
        (o) => `${(o.center.x - center.x).toFixed(2)},${(o.center.z - center.z).toFixed(2)},${o.radius}`,
      ),
    );
    const missing = want
      .map((p) => `${p.center.x.toFixed(2)},${p.center.z.toFixed(2)},${p.radius}`)
      .filter((k) => !have.has(k));
    expect(
      missing,
      `arena.colosseum z${z}：出貨檔裡找不到這幾根柱子 —— ` +
        `COLOSSEUM_PILLAR_RING 與 content/arenas/arena.colosseum.json 已經對不上`,
    ).toEqual([]);
  }
});

/**
 * ⭐【每一張出貨場地的每一個出生點都不是一個死刑座位】—— GH#364。
 *
 * owner 2026-08-18 附圖：英雄站在窄走道上，旁邊就是圖外，火圈在收，只能等死。
 *
 * ⚠️ 這一條驗的是**機制**（站得住 · 點燃時安全 · 走得到口袋），⛔ 不是數字
 * （0.6 與 4 都從出貨來源讀，owner 隨時可以改）。
 *
 * ⛔ 刻意讀 `content/arenas/*.json` 而不是捏夾具：**新圖上線會自動被納入**，
 * 而這才是這條守衛真正的價值 —— 它守的是下一張圖。
 *
 * 突變紀錄（2026-08-18）：把 `checkZoneSpawns` 裡那一輪泛洪的種子條件
 * `fireRingSafeAt(zone, p, body, pocketRadius)` 改成 `true`（＝整張圖都當口袋），
 * 「走得到口袋」那一條對任何資料都會過 → 下面第二個 `it` 的人工壞資料不再紅。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAMPION_BODY_RADIUS } from "../content/displacementTiers";
import { DEFAULT_STAGE1_RADIUS } from "../sim/fireRing";
import type { ZoneDef } from "../sim/world/ArenaDef";
import { checkZoneSpawns, formatSpawnIssue, type SpawnLegalityOpts } from "./arenaSpawnLegality";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 出貨的火圈口袋半徑 —— ⛔ 不抄 4，owner 改 config 這裡就跟著改。 */
function shippedOpts(): SpawnLegalityOpts {
  const cfg = JSON.parse(readFileSync(join(ROOT, "content/config/config.match.json"), "utf8")) as {
    match?: { fireRing?: { stage1Radius?: number } };
  };
  return {
    bodyRadius: CHAMPION_BODY_RADIUS,
    pocketRadius: cfg.match?.fireRing?.stage1Radius ?? DEFAULT_STAGE1_RADIUS,
  };
}

/** 每一張**出貨**場地。⛔ 不是一份手打清單。 */
function shippedZones(): { arenaId: string; zone: ZoneDef & { id: string } }[] {
  const dir = join(ROOT, "content/arenas");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .flatMap((f) => {
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
        id: string;
        zones: (ZoneDef & { id: string })[];
      };
      return doc.zones.map((zone) => ({ arenaId: doc.id, zone }));
    });
}

describe("出生點合法性 · 每一張出貨場地 (GH#364)", () => {
  it("⭐ 沒有任何座位站在牆裡／圖外，點燃時全部在圈內，而且都走得到火圈的口袋", () => {
    const opts = shippedOpts();
    const zones = shippedZones();
    expect(zones.length).toBeGreaterThan(0); // 讀不到內容就不算綠
    const issues = zones.flatMap(({ arenaId, zone }) => checkZoneSpawns(arenaId, zone, opts));
    expect(issues.map(formatSpawnIssue)).toEqual([]);
  });

  it("壞掉的圖必須紅，⭐ 而且**每一個座位各自**被指名（⛔ 不是「有人紅就算過」）", () => {
    const opts = shippedOpts();
    // 一面貫穿上下的牆，把 x > 12 那一塊和中央的口袋整個切開。
    const wall = { kind: "box" as const, center: { x: 10, z: 0 }, halfW: 2, halfD: 20 };
    const zone = {
      id: "broken",
      center: { x: 0, z: 0 },
      boundaryRadius: 30,
      bounds: { kind: "rect" as const, halfW: 24, halfD: 18 },
      obstacles: [wall],
      spawns: [
        // 牆裡 · 乾淨
        [{ x: 10, z: 0 }, { x: 0, z: 3 }],
        // 牆的另一側（走不到口袋，但站得住）· 身體超出圖外
        [{ x: 20, z: 0 }, { x: 23.7, z: 0 }],
      ],
    } as unknown as ZoneDef & { id: string };
    const issues = checkZoneSpawns("arena.broken", zone, opts);
    const of = (side: number, slot: number): string[] =>
      issues.filter((i) => i.side === side && i.slot === slot).map((i) => i.check).sort();

    expect(of(0, 0)).toEqual(["pocketUnreachable", "spawnInsideObstacle"]);
    expect(of(0, 1)).toEqual([]); // 乾淨的座位⛔ 不可以被誤報
    // ⭐ 這一條就是「注定被燒死」：站得住、在圖內、點燃時安全 —— 但走不到口袋。
    expect(of(1, 0)).toEqual(["pocketUnreachable"]);
    // 身體伸出圖外的那 0.3 個單位，同時就是「火圈點燃時已經在圈外」。
    expect(of(1, 1)).toEqual(["bodyOutsideBounds", "burningAtIgnition", "pocketUnreachable"]);
  });
});

/**
 * ⭐【殭屍波在**每一張出貨場地**都真的生得出來】—— owner 2026-08-15：
 * 「新的七個場地好像沒有殭屍波」。
 *
 * ⚠️ 這個檔存在的理由是**失敗形態⑤：被測的不是出貨的那個**。
 * 這個 repo 有 20+ 支殭屍測試，而它們**全部**跑 `SKELETON_ARENA` —— 一個寫死在
 * 程式裡的圓形場地。GH#324 的七張新圖是 `bounds.kind === "rect"` 的房間，
 * 走的是 `pointOnBoundary` 完全不同的一條分支（矩形周長參數化 vs 單位圓查表），
 * 而**那條分支一次都沒有被出貨資料跑過**。
 *
 * ⛔ 所以這裡刻意讀 `content/arenas/*.json`，不是自己捏一個 rect 夾具 ——
 * 捏一個就變成第二個住處，而且新圖上線時不會有人記得補。
 *
 * 這一條驗的是**機制**（生得出來、在界內、避得開障礙），⛔ 不是數字
 * （「15 隻」是 `maxAlivePerZone`，它住在三個住處而且 owner 每週在改）。
 *
 * 突變紀錄：把 `mobs.ts` spawn 那一段的 `pointOnBoundary(zoneDef, …)` 換回
 * 只走圓形的 `center + dir * inset` → 七張 rect 圖全部有殭屍落在房間外面，
 * `inBounds` 那一條紅（disc 圖仍全綠 —— 這正是舊測試抓不到的原因）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "./SimWorld";
import { arenaDefFromDoc } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { halfExtents } from "./map/bounds";
import { mobRulesFromConfig, mobsAliveInZone } from "./mobs";
import { beginCombatMobs } from "./systems/MobSystem";
import type { MobWavesConfig } from "../content/schema/config";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DT = 1 / 30;

/** 出貨的 mobWaves ——⛔ 不抄數字，`fromRound` 之類的 owner 每週在改。 */
function shippedMobWaves(): MobWavesConfig {
  return (
    JSON.parse(readFileSync(join(ROOT, "content/config/arena-rules.json"), "utf8")) as {
      mobWaves: MobWavesConfig;
    }
  ).mobWaves;
}

/** 每一張**出貨**的場地文件。⛔ 不是一份手打清單 —— 新圖上線要自動被納入。 */
function shippedArenas(): { id: string; doc: Record<string, unknown> }[] {
  const dir = join(ROOT, "content/arenas");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => ({
      id: f.replace(/\.json$/, ""),
      doc: JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>,
    }));
}

beforeAll(() => registerSkeletonContent());

describe("殭屍波 · 每一張出貨場地（含 rect 新圖）", () => {
  it("⭐ 每一張都生得出殭屍，而且每一隻都落在可玩範圍內", () => {
    const cfg = shippedMobWaves();
    const arenas = shippedArenas();
    // 這個斷言擋的是「glob 沒抓到東西所以迴圈跑 0 次而測試全綠」。
    expect(arenas.length, "content/arenas 掃不到場地 —— 這條守衛等於沒跑").toBeGreaterThan(8);

    const rectSeen: string[] = [];
    for (const { id, doc } of arenas) {
      const def = arenaDefFromDoc(doc as Parameters<typeof arenaDefFromDoc>[0]);
      const world = new SimWorld(def, 1);
      world.combatActive = true;
      // 波次逼到每一 tick 都來，讓「存活上限」而不是「排程」成為約束 ——
      // 這樣才問得到「生得出來嗎」而不是「等夠久了嗎」。
      beginCombatMobs(
        world,
        mobRulesFromConfig({ ...cfg, firstWaveSec: DT, waveIntervalSec: DT }, DT, cfg.fromRound),
        [0],
      );
      for (let i = 0; i < 30 * 20; i++) world.step(new Map());

      expect(mobsAliveInZone(world, 0), `${id}：一隻殭屍都沒生出來`).toBeGreaterThan(0);

      const zone = def.zones[0]!;
      const { halfW, halfD, rect } = halfExtents(zone);
      if (rect) rectSeen.push(id);
      for (const [eid, t] of world.transform) {
        if (!mobIds(world).has(eid)) continue;
        const dx = t.pos.x - zone.center.x;
        const dz = t.pos.z - zone.center.z;
        const inBounds = rect
          ? Math.abs(dx) <= halfW + 1e-3 && Math.abs(dz) <= halfD + 1e-3
          : Math.hypot(dx, dz) <= zone.boundaryRadius + 1e-3;
        expect(inBounds, `${id}：殭屍 ${eid} 生在可玩範圍外 (${dx.toFixed(2)}, ${dz.toFixed(2)})`).toBe(
          true,
        );
      }
    }
    // ⛔ 沒有 rect 場地時這整條就退化成「又測了一次圓形」——而那正是它要修的洞。
    expect(rectSeen.length, "一張 rect 場地都沒掃到 —— 這條守衛沒有測到新圖那條分支").toBeGreaterThan(
      0,
    );
  });
});

/** 這個世界裡哪些 entity 是小怪。⚠️ 欄位名先 Read 過再寫（第零守則⑤）。 */
function mobIds(world: SimWorld): Set<number> {
  const m = (world as unknown as { mob?: Map<number, unknown>; mobs?: Map<number, unknown> });
  return new Set([...(m.mob ?? m.mobs ?? new Map()).keys()]);
}

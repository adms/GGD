/**
 * 復活圈：敵人站在裡面**不影響**復活（owner 2026-08-14 裁決）。
 *
 * > 「Lol 競技場的玩法是敵人不影響復活圈」
 *
 * ⚠️ 這**不是**在修一個壞掉的機制 —— contest 一直都在動（實測敵人進到圈心 2.0 格
 * 內進度確實停住、2.1 格外繼續）。這是**設計裁決**：一隊一回合只有一次復活、要詠唱
 * 5 秒，而屍體就躺在剛才打架的地方 ⇒ 敵人幾乎必然在 2 格內 ⇒ contest 開著等於
 * 「復活圈實質上永遠用不出來」。
 *
 * ⭐ 第〇·六守則：**只測預設啟動的那一邊**（關）。⛔ 舊行為（開）不再多寫一條 ——
 * 那條路是為了讓 owner 能回頭，不是一個要保證品質的功能；機制本身仍由
 * `revive.test.ts` 的夾具覆蓋。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import { beginCombatRevives, reviveRulesFromConfig } from "./revive";
import { DEFAULT_REVIVE_CIRCLE_CONFIG } from "../content/schema/config";

const SHIPPED = (
  JSON.parse(
    readFileSync(join(__dirname, "../../../../content/config/arena-rules.json"), "utf8"),
  ) as { reviveCircles: typeof DEFAULT_REVIVE_CIRCLE_CONFIG }
).reviveCircles;

beforeAll(() => registerSkeletonContent());

const mk = (w: SimWorld, seat: number, team: number, x: number, z: number): EntityId =>
  spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x, z },
    zone: 0,
  });

describe("復活圈：敵人壓住不影響復活", () => {
  it("★ 敵人站在圈心上，進度照樣往前跑（把 contestPauses 改回 true 這條就紅）", () => {
    const w = new SimWorld(SKELETON_ARENA, 7);
    const c = SKELETON_ARENA.zones[0]!.center;
    const rules = reviveRulesFromConfig(SHIPPED, w.dt);
    const victim = mk(w, 0, 0, c.x, c.z);
    const ally = mk(w, 1, 0, c.x + 8, c.z);
    const enemy = mk(w, 2, 1, c.x + 14, c.z);
    beginCombatRevives(w, rules, [asTeamId(0), asTeamId(1)]);

    w.health.get(victim)!.hp = 0;
    w.step(new Map());
    const cid = [...w.reviveCircle.keys()][0];
    expect(cid, "屍體上沒有掉出復活圈").toBeDefined();
    const cp = { ...w.transform.get(cid!)!.pos };

    // 隊友詠唱，敵人**站在同一點上**（最極端的「壓住」）
    for (let i = 0; i < 3; i++) {
      w.transform.get(ally)!.pos = { x: cp.x + 0.5, z: cp.z };
      w.transform.get(enemy)!.pos = { x: cp.x, z: cp.z };
      const before = w.reviveCircle.get(cid!)!.progressTicks;
      w.step(new Map());
      expect(
        w.reviveCircle.get(cid!)!.progressTicks,
        "敵人壓住時進度停住了 —— contestPauses 又被打開了",
      ).toBe(before + 1);
    }
    // 三個住處的 drift（同一條裡驗，⛔ 不另開一個 it —— 那是同一件事的第二個角度）
    expect(SHIPPED).toEqual(DEFAULT_REVIVE_CIRCLE_CONFIG);
    expect(DEFAULT_REVIVE_CIRCLE_CONFIG.contestPauses).toBe(false);
  });
});

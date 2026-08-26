/**
 * GH#778 復活火圈 ×0.6（owner 2026-08-27 逐字:「復活火圈太大 減少 40%」）。
 *
 * ⭐ 守的是「圈圈不說謊」這條**關係**，⛔ 不是 2.4 這個數字：
 * wire 送給客戶端畫圈的半徑（circle transform.radius —— snapshot 的
 * `es.shield = t.radius` 讀的就是它）必須就是 sim 判「站哪裡能救」的那一格
 * （`rules.radius`，ReviveSystem 的 `distSq > r²`）。兩邊分開動 = 視覺圈與
 * 判定圈漂移 = 玩家踩著圈邊卻救不了人（第一·五守則：畫在地上的宣稱要是真的）。
 *
 * 出貨值本身（4 → 2.4）由 reviveContestOff.test.ts 的 SHIPPED == DEFAULT
 * drift 在守 —— 這裡刻意不重複釘數字（第二守則：驗機制不驗數字）。
 * 邊界一律從 SHIPPED 推導，owner 之後再調半徑這條照樣是綠的。
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
import type { DEFAULT_REVIVE_CIRCLE_CONFIG } from "../content/schema/config";

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

describe("復活圈：判定半徑＝畫出來的半徑（GH#778）", () => {
  it("★ wire 半徑就是判定半徑：圈邊內能救、圈邊外不能", () => {
    const w = new SimWorld(SKELETON_ARENA, 11);
    const c = SKELETON_ARENA.zones[0]!.center;
    const rules = reviveRulesFromConfig(SHIPPED, w.dt);
    const victim = mk(w, 0, 0, c.x, c.z);
    const ally = mk(w, 1, 0, c.x + 8, c.z);
    beginCombatRevives(w, rules, [asTeamId(0), asTeamId(1)]);

    w.health.get(victim)!.hp = 0;
    w.step(new Map());
    const cid = [...w.reviveCircle.keys()][0];
    expect(cid, "屍體上沒有掉出復活圈").toBeDefined();
    const ct = w.transform.get(cid!)!;

    // ① 關係本體：客戶端拿去縮放圈的值（t.radius，snapshot 讀它）＝ 判定用的值
    expect(ct.radius, "wire 半徑 ≠ 判定半徑 —— 圈圈在說謊").toBe(rules.radius);

    // ② 那個值真的是判定邊界（從 SHIPPED 推導，⛔ 不寫字面值）
    const step = (dx: number): number => {
      w.transform.get(ally)!.pos = { x: ct.pos.x + dx, z: ct.pos.z };
      const before = w.reviveCircle.get(cid!)!.progressTicks;
      w.step(new Map());
      return w.reviveCircle.get(cid!)!.progressTicks - before;
    };
    expect(step(rules.radius + 0.05), "圈邊外 0.05 也在累積 —— 判定比畫的大").toBeLessThanOrEqual(
      0,
    );
    expect(step(rules.radius - 0.05), "圈邊內 0.05 累積不了 —— 判定比畫的小").toBe(1);
  });
});

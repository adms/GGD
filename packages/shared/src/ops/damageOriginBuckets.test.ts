/**
 * 閘③（GH#1030）：傷害分桶必須涵蓋 **100%** —— 每一發 `damage` 事件都要落進一個宣告過的桶。
 *
 * 假前提 #4（2026-09-05）：「傷害只有技能／普攻兩個桶，技能佔 48.5%」。⭐ 它證明的是
 * 「這兩桶加起來 100%」，說成的是「只有這兩桶」—— 而出貨的 `origin` 有第三桶
 * `hook:*`（天生技／道具／增益卡的被動，126 場裡有一場佔 55%）。
 * 桶的宣告在下面 BUCKETS，兩個方向都掃（形態⑫）：
 *   靜態：`packages/shared/src/sim` 每一個 `origin:` 字面值／模板前綴 → 必須分得進一桶；
 *         每一桶 → 必須有至少一個出貨產生端（宣告了沒人發 = 假桶）。
 *   動態：跑一場真的對局（出貨英雄 ＋ 出貨寶具，Q–R 拉到 maxRank），收每一發 damage 事件：
 *         每一發都分得進桶、Σ桶 = Σ全部、⭐ 技能／普攻／被動三桶**各自非空**（量尺自證）。
 * 出現第四種 origin 而沒有人宣告 ⇒ 兩個方向都會紅並指名它。
 * ⚠️ #1015（排行榜結構上排除普攻）是同族 —— 排行榜的口徑應該 import 同一份分桶，⛔ 這裡不併它。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { registerAll } from "../content/registries";
import { Abilities } from "../sim/content/registry";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { spawnChampion } from "../sim/spawnChampion";
import { castAbility } from "../sim/abilities/abilitySystem";
import { grantItemFree } from "../sim/economy/shop";
import { ABILITY_ORIGIN_PREFIX } from "../sim/combat/damage";
import { reachTo } from "../sim/systems/BasicAttackSystem";
import { Stat } from "../sim/stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId, type SeatId } from "../ids";
import type { IntentFrame } from "../sim/intents";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SIM = join(REPO, "packages/shared/src/sim");
const NO_INTENTS = new Map<SeatId, IntentFrame>();

/** ⭐ 桶的宣告 —— 唯一的住處。`damage` 只允許前五桶；`restore` 是吸血回復封包（非傷害）。 */
const BUCKETS: Record<string, (o: string) => boolean> = {
  ability: (o) => o.startsWith(ABILITY_ORIGIN_PREFIX),
  basic: (o) => o === "basic",
  passive: (o) => o.startsWith("hook:"), // 天生技 / 道具 / 增益卡 / applyBuff 的被動
  mark: (o) => o.startsWith("mark:"),
  world: (o) => ["fireRing", "flower", "guardian", "guardian-heir", "mob"].includes(o),
  restore: (o) => o === "lifesteal",
};
const DAMAGE_BUCKETS = ["ability", "basic", "passive", "mark", "world"];
const bucketOf = (o: string): string | null => Object.keys(BUCKETS).find((b) => BUCKETS[b]!(o)) ?? null;

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) yield* walk(join(dir, e.name));
    else if (e.isFile() && /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) yield join(dir, e.name);
  }
}
/** 出貨產生端：`origin: "lit"` 或 `origin: \`prefix${…}\``（註解行剝掉）。 */
function producers(): { file: string; origin: string }[] {
  const out: { file: string; origin: string }[] = [];
  const re = /origin:\s*(?:"([^"]*)"|`([^`$]*)\$\{)/g;
  for (const f of walk(SIM)) for (const line of readFileSync(f, "utf8").split("\n")) {
    if (/^\s*(\*|\/\/|\/\*)/.test(line)) continue;
    for (const m of line.replace(/\/\/.*$/, "").matchAll(re))
      out.push({ file: relative(REPO, f), origin: m[1] ?? `${m[2]}…` });
  }
  return out;
}

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(join(REPO, "content"))).load()).store);
});

describe("閘③：傷害分桶涵蓋 100%（GH#1030 假前提 #4）", () => {
  it("靜態：每一個出貨 origin 產生端都分得進桶；每一桶都有產生端", () => {
    const ps = producers();
    expect(ps.length, "一個產生端都沒掃到 —— 掃描器壞了").toBeGreaterThan(5);
    const orphan = ps.filter((p) => bucketOf(p.origin.replace(/…$/, "x")) === null);
    expect(orphan, "這些 origin 沒有人宣告它屬於哪一桶 —— 下游的分桶會把它算漏").toEqual([]);
    for (const b of Object.keys(BUCKETS))
      expect(ps.some((p) => bucketOf(p.origin.replace(/…$/, "x")) === b), `桶「${b}」在出貨 sim 裡沒有任何產生端 —— 假桶`).toBe(true);
  });

  it("動態：真的對局裡每一發 damage 都落桶，Σ桶 = Σ全部，技能／普攻／被動三桶各自非空", () => {
    const world = new SimWorld(SKELETON_ARENA, 1030);
    world.combatActive = true;
    const c = SKELETON_ARENA.zones[0]!.center;
    const spawn = (id: string, seat: number, dx: number): EntityId =>
      spawnChampion(world, { championId: id as ChampionId, seatId: asSeatId(seat), teamId: asTeamId(seat), pos: { x: c.x + dx, z: c.z }, zone: 0, level: 30 });
    const me = spawn("godie-h00l", 0, 0); // 出貨英雄：天生技 onBasicAttack 帶傷害（hook:abilityPassive:…）
    const foe = spawn("godie-hart", 1, 0);
    const ab = world.abilities.get(me)!;
    for (const s of ["Q", "W", "E", "R"] as const) ab.slots[s].rank = Abilities.get(ab.slots[s].abilityId).maxRank;
    expect(grantItemFree(world, me, "cleaver-of-the-warden" as ItemId), "寶具發不出去").toBeGreaterThanOrEqual(0); // hook:item:…
    const foeHp = world.health.get(foe)!;
    foeHp.maxHp = 5e5; foeHp.hp = foeHp.maxHp;
    world.health.get(me)!.mana = 9e4;
    const sc = world.stats.get(me)!;
    world.transform.get(foe)!.pos = { x: c.x + reachTo(sc, world.transform.get(me)!.radius, world.transform.get(foe)!.radius) * 0.7, z: c.z };
    world.stats.get(foe)!.final[Stat.MoveSpeed] = 1e-9;

    const sums: Record<string, number> = {};
    const unbucketed = new Set<string>();
    let total = 0;
    const casts: string[] = [];
    for (let t = 0; t < 300; t++) {
      if (t % 60 === 0) casts.push(castAbility(world, me, "Q", { type: "self" }));
      foeHp.hp = foeHp.maxHp;
      world.stats.get(foe)!.final[Stat.MoveSpeed] = 1e-9;
      world.step(NO_INTENTS);
      for (const e of world.events) {
        if (e.type !== "damage") continue;
        const { origin, amount } = e.data as { origin: string; amount: number };
        total += amount;
        const b = bucketOf(String(origin));
        if (b === null || !DAMAGE_BUCKETS.includes(b)) unbucketed.add(String(origin));
        else sums[b] = (sums[b] ?? 0) + amount;
      }
    }
    expect(total, `量尺自證失敗：300 tick 內一發傷害都沒有（casts=${casts.join(",")}）`).toBeGreaterThan(0);
    expect([...unbucketed], "這些 damage 事件的 origin 沒有落進任何宣告過的傷害桶").toEqual([]);
    expect(Object.values(sums).reduce((a, b) => a + b, 0)).toBeCloseTo(total, 6);
    for (const b of ["ability", "basic", "passive"])
      expect(sums[b] ?? 0, `桶「${b}」在真的對局裡是 0 —— 治具沒量到它（casts=${casts.join(",")}；桶=${JSON.stringify(sums)}）`).toBeGreaterThan(0);
    console.info(`[GH#1030 閘③] 三桶以上：${JSON.stringify(sums)}`);
  });
});

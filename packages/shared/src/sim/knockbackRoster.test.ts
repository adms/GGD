/**
 * 擊退法則 (GH#193) 在**出貨內容**上的普查 —— 不是在骨架 dummy 上。
 *
 * 為什麼要多這一份:`combatJuice.test.ts` 的擊退測試全部跑在
 * `registerSkeletonContent()` 的 dummy 上,那個 dummy **沒有** `hitFeel`,所以
 * 它量到的永遠是「沒有作者覆寫」的那條分支。出貨的英雄幾乎每一位都帶著
 * `hitFeel.knockbackMag`,走的是**另一條**分支。
 *
 * 也就是說:骨架測試證明的東西,和玩家在遊戲裡吃到的東西,是兩條不同的路。
 * (失敗形狀 ⑤:受測的不是出貨的那個東西。)
 *
 * 這一份把真的英雄文件載進來,走真的 `combatResolveSystem`,量真的 `nav.override`。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { reachTo } from "./systems/BasicAttackSystem";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../..", "content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
const LANE_Z = Z0.center.z + 12;
/** 同一個 #128 / census 用的木樁。 */
const DUMMY = "godie-hart" as ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(res.store);
});

interface Shot {
  /** 這一擊實際造成的擊退 (GGD units),0 = 完全沒推 */
  push: number;
  /** 開打時攻守雙方的距離 */
  gap: number;
  /** 這一擊佔受傷單位最大生命的比例 */
  pct: number;
}

/**
 * 讓 `attacker` 對 `victim` 打一發 `origin` 的傷害,量出真正的擊退。
 * 走的是 `world.damageQueue` → `combatResolveSystem` → `nav.override`,
 * 也就是**出貨路徑**,不是直接呼叫 `knockbackDistance`。
 */
function shoot(attackerId: ChampionId, origin: string, dmgFracOfMaxHp: number): Shot {
  const world = new SimWorld(SKELETON_ARENA, 20260728);
  world.combatActive = true;
  const me = spawnChampion(world, {
    championId: attackerId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: LANE_Z },
    zone: 0,
  });
  const foe = spawnChampion(world, {
    championId: DUMMY,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: Z0.center.x, z: LANE_Z },
    zone: 0,
  });
  const myT = world.transform.get(me)!;
  const foeT = world.transform.get(foe)!;
  // 貼到自己的**近戰接觸距離**(reach 的下限 = r+r+0.1),也就是最有利於擊退的
  // 距離 —— 如果連這裡都推不動,那更遠的地方一定也推不動。
  const gap = reachTo(world.stats.get(me)!, myT.radius, foeT.radius);
  const contact = Math.min(gap, myT.radius + foeT.radius + 0.1);
  foeT.pos = { x: Z0.center.x + contact, z: LANE_Z };

  const hp = world.health.get(foe)!;
  const amount = hp.maxHp * dmgFracOfMaxHp;
  const before = { x: foeT.pos.x, z: foeT.pos.z };
  world.damageQueue.push({
    source: me,
    target: foe,
    amount,
    type: "true" as const, // 真傷:不被護甲吃掉,impact === amount
    crit: false,
    origin,
  });
  world.step(NO_INTENTS);

  const ov = world.nav.get(foe)!.override;
  // `nav.override.remaining` 這一 tick 已經被 movementSystem 消耗過一段,所以
  // 真正的總擊退 = 已經走掉的位移 + 還沒走完的 remaining。
  const movedX = foeT.pos.x - before.x;
  const movedZ = foeT.pos.z - before.z;
  const moved = Math.sqrt(movedX * movedX + movedZ * movedZ);
  const push = moved + (ov?.kind === "knockback" ? ov.remaining : 0);
  return { push, gap: contact, pct: dmgFracOfMaxHp };
}

/** 出貨 roster 裡每一位的 championId。 */
function roster(): ChampionId[] {
  return Champions.ids().slice().sort() as ChampionId[];
}

/**
 * 營運名單在**磁碟上**有幾份英雄文件(`_` 開頭的索引不算)。
 *
 * ⚠️ 這裡刻意不寫「至少 N 位」那種出貨值(2026-08-13 下架 41 位之後,原本寫死的
 * `> 100` 就是這樣紅的 —— 它把出貨數字變成第四個住處,而且紅的時候說的是
 * 「擊退壞了」)。母體改由**內容目錄**決定,名單再怎麼增刪這一條都不會過期。
 */
function shippedChampionDocs(): number {
  return readdirSync(join(CONTENT_DIR, "champions")).filter(
    (f) => f.endsWith(".json") && !f.startsWith("_"),
  ).length;
}

describe("擊退法則在出貨內容上真的成立嗎 (GH#193)", () => {
  /**
   * owner 的規格:「該傷害超過生命 5% 才會擊退、並且百分比越高擊退越遠,
   *  最多 10 個身位距離(假設一擊就造成 100% 生命損失)」。
   *
   * 這一條把規格直接套在**每一位出貨英雄的普攻**上:一發打掉受傷單位 100%
   * 最大生命的普攻,在近戰接觸距離,規格說要推 10 − 1.3 ≈ 8.7 個身位。
   */
  it("kb-roster-basic — 每位出貨英雄的普攻,一發打掉 100% 生命時真的會擊退", () => {
    cover("kb-roster-basic");
    const ids = roster();
    // 儀器活著,兩個方向一起關:
    //   ① 營運名單不是空的 —— 否則底下那個 for 迴圈零圈,`dead` 永遠是 []
    //      (刪掉內容等於刪掉測試,CLAUDE.md 失敗形態③)。這是**結構性**下界,
    //      不是出貨值:名單只要還在營運就一定 > 0。
    //   ② 磁碟上每一份英雄文件都真的進了註冊表 —— 少一份就是載入器吞掉了它,
    //      那時候這一整份普查會少查一位而不自知。
    const onDisk = shippedChampionDocs();
    expect(onDisk, "content/champions 是空的 —— 這份普查會零圈空轉").toBeGreaterThan(0);
    expect(ids.length, "註冊表裡的英雄數對不上 content/champions 的文件數").toBe(onDisk);

    const dead: string[] = [];
    for (const id of ids) {
      const s = shoot(id, "basic", 1.0);
      if (s.push <= 1e-9) dead.push(id);
    }
    expect(dead).toEqual([]);
  });

  /**
   * 反向的儀器測試:同一發傷害、同樣的距離,但 origin 不是 "basic"(所以
   * `lookupHitFeel` 找不到覆寫)—— 這一條必須是**推得動**的。
   *
   * 如果上面那條紅了而這一條綠了,結論就很明確:法則本身是對的,是
   * `hitFeel.knockbackMag` 這條覆寫把它整個吃掉了。
   */
  it("kb-roster-instrument — 沒有作者覆寫的同一發傷害推得動(證明儀器與法則都活著)", () => {
    cover("kb-roster-instrument");
    const ids = roster();
    const s = shoot(ids[0]!, "dot", 1.0); // origin 不是 basic,也不是 ability
    expect(s.push).toBeGreaterThan(5);
  });
});

/**
 * 【死亡遺留】DEATH WARDS —— 71-00 暗夜契約的行為，**拆解前後逐條相同**。
 *
 * 這一支是 `nightPact.test.ts` 的繼承者，而它的任務就是那件事：2026-08-19 把
 * 暗夜契約從一份專屬程式（`sim/nightPact.ts` + `config.arena-rules@1.nightPact`）
 * 拆成「引擎機制 + JSON 參數」，⛔ 行為一格都不可以變。這裡的每一條 `it` 都是
 * 拆之前那一支斷言過的同一件事，只差在**參數從哪裡來**：
 * 以前是設定檔上的 `abilityIds`，現在是那一階 rank 上的 `deathWard` 授予。
 *
 * · 每一個世界都跑真的 `SimWorld.step()`，⛔ 不是手動戳 `deathWardSystem`——
 *   一支戳得動但接在錯的槽位的系統就是失敗形態②。
 * · 每一條關於加成的斷言都讀**統計管線的最終數字**，⛔ 不是「來源在不在」
 *   （失敗形態⑦：掃屬性代替掃行為）。
 *
 * ⭐ 承重的那一條（突變對象）是 `raiseWardsForDeaths` 的持有者閘 ——
 * 拿掉 `grantsOn(carrier)` 那一層，每一場的每一次陣亡都會立旗。
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { Abilities, Champions } from "./content/registry";
import { spawnChampion } from "./spawnChampion";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { DEFAULT_STAT_CAPS, capFor } from "./statCaps";
import { queryOverlap } from "./collision/queries";
import { circle } from "./collision/shapes";
import { isAutoTargetable } from "./targeting";
import { castAbility } from "./abilities/abilitySystem";
import {
  deathWardIds,
  deathWardSourceId,
  endCombatDeathWards,
  type DeathWardGrant,
} from "./deathWard";
import type { AbilityDef, ChampionDef } from "./content/defs";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

/** 夾具都站在 `x = centre.x + 12` 這一條線上：骨架區的正中央有一根 r=2.5 的柱子。 */
const LINE_X = Z0.center.x + 12;
const P = (dz: number): { x: number; z: number } => ({ x: LINE_X, z: Z0.center.z + dz });

const KING = "dw-king" as ChampionId;
const PLAIN = "dw-plain" as ChampionId;
const KING_INNATE = "dw-king.passive" as AbilityId;
const PLAIN_INNATE = "dw-plain.passive" as AbilityId;

const RADIUS = 6.42;
/** 出貨的暗夜契約參數，只是搬到了它該住的地方（那一階 rank 上）。 */
const GRANT: DeathWardGrant = {
  radius: RADIUS,
  maxPerZone: 12,
  beneficiary: "owner",
  stacking: "max",
  modifiers: [
    { stat: Stat.MoveSpeed, op: ModOp.PercentAdd, value: 1 },
    { stat: Stat.HealthRegen, op: ModOp.Flat, value: 30 },
  ],
};

/**
 * 合成英雄，⛔ 不是真的 `godie-u00k`：這一支不可以因為隔壁內容 lane 調了平衡
 * 而變紅。**出貨那一份**由 `laneB.innates.test.ts` ③ 從真的 `content/` 釘住。
 */
function registerPair(grant?: DeathWardGrant): void {
  const innate = (id: AbilityId, g?: DeathWardGrant): AbilityDef =>
    ({
      id,
      name: id,
      slot: "PASSIVE",
      innateKind: "passive",
      castType: "self",
      maxRank: 1,
      cooldown: [0],
      manaCost: [0],
      range: 0,
      effects: [],
      passive: { ranks: [g ? { modifiers: [], deathWard: g } : { modifiers: [] }] },
    }) as unknown as AbilityDef;
  Abilities.register(KING_INNATE, innate(KING_INNATE, grant));
  Abilities.register(PLAIN_INNATE, innate(PLAIN_INNATE));
  const thorne = Champions.get("thorne" as ChampionId);
  const body = (id: ChampionId, innateId: AbilityId): ChampionDef =>
    ({ ...thorne, id, passiveAbility: innateId }) as unknown as ChampionDef;
  Champions.register(KING, body(KING, KING_INNATE));
  Champions.register(PLAIN, body(PLAIN, PLAIN_INNATE));
}

beforeAll(() => {
  registerSkeletonContent();
  registerPair(GRANT);
});

let world: SimWorld;
let seat = 0;

beforeEach(() => {
  registerPair(GRANT);
  world = new SimWorld(SKELETON_ARENA, 20260730);
  world.combatActive = true;
});

function spawn(champion: ChampionId, team: 0 | 1, at: { x: number; z: number }): EntityId {
  return spawnChampion(world, {
    championId: champion,
    seatId: asSeatId(seat++),
    teamId: asTeamId(team),
    pos: at,
    zone: 0,
  });
}

/** 照戰鬥的方式殺人：血歸零，讓**下一格** `deathSystem` 翻 alive 並發事件。 */
function mortallyWound(victim: EntityId): void {
  world.health.get(victim)!.hp = 0;
}

const msOf = (id: EntityId): number => world.stats.get(id)!.final[Stat.MoveSpeed];
const regenOf = (id: EntityId): number => world.stats.get(id)!.final[Stat.HealthRegen];
const hasWardAura = (id: EntityId): boolean =>
  world.stats.get(id)!.sources.some((s) => s.id === deathWardSourceId(`abilityPassive:${KING_INNATE}`));
/** 移速有硬上限，所以 +100% 打在 6.9 的英雄身上最終值是**上限**。⛔ 不抄字面值。 */
const doubled = (base: number): number =>
  Math.min(base * 2, capFor(DEFAULT_STAT_CAPS, Stat.MoveSpeed).base);

describe("【死亡遺留】—— 旗子 / 光環 / 回合結束清除（71-00 暗夜契約的機制層）", () => {
  it("沒有人帶著授予 → 英雄陣亡什麼都不留（⭐ 承重的那一條）", () => {
    const a = spawn(PLAIN, 0, P(0));
    const b = spawn(PLAIN, 1, P(3));
    world.step(NO_INTENTS);
    expect(deathWardIds(world)).toEqual([]);

    mortallyWound(b);
    world.step(NO_INTENTS);

    expect(deathWardIds(world), "沒有 deathWard 授予 → 不立旗").toEqual([]);
    expect(hasWardAura(a), "…也沒有人吃到光環").toBe(false);
  });

  it("持有者在場 → 陣亡處立起一個真的實體（敵我都算）", () => {
    const king = spawn(KING, 0, P(0));
    const victim = spawn(PLAIN, 1, P(5));
    world.step(NO_INTENTS);
    const before = world.transform.size;

    mortallyWound(victim);
    world.step(NO_INTENTS);

    const wards = deathWardIds(world);
    expect(wards.length).toBe(1);
    expect(world.transform.size).toBe(before + 1);
    const wt = world.transform.get(wards[0]!)!;
    const corpse = world.transform.get(victim)!;
    expect(wt.pos.x).toBeCloseTo(corpse.pos.x, 6);
    expect(wt.pos.z).toBeCloseTo(corpse.pos.z, 6);
    // 敵我都算：死的是**另一隊**的。
    expect(world.team.get(king)!.teamId).not.toBe(world.team.get(victim)!.teamId);
    expect(world.health.has(wards[0]!), "沒有 Health → 打不到、也不進 digest").toBe(false);
    expect(world.team.has(wards[0]!), "沒有 TeamComp → 不會污染 teamAliveInZone").toBe(false);
  });

  it("隊友陣亡也立一個 —— 「敵我英雄死亡」兩個方向", () => {
    spawn(KING, 0, P(0));
    const ally = spawn(PLAIN, 0, P(5));
    world.step(NO_INTENTS);
    mortallyWound(ally);
    world.step(NO_INTENTS);
    expect(deathWardIds(world).length).toBe(1);
  });

  it("走進圈裡移速加倍、走出去還回來（受益者 owner：隊友吃不到）", () => {
    const king = spawn(KING, 0, P(0));
    const mate = spawn(PLAIN, 0, P(20.5));
    const victim = spawn(PLAIN, 1, P(20)); // 死在很遠的地方
    world.step(NO_INTENTS);
    const base = msOf(king);
    const baseRegen = regenOf(king);
    const mateBase = msOf(mate);

    mortallyWound(victim);
    world.step(NO_INTENTS);
    expect(deathWardIds(world).length).toBe(1);
    world.step(NO_INTENTS);
    expect(msOf(king), "圈外：什麼都沒有").toBeCloseTo(base, 6);

    world.transform.get(king)!.pos = P(18);
    world.step(NO_INTENTS); // 掛上、標記 dirty
    world.step(NO_INTENTS); // statRecomputeSystem 折進去
    expect(msOf(king), "+100% 移速（會被移速上限吃掉一部分）").toBeCloseTo(doubled(base), 5);
    expect(regenOf(king), "+30 生命回復").toBeCloseTo(baseRegen + 30, 5);
    expect(hasWardAura(mate), "站在同一個圈裡的隊友吃不到（預設 beneficiary = owner）").toBe(false);
    expect(msOf(mate)).toBeCloseTo(mateBase, 5);

    world.transform.get(king)!.pos = P(0);
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);
    expect(msOf(king), "加成是**還回來**的，不是黏著的").toBeCloseTo(base, 5);
    expect(hasWardAura(king)).toBe(false);
  });

  it("beneficiary 'team' 是同一條路，差一格欄位", () => {
    registerPair({ ...GRANT, beneficiary: "team" });
    const king = spawn(KING, 0, P(0));
    const mate = spawn(PLAIN, 0, P(2));
    const enemy = spawn(PLAIN, 1, P(1));
    world.step(NO_INTENTS);
    const mateBase = msOf(mate);
    mortallyWound(enemy);
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);
    expect(msOf(mate), "隊友現在也吃得到").toBeCloseTo(doubled(mateBase), 5);
  });

  it("stacking：'max' 兩面旗只算一劑；'add' 兩面旗加總", () => {
    // ⚠️ 讀**回復**不讀移速：移速被上限夾住，×3 與 ×2 會看起來一樣，
    // 那正是「斷言方向跟缺陷無關」的陷阱。
    const king = spawn(KING, 0, P(0));
    const v1 = spawn(PLAIN, 1, P(1));
    const v2 = spawn(PLAIN, 1, P(2));
    world.step(NO_INTENTS);
    const base = regenOf(king);

    mortallyWound(v1);
    mortallyWound(v2);
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);
    expect(deathWardIds(world).length, "兩次死亡兩面旗").toBe(2);
    expect(regenOf(king), "max：兩面旗仍然只有一份 +30").toBeCloseTo(base + 30, 4);

  });

  it("stacking：'add' 兩面旗加總（同一段程式，差一格欄位）", () => {
    // ⚠️ 授予是在**掛上來源**的那一刻讀的，所以規則要在英雄生出來之前換好 ——
    // 這正是「參數住在內容裡」的形狀：改的是文件，⛔ 不是程式。
    registerPair({ ...GRANT, stacking: "add" });
    const king = spawn(KING, 0, P(0));
    const v1 = spawn(PLAIN, 1, P(1));
    const v2 = spawn(PLAIN, 1, P(2));
    world.step(NO_INTENTS);
    const base = regenOf(king);
    mortallyWound(v1);
    mortallyWound(v2);
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);
    expect(deathWardIds(world).length).toBe(2);
    expect(regenOf(king), "add：兩面旗是 +60").toBeCloseTo(base + 60, 4);
  });

  it("maxPerZone 是真的上限，不是裝飾", () => {
    registerPair({ ...GRANT, maxPerZone: 2 });
    spawn(KING, 0, P(0));
    const victims = [spawn(PLAIN, 1, P(1)), spawn(PLAIN, 1, P(2)), spawn(PLAIN, 1, P(3))];
    world.step(NO_INTENTS);
    for (const v of victims) mortallyWound(v);
    world.step(NO_INTENTS);
    expect(deathWardIds(world).length).toBe(2);
  });

  it("回合結束清空旗子**與**加成 —— 「回合結束則一起被清除」", () => {
    const king = spawn(KING, 0, P(0));
    const victim = spawn(PLAIN, 1, P(1));
    world.step(NO_INTENTS);
    const base = msOf(king);
    mortallyWound(victim);
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);
    expect(deathWardIds(world).length).toBe(1);
    expect(msOf(king)).toBeCloseTo(doubled(base), 5);

    endCombatDeathWards(world);

    expect(world.deathWard.size).toBe(0);
    for (const id of world.transform.keys()) expect(world.deathWard.has(id)).toBe(false);
    expect(hasWardAura(king), "加成也被剝掉了").toBe(false);
    world.step(NO_INTENTS);
    expect(msOf(king), "…所以下一回合從基礎值開始").toBeCloseTo(base, 5);
  });

  it("已經結束的區域（#216）不再立旗", () => {
    spawn(KING, 0, P(0));
    const victim = spawn(PLAIN, 1, P(1));
    world.step(NO_INTENTS);
    world.settledZones.add(0);
    mortallyWound(victim);
    world.step(NO_INTENTS);
    expect(deathWardIds(world)).toEqual([]);
  });

  it("旗子點不到、打不到、推不動 —— 它不在 broad-phase 裡", () => {
    const king = spawn(KING, 0, P(0));
    const enemy = spawn(PLAIN, 1, P(1));
    world.step(NO_INTENTS);
    mortallyWound(enemy);
    world.step(NO_INTENTS);
    const ward = deathWardIds(world)[0]!;

    // 先 rebuild：旗子是在剛剛那一格的**後段**建的，不重建的話這條查詢
    // 不管有沒有那道 skip 都找不到它（守衛會變成空的）。
    world.rebuildGrid();
    const hits = queryOverlap(world, circle(world.transform.get(ward)!.pos, 30), {
      zone: 0,
      exclude: new Set<EntityId>(),
      aliveOnly: false,
    });
    expect(hits.includes(ward)).toBe(false);
    expect(isAutoTargetable(world, king, ward)).toBe(false);
  });

  it("半徑是真的邊界 —— 量的是旗子**自己**的位置", () => {
    const king = spawn(KING, 0, P(0));
    const victim = spawn(PLAIN, 1, P(8));
    world.step(NO_INTENTS);
    const base = msOf(king);
    mortallyWound(victim);
    world.step(NO_INTENTS);
    const wardPos = { ...world.transform.get(deathWardIds(world)[0]!)!.pos };
    const at = (d: number): { x: number; z: number } => ({ x: wardPos.x, z: wardPos.z + d });

    world.transform.get(king)!.pos = at(RADIUS - 0.05);
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);
    expect(msOf(king), "剛好在裡面").toBeCloseTo(doubled(base), 4);

    world.transform.get(king)!.pos = at(RADIUS + 0.5);
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);
    expect(msOf(king), "剛好在外面").toBeCloseTo(base, 4);
  });
});

/**
 * 【魔力全失】—— 拆解之後這一半**沒有任何引擎程式**：它是
 * `auras[] → hooks[on:"onAbilityCast"] → spendMana` 的組合。
 *
 * ⛔ 這一條驗的不是「JSON 長對了」，是**真的施放一次技能之後法力歸零** ——
 * 光環把 hook 掛到圈內敵人身上、`castAbility` 發 `onAbilityCast`、
 * `spendMana` 把現存法力扣光。任何一環斷掉都會紅。
 */
describe("【魔力全失】—— 純 JSON：靈氣 × onAbilityCast × spendMana", () => {
  const DREAD = "dw-dread.passive" as AbilityId;
  const DREAD_KING = "dw-dread-king" as ChampionId;

  beforeEach(() => {
    Abilities.register(DREAD, {
      id: DREAD,
      name: DREAD,
      slot: "PASSIVE",
      innateKind: "passive",
      castType: "self",
      maxRank: 1,
      cooldown: [0],
      manaCost: [0],
      range: 0,
      effects: [],
      passive: {
        ranks: [
          {
            modifiers: [],
            auras: [
              {
                key: "dread",
                radius: 8,
                affects: "enemy",
                // chance 1 = 出貨的 0.12 換成必定觸發，這樣測的是**機制**不是骰子。
                hooks: [
                  {
                    on: "onAbilityCast",
                    chance: 1,
                    effects: [
                      { kind: "spendMana", amount: { flat: 0 }, pctCurrentMana: 1, applyTo: "self" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as AbilityDef);
    const thorne = Champions.get("thorne" as ChampionId);
    Champions.register(DREAD_KING, {
      ...thorne,
      id: DREAD_KING,
      passiveAbility: DREAD,
    } as unknown as ChampionDef);
  });

  it("敵方在圈內施放技能 → 法力歸零；圈外的敵人不受影響", () => {
    const w = new SimWorld(SKELETON_ARENA, 7);
    w.combatActive = true;
    let s = 500;
    const at = (dz: number, team: 0 | 1, cid: ChampionId): EntityId =>
      spawnChampion(w, {
        championId: cid,
        seatId: asSeatId(s++),
        teamId: asTeamId(team),
        pos: P(dz),
        zone: 0,
      });
    at(0, 0, DREAD_KING);
    const near = at(2, 1, PLAIN);
    const far = at(20, 1, PLAIN);
    w.step(NO_INTENTS); // 光環對齊：hook 掛到圈內敵人身上
    w.step(NO_INTENTS);
    for (const id of [near, far]) {
      const hp = w.health.get(id)!;
      hp.mana = hp.maxMana;
    }
    expect(w.health.get(near)!.mana, "夾具：兩個人都有法力").toBeGreaterThan(0);

    // 真的按下 Q（thorne 的 Q 是 dash → 指一個點），走出貨的 `castAbility`。
    w.rebuildGrid();
    const aim = { type: "point" as const, point: P(10) };
    expect(castAbility(w, near, "Q", aim)).toBe("ok");
    expect(w.health.get(near)!.mana, "魔力全失 = 歸零，不是扣一半").toBe(0);

    expect(castAbility(w, far, "Q", aim)).toBe("ok");
    expect(w.health.get(far)!.mana, "20 單位外的敵人不在圈內").toBeGreaterThan(0);
  });
});

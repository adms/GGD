/**
 * 【吞噬】`devour` 的行為守衛（owner 2026-08-05，初號機 EX）。
 *
 * ── 四件事，而第三、四件是這個 kind 特有的陷阱 ─────────────────────────
 *
 *  ①  過線的目標**真的死了**（讀 `hp.alive`，不是讀「函式被呼叫過」）。
 *  ②  沒過線的目標**一根寒毛都沒動** —— 不是「掉了一點血」，是 0。
 *      ⛔ 一個「沒過線就打一點傷害」的實作在畫面上看起來很像正常，
 *      而它把一發處決變成一發雞肋傷害。
 *  ③  ⛔ **帶護盾的目標照樣被吞死。** 致死量只算 `hp.hp` 的話，護盾會吃掉一部分
 *      → 他不會死，而技能卡上寫著「即死」。花 60 秒冷卻 + 140 魔力換
 *      「他掉了一點血」是這一族最貴的一種失敗形態 ②。
 *  ④  回復的是**吞下去的生命**，不是生命＋護盾。owner 寫的是「回復等值生命」。
 *
 * ── 為什麼跑真的傷害佇列 ───────────────────────────────────────────────
 * 因為「死」在這個引擎裡是一整條路（賞金 / onKill / 掉金幣 / 結算），而
 * `devour.ts` 的整個設計就是**不重寫那條路**。直接讀 `hp.hp === 0` 會對一個
 * 「自己把血設成 0」的實作也過，而那種實作不會給賞金（失敗形態 ⑤）。
 *
 * ⚠️ 門檻與回復比例一律從測試自己建的 effect 讀，不抄 0.03 這種字面值
 *（CLAUDE.md：出貨數值住進測試＝第四個住處，而 owner 每週在改它們）。
 *
 * 突變紀錄（都真的做過，見 commit message）:
 *   · `if (hp.hp > hp.maxHp * pct) continue` 拿掉      → dev-below-line 紅
 *   · `throughShields` 那一項改成永遠不加護盾          → dev-through-shield 紅
 *   · `healTarget` 的 amount 改成 `lethal`（含護盾）   → dev-heal-is-life 紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import { combatResolveSystem } from "../combat/damage";
import { deathSystem } from "../systems/DeathSystem";
import { normalizeCombatEnv } from "../combatEnv";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;
/** 這一檔的處決線。從這裡推導斷言，不寫字面值進 expect。 */
const LINE = 0.1;

function stage(k = 1): { world: SimWorld; caster: EntityId; prey: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 13);
  world.combatActive = true;
  // ⚠️ 預設 k = 1 讓上面那幾條的算式看得懂 —— 但 **k = 1 是這個 seam 上唯一
  // 看不見「致死量被全域倍率縮放」那個缺陷的值**（`incomingReflect.test.ts`
  // 的檔頭逐字寫過同一件事）。所以最後一條把 k 參數化。
  world.combatEnv = normalizeCombatEnv({ damageDealt: k, healing: 1 });
  const caster = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  const prey = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: C.x + 2, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  return { world, caster, prey };
}

/** 把血設到「最大生命的 frac」。 */
function setHpFrac(world: SimWorld, id: EntityId, frac: number): number {
  const hp = world.health.get(id)!;
  hp.hp = hp.maxHp * frac;
  return hp.hp;
}

function devour(world: SimWorld, caster: EntityId, prey: EntityId, extra: object = {}): void {
  const ctx: EffectContext = {
    world,
    caster,
    rank: 1,
    targets: [prey],
    origin: "ability:test.ex",
    rng: world.rng,
  };
  runEffects(
    [{ kind: "devour", shape: "single", thresholdPctOfMax: [LINE], ...extra } as EffectDef],
    ctx,
  );
  // 走出貨的排空，所以死亡、賞金、onKill 全部照走。
  combatResolveSystem(world);
  // ⚠️ `alive` 是 `deathSystem` 翻的（`step()` 裡排在 combatResolve 之後）。
  // 少了這一行，斷言會讀到「血歸零但旗標還是 true」而誤判成沒吞死。
  deathSystem(world);
}

describe("devour —— 【吞噬】", () => {
  it("過了處決線就真的死，而且施法者回到等值的生命", () => {
    cover("dev-below-line");
    const { world, caster, prey } = stage();
    const devoured = setHpFrac(world, prey, LINE * 0.5); // 明確在線下
    const casterHp = world.health.get(caster)!;
    casterHp.hp = casterHp.maxHp * 0.2; // 挖個坑，否則回血被 maxHp 夾掉

    const before = casterHp.hp;
    devour(world, caster, prey);

    expect(world.health.get(prey)!.alive).toBe(false);
    // 「回復等值生命」—— 從吞下去的量推導，不寫字面值。
    expect(casterHp.hp - before).toBeCloseTo(devoured, 6);
  });

  it("⛔ 沒過線的目標一滴血都沒掉 —— 不是「掉一點」", () => {
    cover("dev-above-line");
    const { world, caster, prey } = stage();
    const hp0 = setHpFrac(world, prey, LINE * 2); // 明確在線上

    devour(world, caster, prey);

    expect(world.health.get(prey)!.alive).toBe(true);
    // ⚠️ 讀的是「一滴都沒掉」而不是「還活著」：一個「沒過線就打一點傷害」的
    // 實作對「還活著」也會過，而它把一發處決變成一發雞肋傷害。
    expect(world.health.get(prey)!.hp).toBeCloseTo(hp0, 6);
  });

  it("⛔ 帶護盾的目標照樣被吞死（否則卡上的「即死」是謊話）", () => {
    cover("dev-through-shield");
    const { world, caster, prey } = stage();
    const devoured = setHpFrac(world, prey, LINE * 0.5);
    const preyHp = world.health.get(prey)!;
    // 一片比殘血還厚的盾 —— 只算 hp 的致死量會被它整個吃掉。
    preyHp.shields.push({
      sourceId: "src:test-shield",
      amount: devoured * 5,
      expiresAtTick: world.tick + 300,
    });
    const casterHp = world.health.get(caster)!;
    casterHp.hp = casterHp.maxHp * 0.2;
    const before = casterHp.hp;

    devour(world, caster, prey);

    expect(world.health.get(prey)!.alive).toBe(false);
    // ④ 回復讀的是**生命**，不是生命＋護盾 —— owner 寫的是「回復等值生命」。
    cover("dev-heal-is-life");
    expect(casterHp.hp - before).toBeCloseTo(devoured, 6);
  });

  it("throughShields: false 是一個真的選項（帶盾就吞不死）", () => {
    cover("dev-shield-field");
    const { world, caster, prey } = stage();
    const devoured = setHpFrac(world, prey, LINE * 0.5);
    world.health.get(prey)!.shields.push({
      sourceId: "src:test-shield",
      amount: devoured * 5,
      expiresAtTick: world.tick + 300,
    });

    devour(world, caster, prey, { throughShields: false });

    // 盾擋下來了 —— 這是**刻意**的一個平衡選項，不是預設。
    expect(world.health.get(prey)!.alive).toBe(true);
  });

  it("⛔ 致死量不吃全域傷害倍率 —— k=0.5 的那一天處決仍然是處決", () => {
    cover("dev-ignores-global-mult");
    // ⚠️ 這一條是我在突變驗證時發現上面四條**全部漏掉**的那一個：
    // 它們把 k 釘在 1，而 `skipGlobalDamageMult` 在 k = 1 下是 no-op。
    // 後台戰鬥系統頁（#28）存在的意義就是動 k，所以這不是假想情境。
    const { world, caster, prey } = stage(0.5);
    setHpFrac(world, prey, LINE * 0.5);

    devour(world, caster, prey);

    // 少了 `skipGlobalDamageMult` 的話致死量只剩一半 → 他活著，而卡上寫著即死。
    expect(world.health.get(prey)!.alive).toBe(false);
  });
});

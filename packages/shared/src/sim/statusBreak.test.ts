/**
 * 【睡眠】受傷即醒的行為守衛（C4，#278）。
 *
 * ── 這一檔要釘死的三件事 ──────────────────────────────────────────────────
 *
 *  ①  真的**跑一發傷害**就醒 —— 不是「函式被呼叫過」，是打完之後那一筆
 *      status 不在 `st.effects` 裡。
 *
 *  ②  ⛔ **其他 status 必須還在**。這是 C4 與淨化的全部差別：一發把人打醒的
 *      攻擊順手解掉他身上的減速，那是替對手解圍，而畫面上看不出差別
 *      （突變：改成清空整個 `st.effects` → 這一條紅）。
 *
 *  ③  `breakOnDamageMin` 是一道**真的**門檻：低於它的一下打不醒。
 *      ⚠️ 門檻從測試自己建的 status 讀，不抄字面值。
 *
 * ── 為什麼走真的傷害管線 ──────────────────────────────────────────────────
 * 因為呼叫點在 `combat/damage.ts` 的傷害落地處，而「它有沒有被接上」正是
 * 七種失敗形態的第 ② 種最愛藏身的地方。直接呼叫 `breakStatusesOnDamage`
 * 只驗得到那支函式自己（失敗形態 ⑤：被測的不是出貨的那個）。
 *
 * 突變紀錄（都真的做過，見 commit message）:
 *   · `damage.ts` 的 `breakStatusesOnDamage(...)` 那一行刪掉 → sleep-wakes 紅
 *   · `filter(...)` 改成 `st.effects = []`                    → sleep-others-stay 紅
 *   · `amount >= (e.breakOnDamageMin ?? 0)` → `true`          → sleep-threshold 紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { combatResolveSystem } from "./combat/damage";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import type { StatusEffect } from "./components";

const C = SKELETON_ARENA.zones[0]!.center;

beforeAll(() => registerSkeletonContent());

/** 每一條開一個新世界：同一場裡連打兩發，第二發的血量前提就變了。 */
function stage(): { world: SimWorld; hero: EntityId; foe: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 3);
  world.combatActive = true;
  const hero = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  const foe = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: C.x + 2, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  return { world, hero, foe };
}

function put(
  world: SimWorld,
  id: EntityId,
  statusId: string,
  extra: Partial<StatusEffect> = {},
): void {
  const st = world.status.get(id) ?? { effects: [] };
  st.effects.push({
    statusId: statusId as StatusEffect["statusId"],
    sourceId: `src:${statusId}`,
    expiresAtTick: world.tick + 300,
    ...extra,
  });
  world.status.set(id, st);
}

function ids(world: SimWorld, id: EntityId): string[] {
  return (world.status.get(id)?.effects ?? []).map((e) => String(e.statusId)).sort();
}

/**
 * 一發乾淨的真傷（不吃護甲/暴擊，所以「實際扣掉多少」就是傳進去的數），
 * 走**出貨的**傷害佇列 + 解算系統 —— 不是直接呼叫那支函式。
 */
function hit(world: SimWorld, src: EntityId, target: EntityId, amount: number): void {
  world.damageQueue.push({ source: src, target, amount, type: "true", crit: false, origin: "mob" });
  combatResolveSystem(world);
}

describe("睡眠 —— 受傷即醒（C4）", () => {
  it("一發傷害之後,那一筆 status 就不在了", () => {
    cover("sleep-wakes");
    const { world, hero, foe } = stage();
    put(world, hero, "sleep", { stun: true, breakOnDamage: true });
    expect(ids(world, hero)).toEqual(["sleep"]);

    hit(world, foe, hero, 50);

    expect(ids(world, hero)).toEqual([]);
  });

  it("⛔ 打醒的那一發不會順手解掉身上的其他 status", () => {
    cover("sleep-others-stay");
    const { world, hero, foe } = stage();
    put(world, hero, "sleep", { stun: true, breakOnDamage: true });
    put(world, hero, "slow", { moveSpeedMult: 0.7 });
    put(world, hero, "curse", { missChance: 0.3 });

    hit(world, foe, hero, 50);

    // 睡眠走了,減速與詛咒**還在** —— 這是 C4 與淨化的全部差別。
    expect(ids(world, hero)).toEqual(["curse", "slow"]);
  });

  it("breakOnDamageMin 是一道真的門檻:低於它的一下打不醒", () => {
    cover("sleep-threshold");
    // ⚠️ 門檻從夾具讀,不抄字面值（CLAUDE.md：驗機制不驗數字）。
    const MIN = 40;

    const small = stage();
    put(small.world, small.hero, "sleep", {
      stun: true,
      breakOnDamage: true,
      breakOnDamageMin: MIN,
    });
    hit(small.world, small.foe, small.hero, MIN - 1);
    expect(ids(small.world, small.hero)).toEqual(["sleep"]);

    // 同一個世界設定、同一筆 status,只有這一發的大小不同 → 結果相反。
    const big = stage();
    put(big.world, big.hero, "sleep", {
      stun: true,
      breakOnDamage: true,
      breakOnDamageMin: MIN,
    });
    hit(big.world, big.foe, big.hero, MIN);
    expect(ids(big.world, big.hero)).toEqual([]);
  });
});

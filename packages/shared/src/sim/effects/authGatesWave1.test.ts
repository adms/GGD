/**
 * GH#299 第一輪「授權格」的**行為**守衛 —— 六個機制，一支檔案。
 *
 * owner 2026-08-09：
 *
 * > 「引擎會做那件事，但 JSON 上沒有那一格可以填，所以作者寫不出來。=> **請修正**」
 *
 * 一支檔案守六個機制，理由與 `lane2Kinds.test.ts` 逐字相同：它們是**同一個形狀
 * 的六個實例** —— 引擎那一半早就在跑，缺的只是 schema 上一格 + 一行轉發
 *（第零守則⑨：K 個模板 + 一張表，不是 N 輪）。
 *
 * ⛔ 每一條讀的都是**最終世界狀態**（`hp.hp` / `hp.shields` / `world.flight` /
 * `status.effects[].expiresAtTick`），不是「Zod 收不收得下」。
 * 一條只驗 schema 的斷言對「schema 開了、handler 沒接」是全綠的 —— 那正是
 * 這一批要修的缺陷的**鏡像**（CLAUDE.md 失敗形態⑤：被測的不是出貨的那個）。
 *
 * ⚠️ 出貨數值一個都沒有進斷言（第二守則：驗機制不驗數字）。每一條的參照量
 * 都是**同一次執行的另一半**（有 vs 沒有、rank 1 vs rank 3、自己 vs 目標）。
 *
 * ── 突變紀錄（每一條的承重那一行改壞 → 紅 → 改回來）─────────────────────
 *  · G2  `applyStatus.ts` 的 `rankScalar(e.duration, ctx.rank)` → `rankScalar(e.duration, 1)`
 *      → 紅：「rank 3 的持續時間與 rank 1 相同 = 逐階欄位沒有被讀到」
 *  · G11 `damage.ts` 的 `const subjects = e.applyTo === "self" ? …` → `= ctx.targets`
 *      → 紅：「applyTo:"self" 沒有打到施法者自己」
 *  · S1  `damage.ts::addShield` 的 `if (stack !== undefined)` 整段拿掉
 *      → 紅：「同一個 stackKey 疊出了第二片盾 = 不疊加政策沒有生效」
 *  · S2  `damageArea.ts` 的 `amount += resourcePctAmount(...)` 拿掉
 *      → 紅：「帶 resourcePct 與不帶打出同樣的傷害 = 那一項被吃掉了」
 *  · S11 `sourceGrants.ts` 的 `...(from.flight !== undefined ? …)` 拿掉
 *      → 紅：「限時飛行沒有生效 = 轉發那一行沒有把 flight 交出去」
 *      ⭐ **這一條第一次寫的時候是綠的，而那才是這輪唯一有資訊量的發現。**
 *      初版用 `attachSource` 手寫一個帶 `flight` 的 source，於是它驗到的是
 *      「`flightSystem` 讀不讀得懂 `source.flight`」—— 那件事從第一天就是真的，
 *      被這一批修掉的是**它前面那一段轉發**。改成跑真的 `applyBuff` 效果之後
 *      同一個突變才紅。CLAUDE.md 失敗形態⑤逐字：**被測的不是出貨的那個**。
 *  · G3  兩個上界改回 12 / 5
 *      → 紅：「damageArea 半徑 14（已換算的合法值）被擋下來了」
 *  · G3-硬控 `refineHardCcDuration` 的 `if (flags.length === 0) return;` 改成無條件 return
 *      → 紅：「24 秒的暈眩竟然收了」—— 而放寬那一條（24 秒的計數視窗）仍然綠，
 *        這正是為什麼**兩條都要寫**：只驗其中一邊分不出「一個上界」與「兩個」。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { flightSystem } from "../flight";
import { runEffects } from "./effectRunner";
import { zEffectDef } from "../../content/schema/effect";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

/** 一個施法者 + 一個 2 單位外的敵人。兩邊都是 SELA，所以差別只來自被測的那一格。 */
function stage(): { world: SimWorld; caster: EntityId; foe: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 20260809);
  world.combatActive = true;
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  const mk = (seat: number, team: number, dx: number): EntityId =>
    spawnChampion(world, {
      championId: SELA.id as ChampionId,
      seatId: asSeatId(seat),
      teamId: asTeamId(team),
      pos: { x: C.x + dx, z: C.z },
      zone: 0,
    });
  const caster = mk(0, 0, 0);
  const foe = mk(1, 1, 2);
  world.step(new Map());
  return { world, caster, foe };
}

function run(w: SimWorld, caster: EntityId, targets: EntityId[], fx: EffectDef[], rank = 1): void {
  const ctx: EffectContext = {
    world: w,
    caster,
    rank,
    targets,
    origin: "ability:test.wave1",
    rng: w.rng,
  };
  runEffects(fx, ctx);
}

describe("GH#299 第一輪授權格 —— 六個機制的行為", () => {
  it("G2 逐階：同一份文件在 rank 3 掛出比 rank 1 更久的狀態", () => {
    cover("g2-per-rank-duration");
    const held = (rank: number): number => {
      const { world, caster, foe } = stage();
      run(world, caster, [foe], [{ kind: "applyStatus", statusId: "slow", duration: [2, 4, 8] }], rank);
      const st = world.status.get(foe)!.effects.find((e) => e.statusId === "slow");
      expect(st, "狀態根本沒掛上").toBeDefined();
      return st!.expiresAtTick - world.tick;
    };
    expect(
      held(3),
      "rank 3 的持續時間沒有比 rank 1 長 = 逐階欄位沒有被讀到（只讀了第一格）",
    ).toBeGreaterThan(held(1));
  });

  it("G11 施法者付自己的血：applyTo:\"self\" 扣自己、不扣目標", () => {
    cover("g11-damage-apply-to-self");
    const { world, caster, foe } = stage();
    const before = { me: world.health.get(caster)!.hp, foe: world.health.get(foe)!.hp };
    run(world, caster, [foe], [
      { kind: "damage", applyTo: "self", damageType: "true", amount: { flat: 50 } },
    ]);
    world.step(new Map()); // 傷害走佇列，要跑一個 tick 才落地
    expect(world.health.get(caster)!.hp, "applyTo:\"self\" 沒有打到施法者自己").toBeLessThan(
      before.me,
    );
    expect(world.health.get(foe)!.hp, "自傷竟然也打到了目標").toBe(before.foe);
  });

  it("S1 護盾不疊加：同一個 stackKey 只留一片", () => {
    cover("s1-shield-stack-key");
    const pools = (stackKey?: string): number => {
      const { world, caster } = stage();
      const fx: EffectDef = {
        kind: "shield",
        amount: { flat: 300 },
        duration: 10,
        ...(stackKey !== undefined ? { stackKey, onExisting: "replace" as const } : {}),
      };
      run(world, caster, [caster], [fx]);
      run(world, caster, [caster], [fx]);
      return world.health.get(caster)!.shields.length;
    };
    // 兩個方向一起讀：沒填 key 照舊疊兩片（既有內容逐字不變），填了就只有一片。
    expect(pools(undefined), "沒填 stackKey 的行為被改掉了").toBe(2);
    expect(pools("barrier"), "同一個 stackKey 疊出了第二片盾 = 不疊加政策沒有生效").toBe(1);
  });

  it("S2 範圍技讀得到資源百分比：帶 resourcePct 打得比不帶痛", () => {
    cover("s2-area-resource-pct");
    const dealt = (withTerm: boolean): number => {
      const { world, caster, foe } = stage();
      const before = world.health.get(foe)!.hp;
      run(world, caster, [], [
        {
          kind: "damageArea",
          damageType: "true",
          amount: { flat: 10 },
          radius: 6,
          includeOrigin: true,
          ...(withTerm
            ? {
                resourcePct: {
                  subject: "target" as const,
                  resource: "health" as const,
                  basis: "max" as const,
                  perRank: [0.1],
                },
              }
            : {}),
        },
      ]);
      world.step(new Map());
      return before - world.health.get(foe)!.hp;
    };
    expect(dealt(false), "範圍技根本沒打到人").toBeGreaterThan(0);
    expect(
      dealt(true),
      "帶 resourcePct 與不帶打出同樣的傷害 = 那一項被 handler 吃掉了",
    ).toBeGreaterThan(dealt(false));
  });

  /**
   * ⛔ 這一條**一定要跑真的 `applyBuff` 效果**，不可以用 `attachSource` 手寫一個
   * 帶 `flight` 的 source —— 實測過：那樣寫的版本在把
   * `sourceGrants.ts` 的 `flight` 轉發整行刪掉之後**仍然全綠**（失敗形態⑤：
   * 被測的不是出貨的那個）。出貨的路是
   * `EffectDef.applyBuff.flight` → `applyBuff.ts::sourceGrants(e)` → source。
   */
  it("S11 限時飛行：applyBuff 授予得起，來源沒了就落地", () => {
    cover("s11-buff-grants-flight");
    const { world, caster } = stage();
    run(world, caster, [caster], [
      {
        kind: "applyBuff",
        applyTo: "target",
        modifiers: [],
        duration: 5,
        flight: { hoverHeight: 1.5, ignoreUnits: true },
      },
    ]);
    flightSystem(world);
    expect(world.flight.has(caster), "限時飛行沒有生效 = 轉發那一行沒有把 flight 交出去").toBe(
      true,
    );
    // 到期那一半：拔掉來源之後同一支系統必須把它收回去（⛔ 不需要第二支掃描器）。
    const stats = world.stats.get(caster)!;
    stats.sources = stats.sources.filter((s) => s.flight === undefined);
    flightSystem(world);
    expect(world.flight.has(caster), "來源沒了還在飛 = 到期收不回來").toBe(false);
  });

  it("G3 上界：已換算的合法值收得下，沒換算的 WC3 原始值仍然擋得住", () => {
    cover("g3-ceilings-admit-real-content");
    const ok = (fx: unknown): boolean => zEffectDef.safeParse(fx).success;
    const area = (radius: number): unknown => ({
      kind: "damageArea",
      amount: { flat: 10 },
      radius,
    });
    const reflect = (pct: number): unknown => ({
      kind: "damage",
      amount: { flat: 0 },
      incomingPct: { perRank: [pct] },
    });
    // 收得下：都是**已經換算過**的 GGD 值 / owner 文案裡的倍率。
    expect(ok(area(14)), "damageArea 半徑 14（已換算的合法值）被擋下來了").toBe(true);
    expect(ok(reflect(7)), "反彈 7 倍（owner 的 20-002 文案）被擋下來了").toBe(true);
    // 仍然擋得住：沒換算的 WC3 原始長度、與多打一個零的反彈比。
    expect(ok(area(300)), "沒換算的 WC3 半徑 300 竟然收了").toBe(false);
    expect(ok(reflect(200)), "「200」打在該寫 2.00 的格子裡竟然收了").toBe(false);
  });

  it("G3 硬控仍然關在 20 秒，其餘狀態才放到 60", () => {
    cover("g3-hard-cc-ceiling");
    const status = (over: Record<string, unknown>): unknown => ({
      kind: "applyStatus",
      statusId: "slow",
      ...over,
    });
    const ok = (fx: unknown): boolean => zEffectDef.safeParse(fx).success;
    // 這兩條是同一個數字、不同的狀態 —— 只驗其中一邊分不出「一個上界」與「兩個」。
    expect(ok(status({ duration: 24 })), "24 秒的計數視窗仍然被擋（放寬沒生效）").toBe(true);
    expect(ok(status({ duration: 24, stun: true })), "24 秒的暈眩竟然收了").toBe(false);
  });
});

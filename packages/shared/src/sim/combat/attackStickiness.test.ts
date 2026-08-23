/**
 * ⭐ 「**被普攻的時候好像會被角色黏住走不了**」（owner 2026-08-23）的閘。
 *
 * ⛔ 它量的是**淨位移**，不是「身上有沒有狀態」—— 那是 owner 的原話裡唯一的判準，
 * 也是這一次量下去才發現根因是 `hitstop`（⛔ 不是減速、⛔ 不是碰撞推擠）的原因。
 * 完整的量測結果與那一格後台開關在 `combat/hitstopHold.ts` 的檔頭。
 *
 * ⚠️ 儀器必須活著：一位**沒有被打**的英雄也走得動，所以斷言旁邊要有
 * 「攻擊真的落在他身上」＋「定格真的上了值」兩條對照，否則「攻擊者根本打不到」
 * 也會讓這條測試變綠（失敗形狀 ④：斷言方向與缺陷無關）。
 *
 * 突變紀錄：把 `MovementSystem` 的 `hitstopHoldsBody(world, id)` 改回
 * `(world.hitstop.get(id) ?? 0) > 0` → 完全動不了的 tick 從 0 變 28，第一條紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { Stat } from "../stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import type { IntentFrame } from "../intents";
import { combatFeelFromDoc, COMBAT_FEEL_SCHEMA } from "../combatFeel";

beforeAll(() => registerSkeletonContent());

const ZC = SKELETON_ARENA.zones[0]!.center;
const ME = asSeatId(0);
/** 攻速拉高 = 定格連段的密度拉高;⛔ 不是斷言裡的數字,只是把窗口壓短。 */
const FAST_ATTACK_SPEED = 4;

interface Run {
  /** 位移小於意圖 5% 的 tick 數 —— 「走不了」就是這個。 */
  frozen: number;
  /** 這位英雄身上真的上過定格的 tick 數(儀器)。 */
  hitstopTicks: number;
  /** 真的挨了幾發(儀器)。 */
  hits: number;
  /** 前 45 tick(1.5 秒,門檻之前)往 −x 的淨位移 —— 保險絲跳之前的黏住證據。 */
  dxEarly: number;
  /** 整段往 −x 的淨位移 —— 「真的動得了」量的是這個,⛔ 不是狀態表。 */
  dxTotal: number;
  /** 場上冒出過幾發「掙脫」(floatingText;儀器)。 */
  releaseCues: number;
}

/**
 * 一位英雄一路往 −x 走 `T` tick,同時被 `n` 個貼身的敵人持續普攻。
 * `worstCase` = `holdsVictimWalk: true`（G1 修好之前的行為,保險絲的最壞情況）
 * ＋ 攻速逐人錯開（volley 不同步 ⇒ 定格幾乎無縫連段）。
 */
function walkWhileBeaten(n: number, T = 90, worstCase = false): Run {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.combatActive = true;
  if (worstCase) {
    // 走**真的出貨路徑**(doc → normalize):stuckGuard 缺席 = 出貨預設(開)。
    world.combatFeel = combatFeelFromDoc({
      id: "combat-feel",
      schema: COMBAT_FEEL_SCHEMA,
      hitstop: { holdsVictimWalk: true, holdsAttackerWalk: true },
    });
  }
  const me = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: ME,
    teamId: asTeamId(0),
    pos: { x: ZC.x + 10, z: ZC.z },
    zone: 0,
  });
  const foes: EntityId[] = [];
  for (let k = 0; k < n; k++) {
    foes.push(
      spawnChampion(world, {
        championId: "sela" as ChampionId,
        seatId: asSeatId(1 + k),
        teamId: asTeamId(1),
        pos: { x: ZC.x + 11.4, z: ZC.z + k },
        zone: 0,
      }),
    );
  }
  const hp = world.health.get(me)!;
  const out: Run = { frozen: 0, hitstopTicks: 0, hits: 0, dxEarly: 0, dxTotal: 0, releaseCues: 0 };
  const startX = world.transform.get(me)!.pos.x;
  for (let i = 0; i < T; i++) {
    hp.hp = hp.maxHp; // 不讓他死 —— 死了就不是「走不了」而是「沒有身體」
    const t = world.transform.get(me)!;
    const before = { x: t.pos.x, z: t.pos.z };
    // 攻擊者每 tick 釘在他**後方**(+x)一個身位:攻擊一定打得到,而且推擠的方向
    // 和逃跑方向相反 ⇒ ⛔ 分離推擠不會把淨位移灌水。
    for (let k = 0; k < foes.length; k++) {
      const f = foes[k]!;
      const st = world.stats.get(f)!;
      // worstCase 時逐人錯開攻速:volley 不同步 ⇒ 定格空檔壓到最小(無縫連段)。
      st.final[Stat.AttackSpeed] = worstCase ? 3 + k * 0.35 : FAST_ATTACK_SPEED;
      st.final[Stat.MoveSpeed] = 1e-9;
      world.transform.get(f)!.pos = { x: before.x + 1.2, z: before.z };
    }
    const intents = new Map<SeatId, IntentFrame>([
      [ME, { order: { kind: "move", point: { x: ZC.x - 12, z: ZC.z } }, commands: [] }],
    ]);
    world.step(intents);
    const after = world.transform.get(me)!.pos;
    const dx = after.x - before.x;
    const dz = after.z - before.z;
    const want = world.stats.get(me)!.final[Stat.MoveSpeed] * world.dt;
    if (dx * dx + dz * dz < want * want * 0.0025) out.frozen++;
    if ((world.hitstop.get(me) ?? 0) > 0) out.hitstopTicks++;
    for (const e of world.events) {
      if (e.type === "damage" && (e.data as { target?: EntityId }).target === me) out.hits++;
      if (e.type === "floatingText" && (e.data as { text?: string }).text === "掙脫")
        out.releaseCues++;
    }
    if (i === 44) out.dxEarly = startX - world.transform.get(me)!.pos.x;
  }
  out.dxTotal = startX - world.transform.get(me)!.pos.x;
  return out;
}

describe("被普攻不會把走位權拿走 (owner 2026-08-23)", () => {
  it("⭐ 被四個人貼身連打的英雄,沒有任何一個 tick 是完全動不了的", () => {
    const beaten = walkWhileBeaten(4);
    // 儀器:真的挨打了,而且定格真的上了值 —— 否則下面那條是空的
    expect(beaten.hits, "攻擊必須真的落在他身上").toBeGreaterThan(0);
    expect(beaten.hitstopTicks, "定格必須真的上了值(機制還在)").toBeGreaterThan(0);
    expect(beaten.frozen, "被普攻不可以讓玩家原地不動").toBe(0);
    // 出貨設定(挨打不按腳)下保險絲**備而不用**:不會有「掙脫」冒出來。
    expect(beaten.releaseCues, "保險絲在出貨設定下不該跳").toBe(0);
  });

  it("對照組:沒有人打他的時候也是 0 —— 這條測試不是被別的東西擋住", () => {
    expect(walkWhileBeaten(0).frozen).toBe(0);
  });
});

/**
 * ⭐ I1 黏住累積保險絲（owner 2026-08-23:「有一個累積值，黏超過 2秒一定可以
 * 離開之類」）。最壞情況 = `holdsVictimWalk: true`（一鍵 rollback 那一側）＋
 * 8 人攻速錯開圍毆 ⇒ 定格無縫連段。斷言量的是**淨位移**，⛔ 不是狀態表。
 *
 * 突變紀錄:把 `stuckGuardTick` 的累積那一行改壞（`st.held += 1` → `+= 0`）→
 * 保險絲永不跳,dxTotal 從 >5 掉到 <2,第一條紅並指名「2 秒後必須真的動得了」。
 */
describe("黏住累積保險絲 (owner 2026-08-23)", () => {
  it("⭐ 最壞情況(雙方定格全開+8人圍毆):2 秒後受害者真的動得了", () => {
    const r = walkWhileBeaten(8, 240, true);
    // 儀器:最壞情況真的成立 —— 有挨打、有定格、門檻之前是真的被黏住的
    expect(r.hits, "攻擊必須真的落在他身上").toBeGreaterThan(0);
    expect(r.hitstopTicks, "定格必須真的上了值").toBeGreaterThan(30);
    expect(r.dxEarly, "門檻(2秒)之前要是黏住的 —— 保險絲不可以把定格整個閹掉").toBeLessThan(2);
    // 主張:保險絲跳了,而且他**真的走掉了**(8 秒內至少一個釋放窗的距離)
    expect(r.releaseCues, "保險絲要真的跳(頭上冒「掙脫」)").toBeGreaterThan(0);
    expect(r.dxTotal, "2 秒後必須真的動得了(量淨位移)").toBeGreaterThan(5);
  });
});

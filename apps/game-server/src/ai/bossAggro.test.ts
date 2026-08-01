/**
 * bot 也優先打殭屍王 (#247, owner 2026-08-01 「殭屍王出現英雄/bot都會優先打殭屍王」).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼這一條非得住在 game-server 不可
 * ─────────────────────────────────────────────────────────────────────────────
 * 排序的規則住在 `@ggd/shared/sim/targeting`,而**玩家**那一半的守衛在
 * `packages/shared/src/sim/bossAggroRank.test.ts`。這裡是另外一半:bot 的腦
 * (`Tier0Brain`)是一個 SEAT DRIVER,住在這個 workspace,而且它跟玩家的差別是
 * 真的 —— 它有一個玩家沒有的 `AI_ENGAGE_RANGE = 48` 全場掃描 fallback。
 *
 * 「只做 bot 那條等於一半」,反過來也一樣。所以兩條都在,而且兩條都**驅動出貨的
 * 那顆腦**(`new AIDriver()` → `Seat.produceIntent`),不是重寫一份索敵迴圈
 * (失敗形態 ⑤),也不是掃 `Tier0Brain.ts` 的原始碼字串(失敗形態 ⑥)。
 *
 * 斷言讀的是**腦真的送出去的那張 intent frame**裡的 `order.entity` —— 也就是
 * 唯一會離開這顆腦的東西。腦內部算對了但送出別的東西,這裡會紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import {
  BOSS_AGGRO_RANK_ABSENT,
  mobRulesFromConfig,
  spawnMob,
  summonMobBoss,
  type MobRules,
} from "@ggd/shared/sim/mobs";
import { beginCombatMobs } from "@ggd/shared/sim/systems/MobSystem";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content/schema/config";
import { AIDriver } from "./Tier0Brain";
import { Seat } from "../seat/Seat";

beforeAll(() => registerSkeletonContent());

const ZONE = SKELETON_ARENA.zones[0]!;

/** The SHIPPED arena's mob rules, threshold dropped so a king can be summoned. */
function shippedRules(aggroRank?: number): MobRules {
  return mobRulesFromConfig(
    {
      ...DEFAULT_MOB_WAVES_CONFIG,
      boss: {
        ...DEFAULT_MOB_WAVES_CONFIG.boss!,
        killThreshold: 1,
        ...(aggroRank === undefined ? {} : { aggroRank }),
      },
    },
    3,
    1,
  );
}

/**
 * 一隻 bot、一位敵方英雄、一隻一般殭屍、一隻王。
 *
 * 敵方英雄 3 u、一般殭屍 1.5 u 且只剩 1 hp(#221 的 低血 與 最近 兩把鑰匙都指向
 * 雜魚,KEY 1 指向敵方英雄),王放在 `bossDist`。三個候選同時在場,所以排名沒生
 * 效的實作會給出**不同的 id**,不是同一個(失敗形態 ④)。
 *
 * ⚠️ `bossDist` 是參數而不是常數,因為 bot 的索敵是**兩段**的:
 * `acquireTarget(近半徑) ?? acquireTarget(AI_ENGAGE_RANGE = 48)`。實測 thorne 的
 * 近半徑是 6 u(近戰下限 `MELEE_ACQUIRE_FLOOR`),所以 4 u 的王走第一段、20 u 的
 * 王只能走 fallback —— 而第一段只要找到**任何**目標就 `??` 短路了。那個界線是
 * 這個功能真正的射程,下面第三條把它釘住並回報給 owner。
 */
function botSees(
  rules: MobRules,
  bossDist: number,
): { order: unknown; boss: EntityId; foe: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, 5);
  w.combatActive = true;
  w.economyOpen = false;
  beginCombatMobs(w, rules, [0]);

  const bot = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: ZONE.center.x, z: ZONE.center.z },
    zone: 0,
  });
  const foe = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: ZONE.center.x + 3, z: ZONE.center.z },
    zone: 0,
  });
  const zombie = spawnMob(w, 0, rules, 1, 0);
  const boss = summonMobBoss(w, 0, rules, bot, 100)!;
  w.transform.get(zombie)!.pos = { x: ZONE.center.x - 1.5, z: ZONE.center.z };
  w.health.get(zombie)!.hp = 1;
  w.transform.get(boss)!.pos = { x: ZONE.center.x, z: ZONE.center.z + bossDist };
  w.rebuildGrid();

  const seat = new Seat(asSeatId(0), asTeamId(0), new AIDriver());
  seat.entityId = bot;
  const frame = seat.produceIntent(w, w.tick);
  return { order: frame.order, boss, foe };
}

describe("bot 的目標選擇也把殭屍王排最前 (ai-boss-aggro)", () => {
  it("出貨設定下,bot 送出的 attackTarget 是王,不是 3 u 外的敵方英雄", () => {
    const { order, boss } = botSees(shippedRules(), 4);
    expect(order, "腦沒有送出任何指令").toBeTruthy();
    expect(order).toEqual({ kind: "attackTarget", entity: boss });
  });

  it("對照組:aggroRank 調回「跟一般殭屍同級」,同一場 bot 就選敵方英雄", () => {
    const { order, foe } = botSees(shippedRules(BOSS_AGGRO_RANK_ABSENT), 4);
    expect(order).toEqual({ kind: "attackTarget", entity: foe });
  });

  it("量到的射程界線:王在索敵半徑外時,排名再高也搶不走近處的敵方英雄", () => {
    // ⚠️ 這一條不是「應該這樣」,是**量出來的現況**,而且是要回報給 owner 的取捨。
    //
    // bot 的索敵是 `acquireTarget(近半徑 6) ?? acquireTarget(48)` —— 第一段只要
    // 回傳任何東西,`??` 就短路,第二段不會跑。所以一位 3 u 外的敵方英雄會讓
    // 20 u 外的王完全進不了候選集合,不管它排第幾。
    //
    // 玩家那一側是同一個界線(而且更緊):玩家沒有 48 的 fallback,索敵半徑就是
    // 自己的攻擊距離、下限 `MELEE_ACQUIRE_FLOOR = 6`。
    //
    // 也就是說「優先打王」的真正語意是「**在你本來就看得到的東西裡面**,王排第
    // 一」,不是「全場都會跑去打王」。把它變成後者需要一個新的欄位(王在場時的
    // 索敵半徑),那是一個 owner 該做的決定,不是這一條線該偷加的規則。
    const { order, foe } = botSees(shippedRules(), 20);
    expect(order).toEqual({ kind: "attackTarget", entity: foe });
  });
});

/**
 * 殭屍王的仇恨優先 (#247, owner 2026-08-01 實戰回饋):
 *
 *   「殭屍王出現英雄/bot都會優先打殭屍王 (因為獎勵很高)」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這一組守衛是對著哪幾種失敗形態寫的
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ⑤ 被測的不是出貨的那個 —— 玩家的自動索敵**不是**直接呼叫 `acquireTarget`,
 *    而是 `world.step()` 裡的 `orderSystem` 走完一整段「保留 / 換手 / 放手」的
 *    邏輯之後才寫進 `nav.attackTarget`。所以下面兩條 SHIPPED PATH 的案例跑的是
 *    完整的 `w.step()`,不是單獨呼叫比較器。單獨呼叫比較器的那幾條是**額外的**,
 *    用來把邊界(0.5「稍微優先」那一段)講清楚,不是用來取代它。
 *
 * ④ 斷言方向與缺陷無關 —— 場上永遠**同時**有三種東西:一隻王、一隻一般殭屍、
 *    一位敵方英雄,而且王被刻意放在**最遠**、血最滿。所以「排名沒生效」的實作
 *    會選到敵方英雄或雜魚,答案不同;如果只放王跟雜魚,連 #221 的舊排序也會過。
 *
 * ② / ③ 「刪掉還是綠的」 —— 每一條的對照組是**同一個世界、只改那一格後台欄位**
 *    (`aggroRank`),而且斷言的是「選到的是另一個 id」。把 `targetClassOf` 裡那
 *    一行改回 `TARGET_CLASS.mob` 常數,第 1、2、4、5 條會紅。
 *
 * ⚠️ bot 那一條**不在這個檔**,而且必須不在:bot 的腦住在
 * `apps/game-server/src/ai/Tier0Brain.ts`,它是一個不同的 workspace。真的驅動
 * 那顆腦的守衛在 `apps/game-server/src/ai/bossAggro.test.ts`。兩條都要,因為
 * 「只做 bot 那條等於一半」,反過來也一樣。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import {
  BOSS_AGGRO_RANK_ABSENT,
  mobAggroRank,
  mobRulesFromConfig,
  spawnMob,
  summonMobBoss,
  type MobRules,
} from "./mobs";
import { TARGET_CLASS } from "./summonRules";
import { acquireTarget, rankOf } from "./targeting";
import { beginCombatMobs } from "./systems/MobSystem";
import { DEFAULT_MOB_WAVES_CONFIG } from "../content/schema/config";

beforeAll(() => registerSkeletonContent());

const ZONE = SKELETON_ARENA.zones[0]!;

/**
 * The SHIPPED arena's own mob rules, with the king's kill threshold dropped to 1
 * so a test can summon one without farming 100 zombies.
 *
 * ⚠️ 從 `DEFAULT_MOB_WAVES_CONFIG` 轉出來,不是手寫一份 `MobRules`。手寫的
 * fixture 可以自己填 `aggroRank: -1` 然後永遠是綠的,而出貨文件根本沒填 ——
 * 那正是失敗形態 ⑤。這裡走的是 `mobRulesFromConfig`,也就是真的比賽走的那條路。
 */
function shippedRules(over: Partial<{ aggroRank: number }> = {}): MobRules {
  const cfg = {
    ...DEFAULT_MOB_WAVES_CONFIG,
    boss: {
      ...DEFAULT_MOB_WAVES_CONFIG.boss!,
      killThreshold: 1,
      ...(over.aggroRank === undefined ? {} : { aggroRank: over.aggroRank }),
    },
  };
  return mobRulesFromConfig(cfg, 3, 1);
}

interface Scene {
  w: SimWorld;
  seat: SeatId;
  me: EntityId;
  boss: EntityId;
  zombie: EntityId;
  foe: EntityId;
}

/**
 * 我站在中心;三個候選圍著我:
 *
 *   一般殭屍   1.6 u —— 最近,而且血最少(#221 的 低血/最近 兩把鑰匙都指向它)
 *   敵方英雄   2.6 u —— #221 的 KEY 1 冠軍(敵方英雄優先)
 *   殭屍王     4.2 u —— **最遠、血最滿**,除了新的排名以外沒有任何一把鑰匙選它
 *
 * 距離全部壓在近戰的 `MELEE_ACQUIRE_FLOOR`(6 u)之內,因為玩家的索敵半徑就是
 * 自己的攻擊距離、下限 6 —— 這一點本身是要回報給 owner 的取捨,見報告。
 */
function scene(rules: MobRules): Scene {
  const w = new SimWorld(SKELETON_ARENA, 7);
  w.combatActive = true;
  beginCombatMobs(w, rules, [0]);
  const seat = asSeatId(0);
  const me = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: seat,
    teamId: asTeamId(0),
    pos: { x: ZONE.center.x, z: ZONE.center.z },
    zone: 0,
  });
  const foe = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: ZONE.center.x + 2.6, z: ZONE.center.z },
    zone: 0,
  });
  const zombie = spawnMob(w, 0, rules, 1, 0);
  const boss = summonMobBoss(w, 0, rules, me, 100)!;
  expect(boss, "summonMobBoss returned null — the fixture never armed a king").not.toBeNull();

  // Place the three candidates by hand. `spawnMob`/`summonMobBoss` scatter their
  // bodies around the rim, which would make DISTANCE the thing under test.
  w.transform.get(zombie)!.pos = { x: ZONE.center.x - 1.6, z: ZONE.center.z };
  w.transform.get(boss)!.pos = { x: ZONE.center.x, z: ZONE.center.z + 4.2 };
  // 一般殭屍血最少 → 舊排序的「低血優先」會指向它
  const zh = w.health.get(zombie)!;
  zh.hp = 1;
  w.rebuildGrid();
  return { w, seat, me, boss, zombie, foe };
}

/** 走完整條出貨路徑的一 tick:玩家什麼指令都沒下(自動索敵就是為這種人存在的)。 */
function stepIdle(s: Scene): void {
  s.w.step(new Map([[s.seat, { commands: [] }]]));
}

describe("殭屍王仇恨優先 (mob-boss-aggro)", () => {
  it("SHIPPED PATH:玩家什麼都沒點,一整個 step() 之後打的是王,不是敵方英雄", () => {
    cover("mob-boss-aggro");
    const s = scene(shippedRules());
    stepIdle(s);
    const nav = s.w.nav.get(s.me)!;
    expect(nav.attackTarget, "自動索敵沒有選王").toBe(s.boss);
    expect(nav.attackTargetAuto, "這一格必須是自動索的,不是玩家點的").toBe(true);
    // 而且不是「碰巧只有王可以打」——另外兩個也都是合法目標
    expect(rankOf(s.w, s.me, s.foe), "敵方英雄本來就該是合法目標").not.toBeNull();
    expect(rankOf(s.w, s.me, s.zombie), "一般殭屍本來就該是合法目標").not.toBeNull();
  });

  it("SHIPPED PATH 的對照組:把 aggroRank 調回「跟一般殭屍同級」,同一場就選錯", () => {
    cover("mob-boss-aggro");
    // 只有這一格不同。若 `targetClassOf` 沒有真的讀這個欄位,兩場的答案會一樣。
    const s = scene(shippedRules({ aggroRank: BOSS_AGGRO_RANK_ABSENT }));
    stepIdle(s);
    expect(s.w.nav.get(s.me)!.attackTarget, "關掉排名之後應該回到 #221 的敵方英雄優先").toBe(
      s.foe,
    );
  });

  it("已經在打別人的人,王一出現也會轉頭 —— 排名在 beatsForSwap 的穩定前綴裡", () => {
    cover("mob-boss-aggro");
    // 先在**沒有王**的場上讓自動索敵咬住敵方英雄
    const rules = shippedRules();
    const w = new SimWorld(SKELETON_ARENA, 7);
    w.combatActive = true;
    beginCombatMobs(w, rules, [0]);
    const seat = asSeatId(0);
    const me = spawnChampion(w, {
      championId: "thorne" as ChampionId,
      seatId: seat,
      teamId: asTeamId(0),
      pos: { x: ZONE.center.x, z: ZONE.center.z },
      zone: 0,
    });
    const foe = spawnChampion(w, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(1),
      teamId: asTeamId(1),
      pos: { x: ZONE.center.x + 2.6, z: ZONE.center.z },
      zone: 0,
    });
    w.rebuildGrid();
    w.step(new Map([[seat, { commands: [] }]]));
    expect(w.nav.get(me)!.attackTarget, "前置條件:應該先咬住敵方英雄").toBe(foe);

    // …王現在才降臨。握著目標的人走的是 OrderSystem 的 `held` 分支,那一條只看
    // 穩定前綴(forced / kind / threat)。少了 kind 這一格,他會抱著敵方英雄不放。
    const boss = summonMobBoss(w, 0, rules, me, 100)!;
    w.transform.get(boss)!.pos = { x: ZONE.center.x, z: ZONE.center.z + 4.2 };
    w.rebuildGrid();
    w.step(new Map([[seat, { commands: [] }]]));
    expect(w.nav.get(me)!.attackTarget, "王降臨了,握著的目標沒有換手").toBe(boss);
  });

  it("0.5 =「稍微優先」:敵方英雄仍然贏,但王贏過一般殭屍", () => {
    cover("mob-boss-aggro");
    const s = scene(shippedRules({ aggroRank: 0.5 }));
    // 有敵方英雄在的時候,王讓位 —— 這一格就是「被追殺時不轉頭」的那個設定
    expect(acquireTarget(s.w, s.me, 48)!.id).toBe(s.foe);
    // 敵方英雄離場之後,王仍然贏過更近、血更少的一般殭屍
    s.w.destroy(s.foe);
    s.w.rebuildGrid();
    expect(acquireTarget(s.w, s.me, 48)!.id).toBe(s.boss);
  });

  it("排名的三個代表值,以及出貨值就是 owner 的字面讀法", () => {
    cover("mob-boss-aggro");
    // −1 出貨:比敵方英雄(0)更前面
    expect(DEFAULT_MOB_WAVES_CONFIG.boss?.aggroRank).toBe(-1);
    expect(DEFAULT_MOB_WAVES_CONFIG.boss!.aggroRank!).toBeLessThan(TARGET_CLASS.champion);
    // 上界 2 就是「關掉」:跟一般殭屍同級
    expect(BOSS_AGGRO_RANK_ABSENT).toBe(TARGET_CLASS.mob);
    // 解析器:只有 boss 那一種吃這個欄位,一般/特殊殭屍永遠是小怪那一階
    const armed = shippedRules();
    expect(mobAggroRank(armed, "boss")).toBe(-1);
    expect(mobAggroRank(armed, "normal")).toBe(TARGET_CLASS.mob);
    expect(mobAggroRank(armed, "special")).toBe(TARGET_CLASS.mob);
    // 沒有 arena 的世界(單元測試的探針)必須降級成今天的行為,不是 NaN
    expect(mobAggroRank(null, "boss")).toBe(BOSS_AGGRO_RANK_ABSENT);
  });
});

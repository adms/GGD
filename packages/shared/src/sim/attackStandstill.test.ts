/**
 * 打就站定 (standstill) —— 出貨路徑上的守衛。
 *
 * owner 2026-07-28:「遠程單位在攻擊的時候可以邊移動邊攻擊,這樣對近戰單位來說
 * 是不公平的」/「並且殭屍王也會預設套用」/「整體這個功能在後台也是個開關」。
 *
 * 這一份**不**測 `standstillBlocks` 那支純函式(它的單元測試在
 * combatFeel.test.ts),而是測真的 `world.step()`:走位的人有沒有真的打不出
 * `damage` 事件、站定的人有沒有真的打得出來、殭屍有沒有一起被綁住。
 *
 * 儀器必須活著:每一條「打不出來」的斷言旁邊都有一條「同一個設定下站定就打得
 * 出來」的對照,否則「因為根本沒進戰鬥所以沒有傷害」也會讓測試變綠(失敗形狀
 * ④:斷言方向與缺陷無關)。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { DEFAULT_COMBAT_FEEL, standstillBlocks } from "./combatFeel";
import { Stat } from "./stats/statTypes";
import { spawnMob, MONSTER_TEAM, MOB_MODEL_KEY, type MobRules } from "./mobs";
import { beginCombatMobs } from "./systems/MobSystem";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

beforeAll(() => registerSkeletonContent());

const Z0 = SKELETON_ARENA.zones[0]!;
const ZC = Z0.center;
const Y = 14; // pillar-free band (same as combatJuice.test.ts)
const empty = (): Map<SeatId, IntentFrame> => new Map();

function makeWorld(): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, 7);
  w.combatActive = true;
  return w;
}

const ME = asSeatId(0);

/** 一位近戰英雄 + 一個木樁。 */
function duel(world: SimWorld, mePos = { x: ZC.x, z: Y }): { me: EntityId; foe: EntityId } {
  const me = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: ME,
    teamId: asTeamId(0),
    pos: { ...mePos },
    zone: 0,
  });
  const foe = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: mePos.x + 1.2, z: mePos.z },
    zone: 0,
  });
  world.stats.get(foe)!.final[Stat.MoveSpeed] = 1e-9; // 木樁不追人
  return { me, foe };
}

/** 玩家這一 tick 送出的 move 指令(真正的出貨輸入路徑,不是直接改 nav)。 */
function moveOrder(point: { x: number; z: number }): Map<SeatId, IntentFrame> {
  return new Map<SeatId, IntentFrame>([[ME, { order: { kind: "move", point }, commands: [] }]]);
}

/**
 * 跑 N tick,回傳 `me` 打出的普攻命中次數。
 *
 * ⚠️ 每 tick 把木樁**釘在攻擊者身旁 1.2**。這是這組測試最重要的一行:不釘的話
 * 「走遠了打不到」也會讓命中數變成 0(失敗形狀 ④ —— 斷言方向與缺陷無關)。
 * 釘住之後,唯一的變數就是「攻擊者這一 tick 有沒有在動」。
 * 木樁的血每 tick 補滿,速度壓到 0,所以它不會死也不會追。
 */
function run(
  world: SimWorld,
  me: EntityId,
  foe: EntityId,
  ticks: number,
  intentsOf?: () => Map<SeatId, IntentFrame>,
): number {
  let hits = 0;
  const foeHp = world.health.get(foe)!;
  for (let i = 0; i < ticks; i++) {
    foeHp.hp = foeHp.maxHp;
    world.stats.get(foe)!.final[Stat.MoveSpeed] = 1e-9;
    const meT = world.transform.get(me)!;
    world.transform.get(foe)!.pos = { x: meT.pos.x + 1.2, z: meT.pos.z };
    world.step(intentsOf ? intentsOf() : empty());
    for (const e of world.events) {
      const d = e.data as { source?: EntityId; origin?: string };
      if (e.type === "damage" && d.source === me && d.origin === "basic") hits++;
    }
  }
  return hits;
}

/** 一直往遠離木樁(木樁永遠在 +x)的方向走 —— 風箏。 */
function kiteAway(world: SimWorld, me: EntityId): Map<SeatId, IntentFrame> {
  const p = world.transform.get(me)!.pos;
  return moveOrder({ x: p.x - 6, z: p.z });
}

/**
 * 繞圈 / 走 A —— 幾乎垂直於木樁方向、只帶一點點內縮的走位。
 *
 * ⚠️ 為什麼不是「純垂直」(dir = 純 ±z)。tick 是離散的:純切線位移在幾何上一定
 * 會把距離拉開一點點(弦比半徑長),量出來的靠近速度是 **−0.95**,也就是被歸類
 * 成「後退」。那樣寫出來的測試會綠 —— 但它綠的理由和這條規則無關(失敗形狀 ④),
 * 我第一版就是這樣寫的,放寬成 `< 0` 的突變照樣活著。
 *
 * 真正能把 `closingSpeed < walkEps`(出貨)和 `closingSpeed < 0`(放寬)分開的,
 * 是「**確實在靠近、但靠得比走路門檻慢**」這個形狀 —— 也就是玩家一邊繞一邊
 * 慢慢貼上去。實測(移速 2.0、方向 (0.2, 1)):
 *
 *     |vel| = 2.0 > walkEps 0.5   → 有在動
 *     靠近速度 = +0.284           → 正的(所以 `< 0` 不擋),但 < 0.5(所以出貨會擋)
 *
 * 上下折返只是為了留在場地裡,對兩個判斷都沒有影響。
 */
const STRAFE_SPEED = 2.0;
function strafe(world: SimWorld, me: EntityId, tick: number): Map<SeatId, IntentFrame> {
  const p = world.transform.get(me)!.pos;
  const zDir = tick % 30 < 15 ? 1 : -1;
  // +x 是木樁的方向,所以 +0.2 的 x 分量就是「一邊繞一邊往內貼」。
  return moveOrder({ x: p.x + 0.2 * 6, z: p.z + zDir * 6 });
}

describe("打就站定 —— 英雄 (BasicAttackSystem)", () => {
  it("後退中的人一刀都揮不出來,而同一個人站定就打得出來(儀器活著)", () => {
    cover("ss-kite-vs-stand");

    const moving = makeWorld();
    const m = duel(moving);
    const movingHits = run(moving, m.me, m.foe, 150, () => kiteAway(moving, m.me));

    const still = makeWorld();
    const s = duel(still);
    const stillHits = run(still, s.me, s.foe, 150);

    expect(movingHits).toBe(0); // 風箏關閉
    expect(stillHits).toBeGreaterThan(0); // …而且不是因為戰鬥根本沒發生
  });

  it("繞圈慢慢貼上去也打不出來 —— 規則是「靠得比走路慢就算走位」,不是「只擋後退」", () => {
    cover("ss-strafe-blocked");
    // ⚠️ 這一條補的是一個**存活的突變**:把 `standstillBlocks` 最後那行從
    // `closingSpeed < rules.walkEps` 放寬成 `closingSpeed < 0`(只擋真的在拉開
    // 距離),整個 @ggd/shared 套件 1462 條測試**一條都不會紅**。也就是說,
    // 「靠近得夠快才算在接近」這個門檻在這條測試出現以前完全沒有守衛,而
    // owner 抱怨的是**邊移動邊攻擊**,不是「邊後退邊攻擊」—— 繞著人轉一邊
    // 蹭傷害正是他要擋掉的那個東西。
    //
    // 形狀見 `strafe` 上面的說明:有在動、確實在靠近,但靠近速度只有 0.28,
    // 遠低於 0.5 的走路門檻。
    const moving = makeWorld();
    const m = duel(moving);
    moving.stats.get(m.me)!.final[Stat.MoveSpeed] = STRAFE_SPEED;
    let tick = 0;
    const movingHits = run(moving, m.me, m.foe, 150, () => {
      moving.stats.get(m.me)!.final[Stat.MoveSpeed] = STRAFE_SPEED;
      return strafe(moving, m.me, tick++);
    });

    const still = makeWorld();
    const s = duel(still);
    still.stats.get(s.me)!.final[Stat.MoveSpeed] = STRAFE_SPEED;
    const stillHits = run(still, s.me, s.foe, 150);

    expect(movingHits).toBe(0); // 繞圈蹭傷害關閉
    expect(stillHits).toBeGreaterThan(0); // 儀器活著:同一個人、同一個移速,站定就打得出來
  });

  it("後台開關關掉時,同一個後退中的人照樣打得出來(這條規則真的是可關的)", () => {
    cover("ss-switch-off");
    const world = makeWorld();
    world.combatFeel = {
      knockback: DEFAULT_COMBAT_FEEL.knockback,
      standstill: { ...DEFAULT_COMBAT_FEEL.standstill, enabled: false },
    };
    const { me, foe } = duel(world);
    const hits = run(world, me, foe, 150, () => kiteAway(world, me));
    expect(hits).toBeGreaterThan(0); // 關掉 = 舊行為(邊走邊打)
  });

  it("走位不會白燒攻擊間隔:走了一整段之後,冷卻一次都沒被扣過", () => {
    cover("ss-no-cd-burn");
    const world = makeWorld();
    const { me, foe } = duel(world);
    // 60 tick 一直走。閘擋在冷卻 commit **之前**,所以整段走位下來
    // `basicAttackCdTicks` 從來沒有被設定過 —— 停下來的那一 tick 就能立刻出手。
    // 若閘擺在 commit 之後,這裡會看到一個大於 0 的冷卻(每 2 秒白燒一次)。
    const hits = run(world, me, foe, 60, () => kiteAway(world, me));
    expect(hits).toBe(0);
    expect(world.abilities.get(me)!.basicAttackCdTicks).toBe(0);
  });

  it("前搖跑到一半才走掉:那一刀作廢、不觸發 whiff、冷卻不退", () => {
    cover("ss-cancel-midwindup");
    // ⚠️ 上面那條測的是**起手閘**(還沒開始揮就擋住)。這一條測的是**前搖中途
    // 取消**,那是完全不同的一行程式 —— 一個 mutation 把 wind-up 那段的閘拿掉,
    // 上面那條照樣全綠。所以這裡刻意「先站定讓刀出鞘,再走」。
    const world = makeWorld();
    const { me, foe } = duel(world);
    const foeHp = world.health.get(foe)!;

    // 1) 站定,直到 attackWindup 真的發出來(儀器:沒有這一段就什麼都沒測到)
    let windupTick = -1;
    for (let i = 0; i < 40 && windupTick < 0; i++) {
      foeHp.hp = foeHp.maxHp;
      world.stats.get(foe)!.final[Stat.MoveSpeed] = 1e-9;
      const meT = world.transform.get(me)!;
      world.transform.get(foe)!.pos = { x: meT.pos.x + 1.2, z: meT.pos.z };
      world.step(empty());
      for (const e of world.events) {
        const d = e.data as { source?: EntityId };
        if (e.type === "attackWindup" && d.source === me) windupTick = i;
      }
    }
    expect(windupTick, "十幾 tick 之內連前搖都沒開始 —— 這條測試沒量到東西").toBeGreaterThanOrEqual(0);
    expect(world.abilities.get(me)!.windup, "前搖應該還在進行中").not.toBeNull();
    const cdAtWindup = world.abilities.get(me)!.basicAttackCdTicks;
    expect(cdAtWindup, "起手就該把整段冷卻扣掉(既有行為)").toBeGreaterThan(0);

    // 2) 從這一刻起往後退。目標全程被釘在射程內,所以「打不到」不可能是原因。
    let hits = 0;
    let whiffs = 0;
    for (let i = 0; i < 30; i++) {
      foeHp.hp = foeHp.maxHp;
      world.stats.get(foe)!.final[Stat.MoveSpeed] = 1e-9;
      const meT = world.transform.get(me)!;
      world.transform.get(foe)!.pos = { x: meT.pos.x + 1.2, z: meT.pos.z };
      world.step(kiteAway(world, me));
      for (const e of world.events) {
        const d = e.data as { source?: EntityId; origin?: string };
        if (e.type === "damage" && d.source === me && d.origin === "basic") hits++;
        if (e.type === "whiff" && d.source === me) whiffs++;
      }
    }
    expect(hits, "走掉之後那一刀還是落地了 —— 前搖中途的閘沒有生效").toBe(0);
    expect(whiffs, "自己走開是玩家的決定,不是揮空的過度投入,不該觸發 whiff").toBe(0);
    // 冷卻**不退**:起手時扣掉的那一段照走,不會因為取消而歸零重來。
    expect(world.abilities.get(me)!.basicAttackCdTicks).toBeLessThan(cdAtWindup);
  });

  it("被擠在柱子上磨蹭時照樣出手 —— 碰撞抖動不是「在走」", () => {
    cover("ss-obstacle-jitter");
    // ⚠️ 這一條和下面那條**不一樣**,而差別是這條規則的成敗所在:
    //   · 場地邊界 → `moveWithCollision` 乾淨地夾住,`vel` 真的是 0
    //   · 圓形柱子 → `pushOutOfObstacle` 每 tick 把身體推進去又推出來,
    //     `vel = (pos − before)/dt` 是一個**接近滿速**、方向亂跳的抖動向量
    // 也就是說「撞牆推不動的人位移是 0」對柱子並不成立。若規則是「有在動 &&
    // 沒在靠近就擋」,一個被擠到柱子上的玩家會完全打不出東西 —— 所以規則只擋
    // 「正在拉開距離」。見 combatFeel.standstillBlocks。
    const world = makeWorld();
    const zone = SKELETON_ARENA.zones[0]!;
    const pillar = zone.obstacles.find((o) => "radius" in o) as
      | { x: number; z: number; radius: number }
      | undefined;
    expect(pillar, "骨架競技場沒有圓形障礙物 —— 這條測試量不到東西").toBeDefined();
    const p = pillar!;
    // 站在柱子外緣旁邊,並且每 tick 都下「往柱子中心走」的指令。
    const start = { x: p.x + p.radius + 0.6, z: p.z };
    const { me, foe } = duel(world, start);
    const hits = run(world, me, foe, 150, () => moveOrder({ x: p.x, z: p.z }));
    expect(hits).toBeGreaterThan(0);
  });

  it("讀的是實際位移而不是移動意圖:推著場地邊界推不動 = 站著,照樣出手", () => {
    cover("ss-blocked-counts-as-still");
    const world = makeWorld();
    // 兩人貼在場地邊界上,me 每 tick 都下「往場外走」的指令 —— 意圖一直有,
    // 但 moveWithCollision 把他夾在邊界內,所以 `vel` 是 0。若規則改讀
    // `nav.moveTarget`(意圖),這個人整場都不能攻擊。
    const edgeZ = ZC.z + Z0.boundaryRadius - 0.8;
    const { me, foe } = duel(world, { x: ZC.x, z: edgeZ });
    const hits = run(world, me, foe, 150, () =>
      moveOrder({ x: ZC.x, z: ZC.z + Z0.boundaryRadius + 50 }),
    );
    expect(hits).toBeGreaterThan(0);
  });
});

describe("打就站定 —— 小怪與殭屍王 (MobSystem)", () => {
  const RULES: MobRules = {
    fromRound: 3,
    firstWaveTicks: 1,
    waveIntervalTicks: 100000,
    mobsPerWaveCap: 1,
    maxAlivePerZone: 8,
    level: 3,
    maxHp: 400,
    moveSpeed: 5,
    hpRegenPerSec: 0,
    modelKey: MOB_MODEL_KEY,
    // ⚠️ 跨組接縫 (v0.9.12):這兩個欄位是**殭屍身分組**加進 `MobRules` 的
    // (GH#192 選英雄→套模型 + 染黑),而這份 fixture 是**戰鬥手感組**寫的 ——
    // 兩組平行開發,互相不知道對方動了同一個型別。合併時 tsc 抓到
    // TS2739「missing sizeMult, tintStrength」。
    //
    // 兩個都是**純呈現**(不進 digest、不碰碰撞/導航),所以這裡填的值對
    // 「打就站定」的斷言零影響 —— 填 1 / 0 就是「原尺寸、不染色」,
    // 讓這一組測試量的仍然只有「有沒有在走」。
    sizeMult: 1,
    tintStrength: 0,
    attackDamage: 20,
    attackRangeSq: 1.8 * 1.8,
    attackCdTicks: 3,
    radius: 0.6,
    rewardGold: 1,
    rewardXp: 1,
    killsPerLevel: 0,
    // 兩者都關掉:這一組測的是「站定」,不是王/特殊殭屍的抽獎,
    // 而 `special: null` 也讓 spawnMob 一顆 rng 都不抽。
    boss: null,
    special: null,
  };

  /**
   * 一隻小怪 + 一位英雄。小怪被強制往**遠離**英雄的方向走(nav.override dash),
   * 所以它「在動、而且不是在靠近」—— 正是站定規則要擋的形狀。
   *
   * ⚠️ 英雄的 AbilitiesComp 被拿掉,他整場不出手。這不是省事:小怪**從來沒有**
   * 被 hitstop 綁住過(那是 #215 以來的既有行為,不是這一版改的),而被凍結的那
   * 幾 tick 裡 movementSystem 會把 `vel` 歸零 —— 於是「剛剛被打到、正在凍結」的
   * 小怪讀起來是「站著」,可以還手。那是一個獨立的題目;讓英雄不出手,這條測試
   * 的唯一變數才真的只剩「小怪有沒有在走」。
   */
  function mobFight(walkAway: boolean): number {
    const world = makeWorld();
    beginCombatMobs(world, RULES, [0]);
    const hero = spawnChampion(world, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: ZC.x, z: Y },
      zone: 0,
    });
    world.stats.get(hero)!.final[Stat.MoveSpeed] = 1e-9;
    world.abilities.delete(hero); // 英雄不還手 → 小怪不會被 hitstop 凍住
    const mob = spawnMob(world, 0, RULES, 1, 0);
    const mt = world.transform.get(mob)!;
    mt.pos = { x: ZC.x + 1.0, z: Y };
    const heroHp = world.health.get(hero)!;

    let mobHits = 0;
    for (let i = 0; i < 120; i++) {
      heroHp.hp = heroHp.maxHp;
      if (walkAway) {
        // 每 tick 重新武裝一段「遠離英雄」的衝刺,讓它的 vel 一直是負的靠近速度。
        // 位置也拉回來,所以它永遠在射程內 —— 唯一的變數是「有沒有在動」。
        world.transform.get(mob)!.pos = { x: ZC.x + 1.0, z: Y };
        world.nav.get(mob)!.override = {
          kind: "dash",
          dir: { x: 1, z: 0 },
          speed: 6,
          remaining: 6,
        };
      } else {
        world.transform.get(mob)!.pos = { x: ZC.x + 1.0, z: Y };
        world.nav.get(mob)!.override = null;
        world.nav.get(mob)!.moveTarget = null;
      }
      world.step(empty());
      for (const e of world.events) {
        const d = e.data as { source?: EntityId; origin?: string };
        if (e.type === "damage" && d.source === mob && d.origin === "mob") mobHits++;
      }
    }
    return mobHits;
  }

  it("殭屍邊走邊打被關掉 —— 而站定的同一隻照樣打(儀器活著)", () => {
    cover("ss-mob-bound");
    const walking = mobFight(true);
    const standing = mobFight(false);
    expect(standing).toBeGreaterThan(0); // 小怪本來就會打人
    expect(walking).toBe(0); // 但走動中不行
  });

  it("MONSTER_TEAM 的小怪和英雄讀同一張後台表:關掉開關,走動中的殭屍又能打了", () => {
    cover("ss-mob-switch");
    const world = makeWorld();
    world.combatFeel = {
      knockback: DEFAULT_COMBAT_FEEL.knockback,
      standstill: { ...DEFAULT_COMBAT_FEEL.standstill, applyToMobs: false },
    };
    beginCombatMobs(world, RULES, [0]);
    const hero = spawnChampion(world, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: ZC.x, z: Y },
      zone: 0,
    });
    world.stats.get(hero)!.final[Stat.MoveSpeed] = 1e-9;
    world.abilities.delete(hero);
    const mob = spawnMob(world, 0, RULES, 1, 0);
    expect(world.team.get(mob)!.teamId).toBe(MONSTER_TEAM);
    const heroHp = world.health.get(hero)!;

    let mobHits = 0;
    for (let i = 0; i < 120; i++) {
      heroHp.hp = heroHp.maxHp;
      world.transform.get(mob)!.pos = { x: ZC.x + 1.0, z: Y };
      world.nav.get(mob)!.override = { kind: "dash", dir: { x: 1, z: 0 }, speed: 6, remaining: 6 };
      world.step(empty());
      for (const e of world.events) {
        const d = e.data as { source?: EntityId; origin?: string };
        if (e.type === "damage" && d.source === mob && d.origin === "mob") mobHits++;
      }
    }
    expect(mobHits).toBeGreaterThan(0);
  });
});

/**
 * GH#755 —— `walkEps` **一格當兩用**造成的兩個結構後果。
 *
 * ⭐ 讀的是**出貨的那一份規則**（`DEFAULT_COMBAT_FEEL.standstill`）跑**出貨的**
 * `standstillBlocks`，⛔ 不自己手寫一份判斷式（失敗形態⑤）。
 *
 * ⛔ 這兩條裡沒有任何一個出貨數值 —— 門檻一律從 `DEFAULT_STANDSTILL` 推導。
 */
describe("兩個門檻不再共用同一個數字 (GH#755)", () => {
  const SS = DEFAULT_COMBAT_FEEL.standstill;
  const ME_POS = { x: 0, z: 0 };
  const FOE_POS = { x: 10, z: 0 }; // 目標在 +x

  /** `|vel| = speed`、方向 `dir`（會被正規化）。 */
  const vel = (dirX: number, dirZ: number, speed: number): { x: number; z: number } => {
    const n = Math.sqrt(dirX * dirX + dirZ * dirZ);
    return { x: (dirX / n) * speed, z: (dirZ / n) * speed };
  };

  it("⭐ A：**重減速**的單位不再讓整條規則靜默關閉 —— 純後退照樣被擋", () => {
    cover("ss-heavy-slow-still-governed");
    // 有效移速遠低於 `walkEps`（舊版的「有沒有在動」門檻）⇒ 舊版 `isWalking`
    // 回 false ⇒ 第二行根本走不到 ⇒ 重減速下純後退風箏拿**全額**輸出。
    const crawl = SS.walkEps * 0.6;
    expect(crawl).toBeGreaterThan(SS.stillEps); // 儀器：這仍然是「真的在走」
    expect(standstillBlocks(SS, vel(-1, 0, crawl), ME_POS, FOE_POS)).toBe(true);

    // ⛔ 對照組①：舊行為（rollback 開關打開）在**同一個**輸入上放行 ——
    // 這一條就是後果 A 的機器可檢查形式，也證明開關真的接著。
    const legacy = { ...SS, legacyAbsoluteClosing: true };
    expect(standstillBlocks(legacy, vel(-1, 0, crawl), ME_POS, FOE_POS)).toBe(false);

    // ⛔ 對照組②：**真的站著**（雜訊地板以下）仍然打得出來 —— 新規則不是
    // 「只要不是全速直衝就擋」。
    expect(standstillBlocks(SS, vel(-1, 0, SS.stillEps * 0.5), ME_POS, FOE_POS)).toBe(false);
    expect(standstillBlocks(SS, { x: 0, z: 0 }, ME_POS, FOE_POS)).toBe(false);
  });

  it("⭐ B：判定對移速**齊次** —— 同一個方向縮放 |vel| 不會翻面", () => {
    cover("ss-verdict-speed-invariant");
    // 舊版門檻是絕對速度 ⇒ 同樣斜著走，快的放行、慢的被擋（而且非單調：
    // 對敵人疊更多減速反而可能讓他拿回全額攻擊）。
    //
    // 這個方向的徑向分量約是速度的 0.196 倍（< closingRatio 0.5）⇒ 新規則一律擋。
    const dirX = 0.2;
    const dirZ = 1;
    for (const speed of [0.3, 0.8, 2.0, 6.0]) {
      expect(standstillBlocks(SS, vel(dirX, dirZ, speed), ME_POS, FOE_POS), `speed=${speed}`).toBe(
        true,
      );
    }
    // 反方向也要齊次：夠直的衝刺在**每一個**速度上都放行。
    for (const speed of [0.3, 0.8, 2.0, 6.0]) {
      expect(standstillBlocks(SS, vel(1, 0, speed), ME_POS, FOE_POS), `charge speed=${speed}`).toBe(
        false,
      );
    }
    // ⛔ 對照組：舊行為在**同一個方向**上會隨速度翻面（2.0 擋、6.0 放行）——
    // ⭐ 兩個速度在舊版底下**都算「有在動」**，所以翻面純粹來自「門檻是絕對值」，
    // ⛔ 不是 A 那個後果。少了這一條，上面那兩迴圈對「規則整個被刪掉」也會過
    //（失敗形態③）。
    const legacy = { ...SS, legacyAbsoluteClosing: true };
    const verdicts = [2.0, 6.0].map((s) => standstillBlocks(legacy, vel(dirX, dirZ, s), ME_POS, FOE_POS));
    expect(new Set(verdicts).size).toBe(2);
  });
});

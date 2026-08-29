/**
 * 面向鎖 FACING LOCK (task #264 「揮劍、施放技能攻擊的面向方向是錯誤的」).
 *
 * 這裡量的是**出貨路徑**：每一條都跑完整的 `world.step()`（commandSystem →
 * orderSystem → movementSystem → basicAttackSystem 的固定順序），讀的是
 * `world.transform.get(id).facing` —— 也就是 protocol `fx/fz` 送給 client、
 * ChampionView.stepFacing 拿去平滑的那一個權威值。不掃原始碼字串、不讀 aria、
 * 不呼叫任何測試專用的純函式捷徑。
 *
 * 缺陷方向：出手（施法／揮劍）的那一刻，身體應該朝著**瞄準方向**，而不是朝著
 * 移動方向或 `nav.attackTarget`。所以每一條斷言都是「facing 指向瞄準點」而且
 * 「與移動方向正好相反」—— 兩者相反才分得出「有轉」與「剛好本來就朝那邊」。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId, type StatusId } from "../ids";
import type { IntentFrame } from "./intents";
import { FACING_FOLLOW_THROUGH_TICKS, FACING_INSTANT_CAST_TICKS } from "./facingLock";

beforeAll(() => registerSkeletonContent());

const SEAT_A = asSeatId(0);
const SEAT_B = asSeatId(1);

/** zone 0 的圓心 —— 骨架競技場的 zone 不在原點，放在 (0,0) 會被邊界夾出去。 */
const ZC = SKELETON_ARENA.zones[0]!.center;
/** zone 0 的可玩半徑 —— 「壓在牆上往外走」那支夾具的座標從這裡推導，⛔ 不抄字面值。 */
const BOUNDARY_R = SKELETON_ARENA.zones[0]!.boundaryRadius;
const at = (dx: number, dz: number): { x: number; z: number } => ({ x: ZC.x + dx, z: ZC.z + dz });

function newWorld(): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, 7);
  w.combatActive = true;
  return w;
}

function champ(
  w: SimWorld,
  championId: string,
  seat: SeatId,
  team: number,
  pos: { x: number; z: number },
): EntityId {
  const id = spawnChampion(w, {
    championId: championId as ChampionId,
    seatId: seat,
    teamId: asTeamId(team),
    pos,
    zone: 0,
  });
  // 直接把 Q/W/E/R 開到 rank 1。spawnChampion 只給 Q rank 1 且 unspentPoints=0，
  // 所以走 rankUpAbility 指令會被拒；技能點怎麼來不是這組測試要驗的東西。
  const ab = w.abilities.get(id)!;
  ab.slots.W.rank = 1;
  ab.slots.E.rank = 1;
  ab.slots.R.rank = 1;
  return id;
}

/** 一 tick，帶上每個座位的 intent frame。 */
function step(w: SimWorld, frames: ReadonlyMap<SeatId, IntentFrame> = new Map()): void {
  w.step(frames);
}

/** 走路訂單：往 `dir` 的遠處走（搖桿/觸控每幀都會送一筆，這裡照做）。 */
function walk(
  seat: SeatId,
  from: { x: number; z: number },
  dir: { x: number; z: number },
): Map<SeatId, IntentFrame> {
  return new Map([
    [
      seat,
      {
        order: { kind: "move" as const, point: { x: from.x + dir.x * 10, z: from.z + dir.z * 10 } },
        commands: [],
      },
    ],
  ]);
}

/** facing 與單位向量 `dir` 的內積（1 = 完全一致，-1 = 完全相反）。 */
function align(w: SimWorld, id: EntityId, dir: { x: number; z: number }): number {
  const f = w.transform.get(id)!.facing;
  return f.x * dir.x + f.z * dir.z;
}

const PLUS_X = { x: 1, z: 0 };
const MINUS_X = { x: -1, z: 0 };

describe("面向鎖 — 施法 (task #264)", () => {
  it("走路中放地面技能：身體轉向落點，而且不會在同一 tick 被移動方向蓋回去", () => {
    cover("facing-lock-cast-while-moving");
    const w = newWorld();
    const a = champ(w, "sela", SEAT_A, 0, at(0, 0));

    // 先往 +X 走幾 tick，讓 facing 收斂到 +X（turnToward 每 tick 只轉一小段）。
    for (let i = 0; i < 12; i++) step(w, walk(SEAT_A, w.transform.get(a)!.pos, PLUS_X));
    expect(align(w, a, PLUS_X)).toBeGreaterThan(0.99);

    // 仍然按著搖桿往 +X 走，同時把地面技能丟到**正後方** -X 的落點。
    const pos = { ...w.transform.get(a)!.pos };
    const frames = walk(SEAT_A, pos, PLUS_X);
    frames.get(SEAT_A)!.commands = [
      { kind: "castAbility", slot: "E", target: { type: "point", point: { x: pos.x - 8, z: pos.z } } },
    ];
    step(w, frames);

    // 出手那一刻就要轉過去（不是下一 tick、不是慢慢轉）。
    expect(align(w, a, MINUS_X)).toBeGreaterThan(0.99);

    // 之後幾 tick 玩家還在往 +X 走 —— 鎖有效期間 facing 不得被移動方向拉回去。
    // 這正是修復前失敗的地方：castAbility 在 step slot 3 寫的 facing，被 slot 5
    // 的 movementSystem 在**同一 tick**蓋掉，所以施法轉身存活 0 tick。
    for (let i = 0; i < FACING_INSTANT_CAST_TICKS - 1; i++) {
      step(w, walk(SEAT_A, w.transform.get(a)!.pos, PLUS_X));
      expect(align(w, a, MINUS_X)).toBeGreaterThan(0.99);
    }

    // 鎖是暫時的，不是永久：過期後身體回到移動方向。
    for (let i = 0; i < 20; i++) step(w, walk(SEAT_A, w.transform.get(a)!.pos, PLUS_X));
    expect(align(w, a, PLUS_X)).toBeGreaterThan(0.99);
  });

  it("站著放地面技能：瞄準方向勝過 nav.attackTarget（對著 A 平砍，把 AoE 丟去 B）", () => {
    cover("facing-lock-cast-beats-attack-target");
    const w = newWorld();
    const a = champ(w, "sela", SEAT_A, 0, at(0, 0));
    // 敵人站在 +X 且在 sela 的射程內 → 站定時 movementSystem 的 !moved 分支會
    // 一直把身體轉向他。
    const enemy = champ(w, "thorne", SEAT_B, 1, at(6, 0));
    // 敵人被定身，免得他衝上來改變幾何 —— 這條測試要驗的是施法者的面向，
    // 不是追擊行為。
    w.status.get(enemy)!.effects.push({
      statusId: "test.root" as StatusId,
      sourceId: "test",
      expiresAtTick: 1_000_000,
      root: true,
    });

    const attack = new Map<SeatId, IntentFrame>([
      [SEAT_A, { order: { kind: "attackTarget" as const, entity: enemy }, commands: [] }],
    ]);
    for (let i = 0; i < 12; i++) step(w, attack);
    expect(align(w, a, PLUS_X)).toBeGreaterThan(0.99);

    // 保持攻擊指令，把地面技能丟到反方向。
    const pos = { ...w.transform.get(a)!.pos };
    step(
      w,
      new Map<SeatId, IntentFrame>([
        [
          SEAT_A,
          {
            order: { kind: "attackTarget" as const, entity: enemy },
            commands: [
              { kind: "castAbility", slot: "E", target: { type: "point", point: { x: pos.x - 8, z: pos.z } } },
            ],
          },
        ],
      ]),
    );
    expect(align(w, a, MINUS_X)).toBeGreaterThan(0.99);

    // 下一 tick 仍然按著攻擊指令 —— 鎖還在，身體不得被轉回攻擊目標。
    step(w, attack);
    expect(align(w, a, MINUS_X)).toBeGreaterThan(0.99);
  });

  it("有吟唱時間的技能：整段吟唱都朝著落點（鎖至少蓋滿 castTimeSec）", () => {
    cover("facing-lock-cast-time");
    const w = newWorld();
    const a = champ(w, "sela", SEAT_A, 0, at(0, 0));
    for (let i = 0; i < 12; i++) step(w, walk(SEAT_A, w.transform.get(a)!.pos, PLUS_X));
    expect(align(w, a, PLUS_X)).toBeGreaterThan(0.99);

    // sela.r：castTimeSec 0.5s = 15 tick @30Hz。
    const pos = { ...w.transform.get(a)!.pos };
    const frames = walk(SEAT_A, pos, PLUS_X);
    frames.get(SEAT_A)!.commands = [
      { kind: "castAbility", slot: "R", target: { type: "point", point: { x: pos.x - 6, z: pos.z } } },
    ];
    step(w, frames);
    for (let i = 0; i < 15; i++) {
      expect(align(w, a, MINUS_X)).toBeGreaterThan(0.99);
      step(w, walk(SEAT_A, w.transform.get(a)!.pos, PLUS_X));
    }
  });
});

describe("面向鎖 — 揮劍 (task #264)", () => {
  /**
   * 「邊走邊砍」的場景：#274 明確支援走路訂單存活時仍由 #221 自動選取攻擊目標，
   * 所以 `nav.order.kind === "move"` 且 `moveTarget !== null`，MovementSystem 走的
   * 是**移動分支** —— 修復前那條路徑上人是面向走路方向揮劍的。
   *
   * ⭐⭐ GH#755（2026-08-27）—— **這支夾具換掉了，而換掉的理由是它以前靠一個
   * 缺陷才綠的**。
   *
   * 舊版給攻擊者一個極重的緩速（`moveSpeedMult: 0.02` ⇒ 有效移速 ≈0.118 u/s），
   * 目的是「在走但幾乎不位移」。⛔ 但它同時**鑽過**了「打就站定」把 `walkEps`
   * 一格當兩用留下的洞：舊規則的第一行是 `lenSq(vel) > walkEps²`（0.5²），
   * 0.118 落在門檻底下 ⇒ **整條站定規則對他靜默關閉**。
   * ⇒ 而這支夾具做的事情，逐字就是站定規則要擋的那一種：**背對敵人後退還揮劍**。
   * ⇒ #755 把洞補起來的那一刻它當場紅了，看起來像「新規則造成靈魂層回歸」，
   *   ⭐ 實際是**這條守衛的前提本來就不成立**。
   *
   * 現在改用**出貨真的會發生**的那一種（`attackStandstill.test.ts` 的
   * `ss-blocked-counts-as-still` 用的是同一個情境）：**把身體壓在場地邊界上
   * 繼續往外走**。
   *
   *   · `moveWithCollision` 正面撞牆 ⇒ 切向分量為 0 ⇒ 整步取消 ⇒ 位移**正好 0**
   *     ⇒ `t.vel` 是 0 ⇒ 站定規則放行（「讀的是實際位移而不是移動意圖」）
   *   · 而 `nav.moveTarget` 一直在 ⇒ `moved` 仍然是 true ⇒ **移動分支照樣每
   *     tick 把 facing 轉向走路方向** —— 也就是這一組測試要防的那件事
   *
   * ⭐ 附帶好處：這支夾具對「站定規則怎麼算」**完全免疫**（vel 是 0，兩套規則
   * 的第一行都放行）⇒ 它量的純粹是**面向的擁有權**，而那本來就是它的題目。
   */
  function movingAttacker(): { w: SimWorld; a: EntityId; enemy: EntityId } {
    const w = newWorld();
    // 起手內縮 0.8（和 ss-blocked-counts-as-still 同一個數）；走 +X 撞牆之後身體
    // 會停在 `BOUNDARY_R − 半徑` 上，之後每一 tick 位移都是 0。
    const a = champ(w, "thorne", SEAT_A, 0, at(BOUNDARY_R - 0.8, 0));
    // 敵人在**正後方**（−X）。兩條斷言（「朝著敵人」與「不是朝著走路方向」）要能
    // 互相反駁就必須是正對／正背 —— 這是舊版就有的性質，保留。
    const enemy = champ(w, "sela", SEAT_B, 1, at(BOUNDARY_R - 2.0, 0));
    return { w, a, enemy };
  }

  /** 這一 tick 有沒有**這個攻擊者自己**的事件。 */
  const sawFrom = (w: SimWorld, type: string, src: EntityId): boolean =>
    w.events.some((e) => e.type === type && (e.data as { source?: EntityId }).source === src);

  it("邊走邊砍：普攻的傷害點必定朝著目標，不是朝著走路方向", () => {
    cover("facing-lock-basic-attack");
    const { w, a, enemy } = movingAttacker();

    let sawBasicAttack = false;
    let alignAtHit = 0;
    let alignToMove = 0;

    for (let i = 0; i < 90; i++) {
      // 只有走路訂單 —— 攻擊目標交給 #221 自動選取，這才是「邊走邊砍」。
      step(w, walk(SEAT_A, w.transform.get(a)!.pos, PLUS_X));
      // ⭐ GH#755 —— **認 `source`**。在此之前這一行是 `e.type === "basicAttack"`，
      // ⛔ 沒有問是誰打的：對面那位也會自動平砍，所以**敵人的**那一發就足以讓
      // `sawBasicAttack` 成立，而下面量的是**攻擊者**的 facing。
      // ⇒ 攻擊者根本沒出手的那些世界裡，這條守衛量到的是一個與它無關的 tick
      //（失敗形態④：斷言方向跟缺陷無關）。
      if (sawFrom(w, "basicAttack", a)) {
        sawBasicAttack = true;
        // 傷害點這一 tick 的 facing —— basicAttackSystem 在 movementSystem 之後
        // 跑（slot 6 vs 5），所以這是這一 tick 最終送上線的值。
        const et = w.transform.get(enemy)!.pos;
        const ap = w.transform.get(a)!.pos;
        const dx = et.x - ap.x;
        const dz = et.z - ap.z;
        const l = Math.sqrt(dx * dx + dz * dz);
        alignAtHit = align(w, a, { x: dx / l, z: dz / l });
        alignToMove = align(w, a, PLUS_X);
        break;
      }
    }

    // 先證明測試不是空轉：真的有一次揮劍發生，而且他真的在走（移動分支）。
    expect(sawBasicAttack).toBe(true);
    expect(w.nav.get(a)!.moveTarget).not.toBeNull();
    expect(alignAtHit).toBeGreaterThan(0.99);
    // 而且不是「剛好也朝著移動方向」—— 目標在正後方。
    expect(alignToMove).toBeLessThan(-0.99);
  });

  it("前搖第一 tick 就轉向目標（舉劍時人已經面對目標，不是砍到才轉）", () => {
    cover("facing-lock-attack-windup");
    const { w, a } = movingAttacker();

    // `attackWindup` 是**出劍那一 tick**（傷害點還在 7~8 tick 之後），這一刻
    // 身體就必須已經朝著目標。
    let sawWindup = false;
    for (let i = 0; i < 90; i++) {
      step(w, walk(SEAT_A, w.transform.get(a)!.pos, PLUS_X));
      const ev = w.events.find((e) => e.type === "attackWindup");
      if (ev) {
        sawWindup = true;
        expect((ev.data as { ticks: number }).ticks).toBeGreaterThan(0); // 真的有前搖
        expect(align(w, a, MINUS_X)).toBeGreaterThan(0.99);
        break;
      }
    }
    expect(sawWindup).toBe(true);
    // 餘韻常數是這條行為的一部分（起手鎖 = 前搖長度 + 餘韻），引用它讓常數改動
    // 一定經過這個檔案。
    expect(FACING_FOLLOW_THROUGH_TICKS).toBeGreaterThan(0);
  });

  it("前搖中目標走位：傷害點朝著目標的**現在**位置，不是出劍那一刻的舊位置", () => {
    cover("facing-lock-attack-windup-retarget");
    const { w, a, enemy } = movingAttacker();
    // 敵人在前搖期間橫向走位（被緩速，免得走出攻擊距離讓整個前搖被取消）。
    w.status.get(enemy)!.effects.push({
      statusId: "test.strafe-slow" as StatusId,
      sourceId: "test",
      expiresAtTick: 1_000_000,
      moveSpeedMult: 0.35,
    });

    let dirAtWindup: { x: number; z: number } | null = null;
    let alignLive = 0;
    let alignStale = 0;
    let sawHit = false;

    for (let i = 0; i < 90; i++) {
      const frames = walk(SEAT_A, w.transform.get(a)!.pos, PLUS_X);
      // 敵人往 +Z 橫走。
      frames.set(SEAT_B, {
        order: {
          kind: "move",
          point: { x: w.transform.get(enemy)!.pos.x, z: w.transform.get(enemy)!.pos.z + 10 },
        },
        commands: [],
      });
      step(w, frames);

      if (dirAtWindup === null && w.events.some((e) => e.type === "attackWindup")) {
        const f = w.transform.get(a)!.facing;
        dirAtWindup = { x: f.x, z: f.z };
      }
      if (dirAtWindup !== null && w.events.some((e) => e.type === "basicAttack")) {
        sawHit = true;
        const et = w.transform.get(enemy)!.pos;
        const ap = w.transform.get(a)!.pos;
        const dx = et.x - ap.x;
        const dz = et.z - ap.z;
        const l = Math.sqrt(dx * dx + dz * dz);
        alignLive = align(w, a, { x: dx / l, z: dz / l });
        alignStale = align(w, a, dirAtWindup);
        break;
      }
    }

    expect(sawHit).toBe(true);
    // 傷害點朝著目標**現在**在的位置。
    expect(alignLive).toBeGreaterThan(0.99);
    // 而且目標確實在前搖期間移動過 —— 舊方向已經明顯偏掉，所以上面那條不是
    // 「反正兩個方向本來就一樣」的假通過。
    expect(alignStale).toBeLessThan(0.98);
  });
});

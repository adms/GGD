/**
 * 無敵 / 免疫 (GH#289 lane P3) 的行為守衛。
 *
 * ---------------------------------------------------------------------------
 * 這裡刻意**不**測什麼
 * ---------------------------------------------------------------------------
 * 不測 `world.invulnerable` 裡有沒有一筆資料,不測 schema 認不認得這個 kind,
 * 不 grep 原始碼。那些都是**屬性**(七種失敗形態的第 ⑥/⑦ 種),而這個功能存在的
 * 唯一理由是**血條不能掉**與**腳不能被釘住**。所以:
 *
 *   · 傷害面一律跑真的 `world.step()`,斷言讀 `world.health.get(id)!.hp`;
 *   · 控制面一律讀 `movementHold(world, id)` —— 出貨的 MovementSystem 與
 *     OrderSystem 讀的**就是這個函式**(sim/movementHold.ts 的檔頭),所以測的是
 *     出貨的那一條路,不是自己另寫一份 CC 判定(第 ⑤ 種失敗形態)。
 *   · 授予一律走真的 `runEffects`,不是自己往 map 裡塞 —— 手塞會讓「handler 被
 *     整個刪掉」這件事測不出來。
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄 · 第一輪(11 條,建檔時跑的)
 * ---------------------------------------------------------------------------
 *    1. combat/damage.ts 的 `if (refusesDamage(...)) { … continue; }` 停用   (7)
 *    2. `refusesDamage` 的 `> world.tick` → `>= 0`(永不過期)                (5)
 *    3. applyStatus.ts 的 `if (isCc && … refusesControl(…)) continue;` 停用  (1)
 *    4. `if (e.blocksControl === true) …` → 無條件授予 controlUntil          (1)
 *    5. `|| mode === "magic"` 從魔法軸拿掉                                    (2)
 *    6. `e.blocksTrueDamage ?? mode === "all"` → `mode === "all"`             (1)
 *    7. `grantImmunity` 的逐軸 `Math.max` → 直接覆寫                          (1)
 *    8. SimWorld.digest 的免疫折疊改折**原始**數字(不看有沒有過期)          (1)
 *    9. handler 的 `!hp.alive` 守衛拿掉(死人也吃無敵)                        (1)
 *   10. `applyTo` 預設從 self 翻成 target                                     (1)
 *   11. `world.emit("immune", …)` 停用                                        (1)
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 第一輪的結語寫著「沒有任何一條是改壞了還是綠的」,而那句話**是假的** ——
 *    它只證明了那 11 條會紅,不代表沒有別的洞。R4 重跑了 21 條,其中
 *    **15 條在當時的 13 條測試下全綠**,而且每一條都是真的功能壞掉。
 *    第三守則的示範:結語裡的「沒有」是推論,不是量出來的。
 * ---------------------------------------------------------------------------
 * 突變紀錄 · 第二輪(R4,21 條;★ = 在補守衛之前 13/13 全綠 = 真的繞過)
 * ---------------------------------------------------------------------------
 *  ★ M1  `mode === "all" || mode === "physical"` → `mode === "all"`
 *        (blocksDamage:"physical" 整個 enum 值是死的 —— 出貨 schema 認得、
 *         編輯器選得到,遊戲裡什麼都不會發生)
 *  ★ M2  `e.blocksTrueDamage ?? mode === "all"` → `?? true`(魔免/純免控附送免真傷)
 *  ★ M3  同一行 → `mode === "all" && (e.blocksTrueDamage ?? true)`
 *        (「只免火圈刀劍照砍」這一支整支消失)
 *  ★ M4  `refusesControl` 的 `> world.tick` → `> 0`(吃過一次免控就**永遠**免控)
 *  ★ M5  `grantImmunity` 首次授予 `{ ...add }` → `add`(群體授予共用一個物件)
 *  ★ M6  魔法軸 `|| mode === "magic"` → `mode !== "physical"`("none" 也擋魔法)
 *    M7  物理軸 → `mode !== "magic"`("none" 也擋物理)                       (3)
 *    M8  `damageAxis` 物理/魔法兩根軸對調                                      (7)
 *    M9  `refusesDamage` 的 `> world.tick` → `>= 0`                          (21)
 *   M10  `if (e.blocksControl === true)` → 無條件授予                          (2)
 *  ★M11  applyStatus 的 `isCc` 不再認得 `root`
 *  ★M12  applyStatus 的 `isCc` 不再認得 `moveSpeedMult < 1`
 *   M13  applyStatus 的免控攔截整段停用                                        (4)
 *   M14  damage.ts 的免傷改成 `pkt.amount = 0` 而不是 `continue`               (1)
 *  ★M15  `until = world.tick + …` → `until = …`
 *        (免疫窗從**回合開始**起算 → 開場一秒後施放的無敵長度是 0)
 *  ★M16  `world.emit("immunityGranted", …)` 停用
 *  ★M17  事件的 `blocksPhysical` 旗標寫死 true(事件與傷害路徑說法不一致)
 *  ★M18  `cur.controlUntil` 的 `Math.max` → 直接覆寫(短免控砍短長免控)
 *  ★M19  applyStatus 的 `target !== ctx.caster` 拿掉(自己再也無法自我定身)
 *  ★M20  damage.ts 免傷分支裡的 `recordDamage(…, 0, 0, amount, …)` 刪掉
 *        (賽後畫面上完全看不到「他擋掉了多少」)
 *  ★M21  SimWorld.digest 停止折 `controlUntil` 那一根軸(#198 的形態)
 *
 * 21 條全部 RED。腳本與逐條輸出:/private/tmp(跑完即刪)。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { runEffects } from "./effectRunner";
import { movementHold } from "../movementHold";
import { zEffectDefUnion } from "../../content/schema/effect";
import { createMatchStats, getMatchStats } from "../stats/matchStats";
import { zeroAttrBonus } from "../stats/attributes";
import type { EffectContext, EffectDef } from "./effect";
import type { DamageType } from "./effect";
import { asSeatId, asTeamId, type EntityId, type StatusId } from "../../ids";

const C = SKELETON_ARENA.zones[0]!.center;
const START_HP = 500;

interface Rig {
  world: SimWorld;
  /** the aggressor (team 0) */
  attacker: EntityId;
  /** the body the immunity lands on (team 1) */
  victim: EntityId;
  /**
   * A SECOND body on the victim's team. Only the AoE-grant guard uses it: an
   * `applyTo: "target"` invulnerable resolving two enemies is the shipping shape
   * of 29-03 有功夫無懦夫「統統進入無敵狀態」, and it is the only way to observe
   * whether the two grants are two objects or one shared one.
   */
  bystander: EntityId;
}

function rig(): Rig {
  const world = new SimWorld(SKELETON_ARENA, 99);
  const place = (dx: number, team: number, seat: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x: C.x + dx, z: C.z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.6,
      zone: 0,
    });
    world.health.set(id, {
      hp: START_HP,
      maxHp: START_HP,
      mana: 0,
      maxMana: 0,
      alive: true,
      shields: [],
    });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
    world.status.set(id, { effects: [] });
    world.nav.set(id, {
      order: null,
      moveTarget: null,
      override: null,
      attackTarget: null,
      attackTargetAuto: false,
    });
    return id;
  };
  const attacker = place(0, 0, 0);
  const victim = place(2, 1, 1);
  const bystander = place(4, 1, 2);
  world.rebuildGrid();
  return { world, attacker, victim, bystander };
}

/** ctx whose CASTER is the attacker and whose TARGET is the victim. */
function ctxOf(r: Rig): EffectContext {
  return {
    world: r.world,
    caster: r.attacker,
    rank: 1,
    targets: [r.victim],
    origin: "ability:test.p3",
    rng: r.world.rng,
  };
}

/** Grant the immunity ON THE VICTIM through the real runner. */
function grantOnVictim(r: Rig, over: Partial<Extract<EffectDef, { kind: "invulnerable" }>>): void {
  runEffects([{ kind: "invulnerable", durationSec: 1, applyTo: "target", ...over }], ctxOf(r));
}

/** Queue one hit at ANY body and drain it through a REAL tick. */
function hitEntity(r: Rig, who: EntityId, type: DamageType, amount = 150): void {
  r.world.damageQueue.push({
    source: r.attacker,
    target: who,
    amount,
    type,
    crit: false,
    origin: "ability:test.p3",
  });
  r.world.step(new Map());
}

/** Queue one hit at the victim and drain it through a REAL tick. */
function hitVictim(r: Rig, type: DamageType, amount = 150): void {
  hitEntity(r, r.victim, type, amount);
}

const hpAt = (r: Rig, who: EntityId): number => r.world.health.get(who)!.hp;
const hpOf = (r: Rig): number => hpAt(r, r.victim);

/** Run `n` real ticks (no intents) — the only way an absolute-tick deadline passes. */
function advance(r: Rig, ticks: number): void {
  for (let k = 0; k < ticks; k++) r.world.step(new Map());
}
/** 1 s of immunity == 30 ticks @30Hz; 32 clears the deadline with margin. */
const PAST_ONE_SECOND = 32;

/**
 * A minimal `ChampionComp`. `recordDamage` gates the whole scoreboard on
 * `world.champion.has(id)` (「damage to flowers / neutrals never scores」), so
 * the 記分板 guard needs the marker — and only the marker; nothing in the tick
 * resolves this id against the content registry.
 */
function championish(id: string): import("../components").ChampionComp {
  return {
    championId: id as unknown as import("../../ids").ChampionId,
    level: 1,
    xp: 0,
    gold: 0,
    items: [null, null, null, null, null, null],
    augments: [],
    statStacks: 0,
    attrBonus: zeroAttrBonus(),
    statCapstonePct: 0,
    pendingOrbSlots: 0,
    undoStack: [],
  };
}

/** A real hard-CC packet from the attacker (the `applyStatus` shipping path). */
function stunVictim(r: Rig): void {
  runEffects([{ kind: "applyStatus", statusId: "p3-stun" as StatusId, duration: 1, stun: true }], ctxOf(r));
}

/**
 * The other two CC shapes `applyStatus.isCc` recognises. They exist as separate
 * helpers because 免控 that only stops STUNS is a real, shippable half-failure:
 * 07-01 臨、兵、鬥「可抵擋對方負性魔法」would still let every root and every
 * slow through, and a stun-only test stays green through it.
 */
function rootVictim(r: Rig): void {
  runEffects([{ kind: "applyStatus", statusId: "p3-root" as StatusId, duration: 1, root: true }], ctxOf(r));
}
function slowVictim(r: Rig): void {
  runEffects(
    [{ kind: "applyStatus", statusId: "p3-slow" as StatusId, duration: 1, moveSpeedMult: 0.4 }],
    ctxOf(r),
  );
}

describe("無敵/免疫 — 傷害這一根軸 (gh289-p3-invuln)", () => {
  it("無敵中挨一發 → HP 一點都不掉;無敵結束 → 同一發打進來", () => {
    cover("gh289-p3-invuln");
    const r = rig();
    grantOnVictim(r, { durationSec: 1 }); // default blocksDamage: "all"
    hitVictim(r, "physical");
    expect(hpOf(r), "無敵中仍然掉血").toBe(START_HP);

    // 1 s == 30 ticks. Run past the deadline and hit again with the SAME packet.
    // 這一半是整條守衛的重點:只斷言「擋得住」的測試,對一個「永遠無敵」的錯誤
    // 實作也會過(第 ④ 種失敗形態:斷言方向跟缺陷無關)。
    for (let k = 0; k < 32; k++) r.world.step(new Map());
    expect(hpOf(r), "到期前就先掉了血").toBe(START_HP);
    hitVictim(r, "physical");
    expect(hpOf(r), "無敵到期後仍然免疫").toBeLessThan(START_HP);
  });

  it("被免疫的封包不是「打了 0」—— 它根本沒發生(不破盾、不留 damage 事件)", () => {
    cover("gh289-p3-invuln");
    const r = rig();
    // 一個 200 點的護盾。如果免疫寫成 `amount = 0` 而不是 `continue`,護盾仍然
    // 會被走訪、`damage` 事件仍然會發出去,下游(浮動數字/命中特效/破盾反應)
    // 就會演一次沒有發生的命中。
    r.world.health.get(r.victim)!.shields.push({
      amount: 200,
      expiresAtTick: r.world.tick + 300,
      sourceId: "test:pool",
    });
    grantOnVictim(r, { durationSec: 1 });
    hitVictim(r, "magic", 150);
    expect(r.world.health.get(r.victim)!.shields[0]!.amount, "護盾被免疫掉的傷害吃掉了").toBe(200);
    expect(r.world.events.some((e) => e.type === "damage")).toBe(false);
    // ② 玩家必須看得見:免疫要發自己的事件,否則畫面上什麼都沒有發生。
    const immune = r.world.events.find((e) => e.type === "immune");
    expect(immune, "免疫沒有發事件 —— 客戶端無從得知").toBeDefined();
    expect(immune!.data.target).toBe(r.victim);
    expect(immune!.data.dmgType).toBe("magic");
  });

  it("魔法免疫只擋魔法 —— 物理照樣打得進來", () => {
    cover("gh289-p3-invuln");
    const r = rig();
    grantOnVictim(r, { durationSec: 1, blocksDamage: "magic" });
    hitVictim(r, "magic");
    expect(hpOf(r), "魔法免疫沒擋住魔法").toBe(START_HP);
    hitVictim(r, "physical");
    expect(hpOf(r), "魔法免疫把物理也擋掉了 —— 那是無敵,不是魔免").toBeLessThan(START_HP);
  });

  it("真實傷害是自己一根軸:預設跟著 all,寫 false 就燒得到", () => {
    cover("gh289-p3-invuln");
    // 火圈是 #270 明確的真實傷害,而「無敵要不要免疫縮圈」是 owner 的決定 ——
    // 所以它必須是文件寫得出來的兩種行為,不是程式裡挑一種。
    const a = rig();
    grantOnVictim(a, { durationSec: 1 }); // absent → follows "all"
    hitVictim(a, "true");
    expect(hpOf(a), "預設的無敵沒擋真實傷害").toBe(START_HP);

    const b = rig();
    grantOnVictim(b, { durationSec: 1, blocksTrueDamage: false });
    hitVictim(b, "true");
    expect(hpOf(b), "blocksTrueDamage:false 仍然擋掉了真實傷害").toBeLessThan(START_HP);
    // …而同一份授予對物理仍然是無敵的(只有真實那一根軸被關掉)。
    const hpAfterTrue = hpOf(b);
    hitVictim(b, "physical");
    expect(hpOf(b), "關掉真傷免疫把物理免疫也一起關掉了").toBe(hpAfterTrue);
  });
});

describe("無敵/免疫 — 控制與傷害是兩件事 (gh289-p3-immune-cc)", () => {
  it("純免控(blocksDamage:none)擋得住定身,但**照樣流血**", () => {
    cover("gh289-p3-immune-cc");
    // 07-01 臨、兵、鬥「可抵擋對方負性魔法」就是這一支:它是免控,不是無敵。
    const r = rig();
    grantOnVictim(r, { durationSec: 1, blocksDamage: "none", blocksControl: true });

    stunVictim(r);
    expect(movementHold(r.world, r.victim).stunned, "免控沒擋住硬控").toBe(false);
    expect(movementHold(r.world, r.victim).rooted).toBe(false);

    hitVictim(r, "physical");
    expect(hpOf(r), "純免控卻連傷害一起免了 —— 兩根軸黏在一起了").toBeLessThan(START_HP);
  });

  it("純免傷(不寫 blocksControl)**不會**附帶免控 —— 預設是分開的", () => {
    cover("gh289-p3-immune-cc");
    // 這一條釘住的是那個決策點本身。WC3 的 Avul 連法術一起擋,照抄的話免控就
    // 會搭便車掛在每一個免傷上,變成後台看不見的隱性效果。
    const r = rig();
    grantOnVictim(r, { durationSec: 1 }); // blocksDamage 預設 "all",沒有 blocksControl

    hitVictim(r, "physical");
    expect(hpOf(r), "免傷沒生效,這一條就證明不了任何事").toBe(START_HP);

    stunVictim(r);
    expect(movementHold(r.world, r.victim).stunned, "免傷偷偷附帶了免控").toBe(true);
  });

  it("免控**不吃**自己給自己的連技標記(蒼月潮 07-02 的 moon-combo)", () => {
    cover("gh289-p3-immune-cc");
    // `applyTo: "self"` 的 marker 是 07-03 列、在、前 的加成來源。如果免控用
    // 「是不是 status」而不是「是不是敵方的 CC」去擋,這個標記會被自己的免控
    // 靜默吃掉,而唯一的症狀是連技傷害少了一截 —— 沒有任何東西會紅。
    const r = rig();
    // 攻擊者自己身上有免控 + 完整無敵
    runEffects(
      [{ kind: "invulnerable", durationSec: 2, blocksControl: true }],
      ctxOf(r), // applyTo 預設 self → 落在 caster 身上
    );
    runEffects(
      [{ kind: "applyStatus", statusId: "moon-combo" as StatusId, duration: 1, applyTo: "self" }],
      ctxOf(r),
    );
    expect(
      r.world.status.get(r.attacker)!.effects.some((s) => s.statusId === "moon-combo"),
      "自己的連技視窗被自己的免控吃掉了",
    ).toBe(true);
  });

  it("免控只擋 CC —— 敵方掛上來的非控制標記照樣進得去", () => {
    cover("gh289-p3-immune-cc");
    const r = rig();
    grantOnVictim(r, { durationSec: 1, blocksDamage: "none", blocksControl: true });
    runEffects([{ kind: "applyStatus", statusId: "p3-mark" as StatusId, duration: 1 }], ctxOf(r));
    expect(
      r.world.status.get(r.victim)!.effects.some((s) => s.statusId === "p3-mark"),
      "免控把不是控制的標記也擋掉了",
    ).toBe(true);
  });
});

describe("無敵/免疫 — 疊加與邊界 (gh289-p3-invuln)", () => {
  it("短的 Avul **不會**砍短長的魔法免疫(逐軸取 max)", () => {
    cover("gh289-p3-invuln");
    const r = rig();
    grantOnVictim(r, { durationSec: 2, blocksDamage: "magic" }); // 60 ticks of magic immunity
    grantOnVictim(r, { durationSec: 0.2 }); // 6 ticks of full Avul on top

    // 過了短的那一層,長的那一層還在。用「一個到期 + 一組旗標」的模型寫,這裡
    // 要嘛魔免被砍到 6 ticks,要嘛物理免疫被延長到 60 ticks —— 兩個都是錯的。
    for (let k = 0; k < 10; k++) r.world.step(new Map());
    hitVictim(r, "magic");
    expect(hpOf(r), "長的魔法免疫被短的 Avul 砍掉了").toBe(START_HP);
    hitVictim(r, "physical");
    expect(hpOf(r), "短的 Avul 的物理免疫被延長了").toBeLessThan(START_HP);
  });

  it("死人不吃無敵 —— 屍體不會帶著免疫復活", () => {
    cover("gh289-p3-invuln");
    const r = rig();
    r.world.health.get(r.victim)!.alive = false;
    grantOnVictim(r, { durationSec: 1 });
    expect(r.world.invulnerable.has(r.victim)).toBe(false);
  });

  it("applyTo 預設是 self(施法者),不是目標", () => {
    cover("gh289-p3-invuln");
    const r = rig();
    runEffects([{ kind: "invulnerable", durationSec: 1 }], ctxOf(r));
    // 讀行為,不是讀 map:對施法者開一槍。
    r.world.damageQueue.push({
      source: r.victim,
      target: r.attacker,
      amount: 150,
      type: "physical",
      crit: false,
      origin: "ability:test.p3",
    });
    r.world.step(new Map());
    expect(r.world.health.get(r.attacker)!.hp, "預設沒有落在施法者身上").toBe(START_HP);
    expect(hpOf(r), "預設誤落在目標身上").toBe(START_HP); // victim was never hit
  });

  it("digest:一個免疫窗只在**還活著**的時候改變 hash", () => {
    cover("gh289-p3-invuln");
    // 沒有任何 system 會去清 `world.invulnerable` 的條目(到期的 grant 只是不再
    // 回 true),所以 digest 折進原始數字的話,「十二秒前就過期的免疫」會變成兩個
    // 在每一項可觀測狀態上都同意的複本之間的差異 —— #198 正在追的那一類。
    const live = rig();
    const inert = rig();
    grantOnVictim(live, { durationSec: 1 });
    expect(live.world.digest()).not.toBe(inert.world.digest());
    for (let k = 0; k < 32; k++) {
      live.world.step(new Map());
      inert.world.step(new Map());
    }
    expect(live.world.digest(), "過期的免疫仍然在 hash 裡").toBe(inert.world.digest());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  出貨 enum 的**每一格**
// ═══════════════════════════════════════════════════════════════════════════
//
// 上面那幾條測的是「幾個有代表性的組合」,而那正好漏掉了整個 `blocksDamage:
// "physical"`:它是 Zod 認得、編輯器卡片上選得到的值,而 handler 從來沒有處理過
// 它 —— 一個內容作者寫下去、存得起來、後台顯示得出來,遊戲裡什麼都不會發生的欄
// 位值(失敗形態 ②)。整個測試檔 13/13 綠。
//
// 所以這裡不再挑組合,直接把**四個 enum 值 × 三種傷害類型 = 12 格**全部跑出來,
// 每一格都是一發走真的 `world.step()` 的傷害封包,斷言讀 `health.hp`。
// 表格必須與 `zEffectDefUnion` 的 enum 逐字對齊 —— 下面那條測試就是在守這件事,
// 所以未來有人加第五個值時,是「表格漏了一格」紅,而不是靜靜地又多一個死值。
const BLOCKS_DAMAGE_VALUES = ["all", "none", "physical", "magic"] as const;
const DAMAGE_TYPES: readonly DamageType[] = ["physical", "magic", "true"];

/** 哪一格該被擋。`"all"` 連真傷一起(見 handler 的 `?? mode === "all"`)。 */
const REFUSES: Record<(typeof BLOCKS_DAMAGE_VALUES)[number], readonly DamageType[]> = {
  all: ["physical", "magic", "true"],
  none: [],
  physical: ["physical"],
  magic: ["magic"],
};

describe("無敵/免疫 — blocksDamage 的每一個 enum 值 × 每一種傷害 (gh289-p3-invuln)", () => {
  for (const mode of BLOCKS_DAMAGE_VALUES) {
    for (const type of DAMAGE_TYPES) {
      const blocks = REFUSES[mode].includes(type);
      it(`blocksDamage:"${mode}" ${blocks ? "擋掉" : "放行"} ${type},到期後同一發打得進來`, () => {
        cover("gh289-p3-invuln");
        const r = rig();
        grantOnVictim(r, { durationSec: 1, blocksDamage: mode });

        hitVictim(r, type);
        if (blocks) {
          expect(hpOf(r), `blocksDamage:"${mode}" 沒擋住 ${type} —— 這個 enum 值是死的`).toBe(
            START_HP,
          );
        } else {
          expect(hpOf(r), `blocksDamage:"${mode}" 把 ${type} 也擋掉了 —— 軸黏在一起了`).toBeLessThan(
            START_HP,
          );
        }

        // ④「永遠無敵」這一半:只斷言「擋得住」的測試,對一個**永不到期**的實作
        // 也會過。同一發封包在到期之後必須真的把血打下去。
        const beforeExpiry = hpOf(r);
        advance(r, PAST_ONE_SECOND);
        expect(hpOf(r), "沒有人打它,血卻自己變了 —— 這條測試量錯了東西").toBe(beforeExpiry);
        hitVictim(r, type);
        expect(
          hpOf(r),
          `blocksDamage:"${mode}" 的 ${type} 軸到期後仍然免疫 —— 永遠無敵`,
        ).toBeLessThan(beforeExpiry);
      });
    }
  }

  it("表格與出貨 Zod enum 逐字對齊 —— 新增一個值就必須在這裡補一列", () => {
    cover("gh289-p3-invuln");
    // 掃 enum 是屬性(⑦),所以它**不是**守衛本體;它的唯一工作是讓上面那 12 條
    // 行為守衛在 enum 變寬時「漏測」變成一條紅燈,而不是無聲的覆蓋率缺口。
    for (const mode of BLOCKS_DAMAGE_VALUES) {
      expect(
        zEffectDefUnion.safeParse({ kind: "invulnerable", durationSec: 1, blocksDamage: mode })
          .success,
        `表格裡的 "${mode}" 不是出貨 schema 認得的值`,
      ).toBe(true);
    }
    // 反向:schema 不能認得表格沒有的值。列舉法 —— 隨便撈幾個「像是會被加進來」
    // 的鄰居,它們現在都必須被拒。
    for (const notYet of ["spell", "pure", "true", "ranged", "physicalOnly", ""]) {
      expect(
        zEffectDefUnion.safeParse({ kind: "invulnerable", durationSec: 1, blocksDamage: notYet })
          .success,
        `schema 認得 "${notYet}" 但上面的行為表格沒有這一格`,
      ).toBe(false);
    }
  });
});

describe("無敵/免疫 — blocksTrueDamage 是自己一根軸 (gh289-p3-invuln)", () => {
  it('blocksTrueDamage:true 在 blocksDamage:"none" 上照樣生效 —— 它不是 "all" 的子句', () => {
    cover("gh289-p3-invuln");
    // 「只免火圈,刀劍照砍」。handler 寫的是 `e.blocksTrueDamage ?? mode === "all"`
    // —— 把它收窄成 `mode === "all" && (e.blocksTrueDamage ?? true)` 之後這一支
    // 完全消失,而在補這一條之前整個檔仍然全綠。
    const r = rig();
    grantOnVictim(r, { durationSec: 1, blocksDamage: "none", blocksTrueDamage: true });

    hitVictim(r, "true");
    expect(hpOf(r), "寫了 blocksTrueDamage:true 卻沒擋住真實傷害").toBe(START_HP);
    hitVictim(r, "physical");
    expect(hpOf(r), "只免真傷,物理卻也被免了").toBeLessThan(START_HP);
    const afterPhysical = hpOf(r);
    hitVictim(r, "magic");
    expect(hpOf(r), "只免真傷,魔法卻也被免了").toBeLessThan(afterPhysical);

    // ④ 到期
    const beforeExpiry = hpOf(r);
    advance(r, PAST_ONE_SECOND);
    hitVictim(r, "true");
    expect(hpOf(r), "真傷免疫沒有到期 —— 火圈從此永遠燒不到他").toBeLessThan(beforeExpiry);
  });

  it('blocksTrueDamage:true 疊在 blocksDamage:"magic" 上 = 魔免 + 免真傷,物理照樣進', () => {
    cover("gh289-p3-invuln");
    // 檔頭宣稱「魔法免疫外加免真傷也表達得出來」。這一條就是那句話的守衛 ——
    // 沒有它,那句話是註解,不是行為(第三守則:註解會說謊)。
    const r = rig();
    grantOnVictim(r, { durationSec: 1, blocksDamage: "magic", blocksTrueDamage: true });
    hitVictim(r, "magic");
    expect(hpOf(r), "魔免沒生效").toBe(START_HP);
    hitVictim(r, "true");
    expect(hpOf(r), "blocksTrueDamage:true 沒生效").toBe(START_HP);
    hitVictim(r, "physical");
    expect(hpOf(r), "物理被一起免了 —— 那是無敵,不是魔免+免真傷").toBeLessThan(START_HP);
  });
});

describe("無敵/免疫 — blocksControl 的三種 CC 形狀與到期 (gh289-p3-immune-cc)", () => {
  it("免控擋的是 stun / root / 減速**三種**,不是只有 stun", () => {
    cover("gh289-p3-immune-cc");
    // `applyStatus` 的 `isCc` 是三個條件的 OR。原本只有 stun 被測過,所以把
    // `e.root === true` 或 `e.moveSpeedMult < 1` 從 isCc 拿掉之後,07-01 臨、兵、鬥
    // 對定身與減速完全失效 —— 而測試全綠。
    const r = rig();
    grantOnVictim(r, { durationSec: 1, blocksDamage: "none", blocksControl: true });
    stunVictim(r);
    rootVictim(r);
    slowVictim(r);
    const h = movementHold(r.world, r.victim);
    expect(h.stunned, "免控沒擋住 stun").toBe(false);
    expect(h.rooted, "免控沒擋住 root").toBe(false);
    expect(h.speedMult, "免控沒擋住減速").toBe(1);
  });

  it("免控會到期 —— 到期後同一組 stun / root / 減速全部進得來", () => {
    cover("gh289-p3-immune-cc");
    // ④ 這一條是「永遠免控」的唯一守衛。`refusesControl` 的 `> world.tick` 改成
    // `> 0` 之後,「沒被授予過」仍然回 false(controlUntil 是 0),所以既有的
    // 「純免傷不附帶免控」還是綠的 —— 但任何吃過一次免控的人**從此永遠免控**。
    const r = rig();
    grantOnVictim(r, { durationSec: 1, blocksDamage: "none", blocksControl: true });
    stunVictim(r);
    expect(movementHold(r.world, r.victim).stunned, "免控中卻被定住了").toBe(false);

    advance(r, PAST_ONE_SECOND);
    stunVictim(r);
    rootVictim(r);
    slowVictim(r);
    const h = movementHold(r.world, r.victim);
    expect(h.stunned, "免控到期後仍然擋著 stun —— 永遠免控").toBe(true);
    expect(h.rooted, "免控到期後仍然擋著 root").toBe(true);
    expect(h.speedMult, "免控到期後仍然擋著減速").toBeLessThan(1);
  });

  it("免控**不吃**自己給自己的硬控 —— 施法自我定身還是要定得住", () => {
    cover("gh289-p3-immune-cc");
    // 既有的守衛用的是一個**非 CC** 的連技標記,所以它走不到 `isCc` 那個分支;
    // `target !== ctx.caster` 這個窄化因此完全沒有守衛 —— 拿掉之後,任何身上有
    // 免控的英雄都再也無法自我定身(通道技的 channel lock 是 status 形式的自我
    // 定身),而測試全綠。
    const r = rig();
    runEffects([{ kind: "invulnerable", durationSec: 2, blocksControl: true }], ctxOf(r)); // 落在 caster
    runEffects(
      [
        {
          kind: "applyStatus",
          statusId: "p3-self-root" as StatusId,
          duration: 1,
          root: true,
          applyTo: "self",
        },
      ],
      ctxOf(r),
    );
    expect(
      movementHold(r.world, r.attacker).rooted,
      "自己給自己的定身被自己的免控吃掉了 —— 免控擋的是敵人,不是自己",
    ).toBe(true);
  });

  it("短的免控不會砍短長的免控 —— controlUntil 也是逐軸取 max", () => {
    cover("gh289-p3-immune-cc");
    // 既有的疊加守衛只走物理/魔法兩根軸。只把 `cur.controlUntil` 那一行的
    // `Math.max` 換成直接覆寫,整個檔照樣綠 —— 而隊友補的一層 0.2 秒免控會把
    // 你自己 2 秒的免控砍成 0.2 秒。
    const r = rig();
    grantOnVictim(r, { durationSec: 2, blocksDamage: "none", blocksControl: true });
    grantOnVictim(r, { durationSec: 0.2, blocksDamage: "none", blocksControl: true });

    advance(r, 10); // 過了短的那一層(6 ticks),長的那一層(60 ticks)還在
    stunVictim(r);
    expect(movementHold(r.world, r.victim).stunned, "長的免控被短的那一層砍短了").toBe(false);
  });

  it('blocksControl:false 寫出來就是 false —— 不會被 blocksDamage:"all" 帶著走', () => {
    cover("gh289-p3-immune-cc");
    // 既有的守衛測的是「**省略** blocksControl」。顯式 false 是另一格:handler
    // 若寫成 `e.blocksControl !== false ? ... : ...` 之類的變體,省略那一格可能
    // 還是對的,而顯式 false 靜靜失效。
    const r = rig();
    grantOnVictim(r, { durationSec: 1, blocksDamage: "all", blocksControl: false });
    hitVictim(r, "physical");
    expect(hpOf(r), "免傷沒生效,這一條就證明不了任何事").toBe(START_HP);
    stunVictim(r);
    expect(movementHold(r.world, r.victim).stunned, "blocksControl:false 卻免了控").toBe(true);
  });

  it("完整 Avul(all + blocksControl:true):兩根軸同時開,也**同時**關", () => {
    cover("gh289-p3-immune-cc");
    // 41-002 絕對屏障 / 29-03 有功夫無懦夫要的那一種。兩根軸同一個 duration,
    // 所以「免傷到期但免控沒到期」這種一半的錯誤在這裡會紅。
    const r = rig();
    grantOnVictim(r, { durationSec: 1, blocksDamage: "all", blocksControl: true });
    hitVictim(r, "physical");
    expect(hpOf(r), "完整 Avul 沒擋住物理").toBe(START_HP);
    stunVictim(r);
    expect(movementHold(r.world, r.victim).stunned, "完整 Avul 沒擋住硬控").toBe(false);

    advance(r, PAST_ONE_SECOND);
    const beforeExpiry = hpOf(r);
    hitVictim(r, "physical");
    expect(hpOf(r), "免傷那一根軸沒到期").toBeLessThan(beforeExpiry);
    stunVictim(r);
    expect(movementHold(r.world, r.victim).stunned, "免控那一根軸沒到期").toBe(true);
  });
});

describe("無敵/免疫 — 授予的那一刻 (gh289-p3-invuln)", () => {
  it("免疫窗從**施法那一刻**起算,不是從回合開始起算", () => {
    cover("gh289-p3-invuln");
    // 上面每一條(以及原本的 13 條)都在 tick 0 授予,所以 handler 的
    // `world.tick + Math.round(...)` 把 `world.tick +` 整段拿掉之後,全部照樣綠 ——
    // 而實戰裡開場第一秒之後施放的每一個無敵都會是**零長度**。
    const r = rig();
    advance(r, 60); // 兩秒之後才施放
    grantOnVictim(r, { durationSec: 1 });
    hitVictim(r, "physical");
    expect(hpOf(r), "第 60 tick 才施放的無敵完全沒有生效 —— 到期 tick 沒有加上 world.tick").toBe(
      START_HP,
    );

    const beforeExpiry = hpOf(r);
    advance(r, PAST_ONE_SECOND);
    hitVictim(r, "physical");
    expect(hpOf(r), "晚點施放的無敵反而不會到期").toBeLessThan(beforeExpiry);
  });

  it("授予的那一刻要發 immunityGranted,而且四個旗標必須與傷害路徑的實際答案一致", () => {
    cover("gh289-p3-invuln");
    // ② 持續期間沒有 snapshot bit(見 handler 的註解),所以這一發事件是客戶端
    // **唯一**得知「他現在無敵、擋的是哪幾種」的管道 —— 刪掉它,遊戲照常運作而
    // 畫面上什麼都不會發生。
    //
    // ⚠️ 只斷言「事件有發」是屬性(⑦)。這裡把事件的每一個旗標拿去跟**真的打一發**
    // 的結果對照:旗標說擋,傷害就必須真的被拒;旗標說不擋,血就必須真的掉。
    // 事件說謊 = 客戶端畫錯的光暈,一樣紅。
    for (const mode of BLOCKS_DAMAGE_VALUES) {
      const r = rig();
      grantOnVictim(r, { durationSec: 1, blocksDamage: mode, blocksControl: true });
      const ev = r.world.events.find((e) => e.type === "immunityGranted");
      expect(ev, `blocksDamage:"${mode}" 授予時沒有發 immunityGranted`).toBeDefined();
      expect(ev!.data.target, "事件指向的不是被授予的那個人").toBe(r.victim);
      expect(ev!.data.untilTick, "untilTick 不是 1 秒後的絕對 tick").toBe(r.world.tick + 30);
      expect(ev!.data.blocksControl, "blocksControl:true 沒有反映在事件上").toBe(true);

      const flags: Record<DamageType, boolean> = {
        physical: ev!.data.blocksPhysical as boolean,
        magic: ev!.data.blocksMagic as boolean,
        true: ev!.data.blocksTrue as boolean,
      };
      for (const type of DAMAGE_TYPES) {
        const before = hpOf(r);
        hitVictim(r, type);
        const refused = hpOf(r) === before;
        expect(
          refused,
          `blocksDamage:"${mode}":事件說 ${type} 的旗標是 ${flags[type]},實際卻是 ${refused}`,
        ).toBe(flags[type]);
      }
    }
  });
});

describe("無敵/免疫 — digest 的四根軸 (gh289-p3-invuln)", () => {
  it("四根軸**每一根**都折進 hash,而且都只在還活著的時候", () => {
    cover("gh289-p3-invuln");
    // 既有的 digest 守衛只授予**預設的 all**,所以 `SimWorld.digest` 裡折免控那一
    // 根的 `mix(c)` 可以整行刪掉而測試全綠 —— 而那正是 #198 在追的形態:兩個在
    // 每一項可觀測狀態上都同意的複本之間,有一個 hash 看不見的差異。
    const axes: { label: string; over: Partial<Extract<EffectDef, { kind: "invulnerable" }>> }[] = [
      { label: "physical", over: { blocksDamage: "physical" } },
      { label: "magic", over: { blocksDamage: "magic" } },
      { label: "true", over: { blocksDamage: "none", blocksTrueDamage: true } },
      { label: "control", over: { blocksDamage: "none", blocksControl: true } },
    ];
    for (const { label, over } of axes) {
      const live = rig();
      const inert = rig();
      grantOnVictim(live, { durationSec: 1, ...over });
      expect(live.world.digest(), `${label} 這一根軸沒有折進 hash`).not.toBe(inert.world.digest());
      advance(live, PAST_ONE_SECOND);
      advance(inert, PAST_ONE_SECOND);
      expect(live.world.digest(), `${label} 過期之後仍然留在 hash 裡`).toBe(inert.world.digest());
    }
  });
});

describe("無敵/免疫 — 記分板 (gh289-p3-invuln)", () => {
  it("被免疫的封包記成 BLOCKED,不是「什麼都沒發生」", () => {
    cover("gh289-p3-invuln");
    // combat/damage.ts 那一行 `recordDamage(..., 0, 0, pkt.amount, ...)` 的註解說它
    // 在治 ②「算了但玩家在賽後畫面上看不到」。第三守則:去驗那句宣稱 —— 把那一行
    // 整個刪掉,全 repo 只多出一條**與記分板無關**的紅。也就是說那句話當時沒有守衛。
    const r = rig();
    // `recordDamage` 只寫進 champion + 已存在的 PlayerMatchStats 格子(它對
    // flower / neutral 直接 return),所以兩者都要有,而且是真的走 world.step()。
    for (const id of [r.attacker, r.victim]) {
      r.world.matchStats.set(id, createMatchStats());
    }
    r.world.champion.set(r.victim, championish("p3-victim"));
    r.world.champion.set(r.attacker, championish("p3-attacker"));

    grantOnVictim(r, { durationSec: 1 });
    hitVictim(r, "physical", 150);
    expect(hpOf(r), "免疫沒生效,這一條就證明不了記分板").toBe(START_HP);

    const st = getMatchStats(r.world, r.victim);
    expect(st.damageBlocked, "免疫掉的傷害沒有記進 damageBlocked —— 賽後畫面上看不到").toBe(150);
    expect(st.damageTaken, "免疫掉的傷害被算成實際承受").toBe(0);
    // …而攻擊者不能因為一發根本沒發生的傷害拿到輸出。
    expect(getMatchStats(r.world, r.attacker).damageDealt, "免疫掉的傷害被算進攻擊者輸出").toBe(0);
  });
});

describe("無敵/免疫 — 群體授予 (gh289-p3-invuln)", () => {
  it("一次蓋兩個人:之後延長其中一人,旁邊那個人**照樣**準時到期", () => {
    cover("gh289-p3-invuln");
    // 29-03 有功夫無懦夫「統統進入無敵狀態」是 `applyTo:"target"` 打在一群人身上。
    // handler 對整批 subject 只算一個 `add` 物件,`grantImmunity` 在「這個人還沒有
    // grant」時直接 `set(target, add)` —— 兩個人於是共用**同一個** ImmunityGrant。
    // 症狀不是崩潰,是旁邊那個路人跟著別人的無敵一起被延長:一個沒有任何東西會紅
    // 的「永遠無敵」。
    const r = rig();
    runEffects([{ kind: "invulnerable", durationSec: 1, applyTo: "target" }], {
      ...ctxOf(r),
      targets: [r.victim, r.bystander],
    });
    // 只給 victim 追加一層長的(第二次施法 / 隊友補一層)。
    runEffects([{ kind: "invulnerable", durationSec: 5, applyTo: "target" }], {
      ...ctxOf(r),
      targets: [r.victim],
    });

    advance(r, PAST_ONE_SECOND); // 過了短的那 1 秒,長的 5 秒還在
    hitEntity(r, r.bystander, "physical");
    expect(
      hpAt(r, r.bystander),
      "路人的 1 秒無敵被別人的 5 秒延長了 —— 兩份授予共用同一個物件",
    ).toBeLessThan(START_HP);
    hitVictim(r, "physical");
    expect(hpOf(r), "被延長的那個人自己的 5 秒無敵不見了").toBe(START_HP);
  });
});

describe("無敵/免疫 — 內容側 (gh289-p3-invuln)", () => {
  it("三個決策點欄位都被 Zod 認得(否則後台/編輯器根本存不下去)", () => {
    cover("gh289-p3-invuln");
    // 這一條是刻意最弱的一條:它只擋「sim 認得但文件寫不出來」的半套改動。
    // 真正的行為守衛在上面。
    for (const doc of [
      { kind: "invulnerable", durationSec: 2 },
      { kind: "invulnerable", durationSec: 2, blocksDamage: "magic" },
      { kind: "invulnerable", durationSec: 3, blocksDamage: "none", blocksControl: true },
      { kind: "invulnerable", durationSec: 5, blocksTrueDamage: false },
    ]) {
      expect(zEffectDefUnion.safeParse(doc).success, JSON.stringify(doc)).toBe(true);
    }
    // 上界仍然在守(CLAUDE.md:欄位要有上界)。
    expect(zEffectDefUnion.safeParse({ kind: "invulnerable", durationSec: 31 }).success).toBe(false);
    // 打錯的軸名不能靜默通過 —— 否則一個 typo 就是「卡片上寫了,遊戲裡沒有」。
    expect(
      zEffectDefUnion.safeParse({ kind: "invulnerable", durationSec: 2, blocksDamage: "spell" })
        .success,
    ).toBe(false);
  });
});

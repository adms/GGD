/**
 * 兩支「按下去什麼都不會發生」的 w3x 技能, 修好之後的行為守衛。
 *
 * ---------------------------------------------------------------------------
 * 這裡刻意不測什麼
 * ---------------------------------------------------------------------------
 * 不測「這支技能現在有 effect 了」, 不測「doc 裡有沒有 applyStatus 這個字」。
 * 那些是**屬性**, 不是行為 (七種失敗形態的第 ⑦ 種) —— 一份把 effect 寫對、
 * 卻永遠打不到任何人的文件會讓那種斷言全綠。
 *
 * 所以每一條斷言都跑真的 `SimWorld.step()`, 讀真的 `world.stats` /
 * `world.health` / `world.status`, 而且被測的是**出貨的那兩份 JSON**
 * (第 ⑤ 種失敗形態: 「被測的不是出貨的那個」) —— 從 `content/` 直接讀檔,
 * 不是在這裡手寫一份 fixture。
 *
 * 只註冊這兩位英雄要用到的文件, 不走 `ContentLoader`: 每個 collection 的
 * `_index.json` 是 `pnpm content:build` 才會刷新的衍生檔, 這一套在 build
 * 之前之後都必須是綠的 (同 sim/auraCarrierContent.test.ts 的選擇)。
 *
 * ---------------------------------------------------------------------------
 * ① 66-04 靈壓震撼 — `godie-e00t.r` (貞子)
 * ---------------------------------------------------------------------------
 * w3x: `A0IC`, base `AEim` (Immolation) = 一個**開關**, Cool 10 s,
 * 法力 50/70/90, DataA(每次傷害) = 0, DataB(每秒耗魔) = 25/35/45。
 * 開關打開時才把緩慢靈光 `A0ID` (base `Aasl`, Area 600 ≈ 11 GGD 單位,
 * DataA 移速 -10/-20/-30 %, DataB 攻速 -65 %) 交給玩家:
 *   war3map.j:48787  `SetPlayerAbilityAvailableBJ(false,'A0ID',…)`  ← 出生就關
 *   war3map.j:48915  收到 `immolation` 指令 → `…(true,'A0ID',…)`     ← 開
 *   war3map.j:48941  buff `B025` 一掉 → `…(false,'A0ID',…)`          ← 關
 *   war3map.j:48898  `A0ID` 的等級永遠跟著 `A0IC` 的等級
 *
 * 出貨的版本兩半同時是錯的: R 鍵被 `isPassiveOnly` 擋成 `"passive"` (按了
 * 沒反應), 而 -65 % 敵方攻速的靈光**永久免費**掛著。現在是一發以自身為圓心
 * 的 AoE 減速 (`castType: "ground"` + `range: 0`)。
 *
 * DURATION 的來源 (不是我編的): 啟動法力 ÷ 每秒耗魔 = 50/25 = 70/35 = 90/45,
 * 三個等級**都正好 2.0 秒** —— 這就是原作的法力經濟自己買得起的那個窗口。
 * 它是 doc 裡的一個欄位, 所以 owner 在 內容管理 就能改。
 *
 * ---------------------------------------------------------------------------
 * ② 58-02 鋼鐵尾巴 — `godie-ofar.w` (皮卡丘)
 * ---------------------------------------------------------------------------
 * w3x: `A04U`, base `AHbh` (Bash), DataA 10 % 機率, DataC 75/150/225/300 追加
 * 傷害, `Dur1`/`HeroDur1` = 0.01 s 暈眩。傷害那一半早就在文件裡, **暈眩那一半
 * 從來沒有被移植過** —— 而 ubertip 一直寫著「並有機會將敵人震昏0.01秒」。
 *
 * 0.01 s 低於模擬的 1/30 s 量子, `Math.round(0.01 / dt)` = 0 tick, 照抄會是
 * 一個安靜的 no-op (第 ② 種失敗形態)。
 *
 * ⚠️ 一個 tick 也還是 no-op, 這是這次量出來的: hook 在 tick T 的
 * `combatResolveSystem` (step 第 8 格) 才觸發, 而 `SimWorld.step()` 的
 * `this.tick++` 在整個 step 的**最後**。所以 `expiresAtTick = T + 1` 的暈眩,
 * 下一個看得到它的消費者已經在 tick T+1, 而每一個消費點都是嚴格大於
 * (`e.expiresAtTick > world.tick`) —— 剛好差一格, 永遠讀不到。
 * 模擬真正交付得出來的最短暈眩是 **兩個 tick**, 所以文件寫 0.067 s。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../../content/store";
import { registerAll } from "../../content/registries";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { castAbility, resolveAbilityRadius } from "./abilitySystem";
import { syncAbilityPassives } from "./abilityPassives";
import { Stat } from "../stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import type { IntentFrame } from "../intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

const SADAKO = "godie-e00t" as ChampionId;
const PIKACHU = "godie-ofar" as ChampionId;

/** w3a A0ID Area1 600 → GGD 11; A0ID DataB (攻速) / DataA (移速, 依等級). */
const AURA_RADIUS = 11;
const AS_PCT = -0.65;
const MS_PCT = [-0.1, -0.2, -0.3];
/** w3a A0IC Mana1..3. */
const MANA = [50, 70, 90];

function readDoc(collection: string, id: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(CONTENT_DIR, collection, `${id}.json`), "utf-8"),
  ) as Record<string, unknown>;
}

beforeAll(() => {
  const store = new ContentStore();
  // Only what these two heroes need. Loading the whole `abilities/` directory
  // would couple this guard to every other lane's in-flight edit.
  for (const champ of [SADAKO, PIKACHU]) {
    const doc = readDoc("champions", champ);
    store.add("champions", champ, doc);
    for (const f of readdirSync(join(CONTENT_DIR, "abilities"))) {
      if (f.startsWith(`${champ}.`) && f.endsWith(".json")) {
        const ab = readDoc("abilities", f.slice(0, -5));
        store.add("abilities", ab.id as string, ab);
      }
    }
  }
  for (const f of readdirSync(join(CONTENT_DIR, "status-effects"))) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const d = readDoc("status-effects", f.slice(0, -5));
    store.add("status-effects", d.id as string, d);
  }
  registerAll(store);
});

let seat = 0;
/** Clear of the skeleton zone's centre pillar (see aura.test.ts for the trap). */
function spawn(world: SimWorld, champion: ChampionId, team: 0 | 1, dz: number): EntityId {
  return spawnChampion(world, {
    championId: champion,
    seatId: asSeatId(seat++),
    teamId: asTeamId(team),
    pos: { x: Z0.center.x + 12, z: Z0.center.z + dz },
    zone: 0,
  });
}

/** Learn a Q/W/E/R rank the way a rank-up does — including the passive re-attach. */
function setRank(world: SimWorld, id: EntityId, slot: "Q" | "W" | "E" | "R", rank: number): void {
  world.abilities.get(id)!.slots[slot].rank = rank;
  syncAbilityPassives(world, id);
}

const asOf = (w: SimWorld, id: EntityId): number => w.stats.get(id)!.final[Stat.AttackSpeed];
const msOf = (w: SimWorld, id: EntityId): number => w.stats.get(id)!.final[Stat.MoveSpeed];

// ═══════════════════════════════════════════════════════════════════════════
// ① 66-04 靈壓震撼
// ═══════════════════════════════════════════════════════════════════════════
describe("66-04 靈壓震撼 (godie-e00t.r) — 按下去真的有事發生", () => {
  interface Rig {
    world: SimWorld;
    sadako: EntityId;
    near: EntityId;
    far: EntityId;
  }

  function rig(rank: number): Rig {
    const world = new SimWorld(SKELETON_ARENA, 66_04);
    world.combatActive = true; // 每場開始要重新打開 (owner)
    const sadako = spawn(world, SADAKO, 0, 0);
    const near = spawn(world, SADAKO, 1, 2);
    const far = spawn(world, SADAKO, 1, 20);
    world.rebuildGrid();
    setRank(world, sadako, "R", rank);
    world.step(NO_INTENTS); // settle the stat pipeline before we read a baseline
    // AFTER the settle step: regenSystem runs inside step() and would otherwise
    // put mana regen into the "exactly 50 paid" assertion below.
    world.health.get(sadako)!.mana = 200;
    return { world, sadako, near, far };
  }

  it("敵人在施法前完全沒有被減速 —— 舊版的永久免費靈光已經不在了", () => {
    const r = rig(1);
    // THE POINT OF THIS ONE. The shipped shape carried the slow as a PERMANENT
    // `passive.ranks[].auras` block, so an enemy standing 2 units away was
    // already at -65 % attack speed before anybody pressed anything, forever,
    // for no mana. Re-authoring it as a passive again makes this red.
    const clean = spawn(r.world, SADAKO, 1, 3);
    r.world.rebuildGrid();
    for (let i = 0; i < 5; i++) r.world.step(NO_INTENTS);
    expect(asOf(r.world, clean)).toBeCloseTo(asOf(r.world, r.far), 9);
    expect(msOf(r.world, clean)).toBeCloseTo(msOf(r.world, r.far), 9);
  });

  it("按 R → 半徑內的敵人攻速 -65 %、移速 -10 %；半徑外的一動也沒動", () => {
    const r = rig(1);
    const asBefore = asOf(r.world, r.near);
    const msBefore = msOf(r.world, r.near);
    const farAsBefore = asOf(r.world, r.far);

    // FIXTURE GUARDS: if a re-balance ever pushes the base under STAT_CLAMPS's
    // floor the expected values below become the clamp, not the debuff, and the
    // assertion would pass for the wrong reason. Say so instead.
    expect(asBefore * (1 + AS_PCT)).toBeGreaterThan(0.2);
    expect(msBefore * (1 + MS_PCT[0]!)).toBeGreaterThan(2);
    // …and that `near` really is inside the AoE while `far` really is outside.
    const reach = resolveAbilityRadius(r.world, AURA_RADIUS);
    expect(reach).toBeGreaterThan(2);
    expect(reach).toBeLessThan(20);

    expect(castAbility(r.world, r.sadako, "R", { type: "point", point: { x: 0, z: 0 } })).toBe(
      "ok",
    );
    r.world.step(NO_INTENTS);

    expect(asOf(r.world, r.near)).toBeCloseTo(asBefore * (1 + AS_PCT), 9);
    expect(msOf(r.world, r.near)).toBeCloseTo(msBefore * (1 + MS_PCT[0]!), 9);
    expect(asOf(r.world, r.far)).toBeCloseTo(farAsBefore, 9);
  });

  it("`range: 0` 讓它以**自己**為圓心 —— 游標指到 20 單位外也一樣", () => {
    // A0IC is Immolation: it detonates on the caster, full stop. The client's
    // ground resolver clamps the cursor to `range`, and `range` is 0 — so this
    // cast, aimed straight at `far`, must still miss `far` and hit `near`.
    const r = rig(1);
    const t = r.world.transform.get(r.far)!.pos;
    expect(castAbility(r.world, r.sadako, "R", { type: "point", point: { x: t.x, z: t.z } })).toBe(
      "ok",
    );
    const farAs = asOf(r.world, r.far);
    const nearAsBefore = asOf(r.world, r.near);
    r.world.step(NO_INTENTS);
    expect(asOf(r.world, r.far)).toBeCloseTo(farAs, 9);
    expect(asOf(r.world, r.near)).toBeLessThan(nearAsBefore);
  });

  it("2 秒後減速自己退掉 —— 一次施放買一個窗口, 不是一個常駐光環", () => {
    const r = rig(1);
    const asBefore = asOf(r.world, r.near);
    expect(castAbility(r.world, r.sadako, "R", { type: "point", point: { x: 0, z: 0 } })).toBe(
      "ok",
    );
    r.world.step(NO_INTENTS);
    expect(asOf(r.world, r.near)).toBeLessThan(asBefore);
    // 2.0 s = 60 ticks @30 Hz. One extra tick for the recompute after expiry.
    for (let i = 0; i < 62; i++) r.world.step(NO_INTENTS);
    expect(asOf(r.world, r.near)).toBeCloseTo(asBefore, 9);
  });

  it("等級 3 的移速減益是 -30 %, 攻速仍是 -65 %（w3a DataA/DataB 逐級）", () => {
    const r = rig(3);
    const asBefore = asOf(r.world, r.near);
    const msBefore = msOf(r.world, r.near);
    expect(msBefore * (1 + MS_PCT[2]!)).toBeGreaterThan(2);
    expect(castAbility(r.world, r.sadako, "R", { type: "point", point: { x: 0, z: 0 } })).toBe(
      "ok",
    );
    r.world.step(NO_INTENTS);
    expect(msOf(r.world, r.near)).toBeCloseTo(msBefore * (1 + MS_PCT[2]!), 9);
    expect(asOf(r.world, r.near)).toBeCloseTo(asBefore * (1 + AS_PCT), 9);
  });

  it("真的付 w3a 的 50 點法力, 而且真的進冷卻", () => {
    const r = rig(1);
    expect(r.world.health.get(r.sadako)!.mana).toBe(200);
    expect(castAbility(r.world, r.sadako, "R", { type: "point", point: { x: 0, z: 0 } })).toBe(
      "ok",
    );
    expect(r.world.health.get(r.sadako)!.mana).toBe(200 - MANA[0]!);
    expect(r.world.abilities.get(r.sadako)!.slots.R.cooldownRemainingTicks).toBeGreaterThan(0);
    expect(castAbility(r.world, r.sadako, "R", { type: "point", point: { x: 0, z: 0 } })).toBe(
      "cooldown",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ② 58-02 鋼鐵尾巴
// ═══════════════════════════════════════════════════════════════════════════
describe("58-02 鋼鐵尾巴 (godie-ofar.w) — 補回從沒被移植的那半個暈眩", () => {
  const ORIGIN = "hook:abilityPassive:godie-ofar.w";

  it("普攻觸發時受害者真的被暈住 —— 那一 tick 他連 Q 都放不出來", () => {
    const world = new SimWorld(SKELETON_ARENA, 58_02);
    world.combatActive = true;
    const pika = spawn(world, PIKACHU, 0, 0);
    const victim = spawn(world, PIKACHU, 1, 1.5);
    world.rebuildGrid();
    setRank(world, pika, "W", 1);

    const intents = new Map<SeatId, IntentFrame>([
      [
        world.team.get(pika)!.seatId,
        { order: { kind: "attackTarget", entity: victim }, commands: [] },
      ],
    ]);

    let stunnedTicks = 0;
    let sawCastRefusal = false;
    // 10 % per swing, seeded rng → deterministic for this seed. 1,800 ticks
    // (60 s) is far more than enough swings; the assertion is that it HAPPENED.
    for (let i = 0; i < 1800 && stunnedTicks === 0; i++) {
      // keep both bodies alive: this measures the bash, not the kill
      for (const id of [pika, victim]) {
        const hp = world.health.get(id)!;
        hp.hp = hp.maxHp;
        hp.alive = true;
      }
      world.step(intents);
      const st = world.status.get(victim)!;
      const bash = st.effects.find(
        (e) => e.sourceId === ORIGIN && e.stun === true && e.expiresAtTick > world.tick,
      );
      if (bash) {
        stunnedTicks++;
        // BEHAVIOUR, not the marker: while it holds, the victim's own Q is
        // refused for exactly this reason. `godie-ofar.q` spawns at rank 1.
        expect(castAbility(world, victim, "Q", { type: "entity", entityId: pika })).toBe(
          "stunned",
        );
        sawCastRefusal = true;
      }
    }
    expect(stunnedTicks, "the bash never once landed a stun").toBeGreaterThan(0);
    expect(sawCastRefusal).toBe(true);
  });

  it("暈眩長度是模擬真正交付得出來的最短窗口 —— 0.01 秒與 0.034 秒都是空包彈", () => {
    // `applyStatus` computes `world.tick + Math.round(duration / world.dt)`.
    //   0.010 s → 0 ticks → expired on the very tick it lands.
    //   0.034 s → 1 tick  → ALSO dead: the hook fires in step slot 8 and
    //                       `this.tick++` is the last line of step(), so the
    //                       first consumer that could read it is already at
    //                       T+1 and every read is a strict `>`.
    //   0.067 s → 2 ticks → exactly one tick of real stun. This is the floor.
    const world = new SimWorld(SKELETON_ARENA, 1);
    expect(Math.round(0.01 / world.dt)).toBe(0);
    expect(Math.round(0.034 / world.dt)).toBe(1);
    expect(Math.round(0.067 / world.dt)).toBe(2);
  });
});

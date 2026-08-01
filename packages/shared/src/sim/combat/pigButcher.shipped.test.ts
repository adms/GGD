/**
 * [變形] 殺豬刀 godie-i06g 「專殺畜牲，7%機率將敵人變成食材，無法動作」 —— THE
 * SHIPPED DOC, driven through the shipped equip path onto a real MOB.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS AT ALL
 *
 * Every primitive this line uses already existed (`onBasicAttack` + `chance` +
 * `victim` + `applyStatus{stun}`), so there is no new mechanism to prove — which
 * is exactly the situation 失敗形態 ⑤ lives in: 「the mechanism works」 and 「the
 * item does it」 are different claims, and a doc that authored `stun: false`, or
 * pointed `victim` at the wrong class, or forgot the `duration`, would leave
 * every mechanism test green while the card pays nothing.
 *
 * So: read the real JSON, equip through `economy/itemSource.ts` (the ONE builder
 * every equip path uses), swing at a real body, and read `world.status` back.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE CLAIMS
 *
 *   ① THE DOC SAYS IT — the hook's five authored decisions are pinned per field
 *      (event / victim class / chance / ICD / stun+duration), so a silent
 *      rebalance is a red test. The two numbers owner never gave (duration, ICD)
 *      are pinned LOUDLY, because they are the ones awaiting his call.
 *   ② 「無法動作」 REALLY MEANS IT — the status that lands is read back through
 *      the SAME predicate the sim's five action gates use (`e.stun === true` and
 *      not yet expired). Asserting 「a status with id X exists」 would pass on a
 *      cosmetic marker that stops nothing (失敗形態 ⑦: 掃屬性代替掃行為).
 *   ③ 「專殺畜牲」 IS FLAVOUR, NOT A FILTER — owner ruled 2026-08-01 「也殺敵方
 *      英雄單位」, so `victim: "any"` and a CHAMPION target IS stunned. This test
 *      used to assert the exact opposite (`victim: "mob"`, champions immune) and
 *      it CORRECTLY went red when the ruling landed — the flip is recorded here
 *      rather than quietly deleted, because 「殺豬刀 對英雄有沒有用」 is a question
 *      someone will ask again and the answer must be findable.
 *      ⚠️ 「畜牲」 could not have been a real filter anyway: this sim's whole
 *      vocabulary is champions / mobs / summons / structures, and the w3x source
 *      has no transform ability on this item at all, so there was never a
 *      taxonomy to bind it to. Owner resolved it by widening the target, which
 *      also fixed the side effect that rounds 1–2 (no mob spawns) made the line
 *      dead weight in every match.
 *   ④ 0.3 秒就是 0.3 秒 — owner 2026-08-01「0.3秒就可以了」。斷言的是**行為**:
 *      被暈的那個人被按住剛好 9 tick、第 10 tick 恢復行動,而不是「欄位等於
 *      0.3」(失敗形態 ⑦)。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 突變紀錄(每一條都真的跑過:改壞 → 確認紅 → 改回 → 確認綠,2026-08-01)
 *   P1. `godie-i06g.json` 的 `duration` 0.3 → 1(動手前的出貨值)
 *       ⇒ **3 紅 / 7**(① 的數字、③ 的兩條行為)。
 *   P2. 同一格 0.3 → 0.2(只差 3 tick)
 *       ⇒ **3 紅 / 7** —— 行為守衛抓得到「差一點點」,不只是「差很多」。
 *   P3. 同一格 0.3 → 30(小數點打錯一位)
 *       ⇒ `pnpm content:build` **EXIT=1**:
 *          `items/godie-i06g: passive.0.effects.0.duration: Number must be less
 *           than or equal to 20`。這是這一批新加的上界(見
 *          `content/schema/effect.ts` 的 `applyStatus.duration`)—— 在這之前
 *          那一格只有 `.min(0)`,30 秒的暈眩會安靜地出貨。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { fireHooks } from "../effects/hooks";
import { attachSource, recomputeStats } from "../stats/statPipeline";
import { itemModifierSource } from "../economy/itemSource";
import { zItemHookDef } from "../../content/schema/item";
import type { ItemDef } from "../content/defs";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import { MONSTER_TEAM } from "../mobs";

beforeAll(() => registerSkeletonContent());

const HERE = dirname(fileURLToPath(import.meta.url));
const ITEMS = join(HERE, "../../../../../content/items");
const PIG_KNIFE = "godie-i06g";
const Z0 = SKELETON_ARENA.zones[0]!;
const LANE_Z = Z0.center.z + 14;

const doc: ItemDef & { description: string } = JSON.parse(
  readFileSync(join(ITEMS, `${PIG_KNIFE}.json`), "utf8"),
);

/** THE predicate the sim's five action gates use — not a status-id lookup. */
function cannotAct(world: SimWorld, id: EntityId): boolean {
  const st = world.status.get(id);
  return st?.effects.some((e) => e.stun === true && e.expiresAtTick > world.tick) ?? false;
}

describe("① 出貨的文件真的寫了那五個決定", () => {
  it("owner's prose still carries the line these assertions are about", () => {
    expect(doc.description).toContain("[變形] 專殺畜牲，7%機率將敵人變成食材，無法動作");
  });

  it("the hook is an on-hit, ALL-target, 7 % proc that applies a STUN", () => {
    const hooks = doc.passive ?? [];
    expect(hooks.length, "殺豬刀 has no passive — 「[變形]」 pays nothing").toBe(1);
    const h = hooks[0]!;
    expect(() => zItemHookDef.parse(h), "the shipped bytes do not parse").not.toThrow();

    expect(h.on, "「7%機率將敵人變成食材」 fires on a basic attack").toBe("onBasicAttack");
    // owner 2026-08-01: 「專殺畜牲 => 也殺敵方英雄單位」. So 「畜牲」 is flavour and
    // the hook takes everyone. Pinned at "any" rather than left unasserted,
    // because narrowing it back to "mob" would silently make this line dead for
    // the first two rounds of every match (no mobs spawn until round 3, task
    // #215) — which is precisely the side effect owner's ruling removed.
    expect(h.victim, "owner ruled 「也殺敵方英雄單位」 — must not narrow back").toBe("any");
    expect(h.chance, "owner's 7%").toBeCloseTo(0.07, 6);

    const eff = (h.effects ?? [])[0];
    expect(eff?.kind, "「無法動作」 is an applyStatus, not a damage").toBe("applyStatus");
    expect((eff as { stun?: boolean }).stun, "「無法動作」 = stun, not root/slow").toBe(true);
  });

  it("持續 0.3 秒 (owner 2026-08-01「0.3秒就可以了」) —— ICD 仍是他沒給的數字", () => {
    const h = (doc.passive ?? [])[0]!;
    const eff = (h.effects ?? [])[0] as { duration?: number };
    // ⚠️ THIS ASSERTION WAS `toBeCloseTo(1)` AND THE COMMENT ABOVE IT SAID 「the
    // two numbers OWNER NEVER GAVE」. He gave one of them on 2026-08-01, so both
    // the number and the sentence are replaced — leaving the old prose in place
    // would have been a comment that lies (第三守則), and the item's own
    // `authoringNote` carried the same false sentence and was rewritten too.
    expect(eff.duration, "owner 2026-08-01: 0.3 秒").toBeCloseTo(0.3, 6);
    // …the OTHER one is still un-given, and still says so.
    expect(h.internalCooldown, "proc ICD — the attack-speed-cap fuse, awaiting owner").toBeCloseTo(3, 6);
  });
});

// ---------------------------------------------------------------------------
// behaviour
// ---------------------------------------------------------------------------

interface Rig {
  world: SimWorld;
  attacker: EntityId;
  victim: EntityId;
}

/** A melee wielder of the shipped knife + one target body. */
function rig(victimIsMob: boolean): Rig {
  const world = new SimWorld(SKELETON_ARENA, 5150);
  const attacker = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: LANE_Z },
    zone: 0,
  });
  // THE SHIPPED BUILDER, not a hand-written source — that forward is what
  // `economy/itemSource.ts` exists to make unmissable.
  const champ = world.champion.get(attacker)!;
  champ.items[0] = PIG_KNIFE as ItemId;
  attachSource(world, attacker, itemModifierSource(world, attacker, PIG_KNIFE as ItemId, 0, doc));
  recomputeStats(world, attacker);

  // The victim is a CHAMPION body either way; what changes is whether it also
  // carries a `MobComp`, because that is precisely what `HookDef.victim: "mob"`
  // reads (`world.mob`). Building it this way isolates the filter from every
  // other difference a real zombie would bring (hp, speed, ai).
  const victim = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: Z0.center.x + 1.0, z: LANE_Z },
    zone: 0,
  });
  if (victimIsMob) {
    world.mob.set(victim, {
      zone: 0,
      team: MONSTER_TEAM,
      kind: "normal", // 一般殭屍 — the ordinary roguelite mob (sim/components.ts MobKind)
      target: -1,
      attackCdTicks: 0,
      spawnTick: 0,
    });
  }
  return { world, attacker, victim };
}

/** Swing for `ticks`, keeping the target alive and in place. Returns stun ticks. */
function swingAndCountStunned(r: Rig, ticks: number): number {
  const { world, attacker, victim } = r;
  const vpos = { ...world.transform.get(victim)!.pos };
  let stunnedTicks = 0;
  for (let i = 0; i < ticks; i++) {
    const hp = world.health.get(victim)!;
    hp.hp = hp.maxHp; // a training dummy: the proc, not the kill, is the subject
    world.transform.get(victim)!.pos = { ...vpos };
    world.nav.get(attacker)!.attackTarget = victim;
    world.step(new Map());
    if (cannotAct(world, victim)) stunnedTicks++;
  }
  return stunnedTicks;
}

describe("② 「無法動作」真的動不了(讀的是 sim 自己的判準,不是狀態 id)", () => {
  it("a mob eventually gets stunned — and the stun is the real action gate", () => {
    const r = rig(true);
    const stunned = swingAndCountStunned(r, 3000);
    expect(stunned, "3000 ticks of swinging at a mob and it never lost a turn").toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// owner 2026-08-01「0.3秒就可以了」—— 行為,不是欄位
// ---------------------------------------------------------------------------

describe("③ 0.3 秒之後真的能動了(讀的是 sim 的行動閘,不是文件裡的數字)", () => {
  /**
   * 讓機率閘一定通過,打一下,回傳「從被暈的那一 tick 起,每一 tick 還動不動得了」。
   *
   * 這裡不用 ② 的連續揮擊,是因為那個 rig 靠 7% 隨機命中,量不出**確切的長度**。
   * 觸發之後不會有第二次:出貨的 `internalCooldown: 3` 秒 = 90 tick,遠大於這一
   * 段要觀察的 9 tick,所以窗口裡只有一次暈眩,沒有續接。
   */
  function stunWindow(): { appliedAtTick: number; heldTicks: number; freeAtTick: number } {
    const r = rig(false); // 英雄目標 —— owner 裁定「也殺敵方英雄單位」
    const { world, attacker, victim } = r;
    (world.rng as unknown as { chance: (p: number) => boolean }).chance = () => true;
    fireHooks(world, attacker, "onBasicAttack", victim);
    const appliedAtTick = world.tick;
    expect(cannotAct(world, victim), "強制觸發之後那一刻就該被按住").toBe(true);

    let heldTicks = 0;
    let freeAtTick = -1;
    for (let i = 0; i < 300; i++) {
      if (cannotAct(world, victim)) heldTicks++;
      else {
        freeAtTick = world.tick;
        break;
      }
      // 目標不指定攻擊對象,而且 ICD 還沒退,所以這段路上不會有第二次觸發。
      world.nav.get(attacker)!.attackTarget = -1 as EntityId;
      world.step(new Map());
    }
    return { appliedAtTick, heldTicks, freeAtTick };
  }

  it("★ 被按住剛好 9 tick,第 10 tick 就自由了 —— 30 Hz 下 9 tick = 0.3 秒", () => {
    const { appliedAtTick, heldTicks, freeAtTick } = stunWindow();
    // 9 = Math.round(0.3 / (1/30)). 這是**觀察到的**視窗,不是把欄位再讀一次:
    // 把 duration 改成 1 秒 → heldTicks 變 30,這條紅;改成 0.1 秒 → 變 3,也紅。
    expect(heldTicks, "被按住的 tick 數").toBe(9);
    expect(freeAtTick - appliedAtTick, "第幾個 tick 恢復行動").toBe(9);
  });

  it("★ 0.26 秒時還動不了、0.34 秒時已經能動 —— 夾住 0.3 這個數字本身", () => {
    // 兩側各留約一個 tick 的餘裕,所以它夾的是 0.3 而不是「某個介於 0 與 1 之間」。
    // 這一條是上一條的方向性副本:上一條說「剛好 9」,這一條說「不是 8 也不是 10
    // 的那一類錯」—— 任何把秒數改成 0.2 或 0.4 的編輯都至少踩到一邊。
    const { heldTicks } = stunWindow();
    const sec = (t: number): number => t / 30;
    expect(sec(heldTicks)).toBeGreaterThan(0.26);
    expect(sec(heldTicks)).toBeLessThan(0.34);
  });
});

describe("④ 「專殺畜牲」是風味不是過濾器 (owner 2026-08-01「也殺敵方英雄單位」)", () => {
  // ⚠️ THE POLARITY OF THIS TEST IS THE POINT. It used to assert `.toBe(0)` —
  // 「a CHAMPION target is never stunned」 — and owner's ruling inverted it. Both
  // sides are now pinned: a champion IS stunned here, and a mob still is in ②.
  // Asserting only the champion side would let a `victim: "champion"` typo pass,
  // which would silently disarm the knife against the mob waves it was written
  // for; asserting only the mob side is what let the old reading ship.
  it("a CHAMPION target DOES get stunned — the knife works in PvP now", () => {
    const r = rig(false); // champion body with no MobComp
    const stunned = swingAndCountStunned(r, 3000);
    expect(
      stunned,
      "3000 ticks swinging at a hero and it never landed — victim narrowed back to mob?",
    ).toBeGreaterThan(0);
  });
});

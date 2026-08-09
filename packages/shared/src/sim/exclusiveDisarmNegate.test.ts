/**
 * 一條線三個機制的行為守衛：**G5 互斥組** · **S8 繳械** · **45-00 反彈免傷**。
 *
 * 三條都讀**最終世界狀態**（`sc.final` 的屬性 / 事件流 / 血條），不讀 schema ——
 * 「Zod 收得下」對「欄位開了但 handler 沒接」永遠是綠的（失敗形態⑤）。
 *
 * ⛔ 沒有一個出貨數值進斷言。每一條比的都是**同一次執行的另一半**：
 * 互斥 vs 不互斥、繳械 vs 沒繳械、免傷 vs 不免傷。護甲 / 傷害的數字全是本檔
 * 自編的夾具值，只要求「A 明顯不等於 B」。
 *
 * 突變紀錄（整個 lane 一條，挑最承重也最間接的那一條：buff → hook → effect →
 * 傷害佇列 → 血條）：
 *   `combat/damage.ts` 的 `if (negated) dmg = 0;` 刪掉 →
 *     FAIL 45-00 反彈免傷：這一發不扣自己的血，反彈照樣打出去
 *     AssertionError: expected 1096.3335761107064 to be 1242 // Object.is equality
 *   （改回來後前一次的綠已經驗過，不重跑。）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import { combatResolveSystem } from "./combat/damage";
import { attachSource } from "./stats/statPipeline";
import { ModOp } from "./stats/modifiers";
import type { HookDef } from "./stats/modifiers";
import { Stat } from "./stats/statTypes";
import type { IntentFrame } from "./intents";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId, type StatusId } from "../ids";

beforeAll(() => registerSkeletonContent());

const CENTER = SKELETON_ARENA.zones[0]!.center;
const NO_INTENTS = new Map<SeatId, IntentFrame>();
/** 夾具用的兩個「戰型」護甲。差很多，好讓「有沒有相乘」看得出來。 */
const FORM_A = 30;
const FORM_B = 400;
const LONG_SEC = 60;

function hero(w: SimWorld, seat: number, team: number): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: CENTER.x + seat, z: CENTER.z },
    zone: 0,
  });
}

/** 掛一份「戰型」增益。`group` 省略 = 不互斥（＝今天）。 */
function form(
  w: SimWorld,
  who: EntityId,
  armor: number,
  group?: string,
  onExisting?: "replace" | "reject",
): void {
  runEffects(
    [
      {
        kind: "applyBuff",
        duration: LONG_SEC,
        modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: armor }],
        ...(group !== undefined ? { exclusiveGroup: group } : {}),
        ...(onExisting !== undefined ? { exclusiveOnExisting: onExisting } : {}),
      },
    ],
    { world: w, caster: who, rank: 1, targets: [who], origin: `test:form:${armor}`, rng: w.rng },
  );
}

/** 面板上的護甲（走出貨的重算相位，不是讀 sources）。 */
function armorOf(w: SimWorld, who: EntityId): number {
  w.step(NO_INTENTS);
  return w.stats.get(who)!.final[Stat.Armor];
}

describe("G5 · S8 · 45-00", () => {
  it("G5 互斥組：同一組的第二份**換掉**第一份，不是兩份相乘", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    const both = hero(w, 0, 0); // A → B，互斥
    const onlyB = hero(w, 1, 0); // 只有 B（對照組）
    const stacked = hero(w, 2, 0); // A → B，**沒填** exclusiveGroup（＝今天）
    const rejected = hero(w, 3, 0); // A → B，但 B 被 reject

    form(w, both, FORM_A, "form");
    form(w, both, FORM_B, "form");
    form(w, onlyB, FORM_B, "form");
    form(w, stacked, FORM_A);
    form(w, stacked, FORM_B);
    form(w, rejected, FORM_A, "form");
    form(w, rejected, FORM_B, "form", "reject");

    // 互斥 ⇒ 身上只剩 B，跟「只掛過 B」的人一模一樣。
    expect(armorOf(w, both)).toBe(armorOf(w, onlyB));
    // ⛔ 反方向：不填 exclusiveGroup 的人**兩份都在**（今天的行為，沒被動到）。
    expect(armorOf(w, stacked)).toBeGreaterThan(armorOf(w, onlyB));
    // reject ⇒ 新的那一份整個不生效，留下的是 A。
    expect(armorOf(w, rejected)).toBeLessThan(armorOf(w, onlyB));
  });

  it("S8 繳械：連前搖都開不了（不是揮空刀）", () => {
    const swings = (disarmed: boolean): { windups: number; hits: number } => {
      const w = new SimWorld(SKELETON_ARENA, 7);
      w.combatActive = true;
      const me = hero(w, 0, 0);
      hero(w, 1, 1);
      if (disarmed) {
        runEffects(
          [{ kind: "applyStatus", statusId: "test:disarm" as StatusId, duration: LONG_SEC, disarmed: true }],
          { world: w, caster: me, rank: 1, targets: [me], origin: "test:disarm", rng: w.rng },
        );
      }
      let windups = 0;
      let hits = 0;
      for (let k = 0; k < 90; k++) {
        w.step(NO_INTENTS);
        windups += w.events.filter((e) => e.type === "attackWindup" && e.data.source === me).length;
        hits += w.events.filter((e) => e.type === "basicAttack" && e.data.source === me).length;
      }
      return { windups, hits };
    };

    const free = swings(false);
    expect(free.hits).toBeGreaterThan(0); // 對照組真的在打（夾具是活的）
    const gagged = swings(true);
    // 揮不出來 = **兩個都是 0**。只驗 hits 的話，一個做成 missChance 包裝的
    // 「繳械」也會過 —— 而那個人的動畫與音效照播（失敗形態④）。
    expect(gagged.hits).toBe(0);
    expect(gagged.windups).toBe(0);
  });

  it("45-00 反彈免傷：這一發不扣自己的血，反彈照樣打出去", () => {
    const run = (negate: boolean) => {
      const w = new SimWorld(SKELETON_ARENA, 3);
      const attacker = hero(w, 0, 0);
      const victim = hero(w, 1, 1);
      const hook: HookDef = {
        on: "onDamageTaken",
        effects: [
          {
            kind: "damage",
            damageType: "true",
            amount: { flat: 0 },
            incomingPct: { perRank: [1], ...(negate ? { negateOriginal: true } : {}) },
          },
        ],
      };
      attachSource(w, victim, { id: "src:eye", kind: "item", hooks: [hook] });
      const before = { a: w.health.get(attacker)!.hp, v: w.health.get(victim)!.hp };
      w.damageQueue.push({
        source: attacker,
        target: victim,
        amount: 200,
        type: "physical",
        crit: false,
        origin: "basic",
      });
      combatResolveSystem(w);
      return { before, a: w.health.get(attacker)!.hp, v: w.health.get(victim)!.hp };
    };

    const plain = run(false);
    // 對照組：反彈成立（攻擊者掉血）**而且**自己照樣掉血 —— 今天的語意。
    expect(plain.a).toBeLessThan(plain.before.a);
    expect(plain.v).toBeLessThan(plain.before.v);

    const negated = run(true);
    expect(negated.v).toBe(negated.before.v); // 免傷：一滴都沒掉
    expect(negated.a).toBeLessThan(negated.before.a); // 而反彈仍然打出去了
  });
});

/**
 * 技能傷害的**預設型別**（owner 2026-08-05：「請把技能傷害預設都改成 AP 傷害」
 * ＋「但我說了是預設，如果有特別指定 真實傷害 或 物理傷害(AD)，則照技能上附註的計算」）。
 *
 * ── ⛔ 兩個方向缺一不可 ──────────────────────────────────────────────────
 *
 *  ①  **沒寫** → 魔法（吃魔抗）。
 *  ②  **寫了就照寫的** —— `physical` 吃護甲、`true` 什麼都不吃。
 *      ⛔ 這一半才是 owner 特地補的那句話。一個「一律當魔法」的實作會通過 ①，
 *      而它把每一支物理技能都變成魔法技能 —— 血條上看起來只是「數字有點不一樣」。
 *
 * ── 為什麼讀「打完之後掉了多少血」而不是讀封包的 type 欄位 ─────────────
 * 因為型別的**意義**是「吃哪一種減免」。讀 `pkt.type === "magic"` 是屬性
 *（失敗形態 ⑦）：一個把型別填對、卻在 `mitigate()` 走錯分支的實作照樣會過。
 * 所以這裡讓同一個目標**同時有護甲與魔抗、而且兩者不相等**，
 * 再從掉血量反推它到底被當成哪一種 —— 那是玩家看得到的那一個。
 *
 * ⚠️ 減免公式不抄進斷言（那是 owner 在調的東西）。三種型別**互相比較**：
 * 護甲 > 魔抗 ⇒ 物理掉得比魔法少，而真實兩者都不吃所以掉最多。
 *
 * 突變紀錄（都真的做過，見 commit message）:
 *   · `e.damageType ?? world.damageRules.…` → `"magic"`（無視卡上寫的）→ dmg-explicit-wins 紅
 *   · 同一行 → `e.damageType!`（沒寫時變成 undefined）        → dmg-default-magic 紅
 *   · `DEFAULT_DAMAGE_RULES` 改成 physical                     → dmg-default-magic 紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import { combatResolveSystem } from "./combat/damage";
import { normalizeCombatEnv } from "./combatEnv";
import { DEFAULT_DAMAGE_RULES } from "./damageRules";
import { Stat } from "./stats/statTypes";
import type { EffectContext, EffectDef } from "./effects/effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;
/** 護甲與魔抗**刻意不相等**，否則物理與魔法掉一樣多而斷言分不出來。 */
const ARMOR = 100;
const MR = 25;

function stage(): { world: SimWorld; caster: EntityId; target: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 17);
  world.combatActive = true;
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1 });
  const caster = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  const target = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: C.x + 2, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  const sc = world.stats.get(target)!;
  sc.final[Stat.Armor] = ARMOR;
  sc.final[Stat.MagicResist] = MR;
  return { world, caster, target };
}

/** 打一發 100 的技能傷害，回傳**實際掉了多少血**。 */
function hpLost(extra: Record<string, unknown>): number {
  const { world, caster, target } = stage();
  const before = world.health.get(target)!.hp;
  const ctx: EffectContext = {
    world,
    caster,
    rank: 1,
    targets: [target],
    origin: "ability:test.q",
    rng: world.rng,
  };
  runEffects([{ kind: "damage", amount: { flat: 100 }, ...extra } as EffectDef], ctx);
  combatResolveSystem(world);
  return before - world.health.get(target)!.hp;
}

describe("技能傷害的預設型別", () => {
  it("① 卡上沒寫 → 當成魔法（AP）傷害", () => {
    cover("dmg-default-magic");
    // 夾具前提：出貨預設真的是魔法。這一行不是斷言，是讓下面那個比較說得通。
    expect(DEFAULT_DAMAGE_RULES.defaultAbilityDamageType).toBe("magic");

    const omitted = hpLost({});
    const asMagic = hpLost({ damageType: "magic" });
    const asPhysical = hpLost({ damageType: "physical" });

    // 夾具前提：護甲與魔抗不同，所以兩者本來就該掉不一樣多。
    expect(asMagic).not.toBeCloseTo(asPhysical, 3);
    // ⛔ 「沒寫」與「明寫 magic」必須**完全一樣**。
    expect(omitted).toBeCloseTo(asMagic, 6);
  });

  it("② ⛔ 卡上寫了就照卡上的 —— 預設不可以蓋掉明寫的型別", () => {
    cover("dmg-explicit-wins");
    const asPhysical = hpLost({ damageType: "physical" });
    const asMagic = hpLost({ damageType: "magic" });
    const asTrue = hpLost({ damageType: "true" });

    // 三種都真的打到了（夾具前提：不是全部 0）。
    expect(asPhysical).toBeGreaterThan(0);

    // ⚠️ 不抄減免公式 —— 三者**互相比較**：
    //   護甲 100 > 魔抗 25  ⇒ 物理被削得比魔法多 ⇒ 物理掉得比較少
    //   真實什麼都不吃      ⇒ 掉最多
    expect(asPhysical).toBeLessThan(asMagic);
    expect(asMagic).toBeLessThan(asTrue);

    // ⛔ 這一條是 owner 特地補的那句話：一個「一律當魔法」的實作
    // 會讓下面兩個相等，而它通得過第 ① 條。
    expect(asPhysical).not.toBeCloseTo(asMagic, 3);
    expect(asTrue).not.toBeCloseTo(asMagic, 3);
  });

  it("③ 預設是後台那一格,不是寫死的字串", () => {
    cover("dmg-default-is-a-field");
    const { world, caster, target } = stage();
    // 把後台那一格改成物理 —— 同一份「沒寫型別」的文件應該跟著換邊。
    world.damageRules = { defaultAbilityDamageType: "physical" };
    const before = world.health.get(target)!.hp;
    runEffects([{ kind: "damage", amount: { flat: 100 } } as EffectDef], {
      world,
      caster,
      rank: 1,
      targets: [target],
      origin: "ability:test.q",
      rng: world.rng,
    });
    combatResolveSystem(world);
    const flipped = before - world.health.get(target)!.hp;

    // 跟明寫 physical 的那一發一樣多 —— 也就是那一格真的被讀了。
    expect(flipped).toBeCloseTo(hpLost({ damageType: "physical" }), 6);
    // 而且跟出貨預設（魔法）**不一樣** —— 否則這條測試什麼都沒證明。
    expect(flipped).not.toBeCloseTo(hpLost({ damageType: "magic" }), 3);
  });
});

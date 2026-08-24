/**
 * GH#644 —— 初號機 owner 裁決的兩條承重線（真 SimWorld × 出貨內容）。
 *
 * owner 2026-08-24（逐字）：
 * > 「AT力場效果及說明除了護盾以外，追加 10/15/20/25%機率格擋50%物理傷害」
 * > 「暴走狀態免疫所有負面 buff，吸血提升到100%, EX提升到400%」
 *
 * ① AT力場的格擋：**機率會發生、抽中的那一發正好被砍掉 `fraction`** ——
 *    讀的是血條（snapshot 送上線的那一份），⛔ 不是 `ModifierSource.block`
 *    在不在（失敗形態⑦）。護盾 hook 也要還在（owner：「除了護盾以外」）。
 * ② 暴走的負面免疫：CC 在**掛上之前**被拒絕（invulnerable.blocksControl），
 *    非 CC 的負面狀態落地即被拔（buff 自帶的 dispel hook）——
 *    對照組先證明同一發暈眩在**非暴走**時真的掛得上（失敗形態④）。
 *
 * ⛔ 出貨數值（10/15/20/25%、0.5、6 秒）一個都不寫進斷言 —— 全部從
 *    註冊表讀回來（第二守則：驗機制不驗數字）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import { rankUpAbility } from "./abilities/abilitySystem";
import { hasStatus } from "./effects/effectCommon";
import { isBerserk } from "./berserk";
import { DEFAULT_AUTO_ENGAGE } from "./combatFeel";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type StatusId } from "../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const EVA = "godie-e00r" as ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

function arena(seed: number, otherX = 30): { w: SimWorld; eva: EntityId; other: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, seed);
  w.combatActive = true;
  // 關掉自動接敵：這裡只量格擋與狀態掛載，⛔ 不要讓普攻污染血條讀數。
  w.combatFeel = {
    ...w.combatFeel,
    autoEngage: { ...DEFAULT_AUTO_ENGAGE, ...w.combatFeel.autoEngage, enabled: false },
  };
  const spawn = (seat: number, team: number, x: number): EntityId =>
    spawnChampion(w, {
      championId: EVA, seatId: asSeatId(seat), teamId: asTeamId(team),
      pos: { x, z: 0 }, zone: 0,
    });
  const eva = spawn(0, 0, 0);
  const other = spawn(1, 1, otherX); // 另一隊 —— 只當施加者/傷害來源/吞噬的獵物
  w.step(new Map());
  return { w, eva, other };
}

describe("GH#644 · AT力場格擋 + 暴走負面免疫", () => {
  it("① 物理傷害有兩種結局：原價、與被砍掉 fraction 的那一種 —— 兩種都真的發生", () => {
    const atField = Champions.get(EVA)!.abilities.E; // 內嵌鏡射版（champion 卡上那一份）
    const grant = atField.passive!.ranks[0]!.block!;
    expect(grant.damageTypes).toContain("physical");
    expect(grant.chance).toBeGreaterThan(0);
    expect(grant.chance).toBeLessThan(1); // 機率門 —— 不是永遠觸發
    // 護盾留著（owner：「除了護盾以外，追加」）——hook 那一半一格沒動。
    const hooks = atField.passive!.ranks[0]!.hooks!;
    expect(hooks.some((h) => h.effects.some((e) => e.kind === "shield"))).toBe(true);

    const { w, eva, other } = arena(20260824);
    // E 槽出生時是 rank 0（Q 才是預設學會的那一格）—— 給一點技能點，
    // 走**出貨的** rankUp 路徑學一階（它會 syncAbilityPassives 把 block 掛上）。
    w.abilities.get(eva)!.unspentPoints = 1;
    expect(rankUpAbility(w, eva, "E")).toBe(true);
    const hp = w.health.get(eva)!;
    // 先量一步的自然回血 —— 讀數是「淨掉血」，要把回血加回去才是那一發的原價。
    hp.hp = hp.maxHp * 0.5;
    w.step(new Map());
    const regen = hp.hp - hp.maxHp * 0.5;
    const losses = new Map<string, number>(); // 每發淨掉血 → 次數
    for (let i = 0; i < 240; i++) {
      hp.hp = hp.maxHp;
      w.damageQueue.push({
        source: other, target: eva, amount: 500, type: "physical",
        crit: false, origin: "ability:test.at-field-block",
      });
      w.step(new Map());
      const k = (hp.maxHp - hp.hp).toFixed(3);
      losses.set(k, (losses.get(k) ?? 0) + 1);
    }
    const kinds = [...losses.keys()].map(Number).filter((x) => x > 0).sort((a, b) => a - b);
    // 恰好兩種正的掉血量：原價、與 原價 × (1 − fraction)。
    expect(kinds).toHaveLength(2);
    const impact = kinds[1]! + regen; // 沒被擋那一發的原價
    expect(kinds[0]! + regen).toBeCloseTo(impact * (1 - grant.fraction), 2);
    // 兩種都要出現不只一次 —— 一個永遠不觸發（或永遠觸發）的格擋在這裡紅。
    for (const k of kinds) expect(losses.get(k.toFixed(3))!).toBeGreaterThan(1);
  });

  it("② 暴走中：暈眩掛不上（免控拒絕）、詛咒落地即被拔；同一發暈眩在非暴走時掛得上", () => {
    const { w, eva, other } = arena(59);
    const stun = { kind: "applyStatus" as const, statusId: "paralysis" as StatusId,
                   duration: 0.5, stun: true };
    const ctx = { world: w, caster: other, rank: 1, targets: [eva],
                  origin: "ability:test.berserk-immunity", rng: w.rng };
    // 對照組：非暴走時同一發暈眩真的掛得上（否則下面的「掛不上」什麼都沒證明）。
    runEffects([stun], ctx);
    expect(hasStatus(w, eva, "paralysis" as StatusId)).toBe(true);
    for (let i = 0; i < 20; i++) w.step(new Map()); // 讓它自然過期

    // 進暴走：打到門檻以下，再讓 onDamageTaken 真的發射。
    const hp = w.health.get(eva)!;
    hp.hp = hp.maxHp * 0.05;
    w.damageQueue.push({ source: other, target: eva, amount: 1, type: "true",
                         crit: false, origin: "ability:test.berserk-immunity" });
    w.step(new Map());
    expect(isBerserk(w, eva)).toBe(true);

    // CC：掛上之前就被拒絕。
    runEffects([stun], ctx);
    expect(hasStatus(w, eva, "paralysis" as StatusId)).toBe(false);

    // 非 CC 的負面狀態（詛咒 = 失手率，不在免控清單裡）：落地即被拔。
    runEffects([{ kind: "applyStatus" as const, statusId: "curse" as StatusId,
                  duration: 4, missChance: 0.33 }], ctx);
    for (let i = 0; i < 3; i++) w.step(new Map());
    expect(hasStatus(w, eva, "curse" as StatusId)).toBe(false);
    // 而免疫沒有把自己也拔掉 —— 暴走還在。
    expect(isBerserk(w, eva)).toBe(true);
  });
});

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
import { rankUpAbility, learnEx } from "./abilities/abilitySystem";
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

  /**
   * ③ owner 寫的是「**10/15/20/25%** 機率」——**一條隨階往上的梯子**，
   * ⛔ 不是一個常數。①只學一階，所以「四階全都是同一個機率」對它是綠的
   * （失敗形態④：斷言方向跟缺陷無關）。這一條把**兩端**都真的跑一次。
   * ⛔ 出貨數字一個都不寫：梯子從註冊表讀，斷言只問「頂階擋得比底階多」。
   */
  it("③ 格擋機率是一條隨階往上的梯子 —— 頂階實測擋下的次數多於底階", () => {
    const ladder = Champions.get(EVA)!.abilities.E.passive!.ranks.map((r) => r.block!.chance);
    expect(ladder.length).toBeGreaterThan(1);
    expect(ladder[ladder.length - 1]!).toBeGreaterThan(ladder[0]!);

    const blockedCount = (rank: number): number => {
      const { w, eva, other } = arena(20260824);
      w.abilities.get(eva)!.unspentPoints = ladder.length;
      for (let r = 0; r < rank; r++) expect(rankUpAbility(w, eva, "E")).toBe(true);
      const hp = w.health.get(eva)!;
      hp.hp = hp.maxHp * 0.5;
      w.step(new Map());
      const regen = hp.hp - hp.maxHp * 0.5;
      const seen: number[] = [];
      for (let i = 0; i < 400; i++) {
        hp.hp = hp.maxHp;
        w.damageQueue.push({ source: other, target: eva, amount: 500, type: "physical",
                             crit: false, origin: "ability:test.at-field-ladder" });
        w.step(new Map());
        seen.push(hp.maxHp - hp.hp + regen);
      }
      const full = Math.max(...seen);
      return seen.filter((x) => x < full - 1e-6).length;
    };
    const bottom = blockedCount(1);
    const top = blockedCount(ladder.length);
    expect(bottom, "底階一次都沒擋到 —— 機率門根本沒開").toBeGreaterThan(0);
    expect(top, `頂階(${ladder[ladder.length - 1]!})擋下 ${top} 次，底階(${ladder[0]!})擋下 ${bottom} 次 —— 梯子沒有生效`).toBeGreaterThan(bottom);
  });

  /**
   * ④ owner：「吸血提升到 **100%**，EX 提升到 **400%**」。
   * ⚠️ 斷言讀的是**血條真的往上走**，⛔ 不是 `final.lifesteal` 那一格（失敗形態⑦：
   * 屬性算出來了，而沒有任何人拿它回血）。對照組先證明沒暴走時同一發不回血。
   * ⛔ 數字不寫：只問「暴走中回血 > 0」與「EX 回得比天生技多」（400% > 100% 的序）。
   */
  it("④ 暴走的吸血真的把血補回來，而 EX 那一檔補得更多", () => {
    const healOnHit = (ex: boolean): number => {
      const { w, eva, other } = arena(59);
      if (ex) expect(learnEx(w, eva), "初號機沒有 EX 槽?").toBe(true);
      const hp = w.health.get(eva)!;
      // 對照組：還沒暴走，同一發打出去一滴血都不會回。
      hp.hp = hp.maxHp * 0.5;
      const dry = hp.hp;
      w.damageQueue.push({ source: eva, target: other, amount: 200, type: "physical",
                           crit: false, origin: "basic" });
      w.step(new Map());
      expect(hp.hp - dry, "還沒暴走就已經在吸血了 —— 對照組失效").toBeLessThanOrEqual(0.5);
      // 進暴走（EX 的門檻比天生技高，兩檔都用自己的門檻進去）。
      hp.hp = hp.maxHp * (ex ? 0.45 : 0.05);
      w.damageQueue.push({ source: other, target: eva, amount: 1, type: "true",
                           crit: false, origin: "ability:test.lifesteal" });
      w.step(new Map());
      expect(isBerserk(w, eva)).toBe(true);
      hp.hp = hp.maxHp * 0.5;
      const before = hp.hp;
      w.damageQueue.push({ source: eva, target: other, amount: 200, type: "physical",
                           crit: false, origin: "basic" });
      w.step(new Map());
      return hp.hp - before;
    };
    const innate = healOnHit(false);
    const exHeal = healOnHit(true);
    expect(innate, "暴走中打出一發卻沒有回任何血 —— 吸血那一格沒有人消費").toBeGreaterThan(0);
    expect(exHeal, `EX(400%) 回 ${exHeal.toFixed(1)}，天生技(100%) 回 ${innate.toFixed(1)} —— EX 那一檔沒有更高`).toBeGreaterThan(innate);
  });

  /**
   * ⑤ owner：「暴走狀態 吞噬門檻提升 **2x**，請記得改**說明跟實際效果**」。
   * ⚠️ 訊號讀 `devour-cooldown`（只有 `onDevour` 掛得上它），⛔ 不是「獵物死了沒」——
   * 暴走會自己衝過去普攻，一個 5% 血的獵物**被打死**與**被吞掉**在血條上一模一樣
   * （失敗形態④）。⛔ 門檻數字不寫：從兩條 hook 自己的 `thresholdPctOfMax` 取中間值。
   */
  it("⑤ 吞噬門檻在暴走中加倍 —— 卡在兩條門檻之間的獵物只有暴走時吃得到", () => {
    const hooks = Champions.get(EVA)!.abilities.Q.passive!.ranks[0]!.hooks!;
    const thresholds = hooks.map((h) => (h.effects[0] as { thresholdPctOfMax: number[] }).thresholdPctOfMax[0]!);
    const lo = Math.min(...thresholds);
    const hi = Math.max(...thresholds);
    expect(hi, "兩條 hook 的門檻一樣 —— 「暴走中加倍」不存在").toBeGreaterThan(lo);
    const probe = (lo + hi) / 2; // 平時吃不到、暴走中吃得到的那一段

    const devoured = (berserk: boolean): boolean => {
      const { w, eva, other } = arena(202, 4);
      if (berserk) {
        const hp = w.health.get(eva)!;
        hp.hp = hp.maxHp * 0.05;
        w.damageQueue.push({ source: other, target: eva, amount: 1, type: "true",
                             crit: false, origin: "ability:test.devour-threshold" });
        w.step(new Map());
      }
      expect(isBerserk(w, eva)).toBe(berserk);
      const oh = w.health.get(other)!;
      for (let t = 0; t < 30 * 4; t++) {
        if ((w.health.get(other)?.hp ?? 0) > 0) oh.hp = oh.maxHp * probe;
        w.step(new Map());
        if (hasStatus(w, eva, "devour-cooldown" as StatusId)) return true;
      }
      return false;
    };
    expect(devoured(false), `獵物在 ${(probe * 100).toFixed(1)}%（平時門檻 ${(lo * 100).toFixed(0)}%）就被吃掉了 —— 平時的門檻沒有在擋`).toBe(false);
    expect(devoured(true), `獵物在 ${(probe * 100).toFixed(1)}%（暴走門檻 ${(hi * 100).toFixed(0)}%）暴走中卻沒被吃掉 —— 加倍那一條 hook 沒有發射`).toBe(true);
  });
});

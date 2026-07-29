/**
 * 「超過總額沒關係」 — the `"bonus"` payout mode (GH#206, owner 2026-07-29).
 *
 * ── WHY THIS FILE IS SEPARATE FROM `mobs.boss.test.ts` ─────────────────────
 *
 * That file was written against the rule this one overturns. Its fixture asserts
 * `sum(payout) === pool` in a dozen places, and those assertions are still TRUE
 * and still worth keeping — for `"weight"`, which is now one of two modes rather
 * than the law. So that file is pinned to `"weight"` and this one owns the
 * shipped default. Re-baselining the old numbers in place would have destroyed
 * the only coverage the conserving mode has.
 *
 * ── THE ASSERTION THAT MATTERS ────────────────────────────────────────────
 *
 * The owner gave a worked example, and it is the sharpest possible test because
 * it pins a SPECIFIC number that only the intended implementation produces:
 *
 *   「極端情形第一刀就是最後一刀全傷害 = 200% 金錢跟等級獎勵」
 *
 * One champion, all the damage, lands the blow → exactly 2× the pool. Every
 * wrong implementation lands somewhere else:
 *   · the old `"weight"` rule                     → 1× (that is its whole point)
 *   · doubling the pool up front                  → 2× here but 2× ALWAYS,
 *                                                   including for a kill-stealer
 *   · doubling only the proportional part, pre-remainder → 2× minus the remainder
 * so a single number separates four behaviours.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { splitBossBounty } from "./mobBoss";
import { asEntityId } from "../ids";

const A = asEntityId(1);
const B = asEntityId(2);
const C = asEntityId(3);

const sum = (s: readonly { gold: number }[]): number => s.reduce((t, x) => t + x.gold, 0);
const sumLevels = (s: readonly { levels: number }[]): number => s.reduce((t, x) => t + x.levels, 0);

describe("bonus 模式:owner 的 200% 極端情形", () => {
  it("一個人打完全部傷害又補刀 → 剛好 200%,金錢與等級都是", () => {
    cover("mob-boss-bonus");
    const s = splitBossBounty([[A, 500]], { gold: 30_000, xp: 1200, levels: 50 }, A, 2, "bonus");

    expect(s).toHaveLength(1);
    expect(s[0]!.gold).toBe(60_000); // 30,000 的 200%
    expect(s[0]!.xp).toBe(2400);
    expect(s[0]!.levels).toBe(100); // 50 級的 200%
  });

  it("★ 同一個情境在 weight 模式下是 100% —— 模式旋鈕是活的", () => {
    cover("mob-boss-bonus");
    const s = splitBossBounty([[A, 500]], { gold: 30_000, xp: 1200, levels: 50 }, A, 2, "weight");
    expect(s[0]!.gold).toBe(30_000);
    expect(s[0]!.levels).toBe(50);
  });

  it("★ 預設就是 bonus —— 不傳第五個參數要拿到 owner 的語意,不是舊的", () => {
    cover("mob-boss-bonus");
    // 這條擋的是「加了模式但忘了改預設」,那會讓整個 GH#206 靜默失效。
    const s = splitBossBounty([[A, 500]], { gold: 1000, xp: 0, levels: 0 }, A, 2);
    expect(s[0]!.gold).toBe(2000);
  });
});

describe("bonus 模式:加碼加的是「自己的份額」,不是整池", () => {
  it("補刀的人只做了 1/5 傷害 → 拿 1/5 再加一份 1/5,總額 120% 而不是 200%", () => {
    cover("mob-boss-bonus");
    // A 100 / B 400,補刀是 A。A 的份額 200,加碼再 +200 → 400;B 不動 800。
    const s = splitBossBounty([[A, 100], [B, 400]], { gold: 1000, xp: 0, levels: 0 }, A, 2, "bonus");
    const by = new Map(s.map((x) => [x.id, x]));

    expect(by.get(A)!.gold).toBe(400);
    expect(by.get(B)!.gold).toBe(800);
    expect(sum(s)).toBe(1200); // 120%,嚴格介於 pool 與 2×pool 之間
  });

  it("總額永遠落在 [pool, pool × mult] 之間 —— 兩端都要能被證偽", () => {
    cover("mob-boss-bonus");
    const pool = { gold: 1000, xp: 0, levels: 0 };
    for (const [dmgA, dmgB] of [[1, 999], [500, 500], [999, 1], [1, 1]] as const) {
      const s = splitBossBounty([[A, dmgA], [B, dmgB]], pool, A, 2, "bonus");
      expect(sum(s)).toBeGreaterThanOrEqual(1000);
      expect(sum(s)).toBeLessThanOrEqual(2000);
    }
  });

  it("mult = 1 真的把加碼關掉(而且與 weight 模式同值)", () => {
    cover("mob-boss-bonus");
    const pool = { gold: 1000, xp: 0, levels: 0 };
    const bonus = splitBossBounty([[A, 100], [B, 100]], pool, A, 1, "bonus");
    const weight = splitBossBounty([[A, 100], [B, 100]], pool, A, 1, "weight");
    expect(bonus.map((x) => x.gold)).toEqual([500, 500]);
    expect(bonus).toEqual(weight);
  });
});

describe("bonus 模式:不該加碼的兩條分支", () => {
  it("★ 零傷害搶人頭拿的是安慰獎全額,不是 200%", () => {
    cover("mob-boss-bonus");
    // 這正是舊 rule-2 警告的「憑空鑄幣」。owner 的例子是「全傷害 + 補刀」→ 200%,
    // 不是「零傷害 + 補刀」→ 200%。這條把兩者分開。
    const s = splitBossBounty([], { gold: 1000, xp: 0, levels: 20 }, B, 2, "bonus");
    expect(s).toHaveLength(1);
    expect(s[0]!.gold).toBe(1000); // 100%,不是 2000
    expect(s[0]!.levels).toBe(20);
  });

  it("沒有補刀者 → 沒有任何加碼,總額剛好是 pool", () => {
    cover("mob-boss-bonus");
    const s = splitBossBounty([[A, 300], [B, 700]], { gold: 1000, xp: 0, levels: 0 }, null, 2, "bonus");
    expect(sum(s)).toBe(1000);
  });

  it("補刀者零傷害但別人有傷害 → 他的份額是 0,加碼 0 次仍是 0", () => {
    cover("mob-boss-bonus");
    // C 沒打過王但補到刀;A 打滿。C 走「餘數收件人」那條路拿到餘數,
    // 加碼是「份額 × (mult-1)」所以只放大他自己那一點,不是整池。
    const s = splitBossBounty([[A, 1000]], { gold: 999, xp: 0, levels: 0 }, C, 2, "bonus");
    const by = new Map(s.map((x) => [x.id, x]));
    expect(by.get(A)!.gold).toBe(999);
    expect(by.get(C)!.gold).toBe(0);
    expect(sum(s)).toBe(999); // 沒有人被加碼 ⇒ 沒有超額
  });
});

describe("bonus 模式:比例與決定性沒有被加碼破壞", () => {
  it("非補刀者之間的比例仍然嚴格照傷害", () => {
    cover("mob-boss-bonus");
    const s = splitBossBounty(
      [[A, 100], [B, 200], [C, 300]],
      { gold: 1200, xp: 0, levels: 0 },
      A,
      2,
      "bonus",
    );
    const by = new Map(s.map((x) => [x.id, x]));
    // B:C = 200:300 = 2:3,加碼只動 A
    expect(by.get(C)!.gold / by.get(B)!.gold).toBeCloseTo(1.5, 6);
  });

  it("順序無關:同一張表打散後付一樣的錢", () => {
    cover("mob-boss-bonus");
    const pool = { gold: 1000, xp: 333, levels: 7 };
    const fwd = splitBossBounty([[A, 137], [B, 291], [C, 55]], pool, C, 2, "bonus");
    const bwd = splitBossBounty([[C, 55], [B, 291], [A, 137]], pool, C, 2, "bonus");
    expect(bwd).toEqual(fwd);
    expect(fwd.map((x) => x.id)).toEqual([A, B, C]);
  });

  it("每一份都是整數 —— 沒有浮點洩漏到錢包或等級", () => {
    cover("mob-boss-bonus");
    const s = splitBossBounty(
      [[A, 137], [B, 291], [C, 55]],
      { gold: 1000, xp: 333, levels: 7 },
      C,
      2,
      "bonus",
    );
    for (const x of s) {
      expect(Number.isInteger(x.gold)).toBe(true);
      expect(Number.isInteger(x.xp)).toBe(true);
      expect(Number.isInteger(x.levels)).toBe(true);
    }
    expect(sumLevels(s)).toBeGreaterThanOrEqual(7);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 溢傷不算 (owner 2026-07-29, GH#206)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 這一段測的不是 `splitBossBounty` 的算術,而是**帳本記什麼**。差別在
 * `stats/matchStats.ts`:記 `output`(減傷後的原始數字,不封頂)還是記 `hpLoss`
 * (王真的掉的血)。owner 裁決「不算」⇒ 記 `hpLoss`。
 *
 * ⚠️ 為什麼在 bonus 模式下這件事變嚴重:weight 模式總額守恆,溢傷只是**重新分配**
 * 誰拿多少;bonus 模式的加碼是「份額 × (mult-1)」,所以溢傷把**整包**吹大,
 * 不只是把別人的份搶過來。
 */
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId } from "../ids";
import { mobRulesFromConfig, summonMobBoss, type MobRules } from "./mobs";
import { beginCombatMobs } from "./systems/MobSystem";
import { DEFAULT_MOB_WAVES_CONFIG } from "../content/schema/config";
import { beforeAll as _beforeAll } from "vitest";

_beforeAll(() => registerSkeletonContent());

function kingWorld(rules: MobRules): { w: SimWorld; hero: number; king: number } {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatActive = true;
  beginCombatMobs(w, rules, [0]);
  const hero = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: 0, z: 0 },
    zone: 0,
  });
  const king = summonMobBoss(w, 0, rules, hero, rules.boss!.killThreshold)!;
  return { w, hero, king: king as unknown as number };
}

describe("溢傷不算 —— 帳本記的是王真的掉的血", () => {
  it("★ 一發遠超王剩餘血量的大招,帳本只記到王的血量為止", () => {
    cover("mob-boss-overkill");
    const rules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, 1 / 30);
    const { w, hero, king } = kingWorld(rules);
    const maxHp = rules.boss!.maxHp;

    // 100 倍的溢傷。記 `output` 會是 maxHp*100;記 `hpLoss` 只會是 maxHp。
    w.damageQueue.push({
      source: hero as never,
      target: king as never,
      amount: maxHp * 100,
      type: "true",
      crit: false,
      origin: "ability",
    });
    // 讀死亡前的帳本:step 會付款並 destroy,所以先偷一 tick 的中間狀態不可行 ——
    // 改為斷言**付款結果**,那是玩家真正拿到的東西(避免失敗形態⑦:量帳本這個屬性)。
    w.step(new Map());

    const ev = w.events.find((e) => e.type === "mobBossSlain")!;
    const shares = ev.data["shares"] as { damage: number }[];
    expect(shares).toHaveLength(1);
    // 記 output 的話這裡會是 maxHp*100(= 6,000,000);記 hpLoss 是 maxHp。
    expect(shares[0]!.damage).toBeLessThanOrEqual(maxHp);
    expect(shares[0]!.damage).toBeGreaterThan(0);
  });

  it("countOverkill 打開就恢復舊行為 —— 旋鈕是活的,不是裝飾", () => {
    cover("mob-boss-overkill");
    const cfg = {
      ...DEFAULT_MOB_WAVES_CONFIG,
      boss: { ...DEFAULT_MOB_WAVES_CONFIG.boss!, countOverkill: true },
    };
    const rules = mobRulesFromConfig(cfg, 1 / 30);
    const { w, hero, king } = kingWorld(rules);
    const maxHp = rules.boss!.maxHp;

    w.damageQueue.push({
      source: hero as never,
      target: king as never,
      amount: maxHp * 100,
      type: "true",
      crit: false,
      origin: "ability",
    });
    w.step(new Map());

    const ev = w.events.find((e) => e.type === "mobBossSlain")!;
    const shares = ev.data["shares"] as { damage: number }[];
    // 開著的時候溢傷全額計入 → 遠遠超過王的血量
    expect(shares[0]!.damage).toBeGreaterThan(maxHp);
  });
});

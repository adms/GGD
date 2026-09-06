/**
 * GH#1074 —— 07 者皆陣三連（Q 臨兵鬥 → W 者皆陣 → E 列在前）**按不按得出來**。
 *
 * 出貨內容、真的 world、真的 `castAbility`、真的 `CastResolveSystem`。⛔ 沒有一條斷言在讀
 * JSON 的形狀（形態⑦）、⛔ 沒有一筆紀錄是手寫進 ledger 的（形態⑤）。
 *
 * ── 量到的（2026-09-06，動手前）────────────────────────────────────────────────
 *
 * ① 07-01 在磁碟上是 `effects: []`，⛔ 但**不是**零效果技能：`tpl-buff-self` 在註冊時展開成
 *    `applyBuff{ms +中 6s}`（`drafts.py:366` 的「spirit walk?」猜測 —— ANss 其實是 Spell Shield）。
 *    `isPassiveOnly` 只問 `passive !== undefined && effects.length === 0` ⇒ 它**放得出來**，
 *    而且 `noteAbilityCast`（`abilitySystem.ts:812`）在提交點記到它 ⇒ ⭐ 07-02 的 `recentCast Q` 讀得到。
 *
 * ② ⛔⛔ **Q→W 的 1 秒窗口在出貨設定下按不出來**。`recentCast` 的求值點是 W 的**解算** tick
 *    （`resolveScaling` 的 `holds` 由 `damage` 節點在 `CastResolveSystem` 跑效果時建），而紀錄的是 Q 的
 *    **提交** tick ⇒ 量到的間隔 = (W 提交 − Q 提交) + W 吟唱。W 的吟唱是 1.0 s（`castTimeSec: 1`，
 *    `castTimeMaxSec` 夾也是 1）、窗口也是 1.0 s，而 Q 自己還有 2 tick 吟唱擋著 W 的按鍵
 *    （`if (ab.cast) return "cooldown"`）⇒ 最短間隔 32 tick > 30 tick 窗口 ⇒ **任何時序都不成立**。
 *    原作沒有這個問題：`udg_MoonCombo` 在 Q/W 的 SPELL_EFFECT（同一種時間點）各讀各寫。
 *
 * ③ ⛔ **W→E 同型**：`moon-combo` 在 W 解算那一 tick 掛上（1.0 s），E 的 `comboBonus` 在 E 解算
 *    （1.0 s 吟唱之後）烘焙 ⇒ 到期判準 `expiresAtTick > world.tick` 在最早的時序上也差一個 tick。
 *
 * ⇒ ⭐ **GH#1086 修法**：連段窗口相對於**這一次施放的提交 tick** 量，⛔ 不是解算 tick ——
 *    `recentCast` 拿 `ConditionContext.castCommitTick` 當基準（`EffectContext.castCommitTick`
 *    由 `CastResolveSystem` 從 `CastState.beganTick` 帶過來）；有吟唱的技能在**提交點**就把
 *    `comboBonus` 烘進 `CastState.effects`（`bakeCastTimeConditionals`），⛔ 不等到 moon-combo 被
 *    `statusExpirySystem` 剪掉之後才問。開關 `config.cast-time@1.comboWindowFrom`（出貨 `commit`；
 *    `resolve` ⇒ 逐位元回 2026-09-06 之前）。兩個「窗口內 ⇒ 含加成」的方向因此從 `it.fails` 翻回 `it`。
 *    ⚠️ 這兩條紅了而 `comboWindowFrom` 是 `commit` ⇒ 先看 `docs/_reports/1086_*` 的柵欄外 patch
 *    （statsComp / effect / CastResolveSystem / damage / effectRunner / abilitySystem）套了沒。
 *    07-01 的法術護盾（缺「擋一次就消耗」的 `statusImmunity.charges`）是 **GH#1085**。
 *
 * ── 突變紀錄 ────────────────────────────────────────────────────────────────
 * （⚠️⚠️ 改之前先查那一份是誰的：bash scripts/genguard.sh content/abilities/godie-hpb1.e.json
 *   · 產生器的產物 ⇒ 改**來源**（tools/skill-remake/…）再 bash scripts/genrun.sh <step>。
 *   ⛔ 直接改出貨 JSON 會被下一次 sync 打回來，而那個「又紅了」看起來像**新的**錯。）
 * `content/abilities/godie-hpb1.e.json` 第二條 comboBonus ratio 的 `when` 改回
 * `{kind:"stat",subject:"self",stat:"level",op:">=",value:30}`：
 *   × 「07-03 的 EX 分岔讀 learned EX」 FAIL（EX 解鎖後第二段不成立）
 * 改回來 → 綠。
 * GH#1086（沙盒複本、同一次跑）：`condition.ts` recentCast 的基準改回 `world.tick` ＋
 * `abilitySystem.ts` 提交點不烘焙（`effects` 不寫進 CastState）：
 *   × 「吟唱一結束就按 W ⇒ 傷害含條件式 AP 項」 FAIL（1761.89 = 基準）
 *   × 「W 解算後立刻按 E ⇒ 落地傷害含 comboBonus」 FAIL（1211.22 = 基準）
 *   ○ 兩條「超過窗口 ⇒ 等於基準」＋「關掉 ⇒ 逐位元回今天」 PASS
 * 改回來 → 7/7 綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { lastCastTickInSlot } from "./content/castLedger";
import { evaluateCondition, type EffectCondition } from "./content/condition";
import { DEFAULT_CAST_TIME_RULES, type CastTimeRules } from "./castTimeRules";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../..", "content");
const USHIO = "godie-hpb1" as ChampionId;
const W_ORIGIN = "ability:godie-hpb1.w";
const E_ORIGIN = "ability:godie-hpb1.e";
const NO_INTENTS = new Map();
/** 夾具：連段窗口（卡面「1 秒內」）。⛔ 只用來判定「這個情境算不算 1 秒內按了」。 */
const WINDOW_SEC = 1;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(res.store);
});

interface Stage {
  world: SimWorld;
  hero: EntityId;
  victim: EntityId;
  point: { x: number; z: number };
}

/**
 * 蒼月潮（Q/W/E 各 1 級、AP 由一份測試來源給）＋ 對面一位站在 2 單位外的靶。
 * `rules`：覆寫 `config.cast-time@1`（只有「關掉 ⇒ 回今天」那一條會傳；⛔ 不抄出貨值）。
 */
function stage(rules: Partial<CastTimeRules> = {}, seed = 1074): Stage {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  world.castTimeRules = { ...DEFAULT_CAST_TIME_RULES, ...rules };
  const c = SKELETON_ARENA.zones[0]!.center;
  const hero = spawnChampion(world, {
    championId: USHIO,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z },
    zone: 0,
  });
  const point = { x: c.x + 2, z: c.z };
  const victim = spawnChampion(world, {
    championId: USHIO,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: point,
    zone: 0,
  });
  const ab = world.abilities.get(hero)!;
  ab.slots.Q.rank = 1;
  ab.slots.W.rank = 1;
  ab.slots.E.rank = 1;
  // AP 不是出貨數值：只要「窗口內 vs 窗口外」的 AP 項分得出來就夠。
  const sc = world.stats.get(hero)!;
  sc.sources.push({
    id: "test:ap",
    kind: "item",
    modifiers: [{ stat: Stat.AbilityPower, op: ModOp.Flat, value: 200 }],
  });
  sc.dirty = true;
  world.step(NO_INTENTS);
  return { world, hero, victim, point };
}

function refill(world: SimWorld, hero: EntityId, victim?: EntityId): void {
  world.health.get(hero)!.mana = 9999;
  // ⭐ 2026-09-07：把假人的血補滿。`combatActive` 讓兩邊在等待窗口的那三秒**自動互打**，
  //   而 AP 係數重新校準之後 W 的傷害變大 ⇒ 假人在第三段（超過窗口那一次）之前就死了，
  //   症狀是「E 沒打出傷害」而看起來像技能壞了。⛔ 這不是放寬斷言：量的仍是同一發傷害。
  for (const id of victim === undefined ? [hero] : [hero, victim]) {
    const h = world.health.get(id)!;
    h.hp = h.maxHp;
    h.alive = true; // ⭐ 補血不夠：死了的身體 `alive` 仍是 false ⇒ 落地查詢跳過它，症狀是「E 沒打出傷害」
  }
}

/** 往前推到第一筆 `origin` 的 damage 事件；回 { tick, amount }，找不到回 null。 */
function stepUntilDamage(
  world: SimWorld,
  origin: string,
  maxTicks: number,
): { tick: number; amount: number } | null {
  // ⭐ 2026-09-07：**先看再走**。`world.step()` 會清掉上一 tick 的事件 ——
  //   施放在提交那一刻就結算的情況（castTimeSec 0、或 GH#1086 之後在提交點烘焙），
  //   傷害事件在 `castAbility` 回來時就已經在 `world.events` 裡了，先 step 會把它掃掉，
  //   而症狀是「⛔ 只放 E 也沒打出傷害 —— 夾具壞了」，⛔ 看起來像技能壞了。
  const hit = (): { tick: number; amount: number } | null => {
    const ev = world.events.find((e) => e.type === "damage" && e.data["origin"] === origin);
    return ev === undefined ? null : { tick: world.tick, amount: ev.data["amount"] as number };
  };
  const now = hit();
  if (now !== null) return now;
  for (let i = 0; i < maxTicks; i++) {
    world.step(NO_INTENTS);
    const ev = hit();
    if (ev !== null) return ev;
  }
  return null;
}

/** 等到上一次施放的吟唱結束（`ab.cast` 清掉）—— 這是下一顆按鍵**最早**能按下去的時刻。 */
function stepUntilFreeToCast(world: SimWorld, hero: EntityId, maxTicks: number): void {
  for (let i = 0; i < maxTicks && world.abilities.get(hero)!.cast; i++) world.step(NO_INTENTS);
}

const sec = (world: SimWorld, n: number): number => Math.round(n / world.dt);

/** Q → 最早能按的那一 tick 按 W。回 W 的傷害與「W 按下 − Q 按下」的 tick 差。 */
function qThenW(rules: Partial<CastTimeRules> = {}): { base: number; inWindow: number; late: number; pressGapTicks: number; resolveGapTicks: number; windowTicks: number } {
  // 基準：只放 W。
  const a = stage(rules);
  refill(a.world, a.hero, a.victim);
  expect(castAbility(a.world, a.hero, "W", { type: "entity", entityId: a.victim })).toBe("ok");
  const base = stepUntilDamage(a.world, W_ORIGIN, 120);
  expect(base, "⛔ 只放 W 也沒打出傷害 —— 夾具壞了").not.toBeNull();

  // 窗口內：Q → 吟唱一結束就按 W。
  const b = stage(rules);
  refill(b.world, b.hero, b.victim);
  expect(castAbility(b.world, b.hero, "Q", { type: "self" })).toBe("ok");
  const qTick = b.world.tick;
  stepUntilFreeToCast(b.world, b.hero, 30);
  refill(b.world, b.hero, b.victim);
  expect(castAbility(b.world, b.hero, "W", { type: "entity", entityId: b.victim })).toBe("ok");
  const pressGapTicks = b.world.tick - qTick;
  const hit = stepUntilDamage(b.world, W_ORIGIN, 120);
  expect(hit, "⛔ Q 之後放 W 沒打出傷害 —— 夾具壞了").not.toBeNull();

  // 窗口外：Q → 等 3 個窗口 → W。
  const c = stage(rules);
  refill(c.world, c.hero, c.victim);
  expect(castAbility(c.world, c.hero, "Q", { type: "self" })).toBe("ok");
  for (let i = 0; i < sec(c.world, WINDOW_SEC * 3); i++) c.world.step(NO_INTENTS);
  refill(c.world, c.hero, c.victim);
  expect(castAbility(c.world, c.hero, "W", { type: "entity", entityId: c.victim })).toBe("ok");
  const late = stepUntilDamage(c.world, W_ORIGIN, 120);
  expect(late).not.toBeNull();

  return {
    base: base!.amount,
    inWindow: hit!.amount,
    late: late!.amount,
    pressGapTicks,
    resolveGapTicks: hit!.tick - qTick,
    windowTicks: sec(b.world, WINDOW_SEC),
  };
}

/** W → 解算那一 tick（moon-combo 剛掛上）就按 E。回 E 落地傷害與時序。 */
function wThenE(rules: Partial<CastTimeRules> = {}): { base: number; inWindow: number; late: number; pressGapTicks: number; windowTicks: number } {
  // ⭐ 2026-09-07：瞄**假人現在站的地方**，⛔ 不是它出生的座標 —— `combatActive` 讓兩邊在等待
  //   窗口的那三秒自動互打並移動，照舊座標打會落在空地上（症狀：castE 回 ok 而零傷害）。
  const castE = (s: Stage) =>
    castAbility(s.world, s.hero, "E", {
      type: "point",
      point: { ...s.world.transform.get(s.victim)!.pos },
    });

  const a = stage(rules);
  refill(a.world, a.hero, a.victim);
  expect(castE(a)).toBe("ok");
  const base = stepUntilDamage(a.world, E_ORIGIN, 240);
  expect(base, "⛔ 只放 E 也沒打出傷害 —— 夾具壞了").not.toBeNull();

  const b = stage(rules);
  refill(b.world, b.hero, b.victim);
  expect(castAbility(b.world, b.hero, "W", { type: "entity", entityId: b.victim })).toBe("ok");
  const wHit = stepUntilDamage(b.world, W_ORIGIN, 120);
  expect(wHit).not.toBeNull();
  stepUntilFreeToCast(b.world, b.hero, 30);
  refill(b.world, b.hero, b.victim);
  expect(castE(b)).toBe("ok");
  const pressGapTicks = b.world.tick - wHit!.tick;
  const eHit = stepUntilDamage(b.world, E_ORIGIN, 240);
  expect(eHit, "⛔ W 之後放 E 沒打出傷害 —— 夾具壞了").not.toBeNull();

  const c = stage(rules);
  refill(c.world, c.hero, c.victim);
  expect(castAbility(c.world, c.hero, "W", { type: "entity", entityId: c.victim })).toBe("ok");
  expect(stepUntilDamage(c.world, W_ORIGIN, 120)).not.toBeNull();
  // ⭐ 2026-09-07：等窗口過期的這三秒**把自動互打關掉** —— `combatActive` 會讓兩邊一直普攻，
  //   那些普攻改變雙方狀態（護甲／攻速堆疊）⇒「超過窗口」那一發與基準差幾點傷害，逐位元比對永遠不成立。
  //   ⛔ 這不是放寬斷言：量的仍是同一發 E 的傷害。
  c.world.combatActive = false;
  for (let i = 0; i < sec(c.world, WINDOW_SEC * 3); i++) c.world.step(NO_INTENTS);
  c.world.combatActive = true;
  refill(c.world, c.hero, c.victim);
  expect(castE(c)).toBe("ok");
  const late = stepUntilDamage(c.world, E_ORIGIN, 240);
  expect(late).not.toBeNull();

  return {
    base: base!.amount,
    inWindow: eHit!.amount,
    late: late!.amount,
    pressGapTicks,
    windowTicks: sec(b.world, WINDOW_SEC),
  };
}

describe("GH#1074 07-01 臨兵鬥 —— 磁碟上零效果的技能，出貨路徑上放得出來、記得進 castLedger", () => {
  it("cast Q ⇒ ok，而且 `recentCast slot Q` 那一格當下就有紀錄", () => {
    const { world, hero } = stage();
    refill(world, hero);
    expect(lastCastTickInSlot(world, hero, "Q")).toBeNull();
    expect(castAbility(world, hero, "Q", { type: "self" })).toBe("ok");
    expect(lastCastTickInSlot(world, hero, "Q")).toBe(world.tick);
  });
});

describe("GH#1074 Q→W 的 1 秒連擊窗（07-02 卡面「在臨兵鬥發動後 1 秒內施展」）", () => {
  it("超過窗口 ⇒ W 的傷害**不含**條件式 AP 項（與沒放 Q 逐位元相同）", () => {
    const r = qThenW();
    expect(r.late).toBe(r.base);
  });

  it("⭐ GH#1086：吟唱一結束就按 W（1 秒內）⇒ 傷害含條件式 AP 項（窗口從按下起算）", () => {
    const r = qThenW();
    // 情境的正當性：W 真的是在 Q 之後 1 秒內按下去的（⛔ 不是夾具作弊）。
    expect(r.pressGapTicks, "W 不是在窗口內按的 —— 夾具壞了").toBeLessThanOrEqual(r.windowTicks);
    expect(
      r.inWindow,
      `窗口內的 W 應該比基準多出 AP 項；量到 press 差 ${r.pressGapTicks} tick、` +
        `解算差 ${r.resolveGapTicks} tick（窗口 ${r.windowTicks} tick）—— ` +
        `recentCast 又在 W 的解算 tick 量了（castCommitTick 沒帶到 ConditionContext？` +
        `⇒ 看 docs/_reports/1086_* 的柵欄外 patch 套了沒）`,
    ).toBeGreaterThan(r.base);
  });

  it("關掉（comboWindowFrom: resolve）⇒ 逐位元回今天：窗口內的 W 仍等於基準", () => {
    const r = qThenW({ comboWindowFrom: "resolve" });
    expect(r.inWindow).toBe(r.base);
  });
});

describe("GH#1074 W→E 的 moon-combo 鏈（07-03 卡面「在者皆陣發動後 1 秒內施展」）", () => {
  it("超過窗口 ⇒ E 落地傷害**不含** comboBonus（與沒放 W 逐位元相同）", () => {
    const r = wThenE();
    // ⭐ 2026-09-07：窗口外那一發與基準**不是逐位元相同** —— 兩次是不同的世界歷史：
    //   `c` 先放了 W，而 07-00 靈壓（本人的被動）會因此多一層 ⇒ E 落地時 AP 高幾點（實測差 6.6 / 1229）。
    //   ⇒ 判準改成「⛔ **沒有** comboBonus」：comboBonus 是 1.3～2.5 × AP(200) ＝ 260～500，
    //   而漂移是個位數 ⇒ 這條仍然會在加成誤中的那一刻紅。⛔ 不是放寬，是把「相同」換成量得準的那一個。
    const bonusFloor = (r.inWindow - r.base) / 2;
    expect(r.late - r.base, `窗口外那一發混進了 comboBonus（差 ${r.late - r.base}）`).toBeLessThan(bonusFloor);
    expect(r.late).toBeGreaterThanOrEqual(r.base);
  });

  it("⭐ GH#1086：W 解算後立刻按 E（1 秒內）⇒ 落地傷害含 comboBonus（提交點烘焙）", () => {
    const r = wThenE();
    expect(r.pressGapTicks, "E 不是在窗口內按的 —— 夾具壞了").toBeLessThanOrEqual(r.windowTicks);
    expect(
      r.inWindow,
      `窗口內的 E 應該比基準多出 comboBonus；量到 press 差 ${r.pressGapTicks} tick（窗口 ${r.windowTicks} tick）—— ` +
        `comboBonus 又在 E 的解算 tick 烘焙了（castAbility 提交點沒寫 CastState.effects？` +
        `⇒ 看 docs/_reports/1086_* 的柵欄外 patch 套了沒）`,
    ).toBeGreaterThan(r.base);
  });

  it("關掉（comboWindowFrom: resolve）⇒ 逐位元回今天：窗口內的 E 仍等於基準", () => {
    const r = wThenE({ comboWindowFrom: "resolve" });
    expect(r.inWindow).toBe(r.base);
  });
});

describe("GH#1074 07-03 的 EX 分岔讀 `learned EX`，⛔ 不再讀 level", () => {
  it("EX 未解鎖：第一段成立、第二段不成立；解鎖（exSlot.rank 0→1）之後對調", () => {
    const { world, hero } = stage();
    const def = Abilities.get("godie-hpb1.e" as AbilityId);
    const leap = def.effects.find((e) => e.kind === "leap")!;
    const dmg = (leap as { onLand: { kind: string; comboBonus?: { amount: { ratios?: { when?: EffectCondition }[] } } }[] })
      .onLand.find((e) => e.kind === "damage")!;
    const whens = (dmg.comboBonus!.amount.ratios ?? []).map((r) => r.when!);
    expect(whens).toHaveLength(2);
    const holds = (c: EffectCondition) => evaluateCondition(world, c, { self: hero });

    const ab = world.abilities.get(hero)!;
    expect(ab.exSlot, "蒼月潮有 07-002 ⇒ exSlot 必須在").toBeTruthy();
    ab.exSlot!.rank = 0;
    expect(whens.map(holds)).toEqual([true, false]);
    ab.exSlot!.rank = 1; // EX 解鎖 —— 與 `unlockEx` 的寫入端同一格
    expect(whens.map(holds)).toEqual([false, true]);
  });
});

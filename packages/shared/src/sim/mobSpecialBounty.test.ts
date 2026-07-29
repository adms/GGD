/**
 * 特殊殭屍分紅 (#288, owner 2026-07-29: 「特殊殭屍也照傷害比例分,獎勵是金錢
 * +5,000 · 等級提升 +5」).
 *
 * ── WHAT EACH ASSERTION IS SHAPED AGAINST ──────────────────────────────────
 *
 * ⑦ 「掃屬性」 / 「量帳本」. The owner's sentence is about MONEY AND LEVELS
 *    ARRIVING, not about a `Map` in the sim having entries. So every payout
 *    guard below reads `champion.gold` / `champion.level` (the wallet) and the
 *    EMITTED EVENT (the only thing that reaches a socket). `world.bossDamage` is
 *    asserted on in exactly one place — the O(n²) guard — and there the ledger
 *    IS the subject.
 *
 * ④ 「斷言方向與缺陷無關」. Every number here is one only the intended
 *    implementation produces:
 *      · the split uses 3,000 / 1,000, so 「照比例」 (3750/1250) is a different
 *        number from 「平分」 (2500/2500) AND from 「全給補刀的」 (0/5000);
 *      · the LAST HITTER is the SMALLER damager, so an implementation that pays
 *        the killer everything, or that weights the last hit, lands elsewhere;
 *      · the level remainder (5 levels over a 3:1 split = 3 + 1, remainder 1)
 *        goes to a NAMED recipient, so 「餘數丟掉」 (3+1=4) fails.
 *
 * ② 「算了沒送到」. `mobBossSlain` carries the whole sheet and `kind`, and the
 *    wire half is pinned in apps/game-server/src/net/mobBossWire.test.ts (this
 *    package cannot import the fanout allowlist).
 *
 * ⑤ 「被測的不是出貨的」. The pool numbers come from `DEFAULT_MOB_WAVES_CONFIG`
 *    via `mobRulesFromConfig` — the same call the host makes — and one test
 *    asserts the shipped block really carries the owner's 5,000 / +5.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import {
  mobRulesFromConfig,
  mobBountyRules,
  mobLedgerRule,
  spawnMob,
  type MobRules,
  type MobSpecialRules,
} from "./mobs";
import { beginCombatMobs } from "./systems/MobSystem";
import { DEFAULT_MOB_WAVES_CONFIG } from "../content/schema/config";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;

/**
 * Rules built from the SHIPPED config, with the special's hp pinned to a round
 * number and its `bounty` block overridable.
 *
 * `maxHp: 4000` is an override of the hero-derived 12,764 purely so the damage
 * arithmetic below is legible (3,000 + 1,000). It goes through
 * `MobSpecialRules.maxHp`, which is the SAME absolute-override field GH#206
 * ships, so `mobProfile` resolves it exactly the way it resolves the real one.
 * `xp: 0` in the default pool keeps 等級 assertions clean: `grantXp` can level a
 * champion on its own, and mixing the two would make 「拿到 3 級」 a claim about
 * the XP curve rather than about the split.
 */
function specialRules(bounty?: Partial<NonNullable<MobSpecialRules["bounty"]>>): MobRules {
  const base = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, 3);
  const s = base.special!;
  return {
    ...base,
    special: {
      ...s,
      chance: 1, // every spawn is a 特殊殭屍 — deterministic, one rng draw
      maxHp: 4000,
      bounty: { ...s.bounty!, xp: 0, ...bounty },
    },
  };
}

/** A combat world with one 特殊殭屍 and `heroes` champions in zone 0. */
function specialWorld(
  rules: MobRules,
  heroes = 2,
): { w: SimWorld; heroes: EntityId[]; mob: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatActive = true;
  beginCombatMobs(w, rules, [0]);
  const ids: EntityId[] = [];
  for (let i = 0; i < heroes; i++) {
    ids.push(
      spawnChampion(w, {
        championId: "thorne" as ChampionId,
        seatId: asSeatId(i),
        teamId: asTeamId(i),
        pos: { x: i * 2, z: 0 },
        zone: 0,
      }),
    );
  }
  const mob = spawnMob(w, 0, rules, 1, 0);
  expect(w.mob.get(mob)!.kind).toBe("special");
  return { w, heroes: ids, mob };
}

/** Queue one un-mitigated packet (`type: "true"` so the number is exact). */
function hit(w: SimWorld, src: EntityId, target: EntityId, amount: number): void {
  w.damageQueue.push({ source: src, target, amount, type: "true", crit: false, origin: "ability" });
}

/**
 * Finish `target` off with NO champion killer — the 「火圈燒死的」 case.
 *
 * The blow comes from ANOTHER MOB rather than from a hand-emitted `death`
 * event, because `SimWorld.step` clears `world.events` on entry: an event
 * emitted from a test is gone before `mobSystem` runs, and a guard written that
 * way would assert on a payout that never happened. Same technique
 * `MobSystem.test.ts` uses for 「a mob killed by a NON-champion pays nobody」.
 */
function killWithNoChampion(w: SimWorld, rules: MobRules, target: EntityId): void {
  const normalRules: MobRules = { ...rules, special: { ...rules.special!, chance: 0 } };
  const executioner = spawnMob(w, 0, normalRules, 7, 0);
  expect(w.mob.get(executioner)!.kind).toBe("normal");
  w.damageQueue.push({
    source: executioner,
    target,
    amount: 999_999,
    type: "true",
    crit: false,
    origin: "mob",
  });
  w.step(new Map());
  expect(w.mob.has(target), "目標沒有死,這條守衛就沒有測到東西").toBe(false);
}

interface ShareRow {
  id: number;
  seatId: number;
  damage: number;
  gold: number;
  xp: number;
  levels: number;
  lastHit: boolean;
}

function settlement(w: SimWorld): Record<string, unknown> {
  const ev = w.events.find((e) => e.type === "mobBossSlain");
  expect(ev, "特殊殭屍死了卻沒有發出分紅結算事件 —— 失敗形態②").toBeDefined();
  return ev!.data;
}

const sharesOf = (data: Record<string, unknown>): ShareRow[] => data["shares"] as ShareRow[];

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. 兩個人打特殊殭屍 → 各自照傷害比例拿到金錢與等級
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("特殊殭屍分紅 —— 兩個人打,照傷害比例各拿各的", () => {
  it("★ 3:1 的傷害 → 3750/1250 金,3/2 級;讀的是錢包與事件,不是帳本", () => {
    cover("mob-special-bounty");
    const rules = specialRules();
    const { w, heroes, mob } = specialWorld(rules);
    const [a, b] = heroes as [EntityId, EntityId];
    const goldA0 = w.champion.get(a)!.gold;
    const goldB0 = w.champion.get(b)!.gold;
    const lvA0 = w.champion.get(a)!.level;
    const lvB0 = w.champion.get(b)!.level;

    // A 打 3000(不致死),B 補最後的 1000 —— 補刀的人是**傷害少的那個**,
    // 這樣「照比例」和「補刀通吃」會落在完全不同的數字上。
    hit(w, a, mob, 3000);
    w.step(new Map());
    expect(w.health.get(mob)!.alive).toBe(true);
    hit(w, b, mob, 1000);
    w.step(new Map());

    // ── 錢包 ──────────────────────────────────────────────────────────────
    // 5,000 的 3/4 與 1/4。平分會是 2500/2500,補刀通吃會是 0/5000。
    expect(w.champion.get(a)!.gold - goldA0).toBe(3750);
    expect(w.champion.get(b)!.gold - goldB0).toBe(1250);
    // 等級:5 級照 3:1 分是 3 + 1,餘數 1 給補刀的 B ⇒ 3 / 2。
    // 「餘數丟掉」的實作會是 3 / 1,總共只發 4 級。
    expect(w.champion.get(a)!.level - lvA0).toBe(3);
    expect(w.champion.get(b)!.level - lvB0).toBe(2);

    // ── 事件(玩家真正看得到的結算)───────────────────────────────────────
    const data = settlement(w);
    expect(data["kind"]).toBe("special");
    const rows = sharesOf(data);
    expect(rows).toHaveLength(2);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(a as unknown as number)!.damage).toBe(3000);
    expect(byId.get(b as unknown as number)!.damage).toBe(1000);
    expect(byId.get(a as unknown as number)!.gold).toBe(3750);
    expect(byId.get(b as unknown as number)!.gold).toBe(1250);
    expect(byId.get(a as unknown as number)!.lastHit).toBe(false);
    expect(byId.get(b as unknown as number)!.lastHit).toBe(true);
    // GRANTED levels, not requested — the panel must not promise a level the
    // champion never got.
    expect(byId.get(a as unknown as number)!.levels).toBe(3);
    expect(byId.get(b as unknown as number)!.levels).toBe(2);
    expect(data["totalGold"]).toBe(5000);
    expect(data["totalLevels"]).toBe(5);
    // The event names the arena, so a client can gate the panel to the duel that
    // actually fought it. -1 here means every player in the match sees it.
    expect(data["zone"]).toBe(0);
  });

  it("★ 不是補刀的人也拿得到 —— 沒參與分紅的實作在這裡就死了", () => {
    cover("mob-special-bounty");
    // MUTANT-KILLER: the pre-#288 behaviour is 「rewardMult 全給補刀的人」, and
    // it passes any test that only checks the killer's wallet. A's payout is the
    // whole point of the owner's instruction.
    const rules = specialRules();
    const { w, heroes, mob } = specialWorld(rules);
    const [a, b] = heroes as [EntityId, EntityId];
    hit(w, a, mob, 3000);
    w.step(new Map());
    hit(w, b, mob, 1000);
    w.step(new Map());
    expect(w.champion.get(a)!.gold).toBeGreaterThan(0);
    expect(w.champion.get(a)!.level).toBeGreaterThan(1);
  });

  it("經驗也照同一套比例分(獎池的第三種貨幣不是裝飾)", () => {
    cover("mob-special-bounty");
    const rules = specialRules({ xp: 400, levels: 0 });
    const { w, heroes, mob } = specialWorld(rules);
    const [a, b] = heroes as [EntityId, EntityId];
    hit(w, a, mob, 3000);
    w.step(new Map());
    hit(w, b, mob, 1000);
    w.step(new Map());
    const rows = sharesOf(settlement(w));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(a as unknown as number)!.xp).toBe(300);
    expect(byId.get(b as unknown as number)!.xp).toBe(100);
    expect(settlement(w)["totalXp"]).toBe(400);
  });

  it("★ 只填了獎金、其他格全空 → 每一個預設都要是說好的那個", () => {
    cover("mob-special-bounty");
    // MUTATION SURVIVOR FIX. The first version of this suite only ever asserted
    // on the SHIPPED block, which authors all seven fields explicitly — so every
    // `?? default` in `mobRulesFromConfig` was dead code as far as the tests
    // were concerned (changing 「最後一刀倍率 ?? 1」 to `?? 2` passed the whole
    // file). This is the state an operator actually lands in: they type 「獎金
    // 8000」 into the console and leave the rest blank.
    const cfg = {
      ...DEFAULT_MOB_WAVES_CONFIG,
      special: {
        chancePercent: DEFAULT_MOB_WAVES_CONFIG.special!.chancePercent,
        hpMult: DEFAULT_MOB_WAVES_CONFIG.special!.hpMult,
        damageMult: DEFAULT_MOB_WAVES_CONFIG.special!.damageMult,
        moveSpeedMult: DEFAULT_MOB_WAVES_CONFIG.special!.moveSpeedMult,
        radiusMult: DEFAULT_MOB_WAVES_CONFIG.special!.radiusMult,
        rewardMult: DEFAULT_MOB_WAVES_CONFIG.special!.rewardMult,
        bountyGold: 8000, // …and NOTHING else authored
      },
    };
    const b = mobBountyRules(mobRulesFromConfig(cfg, DT, 3), "special")!;
    expect(b.gold).toBe(8000);
    expect(b.xp).toBe(0); // an un-named currency pays 0, not the shipped 200
    expect(b.levels).toBe(0);
    expect(b.lastHitMultiplier).toBe(1); // NOT the king's 2
    expect(b.lastHitMode).toBe("bonus");
    expect(b.splitByDamage).toBe(true); // owner's instruction is the default
    expect(b.countOverkill).toBe(false); // owner 2026-07-29 「不算」
  });

  it("三個獎池數字全空 → 完全沒有獎池(而不是一個全 0 的獎池)", () => {
    cover("mob-special-bounty");
    // The difference matters: a 0-pool would still keep a damage ledger and
    // still suppress `rewardMult`, i.e. the special would pay NOTHING.
    const s = DEFAULT_MOB_WAVES_CONFIG.special!;
    const cfg = {
      ...DEFAULT_MOB_WAVES_CONFIG,
      special: {
        chancePercent: s.chancePercent,
        hpMult: s.hpMult,
        damageMult: s.damageMult,
        moveSpeedMult: s.moveSpeedMult,
        radiusMult: s.radiusMult,
        rewardMult: s.rewardMult,
        // …but `splitByDamage` authored, to prove it is the THREE POOL NUMBERS
        // that switch the block on and not just 「有任何欄位」.
        splitByDamage: true,
      },
    };
    const rules = mobRulesFromConfig(cfg, DT, 3);
    expect(rules.special!.bounty).toBeNull();
    expect(mobBountyRules(rules, "special")).toBeNull();
    expect(mobLedgerRule(rules, "special")).toBeNull();
  });

  it("★ 出貨設定就是 owner 的 5,000 金 / +5 級 —— 測的是出貨的東西(失敗形態⑤)", () => {
    cover("mob-special-bounty");
    const shipped = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, 3);
    const bounty = mobBountyRules(shipped, "special");
    expect(bounty, "出貨的競技場沒有授權特殊殭屍分紅").not.toBeNull();
    expect(bounty!.gold).toBe(5000);
    expect(bounty!.levels).toBe(5);
    expect(bounty!.splitByDamage).toBe(true);
    // 1, NOT the king's 2 — owner only asked for 照傷害比例分 on the special.
    expect(bounty!.lastHitMultiplier).toBe(1);
    expect(bounty!.countOverkill).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. splitByDamage: false → 全額給 killer
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("splitByDamage 這個旋鈕是活的", () => {
  it("★ 關掉 → 整包 5,000 金 + 5 級全給補刀的人,打最多的那個一毛都沒有", () => {
    cover("mob-special-bounty");
    const rules = specialRules({ splitByDamage: false });
    const { w, heroes, mob } = specialWorld(rules);
    const [a, b] = heroes as [EntityId, EntityId];
    const goldA0 = w.champion.get(a)!.gold;
    const lvA0 = w.champion.get(a)!.level;

    hit(w, a, mob, 3000); // A 打了 75% 的傷害
    w.step(new Map());
    hit(w, b, mob, 1000); // B 補刀
    w.step(new Map());

    expect(w.champion.get(b)!.gold).toBe(5000);
    expect(w.champion.get(b)!.level - 1).toBe(5);
    // …而 A 什麼都沒有。開著的時候他拿 3750,所以這條在兩種實作下數字不同。
    expect(w.champion.get(a)!.gold - goldA0).toBe(0);
    expect(w.champion.get(a)!.level - lvA0).toBe(0);

    const rows = sharesOf(settlement(w));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(b as unknown as number);
    expect(rows[0]!.lastHit).toBe(true);
  });

  it("關掉又沒人補刀(火圈燒死的)→ 沒有人領,獎金不會憑空落到某個人頭上", () => {
    cover("mob-special-bounty");
    const rules = specialRules({ splitByDamage: false });
    const { w, heroes, mob } = specialWorld(rules);
    const [a] = heroes as [EntityId];
    const goldA0 = w.champion.get(a)!.gold;
    hit(w, a, mob, 3000);
    w.step(new Map());
    killWithNoChampion(w, rules, mob);
    expect(w.champion.get(a)!.gold - goldA0).toBe(0);
    // …and the settlement says so rather than silently paying nobody in secret.
    expect(sharesOf(settlement(w))).toHaveLength(0);
    expect(settlement(w)["totalGold"]).toBe(0);
  });

  it("開著又沒人補刀 → 打過的人照樣照比例領(分紅不需要有人補刀)", () => {
    cover("mob-special-bounty");
    const rules = specialRules();
    const { w, heroes, mob } = specialWorld(rules);
    const [a, b] = heroes as [EntityId, EntityId];
    // 3:1,但總和 3,000 < 4,000 —— 牠不能死在這一擊上,否則就有補刀者了。
    hit(w, a, mob, 2250);
    hit(w, b, mob, 750);
    w.step(new Map());
    expect(w.health.get(mob)!.alive).toBe(true);
    killWithNoChampion(w, rules, mob);
    const rows = sharesOf(settlement(w));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !r.lastHit)).toBe(true);
    expect(settlement(w)["totalGold"]).toBe(5000);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. 一般殭屍不配置帳本 —— the O(n²) guard
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("一般殭屍不配置帳本(這條擋的是 O(n²) 退化)", () => {
  it("★ 打一般殭屍不開帳本,打特殊殭屍才開 —— 兩個方向都要成立", () => {
    cover("mob-special-ledger");
    const rules = specialRules();
    // 同一個世界裡:先生一隻一般的,再生一隻特殊的,兩隻都被英雄打。
    const normalRules: MobRules = { ...rules, special: { ...rules.special!, chance: 0 } };
    const w = new SimWorld(SKELETON_ARENA, 1);
    w.combatActive = true;
    beginCombatMobs(w, normalRules, [0]);
    const hero = spawnChampion(w, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: 0, z: 0 },
      zone: 0,
    });
    const normal = spawnMob(w, 0, normalRules, 1, 0);
    expect(w.mob.get(normal)!.kind).toBe("normal");

    hit(w, hero, normal, 1); // 不致死,這樣帳本(如果有)會活到斷言的時候
    w.step(new Map());
    // 如果閘放寬到 normal,第 9 回合場上 100 隻小怪就是 100 本帳。
    expect(w.bossDamage.size, "一般殭屍配了傷害帳本 —— O(n²) 退化").toBe(0);

    // ── 反方向:同樣一發傷害打在特殊殭屍上,帳本必須開起來 ──────────────
    w.mobRules = rules;
    const special = spawnMob(w, 0, rules, 1, 1);
    expect(w.mob.get(special)!.kind).toBe("special");
    hit(w, hero, special, 1);
    w.step(new Map());
    expect(w.bossDamage.has(special), "特殊殭屍沒有帳本 —— 分紅無從算起").toBe(true);
    expect(w.bossDamage.size).toBe(1);
  });

  it("★ 純函數版本:一般殭屍永遠沒有分紅,也永遠沒有帳本", () => {
    cover("mob-special-ledger");
    const rules = specialRules();
    expect(mobBountyRules(rules, "normal")).toBeNull();
    expect(mobLedgerRule(rules, "normal")).toBeNull();
    // …而另外兩種都有(否則上面那條可以靠「永遠回 null」通過)。
    expect(mobBountyRules(rules, "special")).not.toBeNull();
    expect(mobLedgerRule(rules, "special")).not.toBeNull();
    expect(mobBountyRules(rules, "boss")).not.toBeNull();
    expect(mobLedgerRule(rules, "boss")).not.toBeNull();
  });

  it("沒授權獎池的特殊殭屍也不開帳本(pre-#288 的競技場一切照舊)", () => {
    cover("mob-special-ledger");
    const rules = specialRules();
    const legacy: MobRules = { ...rules, special: { ...rules.special!, bounty: null } };
    expect(mobLedgerRule(legacy, "special")).toBeNull();
    const { w, heroes, mob } = specialWorld(legacy, 1);
    const [a] = heroes as [EntityId];
    const gold0 = w.champion.get(a)!.gold;
    hit(w, a, mob, 4000);
    w.step(new Map());
    expect(w.bossDamage.size).toBe(0);
    // 舊路徑:rewardGold(20) × rewardMult(3) = 60,直接給補刀的人,沒有分紅事件。
    expect(w.champion.get(a)!.gold - gold0).toBe(60);
    expect(w.events.find((e) => e.type === "mobBossSlain")).toBeUndefined();
  });

  it("★ 授權了獎池就不再付 rewardMult —— 獎池取代它,不疊加", () => {
    cover("mob-special-bounty");
    const rules = specialRules();
    const { w, heroes, mob } = specialWorld(rules, 1);
    const [a] = heroes as [EntityId];
    const gold0 = w.champion.get(a)!.gold;
    hit(w, a, mob, 4000);
    w.step(new Map());
    // 剛好 5,000 —— 疊加的實作會是 5,060。
    expect(w.champion.get(a)!.gold - gold0).toBe(5000);
  });

  it("★ destroy 的內層掃描只對英雄跑 —— 這是唯一會隨帳本數變貴的地方", () => {
    cover("mob-special-ledger");
    // 不量時間:換一本會**數自己被 delete 幾次**的帳本,直接斷言掃描有沒有發生。
    class CountingLedger extends Map<EntityId, number> {
      deletes = 0;
      override delete(k: EntityId): boolean {
        this.deletes++;
        return super.delete(k);
      }
    }
    const rules = specialRules();
    const { w, heroes, mob } = specialWorld(rules, 1);
    const [hero] = heroes as [EntityId];
    const ledger = new CountingLedger();
    ledger.set(hero, 123);
    w.bossDamage.set(mob, ledger);

    // 50 隻小怪(以及任何非英雄)死掉,內層一次都不該被掃到。
    const normalRules: MobRules = { ...rules, special: { ...rules.special!, chance: 0 } };
    for (let i = 0; i < 50; i++) w.destroy(spawnMob(w, 0, normalRules, 2, i));
    expect(ledger.deletes, "每隻小怪死亡都掃過所有帳本 —— 這就是 O(n²)").toBe(0);

    // 反方向:英雄死掉**必須**被清掉,否則回收的 entityId 會繼承別人的傷害。
    // 這一條同時擋住「wasChampion 寫在 champion.delete 之後」的寫法 —— 那樣它
    // 永遠是 false,清理就整個消失了。
    w.destroy(hero);
    expect(ledger.deletes).toBe(1);
    expect(ledger.has(hero)).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. 溢傷對 special 也封頂
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("溢傷不算 —— 對特殊殭屍一樣適用", () => {
  it("★ 一發 100 倍血量的大招,帳本只記到牠真的掉的血為止", () => {
    cover("mob-special-overkill");
    const rules = specialRules();
    const { w, heroes, mob } = specialWorld(rules, 2);
    const [a, b] = heroes as [EntityId, EntityId];
    const maxHp = w.health.get(mob)!.maxHp;
    expect(maxHp).toBe(4000);

    // B 先削 1,000;A 再灌一發 400,000。記 output 的話 A 佔 99.7%,
    // 記 hpLoss 的話 A 只佔 3,000/4,000 = 75%。
    hit(w, b, mob, 1000);
    w.step(new Map());
    hit(w, a, mob, maxHp * 100);
    w.step(new Map());

    const rows = sharesOf(settlement(w));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(a as unknown as number)!.damage).toBeLessThanOrEqual(maxHp);
    // 精確值,不只是「有封頂」:剩下的 3,000 血。
    expect(byId.get(a as unknown as number)!.damage).toBe(3000);
    expect(byId.get(b as unknown as number)!.damage).toBe(1000);
    // …所以錢還是 3:1,而不是 999:1。
    expect(w.champion.get(a)!.gold).toBe(3750);
    expect(w.champion.get(b)!.gold).toBe(1250);
  });

  it("★ special.countOverkill 打開就恢復舊行為(而且是 special 自己那格)", () => {
    cover("mob-special-overkill");
    const rules = specialRules({ countOverkill: true });
    const { w, heroes, mob } = specialWorld(rules, 2);
    const [a, b] = heroes as [EntityId, EntityId];
    const maxHp = w.health.get(mob)!.maxHp;

    hit(w, b, mob, 1000);
    w.step(new Map());
    hit(w, a, mob, maxHp * 100);
    w.step(new Map());

    const rows = sharesOf(settlement(w));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(a as unknown as number)!.damage).toBeGreaterThan(maxHp);
    // 溢傷全額計入 ⇒ A 幾乎通吃。
    expect(w.champion.get(a)!.gold).toBeGreaterThan(4900);
  });

  it("★ 關掉殭屍王整個區塊,特殊殭屍的溢傷規則照樣生效(兩格是分開的)", () => {
    cover("mob-special-overkill");
    // MUTANT-KILLER: 讀 `world.mobRules.boss.countOverkill` 的實作在這裡會拿到
    // undefined,於是「不算」變成靠 `=== true` 的巧合而不是靠 special 那格。
    // 把 special 的旗標打開、boss 整個拿掉 —— 只有讀對格子的實作會計入溢傷。
    const base = specialRules({ countOverkill: true });
    const rules: MobRules = { ...base, boss: null };
    const { w, heroes, mob } = specialWorld(rules, 1);
    const [a] = heroes as [EntityId];
    const maxHp = w.health.get(mob)!.maxHp;
    hit(w, a, mob, maxHp * 100);
    w.step(new Map());
    const rows = sharesOf(settlement(w));
    expect(rows[0]!.damage).toBeGreaterThan(maxHp);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. 殭屍王沒有被這次改動弄壞
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("殭屍王走同一支 payMobBounty,語意不變", () => {
  it("王的分紅一律照傷害比例,沒有可以關掉它的旋鈕", () => {
    cover("mob-special-bounty");
    const rules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, 3);
    const boss = mobBountyRules(rules, "boss")!;
    expect(boss.splitByDamage).toBe(true);
    expect(boss.gold).toBe(rules.boss!.bountyGold);
    expect(boss.levels).toBe(rules.boss!.bountyLevels);
    // 王的 2 與特殊殭屍的 1 是刻意不同的,而不是同一個常數被兩邊共用。
    expect(boss.lastHitMultiplier).toBe(2);
    expect(mobBountyRules(rules, "special")!.lastHitMultiplier).toBe(1);
  });

  it("沒有 boss 區塊的競技場,王不付獎池(而 special 照付)", () => {
    cover("mob-special-bounty");
    const rules: MobRules = { ...specialRules(), boss: null };
    expect(mobBountyRules(rules, "boss")).toBeNull();
    expect(mobBountyRules(rules, "special")).not.toBeNull();
  });
});

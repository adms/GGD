/**
 * 59-00 暴走 / 59-001 完全暴走 —— owner 2026-08-03 定稿的守衛。
 *
 * ════════════════════════════════════════════════════════════════════════════
 *              天生技(自動)                    EX(主動)
 *   門檻      HP ≤ 5%,100% 觸發              HP ≤ 15%,主動放
 *   攻速      解除上限到 10(靠自己頂)         直接設定為 10
 *   持續      10 秒                           10 秒
 *   次數      無限                            無限
 *   冷卻      120 秒                          120 秒
 *   暴走中(兩支相同):吸血 100% · 迴避 +50% · 冷卻時間 ×2
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 每一條都跑**真的 SimWorld**、載入**出貨的內容**、讀**最終**的 `sc.final`。
 *
 * 這不是排場。這一族功能有三個地方會安靜地失效,而三個都只有在讀最終值時才看
 * 得見(CLAUDE.md 失敗形態 ⑤「被測的不是出貨的那個」與 ⑦「掃屬性代替掃行為」):
 *
 *   1. 攻速 `override 10` 會被 `finalizeStat` 夾回 `4.0`,除非同一份 buff 也帶
 *      `capRaise 10`。斷言「buff 掛上了」對兩種寫法都會過;斷言
 *      `sc.final[as] === 10` 只對正確的那一種過。
 *   2. 吸血 `flat 1.0` 會被 `STAT_CLAMPS[lifesteal]` 的 `0.8` 夾掉,除非
 *      `config/stat-caps.json` 也有 `lifesteal.unlocked = 1.0` **而且** buff 帶
 *      `capRaise 1.0`。三個東西缺一個,玩家拿到的是 80% 而面板寫 100%。
 *   3. 迴避是 2026-07-30 才長出來的屬性;一條沒有接上傷害結算的屬性看起來跟
 *      接上了一模一樣(失敗形態 ②)。所以下面除了讀 `sc.final[evasion]`,還有
 *      一條真的打 300 下、數有多少下落空的行為守衛。
 *
 * ⚠️ 數字**刻意寫死在測試裡**,不是從文件讀回來的。從文件讀的斷言對「文件被改成
 * 0」也會過 —— 那正是這一族守衛存在的理由(同 laneA.innates.test.ts 的做法)。
 */
import { describe, expect, it, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { registerAll } from "../content/registries";
import { Arenas, Configs, Models, StatusEffects, VfxDefs } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { Stat } from "./stats/statTypes";
import { isBerserk } from "./berserk";
import { rollEvade } from "./combat/evasion";
import { castAbility, learnEx } from "./abilities/abilitySystem";
import { statCapsFromDoc } from "./statCaps";
import {
  BERSERK_COOLDOWN_MULT_BOUNDS,
  DEFAULT_BERSERK_RULES,
  berserkRulesFromDoc,
  normalizeBerserkRules,
} from "./abilities/berserkRules";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;
const NO_INTENTS = new Map<SeatId, IntentFrame>();

const EVA = "godie-e00r" as ChampionId;

/** 30 Hz:10 秒 = 300 tick,120 秒 = 3600 tick。絕對 tick,不是遞減計數器。 */
const TEN_SEC_TICKS = 300;
const CD_120_TICKS = 3600;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(result.store);
});

/**
 * 一個開著戰鬥的世界 + 一台初號機。
 *
 * ⚠️ `statCaps` 從**出貨的那份文件**讀,不是留在 `DEFAULT_STAT_CAPS`。整條吸血
 * 100% 的鍊子有一環就是那份文件的 `lifesteal.unlocked`,不接上去的話這裡量到的
 * 是預設表而不是玩家會拿到的表(失敗形態 ⑤)。
 */
function arena(seed = 4242): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  world.statCaps = statCapsFromDoc(Configs.tryGet("stat-caps"));
  const id = spawnChampion(world, {
    championId: EVA,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z },
    zone: 0,
  });
  return { world, id };
}

function step(world: SimWorld, ticks: number): void {
  for (let i = 0; i < ticks; i++) world.step(NO_INTENTS);
}

/** 把血打到 `pct`,再挨一發真傷讓 `onDamageTaken` 真的發射。 */
function hurtTo(world: SimWorld, id: EntityId, pct: number): void {
  const hp = world.health.get(id)!;
  hp.hp = hp.maxHp * pct;
  world.damageQueue.push({
    source: id,
    target: id,
    amount: 0.0001,
    type: "true",
    crit: false,
    origin: "test",
  });
  step(world, 2);
}

describe("59-00 暴走(天生技,自動)—— owner 2026-08-03 定稿", () => {
  it("HP 掉到 5% 的那一 tick 暴走真的開了,而且滿血挨打不會開", () => {
    const { world, id } = arena();

    // 滿血挨打 → 條件不成立。這條是「門檻真的在擋」的對照組:把 condition 拿掉,
    // 這裡就紅(否則下面那條對「永遠觸發」的實作也會過 —— 失敗形態 ④)。
    hurtTo(world, id, 1.0);
    expect(isBerserk(world, id), "滿血就暴走了 —— 5% 的門檻沒有在擋").toBe(false);

    // 5.01% —— 門檻**外緣**,只差 0.01 個百分點。這一格是「門檻真的是 0.05」的
    // 守衛:寫成 0.10 或 0.15 的話它會在這裡就開。
    hurtTo(world, id, 0.0501);
    expect(isBerserk(world, id), "5.01% 就暴走了 —— 門檻被寫寬了(0.10?0.15?)").toBe(false);

    // 5% —— owner 的字面門檻是「HP ≤ 5%」,必須開。
    //
    // ⚠️ 誠實地說清楚這一條**沒有**在守什麼:`<` 與 `<=` 的差別在這條路上量不到。
    // `onDamageTaken` 是在那一發傷害**扣完之後**才發射的,所以 hook 讀到的血量
    // 永遠嚴格小於觸發前的血量 —— 「正好等於 5%」在傷害路徑上是一個測度為零的
    // 事件。(第一版的註解宣稱這一格在分辨兩個運算子,而突變驗證證明它不是:
    //  把 `<=` 改回 `<`,這條照樣綠。CLAUDE.md 失敗形態 ④。)
    // 文件裡留 `<=` 是因為那是 owner 用字的忠實轉錄,不是因為這裡量得出來。
    hurtTo(world, id, 0.05);
    expect(isBerserk(world, id), "掉到 5% 沒有觸發").toBe(true);
  });

  it("暴走中:吸血 100%、迴避 +50%、攻速上限被解到 10(讀最終 stats)", () => {
    const { world, id } = arena();
    hurtTo(world, id, 0.04);
    expect(isBerserk(world, id)).toBe(true);

    const sc = world.stats.get(id)!;

    // ① 吸血 100%。⚠️ 沒有 `stat-caps.json` 的 lifesteal 那一列 + buff 的
    //    `capRaise 1.0`,這裡會是 **0.8**(STAT_CLAMPS 的上界)而且沒有任何
    //    錯誤訊息 —— 面板寫 100%,實際回 80%。
    expect(sc.final[Stat.Lifesteal], "吸血被夾掉了 —— stat-caps 的 lifesteal 那一列在嗎?")
      .toBeCloseTo(1.0, 6);

    // ② 迴避 +50%(初號機沒有任何常駐迴避,所以最終值就是這一格)。
    expect(sc.final[Stat.Evasion]).toBeCloseTo(0.5, 6);

    // ③ 攻速上限。天生技**只**抬天花板,不給數值(owner:「實際值靠自己頂」),
    //    所以要證明天花板真的被抬高,必須先把值推到 4.0 以上再看它有沒有被夾。
    //    只斷言「暴走後攻速變高」會對「capRaise 那一格被刪掉」也過(失敗形態 ③)。
    sc.sources.push({
      id: "test:as-stick",
      kind: "item",
      modifiers: [{ stat: Stat.AttackSpeed, op: "flat" as never, value: 8 }],
    });
    sc.dirty = true;
    step(world, 1);
    const unlocked = world.stats.get(id)!.final[Stat.AttackSpeed];
    expect(unlocked, "攻速被夾在 4.0 —— 天生技的 `as capRaise 10` 掉了?").toBeGreaterThan(4.0);
    expect(unlocked).toBeLessThanOrEqual(10);
  });

  it("迴避 +50% 真的讓普攻落空 —— 不是只有面板上多一個數字", () => {
    const { world, id } = arena(1234);
    const attacker = spawnChampion(world, {
      championId: EVA,
      seatId: asSeatId(1),
      teamId: asTeamId(1),
      pos: { x: Z0.center.x + 2, z: Z0.center.z },
      zone: 0,
    });

    // 對照組:還沒暴走 → 迴避 0 → `rollEvade` 的 ZERO GUARANTEE 一發都不閃,
    // **而且一次 rng 都不抽**。沒有這一段,下面那個比例對「這個世界本來就會
    // 亂閃」也會過(失敗形態 ④)。
    const rngBefore = world.rng.state;
    let calmDodges = 0;
    for (let i = 0; i < 300; i++) if (rollEvade(world, attacker, id)) calmDodges++;
    expect(calmDodges, "沒有暴走卻閃掉了普攻").toBe(0);
    expect(world.rng.state, "迴避 0 卻抽了亂數 —— ZERO GUARANTEE 破了").toBe(rngBefore);

    hurtTo(world, id, 0.04);
    expect(isBerserk(world, id)).toBe(true);

    // ⚠️ 跑的是 `BasicAttackSystem` / `ProjectileSystem` **真的呼叫的那一支**
    //    (sim/combat/evasion.ts),不是重寫一份機率。300 次、p = 0.5:
    //    三個標準差大約是 ±26,所以 [110, 190] 這個窗口在正確時幾乎不可能紅,
    //    而「迴避沒有接上」(0 次)與「迴避被當成 1.0」(300 次)都在窗口外。
    let madDodges = 0;
    for (let i = 0; i < 300; i++) if (rollEvade(world, attacker, id)) madDodges++;
    expect(madDodges, "暴走中的迴避沒有作用在普攻上").toBeGreaterThan(110);
    expect(madDodges, "迴避比 50% 高太多 —— 是不是變成必閃了?").toBeLessThan(190);
  });

  it("暴走 10 秒後全部退場(吸血/迴避/方向盤一起還回來)", () => {
    const { world, id } = arena();
    hurtTo(world, id, 0.04);
    expect(isBerserk(world, id)).toBe(true);

    // 10 秒 = 300 tick;`hurtTo` 已經走了 2 tick,再多跑幾 tick 讓 status 過期。
    step(world, TEN_SEC_TICKS);
    expect(isBerserk(world, id)).toBe(false);
    const sc = world.stats.get(id)!;
    expect(sc.final[Stat.Lifesteal]).toBeCloseTo(0, 6);
    expect(sc.final[Stat.Evasion]).toBeCloseTo(0, 6);
  });

  it("120 秒內不會再觸發第二次(冷卻真的是 120 而不是 45)", () => {
    const { world, id } = arena();
    hurtTo(world, id, 0.04);
    expect(isBerserk(world, id)).toBe(true);
    const firstTick = world.tick;

    // 暴走退場之後,一路把血壓在 4% 反覆挨打 —— 沒有內部冷卻的話**每一 tick**
    // 都會重新暴走一次(而且每次都把到期往後推 10 秒 = 永久暴走)。
    step(world, TEN_SEC_TICKS);
    expect(isBerserk(world, id)).toBe(false);

    // 冷卻剩最後 100 tick 之前:全部都必須被擋住。
    // (舊值 45 秒 = 1350 tick,所以只要 ICD 掉回 45,這個迴圈就會在 1350 附近轉紅。)
    while (world.tick - firstTick < CD_120_TICKS - 100) {
      hurtTo(world, id, 0.04);
      expect(
        isBerserk(world, id),
        `第 ${world.tick - firstTick} tick(< 120 秒)就再次暴走了 —— internalCooldown 掉了?`,
      ).toBe(false);
    }

    // 對照組:過了 120 秒,同一發傷害必須讓它再暴走一次(次數無限)。
    // 沒有這一條,上面的迴圈對「這支天生技整個壞掉、永遠不觸發」也會全綠。
    while (world.tick - firstTick < CD_120_TICKS + 5) step(world, 1);
    hurtTo(world, id, 0.04);
    expect(isBerserk(world, id), "120 秒之後沒有再暴走 —— 次數應該是無限的").toBe(true);
  });
});

describe("59-001 完全暴走(EX,主動)—— owner 2026-08-03 定稿", () => {
  /** 解鎖 EX 並回報它的實例。 */
  function withEx(seed = 909): { world: SimWorld; id: EntityId } {
    const w = arena(seed);
    expect(learnEx(w.world, w.id), "初號機沒有 EX 槽?").toBe(true);
    return w;
  }

  it("血還太多的時候按不下去,而且魔力與冷卻一格都不扣", () => {
    const { world, id } = withEx();
    const hp = world.health.get(id)!;
    const manaBefore = hp.mana;

    hp.hp = hp.maxHp * 0.5;
    expect(castAbility(world, id, "EX", { type: "self" })).toBe("hp-too-high");
    expect(hp.mana, "被門檻擋下來卻還是扣了魔力").toBe(manaBefore);
    expect(world.abilities.get(id)!.exSlot!.cooldownRemainingTicks, "被擋下來卻轉了冷卻").toBe(0);

    // 16% —— 門檻**外緣**。15% 才放得出來,所以這裡仍然要被擋。
    hp.hp = hp.maxHp * 0.16;
    expect(castAbility(world, id, "EX", { type: "self" })).toBe("hp-too-high");

    // 15% 整 —— owner 的字面門檻是「≤ 15%」,必須放得出來。
    hp.hp = hp.maxHp * 0.15;
    expect(castAbility(world, id, "EX", { type: "self" }), "正好 15% 放不出來").toBe("ok");
  });

  it("暴走中的【實際攻速】=== 10 —— 這一條專門抓上限夾取", () => {
    const { world, id } = withEx();
    const hp = world.health.get(id)!;
    hp.hp = hp.maxHp * 0.14;

    expect(castAbility(world, id, "EX", { type: "self" })).toBe("ok");
    // castTimeSec 0.4 = 12 tick,效果在 CastResolveSystem 才跑。多跑幾 tick。
    step(world, 16);

    expect(isBerserk(world, id), "EX 放完卻沒有進入暴走").toBe(true);
    const sc = world.stats.get(id)!;
    // ⚠️ THE 突變守衛。把 buff 裡的 `as capRaise 10` 拿掉(只留 override 10),
    // 這一行會讀到 **4.0** —— 因為 `finalizeStat` 用 `effectiveCap` 夾,而沒有
    // 解鎖來源時攻速的天花板就是一般上限 4.0。斷言「有沒有掛上 buff」抓不到。
    expect(sc.final[Stat.AttackSpeed], "攻速被夾回 4.0 —— `as capRaise 10` 掉了?")
      .toBeCloseTo(10, 6);
    // 兩支的暴走狀態相同 —— EX 也要有吸血 100% 與迴避 50%。
    expect(sc.final[Stat.Lifesteal]).toBeCloseTo(1.0, 6);
    expect(sc.final[Stat.Evasion]).toBeCloseTo(0.5, 6);
  });

  it("EX 冷卻是 120 秒(過了 env 倍率之後),而且暴走 10 秒後退場", () => {
    const { world, id } = withEx();
    const hp = world.health.get(id)!;
    hp.hp = hp.maxHp * 0.14;
    expect(castAbility(world, id, "EX", { type: "self" })).toBe("ok");

    // 120 秒 × combat-env 的 cooldown 倍率 ÷ dt。讀 env 而不是寫死 3600,是因為
    // 那個倍率是後台旋鈕;寫死會讓這條測試在 owner 調整它的那一天變成假警報。
    // 內容裡的 120 仍然是寫死比對的那一半。
    const expected = Math.round((120 * world.combatEnv.cooldown) / world.dt);
    expect(world.abilities.get(id)!.exSlot!.cooldownRemainingTicks).toBe(expected);

    step(world, 16 + TEN_SEC_TICKS);
    expect(isBerserk(world, id)).toBe(false);
  });
});

describe("暴走期間:冷卻時間 ×2", () => {
  /**
   * 同一支 Q、同一個世界、同一個等級,只差在有沒有暴走 —— 兩邊都量,再比。
   *
   * 只斷言「暴走中的冷卻 > 某個常數」的話,對「這一版把所有冷卻都調長了」也會過
   * (失敗形態 ④)。比值才是這個功能本身。
   */
  it("暴走中放的技能,冷卻正好是平時的 2 倍", () => {
    const base = arena(7);
    // W 升到 rank 1 —— `spawnChampion` 給的是 rank 0,不加點放不出來。
    // 選 W(59-02 高週波短刀)是因為它 `castType: "self"`,不用真的找一個目標。
    base.world.abilities.get(base.id)!.slots.W.rank = 1;
    base.world.health.get(base.id)!.mana = 9999;
    expect(castAbility(base.world, base.id, "W", { type: "self" })).toBe("ok");
    const calm = base.world.abilities.get(base.id)!.slots.W.cooldownRemainingTicks;
    expect(calm, "W 的冷卻是 0 —— 這條測試量不到東西").toBeGreaterThan(0);

    const mad = arena(7);
    mad.world.abilities.get(mad.id)!.slots.W.rank = 1;
    hurtTo(mad.world, mad.id, 0.04);
    expect(isBerserk(mad.world, mad.id)).toBe(true);
    mad.world.health.get(mad.id)!.mana = 9999;
    expect(castAbility(mad.world, mad.id, "W", { type: "self" })).toBe("ok");
    const rage = mad.world.abilities.get(mad.id)!.slots.W.cooldownRemainingTicks;

    // ⚠️ 突變守衛:把 `berserkCooldownFactor` 從 abilitySystem 的那一行拿掉,
    // 這裡會是 1 倍。
    expect(rage, "暴走中的冷卻沒有變成兩倍").toBe(calm * 2);
  });

  it("後台把 trigger 關掉,兩格就整個下線(而且看得出來)", () => {
    // 「關掉」是一個**真的**要能關掉的旋鈕:出事的時候 owner 要能在後台把它
    // 停掉,而不是等一次部署。這條同時是 `trigger` 不是死欄位的守衛。
    const w = arena(13);
    w.world.berserkRules = normalizeBerserkRules({ ...DEFAULT_BERSERK_RULES, trigger: "off" });
    expect(learnEx(w.world, w.id)).toBe(true);
    const hp = w.world.health.get(w.id)!;
    hp.hp = hp.maxHp * 0.9;
    // 閘沒了 → 滿血也放得出來。
    expect(castAbility(w.world, w.id, "EX", { type: "self" })).toBe("ok");
    // 冷卻倍率也沒了 → 暴走中的 W 和平時一樣長。
    step(w.world, 16);
    expect(isBerserk(w.world, w.id)).toBe(true);
    w.world.abilities.get(w.id)!.slots.W.rank = 1;
    w.world.health.get(w.id)!.mana = 9999;
    expect(castAbility(w.world, w.id, "W", { type: "self" })).toBe("ok");
    const def = Abilities.get(w.world.abilities.get(w.id)!.slots.W.abilityId);
    expect(w.world.abilities.get(w.id)!.slots.W.cooldownRemainingTicks).toBe(
      Math.round((def.cooldown[0]! * w.world.combatEnv.cooldown) / w.world.dt),
    );
  });

  it("沒有暴走的人完全不受影響(這個功能對其他英雄是 no-op)", () => {
    const w = arena(11);
    w.world.abilities.get(w.id)!.slots.W.rank = 1;
    w.world.health.get(w.id)!.mana = 9999;
    expect(castAbility(w.world, w.id, "W", { type: "self" })).toBe("ok");
    const cd = w.world.abilities.get(w.id)!.slots.W.cooldownRemainingTicks;
    const def = Abilities.get(w.world.abilities.get(w.id)!.slots.W.abilityId);
    expect(cd).toBe(Math.round((def.cooldown[0]! * w.world.combatEnv.cooldown) / w.world.dt));
  });
});

/**
 * 三格參數本身的守衛。
 *
 * ⚠️ 這一組跑的是**沒有文件時**的那條路 —— 而今天就是沒有文件:
 * `config.berserk@1` 還沒進 `schema/config.ts` 的聯集,所以 `world.berserkRules`
 * 永遠是 `DEFAULT_BERSERK_RULES`。這一段守的是「等文件接上來的那一天,壞掉的
 * 文件不會安靜地把功能拿走」。接線待辦見交接的 needsOthers。
 */
describe("暴走規則:缺文件 = 出貨預設,而且兩端都有界", () => {
  it("缺文件 / schema 不符 / 垃圾 → 出貨預設,不是空物件", () => {
    // 空物件的話 `castHpPct` 讀成 undefined,比較永遠 false,閘靜默消失。
    expect(berserkRulesFromDoc(undefined)).toEqual(DEFAULT_BERSERK_RULES);
    expect(berserkRulesFromDoc({ schema: "config.combat-env@1" })).toEqual(DEFAULT_BERSERK_RULES);
    expect(berserkRulesFromDoc({ schema: "config.berserk@1" })).toEqual(DEFAULT_BERSERK_RULES);
    expect(normalizeBerserkRules("not an object")).toEqual(DEFAULT_BERSERK_RULES);
  });

  it("出貨預設就是 owner 定稿的兩個數字", () => {
    expect(DEFAULT_BERSERK_RULES.castHpPct).toBe(0.15);
    expect(DEFAULT_BERSERK_RULES.cooldownMult).toBe(2);
  });

  it("超界的值被夾住而不是照收(打錯一個零不會變成另一條沒人講得出來的規則)", () => {
    // 15 而不是 0.15 —— 夾到 1.0(= 隨時放得出來),不是 15 倍血量。
    const typo = normalizeBerserkRules({ castHpPct: 15, cooldownMult: 2, trigger: "berserkGrantors" });
    expect(typo.castHpPct).toBe(1);
    // 0 倍冷卻 = 每一支技能都沒有冷卻,而那看起來跟「關掉這個功能」一模一樣。
    const zero = normalizeBerserkRules({ castHpPct: 0.15, cooldownMult: 0, trigger: "berserkGrantors" });
    expect(zero.cooldownMult).toBe(BERSERK_COOLDOWN_MULT_BOUNDS[0]);
    const huge = normalizeBerserkRules({ castHpPct: 0.15, cooldownMult: 9999, trigger: "berserkGrantors" });
    expect(huge.cooldownMult).toBe(BERSERK_COOLDOWN_MULT_BOUNDS[1]);
    // 認不得的 trigger 退回出貨預設,不是 undefined(undefined 會讓比較永遠不成立)。
    expect(normalizeBerserkRules({ trigger: "banana" }).trigger).toBe("berserkGrantors");
  });
});

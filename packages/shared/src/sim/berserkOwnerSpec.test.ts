/**
 * 59-00 暴走 / 59-001 完全暴走 —— owner 2026-08-12 重製規格的守衛。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ owner 2026-08-12 裁決（逐字）：
 *   「只要讓 EX **照技能說明**正常實作 被動或主動 即可」
 *
 * —— 舊行為：59-001 完全暴走是**主動 EX**（按鍵 → `castHpPct` 閘 → 放得出來）；
 *    新規格：59-001 是 `[被動]`，和 59-00 一樣掛在 `onDamageTaken` 上，
 *    **條件達成自動觸發**。所以這一份改的是「**怎麼進入暴走**」，
 *    ⛔ 不是暴走本身 —— 吸血 / 迴避 / 攻速天花板 / 冷卻 ×2 / 後台可關，
 *    五個機制一條不少，只是換了入口與數字。
 *
 * ── 新規格（`docs/英雄技能第一批重製-90支.md` 的 59-00 與 59-001）─────────
 *
 *              59-00 天生技(被動)              59-001 EX(被動)
 *   入口      挨打 + HP ≤ 5%                  挨打 + HP ≤ 20%（要先解鎖 EX）
 *   攻速      +100%（**不**解上限）            解上限到 10 且 +400%
 *   吸血      60%                             80%（文案寫 120%，見下方 ⚠️）
 *   迴避      +25%                            +50%
 *   持續      6 秒                            12 秒
 *   冷卻      150 秒（hook 的 internalCooldown）
 *   暴走中（兩支相同）：奪走方向盤 · 冷卻時間 ×2
 *
 * ⚠️ **文案 120% vs 出貨 0.8**：規格寫「[吸血]120%」，而產生器寫進文件的是
 *    `lifesteal flat 0.8`（= `config/stat-caps.json` 的 `lifesteal.base`）。
 *    這裡**不**替內容做決定 —— 下面驗的是「文件上那個值**原封不動**到達
 *    `sc.final`」，所以哪一天 owner 把它調成 1.0 + `capRaise`，這條照樣是對的，
 *    而任何一環把它夾掉就會紅。差額本身是內容問題，回報給 owner。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 每一條都跑**真的 SimWorld**、載入**出貨的內容**、讀**最終**的 `sc.final`。
 *
 * 這不是排場。這一族功能有三個地方會安靜地失效,而三個都只有在讀最終值時才看
 * 得見(CLAUDE.md 失敗形態 ⑤「被測的不是出貨的那個」與 ⑦「掃屬性代替掃行為」):
 *
 *   1. 攻速的天花板。`finalizeStat` 用 `effectiveCap` 夾,沒有 `capRaise` 的
 *      來源時上限就是 4.0。斷言「buff 掛上了」對兩種寫法都會過;把值**頂過
 *      4.0 再讀**只對帶著 `capRaise` 的那一種過。
 *   2. 吸血會被 `STAT_CLAMPS` / `config/stat-caps.json` 夾掉,而面板照樣寫文件上
 *      的數字 —— 壞掉跟正常長得一模一樣。
 *   3. 迴避是 2026-07-30 才長出來的屬性;一條沒有接上傷害結算的屬性看起來跟
 *      接上了一模一樣(失敗形態 ②)。所以下面除了讀 `sc.final[evasion]`,還有
 *      一條真的打 300 下、數有多少下落空的行為守衛。
 *
 * ⚠️ 數字**不再寫死在測試裡**（這是 2026-08-12 的第二個改動）。舊版檔頭主張
 * 「從文件讀的斷言對『文件被改成 0』也會過」——那個顧慮是對的,但解法錯了:
 * owner 已經在 07-31 / 08-03 / 08-12 三次改動同一組數字,寫死的那份就是
 * CLAUDE.md 第二守則點名的**第四個住處**,而且它紅的時候說的是「暴走壞了」。
 * 兩件事分開驗,兩個顧慮就都顧到了(同 `laneA.innates.test.ts` 的做法):
 *   ① {@link readBerserkSpec} 斷言文件上每一格都是**有意義的正數**(擋掉歸零);
 *   ② 行為斷言比對「世界裡的最終值 === 文件值」(擋掉沒接上 / 被夾掉)。
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
  berserkCastBlock,
  berserkRulesFromDoc,
  normalizeBerserkRules,
} from "./abilities/berserkRules";
import type { AbilityDef } from "./content/defs";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;
const NO_INTENTS = new Map<SeatId, IntentFrame>();

const EVA = "godie-e00r" as ChampionId;
/** 30 Hz —— 秒 → tick。到期一律絕對 tick,不是遞減計數器。 */
const HZ = 30;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(result.store);
});

/** 一支暴走技在**出貨文件**上長什麼樣 —— 全部從 registry 讀,一個字面值都不抄。 */
interface BerserkSpec {
  /** hook 的 `condition.value`:HP 比例門檻。 */
  hpPct: number;
  /** `applyBuff.duration`(秒)。 */
  duration: number;
  /** `HookDef.internalCooldown`(秒)。 */
  icd: number;
  /** 攻速 `pctAdd`(1.0 = +100%)。 */
  asPctAdd: number;
  /** 攻速 `capRaise` —— `null` = 這一支**不**解天花板(59-00 就是)。 */
  asCapRaise: number | null;
  lifesteal: number;
  evasion: number;
}

/**
 * 讀出貨的那一份 def(`Abilities.get` 回的是**模板展開之後**的,失敗形態 ⑤)。
 *
 * ⚠️ 這支函式自己就是**反向守衛**:把文件裡任何一格改成 0 / 刪掉,它在這裡就
 * 丟出來,而不是讓下面的行為斷言用一個 0 去比對一個 0 然後全綠。
 */
function readBerserkSpec(abilityId: string): BerserkSpec {
  const def = Abilities.get(abilityId as never);
  const hook = def.passive?.ranks[0]?.hooks?.[0];
  expect(hook, `${abilityId} 沒有 passive hook —— 這支技能整個下線了`).toBeDefined();
  // 新規格兩支都是 `[被動]`:入口是**挨打**,不是按鍵(owner 2026-08-12)。
  expect(hook!.on, `${abilityId} 的入口不是「受到傷害時」—— 被動觸發沒了`).toBe("onDamageTaken");

  const cond = hook!.condition;
  expect(cond, `${abilityId} 的 hook 沒有條件 —— 門檻整個不見了(每次挨打都暴走)`).toBeDefined();
  // `EffectCondition` 是聯集(`AllCondition` 沒有 `kind`),所以先窄化再讀。
  const leaf = cond as { kind?: string; stat?: string; mode?: string; value?: number };
  expect(leaf.kind, `${abilityId} 的門檻不是一條 stat 條件`).toBe("stat");
  expect(leaf.stat, `${abilityId} 的門檻不是看生命`).toBe("hp");
  expect(leaf.mode, `${abilityId} 的門檻不是比例 —— 絕對值的門檻跟血量上限一起漂`).toBe("percent");
  const hpPct = leaf.value!;

  const buff = hook!.effects.find((e) => e.kind === "applyBuff");
  expect(buff, `${abilityId} 的 hook 沒有 applyBuff —— 暴走的數值全沒了`).toBeDefined();
  const mods = (buff as { modifiers: { stat: string; op: string; value: number }[] }).modifiers;
  const pick = (stat: string, op: string): number | null => {
    const m = mods.find((x) => x.stat === stat && x.op === op);
    return m === undefined ? null : m.value;
  };
  const spec: BerserkSpec = {
    hpPct,
    duration: (buff as { duration?: number }).duration ?? 0,
    icd: hook!.internalCooldown ?? 0,
    asPctAdd: pick(Stat.AttackSpeed, "pctAdd") ?? 0,
    asCapRaise: pick(Stat.AttackSpeed, "capRaise"),
    lifesteal: pick(Stat.Lifesteal, "flat") ?? 0,
    evasion: pick(Stat.Evasion, "flat") ?? 0,
  };

  // 每一格都必須是有意義的正數。0 = 這一格等於沒有效果,而遊戲裡看不出來。
  for (const [k, v] of [
    ["hpPct", spec.hpPct],
    ["duration", spec.duration],
    ["icd", spec.icd],
    ["asPctAdd", spec.asPctAdd],
    ["lifesteal", spec.lifesteal],
    ["evasion", spec.evasion],
  ] as const) {
    expect(v, `${abilityId} 出貨文件上的 ${k} 是 0 —— 這一格等於沒有效果`).toBeGreaterThan(0);
  }
  return spec;
}

/** 59-00 天生技的出貨參數。`beforeAll` 之後才讀得到,所以是 lazy。 */
const innateSpec = (): BerserkSpec =>
  readBerserkSpec(Champions.get(EVA).passiveAbility! as unknown as string);
/** 59-001 EX 的出貨參數。 */
const exSpec = (): BerserkSpec => readBerserkSpec(Champions.get(EVA).exAbility! as unknown as string);

/**
 * 一個開著戰鬥的世界 + 一台初號機。
 *
 * ⚠️ `statCaps` 從**出貨的那份文件**讀,不是留在 `DEFAULT_STAT_CAPS`。攻速天花板
 * 與吸血天花板整條鍊子有一環就是那份文件,不接上去的話這裡量到的是預設表而不是
 * 玩家會拿到的表(失敗形態 ⑤)。
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

/**
 * 三項暴走屬性的**最終值**守衛 —— 吸血 / 迴避 / 攻速倍率 / 攻速天花板。
 *
 * ⭐ 天花板那一段是 THE 突變守衛:先塞一根 `+8 flat` 的棒子把值頂過一般上限
 * 4.0,再看它被夾在哪。只斷言「暴走後攻速變高」對「`capRaise` 那一格被刪掉」
 * 也會過(失敗形態 ③)。
 *
 * ⛔ `capUnlocked` 是**呼叫端寫死的**,⚠️ 刻意**不從文件推導**。
 *    第一版寫成「文件有 capRaise → 驗解鎖;沒有 → 驗被夾」,而突變驗證當場證明
 *    那是一條假守衛:把 59-001 的 `as capRaise 10` 從文件刪掉,測試**自己換到另一
 *    個分支**然後全綠 —— 一條可以被它所監視的東西關掉的守衛不是守衛。
 *    這一格記的是 owner 規格上的**設計方向**(59-001「[攻擊速度]提升至最上限 10」
 *    要解鎖 / 59-00「提升100%」不解鎖),不是數值,所以它不是第四個住處。
 */
function expectBerserkStats(
  world: SimWorld,
  id: EntityId,
  spec: BerserkSpec,
  asBase: number,
  capUnlocked: boolean,
): void {
  const sc = world.stats.get(id)!;
  // ① 吸血:文件值原封不動到達最終值。被 STAT_CLAMPS / stat-caps 夾掉就紅。
  expect(sc.final[Stat.Lifesteal], "吸血被夾掉了 —— stat-caps 的 lifesteal 那一列在嗎?")
    .toBeCloseTo(spec.lifesteal * world.combatEnv.lifesteal, 5);
  // ② 迴避(初號機沒有任何常駐迴避,所以最終值就是這一格)。
  expect(sc.final[Stat.Evasion], "迴避沒有接上").toBeCloseTo(spec.evasion, 5);
  // ③ 攻速倍率 —— owner 2026-08-12 的新規格:兩支都直接給倍率。
  expect(sc.final[Stat.AttackSpeed], "攻速倍率沒有生效").toBeCloseTo(
    asBase * (1 + spec.asPctAdd),
    3,
  );

  // ④ 天花板。
  const baseCap = world.statCaps.as?.base ?? 4;
  const unlockedCap = world.statCaps.as?.unlocked ?? 10;
  sc.sources.push({
    id: "test:as-stick",
    kind: "item",
    modifiers: [{ stat: Stat.AttackSpeed, op: "flat" as never, value: 8 }],
  });
  sc.dirty = true;
  step(world, 1);
  const pushed = world.stats.get(id)!.final[Stat.AttackSpeed];
  if (capUnlocked) {
    expect(spec.asCapRaise, "出貨文件上的 `as capRaise` 不見了 —— 攻速上限解不開了").not.toBeNull();
    expect(pushed, "攻速被夾在一般上限 —— `as capRaise` 那一格掉了?").toBeGreaterThan(baseCap);
    expect(pushed).toBeLessThanOrEqual(unlockedCap);
  } else {
    expect(spec.asCapRaise, "這一支不該解攻速上限,文件卻有 `as capRaise`").toBeNull();
    expect(pushed, "沒有 capRaise,攻速卻頂破了一般上限 —— 天花板閘漏了").toBeCloseTo(baseCap, 5);
  }
}

describe("59-00 暴走(天生技·被動·自動觸發)—— owner 2026-08-12 重製規格", () => {
  it("HP 掉到門檻的那一 tick 暴走真的開了,而且滿血挨打不會開", () => {
    const spec = innateSpec();
    const { world, id } = arena();

    // 滿血挨打 → 條件不成立。這條是「門檻真的在擋」的對照組:把 condition 拿掉,
    // 這裡就紅(否則下面那條對「永遠觸發」的實作也會過 —— 失敗形態 ④)。
    hurtTo(world, id, 1.0);
    expect(isBerserk(world, id), "滿血就暴走了 —— 門檻沒有在擋").toBe(false);

    // 門檻**外緣**,只差 0.01 個百分點。這一格是「門檻真的是文件上那個值」的
    // 守衛:被寫寬的話它會在這裡就開。
    hurtTo(world, id, spec.hpPct + 0.0001);
    expect(isBerserk(world, id), "還沒到門檻就暴走了 —— 門檻被寫寬了?").toBe(false);

    // 門檻上 —— owner 的字面門檻是「≤」,必須開。
    //
    // ⚠️ 誠實地說清楚這一條**沒有**在守什麼:`<` 與 `<=` 的差別在這條路上量不到。
    // `onDamageTaken` 是在那一發傷害**扣完之後**才發射的,所以 hook 讀到的血量
    // 永遠嚴格小於觸發前的血量 —— 「正好等於門檻」在傷害路徑上是一個測度為零的
    // 事件。文件裡留 `<=` 是因為那是 owner 用字的忠實轉錄,不是因為這裡量得出來。
    hurtTo(world, id, spec.hpPct);
    expect(isBerserk(world, id), "掉到門檻沒有觸發").toBe(true);
  });

  it("暴走中:吸血 / 迴避 / 攻速倍率全部到位,而且天生技**不**解攻速天花板", () => {
    const spec = innateSpec();
    const { world, id } = arena();
    const asBase = world.stats.get(id)!.final[Stat.AttackSpeed];
    hurtTo(world, id, spec.hpPct * 0.8);
    expect(isBerserk(world, id)).toBe(true);
    // ⚠️ 舊規格(owner 2026-08-03)是「天生技只抬天花板、不給倍率」,新規格
    // (2026-08-12「生命降至5%時必定[暴走],將[攻擊速度]提升100%」)是**反過來的**:
    // 給倍率、不抬天花板。`expectBerserkStats` 兩個方向都驗,所以哪一天 owner 又
    // 規格上 59-00 只寫「提升100%」,沒有一個字提到上限,所以 `capUnlocked: false`。
    expectBerserkStats(world, id, spec, asBase, false);
  });

  it("迴避真的讓普攻落空 —— 不是只有面板上多一個數字", () => {
    const spec = innateSpec();
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

    hurtTo(world, id, spec.hpPct * 0.8);
    expect(isBerserk(world, id)).toBe(true);

    // ⚠️ 跑的是 `BasicAttackSystem` / `ProjectileSystem` **真的呼叫的那一支**
    //    (sim/combat/evasion.ts),不是重寫一份機率。窗口從文件值推導(±4σ),
    //    所以 owner 調迴避的那一天它自己跟著移動;而「迴避沒有接上」(0 次)與
    //    「迴避被當成必閃」(300 次)兩端都在窗口外。
    const n = 300;
    const p = spec.evasion;
    const sd = Math.sqrt(n * p * (1 - p));
    let madDodges = 0;
    for (let i = 0; i < n; i++) if (rollEvade(world, attacker, id)) madDodges++;
    expect(madDodges, "暴走中的迴避沒有作用在普攻上").toBeGreaterThan(n * p - 4 * sd);
    expect(madDodges, "閃避率遠高於文件值 —— 是不是變成必閃了?").toBeLessThan(n * p + 4 * sd);
  });

  it("持續時間到就全部退場(吸血/迴避/方向盤一起還回來)", () => {
    const spec = innateSpec();
    const { world, id } = arena();
    hurtTo(world, id, spec.hpPct * 0.8);
    expect(isBerserk(world, id)).toBe(true);

    // 撐過一格是為了證明它**不是**一 tick 就掉的(下面那條才有意義)。
    step(world, Math.round(spec.duration * HZ) - 4);
    expect(isBerserk(world, id), "還沒到期就退場了 —— duration 沒有生效?").toBe(true);
    step(world, 8);
    expect(isBerserk(world, id), "到期了卻沒有退場").toBe(false);
    const sc = world.stats.get(id)!;
    expect(sc.final[Stat.Lifesteal]).toBeCloseTo(0, 6);
    expect(sc.final[Stat.Evasion]).toBeCloseTo(0, 6);
  });

  it("內部冷卻走完之前不會再觸發,走完之後次數無限", () => {
    const spec = innateSpec();
    const icdTicks = Math.round(spec.icd * HZ);
    const { world, id } = arena();
    hurtTo(world, id, spec.hpPct * 0.8);
    expect(isBerserk(world, id)).toBe(true);
    const firstTick = world.tick;

    // 暴走退場之後,一路把血壓在門檻下反覆挨打 —— 沒有內部冷卻的話**每一 tick**
    // 都會重新暴走一次(而且每次都把到期往後推 = 永久暴走)。
    step(world, Math.round(spec.duration * HZ));
    expect(isBerserk(world, id)).toBe(false);

    // 冷卻剩最後 100 tick 之前:全部都必須被擋住。
    while (world.tick - firstTick < icdTicks - 100) {
      hurtTo(world, id, spec.hpPct * 0.8);
      expect(
        isBerserk(world, id),
        `第 ${world.tick - firstTick} tick(冷卻還沒走完)就再次暴走了 —— internalCooldown 掉了?`,
      ).toBe(false);
    }

    // 對照組:過了冷卻,同一發傷害必須讓它再暴走一次(次數無限)。
    // 沒有這一條,上面的迴圈對「這支天生技整個壞掉、永遠不觸發」也會全綠。
    while (world.tick - firstTick < icdTicks + 5) step(world, 1);
    hurtTo(world, id, spec.hpPct * 0.8);
    expect(isBerserk(world, id), "冷卻走完卻沒有再暴走 —— 次數應該是無限的").toBe(true);
  });
});

/**
 * 59-001 完全暴走 —— **B-1 的主體**。
 *
 * owner 2026-08-12 裁決:「只要讓 EX **照技能說明**正常實作 被動或主動 即可」
 * —— 舊行為「按 EX 鍵 → `castHpPct` 閘 → 回 `ok`」,新規格「解鎖後,挨打且
 * HP ≤ 20% 自動觸發」。所以下面三條**驗的是同一件事的新樣子**:
 *   舊「血還太多按不下去」 → 新「血還太多**不會自動觸發**」;
 *   舊「按下去 → 暴走屬性到位」 → 新「條件達成 → 暴走屬性到位」;
 *   舊「EX 冷卻 120 秒」 → 新「hook 的 internalCooldown」(機制與天生技共用,
 *      已由上面那條承重的線驗過,這裡不重複跑 4,500 tick —— 第零守則②)。
 */
describe("59-001 完全暴走(EX·被動·自動觸發)—— owner 2026-08-12 裁決", () => {
  it("沒解鎖 EX → 到了 EX 的門檻也不會觸發;解鎖後同一發傷害就觸發", () => {
    const spec = exSpec();
    const { world, id } = arena(909);
    const probe = spec.hpPct * 0.9; // 低於 EX 門檻、遠高於天生技門檻

    // ⚠️ 這一條取代舊版的 `learnEx(...) === true` 斷言:入口從「按鍵」變成
    // 「解鎖 + 條件」之後,**解鎖**才是那個閘。不解鎖就觸發 = EX 白送。
    hurtTo(world, id, probe);
    expect(isBerserk(world, id), "EX 還沒解鎖就自動暴走了 —— rank 閘漏了").toBe(false);

    expect(learnEx(world, id), "初號機沒有 EX 槽?").toBe(true);
    hurtTo(world, id, probe);
    expect(isBerserk(world, id), "解鎖 EX 之後條件達成卻沒有自動觸發").toBe(true);
  });

  it("血還太多的時候不會自動觸發(EX 的門檻真的是文件上那個值)", () => {
    const spec = exSpec();
    const { world, id } = arena(909);
    expect(learnEx(world, id)).toBe(true);

    // ⭐ 探針**從出貨門檻推導**，⛔ 不是手抄一個數字。
    // ⚠️ 前科（owner 2026-08-22 把 EX 門檻 20% → 50%）：這裡原本寫死 `0.5`
    // 並註解「一半血 —— 離門檻很遠」，門檻一改成 50% 它就**剛好等於門檻**，
    // 於是這條守衛用「半血就暴走了」這個**錯誤的訊息**紅掉 ——
    // 真相只是出貨值被調過（第二守則：驗機制，⛔ 不要驗數字）。
    const tooHealthy = Math.min(1, spec.hpPct + (1 - spec.hpPct) / 2);
    hurtTo(world, id, tooHealthy);
    expect(
      isBerserk(world, id),
      `血還在 ${(tooHealthy * 100).toFixed(0)}%（門檻 ${(spec.hpPct * 100).toFixed(0)}%）就暴走了 —— EX 的門檻沒有在擋`,
    ).toBe(false);

    // 門檻**外緣**,只差 0.01 個百分點。門檻被寫寬的話它會在這裡就開。
    hurtTo(world, id, spec.hpPct + 0.0001);
    expect(isBerserk(world, id), "還沒到 EX 門檻就暴走了 —— 門檻被寫寬了?").toBe(false);

    // 門檻上 —— 必須開。
    hurtTo(world, id, spec.hpPct);
    expect(isBerserk(world, id), "到了 EX 門檻卻沒有自動觸發").toBe(true);
  });

  it("EX 的暴走:攻速天花板真的被解到 10,而且吸血/迴避/倍率全部到位", () => {
    const spec = exSpec();
    const { world, id } = arena(909);
    const asBase = world.stats.get(id)!.final[Stat.AttackSpeed];
    expect(learnEx(world, id)).toBe(true);
    hurtTo(world, id, spec.hpPct * 0.9);
    expect(isBerserk(world, id), "條件達成卻沒有進入暴走").toBe(true);

    // ⚠️ THE 突變守衛(整份檔最承重的一條):把文件裡的 `as capRaise 10` 拿掉,
    // `expectBerserkStats` 的天花板那一段會讀到 **4.0**(`finalizeStat` 的
    // `effectiveCap` —— 沒有解鎖來源時攻速的天花板就是一般上限)。
    // 斷言「有沒有掛上 buff」抓不到這個。⛔ `capUnlocked: true` 是規格上的設計方向
    // (「[攻擊速度]提升至最上限 10」),⚠️ 刻意不從文件推導 —— 見
    // `expectBerserkStats` 檔頭記的那一次失敗的突變驗證。
    expectBerserkStats(world, id, spec, asBase, true);
  });

  it("EX 的暴走持續得比天生技久,而且一樣會退場", () => {
    const spec = exSpec();
    const innate = innateSpec();
    // 兩支的持續時間**關係**是規格的一部分(6 秒 vs 12 秒),而具體數字不是。
    expect(spec.duration, "EX 的暴走沒有比天生技久 —— 兩支的差別被抹掉了").toBeGreaterThan(
      innate.duration,
    );

    const { world, id } = arena(909);
    expect(learnEx(world, id)).toBe(true);
    hurtTo(world, id, spec.hpPct * 0.9);
    expect(isBerserk(world, id)).toBe(true);
    // 天生技的持續時間走完時**還在**暴走 —— 證明吃到的是 EX 那一份 duration。
    step(world, Math.round(innate.duration * HZ) + 4);
    expect(isBerserk(world, id), "EX 的暴走在天生技的秒數就退場了 —— duration 吃錯了?").toBe(true);
    step(world, Math.round((spec.duration - innate.duration) * HZ) + 4);
    expect(isBerserk(world, id), "EX 的暴走到期了卻沒有退場").toBe(false);
  });
});

describe("暴走期間:冷卻時間 ×2", () => {
  /**
   * ⚠️ 2026-08-12:這一組原本拿 **W(59-02 高週波短刀)**當量尺,而新規格把 W
   * 改成 `[被動]` —— `castAbility` 回 `"passive"`,量尺本身消失了。改用
   * **R(59-04 野戰型陽電子砲)**:`castType: "ground"`,不需要真的找一個目標,
   * 而且有真的冷卻。驗的機制一格沒變。
   */
  function castR(world: SimWorld, id: EntityId): number {
    const ab = world.abilities.get(id)!;
    ab.slots.R.rank = 1;
    world.health.get(id)!.mana = 9999;
    const t = world.transform.get(id)!;
    expect(
      castAbility(world, id, "R", { type: "point", point: { x: t.pos.x + 3, z: t.pos.z } }),
      "R 放不出來 —— 這條測試量不到東西",
    ).toBe("ok");
    return ab.slots.R.cooldownRemainingTicks;
  }

  /**
   * 同一支 R、同一個世界、同一個等級,只差在有沒有暴走 —— 兩邊都量,再比。
   *
   * 只斷言「暴走中的冷卻 > 某個常數」的話,對「這一版把所有冷卻都調長了」也會過
   * (失敗形態 ④)。比值才是這個功能本身。
   */
  it("暴走中放的技能,冷卻正好是平時的 2 倍", () => {
    const spec = innateSpec();
    const base = arena(7);
    const calm = castR(base.world, base.id);
    expect(calm, "R 的冷卻是 0 —— 這條測試量不到東西").toBeGreaterThan(0);

    const mad = arena(7);
    hurtTo(mad.world, mad.id, spec.hpPct * 0.8);
    expect(isBerserk(mad.world, mad.id)).toBe(true);
    const rage = castR(mad.world, mad.id);

    // ⚠️ 突變守衛:把 `berserkCooldownFactor` 從 abilitySystem 的那一行拿掉,
    // 這裡會是 1 倍。倍率本身讀後台的出貨預設,不抄字面值。
    expect(rage, "暴走中的冷卻沒有變成兩倍").toBe(calm * DEFAULT_BERSERK_RULES.cooldownMult);
  });

  it("後台把 trigger 關掉,兩格就整個下線(而且看得出來)", () => {
    // 「關掉」是一個**真的**要能關掉的旋鈕:出事的時候 owner 要能在後台把它
    // 停掉,而不是等一次部署。這條同時是 `trigger` 不是死欄位的守衛。
    const spec = innateSpec();
    const w = arena(13);
    w.world.berserkRules = normalizeBerserkRules({ ...DEFAULT_BERSERK_RULES, trigger: "off" });

    // ① 冷卻倍率下線 → 暴走中的 R 和平時一樣長。
    hurtTo(w.world, w.id, spec.hpPct * 0.8);
    expect(isBerserk(w.world, w.id)).toBe(true);
    const cd = castR(w.world, w.id);
    const def = Abilities.get(w.world.abilities.get(w.id)!.slots.R.abilityId);
    expect(cd, "trigger=off 之後冷卻還是被加倍了").toBe(
      Math.round((def.cooldown[0]! * w.world.combatEnv.cooldown) / w.world.dt),
    );

    // ② 施法閘下線。
    //
    // ⚠️ 2026-08-12 誠實聲明:owner 把 59-001 改成 `[被動]` 之後,**出貨內容裡
    //    已經沒有任何「施放時把自己變成暴走」的主動技**,所以 `grantsBerserk`
    //    (讀 `def.effects`)對每一支出貨的技能都是 false ——`castHpPct` 這一格
    //    目前是**休眠**的。這裡改用一份合成的 def 直接驗閘本身,理由寫死在這:
    //    閘還在程式裡、還會對下一支暴走系**主動**技生效,而一條被拔掉的守衛
    //    不會在它復活的那天提醒任何人。(這一段是 CLAUDE.md 失敗形態 ⑤ 的
    //    自覺違反 —— 被測的不是出貨的那個,因為出貨的那個不存在了。)
    const grantor = {
      castType: "self",
      effects: [{ kind: "applyStatus", statusId: "berserk", berserk: true, applyTo: "self" }],
    } as unknown as AbilityDef;
    const full = arena(14);
    const hp = full.world.health.get(full.id)!;
    hp.hp = hp.maxHp;
    expect(berserkCastBlock(full.world, grantor, full.id), "滿血的暴走主動技沒有被擋").toBe(
      "hp-too-high",
    );
    hp.hp = hp.maxHp * DEFAULT_BERSERK_RULES.castHpPct;
    expect(berserkCastBlock(full.world, grantor, full.id), "血夠低卻放不出來").toBe(null);
    full.world.berserkRules = normalizeBerserkRules({ ...DEFAULT_BERSERK_RULES, trigger: "off" });
    hp.hp = hp.maxHp;
    expect(berserkCastBlock(full.world, grantor, full.id), "trigger=off 之後閘還在擋").toBe(null);
  });

  it("沒有暴走的人完全不受影響(這個功能對其他英雄是 no-op)", () => {
    const w = arena(11);
    const cd = castR(w.world, w.id);
    const def = Abilities.get(w.world.abilities.get(w.id)!.slots.R.abilityId);
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

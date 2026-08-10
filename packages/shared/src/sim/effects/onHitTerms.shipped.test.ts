/**
 * [On-Hit] 家族 —— 五支傳說武器的**算式**,在出貨的文件上、走出貨的裝備路徑。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 這一批被誤診過,而誤診本身是這個檔要防的東西
 *
 * 進度表對這五行寫的是「[On-Hit] 未實作」,而那句話**在觸發器那一層是錯的**:
 * `zHookEvent` 早就有 `"onBasicAttack"`,`systems/BasicAttackSystem.ts`(近戰)
 * 與 `systems/ProjectileSystem.ts`(遠程命中)兩條路都會 `fireHooks`,
 * `combat/evasion.ts` 也已經處理了「被閃掉的一下不觸發」。真正缺的是**每一行
 * 各自的計算項**。所以這個檔的每一條斷言都讀一個**數字**,不是「hook 存不存在」。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 四層,每一層擋一種「做了但玩家拿不到」
 *
 *  §0 文件真的帶著那些值(而且 owner 的文案還是那一句)—— 失敗形態 ⑤
 *  §1 出貨的裝備路徑把它送進 sim(`itemModifierSource`)—— 失敗形態 ②
 *  §2 每一支的**算式**在真的世界裡算出真的數字 —— 失敗形態 ④/⑦
 *  §3 schema 的上界真的擋得住打錯的數字
 *
 * ⚠️ §2 一律**讀最終物件**:血條、魔條、`world.damageQueue` 排空之後的 hp,
 * 從來不讀效果定義自己。`refund` 那一條尤其 —— 它整個機制的重點就是「效果端
 * 算出來的數字和玩家看到的不一樣」,所以斷言必須在減免之後取。
 *
 * ⚠️ 這個檔**直接讀 `content/items/*.json`**(同 `combat/block.shipped.test.ts`),
 * 不 boot ContentLoader —— 除了 §2C(朗基努斯之槍)需要真的英雄三圍,那一段才
 * 用 registry。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { zeroStats, Stat } from "../stats/statTypes";
import { attachSource, recomputeStats } from "../stats/statPipeline";
import { itemModifierSource, attachItemSource } from "../economy/itemSource";
import { fireHooks } from "./hooks";
import { zItemDoc } from "../../content/schema/item";
import { zEffectDef, zHookDef } from "../../content/schema/effect";
import { ContentStore } from "../../content/store";
import { registerAll, Arenas, Configs, Models, StatusEffects, VfxDefs } from "../../content/registries";
import { zChampionDoc } from "../../content/schema/champion";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { liveAttribute } from "../stats/attrSources";
import { normalizeCombatEnv, type CombatEnvMultipliers } from "../combatEnv";
import type { ItemDef } from "../content/defs";
import {
  asSeatId,
  asTeamId,
  type ChampionId,
  type EntityId,
  type ItemId,
  type SeatId,
} from "../../ids";
import type { IntentFrame } from "../intents";

const TAG = "onhit-terms";
const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../../content");
const ITEMS_DIR = join(CONTENT_DIR, "items");
const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;

const KUNAKI = "godie-i007" as ItemId; // 虛哭神去
const SERAPH = "godie-i012" as ItemId; // 熾天使之弓
const LONGINUS = "godie-i018" as ItemId; // 朗基努斯之槍
const MANA_ROD = "godie-i020" as ItemId; // 瑪那魔杖
const FLAME_BOW = "godie-i06i" as ItemId; // 炎神弩

function doc(itemId: string): ItemDef & { description: string } {
  return JSON.parse(readFileSync(join(ITEMS_DIR, `${itemId}.json`), "utf8"));
}

// ═══════════════════════════════════════════════════════════════════════════
// §0 — 文件真的帶著那些值,而且 owner 的文案還是那一句
// ═══════════════════════════════════════════════════════════════════════════
/**
 * 每一支引一句 owner 的 `description` 原文,再對照它應該長出來的資料。
 * 引文會被拿去跟真的文件比對(第三守則),所以這張表不可能在文案被改掉之後
 * 還默默地「通過」。
 */
const SHIPPED: { id: ItemId; name: string; line: string }[] = [
  {
    id: KUNAKI,
    name: "虛哭神去",
    line: "[普通攻擊時] 每次攻擊造成造成額外 [自身已損失的生命百分比數值(0~100)]",
  },
  {
    id: SERAPH,
    name: "熾天使之弓",
    line: "[普通攻擊時] 每次削去敵方英雄現存 MP 3%，並附帶燃燒效果每秒燃燒3%最大生命，持續2秒",
  },
  {
    id: LONGINUS,
    name: "朗基努斯之槍",
    line: "[普通攻擊時] (總敏捷)% 機率性造成等同 (總力量) 之閃電傷害",
  },
  {
    id: MANA_ROD,
    name: "瑪那魔杖",
    line: "[普通攻擊時] 普攻附加敵方現存 MP 5%傷害，並且回復己方 MP 該傷害量",
  },
  {
    id: FLAME_BOW,
    name: "炎神弩",
    line: "[普通攻擊時] 攻擊額外造成 10-1000 傷害，敵我距離越遠傷害越高 (0~10)",
  },
];

describe("§0 五支 [On-Hit] 的出貨文件", () => {
  for (const s of SHIPPED) {
    it(`${s.name} ${s.id} — 文案還是那一句,而且 passive 掛在 onBasicAttack 上`, () => {
      cover(`${TAG}/doc/${s.id}`);
      const d = doc(s.id);
      expect(d.description).toContain(s.line);
      // 觸發器**存在**(見檔頭)。這一條斷言的是「這份文件真的用了它」——
      // 掛在 onKill / onDamageTaken 上會是一件完全不同的武器。
      expect(d.passive?.length).toBeGreaterThan(0);
      expect(d.passive!.every((h) => h.on === "onBasicAttack")).toBe(true);
      // …而且出貨的位元組真的通得過 authoring schema(含所有上界與 refine)。
      expect(() => zItemDoc.parse(JSON.parse(readFileSync(join(ITEMS_DIR, `${s.id}.json`), "utf8")))).not.toThrow();
    });
  }

  it("虛哭神去 用的是 points 讀法,不是 ratio —— 兩種差三個數量級", () => {
    cover(`${TAG}/doc/kunaki-points`);
    const e = doc(KUNAKI).passive![0]!.effects[0]!;
    expect(e.kind).toBe("damage");
    const term = (e as Extract<typeof e, { kind: "damage" }>).resourcePct!;
    // 文案:「已損失的生命百分比**數值**(0~100)」= 掉 60% 血打 60 點。
    // 少了 scale:"points" 這一格,同一份資料會變成「已損生命的 100%」。
    expect(term).toEqual({
      subject: "self",
      resource: "health",
      basis: "missing",
      scale: "points",
      perRank: [1],
    });
  });

  it("熾天使之弓 的削魔限定英雄(victim 是欄位,不是寫死的判斷)", () => {
    cover(`${TAG}/doc/seraph-victim`);
    expect(doc(SERAPH).passive![0]!.victim).toBe("champion");
  });

  it("炎神弩 的三個距離數字一一對應文案的 10 / 1000 / (0~10)", () => {
    cover(`${TAG}/doc/flamebow-numbers`);
    const e = doc(FLAME_BOW).passive![0]!.effects[0]!;
    const term = (e as Extract<typeof e, { kind: "damage" }>).distanceScale!;
    expect(term).toEqual({ atRange: 10, near: 10, far: 1000 });
  });

  it("瑪那魔杖 折返的是「實際失血」而不是「打算打多少」", () => {
    cover(`${TAG}/doc/manarod-basis`);
    const e = doc(MANA_ROD).passive![0]!.effects[0]!;
    expect((e as Extract<typeof e, { kind: "damage" }>).refund).toEqual({
      resource: "mana",
      basis: "hpLost",
      pct: 1,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §1 — 出貨的裝備路徑把 passive 送進 sim
// ═══════════════════════════════════════════════════════════════════════════
describe("§1 itemModifierSource 把 passive 轉成 ModifierSource.hooks", () => {
  for (const s of SHIPPED) {
    it(`${s.name} — hooks 真的到得了 fireHooks`, () => {
      cover(`${TAG}/source/${s.id}`);
      const world = new SimWorld(SKELETON_ARENA, 1);
      const holder = world.spawn();
      const src = itemModifierSource(world, holder, s.id, 0, doc(s.id));
      // `hooks: def.passive` 那一行是**全部**的接線。刪掉它,這五件武器照樣
      // 上架、照樣顯示效能文案、什麼都不做(失敗形態 ②)。
      expect(src.hooks).toEqual(doc(s.id).passive);
      expect(src.hooks!.length).toBeGreaterThan(0);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// §2 — 算式,在真的世界裡
// ═══════════════════════════════════════════════════════════════════════════
interface Rig {
  world: SimWorld;
  attacker: EntityId;
  victim: EntityId;
}

/**
 * 兩個裸身體(沒有 ChampionComp),攻擊者戴著 `itemId`。
 *
 * 沒有 ChampionComp 是刻意的:§2A/§2B/§2D/§2E 的算式跟三圍完全無關,而一個
 * 真的英雄會把等級成長、combat-env 係數與基礎加成全部混進斷言,讓「這個數字
 * 為什麼是這個數字」變得不可讀。需要三圍的 §2C 另外用真的英雄。
 */
function rig(
  itemId: ItemId,
  opts: {
    attackerHp?: number;
    attackerMaxHp?: number;
    attackerMana?: number;
    victimMana?: number;
    victimMaxMana?: number;
    victimMaxHp?: number;
    gap?: number;
    victimMr?: number;
    seed?: number;
  } = {},
): Rig {
  const world = new SimWorld(SKELETON_ARENA, opts.seed ?? 4242);
  // 全域傷害倍率固定成 1,讓每一條斷言的算術可讀。§2D 另外測倍率不會把
  // 折返算成兩次。
  world.combatEnv = { ...world.combatEnv, damageDealt: 1, healing: 1 };
  const spawn = (
    x: number,
    seat: number,
    team: number,
    hp: number,
    maxHp: number,
    mana: number,
    maxMana: number,
    mr: number,
  ): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z: Z0.center.z + 10 },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.6,
      zone: 0,
    });
    world.health.set(id, { hp, maxHp, mana, maxMana, alive: true, shields: [] });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
    world.nav.set(id, {
      order: null,
      moveTarget: null,
      override: null,
      attackTarget: null,
      attackTargetAuto: false,
    });
    world.status.set(id, { effects: [] });
    const final = zeroStats();
    final[Stat.MagicResist] = mr;
    world.stats.set(id, {
      championId: "fixture" as ChampionId,
      final,
      dirty: false,
      sources: [],
    });
    return id;
  };
  const attacker = spawn(
    Z0.center.x,
    0,
    0,
    opts.attackerHp ?? 1000,
    opts.attackerMaxHp ?? 1000,
    opts.attackerMana ?? 0,
    1000,
    0,
  );
  const victim = spawn(
    Z0.center.x + (opts.gap ?? 3),
    1,
    1,
    100000,
    opts.victimMaxHp ?? 100000,
    opts.victimMana ?? 0,
    opts.victimMaxMana ?? 1000,
    opts.victimMr ?? 0,
  );
  // THE SHIPPED BUILDER, 不是手寫的 literal。
  attachSource(world, attacker, itemModifierSource(world, attacker, itemId, 0, doc(itemId)));
  world.rebuildGrid();
  return { world, attacker, victim };
}

/** 打一下(觸發 onBasicAttack)並排空傷害佇列;回傳受害者掉了多少血。 */
function swing(r: Rig): number {
  const hp = r.world.health.get(r.victim)!;
  const before = hp.hp;
  fireHooks(r.world, r.attacker, "onBasicAttack", r.victim);
  r.world.step(NO_INTENTS);
  return before - hp.hp;
}

// ---------------------------------------------------------------------------
describe("§2A 虛哭神去 —— 傷害 = 自身已損失生命的百分比,當作點數", () => {
  it("掉 60% 血 → 額外 60 點,不是「60% 的什麼」", () => {
    cover(`${TAG}/kunaki/points`);
    const r = rig(KUNAKI, { attackerHp: 400, attackerMaxHp: 1000 });
    // 已損 600/1000 = 60% → 60 點。maxHp 是 1000,所以如果有人把 scale 讀成
    // ratio,這裡會是 600 —— 十倍,而且是**跟著血量上限長大**的十倍。
    expect(swing(r)).toBeCloseTo(60, 6);
  });

  it("同樣的 60%,把血條放大十倍,傷害**不變**(它與生命上限無關)", () => {
    cover(`${TAG}/kunaki/scale-free`);
    const small = rig(KUNAKI, { attackerHp: 400, attackerMaxHp: 1000 });
    const big = rig(KUNAKI, { attackerHp: 4000, attackerMaxHp: 10000 });
    // 這一條才是 points 與 ratio 真正分得開的地方:比例讀法會讓大血條打十倍。
    expect(swing(big)).toBeCloseTo(swing(small), 6);
  });

  it("滿血 → 完全不發封包(不是發一個 0)", () => {
    cover(`${TAG}/kunaki/no-empty-packet`);
    const r = rig(KUNAKI, { attackerHp: 1000, attackerMaxHp: 1000 });
    const before = r.world.health.get(r.victim)!.hp;
    fireHooks(r.world, r.attacker, "onBasicAttack", r.victim);
    // 佇列必須是空的。一發 0 的封包會在對方頭上跳一個「0」、還會白白觸發
    // 雙方的 onDamageTaken / onDamageDealt —— 一件沒發生的事被當成發生了。
    expect(r.world.damageQueue.length).toBe(0);
    r.world.step(NO_INTENTS);
    expect(r.world.health.get(r.victim)!.hp).toBe(before);
  });

  it("上限是 100 點(剩 1 點血)", () => {
    cover(`${TAG}/kunaki/ceiling`);
    const r = rig(KUNAKI, { attackerHp: 1, attackerMaxHp: 1000 });
    expect(swing(r)).toBeCloseTo(99.9, 6);
  });
});

// ---------------------------------------------------------------------------
describe("§2B 熾天使之弓 —— 削現存魔 3% + 燒最大生命 3%/秒 × 2 秒,每秒最多一次", () => {
  /** 這一族要英雄身分(victim: "champion"),所以受害者要有 ChampionComp。 */
  function markChampion(r: Rig, id: EntityId): void {
    r.world.champion.set(id, {
      championId: "fixture" as ChampionId,
      level: 1,
      xp: 0,
      gold: 0,
      items: [null, null, null, null, null, null],
      attrBonus: { str: 0, agi: 0, int: 0 },
    } as never);
  }

  it("削掉的是**現存**魔的 3%,不是最大魔的 3%", () => {
    cover(`${TAG}/seraph/current-mana`);
    const r = rig(SERAPH, { victimMana: 400, victimMaxMana: 1000 });
    markChampion(r, r.victim);
    fireHooks(r.world, r.attacker, "onBasicAttack", r.victim);
    // 400 × 3% = 12 → 388。讀成最大魔會是 30 → 370。
    expect(r.world.health.get(r.victim)!.mana).toBeCloseTo(388, 6);
  });

  it("連削三下是複利遞減(每次都重讀現存)", () => {
    cover(`${TAG}/seraph/compounding`);
    const r = rig(SERAPH, { victimMana: 1000, victimMaxMana: 1000 });
    markChampion(r, r.victim);
    // ⚠️ 2026-08-01:三下之間**必須真的推進 tick**。owner 裁定這條 hook
    // 「冷卻1秒」,所以同一 tick 連按三次只會削一次 —— 舊版沒有 step 的寫法
    // 現在會量到 970 而不是 912.673,而那不是複利壞了,是 ICD 在工作。
    // 這一格同時是「ICD 真的在同一條路徑上」的旁證,正式守衛在
    // packages/shared/src/content/legendaryOwnerRulings.test.ts。
    // 節奏從**出貨文件**算,不是寫死 30 —— ICD 改了這裡自己跟上,而 ICD 被
    // 刪掉時下面那條斷言會直接說出來(不是靜靜地變成「同一 tick 打三下」)。
    const icdTicks = Math.round((doc(SERAPH).passive![0]!.internalCooldown ?? 0) / r.world.dt);
    expect(icdTicks, "熾天使之弓 的 internalCooldown 不見了 —— 這條測試的節奏前提沒了").toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 3; i++) {
      fireHooks(r.world, r.attacker, "onBasicAttack", r.victim);
      if (i < 2) for (let t = 0; t < icdTicks; t++) r.world.step(NO_INTENTS);
    }
    // 1000 × 0.97³ = 912.673。固定量(每次 30)會是 910。
    expect(r.world.health.get(r.victim)!.mana).toBeCloseTo(912.673, 3);
  });

  it("燒的是**目標**最大生命 3%,兩跳,共 6%", () => {
    cover(`${TAG}/seraph/dot-victim-maxhp`);
    const r = rig(SERAPH, { victimMaxMana: 1000, victimMana: 1000 });
    markChampion(r, r.victim);
    const hp = r.world.health.get(r.victim)!;
    hp.maxHp = 2000;
    hp.hp = 2000;
    fireHooks(r.world, r.attacker, "onBasicAttack", r.victim);
    // 30 Hz;每 1 秒一跳,持續 2 秒 → 第 30 與第 60 tick 各一跳。
    for (let t = 0; t < 70; t++) r.world.step(NO_INTENTS);
    // 2000 × 3% × 2 = 120。讀成**持有者的** maxHealth(1000)會是 60 —— 那正是
    // authoringNote 說「錯的分母」的那一半。
    expect(2000 - hp.hp).toBeCloseTo(120, 4);
  });

  it("victim:\"champion\" —— 不是英雄的身體既不被削魔也不被燒", () => {
    cover(`${TAG}/seraph/victim-gate`);
    const r = rig(SERAPH, { victimMana: 400, victimMaxMana: 1000 });
    // 故意 NOT markChampion:一個部隊/中立物。
    const hp = r.world.health.get(r.victim)!;
    const hp0 = hp.hp;
    fireHooks(r.world, r.attacker, "onBasicAttack", r.victim);
    for (let t = 0; t < 70; t++) r.world.step(NO_INTENTS);
    expect(hp.mana).toBe(400);
    expect(hp.hp).toBe(hp0);
  });
});

// ---------------------------------------------------------------------------
describe("§2D 瑪那魔杖 —— 傷害 = 敵方現存魔 5%,回魔 = **實際打出去的量**", () => {
  it("傷害讀的是目標現存魔", () => {
    cover(`${TAG}/manarod/damage`);
    const r = rig(MANA_ROD, { victimMana: 800, victimMaxMana: 1000 });
    expect(swing(r)).toBeCloseTo(40, 6); // 800 × 5%
  });

  it("回魔量 = 減免**之後**的傷害,不是減免之前的意圖", () => {
    cover(`${TAG}/manarod/refund-post-mitigation`);
    // 魔抗 100 → mitigate = 100/(100+100) = 0.5。
    const r = rig(MANA_ROD, { victimMana: 800, victimMaxMana: 1000, victimMr: 100 });
    const attackerHp = r.world.health.get(r.attacker)!;
    attackerHp.mana = 0;
    const dealt = swing(r);
    // 意圖 40,魔抗吃掉一半 → 真的打 20。
    expect(dealt).toBeCloseTo(20, 6);
    // ⚠️ 這一條就是整個 refund 設計存在的理由:折返必須等於 **20**。
    // 把 refund 移回 effects/damage.ts 去算,它只拿得到 40 —— 兩倍,而且與
    // 玩家看到的浮動數字對不上(#125 的形態)。
    expect(attackerHp.mana).toBeCloseTo(dealt, 6);
    expect(attackerHp.mana).not.toBeCloseTo(40, 3);
  });

  it("護盾全吃掉的一下回 0 魔(那一下沒有造成傷害)", () => {
    cover(`${TAG}/manarod/refund-shielded`);
    const r = rig(MANA_ROD, { victimMana: 800, victimMaxMana: 1000 });
    const attackerHp = r.world.health.get(r.attacker)!;
    attackerHp.mana = 0;
    r.world.health.get(r.victim)!.shields.push({
      amount: 1000,
      expiresAtTick: 100000,
      sourceId: "test",
    } as never);
    expect(swing(r)).toBe(0);
    expect(attackerHp.mana).toBe(0);
  });

  it("回魔不會超過最大魔", () => {
    cover(`${TAG}/manarod/refund-clamped`);
    const r = rig(MANA_ROD, { victimMana: 1000, victimMaxMana: 1000 });
    const attackerHp = r.world.health.get(r.attacker)!;
    attackerHp.maxMana = 10;
    attackerHp.mana = 8;
    swing(r);
    expect(attackerHp.mana).toBe(10);
  });
});

// ---------------------------------------------------------------------------
describe("§2E 炎神弩 —— 距離線性內插 10 → 1000", () => {
  /** 兩人相距 `gap` 時,這一下額外打多少。 */
  function atGap(gap: number): number {
    return swing(rig(FLAME_BOW, { gap }));
  }

  it("貼臉(距離 0)= near = 10", () => {
    cover(`${TAG}/flamebow/near`);
    expect(atGap(0)).toBeCloseTo(10, 6);
  });

  it("一半(距離 5)= 中點 505", () => {
    cover(`${TAG}/flamebow/mid`);
    // 線性:10 + (1000-10) × 0.5 = 505。任何曲線(或 falloff 那種反向)都不會
    // 剛好落在中點,所以這一條是「真的是 lerp」的斷言,不是「有東西」。
    expect(atGap(5)).toBeCloseTo(505, 6);
  });

  it("到 atRange(10)= far = 1000,再遠**夾住**", () => {
    cover(`${TAG}/flamebow/far-clamped`);
    expect(atGap(10)).toBeCloseTo(1000, 6);
    expect(atGap(18)).toBeCloseTo(1000, 6);
  });

  it("方向是「越遠越痛」,不是 damageArea.falloff 的「越遠越弱」", () => {
    cover(`${TAG}/flamebow/direction`);
    expect(atGap(8)).toBeGreaterThan(atGap(2));
  });
});

// ---------------------------------------------------------------------------
// §2C — 朗基努斯之槍。這一支要真的英雄(三圍),所以自己 boot registry。
// ---------------------------------------------------------------------------
describe("§2C 朗基努斯之槍 —— 機率讀總敏捷,傷害讀總力量", () => {
  let ENV: CombatEnvMultipliers;
  let HERO: ChampionId;

  beforeAll(() => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    const store = new ContentStore();
    const read = (c: string): Record<string, unknown>[] =>
      readdirSync(join(CONTENT_DIR, c))
        .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
        .sort()
        .map((f) => JSON.parse(readFileSync(join(CONTENT_DIR, c, f), "utf-8")));
    for (const c of ["ability-templates", "abilities"]) {
      for (const d of read(c)) store.add(c as never, d.id as string, d);
    }
    for (const d of read("champions")) {
      const parsed = zChampionDoc.safeParse(d);
      if (parsed.success) store.add("champions", parsed.data.id, parsed.data);
    }
    for (const d of read("items")) store.add("items", d.id as string, d);
    registerAll(store);
    const env = JSON.parse(
      readFileSync(join(CONTENT_DIR, "config", "combat-env.json"), "utf-8"),
    ) as { multipliers?: Record<string, number> };
    ENV = normalizeCombatEnv(env.multipliers);
    // CHOSEN, not typed in — 同 itemAttributes.test.ts 的理由:寫死一個英雄 id
    // 會讓這個檔在那位英雄改名的那一天變紅,而那跟這件武器無關。
    const withAttrs = [...Champions.all()]
      .filter((d) => d.attributes !== undefined)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(withAttrs.length).toBeGreaterThan(0);
    HERO = withAttrs[0]!.id;
  });

  function heroRig(level: number): Rig {
    const world = new SimWorld(SKELETON_ARENA, 90210);
    world.combatEnv = { ...ENV, damageDealt: 1 };
    const mk = (seat: number, team: number, dx: number): EntityId => {
      const id = spawnChampion(world, {
        championId: HERO,
        seatId: asSeatId(seat),
        teamId: asTeamId(team),
        pos: { x: Z0.center.x + dx, z: Z0.center.z + 10 },
        zone: 0,
        level,
      });
      recomputeStats(world, id);
      return id;
    };
    const attacker = mk(0, 0, 0);
    const victim = mk(1, 1, 3);
    // 受害者血很多,免得被打死讓後面的試驗全部被 `!hp.alive` 吃掉。
    const vhp = world.health.get(victim)!;
    vhp.maxHp = 1e7;
    vhp.hp = 1e7;
    world.champion.get(attacker)!.items[0] = LONGINUS;
    attachItemSource(world, attacker, LONGINUS, 0, doc(LONGINUS));
    recomputeStats(world, attacker);
    world.rebuildGrid();
    return { world, attacker, victim };
  }

  it("傷害等於持有者的**總力量**(而且會隨等級與裝備一起動)", () => {
    cover(`${TAG}/longinus/damage-is-total-str`);
    // max: 1 的 clamp 對這一條沒有影響 —— 我們把機率門檻臨時推到必定觸發,
    // 免得測「傷害」的斷言被骰子決定。做法是直接讀 sim 算出來的傷害:
    // 連打多次,取有掉血的那些。
    for (const level of [1, 9]) {
      const r = heroRig(level);
      const str = liveAttribute(r.world, r.attacker, "str", "total")!;
      expect(str).toBeGreaterThan(0);
      let sawHit = false;
      for (let i = 0; i < 200 && !sawHit; i++) {
        fireHooks(r.world, r.attacker, "onBasicAttack", r.victim);
        r.world.step(NO_INTENTS);
        // ⚠️ 讀 `damage` 事件的 `amount`,**不是** hp 的差 —— 真英雄每 tick 都在
        // 回血(RegenSystem),用血條差會把回血算進去(第一版就是這樣差了 0.03)。
        // `amount` 就是玩家看到的那個浮動數字,也正是這條斷言該讀的最終物件。
        const hit = r.world.events.find(
          (ev) => ev.type === "damage" && (ev.data as { source: number }).source === r.attacker,
        );
        if (hit === undefined) continue;
        sawHit = true;
        const dealt = (hit.data as { amount: number }).amount;
        // 魔抗 → mitigate = 100/(100+mr)
        const mr = r.world.stats.get(r.victim)!.final[Stat.MagicResist];
        expect(dealt).toBeCloseTo(str * (100 / (100 + Math.max(0, mr))), 4);
      }
      expect(sawHit, `level ${level} 應該至少 proc 過一次`).toBe(true);
    }
  });

  it("等級高 → 力量高 → 傷害高(不是一個固定數字)", () => {
    cover(`${TAG}/longinus/damage-scales`);
    const lo = heroRig(1);
    const hi = heroRig(9);
    expect(liveAttribute(hi.world, hi.attacker, "str", "total")!).toBeGreaterThan(
      liveAttribute(lo.world, lo.attacker, "str", "total")!,
    );
  });

  it("觸發率 ≈ 總敏捷 %,而且會隨敏捷一起上升", () => {
    cover(`${TAG}/longinus/chance-is-total-agi`);
    const trials = 3000;
    const measure = (level: number): { agi: number; rate: number } => {
      const r = heroRig(level);
      const agi = liveAttribute(r.world, r.attacker, "agi", "total")!;
      let procs = 0;
      for (let i = 0; i < trials; i++) {
        fireHooks(r.world, r.attacker, "onBasicAttack", r.victim);
        r.world.step(NO_INTENTS);
        // 同上:數 `damage` 事件,不是血條差(回血會把沒觸發的一次算成觸發)。
        if (
          r.world.events.some(
            (ev) => ev.type === "damage" && (ev.data as { source: number }).source === r.attacker,
          )
        ) {
          procs++;
        }
      }
      return { agi, rate: procs / trials };
    };
    const lo = measure(1);
    const hi = measure(9);
    // 門檻就是 AGI × 0.01。±5 pp 的帶寬:3000 次抽樣下夠窄,能抓到「係數寫錯
    // 一個數量級」或「其實用的是靜態 chance」,又不會被種子弄成飄的。
    expect(lo.rate).toBeGreaterThan(lo.agi * 0.01 - 0.05);
    expect(lo.rate).toBeLessThan(lo.agi * 0.01 + 0.05);
    expect(hi.rate).toBeGreaterThan(hi.agi * 0.01 - 0.05);
    expect(hi.rate).toBeLessThan(hi.agi * 0.01 + 0.05);
    // 活的門檻:敏捷高的那一邊真的比較常觸發。一個靜態 `chance` 會讓兩邊一樣。
    expect(hi.agi).toBeGreaterThan(lo.agi);
    expect(hi.rate).toBeGreaterThan(lo.rate);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §3 — schema 的上界真的擋得住打錯的數字
// ═══════════════════════════════════════════════════════════════════════════
describe("§3 打錯一個數量級要**載不進來**,不是被 clamp 藏起來", () => {
  const dmg = (extra: Record<string, unknown>) => ({
    kind: "damage",
    damageType: "magic",
    amount: { flat: 0 },
    ...extra,
  });

  it("resourcePct ratio 模式:0.05 打成 5 → 拒絕", () => {
    cover(`${TAG}/schema/resource-ratio`);
    const ok = dmg({
      resourcePct: { subject: "target", resource: "mana", basis: "current", perRank: [0.05] },
    });
    const bad = dmg({
      resourcePct: { subject: "target", resource: "mana", basis: "current", perRank: [5] },
    });
    expect(zEffectDef.safeParse(ok).success).toBe(true);
    expect(zEffectDef.safeParse(bad).success).toBe(false);
  });

  it("resourcePct points 模式:1 打成 100 → 拒絕", () => {
    cover(`${TAG}/schema/resource-points`);
    const mk = (v: number) =>
      dmg({
        resourcePct: {
          subject: "self",
          resource: "health",
          basis: "missing",
          scale: "points",
          perRank: [v],
        },
      });
    expect(zEffectDef.safeParse(mk(1)).success).toBe(true);
    expect(zEffectDef.safeParse(mk(100)).success).toBe(false);
  });

  it("distanceScale:1000 打成 10000 → 拒絕;atRange 抄了未換算的 WC3 值 → 拒絕", () => {
    cover(`${TAG}/schema/distance`);
    expect(
      zEffectDef.safeParse(dmg({ distanceScale: { atRange: 10, near: 10, far: 1000 } })).success,
    ).toBe(true);
    expect(
      zEffectDef.safeParse(dmg({ distanceScale: { atRange: 10, near: 10, far: 10000 } })).success,
    ).toBe(false);
    expect(
      zEffectDef.safeParse(dmg({ distanceScale: { atRange: 500, near: 10, far: 1000 } })).success,
    ).toBe(false);
  });

  it("dot 的百分比守衛架在**整段總量**上,不是單次", () => {
    cover(`${TAG}/schema/dot-budget`);
    const burn = (pct: number, durationSec: number) => ({
      kind: "dot",
      damageType: "magic",
      amountPerTick: { flat: 0 },
      resourcePct: {
        subject: "target",
        resource: "health",
        basis: "max",
        perRank: [pct],
      },
      intervalSec: 1,
      durationSec,
    });
    // 出貨的熾天使之弓:3% × 2 秒 = 6%。
    expect(zEffectDef.safeParse(burn(0.03, 2)).success).toBe(true);
    // 同一個「單次 3%」,拉到 30 秒 = 90% 一條血 —— 單次上界看不出來,總量看得出來。
    expect(zEffectDef.safeParse(burn(0.03, 30)).success).toBe(false);
    // 而 damage 的 hpPct 上界 0.35 直接抄過來會是 0.35 × 20 = 700%,更明顯。
    expect(zEffectDef.safeParse(burn(0.35, 20)).success).toBe(false);
  });

  it("chanceFrom:0.01 打成 1 → 拒絕(clamp 會把它藏成「永遠觸發」)", () => {
    cover(`${TAG}/schema/chance-coeff`);
    const hook = (coeff: number) => ({
      on: "onBasicAttack",
      chanceFrom: { attr: "agi", basis: "total", coeff, min: 0, max: 1 },
      effects: [dmg({})],
    });
    expect(zHookDef.safeParse(hook(0.01)).success).toBe(true);
    expect(zHookDef.safeParse(hook(1)).success).toBe(false);
  });

  it("chance 與 chanceFrom 同時出現 → 拒絕;顛倒的 min/max → 拒絕", () => {
    cover(`${TAG}/schema/chance-exclusive`);
    expect(
      zHookDef.safeParse({
        on: "onBasicAttack",
        chance: 0.5,
        chanceFrom: { attr: "agi", coeff: 0.01, min: 0, max: 1 },
        effects: [dmg({})],
      }).success,
    ).toBe(false);
    expect(
      zHookDef.safeParse({
        on: "onBasicAttack",
        chanceFrom: { attr: "agi", coeff: 0.01, min: 0.9, max: 0.1 },
        effects: [dmg({})],
      }).success,
    ).toBe(false);
  });

  it("attrRatios 係數 1 過得了,90 過不了(原作 JASS 最大用到 9)", () => {
    cover(`${TAG}/schema/attr-ratio`);
    const mk = (coeff: number) =>
      dmg({ amount: { attrRatios: [{ attr: "str", basis: "total", coeff }] } });
    expect(zEffectDef.safeParse(mk(1)).success).toBe(true);
    expect(zEffectDef.safeParse(mk(9)).success).toBe(true);
    expect(zEffectDef.safeParse(mk(90)).success).toBe(false);
  });
});

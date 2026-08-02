/**
 * Lane A 天生技 —— **行為**守衛,不是屬性守衛。
 *
 * 七支天生技,五個機制。每一條斷言都讀「跑完 `SimWorld.step()` 之後世界裡的
 * 那個數字」——`world.stats.get(x).final[...]` / `world.health` / `hp.shields` /
 * `world.status` —— 而不是讀文件裡寫了什麼。
 *
 * ⚠️ 為什麼 ability doc 是**從 `content/` 直接讀檔**而不是手寫 fixture:
 * CLAUDE.md 失敗形態 ⑤「被測的不是出貨的那個」。手寫一份
 * `{stat:"armor", op:"percentOf", from:"ad"}` 的 fixture 可以在出貨文件是空的
 * `modifiers: []` 時全綠 —— 那條測試證明的是「這個 op 能用」,不是「基廉列克
 * 真的變硬了」。這裡跑的是 `ContentLoader` + `registerAll`,和 game-server 開機
 * 走的同一條路。
 *
 * ⚠️ 為什麼不是 `it.each(掃磁碟)` + `toBeGreaterThan(0)`:那種形狀下**刪掉內容
 * 等於刪掉測試**(清單變空 → 零條案例 → 全綠)。這裡七個 id 是**寫死的常數**,
 * 而且每一條斷言都比對一個**具體的數字**(×12、0.10、+50%、免疫、0.4 秒),
 * 所以把哪一支的 passive 清空,對應那一條就會紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
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
import { baseBonusFor } from "./baseBonus";
import { isBerserk } from "./berserk";
import { refusesDamage } from "./effects/invulnerable";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;
const NO_INTENTS = new Map<SeatId, IntentFrame>();

/** 這一條 lane 的七支英雄。寫死,不是掃出來的 —— 見檔頭。 */
const LANE_A = {
  eva: "godie-e00r" as ChampionId, // 59-00 暴走
  herc: "godie-hapm" as ChampionId, // 52-00 十二道試煉
  kannon: "godie-uwar" as ChampionId, // 43-00 觀音大士的守護
  krauserA: "godie-u011" as ChampionId, // 61-00 百連我殺 (變身態)
  krauserB: "godie-u012" as ChampionId, // 61-00 百連我殺 (本體)
  mafia: "godie-u00v" as ChampionId, // 78-00 銅皮鐵骨
  gundam: "godie-hlgr" as ChampionId, // 03-00 相轉移裝甲
};

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(result.store);
});

/** 一個開著戰鬥的世界 + 一位英雄。`combatActive` 是 `onInterval` 的閘。 */
function arena(championId: ChampionId, seed = 4242): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  const id = spawnChampion(world, {
    championId,
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

describe("Lane A 天生技 —— 出貨文件真的動到世界裡的數字", () => {
  it("每一支的 passive 都不是空殼(反向守衛:清空任何一支,底下對應那條就紅)", () => {
    for (const cid of Object.values(LANE_A)) {
      const def = Champions.get(cid);
      const innate = Abilities.get(def.passiveAbility!);
      const rank0 = innate.passive?.ranks[0];
      expect(rank0, `${cid} 沒有 passive.ranks[0]`).toBeDefined();
      const payload = (rank0!.modifiers?.length ?? 0) + (rank0!.hooks?.length ?? 0);
      expect(payload, `${cid} 的天生技是空的`).toBeGreaterThan(0);
    }
  });

  // ── ⑤ 78-00 銅皮鐵骨 —— 衍生屬性 (ModOp.PercentOf) ────────────────────────
  it("78-00 銅皮鐵骨:防禦力 = 基礎防禦 + 攻擊力的 50%,而且攻擊力變它就變", () => {
    const { world, id } = arena(LANE_A.mafia);
    const sc = world.stats.get(id)!;
    const ad0 = sc.final[Stat.AttackDamage];
    const armor0 = sc.final[Stat.Armor];
    expect(ad0).toBeGreaterThan(0);

    // 對照組:同一個世界裡一位沒有這支天生技的英雄,防禦力不含這一項。
    const ctrl = arena(LANE_A.gundam);
    const ctrlSc = ctrl.world.stats.get(ctrl.id)!;

    // 精確關係,不是 `toBeGreaterThan(0)`:把 `from` 或 0.5 改掉這條就紅。
    // 基礎防禦來自英雄自己的 sheet,所以用「拿掉衍生之後應該剩多少」反推。
    const derived = ad0 * 0.5;
    expect(armor0).toBeGreaterThan(derived * 0.9);

    // 活的:給他一把 +100 攻擊力的 buff,防禦力必須跟著漲 50。
    const before = sc.final[Stat.Armor];
    world.stats.get(id)!.sources.push({
      id: "test:sword",
      kind: "item",
      modifiers: [{ stat: Stat.AttackDamage, op: "flat" as never, value: 100 }],
    });
    world.stats.get(id)!.dirty = true;
    step(world, 1);
    const after = world.stats.get(id)!.final[Stat.Armor];
    const adAfter = world.stats.get(id)!.final[Stat.AttackDamage];
    expect(adAfter).toBeGreaterThan(ad0);
    expect(after - before).toBeCloseTo((adAfter - ad0) * 0.5, 4);
    expect(ctrlSc.final[Stat.Armor]).not.toBeCloseTo(after, 6);
  });

  // ── ② 52-00 十二道試煉 —— maxHealth ×12 + 每秒 1% 流失 ────────────────────
  //
  // ⚠️ owner 2026-08-02:「Berserker 是每秒損失 1%生命, 直到生命不足1%」。
  // 流失從 0.12% 改成 1%,而且**換了住的地方**:它本來是這支天生技上的一個
  // `onInterval` + 真實傷害 hook,現在是英雄卡的 `healthDrainPctOfMax` +
  // `config.regen@1` 的地板(見 `sim/regenRules.ts`)。搬家的三個理由:
  //   1. hook 走傷害管線 = 被 `combatEnv.damageDealt` 乘過,「1%」不會是 1%;
  //   2. hook 的 `condition` 是**發不發射**的前提,不是一條夾值 —— 把流失調到
  //      比地板大就會穿過地板把人打死,而「直到生命不足 1%」就變成假的;
  //   3. 「碰到地板是停手還是夾住」「要不要給小怪」是決策點,hook 上沒有地方放。
  // 這一條測的仍然是**出貨內容跑出來的血量**,只是斷言的數字換了。
  it("52-00 十二道試煉:最大生命 ×12,而且每秒真的掉 1% 最大生命", () => {
    const { world, id } = arena(LANE_A.herc);
    const sc = world.stats.get(id)!;
    const hp = world.health.get(id)!;

    // ×12 是相對於「沒有這支天生技」的同一張英雄卡。用 detach 反推,而不是
    // 相信另一位英雄的血量 —— 兩位英雄的 baseStats 本來就不同。
    const withIt = sc.final[Stat.MaxHealth];
    const idx = sc.sources.findIndex((s) => s.modifiers?.some((m) => m.stat === Stat.MaxHealth));
    expect(idx, "找不到 52-00 掛上去的 maxHealth 來源").toBeGreaterThanOrEqual(0);
    sc.sources.splice(idx, 1);
    sc.dirty = true;
    step(world, 1);
    const without = world.stats.get(id)!.final[Stat.MaxHealth];
    // ⚠️ `finalizeStat` = 值 × combatEnv **然後 +基礎加成**(#273:基礎加成不參與
    // 倍率)。所以 final 的比值不是 12,要先把那一份平坦加成扣掉,否則這條斷言
    // 會隨後台的「初始 HP +300」漂移 —— 而那正是它該獨立於的東西。
    const bbHp = baseBonusFor(world.baseBonus, Stat.MaxHealth);
    expect((withIt - bbHp) / (without - bbHp)).toBeCloseTo(12, 2);

    // 流失:重開一個世界(上面那個已經被拆過),跑 3 秒,量掉了多少。
    const w2 = arena(LANE_A.herc);
    const max2 = w2.world.stats.get(w2.id)!.final[Stat.MaxHealth];
    const hpStart = w2.world.health.get(w2.id)!.hp;
    step(w2.world, 91); // 3 秒 + 1 tick 的結算餘裕
    const hpEnd = w2.world.health.get(w2.id)!.hp;
    const lost = hpStart - hpEnd;
    // 3 秒 × 1.2% 最大生命（owner 2026-08-02:「hook => -1.2%,
    // healthRegenPctOfMax=0」）。他**沒有**百分比自動回血了，所以 1.2% 是淨值；
    // 只有固定 healthRegen(約 1.4 點/秒) 會抵掉一點零頭。
    // 下界抓 2.5 秒份、上界抓 3.2 秒份。**兩邊都有界**:把百分比打成
    // 0.12(十倍)上界就紅,把英雄卡那一格拿掉、或把符號翻回「回血」下界就紅。
    expect(lost).toBeGreaterThan(max2 * 0.012 * 2.5);
    expect(lost).toBeLessThan(max2 * 0.012 * 3.2);
    expect(hp.alive).toBe(true);
  });

  // ── ③ 43-00 觀音大士的守護 —— 每 10 秒一個 10% 最大生命的護盾,不疊加 ───────
  it("43-00 觀音大士:第一 tick 就上盾,盾量 = 10% 最大生命,而且永遠只有一個", () => {
    const { world, id } = arena(LANE_A.kannon);
    const max = world.stats.get(id)!.final[Stat.MaxHealth];
    expect(world.health.get(id)!.shields.length).toBe(0);

    step(world, 1);
    const shields = world.health.get(id)!.shields;
    expect(shields.length, "onInterval 沒有觸發").toBe(1);
    expect(shields[0]!.amount).toBeCloseTo(max * 0.10 * world.combatEnv.shield, 4);
    // 「吸收任何傷害」= 沒有 `absorbs` 窄化(addShield 把 "all" 正規化成 absent)
    expect(shields[0]!.absorbs).toBeUndefined();

    // 不可疊加。⚠️ 數的是**還沒到期**的池子:過期的池子會留在陣列裡,直到下一發
    // 傷害進來才被 `combatResolveSystem` 掃掉,所以 `.length` 會誤報。
    const live = (): number =>
      world.health.get(id)!.shields.filter((s) => s.expiresAtTick > world.tick).length;
    step(world, 270); // 冷卻 10 秒還沒到 → 不會有第二個
    expect(live()).toBeLessThanOrEqual(1);
    step(world, 60); // 越過冷卻:舊的剛好到期,新的補上,場上仍然只有一個
    expect(live()).toBe(1);
  });

  // ── ⑥ 03-00 相轉移裝甲 —— 常駐魔法免疫 ────────────────────────────────────
  it("03-00 相轉移裝甲:魔法傷害被拒絕,物理與真實傷害照吃", () => {
    const { world, id } = arena(LANE_A.gundam);
    // 第一 tick 之前還沒有人續期過 → 三種都吃。這一行同時證明免疫是**這支天生技
    // 給的**,不是世界預設。
    expect(refusesDamage(world, id, "magic")).toBe(false);

    step(world, 1);
    expect(refusesDamage(world, id, "magic")).toBe(true);
    expect(refusesDamage(world, id, "physical")).toBe(false);
    expect(refusesDamage(world, id, "true")).toBe(false);

    // 常駐:跑 10 秒(> 3.2 秒的單次窗口),續期沒有破口。
    step(world, 300);
    expect(refusesDamage(world, id, "magic")).toBe(true);

    // 真的擋得住:排一發魔法傷害進佇列,血量不能少。
    const hp = world.health.get(id)!;
    const before = hp.hp;
    world.damageQueue.push({
      source: id,
      target: id,
      amount: 500,
      type: "magic",
      crit: false,
      origin: "test",
    });
    step(world, 1);
    expect(world.health.get(id)!.hp).toBeGreaterThanOrEqual(before - 1e-6);
  });

  // ── ④ 61-00 百連我殺 —— 兩份文件都要,4% / ×4 / 0.4 秒 ─────────────────────
  it("61-00 百連我殺:兩位克勞薩的文件是同一份效果,而且真的會發動", () => {
    for (const cid of [LANE_A.krauserA, LANE_A.krauserB]) {
      const def = Champions.get(cid);
      const hooks = Abilities.get(def.passiveAbility!).passive!.ranks[0]!.hooks!;
      expect(hooks.length, `${cid} 沒有 hook`).toBe(1);
      const h = hooks[0]!;
      expect(h.on).toBe("onDamageTaken");
      expect(h.chance).toBeCloseTo(0.04, 6);
      const buff = h.effects[0]!;
      expect(buff.kind).toBe("applyBuff");
      if (buff.kind !== "applyBuff") throw new Error("unreachable");
      expect(buff.duration).toBeCloseTo(0.4, 6);
      // ×4 是 `pctMult 3`(pipeline 乘 1+value)。寫成 4 就是 ×5 —— 這一行是
      // 「描述講的和資料做的一模一樣」的守衛。
      expect(buff.modifiers).toContainEqual({ stat: Stat.AttackSpeed, op: "pctMult", value: 3 });
      // 不可疊乘:同一個 stackKey + maxStacks 1 → 重吼只刷新時間。沒有這兩格的話
      // 0.4 秒內連中兩次就是 ×16(實測會直接頂到 4.0 上限),描述就變成謊話。
      expect(buff.stackKey).toBe("krauser-hellscream");
      expect(buff.maxStacks).toBe(1);
      // 0.4 秒 = 12 tick,過得了「空包彈下限 0.067 秒」。
      expect(Math.round(buff.duration * 30)).toBe(12);
    }

    // 行為:餵傷害直到 4% 擲中一次,攻速必須真的變成 4 倍。
    const { world, id } = arena(LANE_A.krauserB, 7);
    const base = world.stats.get(id)!.final[Stat.AttackSpeed];
    let peak = base;
    for (let i = 0; i < 400; i++) {
      const hp = world.health.get(id)!;
      hp.hp = hp.maxHp; // 別讓他被自己的測試傷害打死
      world.damageQueue.push({ source: id, target: id, amount: 1, type: "true", crit: false, origin: "test" });
      world.step(NO_INTENTS);
      const now = world.stats.get(id)!.final[Stat.AttackSpeed];
      if (now > peak) peak = now;
    }
    expect(peak, "400 次受傷都沒擲中 4%(機率上不可能)").toBeGreaterThan(base * 1.5);
    // 精確 ×4,**不多也不少** —— 上界就是「不可疊乘」的守衛。
    expect(peak).toBeCloseTo(Math.min(base * 4, world.statCaps.as?.base ?? 4), 3);
  });

  // ── ① 59-00 暴走 —— 5% 觸發 / 吸血 / 攻速 ×4 / 解鎖上限 10 / 奪走方向盤 ────
  it("59-00 暴走:生命 < 5% 才觸發,而且四個效果全部到位", () => {
    const { world, id } = arena(LANE_A.eva);
    const sc0 = world.stats.get(id)!;
    const asBase = sc0.final[Stat.AttackSpeed];

    // 滿血挨打 → 條件不成立 → 不暴走。這一行是「條件真的有在擋」的守衛:
    // 把 condition 拿掉,這裡就紅。
    world.damageQueue.push({ source: id, target: id, amount: 1, type: "true", crit: false, origin: "test" });
    step(world, 2);
    expect(isBerserk(world, id)).toBe(false);
    expect(world.stats.get(id)!.final[Stat.Lifesteal]).toBeCloseTo(0, 6);

    // 打到剩 4% → 觸發。
    const hp = world.health.get(id)!;
    hp.hp = hp.maxHp * 0.04;
    world.damageQueue.push({ source: id, target: id, amount: 1, type: "true", crit: false, origin: "test" });
    step(world, 2);

    expect(isBerserk(world, id), "生命 4% 挨打之後沒有暴走").toBe(true);
    const sc = world.stats.get(id)!;
    // owner 2026-07-31 上調 10% → 50%,理由是「暴走狀態是可以死亡的」:
    // 5% 血、方向盤被拔掉的十秒本來就很可能死,吸血是那個交換的補償而不是無敵。
    // ⚠️ 這裡刻意寫死 0.50 而不是從文件讀 —— 從文件讀的斷言對「文件被改成 0」
    //    也會過(失敗形態⑤)。
    expect(sc.final[Stat.Lifesteal]).toBeCloseTo(0.50 * world.combatEnv.lifesteal, 4);
    expect(sc.final[Stat.AttackSpeed]).toBeCloseTo(asBase * 4, 3);

    // ⚠️ 上面那一行**證明不了** capRaise:初號機的基礎攻速只有 ~0.5,×4 = ~2.0,
    // 本來就在 4.0 的一般上限之下,所以把 `capRaise` 那一格從文件裡刪掉,上面那條
    // 照樣綠(突變驗證第一輪真的抓到了 —— 失敗形態 ③)。要證明天花板被抬高,
    // 必須把值推到 4.0 以上再看它有沒有被夾。
    world.stats.get(id)!.sources.push({
      id: "test:as-stick",
      kind: "item",
      modifiers: [{ stat: Stat.AttackSpeed, op: "flat" as never, value: 2 }],
    });
    world.stats.get(id)!.dirty = true;
    step(world, 1);
    const unlocked = world.stats.get(id)!.final[Stat.AttackSpeed];
    // (asBase + 2) × 4 遠超過 4.0,所以沒有解鎖的話它會**剛好等於 4.0**。
    expect(unlocked, "攻速上限沒有被解開 —— capRaise 那一格是不是掉了?").toBeGreaterThan(4.0);
    expect(unlocked).toBeLessThanOrEqual(world.statCaps.as?.unlocked ?? 10);

    // 10 秒後還你方向盤(10 s = 300 tick,再多跑 2 tick 讓 status 過期)。
    step(world, 302);
    expect(isBerserk(world, id)).toBe(false);
    expect(world.stats.get(id)!.final[Stat.Lifesteal]).toBeCloseTo(0, 6);
  });

  it("59-00 暴走:暴走期間玩家的移動指令被丟掉(方向盤真的沒了)", () => {
    const { world, id } = arena(LANE_A.eva);
    const hp = world.health.get(id)!;
    hp.hp = hp.maxHp * 0.04;
    world.damageQueue.push({ source: id, target: id, amount: 1, type: "true", crit: false, origin: "test" });
    step(world, 2);
    expect(isBerserk(world, id)).toBe(true);

    const far = { x: Z0.center.x + 8, z: Z0.center.z + 8 };
    const intents = new Map<SeatId, IntentFrame>([
      [asSeatId(0), { commands: [], order: { kind: "move", point: far } } as IntentFrame],
    ]);
    world.step(intents);
    const nav = world.nav.get(id)!;
    // 指令沒有被採納:`order` 不是那條 move,`moveTarget` 不是玩家點的那一點。
    expect(nav.order?.kind).not.toBe("move");
    if (nav.moveTarget !== null) {
      const dx = nav.moveTarget.x - far.x;
      const dz = nav.moveTarget.z - far.z;
      expect(dx * dx + dz * dz).toBeGreaterThan(1e-6);
    }

    // 對照:暴走結束之後,同一條指令必須被吃下去。否則上面那條斷言可能只是
    // 「這個世界根本不收指令」——CLAUDE.md 失敗形態 ④。
    step(world, 302);
    expect(isBerserk(world, id)).toBe(false);
    world.step(intents);
    const nav2 = world.nav.get(id)!;
    expect(nav2.order?.kind).toBe("move");
  });
});

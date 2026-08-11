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
 * 而且每一條斷言都比對一個**具體的量**(0.10、+50%、免疫、0.4 秒、標記層數),
 * 所以把哪一支的 passive 清空,對應那一條就會紅。
 *
 * ⚠️ 「有內容的天生技」有**兩種形狀**(2026-08-08):`passive`(靜態屬性/hook)
 * 或 `marks`(具名標記,見 `sim/marks.ts`)。52-00 十二道試煉是第二種。
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
import { isBerserk } from "./berserk";
import { markCount } from "./marks";
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

/**
 * 出貨文件上「暴走」給的某一格 modifier —— 從 registry 讀,不抄字面值。
 * 守衛驗機制不驗數字(CLAUDE.md 第二守則):數字是 owner 每週在調的東西,
 * 抄進測試就是給它開第四個住處,而第四個沒有 drift 守衛。
 *
 * 回 `null` = 出貨文件上**根本沒有這一格**(和「有這一格但值是 0」是兩件事,
 * 呼叫端要分得出來)。
 */
function berserkModFromDoc(stat: string, op: string): number | null {
  const innate = Abilities.get(Champions.get(LANE_A.eva).passiveAbility!);
  let found: number | null = null;
  // 遞迴走 passive.ranks[0] 底下整棵樹(hooks → effects → applyBuff.modifiers),
  // 因為「它掛在哪一層」本身就是實作細節,不該被斷言釘住。
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return void node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (o.stat === stat && o.op === op && typeof o.value === "number") {
      found = found === null ? o.value : Math.max(found, o.value);
    }
    Object.values(o).forEach(walk);
  };
  walk(innate.passive?.ranks[0]);
  return found;
}

/** 出貨文件上暴走 buff 的持續秒數(applyBuff.duration)。 */
function berserkDurationFromDoc(): number {
  const innate = Abilities.get(Champions.get(LANE_A.eva).passiveAbility!);
  const buff = innate.passive?.ranks[0]?.hooks?.[0]?.effects.find((e) => e.kind === "applyBuff");
  return (buff as { duration?: number } | undefined)?.duration ?? 0;
}

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
      // ⚠️ 2026-08-08:「有內容的天生技」有**兩種形狀**,這一條原本只認得第一種。
      //   ① `passive` —— 靜態屬性 / hook(六支)
      //   ② `marks`   —— 具名標記(52-00 十二道試煉)。它**沒有** `passive` 區塊,
      //      因為它的加成是「每失去一層才長出來」的(`MarkSpec.perStackLost`),
      //      靜態屬性區塊裡沒有地方放。
      // 兩者相加 > 0 才算有內容。寫成「或」而不是「一定要有 passive」,和
      // `content/castTimeFormula.ts` 的 EXEMPTION 1 是**同一個**判斷,兩處要一致
      // (那邊寫 `def.passive !== undefined || (def.marks?.length ?? 0) > 0`)。
      // ⛔ 不要為了讓十二道試煉過這一條而去補一個空的 `modifiers: []` ——
      // 那正是 #224 修掉的形狀。
      const rank0 = innate.passive?.ranks[0];
      const staticPayload = (rank0?.modifiers?.length ?? 0) + (rank0?.hooks?.length ?? 0);
      const markPayload = innate.marks?.length ?? 0;
      expect(staticPayload + markPayload, `${cid} 的天生技是空的`).toBeGreaterThan(0);
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

  // ── ② 52-00 十二道試煉 —— 具名標記真的發到英雄身上 ────────────────────────
  //
  // ⚠️ owner 2026-08-08 重製了這支天生技,舊機制(最大生命 ×12 + 每秒流失
  // 1.2% 最大生命)**整個不存在了** —— 英雄卡的 `healthDrainPctOfMax` 已歸 0,
  // 那個 ×12 的 `passive.ranks[0].modifiers` 也拆掉了。新文案:
  //   「初始擁有十二層 [試煉] 標記。受到致命傷害時消耗一層⋯每失去一層試煉,
  //     永久提升 10% 攻擊力與 10% 最大生命。(跨回合共享)」
  // 所以加成不再是進場就有的靜態屬性,而是「每失去一層才長出來」的 ——
  // 這也是為什麼這支技能沒有 `passive` 區塊(見上面那條的註解)。
  //
  // ⛔ 這一條刻意**不斷言 12 層 / 10% / 1.5 秒**:那些是 owner 每週在調的數值,
  // 抄進測試就是給它開第四個住處(第零守則⑦)。層數從**載入的那份文件**推導。
  // ⛔ 也刻意不只斷言「文件裡有 marks 這個鍵」—— 那是掃屬性不是驗行為
  // (失敗形態⑦)。斷言讀的是 `world.marks`,也就是跑完 `spawnChampion` 之後
  // **世界上真的有的那個計數器**;把 `installMarksForChampion(...)` 的接線拔掉
  // 這一條就紅(突變驗證過)。
  it("52-00 十二道試煉:出貨文件宣告的【試煉】標記,進場就真的在世界上", () => {
    const spec = Abilities.get(Champions.get(LANE_A.herc).passiveAbility!).marks?.[0];
    expect(spec, "出貨文件上沒有標記 —— 這支天生技等於沒有效果").toBeDefined();

    const { world, id } = arena(LANE_A.herc);
    const live = (): number => markCount(world, id, spec!.markId);
    // 層數 = 文件宣告的初始值(夾在 max 內),不抄字面值。
    expect(live()).toBe(Math.min(spec!.initial, spec!.max));
    expect(live(), "標記發下去了但一層都沒有").toBeGreaterThan(0);

    // 對照組:沒有這支天生技的英雄身上不該有這個標記。少了這一行,上面那條
    // 對「世界給每個人都發標記」也會過(失敗形態④)。
    const ctrl = arena(LANE_A.gundam);
    expect(markCount(ctrl.world, ctrl.id, spec!.markId)).toBe(0);

    // 永久:`durationSec: -1` → 絕對到期 tick 是「永不」,跑幾秒不會被
    // `expireMarks` 掃掉。把它寫成一個有限秒數這裡就紅。
    step(world, 91);
    expect(live(), "標記自己過期了 —— 它應該是永久的").toBe(
      Math.min(spec!.initial, spec!.max),
    );
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
      expect(Math.round((buff.duration ?? 0) * 30)).toBe(12);
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
    // 吸血是「交換的補償」:5% 血、方向盤被拔掉的十秒本來就很可能死。
    //
    // ⚠️ 這裡原本寫死 `0.50`,理由寫成「從文件讀的斷言對『文件被改成 0』也會過」。
    // 那個顧慮是對的,但解法錯了 —— owner 2026-07-31 定 50%、2026-08-03 又定
    // 100%(「吸血100%」),於是這條測試變成**出貨數值的第四個住處**,而且它紅的
    // 時候說的是「暴走壞了」,真相只是數字被調過。CLAUDE.md 第二守則:
    // **守衛驗機制,不驗數字。**
    //
    // 兩件事分開驗,兩個顧慮就都顧到了:
    //   ① 文件上這一格必須是**有意義的正數**(擋掉「被改成 0」);
    //   ② 世界裡的最終值必須**等於文件值 × combatEnv**(擋掉「沒接上」)。
    const docLifesteal = berserkModFromDoc("lifesteal", "flat");
    expect(docLifesteal, "出貨文件上的暴走吸血是 0 —— 這一格等於沒有效果").toBeGreaterThan(0);
    expect(sc.final[Stat.Lifesteal]).toBeCloseTo(docLifesteal! * world.combatEnv.lifesteal, 4);

    // ⚠️ owner 2026-08-12 裁決:「只要讓 EX **照技能說明**正常實作 被動或主動 即可」
    // —— 重製規格把 59-00 寫成「生命降至5%時必定[暴走],將[攻擊速度]提升100%」。
    // 舊行為(owner 2026-08-03)是**只抬天花板、不給倍率**;新規格是**反過來的**:
    // 給倍率、天花板留給 EX(59-001 完全暴走「[攻擊速度]提升至最上限 10」)。
    //
    // 所以下面兩段是同一個機制(`ModOp` 管線)換了方向,不是把牙齒拔掉:
    //   ① 倍率那一格必須真的乘進最終值(文件寫 0 / 刪掉 → 上面 readback 就紅);
    //   ② 天花板必須**還是**一般上限 —— 天生技不該偷偷解鎖。
    const docAsPct = berserkModFromDoc("as", "pctAdd");
    expect(docAsPct, "出貨文件上的暴走攻速倍率不見了 —— 這支天生技等於沒有攻速效果")
      .toBeGreaterThan(0);
    expect(sc.final[Stat.AttackSpeed], "暴走的攻速倍率沒有乘進最終值").toBeCloseTo(
      asBase * (1 + docAsPct!),
      3,
    );

    // 天花板:把值頂過一般上限再讀,才分得出「有沒有 capRaise」——
    // 只斷言「暴走後攻速變高」對兩種寫法都會過(失敗形態 ③)。
    const baseCap = world.statCaps.as?.base ?? 4;
    world.stats.get(id)!.sources.push({
      id: "test:as-stick",
      kind: "item",
      modifiers: [{ stat: Stat.AttackSpeed, op: "flat" as never, value: 8 }],
    });
    world.stats.get(id)!.dirty = true;
    step(world, 1);
    // ⛔ 方向寫死,⚠️ 刻意**不從文件推導**:寫成「有 capRaise 就驗解鎖、沒有就驗
    //    被夾」的話,把那一格從文件刪掉會讓測試**自己換分支**然後全綠 ——
    //    一條可以被它所監視的東西關掉的守衛不是守衛(2026-08-12 突變驗證實測)。
    //    這裡記的是 owner 規格上的設計方向(59-00 只寫「提升100%」,解上限是 EX
    //    59-001 的事),不是一個數值,所以它不是第四個住處。
    expect(berserkModFromDoc("as", "capRaise"), "天生技不該解攻速上限,文件卻有 capRaise").toBeNull();
    const pushed = world.stats.get(id)!.final[Stat.AttackSpeed];
    expect(pushed, "天生技沒有 capRaise,攻速卻頂破了一般上限 —— 天花板閘漏了").toBeCloseTo(
      baseCap,
      5,
    );

    // 持續時間到就還你方向盤。秒數從文件讀(owner 2026-08-12 從 10 秒改成 6 秒,
    // 寫死的話這裡就是那個數字的第四個住處 —— CLAUDE.md 第二守則)。
    step(world, Math.round(berserkDurationFromDoc() * 30) + 2);
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
    // 秒數從文件讀(owner 2026-08-12 把持續時間從 10 秒改成 6 秒)。
    step(world, Math.round(berserkDurationFromDoc() * 30) + 2);
    expect(isBerserk(world, id)).toBe(false);
    world.step(intents);
    const nav2 = world.nav.get(id)!;
    expect(nav2.order?.kind).toBe("move");
  });
});

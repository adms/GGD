/**
 * 職業限定閘 —— 行為守衛 (owner 2026-07-30 的四類傳說武器).
 *
 * ---------------------------------------------------------------------------
 * 為什麼守衛長這樣
 * ---------------------------------------------------------------------------
 * 這個功能最容易的壞法**不會**讓任何既有測試變紅:
 *   ① 欄位加了、Zod 收得下、後台編得動,但 `fireHooks` 從來沒讀它 ——
 *      每個英雄都吃得到「近戰專用」的擴散(失敗形狀②的鏡像)。
 *   ② 讀了,但方向反了 / 永遠回 true —— 閘看起來存在,實際上人人通過。
 *   ③ 只在「發卡」時擋(#189 的 `requiresAttackType` 就是這樣),道具一旦進了
 *      背包就人人有效 —— 而 owner 要的四類全部是**進了背包之後**的行為。
 *
 * 所以底下沒有一條斷言道具文件裡有哪個欄位(失敗形狀⑦)。每一條都是:
 *   **同一件出貨道具 + 同一段 `SimWorld.step()` + 只換英雄**,
 * 然後比較玩家看得到的數字 —— 敵人的 hp、自己的 hp、護盾池、座標。
 *
 * 授予一律走 `economy/shop.grantItemFree`(三選一 / 寶玉 / 任務獎勵共用的入口),
 * 不是測試自己 `attachSource` —— 失敗形狀⑤。這一點是有代價的:它同時證明了
 * `shop.ts` 真的把 `def.passive` 與 `def.auras` 轉發到 source 上。
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄(每一條都實跑過)
 * ---------------------------------------------------------------------------
 * (數字是實跑量到的,不是估的。19 條全綠 → 改壞 → 記下紅幾條 → 還原 → 再確認全綠。)
 *
 * M1 `requirement.ts satisfiesRequirement` 直接 `return true`(閘永遠通過)
 *    → 7 紅。四類的「不符合的英雄」那半邊全部倒下,加上兩軸閘的 melee-INT、
 *      "reduced" 的倍率、以及吉他的遠程隊友。
 * M2 `hooks.ts` 拿掉 `if (scale === 0) continue;`
 *    → 只有 2 紅(坦克衝刺的兩條)。
 *      ⚠️ 這一條**弱**,而且原因值得寫下來:拿掉之後 `scaleEffects(effects, 0)`
 *      仍然會把傷害/治療/護盾的數字全部乘成 0,所以「擋住」在數字上看起來還是
 *      擋住了。真正漏出來的是 `scaleEffects` **不縮放**的那些 kind —— `dash`
 *      就是一個,所以只有衝鋒重脛甲會紅。另外兩個沒被斷言的後果是內部冷卻被
 *      白白燒掉、以及 `world.rng` 被多抽一次(決定性沒壞,但節奏會變)。
 *      要把這條補強就得斷言 rng 序列或 ICD 消耗 —— 留給後續,不假裝已經蓋到。
 * M3 `hooks.ts` 把 `scaleEffects(hook.effects, scale)` 改回 `hook.effects`
 *    → 1 紅:賢者護身符 "reduced" 那條(非法師拿到滿額護盾而不是 40%)。
 *      M3 對其他 18 條**全綠** —— 這正是為什麼 "reduced" 必須要有自己一條。
 * M4 `shop.ts` 三個 attachSource 拿掉 `auras: def.auras`
 *    → 3 紅:戰旗/復仇之袍/惡魔吉他(算出來了但沒送到 —— 失敗形狀②本體)。
 * M5 `requirement.ts` 把 `carrierPrimaryStat` 改成永遠回 null
 *    → 3 紅:賢者護身符兩條 + 坦克衝刺的 melee-INT 那條。attackType 那半邊
 *      全部還是綠的,所以這條突變單獨證明了**第二根軸真的在被讀**。
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rebuildAllIndexes } from "../../content/node/index";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { fireHooks } from "../effects/hooks";
import { grantItemFree } from "../economy/shop";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { registerAll } from "../../content/registries";
import { Champions, Items } from "./registry";
import { describeRequirement, itemRequirementLabels, requirementScale } from "./requirement";
import type { PrimaryAttr } from "../stats/attributes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";

// ---------------------------------------------------------------------------
// 真實英雄 —— 四個**格子**,由註冊表挑代表,⛔ 不是四個寫死的 id
//
// ⚠️ 2026-08-13:owner 把 41 位沒上架的英雄搬進 `content/_legacy/champions/`
// (那個目錄不在 `COLLECTION_NAMES` 裡,引擎讀不到它),而原本寫死在這裡的
// `godie-h022`(涅吉)與 `godie-e00t`(貞子)剛好都在那一批 —— 四條測試直接
// 以 `content not registered` 倒下。
//
// ⭐ 但寫死 id 的毛病不是「挑錯人」。這幾條測試從來**不在乎是誰**:它們要的是
//    「一位近戰·智力的英雄」這個格子存不存在、閘讀不讀得到它。所以現在由註冊表
//    挑代表(排序後第一位 = 決定性,不動 rng),名單再怎麼增減都不用回來改。
// ---------------------------------------------------------------------------
let MELEE_STR: ChampionId;
let MELEE_INT: ChampionId;
let RANGED_INT: ChampionId;
let RANGED_AGI: ChampionId;

/**
 * 出貨名單裡 `attackType × primaryStat` 那一格的代表 —— 排序後的第一位。
 *
 * ⛔ 空的格子**不可以**靜默略過。這個閘的兩根軸如果有一格沒有人住,
 * 「限近戰·智力英雄」這條規則就再也匹配不到任何人 —— 那是一個要拿去問 owner 的
 * **內容**問題(這條閘還該不該存在),不是這支測試該繞過去的事。所以它丟例外,
 * 而且訊息裡直接寫出是哪一格空了。
 */
function pickChampion(attackType: "melee" | "ranged", primary: PrimaryAttr): ChampionId {
  const hit = Champions.ids()
    .filter((id) => {
      const c = Champions.tryGet(id);
      return c?.attackType === attackType && c?.attributes?.primary === primary;
    })
    .sort()[0];
  if (hit === undefined) {
    throw new Error(
      `出貨英雄名單裡沒有任何 ${attackType}/${primary} 的英雄 —— 職業限定閘的這一格` +
        `是空的,「限${attackType}·${primary}」這種需求寫得出來卻永遠匹配不到人。`,
    );
  }
  return hit;
}

const CLEAVER = "cleaver-of-the-warden" as ItemId;
const AMULET = "sage-ward-amulet" as ItemId;
const GREAVES = "bulwark-charge-greaves" as ItemId;
const CROSSBOW = "piercer-crossbow" as ItemId;
const BANNER = "godie-i02h" as ItemId;
const ROBE = "godie-i02j" as ItemId;
const GUITAR = "godie-i02k" as ItemId;

const C = SKELETON_ARENA.zones[0]!.center;

/**
 * 出貨的 `content/` 樹,索引在**暫存目錄**重建。
 *
 * 為什麼不直接讀 repo 的 `content/`:`_index.json` 是 `pnpm content:build` 的
 * 產物,而這一輪新增了 4 份道具文件 —— 在 owner 跑 content:build 之前,repo 裡
 * 的索引還看不到它們,`ContentLoader` 會直接丟 missing-ref。在暫存目錄重建索引
 * 讓這條守衛**現在就能跑**,而且一個位元組都不會寫回 repo(assets 273MB 不複製,
 * 索引重建只讀 JSON)。
 */
let tempRoot = "";

afterAll(() => {
  // ~10 MB per run; without this every CI run leaves a copy behind.
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

beforeAll(async () => {
  for (const r of [Champions, Items]) r.clear();
  const src = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
  tempRoot = mkdtempSync(join(tmpdir(), "ggd-content-"));
  const dir = join(tempRoot, "content");
  cpSync(src, dir, {
    recursive: true,
    filter: (p) => !p.includes(`${"/"}assets`),
  });
  rebuildAllIndexes(dir, { write: true });
  registerAll((await new ContentLoader(new FsContentSource(dir)).load()).store);
  // 註冊表填好之後才挑得到人 —— 四個格子各挑一位代表。
  MELEE_STR = pickChampion("melee", "STR");
  MELEE_INT = pickChampion("melee", "INT");
  RANGED_INT = pickChampion("ranged", "INT");
  RANGED_AGI = pickChampion("ranged", "AGI");
});

interface Spawned {
  world: SimWorld;
  hero: EntityId;
  foes: EntityId[];
  allies: EntityId[];
}

/**
 * 一名英雄 + N 個敵人(同一個決鬥區,貼在旁邊)+ M 個隊友。
 * `dx` 讓呼叫端把某個單位放遠一點,用來測光環半徑。
 */
function stage(
  championId: ChampionId,
  opts: { foes?: number; allies?: { championId: ChampionId; dx: number }[] } = {},
): Spawned {
  const world = new SimWorld(SKELETON_ARENA, 1);
  let seat = 0;
  const hero = spawnChampion(world, {
    championId,
    seatId: asSeatId(seat++),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  const foes: EntityId[] = [];
  for (let i = 0; i < (opts.foes ?? 0); i++) {
    foes.push(
      spawnChampion(world, {
        championId: MELEE_STR,
        seatId: asSeatId(seat++),
        teamId: asTeamId(1),
        // 1.0 / 2.0 —— 都在裂地巨斧 3.5 的擴散半徑內
        pos: { x: C.x + 1 + i, z: C.z },
        zone: 0,
      }),
    );
  }
  const allies: EntityId[] = [];
  for (const a of opts.allies ?? []) {
    allies.push(
      spawnChampion(world, {
        championId: a.championId,
        seatId: asSeatId(seat++),
        teamId: asTeamId(0),
        pos: { x: C.x + a.dx, z: C.z },
        zone: 0,
      }),
    );
  }
  // ⚠️ 一定要先跑一 tick:`damageArea` 走 `enemiesInCircle` → `world.grid`,
  // 而 broad-phase 是在 `SimWorld.step` 的開頭才 rebuild 的。少了這一步,
  // 擴散在**第一 tick** 找不到任何人,而那會讓「近戰擴散」那條測試以
  // 「濺射 0」的形式假紅 —— 看起來像閘擋住了,其實是格子還沒建。
  world.step(new Map());
  return { world, hero, foes, allies };
}

const hp = (w: SimWorld, id: EntityId): number => w.health.get(id)!.hp;
const shieldPool = (w: SimWorld, id: EntityId): number =>
  (w.health.get(id)?.shields ?? []).reduce((s, x) => s + x.amount, 0);

/** 打一發普攻的 on-hit hook,然後讓傷害佇列真的結算。 */
function swing(w: SimWorld, attacker: EntityId, target: EntityId): void {
  fireHooks(w, attacker, "onBasicAttack", target);
  w.step(new Map());
}

// ===========================================================================
// ① 近戰專用擴散 —— 裂地巨斧
// ===========================================================================
describe("近戰專用擴散 · 裂地巨斧", () => {
  /** 主要目標旁邊那一個敵人掉了多少血 = 擴散真的濺到了。 */
  function splashTaken(championId: ChampionId): number {
    const s = stage(championId, { foes: 2 });
    expect(grantItemFree(s.world, s.hero, CLEAVER)).toBeGreaterThanOrEqual(0);
    const before = hp(s.world, s.foes[1]!);
    swing(s.world, s.hero, s.foes[0]!);
    return before - hp(s.world, s.foes[1]!);
  }

  it("★ 近戰英雄拿了 → 旁邊那個敵人真的掉血(擴散發生了)", () => {
    expect(splashTaken(MELEE_STR)).toBeGreaterThan(0);
  });

  it("★ 遠程英雄拿同一把 → 旁邊那個敵人一滴血都沒掉", () => {
    // 閘永遠通過 / 沒有被消費的實作,這裡會跟上面一樣 > 0。
    expect(splashTaken(RANGED_AGI)).toBe(0);
  });
});

// ===========================================================================
// ② 射手百分比傷害 —— 穿甲弩
// ===========================================================================
describe("射手百分比傷害 · 穿甲弩", () => {
  function targetTaken(championId: ChampionId): number {
    const s = stage(championId, { foes: 1 });
    expect(grantItemFree(s.world, s.hero, CROSSBOW)).toBeGreaterThanOrEqual(0);
    const before = hp(s.world, s.foes[0]!);
    swing(s.world, s.hero, s.foes[0]!);
    return before - hp(s.world, s.foes[0]!);
  }

  it("★ 遠程英雄拿了 → 目標吃到額外真實傷害", () => {
    expect(targetTaken(RANGED_AGI)).toBeGreaterThan(0);
  });

  it("★ 近戰英雄拿同一把 → 目標完全沒吃到", () => {
    expect(targetTaken(MELEE_STR)).toBe(0);
  });
});

// ===========================================================================
// ③ 坦克衝刺 —— 衝鋒重脛甲(兩根軸同時生效的那一件)
// ===========================================================================
describe("坦克衝刺 · 衝鋒重脛甲", () => {
  /** 施放技能之後 10 tick 走了多遠 —— dash 是位移,所以量座標。 */
  function dashDistance(championId: ChampionId): number {
    const s = stage(championId);
    expect(grantItemFree(s.world, s.hero, GREAVES)).toBeGreaterThanOrEqual(0);
    const p0 = { ...s.world.transform.get(s.hero)!.pos };
    fireHooks(s.world, s.hero, "onAbilityCast", s.hero);
    for (let i = 0; i < 10; i++) s.world.step(new Map());
    const p1 = s.world.transform.get(s.hero)!.pos;
    return Math.hypot(p1.x - p0.x, p1.z - p0.z);
  }

  it("★ 近戰·力量英雄 → 真的衝出去了", () => {
    expect(dashDistance(MELEE_STR)).toBeGreaterThan(1);
  });

  it("★ 遠程英雄(attackType 那根軸不合)→ 原地不動", () => {
    expect(dashDistance(RANGED_INT)).toBeLessThan(0.01);
  });

  it("★ 近戰但主屬性是智力 → 原地不動(證明第二根軸真的在被讀)", () => {
    // 這一條是 `primaryStat` 唯一的擋箭牌:MELEE_INT 通過了 attackType 那半邊,
    // 只被 STR 擋下來。把 `carrierPrimaryStat` 改成永遠回 null 就只有這裡紅。
    expect(dashDistance(MELEE_INT)).toBeLessThan(0.01);
  });
});

// ===========================================================================
// ④ 法師保命 —— 賢者的護身符("reduced" 模式,唯一走這條分支的出貨內容)
// ===========================================================================
describe("法師保命 · 賢者的護身符(不符合 = 效果打折,不是完全不觸發)", () => {
  function shieldGained(championId: ChampionId): number {
    const s = stage(championId, { foes: 1 });
    expect(grantItemFree(s.world, s.hero, AMULET)).toBeGreaterThanOrEqual(0);
    fireHooks(s.world, s.hero, "onDamageTaken", s.foes[0]!);
    s.world.step(new Map());
    return shieldPool(s.world, s.hero);
  }

  it("★ 智力英雄 → 拿到護盾", () => {
    expect(shieldGained(RANGED_INT)).toBeGreaterThan(0);
  });

  it("★ 非智力英雄 → 仍然拿到護盾,但明顯比較小(40%)", () => {
    const full = shieldGained(RANGED_INT);
    const cut = shieldGained(MELEE_STR);
    // 「完全不觸發」的實作會讓這裡是 0 —— 那是 "block",不是這件道具要的語意。
    expect(cut).toBeGreaterThan(0);
    expect(cut).toBeLessThan(full);
    // 兩位英雄的 ap 不同,所以不能斷言剛好 0.4 倍;斷言它被砍到不足一半即可,
    // 而「沒有縮放」的實作(M3)會讓 cut/full 由三圍決定並輕易超過 0.5。
    expect(cut / full).toBeLessThan(0.5);
  });

  it("★ 同一份 requirement 兩種模式給出不同的倍率(reduced 不是 block 的別名)", () => {
    const s = stage(MELEE_STR);
    const req = { primaryStat: "INT" as const, onMismatch: "reduced" as const, mismatchScale: 0.4 };
    expect(requirementScale(s.world, s.hero, req)).toBeCloseTo(0.4);
    expect(requirementScale(s.world, s.hero, { ...req, onMismatch: "block" })).toBe(0);
    expect(requirementScale(s.world, s.hero, { primaryStat: "STR" })).toBe(1);
  });
});

// ===========================================================================
// ⑤ 三件 tier 5「積分獎勵」—— 描述承諾的機制現在真的存在
// ===========================================================================
describe("tier 5 積分獎勵 · 光環真的送到隊友身上", () => {
  it("★ 戰旗:半徑內的隊友攻擊力真的變高,半徑外的沒有", () => {
    const s = stage(MELEE_STR, {
      allies: [
        { championId: MELEE_STR, dx: 2 }, // 光環內 (9.17)
        { championId: MELEE_STR, dx: 20 }, // 光環外
      ],
    });
    const [near, far] = s.allies as [EntityId, EntityId];
    s.world.step(new Map());
    const adBefore = s.world.stats.get(near)!.final.ad;
    expect(grantItemFree(s.world, s.hero, BANNER)).toBeGreaterThanOrEqual(0);
    s.world.step(new Map());
    // 同一位英雄、同一場、只差有沒有站在旗子旁邊。
    expect(s.world.stats.get(near)!.final.ad).toBeGreaterThan(adBefore);
    expect(s.world.stats.get(far)!.final.ad).toBe(adBefore);
  });

  it("★ 復仇之袍:隊友被打時,攻擊者真的掉血(反擊發生了)", () => {
    const s = stage(MELEE_STR, { foes: 1, allies: [{ championId: MELEE_STR, dx: 2 }] });
    const ally = s.allies[0]!;
    const foe = s.foes[0]!;
    expect(grantItemFree(s.world, s.hero, ROBE)).toBeGreaterThanOrEqual(0);
    s.world.step(new Map()); // 讓 auraSystem 把光環貼到隊友身上
    const foeBefore = hp(s.world, foe);
    fireHooks(s.world, ally, "onDamageTaken", foe);
    s.world.step(new Map());
    expect(hp(s.world, foe)).toBeLessThan(foeBefore);
  });

  it("★ 惡魔吉他:光環內的【近戰】隊友普攻回血,【遠程】隊友不回", () => {
    const s = stage(MELEE_STR, {
      foes: 1,
      allies: [
        { championId: MELEE_STR, dx: 2 }, // 近戰
        { championId: RANGED_AGI, dx: 3 }, // 遠程
      ],
    });
    const [meleeAlly, rangedAlly] = s.allies as [EntityId, EntityId];
    expect(grantItemFree(s.world, s.hero, GUITAR)).toBeGreaterThanOrEqual(0);
    s.world.step(new Map());

    // 先把兩位隊友打傷,否則滿血時 heal 是看不見的。
    for (const a of [meleeAlly, rangedAlly]) s.world.health.get(a)!.hp -= 200;
    const m0 = hp(s.world, meleeAlly);
    const r0 = hp(s.world, rangedAlly);

    swing(s.world, meleeAlly, s.foes[0]!);
    swing(s.world, rangedAlly, s.foes[0]!);

    const meleeGain = hp(s.world, meleeAlly) - m0;
    const rangedGain = hp(s.world, rangedAlly) - r0;

    // 閘掛在光環投影出去的 hook 上,而那份 hook 的 owner 是**站在圈內的隊友**,
    // 不是拿吉他的人 —— 這一條就是在證明那件事。
    //
    // ⚠️ 遠程那邊不能斷言「剛好 0」:兩 tick 的 healthRegen 會給他大約 +0.065。
    // 吸血一次是攻擊力的 30%(數十點),所以 <1 這個界線分得開「回了一點血」與
    // 「完全沒吸血」,而且不會因為 regen 調整就假紅。
    expect(meleeGain).toBeGreaterThan(10);
    expect(rangedGain).toBeLessThan(1);
  });

  it("★ 三件都不再是空的(mods=0 hooks=0 的原始缺陷不會悄悄回來)", () => {
    for (const id of [BANNER, ROBE, GUITAR]) {
      const def = Items.get(id);
      const payload =
        (def.modifiers?.length ?? 0) + (def.passive?.length ?? 0) + (def.auras?.length ?? 0);
      expect(payload, `${id} 又變回沒有任何效果的文件`).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
// ⑥ 閘要看得見 —— 描述文字由同一個物件推導,不是手打的
// ===========================================================================
describe("職業限定閘的可見性", () => {
  it("★ 每一件帶閘的道具都生得出條件文字(玩家看得到為什麼吃不到)", () => {
    for (const id of [CLEAVER, CROSSBOW, GREAVES, AMULET, GUITAR]) {
      const labels = itemRequirementLabels(Items.get(id));
      expect(labels.length, `${id} 帶了閘卻生不出任何條件文字`).toBeGreaterThan(0);
    }
  });

  it("★ 沒有閘的道具不會憑空長出條件文字", () => {
    expect(itemRequirementLabels(Items.get(BANNER))).toEqual([]);
    expect(describeRequirement(undefined)).toBeNull();
    expect(describeRequirement({})).toBeNull();
    expect(describeRequirement({ onMismatch: "reduced" })).toBeNull();
  });

  it("★ 文字說得出兩根軸,也說得出兩種模式", () => {
    expect(describeRequirement({ attackType: "melee" })).toBe("限近戰英雄（其他英雄無效）");
    expect(describeRequirement({ attackType: "melee", primaryStat: "STR" })).toBe(
      "限近戰·力量英雄（其他英雄無效）",
    );
    expect(describeRequirement({ primaryStat: "INT", onMismatch: "reduced", mismatchScale: 0.4 })).toBe(
      "限智力英雄（其他英雄僅 40% 效果）",
    );
    // 「兩種模式讀起來一樣」就等於玩家分不出這兩件道具 —— 那個閘就白做了。
    expect(describeRequirement({ primaryStat: "INT", onMismatch: "reduced" })).not.toBe(
      describeRequirement({ primaryStat: "INT" }),
    );
  });
});

// ===========================================================================
// ⑦ 沒有閘的東西一個都不能被影響(這個功能的 blast radius 必須是零)
// ===========================================================================
describe("沒有 requires 的內容完全不受影響", () => {
  it("★ 未知職業(非英雄 / 無文件)一律通過,不會靜默變成空池", () => {
    const s = stage(MELEE_STR);
    // 999 不是任何實體 → championAttackType/primaryStat 都是 null → 全部通過。
    const ghost = 999 as EntityId;
    expect(requirementScale(s.world, ghost, { attackType: "ranged" })).toBe(1);
    expect(requirementScale(s.world, ghost, { primaryStat: "INT" })).toBe(1);
  });

  it("★ 出貨內容裡帶 requires 的道具就是這一輪加的那幾件,沒有誤傷別人", () => {
    const gated = Items.ids()
      .filter((id) => itemRequirementLabels(Items.get(id)).length > 0)
      .sort();
    expect(gated).toEqual([AMULET, GREAVES, CLEAVER, GUITAR, CROSSBOW].sort());
  });
});

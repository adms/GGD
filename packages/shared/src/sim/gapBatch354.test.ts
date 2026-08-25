/**
 * GH#354 —— **G3 · G4 · G5** 三個機制的共同守衛。
 *
 * 三個一起放，因為 owner 2026-08-17 的 20 件 [EX解放] 是同一批內容，而三條各自
 * 只有一條承重的線（第零守則②：一個功能一條守衛，⛔ 不是每個分支各一條）。
 *
 * | | 機制 | 擋住幾件 | 承重的那一行 |
 * |---|---|---:|---|
 * | G3 | `permanentScope:"round"` | 5 | `clearRoundScoped` 真的拔掉它，而**別的永久來源不動** |
 * | G4 | 條件的第二運算元 | 3 | 右手邊真的讀到**另一個主體／屬性**當下的值 |
 * | G5 | `capRaisePct` | 3 | 折成的高度是**一般上限 ×(1+v)**，而且仍被 `unlocked` 夾住 |
 *
 * ⛔ 一個出貨數字都不寫進斷言（第二守則）：攻速的 4.0 / 10.0 住在
 * `content/config/stat-caps.json`，這裡一律從 `capFor` 推導。
 *
 * 突變紀錄（承重的那一條，一批一條）：
 * `statPipeline.ts` 的 `case ModOp.CapRaisePct` 折算式改成 `m.value`（＝當成絕對式）
 * → G5 第①條當場紅（+25% 變成「抬到 0.25」，比一般上限低，是 no-op）；改回。
 *
 * ⚠️⚠️ **這一支點名的 content/ 檔是產生器的產物,⛔ 不是可以直接編的東西。**
 * 改之前先查它是誰的:`bash scripts/genguard.sh content/config/stat-caps.json`
 *   · `content/config/stat-caps.json` 是 **statcaps:build** 的產物,而且住在**產物隔離區**
 *     (chmod 444 —— 用檔案 API 直寫會吃 PermissionError,⛔ 不是靜默成功)。
 *   · 要動它:改**來源**再 `bash scripts/genrun.sh statcaps:build`。⛔ 手改出貨 JSON 會被下一次
 *     sync 打回來,而那個「又紅了」看起來像**新的**錯(owner 2026-08-24:「發生上百次」)。
 *   · ⭐ **精確範圍**(逐支讀過那支產生器,⛔ 不是照抄稽核的一句話):
 *     gen_stat_caps.ts::capsJson() **只覆寫 DERIVED_CAP_STATS 那 7 格**
 *     (maxHealth/maxMana/healthRegen/manaRegen/ad/armor/mr)的 base/unlocked;
 *     as/ap/lifesteal/cdr/range/ms 這 6 格是**讀舊值原封寫回** ⇒ 值會留下來,
 *     ⛔ 但仍然要走 genrun,⛔ 不要 chmod +w 直接改產物。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { registerAll } from "../content/registries";
import { Augments, Champions, Items, LootTables } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { clearRoundScoped } from "./clearPools";
import { attachSource, recomputeStats } from "./stats/statPipeline";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { capFor, DEFAULT_STAT_CAPS } from "./statCaps";
import { evaluateCondition, type EffectCondition } from "./content/condition";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
let champion: ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Items, Augments, LootTables]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  champion = Champions.ids().slice().sort()[0]!;
});

function hero(world: SimWorld, seat = 0, team = 0): EntityId {
  const id = spawnChampion(world, {
    championId: champion,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: SKELETON_ARENA.zones[0]!.center.x + seat * 2, z: SKELETON_ARENA.zones[0]!.center.z },
    zone: 0,
  });
  recomputeStats(world, id);
  return id;
}

/** 掛一份來源。⛔ 走 `attachSource` —— 出貨路徑用的同一支。 */
function give(
  world: SimWorld,
  id: EntityId,
  sourceId: string,
  modifiers: { stat: Stat; op: ModOp; value: number }[],
  roundScoped = false,
): void {
  attachSource(world, id, {
    id: sourceId,
    kind: "buff",
    modifiers,
    ...(roundScoped ? { roundScoped: true } : {}),
  });
  recomputeStats(world, id);
}

describe('G3 —— 回合作用域（`permanentScope:"round"`）', () => {
  it("★ 回合開始時被拔掉，⛔ 而整場的那一份原封不動", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    const id = hero(w);
    const before = w.stats.get(id)!.sources.length;
    give(w, id, "buff:round#1", [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 10 }], true);
    give(w, id, "buff:match#1", [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 10 }]);
    expect(clearRoundScoped(w, id), "拔掉的份數不對").toBe(1);
    const left = w.stats.get(id)!.sources.map((s) => s.id);
    expect(left, "整場那一份也被拔掉了 —— 那會清空所有道具被動").toContain("buff:match#1");
    expect(left).not.toContain("buff:round#1");
    // 英雄自己原本帶的來源（天生技等）一份都不可以少。
    expect(left.length).toBe(before + 1);
    // 冪等：同一回合重入（skipPhase / failsafe）不會再拔到東西。
    expect(clearRoundScoped(w, id)).toBe(0);
  });

  it("⛔ 沒有 stats 的身體不會爆（金幣、花、投射物）", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    expect(clearRoundScoped(w, 9999 as EntityId)).toBe(0);
  });
});

describe("G4 —— 條件的第二運算元", () => {
  function ask(w: SimWorld, self: EntityId, target: EntityId, cond: EffectCondition): boolean {
    return evaluateCondition(w, cond, { self, target });
  }

  it("★ 右手邊真的是**對方那一刻的讀數**（#67 兎月【下剋上】）", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    const me = hero(w, 0, 0);
    const you = hero(w, 1, 1);
    // 兩位是同一位英雄，所以基礎攻擊力相同 —— 差距完全由這一份來源造出來。
    give(w, you, "gear", [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 50 }]);
    const weaker: EffectCondition = {
      kind: "stat",
      subject: "self",
      stat: "ad",
      op: "<",
      value: 0,
      other: { subject: "target" },
    };
    expect(ask(w, me, you, weaker), "比對方弱卻讀成 false").toBe(true);
    expect(ask(w, you, me, weaker), "比對方強卻讀成 true —— 主體抄反了").toBe(false);
  });

  it("⭐ 倍率就是階級的來源：同一條式子換一個 scale 就是下一階", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    const me = hero(w, 0, 0);
    const you = hero(w, 1, 1);
    give(w, you, "gear", [{ stat: Stat.AttackDamage, op: ModOp.PercentAdd, value: 1 }]); // 對方是我的兩倍
    const tier = (scale: number): EffectCondition => ({
      kind: "stat",
      subject: "self",
      stat: "ad",
      op: "<",
      value: 0,
      other: { subject: "target", scale },
    });
    expect(ask(w, me, you, tier(0.8)), "我是對方的一半，×0.8 應該成立").toBe(true);
    expect(ask(w, me, you, tier(0.4)), "×0.4 不該成立 —— scale 沒有被讀到").toBe(false);
  });

  it("⭐ 同一主體、跨屬性（#55 噬魂者「攻擊力與 AP 較高者」）", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    const me = hero(w);
    give(w, me, "mix", [{ stat: Stat.AbilityPower, op: ModOp.Flat, value: 5000 }]);
    const adWins: EffectCondition = {
      kind: "stat",
      subject: "self",
      stat: "ad",
      op: ">=",
      value: 0,
      other: { subject: "self", stat: "ap" },
    };
    expect(ask(w, me, me, adWins), "AP 明顯比較高卻判給了攻擊力").toBe(false);
  });

  it("⛔ 沒有 target 時整條是 false，⛔ 不是「當成 0 再比一次」", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    const me = hero(w);
    const cond: EffectCondition = {
      kind: "stat",
      subject: "self",
      stat: "ad",
      op: ">",
      value: 0,
      other: { subject: "target" },
    };
    // 當成 0 的話「我的攻擊力 > 0」會對著一個不存在的對手回 true。
    expect(evaluateCondition(w, cond, { self: me })).toBe(false);
  });

  it("`other` 缺席 = 今天（右手邊就是那個常數）", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    const me = hero(w);
    const c = (value: number): EffectCondition => ({
      kind: "stat",
      subject: "self",
      stat: "ad",
      op: ">=",
      value,
    });
    expect(ask(w, me, me, c(0))).toBe(true);
    expect(ask(w, me, me, c(1e6))).toBe(false);
  });
});

describe("G5 —— 百分比式解鎖上限（`capRaisePct`）", () => {
  /**
   * 一條**真的還有解鎖空間**的屬性（`unlocked > base`）。
   * ⛔ 不寫死攻速：那是出貨資料，而數值是 owner 每週在調的東西。
   */
  const STATS = Object.keys(DEFAULT_STAT_CAPS) as Stat[];
  const raisable = STATS.find((s) => {
    const c = capFor(DEFAULT_STAT_CAPS, s);
    return Number.isFinite(c.unlocked) && c.unlocked > c.base && c.base > 0;
  });

  /** 掛一個一定頂到天花板的加成，量到的 `final` 就**是**那個天花板。 */
  function ceilingWith(stat: Stat, raise: { op: ModOp; value: number }[]): number {
    const w = new SimWorld(SKELETON_ARENA, 1);
    const id = hero(w);
    give(w, id, "raise", [
      ...raise.map((r) => ({ stat, op: r.op, value: r.value })),
      { stat, op: ModOp.Flat, value: 1e9 },
    ]);
    return w.stats.get(id)!.final[stat];
  }

  it("★ ① 折成的高度是**一般上限 ×(1+v)**，⛔ 不是那個小數本身", () => {
    expect(raisable, "出貨的 caps 一條解鎖空間都沒有 —— 這一族機制整個是 no-op").toBeDefined();
    const stat = raisable!;
    const { base, unlocked } = capFor(DEFAULT_STAT_CAPS, stat);
    // 挑一個**確定落在 base 與 unlocked 之間**的成數，量到的才是折算式本身
    // —— ⛔ 不會被 `unlocked` 的夾取蓋掉（那會讓錯的折算式也過）。
    const pct = Math.min(0.25, (unlocked / base - 1) / 2);
    expect(pct, "這條屬性的空間太窄，換一條來驗").toBeGreaterThan(0);
    expect(ceilingWith(stat, [{ op: ModOp.CapRaisePct, value: pct }])).toBeCloseTo(
      base * (1 + pct),
      6,
    );
  });

  it("② 仍然被 `unlocked` 硬夾住 —— 百分比不是繞過操作者那一格的後門", () => {
    const stat = raisable!;
    const { unlocked } = capFor(DEFAULT_STAT_CAPS, stat);
    expect(ceilingWith(stat, [{ op: ModOp.CapRaisePct, value: 2 }])).toBeCloseTo(unlocked, 6);
  });

  it("③ 與絕對式共用同一個 max —— 兩份掛著時拿高的那一個，⛔ 不是相加", () => {
    const stat = raisable!;
    const { base, unlocked } = capFor(DEFAULT_STAT_CAPS, stat);
    const lowAbs = base + (unlocked - base) * 0.1;
    const highPct = Math.min(0.5, (unlocked / base - 1) * 0.8);
    const want = base * (1 + highPct);
    expect(want, "夾具挑的兩個高度沒有分出高下").toBeGreaterThan(lowAbs);
    const got = ceilingWith(stat, [
      { op: ModOp.CapRaise, value: lowAbs },
      { op: ModOp.CapRaisePct, value: highPct },
    ]);
    expect(got, "相加了 —— 兩個累積器而不是一個").toBeCloseTo(want, 6);
  });
});

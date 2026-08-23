/**
 * #543 —— owner 點名的三支驗收技能，它們的**動畫特效**在 sim 裡真的排得出班表。
 *
 * owner 2026-08-22：「Saber約束勝利之劍(翻滾光束), 依文世界終結(圓周噴發大冰塊),
 * 莉娜龍破斬(一直線火球衝擊波後目的地火焰大爆炸) 都是動畫特效」。
 *
 * ⭐ 讀的是**出貨的那三份**（`ContentLoader` + `registerAll`，級距已解析），
 * ⛔ 不是手寫夾具 —— 失敗形態⑤（被測的不是出貨的那個）就是這一族最會犯的錯：
 * 一份夾具寫 `flat: 40` 永遠會掉血，而出貨檔寫 `damageTier` 沒被解析時是 0。
 *
 * ⛔ 一條斷言都沒有抄出貨數值（第二守則「驗機制不驗數字」）：兩條比的都是
 * **同一次施放的另一半** —— 一條比「施放當下沒有人掉血、之後才有」，
 * 一條比「路徑碰不到的那個人被落點爆炸打到，而且比路徑上的那個人晚」。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）─────────────────────────────────
 *  · ⭐ 承重線 —— `sim/effects/spawnModelFx.ts` 的 `q.push(wave)`（`onTouch` 那一串）
 *    整行刪掉（＝模型照飛、⛔ 沿路一個人都打不到，畫面上跟正確的一模一樣）
 *      → 紅：「04-03 龍破斬 的 spawnModelFx 一個人都沒打到 ——
 *        班表沒排或沒付款: expected -1 to be greater than -1」
 *
 * ⚠️ 第一版的三個座標**擋不住這個突變**（它照樣全綠），而兩個原因都是失敗形態③：
 * 場上的人開著 `combatActive` 會互相普攻，而龍破斬那個人站的位置正好在落點
 * 爆炸的邊緣上。⇒ 座標與那一格 `combatActive` 都是**斷言的一部分**，見下面兩段。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { spawnChampion } from "../sim/spawnChampion";
import { normalizeCombatEnv } from "../sim/combatEnv";
import { runEffects } from "../sim/effects/effectRunner";
import { DEFAULT_AUTO_ENGAGE } from "../sim/combatFeel";
import type { EffectContext, EffectDef } from "../sim/effects/effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
const CASTER: ChampionId = "godie-hjai" as ChampionId;

/**
 * 三支標本：`onPath` = 站在模型路徑上的人，`offPath` = **只有落點圓**涵蓋得到的人。
 *
 * ⚠️ 每一個座標都是為了**排掉另一個解釋**挑的，⛔ 不是隨手擺的：
 *   · 龍破斬 `onPath` 站 3（⛔ 不是 4）—— 落點在 12、爆炸半徑「大」＝8，
 *     站 4 的人離落點正好 8 ⇒ 他會被**落點爆炸**打到，於是 `onTouch` 整條線
 *     刪掉這條斷言照樣綠（失敗形態③）。
 *   · 世界終結 `onPath` 站**側面**（0,3）—— 那一支保留著原本的 `spawnProjectile`，
 *     它沿面向飛，站正前方的人是被**投射體**打到的，⛔ 不是圓周冰塊。
 */
const SUBJECTS = [
  { id: "godie-h020.e", label: "04-03 龍破斬", onPath: { x: 3, z: 0 }, offPath: { x: 12, z: 5 } },
  { id: "godie-e002.e", label: "20-03 約束與勝利之劍", onPath: { x: 5, z: 0 } },
  { id: "godie-n01g.r", label: "42-04 世界終結", onPath: { x: 0, z: 3 } },
] as const;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** 出貨的那一份 `effects`（級距已由 `registerAll` 解析）。 */
function shipped(id: string): readonly EffectDef[] {
  const def = Abilities.tryGet(id as AbilityId);
  expect(def, `${id} 不在註冊表裡 —— 標本被改名或載入失敗了`).toBeDefined();
  return def!.effects ?? [];
}

/**
 * 施放一次，回傳每個身體**第一次**掉血是在第幾個 tick。
 * `-1` = 從頭到尾沒掉過；`-2` = 在 `runEffects` 當下就掉了（＝根本沒排班表）。
 */
function cast(id: string, spots: readonly { x: number; z: number }[], ticks: number): number[] {
  const world = new SimWorld(SKELETON_ARENA, 1);
  // ⛔ `combatActive` 留 false —— 開著它,場上的人會互相普攻,於是「有人掉血」
  //    這條斷言對**壞掉的實作**也會過（失敗形態③）。`delayedSystem` 只看
  //    `settledZones`,不看這一格,所以班表照樣付款。
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  world.combatFeel = { ...world.combatFeel, autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: false } };
  const caster = spawnChampion(world, {
    championId: CASTER, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: C.x, z: C.z }, zone: 0,
  });
  const bodies: EntityId[] = spots.map((s, i) =>
    spawnChampion(world, {
      championId: CASTER, seatId: asSeatId(i + 1), teamId: asTeamId(1),
      pos: { x: C.x + s.x, z: C.z + s.z }, zone: 0,
    }),
  );
  world.step(new Map());
  // `path: "forward"` 讀的就是這一格,所以擺在施放的前一刻。
  world.transform.get(caster)!.facing = { x: 1, z: 0 };
  const hps = bodies.map((b) => world.health.get(b)!);
  const base = hps.map((h) => h.hp);
  const out = bodies.map(() => -1);
  const ctx: EffectContext = {
    world, caster, rank: 1, targets: bodies, origin: `ability:${id}`, rng: world.rng,
  };
  runEffects(shipped(id) as EffectDef[], ctx);
  for (let i = 0; i < bodies.length; i++) if (base[i]! - hps[i]!.hp > 1e-6) out[i] = -2;
  for (let t = 0; t < ticks; t++) {
    world.step(new Map());
    for (let i = 0; i < bodies.length; i++) {
      if (out[i] === -1 && base[i]! - hps[i]!.hp > 1e-6) out[i] = t;
    }
  }
  return out;
}

describe("#543 三支驗收技能的動畫特效", () => {
  it("★ 三支出貨技能的 spawnModelFx 都排出班表,而且班表真的付款", () => {
    cover("shipped-model-fx");
    for (const s of SUBJECTS) {
      const spots = [s.onPath];
      const [onPath] = cast(s.id, spots, 90);
      expect(
        onPath,
        `${s.label} 的 spawnModelFx 一個人都沒打到 —— 班表沒排或沒付款`,
      ).toBeGreaterThan(-1);
    }
  });

  it("★ 龍破斬的落點大爆炸打得到路徑碰不到的人,而且比路徑上的那個人晚", () => {
    cover("shipped-model-fx");
    const s = SUBJECTS[0];
    const [onPath, offPath] = cast(s.id, [s.onPath, s.offPath], 90);
    expect(offPath, "落點爆炸沒打到只有它涵蓋得到的那個人 —— onArrive 沒觸發").toBeGreaterThan(-1);
    expect(
      offPath,
      "落點爆炸與路徑掃擊同時發生 —— 抵達時刻沒有跟著距離／速度走",
    ).toBeGreaterThan(onPath!);
  });
});

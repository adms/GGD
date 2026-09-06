/**
 * GH#1020 —— 小傑 06-00 猜猜拳的**承重守衛**：載入出貨內容、跑出貨的效果，驗
 *
 *   ① 三個距離變體**真的**按距離發生（近 = 石頭擊飛、中 = 剪刀單體、遠 = 布範圍）
 *   ② ⭐ E 的階級**真的改變了**石頭的傷害（票的驗收條件：⛔ 不是「有沒有打出來」）
 *   ③ EX 解鎖前後，布的減速**只在解鎖後**掛得上（`learned:EX` 閘）
 *   ④ 變身態的隨機猜猜拳：敏捷夠高時剪刀／布讓位 ⇒ 每一發都是石頭（`weightFrom` 兩個方向）
 *
 * 突變（2026-09-06，記進 commit）：把 `effects/damage.ts` 的 `casterSlotRank(ctx)` 拿掉 ⇒ ② 紅
 * （E rank 5 的石頭傷害與 rank 0 逐位元相同）。
 *
 * ⛔ 不逐格各寫一條（第零守則⑦）—— Q/W/E/R/EX 六格的卡面↔JSON 對照跟著這一條被驗到。
 */
import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { shippedContentSource } from "../../content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
const HERO = "godie-ucrl" as ChampionId;
const PUNCH = "godie-ucrl.passive" as AbilityId;
const FORM_R = "godie-ucrl.r" as AbilityId;

let ready = false;
async function load(): Promise<void> {
  if (ready) return;
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
  ready = true;
}

interface Stage {
  world: SimWorld;
  caster: EntityId;
  victim: EntityId;
  bystander: EntityId;
}

/** 施法者在原點；主目標在 `dx`；旁觀者在 `bx`（都是敵隊）。血量拉到不會死。 */
function stage(dx: number, bx: number, seed = 7): Stage {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const mk = (x: number, seat: number, team: number): EntityId =>
    spawnChampion(world, {
      championId: HERO, seatId: asSeatId(seat), teamId: asTeamId(team),
      pos: { x: C.x + x, z: C.z }, zone: 0,
    });
  const caster = mk(0, 0, 0);
  const victim = mk(dx, 1, 1);
  const bystander = mk(bx, 2, 1);
  world.step(new Map());
  for (const id of [victim, bystander]) {
    const pool = world.health.get(id)!;
    pool.maxHp = 1_000_000;
    pool.hp = 1_000_000;
  }
  return { world, caster, victim, bystander };
}

function punch(s: Stage, effects: readonly EffectDef[] = Abilities.get(PUNCH).effects ?? []): void {
  runEffects(effects as EffectDef[], {
    world: s.world, caster: s.caster, rank: 1, targets: [s.victim],
    origin: `ability:${PUNCH}`, rng: s.world.rng,
  } satisfies EffectContext);
}
const lost = (s: Stage, id: EntityId): number => 1_000_000 - s.world.health.get(id)!.hp;
const knocked = (s: Stage, id: EntityId): boolean => s.world.nav.get(id)?.override?.kind === "knockback";
const hasStatus = (s: Stage, id: EntityId, statusId: string): boolean =>
  (s.world.status.get(id)?.effects ?? []).some((e) => e.statusId === statusId);

describe("GH#1020 小傑 06-00 猜猜拳 —— 三個距離變體 ＋ 山形修煉的加強 ＋ 殺意的追加", () => {
  it("① 近距離 = 石頭：主目標挨打且被擊飛，遠處的旁觀者一根毛都沒掉", async () => {
    await load();
    const s = stage(3, 12);
    punch(s);
    expect(lost(s, s.victim), "石頭沒有打到目標").toBeGreaterThan(0);
    expect(knocked(s, s.victim), "石頭要擊飛（knockback 沒寫進 nav.override）").toBe(true);
    expect(lost(s, s.bystander), "近距離不該有範圍傷害").toBe(0);
  });

  it("① 中距離 = 剪刀：單體、不擊飛、旁觀者不挨打", async () => {
    await load();
    const s = stage(7, 9.5);
    punch(s);
    expect(lost(s, s.victim), "剪刀沒有打到目標").toBeGreaterThan(0);
    expect(knocked(s, s.victim), "剪刀不該擊飛").toBe(false);
    expect(lost(s, s.bystander), "剪刀是單體").toBe(0);
  });

  it("① 遠距離 = 布：目標周圍的旁觀者也挨打；③ 減速只在 EX 解鎖後掛上", async () => {
    await load();
    const off = stage(11, 13);
    punch(off);
    expect(lost(off, off.victim), "布沒有打到主目標（includeOrigin）").toBeGreaterThan(0);
    expect(lost(off, off.bystander), "布是範圍：目標旁 2 格的旁觀者要挨打").toBeGreaterThan(0);
    expect(hasStatus(off, off.bystander, "slow50"), "EX 未解鎖 ⇒ 不該有減速").toBe(false);

    const on = stage(11, 13);
    on.world.abilities.get(on.caster)!.exSlot!.rank = 1; // = unlockEx
    punch(on);
    expect(hasStatus(on, on.bystander, "slow50"), "EX 解鎖後布要帶 50% 減速").toBe(true);
    expect(hasStatus(on, on.victim, "slow50")).toBe(true);
  });

  it("② ⭐ 承重：E 山形修煉-強的階級真的改變了石頭的傷害（350 + 150×lvl ＝ 基礎 × (1 + 3/7×lvl)）", async () => {
    await load();
    const r0 = stage(3, 12);
    r0.world.abilities.get(r0.caster)!.slots.E.rank = 0;
    punch(r0);
    const r5 = stage(3, 12);
    r5.world.abilities.get(r5.caster)!.slots.E.rank = 5;
    punch(r5);
    const base = lost(r0, r0.victim);
    const boosted = lost(r5, r5.victim);
    expect(base).toBeGreaterThan(0);
    // 出生時 AP = 0，所以石頭 = 級距 × (1 + 0.4286 × 5)；減免對兩邊同一個乘數 ⇒ 比值保留。
    expect(boosted / base, "E 的階級沒有進到石頭的傷害 —— 「並增強猜猜拳-石頭的威力」是無效說明").toBeCloseTo(1 + 0.4286 * 5, 1);
  });

  it("④ 變身態隨機猜猜拳：敏捷 ≥ 950 ⇒ 剪刀／布權重歸零 ⇒ 五發全是石頭；基礎敏捷 ⇒ 不會五發全石頭", async () => {
    await load();
    const rank0 = Abilities.get(FORM_R).passive!.ranks[0]!;
    const roll = rank0.hooks![0]!.effects as EffectDef[];
    const grant: EffectDef[] = Array.from({ length: 10 }, () => ({ kind: "grantAttribute", attr: "agi", amount: 100 }) as EffectDef);
    let rocks = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const s = stage(3, 12, seed);
      runEffects(grant, { world: s.world, caster: s.caster, rank: 1, targets: [s.caster], origin: "test:agi", rng: s.world.rng });
      punch(s, roll);
      if (knocked(s, s.victim)) rocks++;
    }
    expect(rocks, "敏捷 1000 時剪刀／布的權重 47.5 − 0.05×1000 < 0 ⇒ 只剩石頭").toBe(5);
    let rocksBase = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const s = stage(3, 12, seed);
      punch(s, roll);
      if (knocked(s, s.victim)) rocksBase++;
    }
    expect(rocksBase, "基礎敏捷下石頭只有 (5+敏/10)%，五發全石頭的機率 < 1e-5").toBeLessThan(5);
  });
});

/**
 * ⛔⛔ **下架的變身態，入口也要關**（2026-08-23）。
 *
 * owner 2026-08-22：「變身帶來許多問題，因此我想要**開啟變身態盡可能下架**項目群組」，
 * 並在 2026-08-23 對逐對建議說「**照你提的逐對建議**」。
 *
 * ── 稽核量到的（⛔ 不是推測）────────────────────────────────────────────────
 * `content/config/roster.json` 的 `retiredChampions` 有 5 個**變身態**
 * （`godie-e007` / `godie-h020` / `godie-h02u` / `godie-n01c` / `godie-u010`，
 * 2026-08-22 `a819e653` 落的），而它的消費端**只有選人那一半**
 * （`Whitelist.allowsChampion` ＋ 四個選人面板）。
 * ⭐ 變身態本來就 `role:"alternate"` **不可被選** ⇒ 對它們而言下架是 **no-op**。
 *
 * ⇒ 實測**仍有 4 支技能變得進去**：92-01 臥草泥馬 · 04-002 惡夢魔王的碎片 ·
 * 08-002 龍魔人 · 38-00 邪眼全開。而 `roster.json` 的 `note` 自己承認了：
 * 「⏸ 入口那一半還沒接線⋯**接線點只有一處、一行**」。
 *
 * ── 這條守衛驗什麼 ─────────────────────────────────────────────────────────
 * ⭐ **行為**：同一支**出貨的**變身技能，只因為那個對象在下架清單裡，
 * 身體就**不變**（`world.championForm` 沒有這個實體）。
 * ⛔ 一個 id、一個座標、一個數字都沒抄進斷言 —— 下架清單從**出貨的**
 * `roster.json` 讀，標本從**出貨的**技能反查。
 *
 * 突變（一條，承重線）：拿掉 `ChampionFormSystem.destinationFor()` 的
 * `if (world.retiredChampionIds.has(counterpart)) return undefined;`
 *   → 紅：「⛔ 下架的變身態還是變得進去」。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../content/registries";
import { retiredChampionIds } from "../../content/championRetirement";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "../effects/effectRunner";
import type { EffectContext, EffectDef } from "../effects/effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "../../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

/**
 * 從**出貨內容**找一支「變身成一個已下架對象」的技能。
 * ⛔ 不寫死技能 id —— owner 之後再下架一位，這條守衛自動涵蓋他。
 */
function findRetiringTransform(): { abilityId: string; baseId: string; target: string } | null {
  const retired = retiredChampionIds();
  for (const cid of Champions.ids()) {
    const cdef = Champions.tryGet(cid);
    const cp = cdef?.transform?.counterpartId;
    if (cp === undefined || !retired.has(String(cp))) continue;
    // 這位本體身上哪一格技能真的帶 `championForm`（⛔ 不寫死是哪一格）。
    for (const slot of Object.values(cdef?.abilities ?? {})) {
      const aid = (slot as { id?: string } | undefined)?.id;
      if (aid === undefined) continue;
      const def = Abilities.tryGet(aid as AbilityId);
      if (def === undefined) continue;
      if (!JSON.stringify(def).includes('"championForm"')) continue;
      return { abilityId: aid, baseId: String(cid), target: String(cp) };
    }
  }
  return null;
}

describe("下架的變身態，入口也關（owner 2026-08-22）", () => {
  it("⛔ 出貨的變身技能對著已下架的對象放，身體不變", () => {
    const found = findRetiringTransform();
    expect(
      found,
      "出貨內容裡找不到「變身成已下架對象」的技能 —— 標本失效了（或那批已經全部改完，那就刪掉這條）",
    ).not.toBeNull();
    const { abilityId, baseId } = found!;

    const world = new SimWorld(SKELETON_ARENA, 1);
    world.retiredChampionIds = retiredChampionIds();
    const caster = spawnChampion(world, {
      championId: baseId as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
      pos: { x: C.x, z: C.z }, zone: 0,
    });
    world.step(new Map());

    const def = Abilities.tryGet(abilityId as AbilityId);
    expect(def, `${abilityId} 不在註冊表裡`).toBeDefined();
    runEffects((def!.effects ?? []) as EffectDef[], {
      world, caster, rank: 1, targets: [caster], origin: `ability:${abilityId}`, rng: world.rng,
    } satisfies EffectContext);

    expect(
      world.championForm.get(caster),
      "⛔ 下架的變身態還是變得進去 —— roster.json 的下架對變身入口是 no-op",
    ).toBeUndefined();
  });

  it("⭐ 對照組：清單空的時候它照樣變得進去（⇒ 上面那條不是「這支技能本來就壞」）", () => {
    const found = findRetiringTransform();
    if (!found) return;
    const world = new SimWorld(SKELETON_ARENA, 1);
    // ⛔ 刻意**不**注入下架清單 —— 這就是 2026-08-23 之前的行為。
    const caster = spawnChampion(world, {
      championId: found.baseId as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
      pos: { x: C.x, z: C.z }, zone: 0,
    });
    world.step(new Map());
    const def = Abilities.tryGet(found.abilityId as AbilityId);
    runEffects((def!.effects ?? []) as EffectDef[], {
      world, caster, rank: 1, targets: [caster], origin: `ability:${found.abilityId}`, rng: world.rng,
    } satisfies EffectContext);
    expect(
      world.championForm.get(caster),
      "對照組沒變身 ⇒ 上面那條驗的不是下架，是別的東西（失敗形態④）",
    ).toBeDefined();
  });
});

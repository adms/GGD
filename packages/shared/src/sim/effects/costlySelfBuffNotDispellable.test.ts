/**
 * GH#662 的**反方向** —— 代價型自我強化⛔ 不可以被推成減益。
 *
 * ⚠️ 這一支存在的理由是：#662 的推論（「每一條 modifier 都往下拉 ⇒ 減益」）對
 * **好處住在 `hooks`／`exclusiveGroup` 上**的那一族是**反的**。
 * 15-03 獄炎煉我唯一的 modifier 是 `ms ×0.5`，而那 12 秒真正給的是兩條追打 hook
 * ⇒ 推成 debuff 的話，玩家自己的大招型態變成**可以被淨化掉的減益**，
 * ⛔ 而 schema 收得下、卡片照印、每一條既有守衛都是綠的（失敗形態②）。
 *
 * ⭐ 用**出貨的**那一份文件跑**出貨的** effectRunner，⛔ 不手捏 payload（失敗形態⑤）。
 */
import { describe, expect, it, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "../../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
/** 15-03 獄炎煉我 —— 全 repo 唯一「全部 modifier 往下拉 ＋ 帶 hooks」的出貨節點。 */
const SUBJECT = "godie-emfr.e";
const CASTER = "godie-emfr" as ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

describe("代價型自我強化 ⛔ 不被推成減益 (GH#662 的反方向)", () => {
  it("標本仍然有效：出貨的 15-03 是『全部往下拉 ＋ 帶 hooks』且沒標 polarity", () => {
    const def = Abilities.tryGet(SUBJECT as AbilityId);
    expect(def, `${SUBJECT} 不在註冊表裡 —— 標本被改名或內容載入失敗`).toBeDefined();
    const nodes: Record<string, unknown>[] = [];
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) n.forEach(walk);
      else if (n !== null && typeof n === "object") {
        const r = n as Record<string, unknown>;
        if (r["kind"] === "applyBuff") nodes.push(r);
        Object.values(r).forEach(walk);
      }
    };
    walk(def);
    const form = nodes.find((n) => n["exclusiveGroup"] !== undefined);
    expect(form, "15-03 的變身 applyBuff 不見了 —— 標本失效").toBeDefined();
    expect(form?.["polarity"], "它已經被明標了 ⇒ 這條測的推論路徑走不到，換一個標本").toBeUndefined();
    const mods = (form?.["modifiers"] ?? []) as { value?: number }[];
    expect(mods.length, "它沒有 modifier ⇒ 推論本來就不會觸發").toBeGreaterThan(0);
    expect(
      mods.every((m) => typeof m.value === "number" && m.value < 0),
      "它的 modifier 不再是全負 ⇒ 推論本來就不會觸發，標本失效",
    ).toBe(true);
  });

  it("⭐ 承重：施放之後那個型態**不是** debuff、⛔ 也不是 dispellable", () => {
    const world = new SimWorld(SKELETON_ARENA, 1);
    const caster = spawnChampion(world, {
      championId: CASTER, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: C.x, z: C.z }, zone: 0,
    });
    world.step(new Map());
    // ⭐ 明確確認推論**是開著的** —— 關著的話這一條會變成永遠綠的空斷言。
    expect(
      world.dispelRules.inferDebuffFromNegativeModifiers,
      "推論被關掉了 ⇒ 這條測試沒有在測東西",
    ).toBe(true);
    const def = Abilities.tryGet(SUBJECT as AbilityId);
    runEffects((def!.effects ?? []) as EffectDef[], {
      world, caster, rank: 1, targets: [caster], origin: `ability:${SUBJECT}`, rng: world.rng,
    } satisfies EffectContext);
    const sources = [...(world.stats.get(caster)?.sources ?? [])];
    expect(sources.length, "15-03 沒有掛上任何 modifier source —— 施放失敗了").toBeGreaterThan(0);
    for (const s of sources) {
      expect(
        s.polarity,
        "玩家自己的變身型態被推成減益 ⇒ 自己的【淨化】會把大招拔掉（GH#662 的反方向）",
      ).not.toBe("debuff");
      expect(s.dispellable, "它變成可被淨化的了 —— 同上").not.toBe(true);
    }
  });
});

/**
 * ⭐ GH#763 —— **12 點的刺拳與 400 點的大絕不可以播同一顆聲音。**
 *
 * ── 為什麼「三個零件都對」而它是空的（失敗形態⑧）────────────────────────────
 * clip ✅（`hit-light/medium/heavy.mp3` 早就出貨）· audio-map 的增益梯度 ✅
 * （0.55 / 0.72 / 0.95）· 發聲端 ✅（`combatSfxKey` 天天在跑）——
 * 每一個**名詞**各自都是好的，壞的是「**發聲端 × 打擊重量**」這個**配對**：
 * `case "damage"` 全檔 `grep -niE "\btier\b|ImpactTier"` **零命中**。
 * ⇒ ⛔ 只驗名詞的守衛（「audio-map 有沒有這個 key」）在這種缺陷面前**必然是綠的**。
 *
 * ── 所以這一支整條線都用**出貨的東西** ──────────────────────────────────────
 * 出貨內容 → 出貨的傷害管線（`runEffects` ＋ `combatResolveSystem`，⭐ 真的
 * `deriveTier()`）→ **sim 真的送的** `damage` / `hitImpact` 事件
 * → **出貨的** `combatSfxKey`。⛔ 一個 payload 都不自己造（失敗形態⑤）。
 * ⛔ 一個門檻數字都不抄進斷言（第二守則：驗機制不驗數字）——
 *    tier 由 sim 自己說，這裡只問「**mapper 有沒有跟著它動**」。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）───────────────────────────────────
 *  · ⭐ 承重線 —— `combatSfx.ts` 的 `case "hitImpact"` 最後一行
 *    `return hitWeightKey(d.profile)` 改成 `return "hit"`（＝重量分支失效，
 *    也就是 GH#763 之前的行為）
 *      → 紅：「⛔ 輕擊與重擊播同一顆聲音 —— 這正是 GH#763 的形狀:
 *        expected [ 'hit' ] to deeply equal [ 'hit-light' ]」
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "@ggd/shared/content/loader";
import { shippedContentSource } from "@ggd/shared/content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "@ggd/shared/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import { combatResolveSystem } from "@ggd/shared/sim/combat/damage";
import type { EffectContext, EffectDef } from "@ggd/shared/sim/effects/effect";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { asSeatId, asTeamId, type ChampionId } from "@ggd/shared/ids";
import { COMBAT_PHASE } from "./combatBedGate";
import { combatSfxKey, setHitTierKeys } from "./combatSfx";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
/** 出貨英雄（⛔ 不是骨架）—— 打自己人，兩邊同一具身體，差別只有這一發打多重。 */
const WHO = "godie-ogrh" as ChampionId;
/** 刺拳 / 大絕 —— 這兩個數字是**刺激**，⛔ 不是期望值（tier 由 sim 自己說）。 */
const JAB = 20;
const NUKE = 400;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
  // ⭐ 開關就是資料：餵**出貨的** audio-map。三顆 key 在 ⇒ 分層啟用。
  setHitTierKeys(JSON.parse(readFileSync(join(CONTENT, "config/audio-map.json"), "utf8")).sfx);
});

/** 打一發 `flat` 的技能傷害，回傳 sim **真的**送上線的那一對雙生事件。 */
function realHit(flat: number): EventMessage[] {
  const world = new SimWorld(SKELETON_ARENA, 17);
  world.combatActive = true;
  const at = (dx: number) => ({ championId: WHO, pos: { x: C.x + dx, z: C.z }, zone: 0 });
  const caster = spawnChampion(world, { ...at(0), seatId: asSeatId(0), teamId: asTeamId(0) });
  const target = spawnChampion(world, { ...at(2), seatId: asSeatId(1), teamId: asTeamId(1) });
  world.step(new Map());
  runEffects([{ kind: "damage", damageType: "physical", amount: { flat } } as EffectDef], {
    world, caster, rank: 1, targets: [target], origin: "ability:gh763.q", rng: world.rng,
  } satisfies EffectContext);
  combatResolveSystem(world);
  const evs = world.events.filter((e) => e.type === "damage" || e.type === "hitImpact");
  expect(evs.length, `flat ${flat} 沒有打出雙生事件 —— 標本失效了`).toBe(2);
  return evs as unknown as EventMessage[];
}

/** sim 自己解出來的重量（⛔ 這是夾具前提，不是被測的機制）。 */
function tierOf(evs: EventMessage[]): unknown {
  return (evs.find((e) => e.type === "hitImpact")!.data.profile as { tier?: unknown }).tier;
}

/** 出貨 mapper 對這一次命中真的會播的東西（GameApp 逐字同一條路）。 */
function sounded(evs: EventMessage[]): (string | null)[] {
  return evs.map((e) => combatSfxKey(e, null, COMBAT_PHASE, null)).filter((k) => k !== null);
}

describe("打擊音要跟著打擊重量走（GH#763）", () => {
  it("同一支技能只改重量：輕擊與重擊解析到不同的 clip，而且各自恰好一發", () => {
    const jab = realHit(JAB);
    const nuke = realHit(NUKE);
    // 夾具前提：sim 真的把這兩發分到不同的 tier（分不開就不是在測 mapper）。
    expect(tierOf(jab), "刺拳的 tier —— 換過門檻/英雄的話調 JAB").toBe("light");
    expect(tierOf(nuke), "大絕的 tier —— 換過門檻/英雄的話調 NUKE").toBe("heavy");

    expect(
      sounded(jab),
      "⛔ 輕擊與重擊播同一顆聲音 —— 這正是 GH#763 的形狀（發聲端看不到打擊重量）",
    ).toEqual(["hit-light"]);
    expect(sounded(nuke)).toEqual(["hit-heavy"]);
  });

  it("把三顆 key 從音效表拿掉 ⇒ 逐位元回到今天（一律 `hit`，仍然一發）", () => {
    setHitTierKeys({}); // ＝ owner 在 audio-map 拿掉 hit-light/medium/heavy
    try {
      expect(sounded(realHit(JAB))).toEqual(["hit"]);
      expect(sounded(realHit(NUKE))).toEqual(["hit"]);
    } finally {
      setHitTierKeys(JSON.parse(readFileSync(join(CONTENT, "config/audio-map.json"), "utf8")).sfx);
    }
  });
});

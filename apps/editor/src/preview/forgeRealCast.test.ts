/**
 * GH#174 —— 工坊的試放真的放得出去。⭐ 承重線是 `castAbility` 裡的
 * `world.step(intents)`：換成空 intent 之後第一條 `it` 立刻紅（突變驗過）。
 * ⛔ 刻意不驗數字（傷害/冷卻是後台在調的），只驗「這一發有沒有發生」。
 */
import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { cover } from "@ggd/shared/testkit/cover";
import { Stat, type AbilityDef, type ChampionDef } from "@ggd/shared/sim";
import type { AbilityId, ChampionId, ItemId } from "@ggd/shared/ids";
import { zVfxDoc, type VfxDoc } from "@ggd/shared/content";
import { createSimPreviewController } from "./PreviewController";
import { createBabylonPreviewController } from "./BabylonPreviewController";

const ab = (slot: "Q" | "W" | "E" | "R"): AbilityDef => ({
  id: `test.cast.${slot}` as AbilityId,
  name: slot,
  slot,
  castType: slot === "Q" ? "ground" : "self",
  maxRank: 4,
  cooldown: [8, 8, 8, 8],
  manaCost: [40, 40, 40, 40],
  range: 6,
  radius: 3,
  targetsEnemies: slot === "Q",
  effects:
    slot === "Q"
      ? [{ kind: "damageArea", damageType: "physical", radius: 3,
           amount: { perRank: [50, 50, 50, 50], ratios: [{ stat: Stat.AttackDamage, coeff: 0.5 }] } }]
      : [{ kind: "heal", amount: { flat: 1 } }],
});
const CHAMP = {
  id: "test-caster" as ChampionId,
  name: "Test Caster",
  role: "mage",
  attackType: "ranged",
  modelKey: "champ.thorne",
  baseStats: { maxHealth: 660, maxMana: 500, manaRegen: 0, ad: 40, armor: 5, mr: 28, as: 0.53, ms: 5.8, range: 6 },
  growth: {},
  skillOrder: ["Q", "W", "E", "R"],
  buildPriority: [] as ItemId[],
  abilities: { Q: ab("Q"), W: ab("W"), E: ab("E"), R: ab("R") },
} as unknown as ChampionDef;
const FX: VfxDoc = zVfxDoc.parse({
  id: "fx.forge-test", schema: "vfx@1", emitter: { shape: "point" }, mode: "burst", burstCount: 8,
  lifetimeSec: { min: 0.2, max: 0.5 }, size: { start: 0.4, end: 0.1 },
  color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] }, blendMode: "additive",
  texture: "assets/textures/particles/flame_01.png",
});
describe("GH#174 鑄技工坊的試放走玩家那條路", () => {
  it("送出的是 IntentFrame，答案是 sim 自己喊的 —— 拒絕時也拿得到理由", () => {
    cover("forge-real-cast");
    const c = createSimPreviewController();
    const hit = c.castAbility(CHAMP, "Q");
    expect(hit.accepted, "abilityCast 必須真的被 emit").toBe(true);
    expect(hit.manaAfter).toBeLessThan(hit.manaBefore);
    expect(hit.cooldownTicks).toBeGreaterThan(0);
    expect(hit.events.some((e) => e.type === "abilityCast")).toBe(true);
    // 反面：這位英雄沒有 EX。⭐ `castRejected` 只有 CommandSystem 會 emit ——
    // 拿得到理由本身就證明這一發**穿過了那些閘**，不是被直接呼叫進去的。
    const no = c.castAbility(CHAMP, "EX");
    expect(no.accepted).toBe(false);
    expect(no.reason).toBeTruthy();
    c.dispose();
  });

  it("Babylon 版：一顆 Engine、特效走共用工廠、dispose 收乾淨", async () => {
    const c = createBabylonPreviewController({
      createEngine: () => new NullEngine(),
      fetchDoc: <T,>() => Promise.resolve(FX as unknown as T),
    });
    expect(c.scene).toBeNull();
    c.mount({} as HTMLCanvasElement);
    expect(c.scene, "mount 之後必須有一顆場景").not.toBeNull();
    c.spawnVfx(FX.id);
    await c.settled();
    expect(c.liveParticleSystems).toBe(1);
    expect(c.playedVfx).toContain(FX.id);
    c.dispose();
    expect(c.scene).toBeNull();
    expect(c.liveParticleSystems).toBe(0);
  });
});

/**
 * GH#174 —— 工坊的試放真的放得出去。⭐ 承重線是 `castAbility` 裡的
 * `world.step(intents)`：換成空 intent 之後第一條 `it` 立刻紅（突變驗過）。
 * ⛔ 刻意不驗數字（傷害/冷卻是後台在調的），只驗「這一發有沒有發生」。
 */
import { beforeAll, describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { cover } from "@ggd/shared/testkit/cover";
import { Stat, type AbilityDef, type ChampionDef } from "@ggd/shared/sim";
import type { AbilityId, ChampionId, ItemId } from "@ggd/shared/ids";
import { ContentLoader, registerAll, zVfxDoc, type VfxDoc } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { createSimPreviewController } from "./PreviewController";
import { createBabylonPreviewController } from "./BabylonPreviewController";
import { scheduleSimEvents, triggerCuesFromSim } from "../vfx-forge/model";
import { Abilities, Champions } from "@ggd/shared/sim";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load({ policy: "fail-closed" })).store);
});

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

  it("VFX Forge 從正式超究武神霸斬 trace 收到施法與七段演出錨", () => {
    const champion = Champions.get("godie-hart" as ChampionId);
    const ability = champion.abilities.R;
    const c = createSimPreviewController();
    const trace = c.castAbility(champion, "R", { level: 18, rank: 1, ticks: 650 });
    const schedule = scheduleSimEvents(trace.events, ability.id);
    const cues = triggerCuesFromSim(schedule, ability);

    expect(trace.accepted, JSON.stringify(trace.events.slice(0, 20), null, 2)).toBe(true);
    expect(cues.filter((cue) => cue.on === "castStart")).toHaveLength(1);
    expect(cues.filter((cue) => cue.on === "castEffect")).toHaveLength(1);
    expect(cues.filter((cue) => cue.on === "strike").map((cue) => cue.strikeIndex)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    const casterStops = schedule
      .filter(({ event }) => event.type === "comboStrike")
      .map(({ actorPose }) => actorPose && `${actorPose.caster.x.toFixed(3)},${actorPose.caster.z.toFixed(3)}`)
      .filter((value): value is string => value !== undefined);
    expect(new Set(casterStops).size, "逐刀瞬移要保存 SimWorld 已解算的角色座標").toBeGreaterThan(1);
    c.dispose();
  });

  it("技能投射物的三個演出事件都保留精確 ability origin，script 才能完整取代預設綁定", () => {
    const champion = Champions.get("godie-nbbc" as ChampionId);
    const ability = champion.abilities.E;
    const c = createSimPreviewController();
    const trace = c.castAbility(champion, "E", { level: 18, rank: 4, ticks: 180 });
    const projectileEvents = trace.events.filter((event) =>
      event.type === "projectileSpawn" || event.type === "projectileHit" || event.type === "projectileEnd"
    );

    expect(trace.accepted, JSON.stringify(trace.events.slice(0, 30), null, 2)).toBe(true);
    expect(projectileEvents.length).toBeGreaterThan(0);
    for (const event of projectileEvents) {
      expect(event.data.origin, `${event.type} 漏掉演出 ownership`).toBe(`ability:${ability.id}`);
    }
    c.dispose();
  });

  it("VFX Forge 以正式反彈路徑觸發理想鄉 EX，而不是把被動偽裝成按鍵", () => {
    const champion = Champions.get("godie-e002" as ChampionId);
    const ability = Abilities.get("godie-e002.ex" as AbilityId);
    const c = createSimPreviewController();
    const trace = c.triggerReflectSuccess(champion, ability.id, { level: 18, rank: 1, ticks: 180 });
    const schedule = scheduleSimEvents(trace.events, ability.id);
    const cues = triggerCuesFromSim(schedule, ability);

    expect(trace.accepted, JSON.stringify(trace.events.slice(0, 80), null, 2)).toBe(true);
    expect(trace.runtimeCompatible, "真 Sim 的 hook provenance 必須能回到 EX 腳本").toBe(true);
    expect(trace.events.some((event) => event.type === "reflectSuccess")).toBe(true);
    expect(cues.filter((cue) => cue.on === "strike").map((cue) => cue.strikeIndex)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    const victimStops = schedule
      .filter(({ event }) => event.type === "comboStrike")
      .map(({ actorPose }) => actorPose && `${actorPose.target.x.toFixed(3)},${actorPose.target.z.toFixed(3)}`)
      .filter((value): value is string => value !== undefined);
    expect(new Set(victimStops).size, "理想鄉的受害者位移要保存真 SimWorld 座標").toBeGreaterThan(1);
    c.dispose();
  });
});

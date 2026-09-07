/**
 * GH#1087 —— **召喚是普查看得見的 gameplay 頻道**，而且量尺兩個方向都校準過。
 *
 * 在此之前 `snapshotChannels()` 沒有召喚那根指針（`spawnSummon` 只寫 `world.summon`，
 * 不掛狀態／buff、不發 `EFFECT_EVENTS` 裡的事件）⇒ 一支只有 `summon` 的技能召喚成功，
 * 普查卻回「no measurable effect」（GH#1078 量到 `tpl-summon-agent` 0→1 具而 FAIL）。
 * ⛔ 一把只驗過單邊的尺不算自證過 —— 兩個方向一起讀：
 *   ① 純召喚（身體已註冊）⇒ PASS，channel `summon`；
 *   ② 同一個 kind、身體**未註冊**（handler 走 `summonFailed`，一具都不生）⇒ ⛔ 不是 PASS
 *      —— 證明指針讀的是 `world.summon.size`，⛔ 不是「效果樹裡有 summon 這個 kind」。
 * 同 `castabilityVfxOnly.test.ts`：真的註冊、真的施放、交給**出貨的**判定（形態⑤）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { registerChampion } from "./content/registry";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { classifyCastOutcome, snapshotChannels, type CastOutcome } from "./castabilityVerdict";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type SeatId } from "../ids";
import type { AbilityDef, ChampionDef } from "./content/defs";
import type { EffectDef } from "./effects/effect";
import type { IntentFrame } from "./intents";

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
const P = { x: Z0.center.x, z: Z0.center.z + 14 };

const qDef = (name: string, effects: EffectDef[]): AbilityDef => ({
  id: `test.castability.summon.${name}` as AbilityId, name, slot: "Q", castType: "targeted",
  maxRank: 1, cooldown: [1], manaCost: [0], range: 20, targetsEnemies: true, effects,
});
const SUMMON = qDef("real", [{ kind: "summon", championId: SELA.id, count: 1 }]);
/** 同一個 kind，指向一個不存在的身體 —— handler 發 `summonFailed` 然後什麼都不生。 */
const NOBODY = qDef("nobody", [{ kind: "summon", championId: "test.castability.summon.absent", count: 1 }]);
const SUMMON_CHAMP = "test.castability.champ.summon" as ChampionId;
const NOBODY_CHAMP = "test.castability.champ.summon-nobody" as ChampionId;

/** SELA 的骨架卡片，Q 換成受測的那一支；`passive` 拿掉（同 vfxOnly：Kindling 會補傷害）。 */
const champWithQ = (id: ChampionId, q: AbilityDef): ChampionDef =>
  ({ ...SELA, id, passive: undefined, abilities: { ...SELA.abilities, Q: q } });

beforeAll(() => {
  registerSkeletonContent();
  registerChampion(champWithQ(SUMMON_CHAMP, SUMMON), { overrideAbilities: true });
  registerChampion(champWithQ(NOBODY_CHAMP, NOBODY), { overrideAbilities: true });
});

/** 真的按一次 Q；逐 tick 交給出貨的判定，第一個 PASS 就停（召喚物下一 tick 才會揮拳）。 */
function probeQ(championId: ChampionId): CastOutcome {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const at = (dx: number) => ({ x: P.x + dx, z: P.z });
  const caster = spawnChampion(world, { championId, seatId: asSeatId(0), teamId: asTeamId(0), pos: at(0), zone: 0 });
  const foe = spawnChampion(world, { championId: SELA.id, seatId: asSeatId(1), teamId: asTeamId(1), pos: at(1.35), zone: 0 });
  world.step(NO_INTENTS);
  world.rebuildGrid();
  const before = snapshotChannels(world);
  const events: string[] = [];
  expect(castAbility(world, caster, "Q", { type: "entity", entityId: foe })).toBe("ok");
  let out: CastOutcome = { verdict: "FAIL" };
  for (let i = 0; i < 30; i++) {
    events.push(...world.events.map((e) => e.type));
    out = classifyCastOutcome({ events, before, after: snapshotChannels(world), moved: false, effectsAuthored: 1 });
    if (out.verdict === "PASS") break;
    world.step(NO_INTENTS);
  }
  return out;
}

describe("castability sweep — 召喚是 gameplay 頻道，量尺兩個方向校準（GH#1087）", () => {
  it("① 一支只有 summon 的技能 ⇒ PASS，channel 是 summon（⛔ 不是「量不到效果」）", () => {
    const out = probeQ(SUMMON_CHAMP);
    expect(
      out.verdict,
      "場上真的多了一具身體卻量不到 —— `snapshotChannels` 沒有 `summons` 那根指針（GH#1087）",
    ).toBe("PASS");
    expect(out.channel).toBe("summon");
  });

  it("② 同一個 kind、身體未註冊（summonFailed、零具）⇒ ⛔ 不是 PASS —— 指針讀的是具數不是 kind", () => {
    const out = probeQ(NOBODY_CHAMP);
    expect(out.verdict, "一具都沒生卻被算成 ✅ —— 指針在讀效果樹或 summonFailed，⛔ 不是 world.summon").not.toBe("PASS");
  });
});

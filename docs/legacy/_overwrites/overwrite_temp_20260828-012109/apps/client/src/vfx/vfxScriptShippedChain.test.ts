/**
 * GH#838 特效工坊 —— 演出腳本的**出貨鏈**守衛。
 *
 * 走的是 dragonslaveShippedChain 的同一條真路：真 content（含 `content/vfx-scripts/`
 * 的出貨 pilot）→ 真 SimWorld 施放 → 真 GameApp drain → 真 VfxSystem（裡面的
 * VfxScriptPlayer 把 script 段合成 wire payload 回餵）→ **出貨場景樹**上的節點。
 * ⛔ 不手捏 payload（失敗形態⑤）：player 收的每一個事件都是 sim 真的發的。
 *
 * 突變驗證（2026-08-28）：把 `VfxScriptPlayer.fire()` 主體清空 ⇒ ① 紅（doom
 * 節點消失）；把 `onEvent` 的 abilityCast case 刪掉 ⇒ ①③ 紅。改回來 ⇒ 綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";

import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { castAbility } from "@ggd/shared/sim/abilities/abilitySystem";
import { asSeatId, asTeamId, type ChampionId } from "@ggd/shared/ids";
import { ContentLoader } from "@ggd/shared/content/loader";
import { shippedContentSource } from "@ggd/shared/content/__fixtures__/shippedContent";
import {
  registerAll,
  Arenas,
  Configs,
  Models,
  VfxDefs,
  StatusEffects,
  VfxScripts,
} from "@ggd/shared/content/registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "@ggd/shared/sim/content/registry";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { zVfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";

import { VfxSystem } from "./VfxSystem";
import { VfxScriptPlayer } from "./VfxScriptPlayer";
import { GameApp } from "../GameApp";
import { VisibleZones } from "../net/zoneVisibility";
import { modelFxDocFor } from "../render/modelFxRig";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const CASTER = "godie-h020" as ChampionId; // 黑魔導士．莉娜因巴斯
const TICKS_TO_RUN = 60;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects, VfxScripts]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** 真的施放一次龍破斬，回傳每 tick 的事件批（⛔ 不是手捏的）。 */
function castAndRecord(): EventMessage[][] {
  const world = new SimWorld(SKELETON_ARENA, 1);
  world.combatActive = true;
  const c = SKELETON_ARENA.zones[0]!.center;
  const caster = spawnChampion(world, {
    championId: CASTER,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z },
    zone: 0,
  });
  world.step(new Map());
  world.transform.get(caster)!.facing = { x: 1, z: 0 };
  const ab = world.abilities.get(caster)!;
  (ab.slots as { E: { rank: number } }).E.rank = 1;
  const hp = world.health.get(caster)!;
  hp.mana = hp.maxMana;
  const verdict = castAbility(world, caster, "E", { type: "point", point: { x: c.x + 10, z: c.z } });
  expect(verdict, "出貨的 castAbility 拒絕了龍破斬 —— 標本失效了").toBe("ok");
  const batches: EventMessage[][] = [];
  for (let t = 0; t < TICKS_TO_RUN; t++) {
    world.step(new Map());
    batches.push(world.events.map((e) => ({ ...e }) as EventMessage));
  }
  return batches;
}

describe("GH#838 演出腳本的出貨鏈（真 content → 真施放 → 真 VfxSystem → 場景樹）", () => {
  it("① 出貨 pilot（godie-h020.e）的 modelFx 段真的走到場景樹", () => {
    const batches = castAndRecord();
    const scene = new Scene(new NullEngine());
    const vfx = new VfxSystem(scene, {
      entityPos: () => null,
      modelDocFor: (k: string) => modelFxDocFor(Models.tryGet(k) ?? null),
      loadModelContainer: () => Promise.resolve(null),
      vfxDoc: (k: string) => VfxDefs.tryGet(k) ?? null,
    } as never);
    const noop = (): void => {};
    const seam = Object.assign(Object.create(GameApp.prototype) as object, {
      sessions: { primary: { drainEvents: (): unknown[] => batch } },
      vfx,
      views: { handleEvent: noop },
      casts: { handleEvent: noop },
      sfxQueue: { push: noop },
      deathFocus: { noteDeath: noop },
      applyCombatFeedback: noop,
      dispatchContextualVoice: noop,
      pushVfxSound: noop,
      routeScreenCue: noop,
      audioEntityPos: () => null,
      audioTeamOf: () => null,
      zoneOfEntity: () => null,
      visibleZones: new VisibleZones(),
      batchProfiled: false,
      frameKicks: 0,
    }) as unknown as {
      drainNetworkEvents(state: null, localId: number | null, nowMs: number): void;
    };
    let batch: EventMessage[] = [];
    for (let t = 0; t < batches.length; t++) {
      batch = batches[t]!;
      seam.drainNetworkEvents(null, null, t * (1000 / 30));
      vfx.update(t * (1000 / 30)); // atMs 的時鐘 —— 到期的段在這裡 fire
    }
    // 期望**從出貨 script 推導**（⛔ 不抄字面 id）：每一個 modelFx 段的 modelKey
    // 都要在場景樹上有 axis 節點。pilot 今天是 imported.doom；內容改了這裡跟著走。
    const script = VfxScripts.get("godie-h020.e");
    const modelSegs = script.segments.filter((s) => s.kind === "modelFx");
    expect(modelSegs.length, "pilot script 沒有任何 modelFx 段 —— 標本失效了").toBeGreaterThan(0);
    for (const seg of modelSegs) {
      const node = scene.transformNodes.find(
        (n) => n.name.startsWith("modelfx-axis-") && n.name.includes((seg as { modelKey: string }).modelKey),
      );
      expect(
        node !== undefined,
        `⛔ script 段（${(seg as { modelKey: string }).modelKey}）沒有走到場景樹 —— 播放器斷線了`,
      ).toBe(true);
    }
  });

  it("② castEffect 等 castEnd（詠唱 1.233s 的技能：提交當幀⛔不 fire，castEnd 後才 fire）", () => {
    const batches = castAndRecord();
    // 觸發語意用一份 schema 驗證過的合成 script（⛔ payload 通道仍是真型別）：
    const doc = zVfxScriptDoc.parse({
      id: "test-effect-timing",
      schema: "vfx-script@1",
      abilityId: "godie-h020.e",
      segments: [
        { kind: "floatingText", on: "castStart", text: "CAST-START" },
        { kind: "floatingText", on: "castEffect", text: "CAST-EFFECT" },
      ],
    });
    const fired: { type: string; text?: string; atTick: number }[] = [];
    let tickNow = 0;
    const player = new VfxScriptPlayer({
      scriptFor: (id) => (id === "godie-h020.e" ? doc : undefined),
      allScripts: () => [doc],
      projectileIdsOf: () => new Set(),
      entityPos: () => ({ x: 0, z: 0 }),
      dispatch: (ev) =>
        fired.push({ type: ev.type, text: (ev.data as { text?: string }).text, atTick: tickNow }),
      enabled: () => true,
    });
    let castEndTick = -1;
    for (let t = 0; t < batches.length; t++) {
      tickNow = t;
      for (const ev of batches[t]!) {
        if (ev.type === "castEnd") castEndTick = t;
        player.onEvent(ev, t * (1000 / 30));
      }
      player.update(t * (1000 / 30));
    }
    expect(castEndTick, "這一段真事件流裡沒有 castEnd —— 標本失效了").toBeGreaterThan(0);
    const start = fired.find((f) => f.text === "CAST-START");
    const effect = fired.find((f) => f.text === "CAST-EFFECT");
    expect(start !== undefined, "castStart 段沒有 fire").toBe(true);
    expect(effect !== undefined, "castEffect 段沒有 fire").toBe(true);
    expect(start!.atTick, "castStart 沒有在提交當下附近 fire").toBeLessThan(castEndTick);
    expect(
      effect!.atTick,
      "⛔ castEffect 在 castEnd 之前就 fire 了 —— 詠唱技的主體演出提早了整段吟唱",
    ).toBeGreaterThanOrEqual(castEndTick);
  });

  it("③ rollback：開關關掉 ⇒ 播放器零 dispatch（有 script 的技能退回預設演出）", () => {
    const batches = castAndRecord();
    let count = 0;
    const player = new VfxScriptPlayer({
      scriptFor: (id) => VfxScripts.tryGet(id),
      allScripts: () => VfxScripts.all(),
      projectileIdsOf: () => new Set(),
      entityPos: () => ({ x: 0, z: 0 }),
      dispatch: () => {
        count += 1;
      },
      enabled: () => false, // ＝ config.vfx-scripts@1 enabled:false 那一格
    });
    for (let t = 0; t < batches.length; t++) {
      for (const ev of batches[t]!) player.onEvent(ev, t * (1000 / 30));
      player.update(t * (1000 / 30));
    }
    expect(count, "⛔ 開關關了播放器還在 dispatch —— rollback 那一格是假的").toBe(0);
  });
});

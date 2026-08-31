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
import { syncAbilityPassives } from "@ggd/shared/sim/abilities/abilityPassives";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "@ggd/shared/ids";
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

/** 真的施放一次（預設龍破斬），回傳每 tick 的事件批（⛔ 不是手捏的）。 */
function castAndRecord(
  opts: {
    champion?: ChampionId;
    slot?: "Q" | "W" | "E" | "R";
    target?: "point" | "entity";
    ticks?: number;
  } = {},
): EventMessage[][] {
  const world = new SimWorld(SKELETON_ARENA, 1);
  world.combatActive = true;
  const c = SKELETON_ARENA.zones[0]!.center;
  const caster = spawnChampion(world, {
    championId: opts.champion ?? CASTER,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z },
    zone: 0,
  });
  const enemy = spawnChampion(world, {
    championId: CASTER,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: c.x + 4, z: c.z },
    zone: 0,
  });
  world.step(new Map());
  world.transform.get(caster)!.facing = { x: 1, z: 0 };
  const slot = opts.slot ?? "E";
  const ab = world.abilities.get(caster)!;
  (ab.slots as Record<string, { rank: number }>)[slot]!.rank = 1;
  const hp = world.health.get(caster)!;
  hp.mana = hp.maxMana;
  const verdict = castAbility(
    world,
    caster,
    slot,
    opts.target === "entity"
      ? { type: "entity", entityId: enemy }
      : { type: "point", point: { x: c.x + 10, z: c.z } },
  );
  expect(verdict, `出貨的 castAbility 拒絕了 ${opts.champion ?? CASTER}.${slot} —— 標本失效了`).toBe(
    "ok",
  );
  // ⚠️ `world.step()` 第一行清空 events ⇒ 提交批（abilityCast＋castBegin）要在
  //    第一次 step **之前**快照 —— 線上的 drain 順序正是「提交批先送、之後逐 tick」。
  const batches: EventMessage[][] = [world.events.map((e) => ({ ...e }) as EventMessage)];
  for (let t = 0; t < (opts.ticks ?? TICKS_TO_RUN); t++) {
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

  it("④ strike 觸發器：真放超究武神霸斬 ⇒ 逐段 comboStrike 錨，段 7 只 fire 一次", () => {
    // 01-04 的行為（GH#250：comboStrikes superff7，七連斬）是出貨標本 ——
    // 這裡驗的是 GH#838 的逐段演出錨：sim 每一段發 comboStrike，播放器照
    // strikeIndex 過濾。⛔ 段數（7）不進斷言 —— 期望從真事件流推導。
    const batches = castAndRecord({
      champion: "godie-hart" as ChampionId,
      slot: "R",
      target: "entity",
      ticks: 160, // 超究全程 ≈3.5s（105 tick）＋收尾餘裕
    });
    const strikes = batches.flat().filter((e) => e.type === "comboStrike");
    expect(strikes.length, "真施放沒有發出任何 comboStrike —— 逐段錨斷線了").toBeGreaterThan(1);
    const seventh = strikes.filter((e) => (e.data as { index?: number }).index === 7).length;
    const doc = zVfxScriptDoc.parse({
      id: "test-strike",
      schema: "vfx-script@1",
      abilityId: "godie-hart.r",
      segments: [
        { kind: "floatingText", on: "strike", text: "STRIKE" },
        { kind: "floatingText", on: "strike", strikeIndex: 7, text: "SEVENTH" },
      ],
    });
    const fired: string[] = [];
    const player = new VfxScriptPlayer({
      scriptFor: (id) => (id === "godie-hart.r" ? doc : undefined),
      allScripts: () => [doc],
      projectileIdsOf: () => new Set(),
      entityPos: () => ({ x: 0, z: 0 }),
      dispatch: (ev) => fired.push((ev.data as { text?: string }).text ?? ev.type),
      enabled: () => true,
    });
    for (let t = 0; t < batches.length; t++) {
      for (const ev of batches[t]!) player.onEvent(ev, t * (1000 / 30));
      player.update(t * (1000 / 30));
    }
    expect(
      fired.filter((x) => x === "STRIKE").length,
      "每一段都該 fire 一次無過濾的 strike 段",
    ).toBe(strikes.length);
    expect(
      fired.filter((x) => x === "SEVENTH").length,
      "strikeIndex:7 的段要正好在第 7 段 fire",
    ).toBe(seventh);
    expect(seventh, "真事件流裡沒有第 7 段 —— 超究的班表標本失效了").toBeGreaterThan(0);
  });

  it("⑤ 反應型技能：Avalon 反彈成功 ⇒ 理想鄉EX 的逐段錨真的發出來（⛔ 不是 Avalon 自己的特效）", () => {
    // ⭐ studio 首次連拍量到：理想鄉EX 全程 **0 亮像素** —— 而根因不是 script，
    //    是**台子產不出前提**（`effects: []` ＋ 只有 `onReflectSuccess` 鉤）。
    //    這一條把前提做出來，然後問「EX 的錨有沒有發」——⛔ 不是問「畫面亮不亮」
    //    （亮的可能全是 Avalon 自己的施法特效，那是失敗形態④：斷言方向與缺陷無關）。
    const world = new SimWorld(SKELETON_ARENA, 1);
    world.combatActive = true;
    const c = SKELETON_ARENA.zones[0]!.center;
    const saber = spawnChampion(world, {
      championId: "godie-e002" as ChampionId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: c.x, z: c.z },
      zone: 0,
    });
    const foe = spawnChampion(world, {
      championId: "godie-e002" as ChampionId,
      seatId: asSeatId(1),
      teamId: asTeamId(1),
      pos: { x: c.x + 4, z: c.z },
      zone: 0,
    });
    world.step(new Map());
    // ⭐ 被動要**顯式**裝上去：`spawnChampion` 之後 EX 槽 rank 是 0，而
    //    `syncAbilityPassives` 是出貨路徑上把 `passive.ranks[].hooks` 掛成
    //    ModifierSource 的那一支 —— 少了這兩行，`fireHooks` 在 `sources` 上
    //    找不到 `onReflectSuccess`，整條 EX 鏈逐位元等於不存在。
    const abx = world.abilities.get(saber)!;
    if (abx.exSlot) (abx.exSlot as { rank: number }).rank = 1;
    syncAbilityPassives(world, saber);
    const sc = world.stats.get(saber);
    if (sc) sc.dirty = true;
    const ab = world.abilities.get(saber)!;
    (ab.slots as Record<string, { rank: number }>).R!.rank = 1;
    const hp = world.health.get(saber)!;
    hp.mana = hp.maxMana;
    // 20-04 Avalon 開反射窗
    expect(castAbility(world, saber, "R", { type: "self" })).toBe("ok");
    const strikes: EventMessage[] = [];
    const scriptDispatches: EventMessage[] = [];
    const player = new VfxScriptPlayer({
      scriptFor: (id) => VfxScripts.tryGet(id),
      allScripts: () => VfxScripts.all(),
      projectileIdsOf: () => new Set(),
      entityPos: (id) => {
        const pos = world.transform.get(id as EntityId)?.pos;
        return pos ? { x: pos.x, z: pos.z } : null;
      },
      dispatch: (event) => scriptDispatches.push(event),
      enabled: () => true,
    });
    for (let t = 0; t < 220; t++) {
      // ⚠️ 時機承重：Avalon 是**有吟唱**的技能，反彈 buff 要等 `castEnd` 才落地
      //    ⇒ 太早打進來的那一發**沒有東西可以反彈**（首版守衛就是這樣紅的，
      //    而它看起來像「EX 壞了」）。打兩發，跨過吟唱結束。
      if (t === 45 || t === 50) {
        // 敵方英雄打進來 —— 反彈的**前提**
        (world.damageQueue as unknown as Record<string, unknown>[]).push({
          source: foe,
          target: saber,
          amount: 400,
          type: world.damageRules.defaultAbilityDamageType,
          crit: false,
          origin: "test:hit",
        });
      }
      world.step(new Map());
      for (const e of world.events) {
        const event = { ...e } as EventMessage;
        if (e.type === "comboStrike") strikes.push(event);
        player.onEvent(event, t * (1000 / 30));
      }
      player.update(t * (1000 / 30));
    }
    expect(
      strikes.length,
      "⛔ 反彈成功之後一則 comboStrike 都沒有 —— 理想鄉EX 的七連斬演出沒有錨（畫面上會是「什麼都沒發生」）",
    ).toBeGreaterThan(0);
    // ⭐ 而且錨要**指名 EX**（⛔ 不是 Avalon 或別的技能借過）
    const origins = new Set(strikes.map((e) => String((e.data as { origin?: string }).origin ?? "")));
    expect(
      [...origins].some((o) => o.includes(".ex")),
      `錨的 origin 是 ${[...origins].join(" / ")} —— 沒有一則來自 EX`,
    ).toBe(true);
    expect(
      scriptDispatches.length,
      "⛔ 真 comboStrike 已到客戶端，但 hook provenance 沒認領 godie-e002.ex 腳本",
    ).toBeGreaterThan(0);
  });

  it("⑥ 前後偏移只套**一次**（⛔ 不是 placement 與 player 各推一次）", () => {
    // ⭐ GH#838 N1 把 offsetForwardU 加進**共用**擺位核心之後，播放器若還自己推
    //    一次，畫面上只會看起來「偏移量是我填的兩倍」—— 而兩邊各自都對，
    //    那正是最難查的那一種（第〇·四守則：同一個事實不可以有兩個住處）。
    const doc = zVfxScriptDoc.parse({
      id: "t-offset",
      schema: "vfx-script@1",
      abilityId: "godie-hart.r",
      segments: [
        {
          kind: "modelFx",
          on: "castStart",
          modelKey: "imported.doom",
          path: "static",
          anchor: "self",
          lifeSec: 1,
          offsetForwardU: 5,
        },
      ],
    });
    const sent: { x: number; z: number }[] = [];
    const player = new VfxScriptPlayer({
      scriptFor: (id) => (id === "godie-hart.r" ? doc : undefined),
      allScripts: () => [doc],
      projectileIdsOf: () => new Set(),
      entityPos: () => ({ x: 0, z: 0 }),
      dispatch: (ev) => {
        const d = ev.data as { instances?: { x: number; z: number }[] };
        for (const i of d.instances ?? []) sent.push({ x: i.x, z: i.z });
      },
      enabled: () => true,
    });
    player.onEvent(
      {
        type: "abilityCast",
        tick: 0,
        data: { caster: 1, abilityId: "godie-hart.r", direction: { x: 1, z: 0 } },
      } as unknown as EventMessage,
      0,
    );
    player.update(0);
    expect(sent.length, "沒有生出實例").toBeGreaterThan(0);
    expect(
      sent[0]!.x,
      `落點 x=${sent[0]!.x} —— 填 5 卻推到 ${sent[0]!.x}，那是推了兩次`,
    ).toBeCloseTo(5, 6);
  });
});

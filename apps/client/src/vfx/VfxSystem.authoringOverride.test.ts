/**
 * VfxSystem 的**編輯器／作者側**守衛。
 *
 * ⛔⛔ **2026-09-05 —— 這個檔曾經有兩條「預設演出讓路」的守衛，它們被退休了。**
 *
 * Codex commit `35b231ef3` 從 `VfxSystem.ts` 刪掉「有 vfx-script ⇒ 預設演出讓路」
 * 整條線（71 行），並在**同一個 commit** 裡把 `vfxScriptOverride.test.ts` 改寫成
 * **逐字禁止**那個實作（`expect(src).not.toContain("this.scriptPlayer.hasScript(")`）
 * ⇒ ⭐ 同資料夾兩支守衛互斥，⛔ **沒有任何寫法能同時滿足**。
 * ⇒ 裁決：**保留 Codex 的實作**（已 merge 的設計），這兩條退休。
 *
 * ⚠️⚠️ ⭐ **而它們守的那件事今天沒有任何東西在守**：
 * 新設計的替代品 `vfx-script@1.replaces` 走 `channelTakeover`，
 * 而 `channelTakeover.heldBy(...)` 今天只有 **2 個**消費端
 * （`render/EntityViewRegistry.ts:532` 與 `vfx-forge/VfxForgeStage.ts:2143`），
 * ⭐ **兩處 gate 的都是 `champion.pulse()`＝身體動畫** ——
 * ⛔ 光柱／家族美術／地面焦痕／電弧／槍口／螢幕提示／浮動文字**一個都不讀它**。
 * ⇒ 量到的曝險：出貨 10 支 script **零支**宣告 `replaces`，
 *   而它們對應的 ability JSON **10 支全部**帶 `vfxKey`（⇒ `playCastVfx` 今天照畫）。
 *
 * ⭐ 兩條斷言的**原文**、被刪掉的實作註解、以及上面那份量測：
 *   `docs/legacy/_retired-guards.md`（2026-09-05 那一節）
 * ⭐ 追這件事的票：**GH#1000**
 *
 * ⚠️ 底下留著的 4 條**與那件事無關**（Forge 草稿演出 · flyHeight 落到真 emitter ·
 * 貼圖 middleware · 預熱池不被 replay 丟掉）—— ⛔ 不要因為上面那段一起刪掉它們。
 */
import { afterEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { VfxDoc } from "@ggd/shared/content";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { VfxSystem } from "./VfxSystem";

let scene: Scene | null = null;
let engine: NullEngine | null = null;

afterEach(() => {
  scene?.dispose();
  engine?.dispose();
  scene = null;
  engine = null;
});

describe("VfxSystem authoring script override", () => {
  it("renders the unsaved Forge draft instead of requiring the registered script", () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const draft: VfxScriptDoc = {
      id: "forge.unsaved",
      schema: "vfx-script@1",
      abilityId: "forge.unsaved",
      segments: [
        {
          kind: "floatingText",
          on: "castStart",
          text: "UNSAVED-DRAFT",
          durationSec: 1,
        },
      ],
    };
    const vfx = new VfxSystem(scene, {
      entityPos: () => ({ x: 0, z: 0 }),
      vfxScriptFor: (id) => id === draft.abilityId ? draft : undefined,
      allVfxScripts: () => [draft],
    });

    vfx.handleEvent({
      type: "abilityCast",
      tick: 0,
      data: { abilityId: draft.abilityId, caster: 1 },
    }, 0);
    vfx.update(0);

    const active = (vfx.floatingTextEntries as readonly { active: boolean; text: string }[])
      .filter((entry) => entry.active);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ text: "UNSAVED-DRAFT" });
    vfx.dispose();
  });

  it("applies a script vfxSpawn flyHeight to the real emitter, not only to the pool key", () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const doc: VfxDoc = {
      id: "forge.height",
      schema: "vfx@1",
      emitter: { shape: "point" },
      mode: "burst",
      burstCount: 1,
      lifetimeSec: { min: 0.1, max: 0.2 },
      size: { start: 0.2, end: 0 },
      color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
      blendMode: "additive",
    };
    const vfx = new VfxSystem(scene, {
      entityPos: () => ({ x: 0, z: 0 }),
      vfxDoc: (id) => id === doc.id ? doc : null,
    });

    vfx.handleEvent({
      type: "vfxSpawn",
      tick: 0,
      data: {
        vfxId: doc.id,
        caster: 1,
        x: 2,
        z: 3,
        overrides: { flyHeight: 256 },
      },
    } as never, 0);

    const system = scene.particleSystems.find((entry) => entry.name.includes(doc.id));
    expect(system, "vfxSpawn 沒有建立粒子系統，測試前提已壞").toBeDefined();
    expect((system!.emitter as Vector3).asArray()).toEqual([2, 2, 3]);
    vfx.dispose();
  });

  it("lets an embedded authoring host resolve particle textures through its own middleware", () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const doc: VfxDoc = {
      id: "forge.texture-route",
      schema: "vfx@1",
      texture: "assets/textures/particles/trace_03.png",
      emitter: { shape: "point" },
      mode: "burst",
      burstCount: 1,
      lifetimeSec: { min: 0.1, max: 0.2 },
      size: { start: 0.2, end: 0 },
      color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
      blendMode: "additive",
    };
    const seen: string[] = [];
    const vfx = new VfxSystem(scene, {
      entityPos: () => ({ x: 0, z: 0 }),
      vfxDoc: (id) => id === doc.id ? doc : null,
      resolveTextureUrl: (path) => {
        const url = `/content-api/${path}`;
        seen.push(url);
        return url;
      },
    });

    vfx.handleEvent({
      type: "vfxSpawn",
      tick: 0,
      data: { vfxId: doc.id, caster: 1, x: 0, z: 0 },
    } as never, 0);

    // Contact-shadow sprites are a separate presentation layer. They must use
    // the same source resolver too; otherwise the texture 404s and Babylon
    // renders the unit quad as a black square below every actor.
    vfx.shadowLayer.sync([{ id: 1, x: 0, z: 0, radius: 0.5 }]);

    expect(seen).toEqual([
      "/content-api/assets/textures/particles/trace_03.png",
      "/content-api/assets/textures/particles/circle_05.png",
    ]);
    vfx.dispose();
  });

  it("can replay an authoring frame without disposing its pre-warmed texture pool", () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const doc: VfxDoc = {
      id: "forge.replay-pool",
      schema: "vfx@1",
      emitter: { shape: "point" },
      mode: "burst",
      burstCount: 4,
      lifetimeSec: { min: 0.1, max: 0.2 },
      size: { start: 0.2, end: 0 },
      color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
      blendMode: "additive",
    };
    const vfx = new VfxSystem(scene, {
      entityPos: () => ({ x: 0, z: 0 }),
      vfxDoc: (id) => id === doc.id ? doc : null,
    });
    vfx.warmVfxDocs([doc]);
    const warmed = scene.particleSystems[0]!;

    vfx.resetForRound({ preserveOneShotPool: true });
    vfx.handleEvent({
      type: "vfxSpawn",
      tick: 0,
      data: { vfxId: doc.id, caster: 1, x: 0, z: 0 },
    } as never, 0);

    expect(scene.particleSystems).toEqual([warmed]);
    expect(warmed.manualEmitCount).toBeGreaterThan(0);
    vfx.dispose();
  });
});

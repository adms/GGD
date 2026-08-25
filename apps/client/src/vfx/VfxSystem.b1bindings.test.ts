/**
 * B1 綁定桶 —— 三支技能真的改播原作特效了嗎?(#230 / #205)
 *
 * ---------------------------------------------------------------------------
 * 為什麼不是一條普查測試
 * ---------------------------------------------------------------------------
 * ⛔ 「我這桶有 N 支的 vfxKey 開頭是 `fx.w3x.`」是**屬性**。#230 已經有那種
 * 測試,它綠著,而玩家一直看到替身 —— 因為一個字串長什麼樣,跟引擎手上那個
 * `ParticleSystem` 拿到什麼貼圖、幾顆粒子、多大,是兩件事。
 *
 * 所以這一檔全部讀**引擎的輸出**:
 *   · 技能文件從 `content/abilities/*.json` **原檔**讀進來,過**出貨的**
 *     `zAbilityDoc.parse`(故障⑤:被測的必須是出貨的那個)。
 *   · 事件走**真的** `VfxSystem.handleEvent`,和 GameApp 每幀排空事件時同一個 method。
 *   · 斷言讀真的 Babylon `ParticleSystem` 的 `particleTexture.name`(哪一張圖)、
 *     `getSizeGradients()`(多大)、`manualEmitCount`(幾顆)、`emitter`(在哪)。
 *
 * 每一條都是 A/B:同一支技能的**綁定前**狀態(git HEAD 的單值 `vfxKey`,寫在
 * `BEFORE` 裡)也真的跑一遍,然後斷言兩邊在引擎上**真的不同**。只斷言「綁定後
 * 是 X」對「綁定前也剛好是 X」的實作一樣會過 —— 那是故障④。
 *
 * ---------------------------------------------------------------------------
 * 這三支的證據(兩份互相獨立的檔案都說同一件事)
 * ---------------------------------------------------------------------------
 * · `content/assets/vfx/w3x-ability-provenance.json` 的 `abilities[id].extractions`
 * · `tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json` 的 `abilities[rawcode].art`
 *
 *   godie-e008.e  夏娜 21-03 赤焰爆發   A0BF  art:special = Enchant.MDX      (w3a-override, CONFIRMED)
 *                                            buff B00Z/effect = MinitypeFlame.MDX (w3h-override)
 *   godie-hlgr.e  煌   03-03 鯨式電漿光束炮 A04L  art:missile = Flash.mdx      (w3a-override, CONFIRMED)
 *   godie-hvwd.e  桔梗 02-03 魂飛魄散   A03D  art:missile = HeroNarutoS4Effect.mdx (w3a-override, CONFIRMED)
 *
 * ⚠️ **原作把同一顆發射器複製了好幾份**:`Enchant.MDX` 的 5 顆 PRE2 是
 * byte-identical,`HeroNarutoS4Effect.mdx` 的 6 顆只有 2 種。所以「綁 6 層」不是
 * 忠實,是把 5 個層位浪費在同一顆粒子上。下面 `heronarutos4effect` 那一條就是
 * 釘這件事:三層必須解出**恰好兩種**參數,不是三種、也不是一種。
 *
 * 突變驗證(記在 commit message):
 *   1. `content/abilities/godie-hvwd.e.json` 的 vfxLayers 全部改回
 *      `fx.prim.void.nova` → 「桔梗改播原作」與「恰好兩種參數」兩條紅。
 *   2. `content/abilities/godie-e008.e.json` 兩層的 `attachTo: "point"` 拿掉
 *      → 「兩個證據通道落在兩個位置」紅。
 *   3. `VfxSystem.playLayeredCast` 的迴圈改成只取 `layers[0]` → 三條全紅。
 *
 * ⚠️⚠️ **這一支點名的 content/ 檔是產生器的產物,⛔ 不是可以直接編的東西。**
 * 改之前先查它是誰的:`bash scripts/genguard.sh content/abilities/*.json`
 *   · `content/abilities/*.json` · `content/abilities/godie-hvwd.e.json` · `content/abilities/godie-e008.e.json` 都是 **skillremake:json · content:build · tiers:apply · apconv:build** 的產物,而且住在**產物隔離區**
 *     (chmod 444 —— 用檔案 API 直寫會吃 PermissionError,⛔ 不是靜默成功)。
 *   · 要動它:改**來源**再 `bash scripts/genrun.sh <那一支>`。⛔ 手改出貨 JSON 會被下一次
 *     sync 打回來,而那個「又紅了」看起來像**新的**錯(owner 2026-08-24:「發生上百次」)。
 *   · ⭐ **精確範圍**(逐支讀過那支產生器,⛔ 不是照抄稽核的一句話):
 *     content/abilities/ 這 422 份**整個目錄都是產物**,⛔ 但擁有者逐支不同:91 份由 batch1.py 從
 *     tools/skill-remake/heroes/*.py **整份重建**;其餘由 tiers:apply(只重算五級距那幾格)與
 *     apconv:build(只重算 description + ratios/attrRatios,來源 claims.json)**就地改寫**,
 *     content:build 最後打包進 bundle.json。⇒ 逐支用 genguard 查,⛔ 不要照目錄一概而論。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { readContentJson } from "../testkit/contentFixtures";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import type { VfxDoc } from "@ggd/shared/content";
import { zAbilityDoc } from "@ggd/shared/content/schema/ability";
import { VfxSystem, type VfxContext } from "./VfxSystem";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const loadVfx = (id: string): VfxDoc =>
  JSON.parse(readFileSync(root(`content/vfx/${id}.json`), "utf8")) as VfxDoc;
const loadAbility = (id: string): Record<string, unknown> =>
  // GH#323 —— 走 `readContentJson`：先 `content/`，再 `content/_legacy/`。
  // ⚠️ 這幾支技能在 2026-08-13 隨著它們的英雄退場了，但這條測試驗的是**引擎**
  //    （vfxLayers 會不會變成多組發射器），doc 只是夾具 —— 它在不在名單上不影響。
  
  readContentJson<Record<string, unknown>>(`abilities/${id}.json`);

/**
 * 綁定**之前**每一支技能的單值 `vfxKey`(git HEAD)。A/B 的另一半就是它:
 * 這些 id 拿去註冊成一支「舊狀態」的技能,和新狀態並排跑。
 */
const BEFORE: Record<string, string> = {
  "godie-e008.e": "fx.prim.fire.explosion",
  "godie-hlgr.e": "fx.prim.lightning.beam",
  "godie-hvwd.e": "fx.prim.void.nova",
};

let engine: NullEngine;
let scene: Scene;

/** 註冊出貨的那份 doc,過真的 Zod。 */
function registerShipped(id: string): Record<string, unknown> {
  const parsed = zAbilityDoc.parse(loadAbility(id)) as unknown as Record<string, unknown>;
  Abilities.register(id as AbilityId, parsed as never);
  return parsed;
}

/** 同一份 doc,但退回綁定前的單值 `vfxKey`(沒有 vfxLayers)。 */
function registerBefore(id: string): void {
  const raw = { ...loadAbility(id) };
  delete raw["vfxLayers"];
  raw["vfxKey"] = BEFORE[id];
  raw["id"] = `before.${id}`;
  const parsed = zAbilityDoc.parse(raw) as unknown as Record<string, unknown>;
  Abilities.register(`before.${id}` as AbilityId, parsed as never);
}

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  for (const id of Object.keys(BEFORE)) {
    registerShipped(id);
    registerBefore(id);
  }
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

function harness(): VfxSystem {
  const ctx: VfxContext = {
    entityPos: () => ({ x: 0, z: 0 }),
    vfxDoc: (key: string) => {
      try {
        return loadVfx(key);
      } catch {
        return null;
      }
    },
  };
  return new VfxSystem(scene, ctx);
}

const cast = (abilityId: string, point?: { x: number; z: number }): EventMessage =>
  ({
    type: "abilityCast",
    data: { abilityId, caster: 1, ...(point ? { point } : {}) },
  }) as unknown as EventMessage;

interface Emitted {
  /** which image the engine really loaded */
  texture: string;
  /** biggest particle the engine will draw */
  peakSize: number;
  /** how many particles this play() actually asked for */
  burst: number;
  x: number;
  z: number;
}

/** The systems THIS cast created, read off the real engine. */
function emitted(before: readonly unknown[]): Emitted[] {
  return scene.particleSystems
    .filter((ps) => !before.includes(ps))
    .map((raw) => {
      const ps = raw as ParticleSystem;
      // ⚠️ Babylon 的 FactorGradient 欄位叫 `factor1`(`factor2` 是隨機上界)。
      // 寫成 `g.factor` 會拿到一串 undefined → Math.max 變 NaN,而
      // `not.toBe(NaN)` 是會過的(故障④)。下面的 isFinite 就是釘這件事。
      const sizes = (ps.getSizeGradients() ?? []).map((g) => g.factor1);
      expect(sizes.length, `${ps.name} 沒有 size gradient`).toBeGreaterThan(0);
      for (const s of sizes) expect(Number.isFinite(s), `${ps.name} size 不是有限數`).toBe(true);
      const e = ps.emitter as { x: number; z: number };
      return {
        texture: ps.particleTexture?.name ?? "",
        peakSize: Math.max(...sizes),
        burst: ps.manualEmitCount,
        x: e.x,
        z: e.z,
      };
    });
}

/** One cast, in a fresh VfxSystem, returning only what that cast drew. */
function play(abilityId: string, nowMs: number, point?: { x: number; z: number }): Emitted[] {
  const sys = harness();
  const before = [...scene.particleSystems];
  sys.handleEvent(cast(abilityId, point), nowMs);
  return emitted(before);
}

describe("B1 綁定 —— 引擎真的改畫原作特效 (b1-w3x-bindings)", () => {
  it("出貨的 doc 真的帶著 vfxLayers,而且第一層就是 vfxKey", () => {
    for (const id of Object.keys(BEFORE)) {
      const def = Abilities.get(id as AbilityId) as unknown as {
        vfxKey?: string;
        vfxLayers?: { vfxKey: string }[];
      };
      expect(def.vfxLayers, `${id}: zAbilityDoc.parse 把 vfxLayers 吃掉了`).toBeDefined();
      expect(def.vfxLayers!.length).toBeGreaterThanOrEqual(2);
      // 這是本桶自訂的契約:`vfxKey` 就是第一層播的那份文件,所以普查頁
      // (只讀 vfxKey)報的東西和玩家看到的第一層是同一個。
      expect(def.vfxKey, `${id}: vfxKey 不是第一層`).toBe(def.vfxLayers![0]!.vfxKey);
      // 而且每一層都不是替身
      for (const l of def.vfxLayers!) expect(l.vfxKey.startsWith("fx.w3x.")).toBe(true);
    }
  });

  /**
   * 桔梗 02-03 魂飛魄散 —— A0BF/A03D 的 `art:missile` 是 HeroNarutoS4Effect.mdx。
   * 綁定前畫的是 `fx.prim.void.nova`(light_01.png),綁定後是原作的 flare_01。
   */
  it("桔梗 02-03 魂飛魄散:引擎拿到的貼圖從替身換成原作的 flare_01", () => {
    const after = play("godie-hvwd.e", 1_000);
    const beforeState = play("before.godie-hvwd.e", 2_000);

    expect(beforeState, "綁定前應該只有一個發射器").toHaveLength(1);
    expect(beforeState[0]!.texture, "綁定前不是 fx.prim.void.nova 的貼圖了?").toContain("light_01");

    expect(after, "三層應該造出三個發射器").toHaveLength(3);
    for (const e of after) expect(e.texture, `仍在畫替身:${e.texture}`).toContain("flare_01");
    // 兩個狀態的貼圖集合必須不相交 —— 這才是「畫面真的變了」
    const beforeTex = new Set(beforeState.map((e) => e.texture));
    for (const e of after) expect(beforeTex.has(e.texture)).toBe(false);
  });

  /**
   * ⚠️ 原作那 6 顆 PRE2 只有 2 種(p00–p04 byte-identical,p05 不同)。
   * 綁三層是為了把原作的密度堆回來,不是為了「層數多」—— 所以引擎手上必須是
   * **恰好兩種**參數。三種 = 綁錯了;一種 = 多層根本沒生效。
   */
  it("桔梗那三層在引擎上解出恰好兩種粒子參數(原作 6 顆只有 2 種)", () => {
    const after = play("godie-hvwd.e", 3_000);
    expect(after).toHaveLength(3);

    const sig = new Set(after.map((e) => `${e.peakSize}/${e.burst}`));
    expect(sig.size, `應該是兩種參數,實際 ${[...sig].join(" · ")}`).toBe(2);

    const peaks = after.map((e) => e.peakSize).sort((a, b) => a - b);
    // p00/p01 的 sizeStops 峰值 0.333,p05 是 2.778 —— 量到的出貨值
    expect(peaks[0]).toBeCloseTo(0.333, 3);
    expect(peaks[2]).toBeCloseTo(2.778, 3);
    // 小的那顆出現兩次(它是被複製的那一顆)
    expect(peaks[1]).toBeCloseTo(0.333, 3);

    // 顆數也真的不同:rate 60×0.7s → 42,rate 30×1.7s → 51
    const bursts = new Set(after.map((e) => e.burst));
    expect([...bursts].sort((a, b) => a - b)).toEqual([42, 51]);
  });

  /**
   * 夏娜 21-03 赤焰爆發 —— 這一支是本桶唯一有**兩個獨立證據通道**的:
   * `art:special` = Enchant.MDX(施法者身上的火)、buff B00Z 的 `effect` =
   * MinitypeFlame.MDX(命中處的燃燒)。多層架構的理由就是這個 —— 一支技能同時
   * 掛好幾個 effect,而且它們不在同一個地方。
   */
  it("夏娜 21-03 赤焰爆發:兩個證據通道真的落在兩個世界座標上", () => {
    const after = play("godie-e008.e", 4_000, { x: 7, z: -4 });
    expect(after, "四層應該造出四個發射器").toHaveLength(4);

    const atCaster = after.filter((e) => e.x === 0 && e.z === 0);
    const atPoint = after.filter((e) => e.x === 7 && e.z === -4);
    expect(atCaster, "施法者身上應該有兩層 enchant").toHaveLength(2);
    expect(atPoint, "落點應該有兩層 minitypeflame").toHaveLength(2);

    // 位置對了還不夠 —— 落在那裡的必須是**那個通道的**美術
    for (const e of atCaster) expect(e.texture, "施法者那兩層不是 Enchant.MDX").toContain("flame_03");
    const pointTex = atPoint.map((e) => e.texture).sort();
    expect(pointTex[0], "落點少了 MinitypeFlame 的煙").toContain("light_03");
    expect(pointTex[1], "落點少了 MinitypeFlame 的煙").toContain("smoke_07");

    // 綁定前:一個發射器、一張替身貼圖、全部在施法者腳下
    const beforeState = play("before.godie-e008.e", 5_000, { x: 7, z: -4 });
    expect(beforeState).toHaveLength(1);
    expect(beforeState[0]!.texture).toContain("flame_04"); // fx.prim.fire.explosion
    expect(beforeState[0]!.x).toBe(0);
  });

  /**
   * 煌 03-03 鯨式電漿光束炮 —— Flash.mdx 的兩顆 PRE2 **本來就不一樣**
   * (circle_05 的大光斑 vs star_07 的細碎星點),所以這裡不是「兩層」而是
   * 「兩種」:貼圖不同、顆數不同。兩層若共用了同一格粒子池,第二層會借到第一層
   * 那個已經建好的 system,兩個斷言都會紅(故障③的形狀)。
   */
  it("煌 03-03 鯨式電漿光束炮:兩層是兩種不同的發射器,不是同一顆播兩次", () => {
    const after = play("godie-hlgr.e", 6_000);
    expect(after).toHaveLength(2);

    const tex = after.map((e) => e.texture).sort();
    expect(tex[0]).toContain("circle_05"); // flash.p00 —— 擴散的光斑
    expect(tex[1]).toContain("star_07"); //  flash.p01 —— 細碎星點
    // 量到的出貨值:rate 25×0.4s → 10,rate 74.6×0.45s → 34
    expect(new Set(after.map((e) => e.burst)).size, "兩層拿到一樣的顆數").toBe(2);
    expect(after.map((e) => e.burst).sort((a, b) => a - b)).toEqual([10, 34]);

    const beforeState = play("before.godie-hlgr.e", 7_000);
    expect(beforeState).toHaveLength(1);
    expect(beforeState[0]!.texture).toContain("trace_03"); // fx.prim.lightning.beam
  });
});

/**
 * B2 綁定桶 · 行為守衛 —— 31-02 重爪擊 真的畫出原作的 BloodBreathStream
 * (task #230 / #205)
 *
 * ---------------------------------------------------------------------------
 * 為什麼不是「這桶有 N 支綁了 fx.w3x.*」
 * ---------------------------------------------------------------------------
 * #230 已經有一條普查測試在數那個數字,它綠了很久,而玩家一直看到替身 ——
 * 因為「doc 的 vfxKey 是什麼」是**屬性**,不是行為。這裡量的是:
 *
 *   施法事件送進**真的 `VfxSystem.handleEvent`** 之後,Babylon 場上多出來的
 *   `ParticleSystem` 是幾個、貼圖是哪一張、size gradient 是哪一組、擺在哪個
 *   世界座標。
 *
 * 綁定前後那組數字**實測不同**(下面每一個常數都是從引擎讀回來的,不是抄檔案):
 *
 *   綁定前  1 個 system  `w3xfx-fx.fam.breath.blood.s110`
 *           trace_03.png · 32 顆 · sizes [0.231, 0.55, 0]
 *   綁定後  3 個 system  `vfx-fx.w3x.orb.bloodbreathstream.p00/.p01/.p02`
 *           smoke_04.png · 35 / 40 / 35 顆 · 三組互不相同的 size ramp
 *
 * ---------------------------------------------------------------------------
 * 這一支的證據(照抄,不是猜)
 * ---------------------------------------------------------------------------
 * `content/assets/vfx/w3x-ability-provenance.json` 的 `godie-othr.w`:
 * rawcode A0AQ,`joinConfidence: CONFIRMED`,`realArt` 裡
 * `buff:B01G/target → BloodBreathStream.mdx`,`provenance: w3h-override`,
 * `assetStatus: IN_REPO_EMITTER_IS_THE_ASSET`,`emitterCount: 3`,而
 * `extractions` 直接列出那三份已出貨的 emitter doc。
 *
 * ⚠️ `w3xFamilyArt.ts` 早就綁到**同一個模型**(`model: "bloodbreathstream"`),
 * 只是那張表只會做「家族原型」。所以這不是換一個模型,是同一份證據換成真的資產。
 * 那個檔的檔頭寫「Every family below is a BLIZZARD STOCK model … This repo does
 * not have those files」—— 對這一列(以及另外 10 列)是假的,見最後一條守衛。
 *
 * 通道是 `buff:B01G/target` = 這個特效長在**目標**身上,所以三層都寫
 * `attachTo: "point"`;`castType: "targeted"` 的 `abilityCast` 事件帶的 `point`
 * 就是目標的座標(`sim/abilities/abilitySystem.ts:179`)。下面第三條守衛量的是
 * 發射器真的被擺到那個座標,不是留在施法者身上。
 *
 * 突變驗證(記在 commit message):
 *   · 把 doc 的三層 `vfxKey` 改回 `fx.prim.physical.slash` → 前三條全紅
 *   · 把 `vfxLayers` 整個刪掉 → 前三條全紅(退回家族原型)
 *   · 只留第一層 → 「三層三組不同參數」紅
 *   · 三層都拿掉 `attachTo` → 「擺在目標身上」紅
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "../render/vfx/shippedAbilityArt.testkit";
import { readFileSync, readdirSync } from "node:fs";
import { isShipped, readContentJson } from "../testkit/contentFixtures";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import type { VfxDoc } from "@ggd/shared/content";
import { zAbilityDoc } from "@ggd/shared/content/schema/ability";
import { VfxSystem, type VfxContext } from "./VfxSystem";
import { w3xFamilyArtRows } from "../render/vfx/w3xFamilyArt";
import { w3xAbilityArtRows } from "../render/vfx/w3xAbilityArt";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const loadVfx = (id: string): VfxDoc =>
  JSON.parse(readFileSync(root(`content/vfx/${id}.json`), "utf8")) as VfxDoc;
/** 讀**出貨的**技能檔 —— 不是測試自己手寫的物件(第⑤號故障)。 */
const loadAbility = (id: string): Record<string, unknown> =>
  // GH#323 —— 走 `readContentJson`：先 `content/`，再 `content/_legacy/`。
  // ⚠️ 這幾支技能在 2026-08-13 隨著它們的英雄退場了，但這條測試驗的是**引擎**
  //    （vfxLayers 會不會變成多組發射器），doc 只是夾具 —— 它在不在名單上不影響。
  
  readContentJson<Record<string, unknown>>(`abilities/${id}.json`);

const ABILITY = "godie-othr.w";
const LAYER_KEYS = [
  "fx.w3x.orb.bloodbreathstream.p00",
  "fx.w3x.orb.bloodbreathstream.p01",
  "fx.w3x.orb.bloodbreathstream.p02",
] as const;
/**
 * 綁定前這一支走的**家族原型**貼圖。
 * ⭐ 2026-08-27：原本釘死 `"trace_03.png"` —— ⛔ 而普查跟著內容重跑（#777，662 → 421 支）
 *   之後這一支的家族換了，實測變成 `slash_01.png` ⇒ 這一條用
 *   「expected 'slash_01.png' to be 'trace_03.png'」紅，⭐ **一句與真相無關的訊息**
 *   （真相是「家族分群變了」，⛔ 不是「重綁壞了」）。
 * ⇒ 這一條在守的是**關係**：綁定前是**一個**家族原型、綁定後是**三份原作圖層**，
 *   而**兩者的貼圖不重疊**。⛔ 原型叫什麼名字不是它在守的東西。
 */
const W3X_TEXTURE = "smoke_04.png";

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

interface Emitted {
  name: string;
  texture: string;
  sizes: number[];
  count: number;
  x: number;
  y: number;
  z: number;
}

/**
 * 每一次都開一個**新的** `VfxSystem`:粒子池是 per-instance 的,共用一個
 * instance 的話第二次施法會借到同一個 `ParticleSystem`,場景差集就是空的 ——
 * 測試會「通過」而什麼都沒量到。
 */
function castOnce(
  abilityDoc: Record<string, unknown>,
  point?: { x: number; z: number },
): Emitted[] {
  const parsed = zAbilityDoc.parse(abilityDoc) as unknown as Record<string, unknown>;
  Abilities.register(ABILITY as AbilityId, parsed as never);
  const ctx: VfxContext = {
    entityPos: () => ({ x: 0, z: 0 }),
    vfxDoc: (k: string) => {
      try {
        return loadVfx(k);
      } catch {
        return null;
      }
    },
  };
  const sys = new VfxSystem(scene, ctx);
  const before = [...scene.particleSystems];
  const ev = {
    type: "abilityCast",
    data: { abilityId: ABILITY, caster: 1, ...(point ? { point } : {}) },
  } as unknown as EventMessage;
  sys.handleEvent(ev, 1000);
  return scene.particleSystems
    .filter((ps) => !before.includes(ps))
    .map((ps) => {
      const e = ps.emitter as Vector3;
      return {
        name: ps.name,
        // ⚠️ 貼圖路徑帶前綴,只比對檔名
        texture: ((ps.particleTexture as { name?: string } | null)?.name ?? "").split("/").pop() ?? "",
        // ⚠️ Babylon 的 FactorGradient 欄位叫 `factor1`(`factor2` 是隨機上界)
        sizes: (ps.getSizeGradients() ?? []).map((g) => g.factor1),
        count: ps.manualEmitCount,
        x: e.x,
        y: e.y,
        z: e.z,
      };
    });
}

/** 綁定前的那份 doc:同一個出貨檔,拿掉 `vfxLayers`、把 `vfxKey` 還原。 */
function preBindingDoc(): Record<string, unknown> {
  const { vfxLayers: _dropped, ...rest } = loadAbility(ABILITY);
  return { ...rest, vfxKey: "fx.prim.physical.slash" };
}

describe("B2 · 31-02 重爪擊 綁上原作 BloodBreathStream", () => {
  it("出貨的 doc 施法時,引擎收到的是原作三個發射器 —— 不是家族原型", () => {
    const after = castOnce(loadAbility(ABILITY));
    expect(after.length, "三個 emitter 應該變成三個 ParticleSystem").toBe(3);
    for (const e of after) {
      expect(e.texture, `${e.name} 的貼圖不是原作模型那張`).toBe(W3X_TEXTURE);
      expect(e.texture).not.toBe(castOnce(preBindingDoc())[0]!.texture);
      expect(e.count, `${e.name} 一顆粒子都沒發`).toBeGreaterThan(0);
    }
    // 名字帶著三份真文件的 id —— 播的不是別的東西
    expect(after.map((e) => e.name).sort()).toEqual(LAYER_KEYS.map((k) => `vfx-${k}`).sort());
  });

  it("綁定前 vs 綁定後:引擎輸出的參數真的不同(1→3 個發射器,貼圖與 size ramp 全換)", () => {
    const before = castOnce(preBindingDoc());
    const after = castOnce(loadAbility(ABILITY));

    expect(before.length, "綁定前應該只有家族原型那一個").toBe(1);
    // ⭐ 只問「它真的是一份家族原型」（有貼圖、非空），⛔ 不釘名字也不釘 size
    //   —— 那兩個都會隨家族分群改變，而「換掉了」才是這一條的內容。
    expect(before[0]!.texture, "綁定前沒有貼圖 —— 家族原型根本沒上").toBeTruthy();
    expect(before[0]!.sizes.length, "綁定前沒有 size ramp").toBeGreaterThan(0);

    expect(after.length).toBeGreaterThan(before.length);
    // 換上去的是普查點名的那三份,不是「隨便換一份就算不同」
    expect(after.map((e) => e.name).sort()).toEqual(LAYER_KEYS.map((k) => `vfx-${k}`).sort());
    const beforeTex = new Set(before.map((e) => e.texture));
    for (const e of after) expect(beforeTex.has(e.texture)).toBe(false);
    // size ramp 也整組換掉,不是同一組數字換個名字
    const beforeRamp = JSON.stringify(before[0]!.sizes);
    for (const e of after) expect(JSON.stringify(e.sizes)).not.toBe(beforeRamp);
  });

  it("三層是三個**參數不同**的發射器,不是同一個播三次", () => {
    const after = castOnce(loadAbility(ABILITY));
    const ramps = after.map((e) => JSON.stringify(e.sizes));
    expect(new Set(ramps).size, "三層的 size ramp 應該兩兩不同").toBe(3);
    // 起始粒徑就是三份文件各自的值(0.417 / 0.556 / 0.87),按名字對齊比對
    const byName = new Map(after.map((e) => [e.name, e]));
    expect(byName.get(`vfx-${LAYER_KEYS[0]}`)!.sizes[0]).toBeCloseTo(0.417, 3);
    expect(byName.get(`vfx-${LAYER_KEYS[1]}`)!.sizes[0]).toBeCloseTo(0.556, 3);
    expect(byName.get(`vfx-${LAYER_KEYS[2]}`)!.sizes[0]).toBeCloseTo(0.87, 3);
    // 發射量也是各自的(70/80/70 × 0.5s 前載)
    expect(byName.get(`vfx-${LAYER_KEYS[1]}`)!.count).toBeGreaterThan(
      byName.get(`vfx-${LAYER_KEYS[0]}`)!.count,
    );
  });

  it("`attachTo: point` 真的把三層擺到目標身上,不是留在施法者腳下", () => {
    const target = { x: 7.5, z: -3.25 };
    const after = castOnce(loadAbility(ABILITY), target);
    expect(after.length).toBe(3);
    for (const e of after) {
      expect(e.x, `${e.name} 沒有跟到目標`).toBeCloseTo(target.x, 5);
      expect(e.z, `${e.name} 沒有跟到目標`).toBeCloseTo(target.z, 5);
      // 施法者在 (0,0) —— 沒動的話這兩個斷言會同時過,所以再釘一次差距
      expect(Math.abs(e.x) + Math.abs(e.z)).toBeGreaterThan(1);
    }
  });
});

describe("家族原型不可以蓋掉一份真的出貨資產(#230 的系統性缺口)", () => {
  /**
   * `w3xFamilyArt.ts` 的檔頭宣稱「Every family below is a BLIZZARD STOCK model …
   * This repo does not have those files」。實測 258 列裡有 11 列的 `model` 在
   * 普查裡是 map-imported 而且**已經出貨成 emitter doc**,所以那句話是假的。
   *
   * 這是 RATCHET 而不是覆蓋率斷言:只擋「又多出一支被原型蓋住的」,以及
   * 「已經綁好的又退回去」。其他綁定 lane 把 KNOWN 裡的補完不會讓這條紅。
   */
  const CENSUS = root("content/assets/vfx/w3x-ability-provenance.json");
  /** 還沒被接上真資產的 —— 其他桶的工作項,B2 的那一支不在裡面 */
  const KNOWN_UNBOUND = new Set(["godie-n00p.w", "godie-naka.r", "godie-nsjs.w"]);

  function shadowed(): string[] {
    const census = JSON.parse(readFileSync(CENSUS, "utf8")) as {
      models: Record<string, { layerDocIds: string[] } | undefined>;
    };
    const shipped = new Set(
      readdirSync(root("content/vfx"))
        .filter((f) => f.endsWith(".json") && f !== "_index.json")
        .map((f) => f.slice(0, -5)),
    );
    const out: string[] = [];
    for (const [abilityId, row] of Object.entries(w3xFamilyArtRows())) {
      // GH#323 —— 綁定表（`w3xFamilyArtRows()`）記的是「這支技能該用哪個原作特效」，
      // 而 2026-08-13 有 235 支技能隨著英雄退場搬進 `content/_legacy/`。表上留著
      // 它們沒有錯（哪天復活就用得上），⛔ 錯的是拿**已退場的**技能去斷言。
      if (!isShipped("abilities", abilityId)) continue;
      const docs = (census.models[row.model]?.layerDocIds ?? []).filter((d) => shipped.has(d));
      if (docs.length === 0) continue;
      if (w3xAbilityArtRows()[abilityId]) continue; // 硬表已經接上真資產
      const doc = JSON.parse(
        readFileSync(root(`content/abilities/${abilityId}.json`), "utf8"),
      ) as { vfxLayers?: { vfxKey: string }[] };
      const bound = new Set((doc.vfxLayers ?? []).map((l) => l.vfxKey));
      if (docs.some((d) => bound.has(d))) continue; // 這一支已經綁上去了
      out.push(abilityId);
    }
    return out.sort();
  }

  it("31-02 重爪擊 不再被 fx.fam.breath.* 蓋住", () => {
    expect(shadowed()).not.toContain(ABILITY);
  });

  it("沒有新的技能掉進「原型蓋掉真資產」這個坑", () => {
    const extra = shadowed().filter((id) => !KNOWN_UNBOUND.has(id));
    expect(extra, `這些技能的原作特效已經出貨,卻還在放家族原型: ${extra.join(", ")}`).toEqual([]);
  });
});

/**
 * B6 綁定守衛 —— `godie-nman.w` 40-02 必殺！爆熱神音！ 真的播原作的
 * SonicBreathStream,而不是 `fx.prim.sound.nova` 那顆通用替身。
 *
 * ---------------------------------------------------------------------------
 * 為什麼不寫「這支技能的 vfxKey 開頭是 fx.w3x.」
 * ---------------------------------------------------------------------------
 * 那是**屬性**,而且 GH#230 已經有那種普查測試 —— 它綠了很久,玩家一直看到
 * 替身。這裡量的是**引擎手上的東西**:
 *
 *   · 技能文件從 `content/` **讀真的檔**,過真的 `zAbilityDoc.parse`。手寫一份
 *     物件就是第⑤號故障(被測的不是出貨的那個)。
 *   · 事件走真的 `VfxSystem.handleEvent`,和 GameApp 每一幀排空事件時同一個。
 *   · 斷言讀真的 Babylon `ParticleSystem`:size gradient / emit power /
 *     lifetime / 發射器世界座標。不是「解析出三個 key」。
 *   · **綁定前 vs 綁定後**:同一支技能的舊形狀(單值 `fx.prim.sound.nova`)也
 *     真的跑一次,兩邊的粒子參數必須不同。斷言方向直接對著缺陷。
 *
 * 期望值一律從 `content/vfx/*.json` 與 `content/assets/vfx/w3x-families.json`
 * **算出來**,沒有一個是手抄進來的常數 —— 抄一份就等於多一個會漂的地方。
 *
 * ---------------------------------------------------------------------------
 * 突變驗證(結果記在回報裡)
 * ---------------------------------------------------------------------------
 *   1. 把出貨 doc 三層的 `vfxKey` 改回 `fx.prim.sound.nova`
 *      → 「三層參數彼此不同」與「和替身不同」紅。
 *   2. 拿掉三層的 `flyHeight`
 *      → 「三個發射器的 y 和模型的 pivotOffset 對得上」紅。
 *   3. 把 `playLayeredCast` 的迴圈改成只取 `layers[0]`
 *      → 「三層 → 三個發射器」紅。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
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
import { DEFAULT_LAYER_HEIGHT_Y, WC3_UNITS_PER_WORLD_UNIT } from "../render/vfx/abilityLayers";
import { VfxSystem, type VfxContext } from "./VfxSystem";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const readJson = <T,>(p: string): T => JSON.parse(readFileSync(root(p), "utf8")) as T;
const loadVfx = (id: string): VfxDoc => readJson<VfxDoc>(`content/vfx/${id}.json`);

/** 出貨的那支技能 —— 這個檔案唯一的主角。 */
const ABILITY = "godie-nman.w";
/** 綁定之前它掛的那顆通用替身(`git log` 的前一版值,也是 SUPERSEDES 的來源)。 */
const SUBSTITUTE = "fx.prim.sound.nova";
/** 原作模型;`w3x-families.json` 用這個 id 記著每個發射器的 pivot。 */
const SOURCE_FX = "fx.w3x.particle.sonicbreathstream";

interface FamiliesFile {
  effects: {
    id: string;
    layers: { docId: string; pivotOffset: { x: number; y: number; z: number } }[];
  }[];
}
interface AbilityDocShape {
  vfxKey?: string;
  vfxLayers?: { vfxKey: string; flyHeight?: number }[];
}

/** 出貨的技能文件,原封不動從磁碟讀。 */
const shipped = readJson<Record<string, unknown>>(`content/abilities/${ABILITY}.json`);
/** 原作模型每個發射器的 pivot(綁定時 `flyHeight` 就是從這裡算的)。 */
const sourceLayers = readJson<FamiliesFile>("content/assets/vfx/w3x-families.json").effects.find(
  (e) => e.id === SOURCE_FX,
)!.layers;

const LAYERED = "test.b6.nman.w.layered";
const BASELINE = "test.b6.nman.w.substitute";

let engine: NullEngine;
let scene: Scene;

/** 走真的 Zod,再註冊 parse 的產物 —— 註冊手寫物件就是第⑤號故障。 */
function registerParsed(id: string, doc: Record<string, unknown>): void {
  Abilities.register(
    id as AbilityId,
    zAbilityDoc.parse({ ...doc, id }) as unknown as never,
  );
}

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  registerParsed(LAYERED, shipped);
  // 綁定「之前」的那份文件:同一支技能,只是把層拿掉、`vfxKey` 換回替身。
  const before: Record<string, unknown> = { ...shipped, vfxKey: SUBSTITUTE };
  delete before["vfxLayers"];
  registerParsed(BASELINE, before);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

interface Shot {
  name: string;
  y: number;
  sizes: number[];
  minLife: number;
  maxLife: number;
  minPower: number;
  maxPower: number;
  burst: number;
}

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

const cast = (abilityId: string): EventMessage =>
  ({ type: "abilityCast", data: { abilityId, caster: 1 } }) as unknown as EventMessage;

/** 這一次施法在引擎裡新造出來的發射器,連同它們的實際參數。 */
function fire(abilityId: string): Shot[] {
  const before = [...scene.particleSystems];
  harness().handleEvent(cast(abilityId), 1_000);
  return scene.particleSystems
    .filter((ps) => !before.includes(ps))
    .map((raw) => {
      const ps = raw as ParticleSystem;
      return {
        name: ps.name,
        // `play()` 是 `(ps.emitter as Vector3).set(x, y, z)` —— 這是特效真的被
        // 擺在世界上的高度,不是文件上的欄位。
        y: (ps.emitter as { y: number }).y,
        // ⚠️ Babylon 的 FactorGradient 欄位叫 `factor1`,不是 `factor`。
        sizes: (ps.getSizeGradients() ?? []).map((g) => g.factor1),
        minLife: ps.minLifeTime,
        maxLife: ps.maxLifeTime,
        minPower: ps.minEmitPower,
        maxPower: ps.maxEmitPower,
        burst: ps.manualEmitCount,
      };
    });
}

const sig = (s: Shot): string =>
  JSON.stringify([s.sizes, s.minLife, s.maxLife, s.minPower, s.maxPower, s.burst]);

describe("B6 · godie-nman.w 綁到原作 SonicBreathStream", () => {
  it("出貨文件的三層就是那顆模型的三個發射器(不是我在測試裡編的)", () => {
    const doc = shipped as AbilityDocShape;
    const bound = (doc.vfxLayers ?? []).map((l) => l.vfxKey);
    // 每一層都必須是這顆模型真的抽出來的發射器文件之一,而且不重複。
    const real = new Set(sourceLayers.map((l) => l.docId));
    expect(bound.length).toBe(3);
    expect(new Set(bound).size).toBe(3);
    for (const k of bound) expect(real.has(k)).toBe(true);
    // 主特效(vfxKey)必須也在層裡,否則普查頁/鑄技工坊顯示的和實際播的會分家。
    expect(bound).toContain(doc.vfxKey);
  });

  it("三層 → 引擎真的造出三個發射器,而且參數彼此不同", () => {
    const shots = fire(LAYERED);
    expect(shots).toHaveLength(3);
    for (const s of shots) expect(Number.isFinite(s.sizes[0])).toBe(true);
    // 三份 doc 若共用同一組粒子參數,玩家看到的就是「同一團東西播三次」。
    expect(new Set(shots.map(sig)).size).toBe(3);
  });

  it("三個發射器的高度就是模型自己的 pivotOffset.y(不是三個都貼在 1.0)", () => {
    const shots = fire(LAYERED);
    const pivotOf = new Map(sourceLayers.map((l) => [l.docId, l.pivotOffset.y]));
    const layers = (shipped as AbilityDocShape).vfxLayers!;
    // 出貨的 flyHeight(WC3 單位)= (預設施法高度 + 模型 pivot) × 128。
    const want = layers.map((l) => {
      const pivot = pivotOf.get(l.vfxKey)!;
      return DEFAULT_LAYER_HEIGHT_Y + pivot;
    });
    // 先驗內容:寫進 doc 的數字真的是從 pivot 算出來的,不是隨手填的。
    for (const [i, l] of layers.entries()) {
      expect(l.flyHeight! / WC3_UNITS_PER_WORLD_UNIT).toBeCloseTo(want[i]!, 2);
    }
    // 再驗行為:引擎手上的三個發射器真的被擺在那三個高度。
    const got = shots.map((s) => s.y).sort((a, b) => a - b);
    const expected = [...want].sort((a, b) => a - b);
    expect(got).toHaveLength(3);
    for (const [i, y] of got.entries()) expect(y).toBeCloseTo(expected[i]!, 2);
    // 而且三個高度真的分開 —— 全部落在預設 1.0 就代表 flyHeight 被吃掉了。
    expect(new Set(got.map((y) => y.toFixed(3))).size).toBe(3);
  });

  it("綁定後畫出來的東西,和綁定前那顆替身量到的參數不同", () => {
    const after = fire(LAYERED);
    const before = fire(BASELINE);
    // 替身是單值 vfxKey → 舊路徑,恰好一個發射器。
    expect(before).toHaveLength(1);
    const substitute = loadVfx(SUBSTITUTE);
    // 那一個確實是替身:它的 emit power 就是 fx.prim.sound.nova 文件上的值。
    expect(before[0]!.minPower).toBeCloseTo(substitute.speed!.min, 3);
    expect(before[0]!.maxPower).toBeCloseTo(substitute.speed!.max, 3);
    // 綁定後沒有任何一層長得像替身。
    const substituteSig = sig(before[0]!);
    for (const s of after) expect(sig(s)).not.toBe(substituteSig);
    // 高度也不同:替身走預設 1.0,原作三層走自己的 pivot。
    expect(before[0]!.y).toBeCloseTo(DEFAULT_LAYER_HEIGHT_Y, 6);
    for (const s of after) expect(Math.abs(s.y - DEFAULT_LAYER_HEIGHT_Y)).toBeGreaterThan(0.05);
  });
});

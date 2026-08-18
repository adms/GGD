/**
 * #377 —— 每次施法的**動態瞄準**。承重的那一條。
 *
 * #366 落地了 `orient`,但 `yawDeg` 是**世界**方位角,而沒有任何東西餵它 ⇒
 * beam(47 支)/ slash(41)/ bolt(11)/ dash(6)/ tornado(6)這 129 支有方向的
 * 形狀,每一次施法都朝同一個方向噴。這條測試釘的就是「不再是這樣」。
 *
 * ⚠️ 斷言讀**最終的 Babylon 物件**(粒子真正拿到的世界方向),⛔ 不讀 VfxDoc ——
 * 「JSON 裡有 orient」和「畫面上真的轉了」是兩件事,而這個 repo 已經被中間層
 * 吃掉過參數三次(`flyHeight` / `anchor` / per-ability `alpha`)。
 * 而且走的是**出貨的那條路**:出貨的技能文件 → 真的 `zAbilityDoc.parse` →
 * 真的 `VfxSystem.handleEvent` → `scene.particleSystems`(故障 ⑤)。
 *
 * ⛔ 不驗**數字**(角度住在事件與 JSON 裡):只驗機制 —— 同一個施法者打向兩個
 * 不同的目標,粒子的世界方向**真的不同**。
 *
 * 突變驗證(記在 commit message):`artParams.applyAimYaw` 的
 * `return { ...out, id: \`${doc.id}@aim${yaw}\` }` 改成 `return out`
 * (＝算了、折進 doc 了,但沒換 pool key)→ 第二次施法借到第一次那個已經按舊
 * 角度建好的 ParticleSystem → 下面第一條紅。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Particle } from "@babylonjs/core/Particles/particle";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import type { VfxDoc } from "@ggd/shared/content";
import { zAbilityDoc } from "@ggd/shared/content/schema/ability";
import { VfxSystem, type VfxContext } from "./VfxSystem";
import { applyAimYaw } from "../render/vfx/artParams";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const readJson = (p: string): Record<string, unknown> =>
  JSON.parse(readFileSync(root(p), "utf8")) as Record<string, unknown>;

/** 出貨的 15-01 雷神槍:它的 `vfxLayers` 指著 `fx.prim.lightning.beam-flat`(橫放的柱狀砲)。 */
const AIMED = "godie-e00r.r";

let engine: NullEngine;
let scene: Scene;
beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  Abilities.register(
    AIMED as AbilityId,
    zAbilityDoc.parse(readJson(`content/abilities/${AIMED}.json`)) as never,
  );
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

const harness = (): VfxSystem =>
  new VfxSystem(scene, {
    entityPos: () => ({ x: 0, z: 0 }),
    vfxDoc: (key: string) => {
      try {
        return readJson(`content/vfx/${key}.json`) as unknown as VfxDoc;
      } catch {
        return null;
      }
    },
  } as VfxContext);

const cast = (point: { x: number; z: number }): EventMessage =>
  ({ type: "abilityCast", data: { abilityId: AIMED, caster: 1, point } }) as unknown as EventMessage;

/**
 * 問真的 system:一批粒子的初始方向總和(世界座標)。
 *
 * ⚠️ 位置**必須先由 emitter type 自己生**,再問方向 —— Babylon 的
 * `ConeParticleEmitter.startDirectionFunction` 讀的是 `particle.position`
 * (thinParticleSystem :1170-1183 的順序)。手寫一個 (0,0,0) 會讓它
 * normalize 一個零向量,拿到 (0,0,0):看起來像「方位沒生效」,其實是問錯了。
 */
function directionOf(ps: ParticleSystem): Vector3 {
  const world = Matrix.Identity();
  const sum = new Vector3(0, 0, 0);
  for (let i = 0; i < 16; i += 1) {
    const particle = new Particle(ps);
    ps.particleEmitterType.startPositionFunction(world, particle.position, particle, false);
    const out = new Vector3(0, 0, 0);
    if (ps.startDirectionFunction) ps.startDirectionFunction(world, out, particle, false);
    else ps.particleEmitterType.startDirectionFunction(world, out, particle, false, world);
    sum.addInPlace(out);
  }
  return sum;
}

/** 這一次施法新造出來的粒子系統(場景快照差集)。 */
const newSystems = (before: readonly unknown[]): ParticleSystem[] =>
  scene.particleSystems.filter((ps) => !before.includes(ps)) as ParticleSystem[];

describe("#377 每次施法的動態瞄準", () => {
  /**
   * ⭐ 承重:**同一個施法者,打向 +X 與打向 −X,粒子飛的方向真的相反。**
   *
   * 這一條同時關掉兩種故障:②(算了但沒送到 —— 沒有人餵 yaw 的話兩次方向一樣)
   * 與 ③(送到了但共用 pool key —— 第二次會借到第一次那個已建好的 system,
   * 於是方向仍然一樣)。
   */
  it("打向兩個不同的目標，粒子的世界方向真的不同", () => {
    const sys = harness();
    const b0 = [...scene.particleSystems];
    sys.handleEvent(cast({ x: 12, z: 0 }), 1000);
    const east = newSystems(b0);
    const b1 = [...scene.particleSystems];
    sys.handleEvent(cast({ x: -12, z: 0 }), 2000);
    const west = newSystems(b1);

    expect(east, "第一次施法沒有造出發射器").toHaveLength(1);
    expect(west, "第二次施法借用了上一次的 system —— 換 pool key 那一行掉了").toHaveLength(1);

    const de = directionOf(east[0]!);
    const dw = directionOf(west[0]!);
    for (const v of [de, dw]) expect(Number.isFinite(v.x) && Number.isFinite(v.z)).toBe(true);
    // 橫放的柱狀砲:軸躺在水平面上,所以「朝哪打」就是 x 的正負。
    expect(Math.sign(de.x)).toBe(-Math.sign(dw.x));
    expect(Math.abs(de.x)).toBeGreaterThan(Math.abs(de.y));
  });

  /** 向後相容:沒宣告 `yawFrom:"aim"` 的文件,瞄準碰都不碰它(同一個物件 reference)。 */
  it("沒有宣告瞄準的文件，一位元都不變", () => {
    const doc = readJson("content/vfx/fx.prim.wind.tornado.json") as unknown as VfxDoc;
    expect(applyAimYaw(doc, 137)).toBe(doc);
  });
});

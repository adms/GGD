/**
 * #366 第二優先 —— `shockwaveRing`(273 引用 / **91 支**,全 21 個家族裡最大的一族,
 * 是龍捲風 5 支的 18 倍)真的是**一圈貼地擴散的環**。
 *
 * ⚠️ 這一族在 2026-08-18 之前的 emitter 是 `sphere` —— 而球型發射器噴的是一顆
 * **各向同性**的球,上下左右一樣多。primitive 的註解寫著「ground-hugging outward」,
 * 家族名字叫 `shockwaveRing`,而畫面上是一團炸開的球:第一·五守則的形狀
 * (說了但不會發生)。
 *
 * ⛔ 修法**不是**在文件上填 `orient: { pitchDeg: 0 }`:`orient` 是一個旋轉,
 * 而旋轉一個各向同性分布得到的是**同一個**分布 —— 那條宣稱逐位元等於不存在。
 * 缺的是第三種發射基底 `emitter.shape: "ring"`,而它同時是新星 / 震地環 /
 * 腳下塵環的基底(`fx.fam.ground-dust.*` 這一批也跟著變成真的環)。
 *
 * ⛔ 不驗**數字**(半徑 / 厚度 / 抖動住在 JSON 與後台)。驗的是機制:
 * 粒子**貼著地**、而且**朝外**飛。第三條是對照組,關掉故障 ④(斷言方向跟缺陷無關)。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Particle } from "@babylonjs/core/Particles/particle";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { zVfxDoc, type VfxDoc } from "@ggd/shared/content";
import { toParticleSystem } from "./particleFactory";

const VFX = fileURLToPath(new URL("../../../../content/vfx/", import.meta.url));
/** 出貨的那一份(⛔ 不是手寫的夾具):`godie-*` 的震地技能實際下載到的文件。 */
const load = (id: string): VfxDoc =>
  zVfxDoc.parse(JSON.parse(readFileSync(`${VFX}${id}.json`, "utf8")));

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

/** 真的問 system:一批粒子的(生成位置, 初始方向)。位置先於方向,和執行期同序。 */
function samples(ps: ParticleSystem, n = 48): { pos: Vector3; dir: Vector3 }[] {
  const world = Matrix.Identity();
  const out: { pos: Vector3; dir: Vector3 }[] = [];
  for (let i = 0; i < n; i += 1) {
    const particle = new Particle(ps);
    ps.particleEmitterType.startPositionFunction(world, particle.position, particle, false);
    const dir = new Vector3(0, 0, 0);
    if (ps.startDirectionFunction) ps.startDirectionFunction(world, dir, particle, false);
    else ps.particleEmitterType.startDirectionFunction(world, dir, particle, false, world);
    out.push({ pos: particle.position.clone(), dir });
  }
  return out;
}

const make = (doc: VfxDoc): ParticleSystem => toParticleSystem(doc, scene, { createTexture: () => null });
const SHIPPED = "fx.fam.shockwave-ring.physical.s100";

describe("#366 shockwaveRing 是一圈貼地擴散的環", () => {
  it("出貨文件的粒子貼著地面飛，而且每一顆都朝外", () => {
    const s = samples(make(load(SHIPPED)));
    for (const { pos, dir } of s) {
      const horiz = Math.hypot(dir.x, dir.z);
      // 貼地:水平分量壓過垂直分量(⛔ 不是「y 等於某個數」)。
      expect(horiz).toBeGreaterThan(Math.abs(dir.y));
      // 朝外:方向與「離軸的位移」同向 —— 這就是「環會擴散」而不是「一團往同一邊歪」。
      expect(dir.x * pos.x + dir.z * pos.z).toBeGreaterThan(0);
    }
  });

  /**
   * 對照組(故障 ④):同一份文件換回 `sphere`,上面兩條**必須**掛掉 ——
   * 否則那兩條斷言對「壞掉的實作」也會過,等於什麼都沒驗。
   */
  it("換回球型發射器，上面那兩條會失效 —— 所以它們驗的是真的差別", () => {
    const doc = load(SHIPPED);
    const ball = make({ ...doc, id: `${doc.id}#ball`, emitter: { shape: "sphere", radius: 0.3 } });
    const s = samples(ball);
    expect(s.some(({ dir }) => Math.abs(dir.y) >= Math.hypot(dir.x, dir.z))).toBe(true);
  });

  /** ⭐ 閘不是判準:把「轉一顆球當成環」擋在**編輯的當下**,而不是寫在註解裡。 */
  it("Zod 擋掉「在球型發射器上填 orient」這條空宣稱", () => {
    const doc = load(SHIPPED);
    const rotatedBall = { ...doc, emitter: { shape: "sphere", radius: 0.3 }, orient: { pitchDeg: 0 } };
    expect(() => zVfxDoc.parse({ ...rotatedBall, gravityY: 0 })).toThrow(/NO-OP/);
  });
});

/**
 * GH#379 —— 有方向的形狀的**家族仰角**。承重的那一條。
 *
 * GH#377 把「每次施法朝目標」接上去了,而畫面上真的會轉的只有 **3 支** ——
 * 因為 yaw 對 `pitchDeg: 90`(直立)的發射器是恆等變換,而 634 份出貨文件裡
 * 只有兩份是橫放的。這條測試釘的就是「其餘的也真的躺下來了」。
 *
 * ⚠️ 斷言讀**最終的 Babylon 物件**(粒子真正拿到的世界方向 / 發射器真正拿到的
 * 重力),⛔ 不讀 VfxDoc —— 「JSON 裡有 orient」和「畫面上真的轉了」是兩件事。
 * 而且走**出貨的那條路**:出貨的 config → 出貨的技能文件 → 真的
 * `VfxSystem.handleEvent` → `scene.particleSystems`(故障 ⑤)。
 *
 * ⛔ 不驗**角度是多少**(那五個數字住在 `content/config/vfx-families.json`,
 * 而且是 owner 隨時會改的視覺決定):只驗**機制會不會發生**。
 *
 * 突變驗證(記在 commit message):`VfxSystem.doc()` 的
 * `applyFamilyOrient(...)` 拆掉、回到 `this.ctx.vfxDoc?.(key) ?? null`
 * → 第一條紅(兩個方向的粒子飛向同一邊 —— 正是 GH#379 描述的現況)。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
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
import { zConfigVfxFamiliesDoc } from "@ggd/shared/content/schema/vfx";
import { VfxSystem, type VfxContext } from "./VfxSystem";
import { toParticleSystem } from "./particleFactory";
import { applyAimYaw } from "../render/vfx/artParams";
import {
  applyFamilyOrient,
  directionalFamilyOfVfxId,
  setFamilyPitchDefaults,
} from "../render/vfx/familyOrient";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const readJson = (p: string): Record<string, unknown> =>
  JSON.parse(readFileSync(root(p), "utf8")) as Record<string, unknown>;

/** 出貨的 22-03 五吋釘 —— `vfxKey` 直接指著 `fx.prim.physical.beam`,沒有晉升、沒有層。 */
const AIMED = "godie-e001.e";

const SHIPPED = zConfigVfxFamiliesDoc.parse(readJson("content/config/vfx-families.json"));

/** 出貨樹裡每一份屬於某個「有方向的家族」的 vfx 文件。⛔ 不是手抄的檔名清單。 */
const DIRECTIONAL_DOCS = readdirSync(root("content/vfx"))
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => readJson(`content/vfx/${f}`) as unknown as VfxDoc)
  .filter((d) => directionalFamilyOfVfxId(d.id) !== null);

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
 * 問真的 system:一批粒子初始方向的總和(世界座標)。
 *
 * ⚠️ 位置必須先由 emitter type 自己生,再問方向 —— Babylon 的
 * `ConeParticleEmitter.startDirectionFunction` 讀的是 `particle.position`。
 */
function directionOf(ps: ParticleSystem, samples = 64): Vector3 {
  const world = Matrix.Identity();
  const sum = new Vector3(0, 0, 0);
  for (let i = 0; i < samples; i += 1) {
    const particle = new Particle(ps);
    ps.particleEmitterType.startPositionFunction(world, particle.position, particle, false);
    const out = new Vector3(0, 0, 0);
    if (ps.startDirectionFunction) ps.startDirectionFunction(world, out, particle, false);
    else ps.particleEmitterType.startDirectionFunction(world, out, particle, false, world);
    sum.addInPlace(out);
  }
  return sum;
}

const newSystems = (before: readonly unknown[]): ParticleSystem[] =>
  scene.particleSystems.filter((ps) => !before.includes(ps)) as ParticleSystem[];

describe("GH#379 家族仰角", () => {
  /**
   * ⭐ 承重(突變就驗它):一支**沒有寫過任何 `orient`** 的出貨技能,打向 +X 與
   * 打向 −X,粒子飛的方向真的相反。
   *
   * 這一支在 GH#379 之前是直立的 ⇒ 兩次方向一模一樣(瞄準是恆等變換)。
   */
  it("一支沒寫過 orient 的出貨光束技能，打兩個方向真的噴向兩邊", () => {
    setFamilyPitchDefaults(SHIPPED);
    const sys = harness();
    const b0 = [...scene.particleSystems];
    sys.handleEvent(cast({ x: 12, z: 0 }), 1000);
    const east = newSystems(b0);
    const b1 = [...scene.particleSystems];
    sys.handleEvent(cast({ x: -12, z: 0 }), 2000);
    const west = newSystems(b1);

    expect(east, "第一次施法沒有造出發射器").toHaveLength(1);
    expect(west, "第二次施法借用了上一次的 system").toHaveLength(1);
    const de = directionOf(east[0]!);
    const dw = directionOf(west[0]!);
    expect(Math.sign(de.x), "兩個方向的粒子飛向同一邊 —— 這一族還是直立的").toBe(
      -Math.sign(dw.x),
    );
    // 而且它真的躺下來了:水平分量壓過垂直分量(直立的話是反過來)。
    expect(Math.abs(de.x)).toBeGreaterThan(Math.abs(de.y));
  });

  /**
   * 家族表的**覆蓋面**:出貨樹裡每一份有方向的 `fx.prim.*` 文件都要能被瞄準,
   * 而龍捲那一族刻意不能 —— 兩個方向一起驗,⛔ 不是只驗會動的那一半。
   */
  it("每一份有方向的出貨文件都轉得動；龍捲那一族刻意不轉", () => {
    setFamilyPitchDefaults(SHIPPED);
    expect(DIRECTIONAL_DOCS.length, "出貨樹裡一份有方向的文件都沒掃到").toBeGreaterThan(40);
    let turnable = 0;
    for (const raw of DIRECTIONAL_DOCS) {
      const doc = applyFamilyOrient(raw);
      const family = directionalFamilyOfVfxId(doc.id)!;
      if (family === "tornado") {
        // 直立 = 恆等 ⇒ 這一族連物件都不該被換掉,而且柱子仍然往上長
        // (它的「往哪邊長」是重力,放倒它就會變成往旁邊飄)。
        expect(applyFamilyOrient(raw), doc.id).toBe(raw);
        const ps = toParticleSystem(doc, scene, { createTexture: () => null });
        expect(ps.gravity.y, doc.id).toBeGreaterThan(0);
        expect(Math.hypot(ps.gravity.x, ps.gravity.z), doc.id).toBeCloseTo(0, 6);
        continue;
      }
      const north = toParticleSystem(applyAimYaw(doc, 0), scene, { createTexture: () => null });
      const east = toParticleSystem(applyAimYaw(doc, 90), scene, { createTexture: () => null });
      const dn = directionOf(north);
      const de = directionOf(east);
      // 朝北(+Z)與朝東(+X):兩個方向的水平主軸必須換一條。
      expect(Math.abs(dn.z), doc.id).toBeGreaterThan(Math.abs(dn.x));
      expect(Math.abs(de.x), doc.id).toBeGreaterThan(Math.abs(de.z));
      turnable += 1;
    }
    expect(turnable, "沒有任何一份文件真的轉得動").toBeGreaterThan(40);
  });

  /**
   * ⛔ **不可以製造新的「說了但不會發生」**(第一·五守則)。
   *
   * 兩個方向一起關:宣告了瞄準卻直立(空宣稱)、以及躺下來卻不瞄準
   * (永遠朝同一邊,比直立更糟)。⭐ 這裡驗的是「推導」這個設計真的成立 ——
   * 瞄準是從仰角算出來的,所以錯誤組合**沒有狀態可以進入**。
   */
  it("躺下來 ⟺ 會瞄準 —— 兩種空宣稱都組不出來", () => {
    setFamilyPitchDefaults(SHIPPED);
    for (const raw of DIRECTIONAL_DOCS) {
      const o = applyFamilyOrient(raw).orient;
      const upright = (o?.pitchDeg ?? 90) === 90;
      expect(o?.yawFrom === "aim", `${raw.id} 的仰角與瞄準對不起來`).toBe(!upright);
    }
  });

  /** 一鍵 rollback:總開關關掉 = 每一份文件都回到原本那個物件(＝這條機制上線前)。 */
  it("總開關關掉之後，有方向的文件一位元都不變", () => {
    setFamilyPitchDefaults({ ...SHIPPED, familyPitchDefaults: false });
    for (const raw of DIRECTIONAL_DOCS) expect(applyFamilyOrient(raw), raw.id).toBe(raw);
    setFamilyPitchDefaults(SHIPPED);
  });
});

/**
 * GH#391 —— 逐技能的**仰角**真的到得了粒子,包括**沒有家族列**的那一半技能。
 *
 * ---------------------------------------------------------------------------
 * 這條守衛補的是第二個死旋鈕(和 `VfxSystem.familyKnobs.test.ts` 同一個形狀)
 * ---------------------------------------------------------------------------
 * `config.vfx-families@1.abilities.<id>.pitchDeg` 在 2026-08-19 之前是**死的**,
 * 而且死得比 α/timeScale 當年更隱蔽:後台 `vfxForge.ts` 有欄位、有上下界(−180/180)、
 * 有標籤「仰角」、有說明、有 `configFromForm` 的往返,Zod 收得下,存檔會成功 ——
 * 而 `playCastVfx` 的 `tune()` 只讀 `alpha` 與 `timeScale`。填進去的角度**從來沒有
 * 離開過那份 JSON**。第一·五守則:每一個零件都是對的,只有它們的組合是空的。
 *
 * ⭐ 所以這裡刻意測**沒有家族列**的技能(`!art` 那條分支)。41 支揮砍裡有 16 支
 * 是這樣 —— 它們只剩 primitive,最需要一個自己的角度,而在 `tune()` 裡接線的話
 * 恰恰是這 16 支拿不到。斷言放在最容易靜默失效的那條路上。
 *
 * ⛔ 斷言的**不是**「doc.orient.pitchDeg 等於 0」(那是屬性,而且 doc 本來就是我們
 * 自己寫的)。斷言的是:同一支技能、同一個施法事件,只因為那一格填了不同的數字,
 * **Babylon 真的發出去的粒子方向**就不一樣 —— 0° 往前平飛,90° 往上噴。
 *
 * 突變紀錄(2026-08-19):
 *   · 把 `playCastVfx` 的 `const tuned = doc && orient ? applyVfxOverrides(...)`
 *     改回裸 `doc` → 紅,而且紅得**正好是這個缺陷本人**:填 0 送出 29.0°、
 *     填 90 送出 28.5° —— 兩個角度都塌回全域的 `slashPitchDeg: 30` ✅
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Particle } from "@babylonjs/core/Particles/particle";
import type { IParticleSystem } from "@babylonjs/core/Particles/IParticleSystem";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import { VfxDefs, type ConfigVfxFamiliesDoc, type VfxDoc } from "@ggd/shared/content";
import { zConfigVfxFamiliesDoc } from "@ggd/shared/content/schema/vfx";
import { zAbilityDoc } from "@ggd/shared/content/schema/ability";
import { setFamilyTuning, w3xArtFor } from "../render/vfx/w3xAbilityArt";
import { VfxSystem, type VfxContext } from "./VfxSystem";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const readJson = (p: string): unknown => JSON.parse(readFileSync(root(p), "utf8")) as unknown;

/** 出貨的那份總表 —— 手寫一份就是第⑤號故障(被測的不是出貨的那個)。 */
const SHIPPED = zConfigVfxFamiliesDoc.parse(readJson("content/config/vfx-families.json"));
const ABILITY = "test.slashpitch.q";

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  // 一支**只有** primitive、沒有任何家族證據的揮砍技能 —— 就是那 16 支的形狀。
  const base = readJson("content/abilities/godie-h01u.w.json") as Record<string, unknown>;
  Abilities.register(ABILITY as AbilityId, zAbilityDoc.parse({ ...base, id: ABILITY }) as never);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});
afterEach(() => setFamilyTuning(null));

function tuning(binding: Record<string, unknown> | null): ConfigVfxFamiliesDoc {
  const abilities = { ...SHIPPED.abilities };
  if (binding) abilities[ABILITY] = binding as never;
  return zConfigVfxFamiliesDoc.parse({ ...SHIPPED, abilities });
}

const ctx: VfxContext = {
  entityPos: () => ({ x: 0, z: 0 }),
  vfxDoc: (key: string): VfxDoc | null => {
    const minted = VfxDefs.tryGet(key);
    if (minted) return minted;
    try {
      return readJson(`content/vfx/${key}.json`) as VfxDoc;
    } catch {
      return null;
    }
  },
};

/** 施法一次,回傳這次新建的粒子系統。 */
function fire(binding: Record<string, unknown> | null): ReturnType<() => Scene["particleSystems"]> {
  setFamilyTuning(tuning(binding));
  const sys = new VfxSystem(scene, ctx);
  const before = [...scene.particleSystems];
  sys.handleEvent({ type: "abilityCast", data: { abilityId: ABILITY, caster: 1 } } as unknown as EventMessage, 1000);
  return scene.particleSystems.filter((ps) => !before.includes(ps));
}

/**
 * 這個發射器**真的**把粒子往哪個仰角送(度)。
 * ⚠️ 位置要先由 emitter type 自己算(錐面上的一點),方向才有意義 —— 順序反過來
 * 的話 Babylon 會拿一個 (0,0,0) 去正規化。這也正是 `applyOrient` 檔頭記著的那條。
 */
function meanElevationDeg(system: IParticleSystem): number {
  const ps = system as unknown as {
    startDirectionFunction?: (m: Matrix, d: Vector3, p: Particle, isLocal: boolean) => void;
    particleEmitterType: {
      startPositionFunction: (m: Matrix, p: Vector3, particle: Particle, isLocal: boolean) => void;
    };
  };
  const fn = ps.startDirectionFunction;
  expect(fn, "沒有裝 startDirectionFunction —— 這一支根本沒有方位").toBeTypeOf("function");
  const m = Matrix.Identity();
  const dir = new Vector3();
  const particle = { position: new Vector3(), _localPosition: new Vector3() } as unknown as Particle;
  let sum = 0;
  const N = 400;
  for (let i = 0; i < N; i += 1) {
    ps.particleEmitterType.startPositionFunction(m, particle.position, particle, false);
    dir.set(0, 0, 0);
    fn!(m, dir, particle, false);
    sum += (Math.atan2(Math.abs(dir.y), Math.hypot(dir.x, dir.z)) * 180) / Math.PI;
  }
  return sum / N;
}

describe("逐技能仰角真的到得了粒子 (GH#391)", () => {
  it("前提:這一支**沒有**家族列 —— 走的是 `!art` 那條最容易靜默失效的分支", () => {
    setFamilyTuning(tuning({ pitchDeg: 0 }));
    expect(w3xArtFor(ABILITY), "它有家族列 —— 這條測試沒有測到要測的那條路").toBeUndefined();
  });

  it("⭐ 填 0 → 粒子往前平飛;填 90 → 粒子往上噴(以前這一格填了等於沒填)", () => {
    const flat = fire({ pitchDeg: 0 });
    const up = fire({ pitchDeg: 90 });
    expect(flat.length, "沒有任何發射器 —— 這條測試的前提就不成立").toBeGreaterThan(0);
    const flatElev = meanElevationDeg(flat[0]!);
    const upElev = meanElevationDeg(up[0]!);
    expect(upElev - flatElev, `仰角 0 送出 ${flatElev.toFixed(1)}°、仰角 90 送出 ${upElev.toFixed(1)}° —— 兩者沒有分開`).toBeGreaterThan(30);
  });

  it("沒填 → 一位元不差:池 key 不會多長一個 `#` 後綴", () => {
    for (const ps of fire(null)) expect(ps.name.includes("#"), `${ps.name} 憑空多開了一格粒子池`).toBe(false);
  });
});

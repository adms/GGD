/**
 * GH#110 行為守衛 —— 「重生過的發射半徑，真的縮小了畫面上那團火的發射面嗎？」
 *
 * 為什麼需要這一條（第⑦種故障：掃屬性代替掃行為）
 * ────────────────────────────────────────────────
 * #110 交付的是 226 份 `content/vfx/godie-*-p*.json` 的 `emitter.radius`
 * 從 `width * scale` 改成 `max(width, length) / 2 * scale`。既有的守衛
 * （`tools/w3x-import/test/shippedVfxIsCurrent.test.ts`）驗的是**資料**：
 * 「出貨的那 282 份 == 今天的抽取器重跑的結果」。那是漂移守衛，不是行為守衛 ——
 * 把 `particleFactory.toParticleSystem` 裡
 *
 *     ps.createConeEmitter(doc.emitter.radius, …)
 *
 * 的 `doc.emitter.radius` 換成任何常數，那 415 行的漂移守衛**一條都不會紅**，
 * 因為磁碟上的 JSON 一個位元都沒動。玩家看到的發射面卻整個錯了。
 *
 * 而 `w3xPureEmitterOnScreen.test.ts` 雖然是行為的（它量活著的粒子數），
 * 但它讀的是 **`fx.w3x.<family>.<stem>.pNN`** 那一組 doc，不是 #110 動到的
 * `godie-*-p*` 那一組 —— 第⑤種故障：被測的不是出貨的那個。
 *
 * 所以這裡問的是行為：**把出貨的 doc 餵進真的 `toParticleSystem`，Babylon 的
 * ConeParticleEmitter 真的把粒子生在半徑 0.585 的圓面裡，而不是 1.171。**
 *
 * 為什麼「量生成點」而不是只讀 `.radius`
 * ─────────────────────────────────────
 * 讀 `emitterType.radius` 仍然只是屬性。真正決定畫面的是
 * `ConfigParticleEmitter.startPositionFunction` —— 它才是每顆粒子出生在哪裡的
 * 那一行。實測 Babylon 7.54.3 的實作：
 *
 *     h      = 1 - RandomRange(0, heightRange)^2          // heightRange 預設 1
 *     radius = (_radius - RandomRange(0, _radius)) * h
 *     x, z   = radius * sin/cos(θ)  ;  y = h * _radius / tan(angle/2)
 *
 * 三個分量都與 `_radius` 成正比，所以**方向分布與半徑無關**（方向是
 * `normalize(position)`），受半徑影響的只有「發射面多大」。這正是 #110 要修的量，
 * 也正是這裡量的量：取樣 4000 顆的 XZ 徑向最大值 ≈ doc 的 radius。
 *
 * ⚠️ 名單是從出貨的 `W3X_ABILITY_ART` **推導**出來的，不是抄一份常數：
 * 哪天有人把某支技能改綁別的 doc，這條守衛跟著換目標，不會變成一條在守
 * 已經沒人用的 id 的空殼（第⑥種故障）。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ConeParticleEmitter } from "@babylonjs/core/Particles/EmitterTypes/coneParticleEmitter";
import type { Particle } from "@babylonjs/core/Particles/particle";
import type { VfxDoc } from "@ggd/shared/content";
import { zVfxDoc } from "@ggd/shared/content";
import { toParticleSystem } from "./particleFactory";
import { W3X_ABILITY_ART } from "../render/vfx/w3xAbilityArt";

const contentPath = (rel: string): string =>
  fileURLToPath(new URL(`../../../../content/${rel}`, import.meta.url));

/** 出貨的綁定表裡，真的會上畫面的 `godie-*-p*` doc id（推導，不是抄）。 */
function boundGodieParticleDocIds(): string[] {
  const out = new Set<string>();
  for (const art of Object.values(W3X_ABILITY_ART)) {
    for (const id of [art.primary, ...(art.extra ?? [])]) {
      if (typeof id === "string" && /^godie-.+-p\d+$/.test(id)) out.add(id);
    }
  }
  return [...out].sort();
}

function shippedDoc(id: string): VfxDoc {
  const file = contentPath(`vfx/${id}.json`);
  expect(existsSync(file), `${id} 不在 content/vfx/ —— 綁定表指向一份不存在的 doc`).toBe(true);
  return zVfxDoc.parse(JSON.parse(readFileSync(file, "utf8")));
}

/**
 * 真的跑 Babylon 的生成函式 N 次，回傳 XZ 徑向距離的最大值 —— 也就是
 * 「這個發射器實際上把粒子撒在多大的圓面上」。
 */
function measuredEmissionFootprint(cone: ConeParticleEmitter, samples = 4000): number {
  const world = Matrix.Identity();
  const p = new Vector3();
  const dummy = { position: new Vector3(), _localPosition: new Vector3() } as unknown as Particle;
  let max = 0;
  for (let i = 0; i < samples; i++) {
    cone.startPositionFunction(world, p, dummy, false);
    max = Math.max(max, Math.hypot(p.x, p.z));
  }
  return max;
}

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

describe("GH#110 出貨 doc → Babylon 發射面（行為，不是屬性）", () => {
  const ids = boundGodieParticleDocIds();

  it("綁定表真的有 godie-*-p* 的 doc 要守（否則這個檔案是空殼）", () => {
    expect(ids.length).toBeGreaterThan(0);
  });

  it.each(ids)("%s：實際生成點的半徑就是 doc 寫的那個", (id) => {
    const doc = shippedDoc(id);
    const em = doc.emitter;
    if (em.shape !== "cone") throw new Error(`${id} 不是 cone —— 這條守衛量的是錐面`);
    const r = em.radius;
    const ps = toParticleSystem(doc, scene, { createTexture: () => null });
    const cone = ps.particleEmitterType as ConeParticleEmitter;
    expect(cone.constructor.name).toContain("Cone");

    // 屬性層（便宜，但不夠）
    expect(cone.radius).toBeCloseTo(r, 6);

    // 行為層：真的跑生成函式
    const footprint = measuredEmissionFootprint(cone);
    expect(footprint).toBeLessThanOrEqual(r + 1e-9);
    // 4000 次取樣一定會摸到接近外緣的點；≥60% 保留裕度但仍能抓到「半徑被夾掉」
    expect(footprint).toBeGreaterThan(r * 0.6);
    ps.dispose();
  });

  /**
   * 釘死 #110 的那一個數字。舊的讀法 `width * scale` 給 1.171，正確的
   * `max(width, length) / 2 * scale` 給 0.585。這條測試對舊值與新值的判定
   * 相反 —— 這正是第④種故障（斷言方向跟缺陷無關）要避開的東西。
   */
  it("godie-fireblast-p1：發射面是 0.585，不是舊讀法的 1.171", () => {
    const doc = shippedDoc("godie-fireblast-p1");
    const em = doc.emitter;
    if (em.shape !== "cone") throw new Error("godie-fireblast-p1 不再是 cone");
    expect(em.radius).toBeCloseTo(0.585, 6);
    const ps = toParticleSystem(doc, scene, { createTexture: () => null });
    const footprint = measuredEmissionFootprint(ps.particleEmitterType as ConeParticleEmitter);
    expect(footprint).toBeGreaterThan(0.35);
    expect(footprint).toBeLessThan(0.6); // 1.171 的一半以下 —— 舊值會噴到 ~1.17
    ps.dispose();
  });

  /**
   * `MIN_EMITTER_RADIUS = 0.001` 的退化檢查。半徑真的變 0 時
   * `startDirectionFunction` 會對零向量做 normalize（Babylon 的
   * `Vector3.normalize` 對長度 0 直接 return，方向就變成前一顆粒子的殘值），
   * 整團特效會塌成一條線。0.001 是那個地板；這裡證明它有效：方向仍然散開。
   */
  it("radius 0.001 的 doc 不會退化成一條線（方向仍散在錐面上）", () => {
    const tiny = ids
      .map(shippedDoc)
      .filter((d) => d.emitter.shape === "cone" && d.emitter.radius <= 0.002 && d.emitter.angleDeg > 30);
    expect(tiny.length, "沒有極小半徑的 doc 可測 —— 這條守衛失去對象").toBeGreaterThan(0);
    const doc = tiny[0]!;
    const ps = toParticleSystem(doc, scene, { createTexture: () => null });
    const cone = ps.particleEmitterType as ConeParticleEmitter;
    const world = Matrix.Identity();
    const pos = new Vector3();
    const dir = new Vector3();
    const dummy = { position: new Vector3(), _localPosition: new Vector3() } as unknown as Particle;
    const dirs: Vector3[] = [];
    for (let i = 0; i < 500; i++) {
      cone.startPositionFunction(world, pos, dummy, false);
      (dummy as unknown as { position: Vector3 }).position = pos.clone();
      cone.startDirectionFunction(world, dir, dummy, false);
      dirs.push(dir.clone());
    }
    // 每一條方向都是單位向量（沒有零向量 normalize 的殘值）
    for (const d of dirs) expect(d.length()).toBeCloseTo(1, 4);
    // 而且真的散開了：不是同一條線
    const spread = Math.max(...dirs.map((d) => Math.hypot(d.x, d.z)));
    expect(spread).toBeGreaterThan(0.05);
    ps.dispose();
  });
});

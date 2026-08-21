/**
 * #251 owner「**投射物特效沒有真實套用**」—— 文件真的到得了飛行中的彈道嗎。
 *
 * ===========================================================================
 * 動手前量到的缺陷（這條測試就是它的守衛）
 * ===========================================================================
 * 2026-08-01，對真的 `ProjectileView` 先餵出貨的 `fx.prim.ice.bolt`、再餵一份把
 * `burstCount` 18→200、`sizeStops` 峰值 0.62→9、`lifetimeSec` →3–4 秒、
 * `speed` →40–60、`blendMode` →alpha、`gravityY` →99 **全部改掉**的版本，然後從
 * Babylon 讀回那顆 `ParticleSystem`：
 *
 *   capacity 48 · emitRate 55 · lifeTime 0.14–0.30 · emitPower 1.6–2.6 ·
 *   blendMode 2 · gravity −1 · sizeStops [0,0.189][0.12,0.42][1,0]
 *
 * **兩次一位元不差。** 文件唯一到得了畫面的是顏色與貼圖；其餘八個數字全部是
 * `ProjectileView.ts` 裡的常數。
 *
 * 第二個缺陷：出貨 18 份 `projectile@1` 的 `hitRadius` 有三檔（平砍 0.4、
 * 單發彈 0.5、**貫穿波 0.9**），而畫面上三種一樣大 —— 打得到多寬這件事看不見。
 *
 * ===========================================================================
 * 為什麼斷言讀 Babylon，而不是讀 `resolveProjectileArt()` 的回傳值
 * ===========================================================================
 * 這一批修的正是第②號故障（算出來但沒送到）。一條「`resolveProjectileArt`
 * 回傳的 `trailCapacity` 是 36」的測試，在 `applyArt()` 整個被刪掉之後照樣全綠。
 * 所以每一條斷言的對象都是 `view` 手上那顆真的 `ParticleSystem` / `Mesh`。
 *
 * ⚠️ 內容一律讀**出貨的那一份**（`content/projectiles/*.json` 過真的
 * `zProjectileDoc`、`content/vfx/*.json` 當 `VfxDoc`）。手寫一份長得像出貨的
 * 物件是第⑤號故障。
 *
 * ===========================================================================
 * 突變驗證（2026-08-01，每一條都真的跑過，紅 → 還原 → 綠）
 * ===========================================================================
 *   · `ProjectileView.activate()` 拿掉 `this.applyArt(resolveProjectileArt(...))`
 *     （＝把整個修法從渲染樹拿掉，回到升級前的固定彗星）
 *     → 「兩份不同的文件在引擎上是兩組不同的數字」+「貫穿波真的比平砍大」
 *     兩條紅。
 *   · `applyArt()` 只留 `this.art = art;`，其餘寫入全部刪掉（＝算出來、存起來、
 *     不送進引擎）→ 同樣兩條紅。
 *   · `applyArt()` 拿掉 `this.mesh.scaling.setAll(art.sizeMult)`
 *     → 「貫穿波真的比平砍大」紅（頭光暈不動）。
 *   · `EntityViewRegistry` 那一行 `this.content.projectileHitRadiusFor?.(e.key)`
 *     改成 `undefined`（＝視圖層對了，但註冊表沒把半徑送進去 —— 第⑤號故障的
 *     形狀）→ 「註冊表真的把 hitRadius 送到 view」紅。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { VfxDoc } from "@ggd/shared/content";
import { zProjectileDoc } from "@ggd/shared/content/schema/projectile";
import { Projectiles } from "@ggd/shared/sim/content/registry";
import type { ProjectileId } from "@ggd/shared/ids";
import { ProjectileView } from "./ProjectileView";
import { PROJECTILE_REFERENCE_HIT_RADIUS } from "@ggd/shared/content/schema/vfx";
import { MAX_TRAIL_LIFE_SEC,
  SHIPPED_TRAIL_LIFE,
  SHIPPED_TRAIL_RATE,
  projectileSizeMultiplierOf,
  setProjectileTuning,
} from "./projectileArt";
import { EntityViewRegistry } from "../EntityViewRegistry";

const root = (p: string): string => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));

/** 出貨的 18 份 `projectile@1`，過出貨的 Zod。 */
function shippedProjectiles(): Map<string, { hitRadius: number; vfxKey?: string }> {
  const dir = root("content/projectiles");
  const out = new Map<string, { hitRadius: number; vfxKey?: string }>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const doc = zProjectileDoc.parse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    out.set(doc.id, { hitRadius: doc.hitRadius, ...(doc.vfxKey ? { vfxKey: doc.vfxKey } : {}) });
  }
  return out;
}

function vfxDoc(key: string): VfxDoc | null {
  const p = root(`content/vfx/${key}.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as VfxDoc) : null;
}

let engine: NullEngine;
let scene: Scene;
const SHIPPED = shippedProjectiles();

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});
afterEach(() => {
  setProjectileTuning(undefined); // 模組級狀態，不清會漏進別的檔
});

/** 一個 view 的拖尾發射器 —— 讀最終物件，不是讀我們算出來的規格。 */
function trailOf(view: ProjectileView): ParticleSystem {
  const ps = scene.particleSystems.find(
    (p) => p.name.startsWith("proj-") && p.name.endsWith("-trail") && p.emitter === view.mesh,
  );
  expect(ps, "這個 view 的拖尾發射器不在 scene 上").toBeTruthy();
  return ps as unknown as ParticleSystem;
}

interface EngineSnap {
  capacity: number;
  emitRate: number;
  minLife: number;
  maxLife: number;
  blend: number;
  peakSize: number;
  headScale: number;
  bodyScale: number;
}

function snap(view: ProjectileView): EngineSnap {
  const t = trailOf(view);
  const grads = t.getSizeGradients() ?? [];
  return {
    capacity: t.getCapacity(),
    emitRate: t.emitRate,
    minLife: t.minLifeTime,
    maxLife: t.maxLifeTime,
    blend: t.blendMode,
    peakSize: Math.max(...grads.map((g) => g.factor1)),
    headScale: view.mesh.scaling.x,
    bodyScale: view.bodyPivot.scaling.x,
  };
}

describe("#251 投射物的特效文件真的到得了畫面 (projectile-art-applied)", () => {
  it("前提：出貨的彈道文件真的有三種不同的打擊半徑", () => {
    // 這一條在守「下面那條不是恆真」。哪天所有彈道半徑被統一，先紅的會是它。
    //
    // ⚠️ 2026-08-17：這裡本來寫 `toBe(18)`。那是一個**出貨數量**住進測試裡
    // （CLAUDE.md「驗機制不驗數字」），而它擋下的是「新增了兩份彈道文件」——
    // 一個完全正常的內容編輯，卻用「投射物特效沒送到畫面」的錯誤訊息紅。
    // 這條要驗的性質從頭到尾都是**半徑有分檔**，不是「剛好幾份」，所以下界改成
    // 「多到足以談分佈」。
    expect(SHIPPED.size, "出貨彈道文件少到不足以談半徑分檔").toBeGreaterThanOrEqual(10);
    const radii = new Set([...SHIPPED.values()].map((p) => p.hitRadius));
    expect(radii.size, `半徑只剩 ${[...radii].join("/")} 一種 —— 大小差異無從證起`).toBeGreaterThanOrEqual(3);
    expect(Math.max(...radii)).toBeGreaterThan(Math.min(...radii) * 1.5);
  });

  it("⭐ 兩份不同的文件在引擎上是兩組不同的數字（升級前這裡一位元不差）", () => {
    // `fx.thorn`（burstCount 36、峰值 0.32、壽命 0.15–0.35、gravity −14）vs
    // `fx.prim.ice.bolt`（burstCount 18、峰值 0.62、壽命 0.18–0.46）——
    // 兩份都是出貨文件，差異是內容作者寫的，不是我為了測試捏的。
    const thorn = vfxDoc("fx.thorn");
    const ice = vfxDoc("fx.prim.ice.bolt");
    expect(thorn && ice, "出貨的對照文件不見了").toBeTruthy();

    const v = new ProjectileView(scene);
    v.activate(thorn, "bolt", PROJECTILE_REFERENCE_HIT_RADIUS);
    const a = snap(v);
    v.activate(ice, "bolt", PROJECTILE_REFERENCE_HIT_RADIUS);
    const b = snap(v);

    // 逐項比對，這樣紅的時候會指名是哪一格沒送到
    expect(a.emitRate, "密度沒有跟著文件的 burstCount 走").not.toBe(b.emitRate);
    // ⭐ 2026-08-22（#44）：拖尾壽命上界從 0.5 降成 **`MAX_TRAIL_LIFE_SEC`**
    // （由 `RIBBON_FADE_BUDGET_SEC = 0.25` 的收尾契約推導）。這兩份對照文件的
    // 壽命是 0.35 與 0.46 —— **雙雙撞頂被夾成同一個數**，於是這一條用
    // 「壽命沒有跟著文件走」這個**錯誤的訊息**紅掉（第二守則：⛔ 不要驗數字）。
    //
    // ⇒ 改成驗**機制**：引擎給的壽命 === `min(文件的 max, 出貨上界)`。
    // ⭐ 上界從出貨常數推導，⛔ 不抄 0.25 —— 上界哪天再變，這一條自己跟著走；
    // 而「文件沒有送到引擎」（例如硬寫死一個值）仍然會紅。
    const lifeOf = (d: NonNullable<typeof thorn>): number => {
      const L = (d as { lifetimeSec?: { max?: number } | number }).lifetimeSec;
      return typeof L === "number" ? L : (L?.max ?? 0);
    };
    expect(a.maxLife, "thorn 的壽命沒有跟著文件（或上界）走").toBeCloseTo(
      Math.min(lifeOf(thorn!), MAX_TRAIL_LIFE_SEC),
      5,
    );
    expect(b.maxLife, "ice 的壽命沒有跟著文件（或上界）走").toBeCloseTo(
      Math.min(lifeOf(ice!), MAX_TRAIL_LIFE_SEC),
      5,
    );
    expect(a.peakSize, "粒子大小沒有跟著文件的 sizeStops 走").not.toBe(b.peakSize);
    // …而且 ice 的峰值真的比 thorn 大（方向對，不只是「有差」）
    expect(b.peakSize).toBeGreaterThan(a.peakSize);
    v.dispose();
  });

  it("⭐ 貫穿波真的比平砍大 —— 讀 mesh.scaling，倍率等於出貨公式", () => {
    const wave = SHIPPED.get("imported.wave.physical")!; // hitRadius 0.9, pierce
    const auto = SHIPPED.get("basic-attack")!; // hitRadius 0.4
    expect(wave.hitRadius).toBeGreaterThan(auto.hitRadius);

    const v = new ProjectileView(scene);
    v.activate(wave.vfxKey ? vfxDoc(wave.vfxKey) : null, "bolt", wave.hitRadius);
    const big = snap(v);
    v.activate(auto.vfxKey ? vfxDoc(auto.vfxKey) : null, "bolt", auto.hitRadius);
    const small = snap(v);

    expect(big.headScale, "貫穿波和平砍的頭光暈一樣大").toBeGreaterThan(small.headScale);
    expect(big.bodyScale, "貫穿波和平砍的 3D 彈頭一樣大").toBeGreaterThan(small.bodyScale);
    // 引擎拿到的倍率 == 出貨公式算出來的倍率（「宣稱 == 實際」）
    expect(big.headScale).toBeCloseTo(projectileSizeMultiplierOf(wave.hitRadius), 6);
    expect(small.headScale).toBeCloseTo(projectileSizeMultiplierOf(auto.hitRadius), 6);
    v.dispose();
  });

  it("後台把 `projectileArtFromDoc` 關掉 = 真的回到升級前的固定彗星", () => {
    setProjectileTuning({ artFromDoc: false, radiusGain: 0, flyHeightY: 1 });
    const v = new ProjectileView(scene);
    for (const key of ["fx.thorn", "fx.prim.ice.bolt"]) {
      v.activate(vfxDoc(key), "bolt", 0.9);
      const s = snap(v);
      expect(s.emitRate, `${key} 關掉之後密度仍然被文件改動`).toBe(SHIPPED_TRAIL_RATE);
      expect(s.minLife).toBe(SHIPPED_TRAIL_LIFE.min);
      expect(s.maxLife).toBe(SHIPPED_TRAIL_LIFE.max);
      expect(s.headScale, "gain 0 之下體積仍然跟著半徑跑").toBe(1);
    }
    v.dispose();
  });

  it("`projectileRadiusGain` 0 = 每一發一樣大（回退鍵），1 = 真的分得出來", () => {
    const v = new ProjectileView(scene);
    const sizesAt = (gain: number): number[] => {
      setProjectileTuning({ radiusGain: gain });
      return [...SHIPPED.values()].map((p) => {
        v.activate(p.vfxKey ? vfxDoc(p.vfxKey) : null, "bolt", p.hitRadius);
        return v.mesh.scaling.x;
      });
    };
    expect(new Set(sizesAt(0)).size, "gain 0 之下大小仍然有差 —— 回退鍵是壞的").toBe(1);
    // 出貨值 1：18 份文件的三種半徑 → 畫面上三種大小
    expect(new Set(sizesAt(1)).size, "出貨 gain 之下 18 發彈道仍然只有一種大小").toBeGreaterThanOrEqual(3);
    v.dispose();
  });

  it("`projectileFlyHeightY` 真的決定 setPose 寫進 mesh 的 Y", () => {
    setProjectileTuning({ flyHeightY: 2.5 });
    const v = new ProjectileView(scene);
    v.activate(vfxDoc("fx.thorn"), "bolt", 0.5);
    v.setPose(7, -3);
    expect(v.mesh.position.y).toBe(2.5);
    expect(v.bodyPivot.position.y).toBe(2.5);
    // 界外的值被夾回範圍內，不是照單全收（埋進地板 = 第①號故障）
    setProjectileTuning({ flyHeightY: -99 });
    v.activate(vfxDoc("fx.thorn"), "bolt", 0.5);
    v.setPose(7, -3);
    expect(v.mesh.position.y).toBeGreaterThan(0);
    v.dispose();
  });

  it("註冊表真的把 hitRadius 送到 view —— 不是只有 view 自己會用", () => {
    // 第⑤號故障的守衛：view 層做對了，而 `EntityViewRegistry` 沒把半徑傳進去，
    // 上面每一條都會照樣綠。這裡走**註冊表**那條真的路，內容 hook 用的是
    // `GameApp` 用的同一個運算式（真的 `Projectiles` registry），不是手寫的表。
    for (const [id, p] of SHIPPED) {
      Projectiles.register(id as ProjectileId, {
        id: id as ProjectileId,
        speed: 20,
        maxRange: 12,
        hitRadius: p.hitRadius,
        ...(p.vfxKey ? { vfxKey: p.vfxKey } : {}),
      } as never);
    }
    const reg = new EntityViewRegistry(scene, { load: async () => null } as never, {
      projectileVfxFor: (key: string) => {
        const def = Projectiles.tryGet(key as ProjectileId);
        return def?.vfxKey ? vfxDoc(def.vfxKey) : null;
      },
      projectileHitRadiusFor: (key: string) =>
        Projectiles.tryGet(key as ProjectileId)?.hitRadius ?? null,
    } as never);

    /**
     * 註冊表 sync 之後，那顆彈道 view 的頭光暈 mesh 的世界縮放。
     * 用 emitter 反查（拖尾的 emitter 就是那顆 mesh），因為註冊表沒有把 view
     * 本身開放出來 —— 而讀最終物件正是這條測試的重點。
     */
    const sizeFor = (key: string, id: number): number => {
      const before = new Set(scene.particleSystems);
      reg.sync({
        entities: [{ id, kind: 1, key, seatId: -1 }],
        poseFor: () => ({ x: 0, z: 0, yaw: 0 }),
        loadModels: false,
      } as never);
      const made = scene.particleSystems.filter(
        (p) => !before.has(p) && p.name.endsWith("-trail"),
      );
      expect(made.length, `${key} 沒有讓註冊表生出一個新的彈道 view`).toBe(1);
      const em = (made[0] as unknown as ParticleSystem).emitter as unknown as {
        scaling: { x: number };
      };
      return em.scaling.x;
    };
    // 兩個半徑差很多的彈道 → 註冊表出來的 view 大小必須不同
    const big = sizeFor("imported.wave.physical", 101);
    const small = sizeFor("basic-attack", 102);
    expect(big, "註冊表沒有把 hitRadius 送進 view —— 兩種彈道畫出同樣大小").not.toBe(small);
    expect(big).toBeGreaterThan(small);
    reg.dispose();
  });
});

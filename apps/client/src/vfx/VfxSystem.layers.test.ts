/**
 * vfx-ability-layers: 一支技能疊兩層,畫面上真的出現**兩組參數不同**的發射器。
 *
 * ---------------------------------------------------------------------------
 * 這一條為什麼長這樣
 * ---------------------------------------------------------------------------
 * 「schema 收得下這個形狀」是**屬性**,不是行為 —— GH#230 的普查測試綠了很久,
 * 玩家一直看到替身,就是這種形狀。所以這裡:
 *
 *   · 技能文件走**真的 `zAbilityDoc.parse`**(出貨的載入路徑就是它)。Zod 是
 *     `.strict()` 而且會丟掉不認得的 key,所以如果 `vfxLayers` 沒有真的進到
 *     schema,parse 要嘛丟例外、要嘛把欄位吃掉,兩種都會讓下面整組紅。
 *     這關的是第⑤號故障:被測的必須是**出貨的那個**。
 *   · 事件走**真的 `VfxSystem.handleEvent`**,和 GameApp 每一幀排空事件時呼叫的
 *     是同一個 method。
 *   · 斷言讀**真的 Babylon `ParticleSystem`**:`scene.particleSystems` 上的
 *     size gradient / lifetime / 名字。不是「解析出兩個 key」(屬性),是
 *     「引擎手上兩個發射器的粒子參數不一樣」(行為)。這關的是第⑦號故障。
 *
 * 突變驗證(記在 commit message 裡):把 `playLayeredCast` 的迴圈改成只取
 * `layers[0]`(第二層靜默丟掉)→ 「兩層 → 兩個發射器」與「兩個發射器參數不同」
 * 兩條紅。把 `applyLayerOverrides` 改成永遠 `return doc`(覆寫靜默失效)→
 * 「參數不同」紅。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import type { VfxDoc } from "@ggd/shared/content";
import { zAbilityDoc } from "@ggd/shared/content/schema/ability";
import { DEFAULT_ONE_SHOT_MAX_LIFE_SEC, VfxSystem, type VfxContext } from "./VfxSystem";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const loadVfx = (id: string): VfxDoc =>
  JSON.parse(readFileSync(root(`content/vfx/${id}.json`), "utf8")) as VfxDoc;
const loadAbility = (id: string): Record<string, unknown> =>
  JSON.parse(readFileSync(root(`content/abilities/${id}.json`), "utf8")) as Record<string, unknown>;

/** 出貨的一支技能,原本只有單值 `vfxKey: fx.prim.ice.shockwave`。 */
const BASE_ABILITY = "godie-n003.q";
const LAYERED = "test.layered.q";
const LEGACY = "test.legacy.q";

const PRIMARY = "fx.prim.ice.shockwave";
const SECOND = "fx.prim.fire.explosion";

let engine: NullEngine;
let scene: Scene;

/**
 * 用出貨的 doc 當骨架,加上 `vfxLayers`,**過真的 Zod**,再註冊 parse 的產物。
 * 註冊「我自己手寫的物件」就是第⑤號故障的教科書寫法,所以刻意不這樣做。
 */
function registerParsed(id: string, extra: Record<string, unknown>): void {
  const doc = { ...loadAbility(BASE_ABILITY), id, ...extra };
  const parsed = zAbilityDoc.parse(doc) as unknown as Record<string, unknown>;
  Abilities.register(id as AbilityId, parsed as never);
}

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  registerParsed(LEGACY, {});
  registerParsed(LAYERED, {
    vfxLayers: [
      { vfxKey: PRIMARY },
      // 第二層:同一個模板,但放大 3 倍、壽命拉長 2 倍 —— 參數差異必須看得見
      { vfxKey: PRIMARY, w3xScale: 3, timeScale: 2 },
    ],
  });
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

function harness(): { sys: VfxSystem; resolved: string[] } {
  const resolved: string[] = [];
  const ctx: VfxContext = {
    entityPos: () => ({ x: 0, z: 0 }),
    vfxDoc: (key: string) => {
      // 覆寫過的層帶著 `<id>#<簽章>` 的池 key,但它**解析**的仍然是原本那份
      // 文件 —— 解析發生在套覆寫之前,所以這裡只會看到乾淨的 id。
      try {
        const d = loadVfx(key);
        resolved.push(key);
        return d;
      } catch {
        return null;
      }
    },
  };
  return { sys: new VfxSystem(scene, ctx), resolved };
}

const cast = (abilityId: string, point?: { x: number; z: number }): EventMessage =>
  ({
    type: "abilityCast",
    data: { abilityId, caster: 1, ...(point ? { point } : {}) },
  }) as unknown as EventMessage;

/** 這一次施法造出來的粒子系統(用場景快照差集,不看全域計數)。 */
function newSystems(before: readonly unknown[]): { name: string; sizes: number[]; maxLife: number }[] {
  return scene.particleSystems
    .filter((ps) => !before.includes(ps))
    .map((ps) => ({
      name: ps.name,
      // ⚠️ Babylon 的 `FactorGradient` 欄位叫 `factor1`(`factor2` 是隨機上界),
      // **不是** `factor`。第一版寫 `g.factor` 拿到一串 undefined,
      // `Math.max(...)` 變 NaN,而 `not.toBeCloseTo(NaN)` 是會過的 —— 也就是
      // 第④號故障:斷言方向跟缺陷無關。下面的 `Number.isFinite` 就是釘這件事。
      sizes: (ps.getSizeGradients() ?? []).map((g) => g.factor1),
      maxLife: ps.maxLifeTime,
    }));
}

function peakSize(sizes: readonly number[]): number {
  expect(sizes.length, "這個發射器沒有 size gradient").toBeGreaterThan(0);
  for (const s of sizes) expect(Number.isFinite(s), `size 不是有限數:${String(s)}`).toBe(true);
  return Math.max(...sizes);
}

describe("多層特效模板真的變成兩組發射器 (vfx-ability-layers)", () => {
  it("Zod 真的收下 vfxLayers —— 出貨的載入路徑保留得住這個欄位", () => {
    const def = Abilities.get(LAYERED as AbilityId) as unknown as {
      vfxLayers?: { vfxKey: string }[];
    };
    expect(def.vfxLayers, "zAbilityDoc.parse 把 vfxLayers 吃掉了").toBeDefined();
    expect(def.vfxLayers).toHaveLength(2);
  });

  it("疊兩層 → 引擎手上兩個發射器,而且粒子參數不一樣", () => {
    const { sys } = harness();
    const before = [...scene.particleSystems];
    sys.handleEvent(cast(LAYERED), 1000);
    const made = newSystems(before);

    expect(made, "兩層應該造出兩個 ParticleSystem").toHaveLength(2);
    const [a, b] = made as [(typeof made)[number], (typeof made)[number]];

    // ⚠️ 這裡不是比 id 字串,是比**引擎真的拿到的粒子參數**。
    const pa = peakSize(a.sizes);
    const pb = peakSize(b.sizes);
    expect(pa).not.toBeCloseTo(pb, 5);
    // w3xScale 3 → 第二層的最大粒子尺寸應該接近三倍
    const [small, big] = pa < pb ? [a, b] : [b, a];
    expect(Math.max(pa, pb) / Math.min(pa, pb)).toBeCloseTo(3, 1);
    // 壽命也真的動了(方向對:timeScale 2 的那一層比較長)
    expect(big.maxLife).toBeGreaterThan(small.maxLife);
  });

  /**
   * ⚠️ 量到的天花板,寫成守衛而不是註解。
   *
   * 施法特效走 `frontLoadDoc` → `clampOneShotLife`,而它把任何一次性粒子的壽命
   * 夾在 `DEFAULT_ONE_SHOT_MAX_LIFE_SEC`(0.6 s)。所以一層寫 `timeScale: 2` 得到的
   * **不是** 2 倍壽命:`fx.prim.ice.shockwave` 的 0.52 s 只會變成 0.6 s。
   * timeScale 往下(變短)是完全生效的,往上會飽和。
   *
   * 這條測試存在的意義是:哪天有人把夾子拿掉或改值,這裡會紅,而不是讓
   * 「我明明設了 4 倍」變成一個只有玩家看得到的謎。owner 要的「再留一圈餘燼」
   * 如果需要長於 0.6 s 的尾巴,要動的是這個常數(或給層一條不走 front-load 的
   * 路),不是調 timeScale。
   */
  it("timeScale 往上會被一次性壽命夾子擋住（0.6 s 天花板，量到的）", () => {
    registerParsed("test.longtail.q", {
      vfxLayers: [{ vfxKey: PRIMARY, timeScale: 4 }],
    });
    const { sys } = harness();
    const before = [...scene.particleSystems];
    sys.handleEvent(cast("test.longtail.q"), 40_000);
    const made = newSystems(before);
    expect(made).toHaveLength(1);
    expect(made[0]!.maxLife).toBeCloseTo(DEFAULT_ONE_SHOT_MAX_LIFE_SEC, 5);
  });

  it("timeScale 往下（變短）是完全生效的，沒有被夾", () => {
    registerParsed("test.snappy.q", {
      vfxLayers: [{ vfxKey: PRIMARY, timeScale: 0.4 }],
    });
    const { sys } = harness();
    const before = [...scene.particleSystems];
    sys.handleEvent(cast("test.snappy.q"), 50_000);
    const made = newSystems(before);
    expect(made).toHaveLength(1);
    // 出貨文件的 lifetimeSec.max 是 0.52 → ×0.4 = 0.208
    expect(made[0]!.maxLife).toBeCloseTo(0.208, 3);
  });

  it("兩層拿到各自的池,不會借到對方那個已經建好的發射器", () => {
    const { sys } = harness();
    const before = [...scene.particleSystems];
    sys.handleEvent(cast(LAYERED), 2000);
    const names = newSystems(before).map((s) => s.name);
    expect(new Set(names).size, `兩層共用了同一個池 key: ${names.join(" / ")}`).toBe(2);
  });

  it("向後相容:只有單值 vfxKey 的技能,還是恰好一個發射器、一份文件", () => {
    const { sys, resolved } = harness();
    const before = [...scene.particleSystems];
    sys.handleEvent(cast(LEGACY), 3000);
    expect(resolved).toEqual([PRIMARY]);
    const made = newSystems(before);
    expect(made).toHaveLength(1);
    // 名字就是**未經修改**的 doc id —— 有任何覆寫都會變成 `<id>#…`
    expect(made[0]!.name).toBe(`vfx-${PRIMARY}`);
  });

  it("延遲層在 delayMs 之前不畫,到期的那一幀才畫", () => {
    registerParsed("test.delayed.q", {
      vfxLayers: [{ vfxKey: PRIMARY }, { vfxKey: SECOND, delayMs: 400 }],
    });
    const { sys } = harness();
    const before = [...scene.particleSystems];
    sys.handleEvent(cast("test.delayed.q"), 10_000);
    expect(newSystems(before), "delay 那一層不該在施法幀就出現").toHaveLength(1);

    sys.update(10_200); // 還沒到
    expect(newSystems(before)).toHaveLength(1);

    sys.update(10_400); // 到期
    const after = newSystems(before);
    expect(after).toHaveLength(2);
    expect(after.some((s) => s.name === `vfx-${SECOND}`)).toBe(true);
  });

  it("回合切換會把還沒播的延遲層丟掉（不會爆在商店場景）", () => {
    const { sys } = harness();
    const before = [...scene.particleSystems];
    sys.handleEvent(cast("test.delayed.q"), 20_000);
    sys.resetForRound();
    sys.update(20_400);
    // `resetForRound` 把池整個 dispose 掉,而 dispose 會把系統從
    // `scene.particleSystems` 移除 —— 所以「這一輪之後仍然在場景上的新系統」
    // 就是「被重新造出來的」。延遲層若沒被清掉,`update(20_400)` 會 play() 它,
    // 那一刻就會冒出一個叫 `vfx-fx.prim.fire.explosion` 的新系統。
    const live = scene.particleSystems.filter((ps) => !before.includes(ps));
    expect(live.map((p) => p.name)).not.toContain(`vfx-${SECOND}`);
  });

  it("attachTo: point 真的把那一層放到技能落點,不是施法者腳下", () => {
    registerParsed("test.point.q", {
      vfxLayers: [{ vfxKey: PRIMARY }, { vfxKey: SECOND, attachTo: "point" }],
    });
    const { sys } = harness();
    const before = [...scene.particleSystems];
    sys.handleEvent(cast("test.point.q", { x: 7, z: -4 }), 30_000);
    const made = scene.particleSystems.filter((ps) => !before.includes(ps));
    const second = made.find((ps) => ps.name === `vfx-${SECOND}`);
    expect(second, "第二層沒被造出來").toBeDefined();
    const e = second!.emitter as { x: number; z: number };
    expect(e.x).toBeCloseTo(7, 5);
    expect(e.z).toBeCloseTo(-4, 5);
    // 而施法者那一層仍然在 (0,0)
    const first = made.find((ps) => ps.name === `vfx-${PRIMARY}`);
    const fe = first!.emitter as { x: number; z: number };
    expect(fe.x).toBeCloseTo(0, 5);
  });
});

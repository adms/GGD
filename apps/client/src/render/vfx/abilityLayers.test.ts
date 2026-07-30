/**
 * 多層特效模板 · 讀取端的純邏輯守衛 (#205).
 *
 * 這裡守三件行為(不是三個屬性):
 *   1. **向後相容是 identity,不是「數值算起來一樣」**。零覆寫的層必須回傳
 *      *同一個物件 reference*(`toBe`),因為池 key、`frontLoadDoc` 的 memo、
 *      粒子參數全部掛在它上面。
 *   2. **層數上限真的接在畫面預算上**。HARD_CAP 與 `emitterBudget` 的常數之間
 *      是等式,不是「差不多」;改預算而沒改上限,這裡紅。
 *   3. **宣告的覆寫欄位每一個都被消費**。schema 開了欄位而讀取端不讀它,就是
 *      第②號故障(算了但沒送到)。這條測試會把新加的欄位抓出來。
 */
import { describe, it, expect } from "vitest";
import type { VfxDoc } from "@ggd/shared/content";
import {
  ABILITY_VFX_LAYER_HARD_CAP,
  ABILITY_VFX_LAYER_OVERRIDE_FIELDS,
  DEFAULT_MAX_ABILITY_VFX_LAYERS,
  resolveAbilityVfxLayers,
  type AbilityVfxLayer,
} from "@ggd/shared/content/schema/abilityVfx";
import {
  MAX_SYSTEMS_PER_EFFECT,
  SCREEN_SYSTEM_BUDGET,
} from "./emitterBudget";
import { MAX_LIVE_W3X_EFFECTS } from "../../vfx/W3xCastFx";
import {
  applyLayerOverrides,
  castLayersFor,
  layerHeightY,
  layerPosition,
  maxAbilityVfxLayers,
  setMaxAbilityVfxLayers,
  WC3_UNITS_PER_WORLD_UNIT,
} from "./abilityLayers";

const DOC: VfxDoc = {
  id: "fx.test.base",
  schema: "vfx@1",
  emitter: { shape: "sphere", radius: 0.4 },
  mode: "burst",
  burstCount: 20,
  lifetimeSec: { min: 0.2, max: 0.5 },
  size: { start: 0.3, end: 0 },
  color: { start: [1, 1, 1, 1], end: [0.2, 0.2, 0.2, 0] },
  blendMode: "additive",
} as VfxDoc;

const layer = (o: Partial<AbilityVfxLayer> = {}): AbilityVfxLayer =>
  ({ vfxKey: "fx.test.base", ...o }) as AbilityVfxLayer;

describe("向後相容:單值 vfxKey 一位元不差", () => {
  it("只有 vfxKey 的技能解析成恰好一層、零覆寫、delay 0、跟施法者", () => {
    const got = castLayersFor({ vfxKey: "fx.prim.void.nova" });
    expect(got).toEqual([
      { vfxKey: "fx.prim.void.nova", attachTo: "caster", delayMs: 0, overrides: undefined },
    ]);
  });

  it("零覆寫的層拿到的是**同一個 VfxDoc 物件**（reference 相等）", () => {
    const [l] = castLayersFor({ vfxKey: "fx.test.base" });
    // ⚠️ toBe，不是 toEqual。一份拷貝在數值上完全一樣，但會拿到不同的池 key、
    // 繞過 `shaped` memo，也就是「升級後行為悄悄變了」的那一種。
    expect(applyLayerOverrides(DOC, l!)).toBe(DOC);
  });

  it("兩個都沒有 → 空堆疊（施法不畫東西，和以前一樣）", () => {
    expect(castLayersFor({})).toEqual([]);
    expect(castLayersFor(null)).toEqual([]);
  });

  it("有 vfxLayers 時它就是完整堆疊，vfxKey 不再被隱含插入第一層", () => {
    const got = castLayersFor({
      vfxKey: "fx.prim.void.nova",
      vfxLayers: [layer({ vfxKey: "fx.a" }), layer({ vfxKey: "fx.b" })],
    });
    expect(got.map((l) => l.vfxKey)).toEqual(["fx.a", "fx.b"]);
  });
});

describe("覆寫真的改到 doc（而且拿到自己的池 key）", () => {
  it("w3xScale 乘到 size 與 emitter 半徑上", () => {
    const [l] = castLayersFor({ vfxLayers: [layer({ w3xScale: 2 })] });
    const out = applyLayerOverrides(DOC, l!);
    expect(out).not.toBe(DOC);
    expect(out.size.start).toBeCloseTo(0.6, 5);
    expect(out.emitter.shape === "sphere" ? out.emitter.radius : 0).toBeCloseTo(0.8, 5);
  });

  it("alpha 乘到每一個 stop 的 a 上", () => {
    const [l] = castLayersFor({ vfxLayers: [layer({ alpha: 0.5 })] });
    const out = applyLayerOverrides(DOC, l!);
    expect(out.color.start[3]).toBeCloseTo(0.5, 4);
  });

  it("timeScale 乘到壽命上", () => {
    const [l] = castLayersFor({ vfxLayers: [layer({ timeScale: 2 })] });
    expect(applyLayerOverrides(DOC, l!).lifetimeSec.max).toBeCloseTo(1.0, 5);
  });

  it("tint 是 0–255（w3u 的 uclr 座標系），除以 255 之後才進 doc", () => {
    const [l] = castLayersFor({ vfxLayers: [layer({ tint: [255, 0, 0] })] });
    const out = applyLayerOverrides(DOC, l!);
    // 白熱核心被染成紅：紅通道遠大於綠/藍
    expect(out.color.start[0]).toBeGreaterThan(out.color.start[1] + 0.5);
    expect(out.color.start[2]).toBeCloseTo(0, 4);
  });

  it("flyHeight 是 WC3 單位（128 = 1 世界單位），而且不改 doc 只改播放高度", () => {
    const [l] = castLayersFor({ vfxLayers: [layer({ flyHeight: 256 })] });
    expect(layerHeightY(l!)).toBeCloseTo(256 / WC3_UNITS_PER_WORLD_UNIT, 6);
    // 純空間參數 → doc 不該被複製出一份新的（那會憑空多開一格池）
    expect(applyLayerOverrides(DOC, l!)).toBe(DOC);
  });

  it("同樣的覆寫 → 同一個池 key；不同的覆寫 → 不同的池 key", () => {
    const same = castLayersFor({ vfxLayers: [layer({ w3xScale: 2 }), layer({ w3xScale: 2 })] });
    const diff = castLayersFor({ vfxLayers: [layer({ w3xScale: 2 }), layer({ w3xScale: 3 })] });
    expect(applyLayerOverrides(DOC, same[0]!).id).toBe(applyLayerOverrides(DOC, same[1]!).id);
    expect(applyLayerOverrides(DOC, diff[0]!).id).not.toBe(applyLayerOverrides(DOC, diff[1]!).id);
  });

  /**
   * ⛔ 反第②號故障。schema 每開一個覆寫欄位,讀取端就必須真的消費它 —— 不然
   * 後台/內容作者填了,畫面上什麼都不會變。新增欄位而忘了接線,這條紅。
   */
  it("schema 宣告的每一個覆寫欄位都真的被消費（改 doc 或改播放位置）", () => {
    const untouched: string[] = [];
    for (const f of ABILITY_VFX_LAYER_OVERRIDE_FIELDS) {
      const probe: Record<string, unknown> =
        f === "tint" ? { tint: [255, 0, 0] } : f === "flyHeight" ? { flyHeight: 512 } : { [f]: 2 };
      // alpha 的合法上界是 1 —— 用 2 會被 schema 擋,這裡走純函式所以要自己給合法值
      if (f === "alpha") probe["alpha"] = 0.5;
      const [l] = castLayersFor({ vfxLayers: [layer(probe as Partial<AbilityVfxLayer>)] });
      const changedDoc = applyLayerOverrides(DOC, l!) !== DOC;
      const changedHeight = layerHeightY(l!) !== layerHeightY(castLayersFor({ vfxKey: "x" })[0]!);
      if (!changedDoc && !changedHeight) untouched.push(f);
    }
    expect(
      untouched,
      `這些覆寫欄位在 schema 開著，但讀取端沒有消費它們（填了不會有畫面變化）：${untouched.join(", ")}`,
    ).toEqual([]);
  });
});

describe("attachTo 的落點", () => {
  it("caster（預設）用施法者位置", () => {
    const [l] = castLayersFor({ vfxKey: "x" });
    expect(layerPosition(l!, { x: 1, z: 2 }, { x: 9, z: 9 })).toEqual({ x: 1, z: 2 });
  });

  it("point 用技能落點", () => {
    const [l] = castLayersFor({ vfxLayers: [layer({ attachTo: "point" })] });
    expect(layerPosition(l!, { x: 1, z: 2 }, { x: 9, z: 9 })).toEqual({ x: 9, z: 9 });
  });

  it("point 但這一招沒有落點（self / dash）→ 退回施法者，不是丟到地圖原點", () => {
    const [l] = castLayersFor({ vfxLayers: [layer({ attachTo: "point" })] });
    expect(layerPosition(l!, { x: 1, z: 2 }, null)).toEqual({ x: 1, z: 2 });
    expect(layerPosition(l!, { x: 1, z: 2 }, { x: NaN, z: 0 })).toEqual({ x: 1, z: 2 });
  });
});

describe("層數上限接在畫面預算上（不是憑感覺挑的數字）", () => {
  /**
   * shared 不可以 import client,所以常數寫在 shared、等式釘在這裡。
   * 一層至少吃一個 ParticleSystem,而 `MAX_SYSTEMS_PER_EFFECT` 就是
   * 「一次特效無論如何不准超過幾個 system」那條線。
   */
  it("HARD_CAP === emitterBudget.MAX_SYSTEMS_PER_EFFECT", () => {
    expect(ABILITY_VFX_LAYER_HARD_CAP).toBe(MAX_SYSTEMS_PER_EFFECT);
  });

  /** 12 位英雄同時放到滿,總 system 數仍在整個畫面的預算內。 */
  it("出貨預設 === floor(SCREEN_SYSTEM_BUDGET / MAX_LIVE_W3X_EFFECTS)", () => {
    expect(DEFAULT_MAX_ABILITY_VFX_LAYERS).toBe(
      Math.floor(SCREEN_SYSTEM_BUDGET / MAX_LIVE_W3X_EFFECTS),
    );
    expect(DEFAULT_MAX_ABILITY_VFX_LAYERS * MAX_LIVE_W3X_EFFECTS).toBeLessThanOrEqual(
      SCREEN_SYSTEM_BUDGET,
    );
  });

  it("超過上限的層從後面砍 —— 主特效那一層永遠留著", () => {
    const many = Array.from({ length: 6 }, (_, i) => layer({ vfxKey: `fx.${i}` }));
    const got = resolveAbilityVfxLayers({ vfxLayers: many }, 2);
    expect(got.map((l) => l.vfxKey)).toEqual(["fx.0", "fx.1"]);
  });

  it("後台傳來的荒謬值被夾住，不是照單全收", () => {
    expect(resolveAbilityVfxLayers({ vfxLayers: [layer(), layer()] }, 0)).toHaveLength(1);
    const many = Array.from({ length: 6 }, (_, i) => layer({ vfxKey: `fx.${i}` }));
    expect(resolveAbilityVfxLayers({ vfxLayers: many }, 999)).toHaveLength(
      ABILITY_VFX_LAYER_HARD_CAP,
    );
  });

  it("後台裝上的上限真的生效，清掉會回到出貨預設", () => {
    try {
      setMaxAbilityVfxLayers(2);
      expect(maxAbilityVfxLayers()).toBe(2);
      const many = Array.from({ length: 4 }, (_, i) => layer({ vfxKey: `fx.${i}` }));
      expect(castLayersFor({ vfxLayers: many }, maxAbilityVfxLayers())).toHaveLength(2);
    } finally {
      setMaxAbilityVfxLayers(undefined);
    }
    expect(maxAbilityVfxLayers()).toBe(DEFAULT_MAX_ABILITY_VFX_LAYERS);
  });

  it("enabled:false 的層被濾掉（留著設定，不用刪）", () => {
    const got = castLayersFor({
      vfxLayers: [layer({ vfxKey: "fx.a" }), layer({ vfxKey: "fx.b", enabled: false })],
    });
    expect(got.map((l) => l.vfxKey)).toEqual(["fx.a"]);
  });
});

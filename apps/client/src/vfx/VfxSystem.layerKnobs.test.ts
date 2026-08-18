/**
 * vfx-layer-knobs —— 多層特效堆疊那四個「零採用」的覆寫格 + `attachTo=caster`，
 * 從**後台表單的一格文字**一路到**引擎手上的粒子參數** (#205 / #230).
 *
 * ---------------------------------------------------------------------------
 * 這條守衛存在的理由：`fieldAdoption` 的歸屬要有證據，不能只有主張
 * ---------------------------------------------------------------------------
 * `packages/shared/src/content/fieldAdoption.test.ts` 的普查報 5 個 key
 * 「供給有、需求 0」：`vfxLayers[].alpha` / `.enabled` / `.timeScale` / `.tint`
 * 以及 `enum:vfxLayers[].attachTo=caster`。把它們寫成 `default-live`（有預設值、
 * 欄位只是覆寫）需要證明**兩件事**，而且兩件都不是「schema 裡有這個欄位」：
 *
 *   1. **後台真的設得到** —— 鑄技工坊的堆疊表上真的有那一格，而且存檔真的把值
 *      寫進技能文件。⚠️ `apps/admin/src/vfxLayers.ts` 的 `layerFromDraft` 是用
 *      **手打的欄位名陣列**在搬值的（`["delayMs","w3xScale","flyHeight","alpha",
 *      "timeScale"]`），少一個就是「畫面上有格子、存下去什麼都沒有」——
 *      所以最後一條用 `DECLARED_OVERRIDE_FIELDS` 對著它做集合驗證。
 *   2. **執行期真的讀得到** —— 同一支技能、同一個施法事件，只因為那一格填了
 *      東西，**Babylon 真的拿到的顏色梯度 / 壽命 / 發射器座標 / 發射器數量就不一樣**。
 *
 * 所以這裡刻意**不**從手寫的 `vfxLayers` 物件出發（那是第⑤號故障：被測的不是
 * 出貨的那個），而是從 `emptyLayerDraft` 的空白表單開始，經過出貨的
 * `abilityDocWithLayers`（後台按「儲存」時真的呼叫的那一支）產生整份技能文件，
 * 再過真的 `zAbilityDoc.parse` 進 registry，最後走真的 `VfxSystem.handleEvent`。
 *
 * ⚠️ 斷言一律讀最終物件（`ps.getColorGradients()` / `ps.maxLifeTime` /
 * `ps.emitter`），不讀中間函式的回傳值 —— 「函式回傳了 0.35」是屬性，
 * 「引擎手上的 alpha 變成 0.35 倍」才是行為（第⑦號故障）。
 *
 * 突變驗證（都真的跑過，紀錄在 commit message）：
 *   · `applyLayerOverrides` 改成永遠 `return doc`（覆寫靜默失效）→ α / 染色 /
 *     時間倍率三條紅。
 *   · `resolveAbilityVfxLayers` 的 `if (layer.enabled === false) continue` 拿掉
 *     → 「停用的那一層不進引擎」紅。
 *   · `layerPosition` 的 `layer.attachTo === "point"` 改成永遠 true
 *     → 「明寫 caster 的層留在施法者腳下」紅。
 *   · `layerFromDraft` 的搬運陣列拿掉 `"alpha"` → 「宣告的每一格都存得下去」紅。
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
// ⚠️ 後台那一側的**出貨模組**，不是一份仿造品。這條 import 就是「後台真的設得到」
// 這半邊證據的來源：測試裡填的每一格都是操作者在鑄技工坊會看到的同一個 key，
// 產生文件的也是「儲存」按鈕真的呼叫的同一支函式。
import {
  DECLARED_OVERRIDE_FIELDS,
  LAYER_FIELDS,
  abilityDocWithLayers,
  emptyLayerDraft,
  type LayerDraft,
} from "../../../admin/src/vfxLayers";
import { VfxSystem, type VfxContext } from "./VfxSystem";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const readJson = (p: string): unknown => JSON.parse(readFileSync(root(p), "utf8")) as unknown;

/** 借一支**出貨**技能當骨架（原本只有單值 `vfxKey: fx.prim.ice.shockwave`）。 */
const BASE_ABILITY = "godie-n003.q";
const PRIMARY = "fx.prim.ice.shockwave";
const SECOND = "fx.prim.fire.explosion";

let engine: NullEngine;
let scene: Scene;
let baseDoc: Record<string, unknown>;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  baseDoc = readJson(`content/abilities/${BASE_ABILITY}.json`) as Record<string, unknown>;
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

/** 表單上的一列：只寫操作者真的打進去的那幾格，其餘留白。 */
type Row = Readonly<Record<string, string>>;

function draftOf(row: Row): LayerDraft {
  const d = emptyLayerDraft(row["vfxKey"] ?? PRIMARY);
  for (const [k, v] of Object.entries(row)) {
    expect(LAYER_FIELDS, `表單上沒有「${k}」這一格`).toContain(k);
    d[k] = v;
  }
  return d;
}

/**
 * 後台表單 → 整份技能文件 → 真的 Zod → registry。
 *
 * 回傳的是**寫進文件的那個 `vfxLayers`**，所以呼叫端可以先斷言「值真的落進
 * 文件了」（第②號故障：算出來但從沒送出去），再去看畫面。
 */
function saveFromForm(id: string, rows: readonly Row[]): Record<string, unknown>[] {
  const { doc, error } = abilityDocWithLayers({ ...baseDoc, id }, rows.map(draftOf));
  expect(error, `後台拒絕存檔：${String(error)}`).toBeNull();
  expect(doc).not.toBeNull();
  const parsed = zAbilityDoc.parse(doc) as unknown as Record<string, unknown>;
  Abilities.register(id as AbilityId, parsed as never);
  return (parsed["vfxLayers"] ?? []) as Record<string, unknown>[];
}

interface Made {
  readonly name: string;
  /** 顏色梯度每一階的 rgba（Babylon 的 `color1`） */
  readonly colors: [number, number, number, number][];
  readonly maxLife: number;
  readonly x: number;
  readonly z: number;
}

function harness(): VfxSystem {
  const ctx: VfxContext = {
    // 施法者刻意**不在原點**：這樣「退回施法者」和「掉到地圖中央」才分得出來。
    entityPos: () => ({ x: CASTER.x, z: CASTER.z }),
    vfxDoc: (key: string): VfxDoc | null => {
      try {
        return readJson(`content/vfx/${key}.json`) as VfxDoc;
      } catch {
        return null;
      }
    },
  };
  return new VfxSystem(scene, ctx);
}

const CASTER = { x: -5, z: 3 } as const;
const POINT = { x: 9, z: -6 } as const;

const cast = (abilityId: string, point?: { x: number; z: number }): EventMessage =>
  ({
    type: "abilityCast",
    data: { abilityId, caster: 1, ...(point ? { point } : {}) },
  }) as unknown as EventMessage;

/** 這一次施法讓引擎多出來的發射器（用場景快照差集，不看全域計數）。 */
function fire(abilityId: string, atMs: number, point?: { x: number; z: number }): Made[] {
  const sys = harness();
  const before = [...scene.particleSystems];
  sys.handleEvent(cast(abilityId, point), atMs);
  return scene.particleSystems
    .filter((ps) => !before.includes(ps))
    .map((ps) => {
      const e = ps.emitter as { x: number; z: number };
      return {
        name: ps.name,
        colors: (ps.getColorGradients() ?? []).map(
          (g) => [g.color1.r, g.color1.g, g.color1.b, g.color1.a] as [number, number, number, number],
        ),
        maxLife: ps.maxLifeTime,
        x: e.x,
        z: e.z,
      };
    });
}

function only(made: readonly Made[]): Made {
  expect(made.map((m) => m.name).join(" / ")).toBeTruthy();
  expect(made, "這次施法應該只造出一個發射器").toHaveLength(1);
  return made[0]!;
}

function peakAlpha(m: Made): number {
  expect(m.colors.length, `${m.name} 沒有 colour gradient`).toBeGreaterThan(0);
  for (const c of m.colors) {
    expect(Number.isFinite(c[3]), `alpha 不是有限數：${String(c[3])}`).toBe(true);
  }
  return Math.max(...m.colors.map((c) => c[3]));
}

/** 最亮那一階的 rgb —— 染色看的是它（尾端的深色階任何顏色都接近 0）。 */
function brightestRgb(m: Made): [number, number, number] {
  expect(m.colors.length, `${m.name} 沒有 colour gradient`).toBeGreaterThan(0);
  let best = m.colors[0]!;
  for (const c of m.colors) if (c[0] + c[1] + c[2] > best[0] + best[1] + best[2]) best = c;
  return [best[0], best[1], best[2]];
}

// ---------------------------------------------------------------------------
// 基準線：同一支技能、同一格留白 —— 下面每一條都要跟它比
// ---------------------------------------------------------------------------

const PLAIN = "test.layerknob.plain.q";
let plain: Made;

beforeAll(() => {
  saveFromForm(PLAIN, [{ vfxKey: PRIMARY }]);
  plain = only(fire(PLAIN, 1_000));
});

describe("後台填一格 α → 引擎手上的顏色梯度真的變淡 (vfx-layer-knobs)", () => {
  const ID = "test.layerknob.alpha.q";

  it("表單的「0.35」變成文件裡的 alpha: 0.35（數字，不是字串）", () => {
    const layers = saveFromForm(ID, [{ vfxKey: PRIMARY, alpha: "0.35" }]);
    expect(layers[0]!["alpha"], "後台存檔沒有把 alpha 寫進技能文件").toBe(0.35);
  });

  it("同一個施法事件，只因為那一格填了 0.35，Babylon 拿到的 alpha 就是 0.35 倍", () => {
    const faded = only(fire(ID, 2_000));
    const before = peakAlpha(plain);
    const after = peakAlpha(faded);
    expect(before, "基準線本身就是透明的話，這一條測不出東西").toBeGreaterThan(0.5);
    expect(after).toBeLessThan(before);
    expect(after / before).toBeCloseTo(0.35, 2);
  });
});

describe("後台填三格顏色 → 引擎手上的粒子真的被染色", () => {
  const ID = "test.layerknob.tint.q";

  it("表單的 255/40/40 變成文件裡的 tint: [255,40,40]（0–255 的 w3u 座標系）", () => {
    const layers = saveFromForm(ID, [{ vfxKey: PRIMARY, tintR: "255", tintG: "40", tintB: "40" }]);
    expect(layers[0]!["tint"], "後台存檔沒有把 tint 寫進技能文件").toEqual([255, 40, 40]);
  });

  it("出貨模板是冰藍（b > r），染紅之後引擎手上變成 r > b —— 方向真的反過來", () => {
    const red = only(fire(ID, 3_000));
    const [br, , bb] = brightestRgb(plain);
    expect(bb, "基準線本身不是偏藍的話，這一條的方向沒有意義").toBeGreaterThan(br);
    const [rr, rg, rb] = brightestRgb(red);
    expect(rr).toBeGreaterThan(rb);
    expect(rr).toBeGreaterThan(rg);
  });
});

describe("後台填一格時間倍率 → 引擎手上的壽命真的變短", () => {
  const ID = "test.layerknob.time.q";

  it("表單的「0.4」變成文件裡的 timeScale: 0.4", () => {
    const layers = saveFromForm(ID, [{ vfxKey: PRIMARY, timeScale: "0.4" }]);
    expect(layers[0]!["timeScale"], "後台存檔沒有把 timeScale 寫進技能文件").toBe(0.4);
  });

  /**
   * ⚠️ 方向刻意選**變短**。往上會被 `clampOneShotLife` 的一次性壽命天花板飽和
   * （`VfxSystem.layers.test.ts` 有一條專門釘那個天花板），拿它當斷言等於第④號
   * 故障：對正確與壞掉的實作都會過。
   */
  it("同一個施法事件，只因為那一格填了 0.4，maxLifeTime 就是 0.4 倍", () => {
    const snappy = only(fire(ID, 4_000));
    expect(plain.maxLife).toBeGreaterThan(0);
    expect(snappy.maxLife).toBeLessThan(plain.maxLife);
    expect(snappy.maxLife / plain.maxLife).toBeCloseTo(0.4, 2);
  });
});

describe("後台把一層關掉 → 那一層根本不進引擎", () => {
  const ON = "test.layerknob.on.q";
  const OFF = "test.layerknob.off.q";

  it("兩層都開著 → 引擎手上兩個發射器（沒有這一步，下面那條可能只是層數本來就錯）", () => {
    saveFromForm(ON, [{ vfxKey: PRIMARY }, { vfxKey: SECOND }]);
    const made = fire(ON, 5_000);
    expect(made.map((m) => m.name).sort()).toEqual([`vfx-${PRIMARY}`, `vfx-${SECOND}`].sort());
  });

  it("第二層的「播不播」切成關 → 文件寫 enabled:false，引擎只拿到第一層", () => {
    const layers = saveFromForm(OFF, [{ vfxKey: PRIMARY }, { vfxKey: SECOND, enabled: "0" }]);
    expect(layers[1]!["enabled"], "後台存檔沒有把 enabled 寫進技能文件").toBe(false);
    const made = fire(OFF, 6_000);
    expect(
      made.map((m) => m.name),
      "停用的那一層還是被畫出來了（設定留著 ≠ 繼續播）",
    ).toEqual([`vfx-${PRIMARY}`]);
  });

  it("⚠️「開」是省略出來的：留白 → 文件裡沒有 enabled 這個 key（不是寫 true）", () => {
    const layers = saveFromForm("test.layerknob.blank.q", [{ vfxKey: PRIMARY }]);
    expect(Object.keys(layers[0]!)).toEqual(["vfxKey"]);
  });
});

describe("attachTo=caster：明寫和省略是同一個行為，而且不是 point", () => {
  const EXPLICIT = "test.layerknob.caster.q";
  const POINTED = "test.layerknob.point.q";

  it("下拉選「施法者」→ 文件真的寫 attachTo: \"caster\"（不是被當成留白吃掉）", () => {
    const layers = saveFromForm(EXPLICIT, [{ vfxKey: PRIMARY, attachTo: "caster" }]);
    expect(layers[0]!["attachTo"], "後台存檔沒有把 attachTo 寫進技能文件").toBe("caster");
  });

  /**
   * 這一條才是「`caster` 是 `default-live` 而不是死列舉」的證據：施法事件**帶著
   * 落點**，明寫 `caster` 的那一層仍然落在施法者身上，而且座標和留白那一版
   * 一模一樣；同一個事件換成 `point` 就跑到落點去。三者互相對照，任何一個
   * 「其實沒讀」的實作都過不了。
   */
  it("同一個帶落點的施法：明寫 caster 留在施法者、省略也留在施法者、point 跑到落點", () => {
    saveFromForm(POINTED, [{ vfxKey: PRIMARY, attachTo: "point" }]);

    const explicit = only(fire(EXPLICIT, 7_000, POINT));
    const omitted = only(fire(PLAIN, 7_100, POINT));
    const pointed = only(fire(POINTED, 7_200, POINT));

    expect(explicit.x).toBeCloseTo(CASTER.x, 5);
    expect(explicit.z).toBeCloseTo(CASTER.z, 5);
    // 明寫 = 省略，一位元不差 —— 這就是「零採用是對的」的意思
    expect([explicit.x, explicit.z]).toEqual([omitted.x, omitted.z]);
    // 而且不是「反正都畫在施法者」：換成 point 真的會動
    expect(pointed.x).toBeCloseTo(POINT.x, 5);
    expect(pointed.z).toBeCloseTo(POINT.z, 5);
  });

  it("明寫 caster 不會多開一格粒子池（attachTo 不是覆寫，不進池 key 簽章）", () => {
    const explicit = only(fire(EXPLICIT, 8_000, POINT));
    expect(explicit.name).toBe(`vfx-${PRIMARY}`);
  });
});

/**
 * ⛔ 反第②號故障的總閘。
 *
 * `layerFromDraft` 用**手打的欄位名陣列**把草稿搬進層物件；schema 那邊卻是
 * `zVfxAbilityFamilyBinding.pick(...)` 自動長出來的。有人往 schema 加一個覆寫
 * 欄位（或改一個名字）而沒有同步那個陣列，畫面上會出現一格、填了、存檔成功、
 * 場上什麼都不會變 —— 而且上面每一條都還是綠的。這一條就是那個缺口。
 */
describe("schema 宣告的每一個覆寫格，後台都真的存得下去", () => {
  /** 每一格一個**合法**的樣本值（上下界見 `ABILITY_BOUNDS`）。 */
  const SAMPLE: Readonly<Record<string, Row>> = {
    w3xScale: { w3xScale: "2" },
    flyHeight: { flyHeight: "256" },
    alpha: { alpha: "0.5" },
    timeScale: { timeScale: "0.5" },
    tint: { tintR: "255", tintG: "40", tintB: "40" },
    // 方位 (GH#366)。⚠️ 樣本值刻意**不是** 0：`facingDeg: 0` 與 `pitchDeg: 90`
    // 都是恆等變換（`orientIsIdentity`），存進去之後這條守衛看到的
    // 「有值」與「被丟掉」長得一樣，於是它會對整條路徑撒謊。
    facingDeg: { facingDeg: "45" },
    pitchDeg: { pitchDeg: "0" },
  };

  it("每一格填了都會出現在文件的那一層上（少一格 = 畫面上有格子、存下去沒東西）", () => {
    const missing: string[] = [];
    for (const field of DECLARED_OVERRIDE_FIELDS) {
      const row = SAMPLE[field];
      expect(row, `新的覆寫欄位「${field}」還沒有樣本值，這條守衛需要補一個`).toBeDefined();
      // ⚠️ id 必須小寫 —— `zAbilityDoc` 對 id 有格式規則，`w3xScale` 直接塞進去
      // 會被擋下來，而那個紅講的是 id 不是欄位，會把真正的訊號蓋掉。
      const { doc, error } = abilityDocWithLayers(
        { ...baseDoc, id: `test.layerknob.decl.${field.toLowerCase()}.q` },
        [draftOf({ vfxKey: PRIMARY, ...row! })],
      );
      expect(error, `${field}：後台拒絕存檔 —— ${String(error)}`).toBeNull();
      const layer = (doc!["vfxLayers"] as Record<string, unknown>[])[0]!;
      if (layer[field] === undefined) missing.push(field);
    }
    expect(
      missing,
      `這些覆寫格在 schema 開著、後台畫得出來，但存檔時被丟掉了：${missing.join(", ")}`,
    ).toEqual([]);
  });
});

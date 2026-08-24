/**
 * 餘燼壽命上限是**後台欄位**,不是模組常數 (owner 2026-07-30 裁決 (a))。
 *
 * ---------------------------------------------------------------------------
 * 這一條為什麼長這樣
 * ---------------------------------------------------------------------------
 * 這一格特別容易變成「後台自洽地說謊」:欄位在 schema 裡、後台頁畫得出來、
 * `familiesDocFor` 存得回去 —— 而**客戶端根本沒讀**,粒子照樣 0.6 秒就沒了。
 * 那正是第②號故障(算出來但從沒送到)。所以這裡:
 *
 *   · 一律跑真的 `NullEngine` + 真的 `VfxSystem.handleEvent`(GameApp 每一幀
 *     排空事件時呼叫的同一個 method);
 *   · 斷言讀**真的 Babylon `ParticleSystem.maxLifeTime`** —— 不是
 *     「`frontLoadDoc` 回傳了 2」,不是「schema 收得下 2」,不是「頁面顯示 2」;
 *   · 用的是**出貨的 vfx 文件**(`fx.w3x.particle.lasercannonfinalred.p03`
 *     壽命 4 秒、`godie-blackhole1-p2` 壽命 3.5 秒的 burst),技能文件過真的
 *     `zAbilityDoc.parse`。手寫一份假 doc 就是第⑤號故障(被測的不是出貨的那個)。
 *
 * ⚠️ 「後台改成 2.0」那一條刻意用**同一個 `VfxSystem` 實例**。這不是為了省事:
 * `VfxSystem` 有 `shaped`(每份 doc 的播放形狀 memo)和 `pool`(每個 doc id 一條
 * `ParticleSystem` free-list,而壽命是**建立當下**烘進去的)兩層快取。天花板改了
 * 卻沿用舊 key 的話,`play()` 會撈回照 0.6 建好的那個 system —— 全鏈路都算對了
 * 2.0,畫面上還是 0.6。用同一個實例才驗得到這件事。
 *
 * ---------------------------------------------------------------------------
 * 突變驗證(記進 commit message)
 * ---------------------------------------------------------------------------
 *   1. 把 `clampOneShotLife` 的預設參數改回讀模組常數
 *      (`maxLifeSec = DEFAULT_ONE_SHOT_MAX_LIFE_SEC`)→「後台改成 2.0」那兩條紅。
 *   2. 把 `VfxSystem.shapeOf` 的 memo key 改回只有 `doc.id` → 同一實例那一條紅。
 *   3. 把 `frontLoadDoc` 的 `lifeShapedId` 拿掉(池 key 不換)→ 同一實例那一條紅。
 *   4. 把 `ContentDb` 的 `setOneShotMaxLifeSec(...)` 那一行刪掉 →
 *      `ContentDb.test.ts` 的「config 裡的值在 load() 之後就是生效值」紅。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
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
import {
  DEFAULT_ONE_SHOT_MAX_LIFE_SEC,
  MAX_ONE_SHOT_MAX_LIFE_SEC,
  MIN_ONE_SHOT_MAX_LIFE_SEC,
  zConfigVfxFamiliesDoc,
} from "@ggd/shared/content/schema/vfx";
import { DEFAULT_MAX_ABILITY_VFX_LAYERS } from "@ggd/shared/content/schema/abilityVfx";
import { SCREEN_PARTICLE_BUDGET } from "../render/vfx/emitterBudget";
import {
  clampOneShotLife,
  frontLoadDoc,
  MAX_FRONT_LOAD_BURST,
  VfxSystem,
  type VfxContext,
} from "./VfxSystem";
import { oneShotMaxLifeSec, setOneShotMaxLifeSec } from "./oneShotLife";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const loadVfx = (id: string): VfxDoc =>
  JSON.parse(readFileSync(root(`content/vfx/${id}.json`), "utf8")) as VfxDoc;
const loadAbility = (id: string): Record<string, unknown> =>
  JSON.parse(readFileSync(root(`content/abilities/${id}.json`), "utf8")) as Record<string, unknown>;

/** 出貨的技能骨架(只有單值 `vfxKey`),用來掛我們要測的層。 */
const BASE_ABILITY = "godie-n003.q";

/**
 * 出貨的匯入文件,`lifetimeSec` 4 秒、continuous —— 也就是檔頭說的「匯入的
 * 1–6 秒壽命」本人。這是夾子當初存在的理由,也是餘燼要延長時第一個被夾到的。
 */
const LONG_STREAM = "fx.w3x.particle.lasercannonfinalred.p03";
/** 出貨的匯入文件,3.5 秒的 **burst** —— `frontLoadDoc` 的另一條分支。 */
const LONG_BURST = "godie-blackhole1-p2";
/** 出貨的短特效(0.52 s),用來驗「天花板不會把短的拉長」。 */
const SHORT = "fx.prim.ice.shockwave";

let engine: NullEngine;
let scene: Scene;

function registerParsed(id: string, extra: Record<string, unknown>): void {
  const doc = { ...loadAbility(BASE_ABILITY), id, ...extra };
  const parsed = zAbilityDoc.parse(doc) as unknown as Record<string, unknown>;
  Abilities.register(id as AbilityId, parsed as never);
}

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  registerParsed("test.life.stream.q", { vfxLayers: [{ vfxKey: LONG_STREAM }] });
  registerParsed("test.life.burst.q", { vfxLayers: [{ vfxKey: LONG_BURST }] });
  registerParsed("test.life.snappy.q", { vfxLayers: [{ vfxKey: SHORT, timeScale: 0.4 }] });
  registerParsed("test.life.short.q", { vfxLayers: [{ vfxKey: SHORT }] });
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});
// 模組狀態:每一條都要還原,否則測試之間會互相汙染(而且順序一換結果就變)
afterEach(() => setOneShotMaxLifeSec(undefined));

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

/**
 * 這一次施法造出來的粒子系統的**引擎壽命**。
 *
 * 只看 `vfx-` 開頭的那些 —— 同一幀還會生出焦痕、預告圈這些別的層,把它們算進來
 * 會讓「恰好一個發射器」變成一條會隨無關改動漂掉的斷言。
 */
function firedLifetimes(before: readonly unknown[]): { name: string; min: number; max: number }[] {
  return scene.particleSystems
    .filter((ps) => !before.includes(ps) && ps.name.startsWith("vfx-"))
    .map((ps) => ({ name: ps.name, min: ps.minLifeTime, max: ps.maxLifeTime }));
}

function fire(sys: VfxSystem, abilityId: string, nowMs: number): { name: string; min: number; max: number } {
  const before = [...scene.particleSystems];
  sys.handleEvent(cast(abilityId), nowMs);
  const made = firedLifetimes(before);
  expect(made, `${abilityId} 沒有造出任何粒子發射器`).toHaveLength(1);
  return made[0]!;
}

/**
 * 一次施法用一個**全新的** `VfxSystem`。
 *
 * ⚠️ 必要,不是潔癖:池是 per-instance 的,而一份**沒有被夾到**的 doc 在任何天花板
 * 下都是同一個 pool key —— 同一個實例連打兩次,第二次會直接復用第一次那個發射器,
 * `scene.particleSystems` 的差集就是空的。這個 helper 讓「天花板改了但這份 doc
 * 不該變」那幾條每次都量到一個真的新發射器,而不是量到「什麼都沒發生」。
 */
function fireFresh(abilityId: string, nowMs: number): { name: string; min: number; max: number } {
  const sys = harness();
  try {
    return fire(sys, abilityId, nowMs);
  } finally {
    sys.dispose();
  }
}

describe("餘燼壽命上限 · 引擎真的拿到的粒子壽命 (vfx-one-shot-life)", () => {
  it("出貨預設 0.6：一份 4 秒的出貨匯入文件，引擎手上的壽命就是 0.6", () => {
    // 前提要真：這份文件真的是 4 秒的，不然下面夾到 0.6 什麼都證明不了
    expect(loadVfx(LONG_STREAM).lifetimeSec.max).toBe(4);
    const sys = harness();
    const ps = fire(sys, "test.life.stream.q", 1_000);
    expect(ps.max).toBeCloseTo(DEFAULT_ONE_SHOT_MAX_LIFE_SEC, 6);
    sys.dispose();
  });

  it("burst 模式的出貨文件（黑洞 3.5 秒）也吃同一個天花板", () => {
    const doc = loadVfx(LONG_BURST);
    expect(doc.mode).toBe("burst");
    expect(doc.lifetimeSec.max).toBe(3.5);
    const sys = harness();
    const ps = fire(sys, "test.life.burst.q", 2_000);
    // ⚠️ 2026-08-24（GH#660）之後這具文件吃**兩個**天花板：one-shot 上限（這一支測的）
    //    ＋整段收尾上限 `vfxDissipateMaxSec`（黑洞的 alpha 尾巴超標 ⇒ 0.6 再被夾到 0.5）。
    //    ⇒ 斷言從「等於 one-shot 上限」改成「**不高於** one-shot 上限、且真的比原作 3.5
    //    短」—— 這一支守的機制是「burst 也吃天花板」，⛔ 不是「哪一個天花板最緊」
    //   （那是 dissipateCap.test 的事；釘死等號會讓兩支守衛搶同一個數字的所有權）。
    expect(ps.max).toBeLessThanOrEqual(DEFAULT_ONE_SHOT_MAX_LIFE_SEC + 1e-6);
    expect(ps.max, "天花板根本沒生效 —— 3.5 秒原樣出去了").toBeLessThan(doc.lifetimeSec.max);
    sys.dispose();
  });

  it("⚠️ 後台改成 2.0 秒 → 同一支技能、同一個 VfxSystem，粒子壽命真的變成 2.0", () => {
    const sys = harness();

    // 1) 先在出貨預設下打一次 —— 這是「改之前」的量測基準,不是假設
    const atDefault = fire(sys, "test.life.stream.q", 10_000);
    expect(atDefault.max).toBeCloseTo(DEFAULT_ONE_SHOT_MAX_LIFE_SEC, 6);

    // 2) 後台存了 2.0(ContentDb.load() 打進來的就是這一支)
    setOneShotMaxLifeSec(2);

    // 3) 同一個實例、同一支技能再打一次,而且**刻意隔得夠久**(20 秒),讓上面那個
    //    發射器在任何天花板下都早就閒置了。池 key 沒有跟著天花板換的話,`play()`
    //    會直接復用那個照 0.6 建好的 system —— 差集是空的,連一個新發射器都沒有,
    //    而玩家看到的仍然是 0.6 秒。這個時間差就是那條分岔的觸發器。
    const atTwo = fire(sys, "test.life.stream.q", 30_000);
    expect(atTwo.max, "後台改了但引擎手上的粒子壽命沒變 —— 池/memo 沒有跟著天花板走").toBeCloseTo(2, 6);
    // 而且是**另一個**發射器,不是同一格池被就地改寫(池 key 必須換)
    expect(atTwo.name).not.toBe(atDefault.name);
    // 尾巴的寬度也要跟著走(min 是 max × TAIL_SPREAD),不是只有 max 對
    expect(atTwo.min).toBeGreaterThan(atDefault.min);
    expect(atTwo.min).toBeLessThan(atTwo.max);

    sys.dispose();
  });

  it("往下（變短）仍然完全生效，天花板不會把短的特效拉長", () => {
    const authored = loadVfx(SHORT).lifetimeSec.max;
    expect(authored).toBe(0.52);

    // timeScale 0.4 → 0.52 × 0.4 = 0.208，既有行為，天花板不參與
    expect(fireFresh("test.life.snappy.q", 20_000).max).toBeCloseTo(0.208, 3);

    // 天花板拉到 2.0 之後，這兩個仍然是 0.208 / 0.52 —— 這一格只會往下夾
    setOneShotMaxLifeSec(2);
    expect(fireFresh("test.life.snappy.q", 21_000).max).toBeCloseTo(0.208, 3);
    expect(fireFresh("test.life.short.q", 22_000).max).toBeCloseTo(authored, 6);
  });

  it("天花板調到下界 0.1 也真的生效（不是只認得往上調）", () => {
    const sys = harness();
    setOneShotMaxLifeSec(MIN_ONE_SHOT_MAX_LIFE_SEC);
    expect(fire(sys, "test.life.stream.q", 30_000).max).toBeCloseTo(MIN_ONE_SHOT_MAX_LIFE_SEC, 6);
    sys.dispose();
  });
});

/**
 * ⚠️ 這一組是**第一次突變驗證抓出來的洞**補上的。
 *
 * `clampOneShotLife` / `frontLoadDoc` 的預設參數是 `oneShotMaxLifeSec()`,但
 * `VfxSystem.shapeOf` 每次都**明確傳**天花板進去 —— 所以把兩個預設參數改回讀
 * 模組常數 `DEFAULT_ONE_SHOT_MAX_LIFE_SEC`,上面那些真 Babylon 的斷言**全部照
 * 樣綠**。兩個 export 的公開函式當場退回寫死,而沒有任何一條測試會叫。
 *
 * 下面兩條直接呼叫那兩個 export、不給第二個參數,把預設參數本身釘住。
 */
describe("餘燼壽命上限 · 純函式的預設值也讀後台 (vfx-one-shot-life)", () => {
  it("clampOneShotLife 不給天花板時，讀的是現在生效的值而不是出貨常數", () => {
    const long = { min: 2, max: 4 };
    expect(clampOneShotLife(long).max).toBe(DEFAULT_ONE_SHOT_MAX_LIFE_SEC);
    setOneShotMaxLifeSec(2);
    expect(clampOneShotLife(long).max, "預設參數退回讀模組常數了").toBe(2);
  });

  it("frontLoadDoc 不給天花板時，同樣讀現在生效的值", () => {
    const doc = loadVfx(LONG_STREAM);
    expect(frontLoadDoc(doc).lifetimeSec.max).toBe(DEFAULT_ONE_SHOT_MAX_LIFE_SEC);
    setOneShotMaxLifeSec(2);
    expect(frontLoadDoc(doc).lifetimeSec.max, "預設參數退回讀模組常數了").toBe(2);
  });
});

describe("餘燼壽命上限 · 生效值的來源與界限 (vfx-one-shot-life)", () => {
  it("沒設過 = 出貨預設，不是 0（0 = 一次性特效整個看不見）", () => {
    expect(oneShotMaxLifeSec()).toBe(DEFAULT_ONE_SHOT_MAX_LIFE_SEC);
    setOneShotMaxLifeSec(2);
    expect(oneShotMaxLifeSec()).toBe(2);
    setOneShotMaxLifeSec(undefined);
    expect(oneShotMaxLifeSec()).toBe(DEFAULT_ONE_SHOT_MAX_LIFE_SEC);
  });

  it("界外的值被夾回範圍內，不是照單全收", () => {
    setOneShotMaxLifeSec(0);
    expect(oneShotMaxLifeSec()).toBe(MIN_ONE_SHOT_MAX_LIFE_SEC);
    setOneShotMaxLifeSec(60);
    expect(oneShotMaxLifeSec()).toBe(MAX_ONE_SHOT_MAX_LIFE_SEC);
    setOneShotMaxLifeSec(Number.NaN);
    expect(oneShotMaxLifeSec()).toBe(DEFAULT_ONE_SHOT_MAX_LIFE_SEC);
  });

  it("schema 的上下界和常數沒有漂開（Zod 的 min/max 只能寫字面值）", () => {
    const base = {
      id: "vfx-families",
      schema: "config.vfx-families@1",
      enabled: true,
      scaleGain: 0.35,
      scaleMin: 0.5,
      scaleMax: 3,
      families: {},
      abilities: {},
    };
    const at = (v: number): boolean =>
      zConfigVfxFamiliesDoc.safeParse({ ...base, oneShotMaxLifeSec: v }).success;
    expect(at(MIN_ONE_SHOT_MAX_LIFE_SEC)).toBe(true);
    expect(at(MAX_ONE_SHOT_MAX_LIFE_SEC)).toBe(true);
    expect(at(MIN_ONE_SHOT_MAX_LIFE_SEC - 1e-6), "下界抄大了").toBe(false);
    expect(at(MAX_ONE_SHOT_MAX_LIFE_SEC + 1e-6), "上界抄小了").toBe(false);
    // 出貨預設必須落在可設定的範圍內，否則後台永遠選不回出貨值
    expect(at(DEFAULT_ONE_SHOT_MAX_LIFE_SEC)).toBe(true);
  });

  /**
   * ⚠️ 上界是**算出來的**,這一條把推導釘在真的常數上(和
   * `ABILITY_VFX_LAYER_HARD_CAP` 對 `emitterBudget` 的做法同一套:shared 不能
   * import client,所以常數放 shared、等式斷言放 client)。
   *
   * 一次施法的粒子 = 層數上限 × 單層 burst 上限;同時在打的施法 = 12 位英雄
   * 除以平均施法間隔。**「平均每 2 秒放一招」是估計值**,其餘三個都是常數。
   * 誰把畫面粒子預算調小、或把單層 burst 上限調大而沒有回來重算這個上界,
   * 這一條會紅。
   */
  it("上界 3 秒對得上畫面粒子預算的推導（動了預算就要回來重算）", () => {
    const particlesPerCast = DEFAULT_MAX_ABILITY_VFX_LAYERS * MAX_FRONT_LOAD_BURST;
    const CASTS_PER_SEC_ESTIMATE = 12 / 2; // 12 位英雄，平均每 2 秒一招（估計值）
    const derived = SCREEN_PARTICLE_BUDGET / (particlesPerCast * CASTS_PER_SEC_ESTIMATE);
    expect(derived).toBeCloseTo(3.333, 2);
    expect(MAX_ONE_SHOT_MAX_LIFE_SEC, "上界超過畫面粒子預算撐得住的長度").toBeLessThanOrEqual(derived);
    expect(
      MAX_ONE_SHOT_MAX_LIFE_SEC,
      "上界被縮到遠低於預算容許值 —— 那就不是這個推導了，說明文字會變成謊話",
    ).toBeGreaterThan(derived * 0.8);
  });
});

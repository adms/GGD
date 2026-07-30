/**
 * B4 綁定桶:三支技能從 `fx.prim.*` 替身換成**原作模型真的抽出來的發射器**。
 *
 * ---------------------------------------------------------------------------
 * 為什麼這一條不是「有幾支綁了 fx.w3x.*」
 * ---------------------------------------------------------------------------
 * GH#230 已經有一條那種普查測試,它綠了很久而玩家一直看到替身 —— 因為「doc 的
 * vfxKey 字串長什麼樣」是**屬性**。這裡量的是行為:同一條出貨路徑跑完之後,
 * **Babylon 手上那幾個 `ParticleSystem` 的貼圖 / blend mode / 世界座標**。
 *
 *   · 技能文件從 `content/abilities/` 讀**出貨的那一份**,過真的 `zAbilityDoc`。
 *     手寫一份「長得像出貨」的物件就是第⑤號故障。
 *   · 事件走真的 `VfxSystem.handleEvent`,和 GameApp 每幀排空事件用的同一支。
 *   · 「綁定前 vs 綁定後」的對照組是**同一份出貨 doc 拿掉 `vfxLayers`**,
 *     也就是這次改動之前那份 doc 的行為 —— 不是我另外編一個假的 before。
 *
 * 證據來源(不是猜的):`content/assets/vfx/w3x-ability-provenance.json`
 *   · `godie-e008.q` (21-02 拔焰刀)   ← w3a-override `art:missile` = MinitypeFlame.MDX(2 個發射器)
 *   · `godie-h02r.q` / `godie-hgam.q` (90-01 飛葉快刀)
 *                                     ← w3a-override 五個 art 通道全部 = EarthTornado2.mdx(14 個發射器)
 * 那 14 個發射器裡只有 6 組不同參數(其餘是同參數複本),而層數上限是 5,所以
 * 綁了 6 組裡最不一樣的 5 組 —— 5 種貼圖、3 種 blend mode。
 *
 * 突變驗證(記在 commit message):
 *   · 把 `godie-h02r.q.json` 的五層 `vfxKey` 全改回 `fx.prim.nature.slash`
 *     → 「五種貼圖」與「不是替身貼圖」兩條紅。
 *   · 把 `godie-e008.q.json` 第二層的 `attachTo: "point"` 拿掉
 *     → 「延遲層落在施法點」紅。
 *   · 把 `playLayeredCast` 的迴圈改成只取 `layers[0]` → 三條紅。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import type { VfxDoc } from "@ggd/shared/content";
import { zAbilityDoc } from "@ggd/shared/content/schema/ability";
import { VfxSystem, type VfxContext } from "./VfxSystem";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const loadVfx = (id: string): VfxDoc =>
  JSON.parse(readFileSync(root(`content/vfx/${id}.json`), "utf8")) as VfxDoc;
const loadAbility = (id: string): Record<string, unknown> =>
  JSON.parse(readFileSync(root(`content/abilities/${id}.json`), "utf8")) as Record<string, unknown>;
/**
 * 同一支技能在 `content/champions/<cid>.json` 裡的**內嵌複本**。
 *
 * 為什麼要單獨測它:`apps/editor/src/preview/PreviewController.ts` 傳
 * `overrideAbilities: true`,渲染的是**內嵌那一份的全部**,而 `fillGaps` 只回填
 * 獨立文件沒寫的 key —— 所以內嵌少一個 `vfxLayers` 在正式比賽裡完全看不出來,
 * 只有編輯器預覽會退回替身。這正是 `abilityMirror.test.ts` 檔頭記的 #79 舊病。
 */
const loadEmbedded = (championId: string, slot: string): Record<string, unknown> => {
  const doc = JSON.parse(readFileSync(root(`content/champions/${championId}.json`), "utf8")) as {
    abilities: Record<string, Record<string, unknown>>;
  };
  return doc.abilities[slot]!;
};

/** 這一桶真的改到的三份出貨技能文件。 */
const LEAF_STORM = "godie-h02r.q"; // 90-01 飛葉快刀 (妙蛙花)
const LEAF_STORM_TWIN = "godie-hgam.q"; // 同一支技能的第二位英雄
const FLAME_BLADE = "godie-e008.q"; // 21-02 拔焰刀

/** 綁定前那份 doc 的行為 = 同一份出貨 doc 拿掉 `vfxLayers`。 */
const BEFORE_SUFFIX = ".b4before";
/** 替身貼圖 —— `fx.prim.*.slash` 全家共用這一張。 */
const PLACEHOLDER_TEXTURE = "slash_01.png";

const CASTER = { x: 10, z: -4 };
const POINT = { x: 22, z: 17 };

let engine: NullEngine;
let scene: Scene;

/** 出貨 doc → 真的 `zAbilityDoc.parse` → 註冊 parse 的產物(不是我手寫的物件)。 */
function registerShipped(id: string): void {
  const parsed = zAbilityDoc.parse(loadAbility(id)) as unknown as Record<string, unknown>;
  Abilities.register(id as AbilityId, parsed as never);
}

/** 同一份出貨 doc,拿掉 `vfxLayers` —— 這次改動之前它就是長這樣。 */
function registerBefore(id: string): void {
  const { vfxLayers: _dropped, ...rest } = loadAbility(id);
  const parsed = zAbilityDoc.parse({ ...rest, id: id + BEFORE_SUFFIX }) as unknown as Record<
    string,
    unknown
  >;
  Abilities.register((id + BEFORE_SUFFIX) as AbilityId, parsed as never);
}

/** 內嵌複本 → 真的 `zAbilityDoc.parse` → 註冊(編輯器預覽走的就是這一份)。 */
const EMBEDDED_SUFFIX = ".b4embedded";
function registerEmbedded(championId: string, abilityId: string): void {
  const embedded = loadEmbedded(championId, "Q");
  const parsed = zAbilityDoc.parse({
    ...embedded,
    id: abilityId + EMBEDDED_SUFFIX,
    schema: "ability@1",
  }) as unknown as Record<string, unknown>;
  Abilities.register((abilityId + EMBEDDED_SUFFIX) as AbilityId, parsed as never);
}

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  for (const id of [LEAF_STORM, LEAF_STORM_TWIN, FLAME_BLADE]) {
    registerShipped(id);
    registerBefore(id);
    registerEmbedded(id.slice(0, -2), id);
  }
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

function harness(): VfxSystem {
  const ctx: VfxContext = {
    entityPos: () => CASTER,
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
  ({
    type: "abilityCast",
    data: { abilityId, caster: 1, point: POINT },
  }) as unknown as EventMessage;

interface Emitted {
  name: string;
  texture: string;
  blendMode: number;
  x: number;
  z: number;
}

/** 這一次施法真的造出來的發射器,以及引擎手上的參數(不是 doc 上的)。 */
function newSystems(before: readonly unknown[]): Emitted[] {
  return scene.particleSystems
    .filter((ps) => !before.includes(ps))
    .map((ps) => {
      const emitter = ps.emitter as Vector3;
      const tex = ps.particleTexture as Texture | null;
      return {
        name: ps.name,
        // ⚠️ 讀引擎手上那個 Texture 的 url,不是 doc.texture —— 中間任何一段
        // 沒把貼圖交給 ParticleSystem,這裡就會是空字串而不是靜靜地過。
        texture: tex?.url ?? tex?.name ?? "",
        blendMode: ps.blendMode,
        x: emitter.x,
        z: emitter.z,
      };
    });
}

/** 施法 → 把所有 delayMs 的層都放出來 → 回報引擎造出來的發射器。 */
function castAndDrain(sys: VfxSystem, abilityId: string, t0: number): Emitted[] {
  const before = [...scene.particleSystems];
  sys.handleEvent(cast(abilityId), t0);
  // 出貨層裡最大的 delayMs 是 700 —— 多推一秒確保全部到期
  sys.update(t0);
  sys.update(t0 + 1_700);
  return newSystems(before);
}

describe("B4 綁定:飛葉快刀畫的是原作 EarthTornado2 的發射器,不是替身", () => {
  it("綁定前(同一份 doc 拿掉 vfxLayers):一個發射器,而且是替身貼圖", () => {
    const made = castAndDrain(harness(), LEAF_STORM + BEFORE_SUFFIX, 1_000);
    expect(made, "單值 vfxKey 應該恰好一個發射器").toHaveLength(1);
    expect(made[0]!.texture).toContain(PLACEHOLDER_TEXTURE);
  });

  it("綁定後:五個發射器,五種不同貼圖,沒有一個是替身", () => {
    const made = castAndDrain(harness(), LEAF_STORM, 10_000);
    expect(made, "五層應該造出五個 ParticleSystem").toHaveLength(5);

    for (const m of made) {
      expect(m.texture, `發射器 ${m.name} 沒有拿到貼圖`).not.toBe("");
      expect(m.texture, `發射器 ${m.name} 仍然是替身`).not.toContain(PLACEHOLDER_TEXTURE);
    }
    // 行為斷言:引擎手上這五個發射器**看起來真的不一樣**
    expect(new Set(made.map((m) => m.texture)).size, "五層貼到同一張圖").toBe(5);
    expect(new Set(made.map((m) => m.blendMode)).size, "五層 blend mode 全一樣").toBeGreaterThan(1);
  });

  it("attachTo 真的分流:四層落在施法點,最後一層留在施法者身上", () => {
    const made = castAndDrain(harness(), LEAF_STORM, 20_000);
    const atPoint = made.filter((m) => m.x === POINT.x && m.z === POINT.z);
    const atCaster = made.filter((m) => m.x === CASTER.x && m.z === CASTER.z);
    expect(atPoint, "attachTo:point 的層沒有落在施法點").toHaveLength(4);
    expect(atCaster, "沒寫 attachTo 的層應該留在施法者身上").toHaveLength(1);
  });

  it("第二位英雄(godie-hgam.q)拿到一模一樣的堆疊 —— 同一支技能不可以只修一半", () => {
    const a = castAndDrain(harness(), LEAF_STORM, 30_000).map((m) => m.texture).sort();
    const b = castAndDrain(harness(), LEAF_STORM_TWIN, 40_000).map((m) => m.texture).sort();
    expect(b).toEqual(a);
  });
});

describe("B4 綁定:拔焰刀畫的是原作 MinitypeFlame 的兩個發射器", () => {
  it("綁定前:一個替身發射器;綁定後:兩個,貼圖不同", () => {
    const beforeRun = castAndDrain(harness(), FLAME_BLADE + BEFORE_SUFFIX, 50_000);
    expect(beforeRun).toHaveLength(1);
    expect(beforeRun[0]!.texture).toContain(PLACEHOLDER_TEXTURE);

    const afterRun = castAndDrain(harness(), FLAME_BLADE, 60_000);
    expect(afterRun, "兩層應該造出兩個 ParticleSystem").toHaveLength(2);
    for (const m of afterRun) {
      expect(m.texture, `發射器 ${m.name} 仍然是替身`).not.toContain(PLACEHOLDER_TEXTURE);
    }
    expect(new Set(afterRun.map((m) => m.texture)).size, "兩層貼到同一張圖").toBe(2);
  });

  it("延遲層落在施法點,主層留在施法者身上（原作 art:missile 打在目標身上）", () => {
    const made = castAndDrain(harness(), FLAME_BLADE, 70_000);
    const atCaster = made.filter((m) => m.x === CASTER.x && m.z === CASTER.z);
    const atPoint = made.filter((m) => m.x === POINT.x && m.z === POINT.z);
    expect(atCaster, "主層不在施法者身上").toHaveLength(1);
    expect(atPoint, "attachTo:point 的延遲層不在施法點").toHaveLength(1);
  });
});

/**
 * 鏡像那一半。`content/champions/<cid>.json` 的內嵌複本忘了同步時,正式比賽看不
 * 出來(`fillGaps` 讓獨立文件贏),但編輯器預覽會整份用內嵌那一份 —— 所以這裡
 * 直接把**內嵌複本**推進同一條引擎路徑,量它畫出來的東西。
 *
 * 突變:把任一個 `content/champions/godie-*.json` 的 `vfxLayers` 整段刪掉 → 紅。
 */
describe("B4 綁定:champion 內嵌複本畫出來的和獨立文件一樣（編輯器預覽走這一份）", () => {
  for (const [id, layers] of [
    [LEAF_STORM, 5],
    [LEAF_STORM_TWIN, 5],
    [FLAME_BLADE, 2],
  ] as const) {
    it(`${id} 內嵌複本畫出 ${String(layers)} 個非替身發射器`, () => {
      const made = castAndDrain(harness(), id + EMBEDDED_SUFFIX, 80_000);
      expect(made, "內嵌複本沒有跟著同步 vfxLayers").toHaveLength(layers);
      for (const m of made) {
        expect(m.texture, `內嵌複本仍然是替身:${m.name}`).not.toContain(PLACEHOLDER_TEXTURE);
      }
    });
  }
});

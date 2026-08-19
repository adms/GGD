/**
 * B5 守衛 —— 晉升那條路把**發射器的 pivot 排列**整組丟掉了。
 *
 * ---------------------------------------------------------------------------
 * 這條在守什麼(以及它跟 B6 那條的分工)
 * ---------------------------------------------------------------------------
 * B6 的 `promotedRowNotDemoted.test.ts` 已經量過「給已晉升的技能加 `vfxLayers`
 * 會把它從 rig 降級到池化路徑」。**這一條不重複那件事**,它量的是更前面的一層:
 *
 *   **就算走 rig(rung 1,最好的那條路),原作模型的發射器 pivot 也沒有送到。**
 *
 * `W3xEmitterRig` 自己是會擺 pivot 的 —— `W3xEmitterRig.ts:288-296` 明寫
 * 「The emitter's own PIVOT offset … this is what gives a multi-emitter effect
 * its SHAPE」,而 `w3xEmitter.ts:554` 也真的把 mdx 的 pivot 換算成
 * `runtime.pivotOffset`。中間斷在 `W3xCastFx.ts:287`:
 *
 *     emitters: docs.map((doc) => ({ doc })),        // ← 沒有 runtime
 *
 * 一份 `vfx@1` 文件**帶不了 pivot**(schema 裡沒有這個欄位),而戰鬥施法這條路
 * 又沒有補上 runtime,所以 34 支已晉升技能的整組發射器都被疊在
 * `VfxSystem.ts:756` 寫死的那一個 `y = 1.0` 上。這是第②號故障:算出來了
 * (抽取器有、rig 收得下),但**從沒送到**。
 *
 * 量到的落差(`godie-u010.q` = 38-01 邪王炎殺劍,綁 `FlamesSmoke.mdx`):
 *   抽取器的 pivot z(WC3 model units)= −62.611 / +254.735 / +20.885 / −2.070
 *   × `W3X_MODEL_UNIT`(1/36)→ 世界 Y = −1.739 / **+7.077** / +0.580 / −0.058
 *   引擎實際擺的位置              → 1.0 / 1.0 / 1.0 / 1.0
 * `w3xAbilityArt.ts:179` 那句「p01 is the family's tall plume (pivot z=+254.7)」
 * 描述的那道**七個世界單位高的火柱**,現在跟地面煙同高。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 這是一條 CHARACTERIZATION(現況)守衛,不是「這樣才對」
 * ---------------------------------------------------------------------------
 * 最後一條 `it` 斷言的是**目前的缺陷**,理由是:這個缺陷是靜默的,寫在註解裡
 * 沒有人會發現它被修好或被改壞。**它變紅通常代表有人把 pivot 接上去了 ——
 * 那是好事,正確的反應是更新這條測試的期望值,不是把修改退掉。**
 * 失敗訊息裡直接寫了這句話。
 *
 * ---------------------------------------------------------------------------
 * 為什麼這樣寫才算行為守衛
 * ---------------------------------------------------------------------------
 * 「w3xAbilityArtRows() 有 34 列」是屬性。這裡讀的是**引擎手上的 Babylon
 * `ParticleSystem`**:它們的貼圖 / blend mode / 壽命 / 發射率,以及
 * `ps.emitter` 的世界座標。技能文件走真的 `zAbilityDoc.parse`(第⑤號故障),
 * 事件走真的 `VfxSystem.handleEvent`(和 GameApp 同一個 method)。
 *
 * 突變驗證(session 內實跑):
 *   1. 把 `w3xAbilityArtRows()["godie-u010.q"].extra` 清成 `[]`
 *      → 「四顆都到得了粒子層」與「四組參數互不相同」兩條紅。
 *   2. 把 `W3xCastFx.play` 的 `atPosition(x, y, z)` 的 y 改成 `y + 1`
 *      → 「四顆全部落在寫死的 y = 1.0」紅。
 *
 * 受測技能 = `godie-u010.q`「38-01 邪王炎殺劍」(飛影),B5 桶的檔,在 whitelist
 * 裡真的選得到,而且它的原作模型四顆發射器**全部 root-anchored**
 * (`content/assets/vfx/w3x-ability-provenance.json` 的 `models.flamessmoke`:
 * `emitterTotal: 4, rootAnchored: 4`)—— 也就是說它是 #230 可繪性閘**放行**的
 * 那一類,pivot 遺失不能推給「形狀本來就活在節點樹裡」。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "../render/vfx/shippedAbilityArt.testkit";
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
import { VfxSystem, type VfxContext } from "./VfxSystem";
import { w3xAbilityArtRows } from "../render/vfx/w3xAbilityArt";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const loadVfx = (id: string): VfxDoc =>
  JSON.parse(readFileSync(root(`content/vfx/${id}.json`), "utf8")) as VfxDoc;
const loadAbility = (id: string): Record<string, unknown> =>
  JSON.parse(readFileSync(root(`content/abilities/${id}.json`), "utf8")) as Record<string, unknown>;

/** 38-01 邪王炎殺劍 — 已晉升 (flamessmoke, 4 顆 root-anchored 發射器), 在 whitelist 裡。 */
const ABILITY = "godie-u010.q";

/**
 * `VfxSystem.ts:756` 把整組發射器交給 rig 時寫死的世界高度。
 * 它不是從模型算出來的 —— 這條測試存在的理由就是這件事。
 */
const HARDCODED_CAST_Y = 1.0;

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  // 走**真的** Zod 註冊出貨的那份 doc。手寫物件 = 第⑤號故障,刻意不這樣做。
  const parsed = zAbilityDoc.parse(loadAbility(ABILITY)) as unknown as Record<string, unknown>;
  Abilities.register(ABILITY as AbilityId, parsed as never);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

function harness(): { sys: VfxSystem; played: string[] } {
  const played: string[] = [];
  const ctx: VfxContext = {
    entityPos: () => ({ x: 0, z: 0 }),
    vfxDoc: (key: string) => {
      try {
        const d = loadVfx(key);
        played.push(key);
        return d;
      } catch {
        return null;
      }
    },
  };
  return { sys: new VfxSystem(scene, ctx), played };
}

const castEvent = (): EventMessage =>
  ({
    type: "abilityCast",
    data: { abilityId: ABILITY, caster: 1, point: { x: 0, z: 0 } },
  }) as unknown as EventMessage;

/**
 * 一次施法真的在引擎裡長出來的發射器**參數指紋**。
 * 讀的是 Babylon 自己的欄位,不是我們的 doc —— 「引擎輸出的粒子參數真的不同」
 * 才是行為,「解析出幾個 key」是屬性。
 */
function fingerprints(before: number): string[] {
  return scene.particleSystems
    .slice(before)
    .map((ps) =>
      [
        (ps as { particleTexture?: { name?: string } }).particleTexture?.name ?? "-",
        (ps as { blendMode?: number }).blendMode ?? -1,
        (ps as { minLifeTime?: number }).minLifeTime?.toFixed(4) ?? "-",
        (ps as { maxLifeTime?: number }).maxLifeTime?.toFixed(4) ?? "-",
        (ps as { minSize?: number }).minSize?.toFixed(4) ?? "-",
        (ps as { maxSize?: number }).maxSize?.toFixed(4) ?? "-",
        (ps as { emitRate?: number }).emitRate ?? "-",
      ].join("|"),
    );
}

/** 每一顆新發射器真的被擺在哪個世界 Y(mesh 的話讀 mesh,Vector3 的話讀它自己)。 */
function emitterYs(before: number): number[] {
  return scene.particleSystems.slice(before).map((ps) => {
    const e = (ps as { emitter?: unknown }).emitter as
      | { y?: number; position?: { y: number } }
      | undefined;
    return e?.position?.y ?? e?.y ?? Number.NaN;
  });
}

describe("promoted cast keeps the map's art but loses its pivots (vfx-promoted-pivots)", () => {
  it("晉升那一支施法時,原作模型的四顆發射器都到得了粒子層", () => {
    const art = w3xAbilityArtRows()[ABILITY];
    expect(art, `${ABILITY} 不在 w3xAbilityArtRows() 裡,這條守衛的前提沒了`).toBeDefined();
    const expected = [art!.primary, ...art!.extra];
    // flamessmoke 在普查裡是 emitterTotal 4 / rootAnchored 4
    expect(expected).toHaveLength(4);

    const { sys, played } = harness();
    sys.handleEvent(castEvent(), 1000);

    for (const id of expected) {
      expect(played, `原作發射器 ${id} 從來沒到過粒子層`).toContain(id);
    }
    expect(played.some((k) => k.startsWith("fx.prim."))).toBe(false);
  });

  it("那四顆在引擎裡是四組**參數不同**的發射器,不是同一組播四次", () => {
    const before = scene.particleSystems.length;
    const { sys } = harness();
    sys.handleEvent(castEvent(), 2000);

    const fps = fingerprints(before);
    expect(fps.length).toBeGreaterThanOrEqual(4);
    expect(new Set(fps).size).toBeGreaterThanOrEqual(4);
  });

  it("現況(缺陷):四顆全部落在寫死的 y = 1.0,原作的 pivot 高度差沒有送到", () => {
    const before = scene.particleSystems.length;
    const { sys } = harness();
    sys.handleEvent(castEvent(), 3000);

    const ys = emitterYs(before);
    expect(ys.length).toBeGreaterThanOrEqual(4);
    const msg =
      "四顆發射器的世界 Y 不再全等 —— 如果是有人把 W3xCastFx 的 pivotOffset 接上去了," +
      "那是這條測試希望發生的事:請把期望值改成模型的 pivot 高度,不要退掉那個修改。";
    expect(new Set(ys.map((y) => y.toFixed(4))).size, msg).toBe(1);
    expect(ys[0], msg).toBeCloseTo(HARDCODED_CAST_Y, 6);
  });
});

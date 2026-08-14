/**
 * 圓盤外 2D 景深背景 —— 接線守衛（GH#324）。
 *
 * ⚠️ 這一支讀的是**跑完 `dressArena` 之後場景裡真的有幾個 mesh**，
 * ⛔ 不是「設定值是 true」。後者是第⑦號故障（掃屬性代替掃行為）——
 * 設定開著而 `buildBackdrop` 那一行被刪掉，是完全可能的，
 * 而且畫面上跟「這個功能沒做」一模一樣（第③號故障）。
 *
 * ⚠️ 對 Babylon 物件只比字串與數字（見 `arenaFire.test.ts` 檔頭的 heap 爆炸）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import type { ArenaDoc, ConfigAmbientVfxDoc } from "@ggd/shared/content";
import {
  DEFAULT_ARENA_BACKDROP,
  resolveArenaBackdrop,
  zConfigAmbientVfxDoc,
} from "@ggd/shared/content";
import { arenaDefFromDoc } from "@ggd/shared/sim/world/ArenaDef";
import type { AssetManager } from "./AssetManager";
import { buildArena, dressArena, disposeArena } from "./ArenaScene";
import { backdropLayerBudget } from "./ArenaBackdrop";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const readJson = <T,>(rel: string): T => JSON.parse(readFileSync(`${REPO}${rel}`, "utf8")) as T;

const DOC = readJson<ArenaDoc>("content/arenas/arena.infinity-castle.json");
const DEF = arenaDefFromDoc(DOC);
const stubAssets = (scene: Scene) =>
  ({ load: async () => new AssetContainer(scene) }) as unknown as AssetManager;

let engine: NullEngine;
let scene: Scene;
beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

async function dressAndCount(policy = DEFAULT_ARENA_BACKDROP): Promise<number> {
  const handles = buildArena(scene, DEF, DOC.groundStyle);
  await dressArena(scene, stubAssets(scene), DEF, DOC, handles, undefined, policy);
  const n = scene.meshes.filter((m) => m.name.startsWith("backdrop-")).length;
  disposeArena(scene, handles);
  return n;
}

describe("圓盤外的 2D 景深背景 —— 接線", () => {
  it("★ dressArena 真的把背景建進場景（刪掉那一行這條就紅）", async () => {
    const zones = DEF.zones.length;
    const layers = DOC.backdrop!.layers.length;
    expect(await dressAndCount()).toBe(zones * Math.min(layers, DEFAULT_ARENA_BACKDROP.maxLayers));
  });

  it("★ 後台關掉就一個都不建 —— 這一格真的接到場上（第②號故障）", async () => {
    expect(await dressAndCount({ ...DEFAULT_ARENA_BACKDROP, enabled: false })).toBe(0);
  });

  it("★ 砍層數砍的是**最外圈**，不是最內圈（砍頭會在邊界旁留一圈黑洞）", () => {
    expect(backdropLayerBudget(4, { ...DEFAULT_ARENA_BACKDROP, maxLayers: 2 })).toBe(2);
    expect(backdropLayerBudget(4, { ...DEFAULT_ARENA_BACKDROP, maxLayers: 0 })).toBe(0);
    // 內容比預算少的時候不可以憑空多畫
    expect(backdropLayerBudget(1, { ...DEFAULT_ARENA_BACKDROP, maxLayers: 8 })).toBe(1);
  });

  it("★ 出貨的 ambient-vfx.json 與 DEFAULT_ARENA_BACKDROP 一字不差（三個住處的 drift）", () => {
    const parsed = zConfigAmbientVfxDoc.safeParse(readJson<unknown>("content/config/ambient-vfx.json"));
    expect(parsed.success, "出貨的 ambient-vfx.json 不合 schema").toBe(true);
    const doc = (parsed as { data: ConfigAmbientVfxDoc }).data;
    expect(resolveArenaBackdrop(doc)).toEqual(DEFAULT_ARENA_BACKDROP);
    // ⚠️ 回退值必須是**開的** —— 內容載不到時圓盤外不可以變回一片黑。
    expect(resolveArenaBackdrop(null).enabled).toBe(true);
  });
});

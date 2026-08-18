/**
 * 場景特色（GH#362）—— owner 2026-08-18「太少特殊獨有場景裝飾⋯**打光也應該有變化
 * 區別，不是靜態不會變動的光**⋯**地板與牆壁顏色**」的守衛，三軸各一條。
 *
 * ⚠️ 讀的都是**最終物件**（材質上真的寫著什麼／場景裡真的有幾顆 mesh／燈上真的是
 * 什麼強度），⛔ 不讀 JSON 欄位（第⑦號故障），⛔ 不斷言顏色值與座標（住在 content/）。
 * 突變：`ArenaGround.createFloorMaterial` 的 `palette ? … : base` 改回 `base` → 第一條紅。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { ArenaDoc, ArenaScenery } from "@ggd/shared/content";
import { DEFAULT_ARENA_SCENERY_POLICY, zArenaDoc, zConfigAmbientVfxDoc } from "@ggd/shared/content";
import { arenaDefFromDoc } from "@ggd/shared/sim/world/ArenaDef";
import type { AssetManager } from "./AssetManager";
import { buildArena, dressArena, disposeArena, SIGHTLINE_HEIGHT_CAP } from "./ArenaScene";
import { setupLighting } from "./Lighting";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (rel: string): unknown => JSON.parse(readFileSync(`${REPO}${rel}`, "utf8"));
const sceneryOf = (id: string): ArenaScenery | undefined =>
  zArenaDoc.parse(read(`content/arenas/${id}.json`)).scenery;

/** 出貨的預設場地 —— 過它自己的 Zod，所以 scenery 的預設值也套上了。 */
const DOC: ArenaDoc = zArenaDoc.parse(read("content/arenas/arena.skeleton.json"));
const DEF = arenaDefFromDoc(DOC);
const albedo = (m: unknown): string => (m as PBRMaterial).albedoColor.toHexString();

function stubAssets(scene: Scene): AssetManager {
  return {
    load: async (p: string) => {
      const c = new AssetContainer(scene);
      const box = MeshBuilder.CreateBox(p.split("/").pop() ?? p, { size: 0.6 }, scene);
      scene.removeMesh(box);
      c.meshes.push(box);
      c.rootNodes.push(box);
      // GH#386 ② —— 下載來的 CC0 布景多帶一層描邊殼。⚠️ 它是同一份 .glb 裡的
      // **另一個 primitive**，所以夾具也要長成那樣：藏的必須是它、不是整件道具。
      if (p.includes("scenery-cc0")) {
        const shell = MeshBuilder.CreateBox("outline-shell", { size: 0.7 }, scene);
        shell.material = new StandardMaterial("Outliner_Mat", scene);
        shell.parent = box;
        scene.removeMesh(shell);
        c.meshes.push(shell);
      }
      return c;
    },
  } as unknown as AssetManager;
}

describe("場地場景特色真的到得了畫面 (GH#362)", () => {
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

  it("★ 換一組色票 → 地板與牆的**最終材質**顏色真的跟著換", () => {
    const paint = (s: ArenaScenery | undefined): [string, string] => {
      const h = buildArena(scene, DEF, DOC.groundStyle, s);
      const out: [string, string] = [albedo(h.grounds[0]!.floor.material), albedo(h.grounds[0]!.rim.material)];
      disposeArena(scene, h);
      return out;
    };
    const plain = paint(undefined);
    const tinted = paint(sceneryOf("arena.nazarick"));
    expect(tinted[0], "地板染色沒有到達最終材質").not.toBe(plain[0]);
    expect(tinted[1], "牆壁染色沒有到達最終材質").not.toBe(plain[1]);
    expect(tinted[0], "地板與牆壁是兩格，⛔ 不是同一個顏色").not.toBe(tinted[1]);
  });

  it("★ 散佈規則真的長成場景裡的 mesh，而且後台總開關關得掉", async () => {
    // skeleton 手擺的 decor 一根柱子都沒有 ⇒ 場上的柱子只可能來自散佈規則。
    // 順手把出貨政策與程式保險絲的 drift 也釘住（一行，⛔ 不值得再開一個 it）。
    const shipped = zConfigAmbientVfxDoc.parse(read("content/config/ambient-vfx.json")).scenery;
    expect(shipped, "出貨的 ambient-vfx.scenery 與保險絲不一致").toEqual(DEFAULT_ARENA_SCENERY_POLICY);
    const pillars = async (enabled: boolean): Promise<number> => {
      const h = buildArena(scene, DEF, DOC.groundStyle, DOC.scenery);
      const pol = { ...DEFAULT_ARENA_SCENERY_POLICY, enabled };
      await dressArena(scene, stubAssets(scene), DEF, DOC, h, undefined, undefined, undefined, pol);
      const n = scene.meshes.filter((m) => m.name.includes("pillar.glb")).length;
      disposeArena(scene, h);
      return n;
    };
    expect(await pillars(true), "散佈規則沒有變成任何一顆 mesh").toBeGreaterThan(0);
    expect(await pillars(false), "後台關掉了，場上還是長出裝飾").toBe(0);
  });

  it("★ 描邊殼是一格後台開關，出貨值是**留著**（GH#386 ②）", async () => {
    // 出貨的預設 = 今天畫面上的樣子。⛔ 這一行不是裝飾：它是 owner 沒指定時
    // 「維持原樣」那個決定的唯一住處，改掉它就等於偷偷換掉 16 件道具的外觀。
    expect(DEFAULT_ARENA_SCENERY_POLICY.outlineShells).toBe(true);
    const shells = async (outlineShells: boolean): Promise<number> => {
      const h = buildArena(scene, DEF, DOC.groundStyle, DOC.scenery);
      const pol = { ...DEFAULT_ARENA_SCENERY_POLICY, outlineShells };
      await dressArena(scene, stubAssets(scene), DEF, DOC, h, undefined, undefined, undefined, pol);
      const n = scene.meshes.filter((m) => m.name.includes("outline-shell") && m.isEnabled()).length;
      disposeArena(scene, h);
      return n;
    };
    expect(await shells(true), "出貨設定下描邊殼被藏起來了 —— 那是偷偷改外觀").toBeGreaterThan(0);
    expect(await shells(false), "關掉了，描邊殼還在畫").toBe(0);
  });

  it("★ decor 的 y 真的把道具架起來，而且架高**不能**穿過視線上限（GH#386 ③）", async () => {
    const zone = DEF.zones[0]!;
    const lifted = (x: number, z: number): ArenaDoc =>
      zArenaDoc.parse({
        ...(read("content/arenas/arena.skeleton.json") as object),
        scenery: undefined,
        decor: [{ model: "assets/models/props/pillar.glb", x, z, y: 3 }],
      });
    const topOf = async (doc: ArenaDoc): Promise<number> => {
      const h = buildArena(scene, DEF, doc.groundStyle, undefined);
      const pol = { ...DEFAULT_ARENA_SCENERY_POLICY, enabled: false };
      await dressArena(scene, stubAssets(scene), DEF, doc, h, undefined, undefined, undefined, pol);
      const m = scene.meshes.find((x) => x.name.includes("pillar.glb"))!;
      m.computeWorldMatrix(true);
      const top = m.getHierarchyBoundingVectors(true).max.y;
      disposeArena(scene, h);
      return top;
    };
    // 圈外：y 完整生效 —— 沒有它，「屋頂只會平躺在地板上」那個缺口就還在。
    expect(await topOf(lifted(999, 999)), "y 沒有到達畫面：道具還躺在地板上").toBeGreaterThan(
      SIGHTLINE_HEIGHT_CAP,
    );
    // 打鬥區上空：照樣被壓回上限 —— ⛔ 內容不可以重新武裝「道具吃掉英雄」那個 bug。
    expect(
      await topOf(lifted(zone.center.x, zone.center.z)),
      "架高的道具浮在打鬥區上空，攝影機保證被內容撤銷了",
    ).toBeLessThanOrEqual(SIGHTLINE_HEIGHT_CAP + 1e-6);
  });

  it("★ 光**會動**，而且後台關得掉（owner：不是靜態不會變動的光）", () => {
    const l = setupLighting(scene);
    const sun = scene.lights.find((x) => x.name === "sun")!;
    const at = (t: number): string => {
      l.animate(t);
      const d = (sun as unknown as { direction: { x: number; z: number } }).direction;
      return `${sun.intensity.toFixed(4)}|${d.x.toFixed(4)}|${d.z.toFixed(4)}`;
    };
    const s = sceneryOf("arena.infinity-castle"); // storm 波 + 方位掃掠，週期 7.4 秒
    l.applyScenery(s, true);
    expect(at(0), "兩個時間點完全一樣 —— 它還是靜態的").not.toBe(at(1.85));
    l.applyScenery(s, false);
    expect(at(0), "後台關掉動畫，燈還在動").toBe(at(1.85));
  });
});

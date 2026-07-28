/**
 * GH#31 —— w3x 角色的 SCALE 與 變色,在真正出貨的那條路徑上。
 *
 * v0.9.6 把 40 位共用替身英雄改成載入自己的 Warcraft III 模型
 * (`assets/blizzard-local/models/*.glb`)。模型會載了,但兩件事沒跟上,而且兩件
 * 都不是「資料缺了」而是「渲染層把資料吃掉了」——所以只斷言 JSON 裡有那個數字
 * 是驗不出來的(失敗形狀 ⑤)。這支測試因此全部走 ChampionView 的真實
 * `tryUpgradeToGlb`,量的是 mesh 上最後真的被寫進去的值。
 *
 *   w3x-model-scale  ChampionView 把 `relativeScale` 乘進高度正規化 —— 也就是
 *                    content/models/_standin-overrides.json 的數字真的變成螢幕
 *                    上的高度,而且不同英雄真的長得不一樣高。
 *   w3x-model-tint   #226 的體素調色盤絕不可以蓋掉暴雪模型自己的貼圖;而 #49
 *                    的 w3x 頂點色必須乘在「那張原始貼圖的材質」上。
 *
 * 為什麼「變色」的根因不是 tint 缺漏:16/40 位在 w3u 裡有非中性 uclr,champion
 * doc 與 config/unit-tints.json 都已經帶著正確的值(#49/#263 的雙向契約在
 * packages/shared/src/content/vertexTint.test.ts 守著)。真正壞掉的是
 * `applyVoxelLook` 會把每個材質的 `albedoTexture` 換成 16×16 調色盤 —— 那是為
 * 那四顆生成方塊人寫的,套到暴雪模型上等於把 WC3 貼圖丟掉,tint 也就變成乘在
 * 調色盤上。#31 之前這條路走不到(preferVoxelBody 讓 glb 根本沒載),#31 打開
 * 模型之後才浮出來。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { ModelDoc } from "@ggd/shared/content";
import { ChampionView, TARGET_HEIGHT } from "./ChampionView";
import { voxelLookFor } from "./voxelLook";
import { VOXEL_TEX_EDGE } from "./voxelSkin";
import { applyModelTint, resolveModelTint } from "./modelTint";
import { relativeScaleOf } from "../EntityViewRegistry";
import type { AssetManager } from "../AssetManager";

const REPO = join(__dirname, "../../../../..");

/** the shipped size table — the SAME file ContentDb fetches at runtime. */
const OVERRIDES = JSON.parse(
  readFileSync(join(REPO, "content/models/_standin-overrides.json"), "utf8"),
) as {
  heroPaladinRawHeight: number;
  overrides: Record<string, { relativeScale?: number; usca?: number; rawHeight?: number }>;
};

function championDoc(id: string): { tint?: [number, number, number]; alpha?: number } {
  return JSON.parse(readFileSync(join(REPO, "content/champions", `${id}.json`), "utf8"));
}

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

/**
 * A stand-in for the AssetManager's cached container, shaped like a REAL
 * blizzard-overlay glb: one textured PBR mesh (measured live: every overlay
 * model is PBRMaterial + `albedoTexture` "mat0 (Base Color)" + white
 * `albedoColor`), of a chosen native height.
 */
function makeContainer(nativeHeight: number, label: string): {
  container: AssetContainer;
  source: PBRMaterial;
  texture: RawTexture;
} {
  const container = new AssetContainer(scene);
  const mesh = MeshBuilder.CreateBox(`${label}-body`, { size: 1 }, scene);
  mesh.scaling.y = nativeHeight; // a unit box stretched → native height is exact
  const texture = RawTexture.CreateRGBATexture(
    new Uint8Array([200, 40, 40, 255]),
    1,
    1,
    scene,
    false,
  );
  texture.name = `${label}-basecolor`;
  const source = new PBRMaterial(`${label}-mat`, scene);
  source.albedoTexture = texture;
  mesh.material = source;
  container.meshes.push(mesh);
  container.rootNodes.push(mesh);
  container.materials.push(source);
  container.removeAllFromScene();
  return { container, source, texture };
}

const docFor = (glbPath: string): ModelDoc =>
  ({
    id: "test.model",
    schema: "model@1",
    glbPath,
    scale: 1,
    collisionRadius: 0.6,
    clipMap: {
      idle: "Stand",
      run: "Walk",
      attack: "Attack",
      cast: "Spell",
      hurt: "Stand",
      death: "Death",
    },
  }) as ModelDoc;

/** the overlay path shape `blizzardOverlay.overlayModelDoc` synthesizes. */
const BLIZZARD_GLB = "assets/blizzard-local/models/Hapm.glb";
/** one of the four generated blocky bodies the voxel palette is authored for. */
const VOXEL_GLB = "assets/models/champions/blocky-knight.glb";

/** let tryUpgradeToGlb's `assets.load().then(...)` land. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

/** the adopted glb mesh under a view (named `${entityId}-${sourceName}`). */
function glbMesh(view: ChampionView, entityId: number, label: string): AbstractMesh {
  const m = view.root.getChildMeshes(false).find((x) => x.name === `${entityId}-${label}-body`);
  expect(m, "the adopted glb mesh").toBeDefined();
  return m!;
}

// ---------------------------------------------------------------- scale

describe("w3x-model-scale — the map's size reaches the screen", () => {
  /**
   * THE DEFECT: with no override the renderer normalises every glb to the same
   * TARGET_HEIGHT, so a 2× WC3 model and a 0.95× one both stood exactly 1.8u.
   * This asserts the multiplier is really folded into the scale WRITTEN on the
   * mesh — not merely present in the JSON.
   */
  it("ChampionView multiplies relativeScale into the height normalisation", async () => {
    cover("w3x-model-scale");
    const NATIVE = 3.0; // deliberately NOT 1.8: normalisation must do real work
    const { container } = makeContainer(NATIVE, "wc3");
    const assets = { load: () => Promise.resolve(container) } as unknown as AssetManager;

    // 姜窩肯 (Keeper of the Grove, 1.989) vs 學姊 (BansheeRanger, 0.945) — read
    // from the shipped file, so a data edit and a renderer edit both land here.
    const big = relativeScaleOf(OVERRIDES.overrides["godie-ecen"] ?? null);
    const small = relativeScaleOf(OVERRIDES.overrides["godie-n01l"] ?? null);
    expect(big).toBeGreaterThan(1);
    expect(small).toBeLessThan(1);

    const viewBig = new ChampionView(scene, 1101, "champ.sela", 1);
    viewBig.tryUpgradeToGlb(assets, docFor(BLIZZARD_GLB), big);
    const viewSmall = new ChampionView(scene, 1102, "champ.skin.rogue", 1);
    viewSmall.tryUpgradeToGlb(assets, docFor(BLIZZARD_GLB), small);
    await flush();

    // the scale actually written on the adopted root
    expect(viewBig.declaredScale).toBeCloseTo((TARGET_HEIGHT / NATIVE) * big, 5);
    expect(viewSmall.declaredScale).toBeCloseTo((TARGET_HEIGHT / NATIVE) * small, 5);
    // …which is a RENDERED height, in world units, that differs per champion
    expect(viewBig.declaredScale! * NATIVE).toBeCloseTo(TARGET_HEIGHT * big, 5);
    expect(viewSmall.declaredScale! * NATIVE).toBeCloseTo(TARGET_HEIGHT * small, 5);
    expect(viewBig.declaredScale!).toBeGreaterThan(viewSmall.declaredScale! * 2);

    viewBig.dispose();
    viewSmall.dispose();
  });

  it("the shipped table really does size the 40 apart (not a flat roster)", () => {
    cover("w3x-model-scale");
    const rendered = ["godie-n01l", "godie-h02n", "godie-ecen", "godie-hpal"].map(
      (id) => TARGET_HEIGHT * relativeScaleOf(OVERRIDES.overrides[id] ?? null),
    );
    // 學姊 shorter than the paladin baseline, 約翰走路 and 藤井八雲 far taller
    expect(rendered[0]!).toBeLessThan(TARGET_HEIGHT);
    expect(rendered[1]!).toBeCloseTo(TARGET_HEIGHT, 5);
    expect(rendered[2]!).toBeGreaterThan(3);
    expect(rendered[3]!).toBeGreaterThan(rendered[2]!);
  });
});

// ---------------------------------------------------------------- tint

describe("w3x-model-tint — the WC3 skin survives, and the w3x tint lands on it", () => {
  /**
   * THE DEFECT: `GameApp.modelOverrideFor` attaches a voxel look whenever the
   * champion's MODEL KEY is one of the four shared stand-ins — which is true
   * for all 40, because that is exactly how blizzardOverlay recognises them.
   * ChampionView then painted the 16×16 palette over whatever glb had landed.
   * After #31 the glb that lands is the champion's Warcraft III model.
   */
  it("a Blizzard overlay model keeps its own albedoTexture (no voxel palette)", async () => {
    cover("w3x-model-tint");
    const { container, source, texture } = makeContainer(1.7, "wc3");
    const assets = { load: () => Promise.resolve(container) } as unknown as AssetManager;

    const view = new ChampionView(scene, 1201, "champ.thorne", 1);
    view.setVoxelLook(voxelLookFor("godie-hapm", "knight")); // the look IS resolved
    view.tryUpgradeToGlb(assets, docFor(BLIZZARD_GLB), 1.2);
    await flush();

    const mesh = glbMesh(view, 1201, "wc3");
    const mat = mesh.material as PBRMaterial;
    // the mesh still wears the container's own material and its WC3 texture.
    // (Compared by name/uniqueId, never by object identity: a failing
    // `toBe(babylonMaterial)` makes vitest deep-diff two scene graphs and the
    // worker OOMs before it can print the failure.)
    expect(mat.uniqueId).toBe(source.uniqueId);
    expect(mat.albedoTexture?.name).toBe(texture.name);
    expect(mat.albedoTexture!.getSize().width).toBe(1); // NOT the 16px palette
    view.dispose();
  });

  it("a generated blocky body DOES get the palette (the gate is not a blanket off-switch)", async () => {
    cover("w3x-model-tint");
    const { container, source } = makeContainer(1.7, "voxel");
    const assets = { load: () => Promise.resolve(container) } as unknown as AssetManager;

    const view = new ChampionView(scene, 1202, "champ.thorne", 1);
    view.setVoxelLook(voxelLookFor("godie-o02n", "knight"));
    view.tryUpgradeToGlb(assets, docFor(VOXEL_GLB), 1);
    await flush();

    const mesh = glbMesh(view, 1202, "voxel");
    const mat = mesh.material as PBRMaterial;
    expect(mat.uniqueId).not.toBe(source.uniqueId); // a per-view clone (#226)
    expect(mat.name).toContain("champ-1202-voxel");
    expect(mat.albedoTexture!.getSize().width).toBe(VOXEL_TEX_EDGE);
    // and the SHARED source is never written (the #226 material-ownership rule)
    expect(source.albedoTexture!.getSize().width).toBe(1);
    view.dispose();
  });

  /**
   * The colour half end-to-end: the value in the SHIPPED champion doc reaches
   * the material as a multiply on the model's own base colour. 海克力斯 is the
   * #49 poster child — 黑紅 comes from uclr 80/80/80 → 0.3137.
   */
  it("the shipped w3x tint multiplies the Blizzard material, not a palette", async () => {
    cover("w3x-model-tint");
    const { container } = makeContainer(1.7, "wc3");
    const assets = { load: () => Promise.resolve(container) } as unknown as AssetManager;

    const view = new ChampionView(scene, 1203, "champ.thorne", 1);
    view.setVoxelLook(voxelLookFor("godie-hapm", "knight"));
    view.tryUpgradeToGlb(assets, docFor(BLIZZARD_GLB), 1.2);
    await flush();

    const champ = championDoc("godie-hapm");
    expect(champ.tint, "godie-hapm ships the #49 黑紅 tint").toBeDefined();
    const tint = resolveModelTint(champ)!;
    expect(applyModelTint(view.root, tint)).toBeGreaterThan(0);

    const mesh = glbMesh(view, 1203, "wc3");
    const mat = mesh.material as PBRMaterial;
    // #49 clones and MULTIPLIES albedoColor (gamma-corrected for the PBR path)
    expect(mat.name).toContain("#tint");
    expect(mat.albedoColor.r).toBeCloseTo(Math.pow(champ.tint![0], 2.2), 4);
    expect(mat.albedoColor.r).toBeLessThan(0.2); // visibly 黑, not "slightly dim"
    // …and it multiplied the WC3 base colour texture, which is still there
    expect(mat.albedoTexture!.getSize().width).toBe(1);
    view.dispose();
  });
});

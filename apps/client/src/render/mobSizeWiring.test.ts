/**
 * 一般殭屍 / 特殊殭屍 / 殭屍王 MUST BE THREE DIFFERENT SIZES ON SCREEN, AND ALL
 * THREE MUST BE DARK (#262 size, GH#192 model-from-champion + 染黑).
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE (failure shape ① / ⑦) ──────────────────
 *
 * #262 shipped three mob model docs and routed the sim's `MobComp.kind` onto the
 * wire through `EntityState.key`. Its guard asserted that the three kinds
 * resolve to three DISTINCT model keys, and concluded 「看得出來是王」.
 *
 * THAT IS AN ATTRIBUTE, NOT THE BEHAVIOUR. All three docs pointed at the SAME
 * `blocky-undead.glb`, and since task #150 `ChampionView.tryUpgradeToGlb`
 * HEIGHT-NORMALIZES every adopted .glb to TARGET_HEIGHT — the on-screen size
 * comes from `relativeScale`. Three keys, three docs, ONE silhouette.
 *
 * ── AND WHY THE CHANNEL MOVED AGAIN IN GH#192 ──────────────────────────────
 *
 * GH#192 resolves the mob's mesh FROM ITS CHAMPION (owner: 「選什麼英雄就會讀取
 * 什麼 3d modal」), so on the shipped arena all three kinds now carry the SAME
 * key. The key can no longer imply a size at all: the per-kind 體型倍率 travels
 * per entity (`EntityState.mana` → `EntityViewState.mobScale`) and multiplies
 * the model doc's own scale. So this file asserts the RENDERED SIZE through the
 * real registry, the real ChampionView normalization and the real GameApp seam
 * (`mobModelSizeOverride` + `modelDocFor`), on the SHIPPED arena-rules read off
 * disk — never on a key comparison, which a correct build would now fail.
 *
 * The same file covers 染黑, because 「模型從英雄來」 is what CREATED the need for
 * it: without the tint a zombie wearing 喪標麥可 is pixel-identical to a player
 * who picked 喪標麥可.
 *
 * Runs on Babylon's NullEngine (headless), like the other render tests.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Animation } from "@babylonjs/core/Animations/animation";
import type { ModelDoc } from "@ggd/shared/content";
import { ENTITY_KIND } from "@ggd/shared/protocol/schema";
import {
  mobModelKeyFor,
  mobRulesFromConfig,
  mobSizeMultFor,
  type MobRules,
} from "@ggd/shared/sim/mobs";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content/schema/config";
import {
  EntityViewRegistry,
  mobModelSizeOverride,
  relativeScaleOf,
  type EntityViewState,
} from "./EntityViewRegistry";
import { TARGET_HEIGHT } from "./views/ChampionView";
import { entityTintFor, mobTintFor } from "./views/mobTint";
import { championTintForId } from "./views/championTint";
import { applyModelTint, tintedMeshes } from "./views/modelTint";
import type { AssetManager } from "./AssetManager";

const CONTENT = join(__dirname, "../../../../content");

/** the SHIPPED model doc for `key`, read off disk (⑤: test what ships). */
function shippedDoc(key: string): ModelDoc {
  return JSON.parse(readFileSync(join(CONTENT, "models", `${key}.json`), "utf8")) as ModelDoc;
}

/** the SHIPPED arena-rules mobWaves block, armed exactly as a match arms it. */
const SHIPPED_RULES: MobRules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, 1 / 30);

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

/** a fresh unit-box .glb container — native height 1, so the normalization
 *  factor is exactly TARGET_HEIGHT and declaredScale reads back noise-free. */
function makeContainer(): AssetContainer {
  const container = new AssetContainer(scene);
  const mesh = MeshBuilder.CreateBox("undead-body", { size: 1 }, scene);
  container.meshes.push(mesh);
  container.rootNodes.push(mesh);
  const g = new AnimationGroup("idle", scene);
  const a = new Animation("idle-y", "rotation.y", 60, Animation.ANIMATIONTYPE_FLOAT);
  a.setKeys([
    { frame: 0, value: 0 },
    { frame: 1, value: 0 },
  ]);
  g.addTargetedAnimation(a, mesh);
  container.animationGroups.push(g);
  container.removeAllFromScene();
  return container;
}

const mob = (id: number, key: string, mobScale: number): EntityViewState => ({
  id,
  kind: ENTITY_KIND.MOB,
  seatId: -1, // ← the whole reason the champion override path cannot cover this
  key,
  teamId: 9,
  x: id,
  z: 0,
  fx: 1,
  fz: 0,
  alive: true,
  mobScale,
});

const passthrough = (e: EntityViewState) => ({ x: e.x, z: e.z, fx: e.fx, fz: e.fz });

describe("殭屍王 / 特殊殭屍 render size (task #262 → GH#192, failure shape ①)", () => {
  it("the SHIPPED rules declare three different 體型倍率 — and the mesh comes from the CHAMPION", () => {
    cover("mob-special-visible");
    const sizes = (["normal", "special", "boss"] as const).map((k) =>
      mobSizeMultFor(SHIPPED_RULES, k),
    );
    expect(sizes[2]!).toBeGreaterThan(sizes[1]!);
    expect(sizes[1]!).toBeGreaterThan(sizes[0]!);
    // GH#192: no `modelKey` override is authored, so all three resolve to the
    // champion's own mesh. This is the assertion #262's 「three DIFFERENT keys」
    // became — stated as the equality it now is, so nobody re-adds the old one.
    const keys = (["normal", "special", "boss"] as const).map((k) =>
      mobModelKeyFor(SHIPPED_RULES, k),
    );
    expect(new Set(keys).size).toBe(1);
    // …and that ONE key is a real doc on disk, or every mob renders as nothing.
    expect(() => shippedDoc(keys[0]!)).not.toThrow();
  });

  it("mobModelSizeOverride multiplies the doc's scale by the wire's 體型倍率 — and leaves champions alone", () => {
    cover("mob-special-visible");
    const doc = shippedDoc(mobModelKeyFor(SHIPPED_RULES, "normal"));
    const e = { kind: ENTITY_KIND.MOB, mobScale: 4 } as Pick<
      EntityViewState,
      "kind" | "mobScale"
    >;
    expect(relativeScaleOf(mobModelSizeOverride(e, doc))).toBeCloseTo(doc.scale * 4, 9);
    // A CHAMPION with the very same doc must NOT pick it up — #150's
    // normalization owns champion size, and this branch must not leak into it.
    expect(mobModelSizeOverride({ kind: 0, mobScale: 4 }, doc)).toBeNull();
    // A pre-GH#192 server sends no size ⇒ the doc's own scale, i.e. #262's
    // behaviour, rather than 0× / NaN× / a silently 1× king.
    expect(relativeScaleOf(mobModelSizeOverride({ kind: ENTITY_KIND.MOB }, doc))).toBe(doc.scale);
    // degenerate inputs fall back to 1× rather than collapsing the model
    expect(mobModelSizeOverride({ kind: ENTITY_KIND.MOB, mobScale: 0 }, null)).toBeNull();
    expect(mobModelSizeOverride({ kind: ENTITY_KIND.MOB, mobScale: NaN }, null)).toBeNull();
    expect(
      relativeScaleOf(mobModelSizeOverride({ kind: ENTITY_KIND.MOB, mobScale: 3 }, { ...doc, scale: 0 })),
    ).toBe(3);
  });

  it("END TO END: the king renders BIGGER than the special, which renders bigger than the zombie", async () => {
    cover("mob-special-visible");
    // The GameApp seam, verbatim: key → shipped model doc → mobModelSizeOverride.
    const docs = new Map<string, ModelDoc>();
    for (const kind of ["normal", "special", "boss"] as const) {
      const key = mobModelKeyFor(SHIPPED_RULES, kind);
      docs.set(key, shippedDoc(key));
    }
    const modelDocFor = (key: string): ModelDoc | null => docs.get(key) ?? null;

    const assets = { load: () => Promise.resolve(makeContainer()) } as unknown as AssetManager;
    const registry = new EntityViewRegistry(scene, assets, {
      modelDocFor,
      modelOverrideFor: (e) => mobModelSizeOverride(e, modelDocFor(e.key)),
    });

    const key = (k: "normal" | "special" | "boss"): string => mobModelKeyFor(SHIPPED_RULES, k);
    registry.sync({
      entities: [
        mob(940, key("normal"), mobSizeMultFor(SHIPPED_RULES, "normal")),
        mob(941, key("special"), mobSizeMultFor(SHIPPED_RULES, "special")),
        mob(942, key("boss"), mobSizeMultFor(SHIPPED_RULES, "boss")),
      ],
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
    });
    for (let i = 0; i < 6; i++) await Promise.resolve(); // flush the async adopt

    const normal = registry.getChampionView(940)!.declaredScale!;
    const special = registry.getChampionView(941)!.declaredScale!;
    const king = registry.getChampionView(942)!.declaredScale!;

    // THE DISCRIMINATING ASSERTION. An implementation that dropped the wire's
    // 體型倍率 gives all three the SAME number (the shipped doc's scale ×
    // TARGET_HEIGHT), and every line below fails.
    expect(king).toBeGreaterThan(special);
    expect(special).toBeGreaterThan(normal);
    const docScale = docs.get(key("normal"))!.scale;
    for (const [id, kind] of [
      [940, "normal"],
      [941, "special"],
      [942, "boss"],
    ] as const) {
      expect(registry.getChampionView(id)!.declaredScale!).toBeCloseTo(
        TARGET_HEIGHT * docScale * mobSizeMultFor(SHIPPED_RULES, kind),
        5,
      );
    }
    // owner GH#192 「modal 大小是10倍」 — the RATIO, not merely 「bigger」.
    expect(king / normal).toBeCloseTo(10, 5);
    // MEASURED, for the record and for the openQuestion: 1.224u zombie → 12.24u
    // king, against a 1.8u champion and a 24u-radius arena zone.
    expect(normal).toBeCloseTo(1.224, 3);
    expect(king).toBeCloseTo(12.24, 2);
    registry.dispose();
  });
});

describe("殭屍染黑 (GH#192) — 「避免跟玩家混在一起」", () => {
  it("the shipped strength really darkens a material, and 0 is a true no-op", () => {
    cover("mob-special-visible");
    const shipped = SHIPPED_RULES.tintStrength;
    expect(shipped).toBe(0.65);

    // A REAL Babylon material, painted through the REAL #49 pipeline — not a
    // check that `mobTintFor` returns an array (failure shape ⑦).
    const root = MeshBuilder.CreateBox("mob-body", { size: 1 }, scene);
    const mat = new StandardMaterial("mob-mat", scene);
    mat.diffuseColor.set(1, 1, 1);
    root.material = mat;

    expect(applyModelTint(root, mobTintFor(shipped))).toBe(0); // no CHILD meshes
    const child = MeshBuilder.CreateBox("mob-torso", { size: 1 }, scene);
    child.parent = root;
    child.material = mat;
    expect(applyModelTint(child.parent as never, mobTintFor(shipped))).toBe(1);

    const painted = tintedMeshes(root)[0]!;
    const c = (painted.material as StandardMaterial).diffuseColor;
    // StandardMaterial is a gamma pipeline, so the multiply lands verbatim.
    expect(c.r).toBeCloseTo(0.35, 6);
    expect(c.g).toBeCloseTo(0.35, 6);
    expect(c.b).toBeCloseTo(0.35, 6);
    // …and it is genuinely DARK, not "slightly dim" — the whole point.
    expect(c.r).toBeLessThan(0.5);

    // 0 must be a real no-op: `null` so the registry caches 「resolved,
    // untinted」 instead of retrying, and zero Babylon work.
    expect(mobTintFor(0)).toBeNull();
    // 1 is a black silhouette; out-of-range clamps instead of throwing, because
    // this number arrives off the wire from an admin-editable table.
    expect(mobTintFor(1)!.tint).toEqual([0, 0, 0]);
    expect(mobTintFor(5)!.tint).toEqual([0, 0, 0]);
    expect(mobTintFor(-1)).toBeNull();
    expect(mobTintFor(NaN)).toBeNull();
    root.dispose();
  });

  it("the tint hook ROUTES by kind: mobs get 染黑, champions keep their own colours", () => {
    cover("mob-special-visible");
    // THE BRANCH ITSELF (GH#192). Before it, a mob fell into the champion path,
    // where `seatId === -1` makes `championTintForId` answer `undefined` —
    // 「not resolvable yet」 — which the registry retries forever and never
    // paints. So the two cases must give DIFFERENT answers here.
    const championAnswer = { tint: [0.31, 0.31, 0.31] as [number, number, number] };
    let championCalls = 0;
    const champion = () => {
      championCalls++;
      return championAnswer;
    };

    const forMob = entityTintFor({ kind: ENTITY_KIND.MOB }, 0.65, champion);
    expect(forMob).not.toBeNull();
    expect(forMob!.tint).toEqual([0.35, 0.35, 0.35]);
    // …and the champion resolver was NOT consulted: a mob must not pay a seat
    // lookup per frame, and more importantly its answer must not leak through.
    expect(championCalls).toBe(0);

    // Every other kind is untouched — this branch must not repaint champions.
    expect(entityTintFor({ kind: 0 }, 0.65, champion)).toBe(championAnswer);
    expect(championCalls).toBe(1);
    // `undefined` (seat table not filled in yet) must survive the hop, or the
    // registry caches 「untinted」 for a champion whose tint has not loaded.
    expect(entityTintFor({ kind: 0 }, 0.65, () => undefined)).toBeUndefined();
    // 染黑 0 on a mob resolves to `null` = 「resolved, untinted」, never undefined
    // — otherwise the registry retries that mob every single frame forever.
    expect(entityTintFor({ kind: ENTITY_KIND.MOB }, 0, champion)).toBeNull();
  });

  /**
   * ── 稽核補的 (verifier) ─────────────────────────────────────────────────
   * 上面兩條測的是 `mobTintFor` / `entityTintFor` 這兩個**零件**。把
   * `EntityViewRegistry.sync` 裡那一行改成
   *
   *     if (e.kind !== ENTITY_KIND.MOB) this.applyTint(e, view, tier);
   *
   * ——也就是把染黑整條從**殭屍的渲染樹**上拔掉——之後 client 346 檔 / 4117 條
   * 全綠(失敗形狀 ③:從渲染樹刪掉還是綠的)。所以這一條不看回傳值,它讓真的
   * registry 跑一次,再去讀那隻殭屍身上**真的材質**的顏色。
   */
  it("END TO END: the REGISTRY really paints a mob's materials dark — and not a champion's", () => {
    cover("mob-special-visible");
    const key = mobModelKeyFor(SHIPPED_RULES, "normal");
    const registry = new EntityViewRegistry(scene, {} as unknown as AssetManager, {
      // GameApp 的組合,原封不動:mob 分支在前,英雄解析放在 thunk 後面。
      championTintFor: (e) =>
        entityTintFor(e, SHIPPED_RULES.tintStrength, () => championTintForId(null)),
    });
    registry.sync({
      entities: [
        mob(960, key, mobSizeMultFor(SHIPPED_RULES, "normal")),
        // 同一個 sync 裡的一位英雄 —— seatId 有值、kind 0。`championTintForId(null)`
        // 回 undefined(「還解析不出來」),所以它必須**一筆都沒被塗到**。
        { ...mob(961, key, 1), kind: 0, seatId: 3 },
      ],
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
      loadModels: false, // 程序生成的體素身體就夠了:.glb 不是這條斷言的主題
    });

    const mobPainted = tintedMeshes(registry.getChampionView(960)!.root);
    expect(mobPainted.length, "殭屍身上一片材質都沒被染黑").toBeGreaterThan(0);
    // 0.65 → 0.35 的乘法。StandardMaterial 是 gamma 管線,乘數原封落下。
    for (const m of mobPainted) {
      const c = (m.material as StandardMaterial).diffuseColor;
      expect(c.r).toBeLessThan(0.5);
      expect(c.g).toBeLessThan(0.5);
      expect(c.b).toBeLessThan(0.5);
    }
    // …而英雄一筆都沒動:兩個答案不同,所以「全部都塗」也過不了。
    expect(tintedMeshes(registry.getChampionView(961)!.root)).toHaveLength(0);
    registry.dispose();
  });
});

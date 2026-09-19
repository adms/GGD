/**
 * editor-07 (editor-model-inspector): the model inspector's two load-bearing
 * mechanics — clipMap resolution against the GLB's AnimationGroup list (KayKit
 * style names) and the collision-radius hitbox overlay — exercised for real
 * under NullEngine.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { cover } from "@ggd/shared/testkit/cover";
import { zModelDoc, type ModelDoc } from "@ggd/shared/content";
import { resolveClip, clipMapStatus, CLIP_STATES } from "./clips";
import {
  createCollisionCylinder,
  setCollisionRadius,
  createGroundGrid,
  COLLISION_CYLINDER_HEIGHT,
} from "./stage";

/** stub AnimationGroup list — names as they appear in the KayKit champion GLBs */
const KAYKIT_CLIPS = [
  "Idle",
  "Running_A",
  "Spellcast_Shoot",
  "Spellcast_Long",
  "1H_Melee_Attack_Slice_Diagonal",
  "2H_Melee_Attack_Spin",
  "Hit_A",
  "Death_A",
].map((name) => ({ name }));

const SELA: ModelDoc = zModelDoc.parse({
  id: "champ.sela",
  schema: "model@1",
  glbPath: "assets/models/champions/blocky-mage.glb",
  scale: 0.55,
  collisionRadius: 0.6,
  clipMap: {
    idle: "Idle",
    run: "Running_A",
    attack: "Spellcast_Shoot",
    cast: "Spellcast_Long",
    hurt: "Hit_A",
    death: "Death_A",
  },
});

describe("clipMap resolution (stub AnimationGroup list)", () => {
  it("resolves exact names, case-insensitive fallback, null when missing", () => {
    cover("editor-model-inspector");
    expect(resolveClip(KAYKIT_CLIPS, "Idle")?.name).toBe("Idle");
    expect(resolveClip(KAYKIT_CLIPS, "1H_Melee_Attack_Slice_Diagonal")?.name).toBe(
      "1H_Melee_Attack_Slice_Diagonal",
    );
    // author typo forgiveness: case-insensitive fallback
    expect(resolveClip(KAYKIT_CLIPS, "idle")?.name).toBe("Idle");
    expect(resolveClip(KAYKIT_CLIPS, "running_a")?.name).toBe("Running_A");
    // ⭐ GH#1261 —— 指名比對改走共用的 `clipNameMatches` ⇒ 連帶容忍 Babylon
    // `instantiateModelsToScene` 給複製體加的前綴（比賽那一邊本來就有）
    expect(resolveClip([{ name: "e17-Idle" }], "Idle")?.name).toBe("e17-Idle");
    // genuinely missing -> null。⛔ `resolveClip` **刻意**沒有別名那一半 ——
    // 別名＝「文件寫錯但救得回來」,它必須被看見(`viaAlias`),所以只住 `clipMapStatus`。
    expect(resolveClip(KAYKIT_CLIPS, "Walk")).toBeNull();
  });

  it("clipMapStatus reports every logical state, and 別名救回來的那一格要說出來", () => {
    const ok = clipMapStatus(SELA.clipMap, KAYKIT_CLIPS);
    expect(ok.map((e) => e.state)).toEqual([...CLIP_STATES]);
    expect(ok.every((e) => e.found)).toBe(true);
    // 每一格都指名對得上 ⇒ ⛔ 沒有人是被救回來的（黃字不可以亂跳出來）
    expect(ok.some((e) => e.viaAlias)).toBe(false);

    // ⭐⭐ GH#1261 —— 文件把 cast 打成 "Spellcast_Loong"（glb 裡沒有這一條）。
    // ⭐ **比賽照樣播得出來**（別名 "cast" 命中 "Spellcast_Shoot"）⇒ 預覽也必須，
    // ⛔ 在此之前這一格是 found:false（灰的、按不動）—— 那正是這張票的缺陷本體。
    const typo = clipMapStatus({ ...SELA.clipMap, cast: "Spellcast_Loong" }, KAYKIT_CLIPS);
    const cast = typo.find((e) => e.state === "cast")!;
    expect(cast.found).toBe(true);
    expect(cast.clip).toBe("Spellcast_Shoot"); // playClip 拿到的是**真的會播**的那一條
    expect(cast.requested).toBe("Spellcast_Loong"); // ⭐ 文件寫的那個仍然留著 ⇒ 畫面說得出「文件寫 X」
    expect(cast.viaAlias).toBe(true); // ⇒ ModelPanel 標黃
    expect(typo.filter((e) => !e.found)).toHaveLength(0);

    // ⛔ 別名**不是**「永遠找得到」：一條都沾不上邊時仍然要是紅的
    const dead = clipMapStatus({ ...SELA.clipMap, death: "Nope" }, [{ name: "Idle" }]);
    const death = dead.find((e) => e.state === "death")!;
    expect(death.found).toBe(false);
    expect(death.viaAlias).toBe(false);
    expect(death.clip).toBe("Nope"); // 找不到時退回文件寫的那個 ⇒ 錯誤訊息仍然指得出來
  });

  it("那四隻殭屍在預覽裡按得動（文件 run 寫 walk，而 glb 只有 run）", () => {
    // 出貨量到的 4 份：champ.godie-zombiex · champ.mob.zombie{,-special,-king}
    // —— 共用 assets/models/champions/blocky-undead.glb
    const UNDEAD_CLIPS = ["idle", "run", "attack", "cast", "hurt", "death", "cheer"].map(
      (name) => ({ name }),
    );
    const zombie: ModelDoc = zModelDoc.parse({
      id: "champ.mob.zombie",
      schema: "model@1",
      glbPath: "assets/models/champions/blocky-undead.glb",
      scale: 0.55,
      collisionRadius: 0.6,
      clipMap: {
        idle: "idle",
        run: "walk", // ⛔ glb 裡沒有 walk
        attack: "attack",
        cast: "attack",
        hurt: "hurt",
        death: "death",
      },
    });

    const st = clipMapStatus(zombie.clipMap, UNDEAD_CLIPS);
    const run = st.find((e) => e.state === "run")!;
    expect(run.found).toBe(true); // ⛔ 在此之前 false ⇒ 按鈕 disabled ⇒ 「預覽裡按不動」
    expect(run.clip).toBe("run"); // playClip 拿到的名字 ⇒ 真的播得起來
    expect(run.requested).toBe("walk");
    expect(run.viaAlias).toBe(true);
    // ⭐ 只有 run 被救 —— cast 指名 "attack" 是**作者刻意**的，⛔ 不可以被標成錯的
    expect(st.filter((e) => e.viaAlias).map((e) => e.state)).toEqual(["run"]);
  });
});

describe("hitbox overlay (NullEngine)", () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it("collision cylinder is unit-radius scaled to collisionRadius, wireframe, grounded", () => {
    const cyl = createCollisionCylinder(scene, SELA.collisionRadius);
    // x/z scaling IS the radius (live edits are a scaling write, not a rebuild)
    expect(cyl.scaling.x).toBe(0.6);
    expect(cyl.scaling.z).toBe(0.6);
    expect(cyl.scaling.y).toBe(1);
    expect(cyl.position.y).toBeCloseTo(COLLISION_CYLINDER_HEIGHT / 2, 10);
    expect((cyl.material as { wireframe?: boolean }).wireframe).toBe(true);

    setCollisionRadius(cyl, 1.25);
    expect(cyl.scaling.x).toBe(1.25);
    expect(cyl.scaling.z).toBe(1.25);

    // unit cylinder: local bounds are radius 1 wide; world = scaled
    cyl.computeWorldMatrix(true);
    const bb = cyl.getBoundingInfo().boundingBox;
    expect(bb.maximumWorld.x).toBeCloseTo(1.25, 5);
    expect(bb.minimumWorld.x).toBeCloseTo(-1.25, 5);
  });

  it("ground grid builds a line system in the scene", () => {
    const before = scene.meshes.length;
    const grid = createGroundGrid(scene, 8, 1);
    expect(scene.meshes.length).toBe(before + 1);
    expect(grid.isPickable).toBe(false);
  });
});

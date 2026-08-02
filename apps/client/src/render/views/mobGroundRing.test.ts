/**
 * #247 —— 殭屍王腳下的圈圈 (owner 2026-08-01:
 * 「殭屍王底下圈圈會比較大，但不影響無碰撞」).
 *
 * TWO CLAIMS, and only the FIRST of them lives on the client:
 *   1. the ring under a 10× king is really drawn 10× wider — measured off the
 *      LIVE torus on a real Babylon scene, not off a remembered input
 *      (`ChampionView.groundRingDiameter` derives from `teamRing.scaling`);
 *   2. widening it changes nothing the king collides with — that one is a SIM
 *      claim and is guarded where the collision is, in
 *      packages/shared/src/sim/mobBossNoClip.test.ts.
 *
 * ⚠️ THE ASSERTION THAT WOULD HAVE BEEN USELESS: 「setGroundRingDiameter was
 * called with 12.5」. The whole call is deletable from the render tree and a
 * mock would still see it (失敗形狀 ③). These read the mesh.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ChampionView } from "./ChampionView";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import { mobRingDiameterFor } from "./mobGroundRing";
import { AssetManager } from "../AssetManager";
import { ENTITY_KIND } from "@ggd/shared/protocol/schema";
import {
  MOB_VISUAL_DEFAULT,
  mobGroundRingDiameter,
  parseMobVisualJson,
} from "@ggd/shared/sim/mobs";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content/schema/config";

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

let nextId = 900;
const newView = (): ChampionView => new ChampionView(scene, nextId++, "champ.mob.zombie-king", 1);

describe("#247 腳下圈圈 — the torus really changes size", () => {
  it("a fresh view wears the champion ring; the shipped king's number widens it 10×", () => {
    cover("mob-boss-ring");
    const v = newView();
    // the 1× reference every champion keeps
    expect(v.groundRingDiameter).toBeCloseTo(ChampionView.TEAM_RING_DIAMETER, 6);

    // THE SHIPPED NUMBER, resolved through the same function the game uses.
    // ⚠️ 體型倍率**讀設定**（owner 2026-08-02 把它從 10 減半成 5）;寫死會讓這條
    // 在一次平衡調整後說假話 —— 它會紅,但紅的理由不是「圈圈沒變寬」。
    const kingSize = DEFAULT_MOB_WAVES_CONFIG.boss!.sizeMult!;
    const d = mobGroundRingDiameter(kingSize, MOB_VISUAL_DEFAULT);
    const expectedD = ChampionView.TEAM_RING_DIAMETER * kingSize;
    expect(d).toBeCloseTo(expectedD, 6);

    v.setGroundRingDiameter(d);
    expect(v.groundRingDiameter).toBeCloseTo(expectedD, 5);
    // …and it is a REAL widening of the mesh, not a stored field: 網格的縮放
    // 真的等於那個倍率。
    expect(v.teamRingScaling.x).toBeCloseTo(kingSize, 5);
    expect(v.teamRingScaling.z).toBeCloseTo(kingSize, 5);
    v.dispose();
  });

  it("scales X/Z only — the ring stays a ring on the floor, not a tall doughnut", () => {
    cover("mob-boss-ring");
    const v = newView();
    v.setGroundRingDiameter(ChampionView.TEAM_RING_DIAMETER * 10);
    // Y untouched: the torus's tube keeps its authored vertical thickness. A
    // `setAll` here would put a 10×-tall ring around the king's knees.
    // （這裡的 10 是一個刻意誇張的**測試輸入**,不是出貨值 —— 越誇張越能看出
    //   Y 有沒有被順手一起縮。）
    expect(v.teamRingScaling.y).toBeCloseTo(1, 6);
    v.dispose();
  });

  it("`null` restores the champion ring, and so does any degenerate number", () => {
    cover("mob-boss-ring");
    const v = newView();
    v.setGroundRingDiameter(12.5);
    expect(v.groundRingDiameter).toBeGreaterThan(10);
    v.setGroundRingDiameter(null);
    expect(v.groundRingDiameter).toBeCloseTo(ChampionView.TEAM_RING_DIAMETER, 6);
    v.setGroundRingDiameter(Number.NaN);
    expect(v.groundRingDiameter).toBeCloseTo(ChampionView.TEAM_RING_DIAMETER, 6);
    v.setGroundRingDiameter(-4);
    expect(v.groundRingDiameter).toBeCloseTo(ChampionView.TEAM_RING_DIAMETER, 6);
    v.dispose();
  });

  it("the three mob kinds end up with three DIFFERENT rings on one screen", () => {
    cover("mob-boss-ring");
    // The shipped 體型倍率 of each kind, off the shipped doc.
    const table = parseMobVisualJson(
      JSON.stringify({
        tintStrength: 0.65,
        groundRingDiameter: DEFAULT_MOB_WAVES_CONFIG.mob.groundRingDiameter,
        groundRingSizeFollow: DEFAULT_MOB_WAVES_CONFIG.mob.groundRingSizeFollow,
      }),
    );
    const sizes = {
      normal: DEFAULT_MOB_WAVES_CONFIG.mob.sizeMult!,
      special: DEFAULT_MOB_WAVES_CONFIG.special!.sizeMult!,
      boss: DEFAULT_MOB_WAVES_CONFIG.boss!.sizeMult!,
    };
    const drawn: number[] = [];
    for (const s of [sizes.normal, sizes.special, sizes.boss]) {
      const v = newView();
      v.setGroundRingDiameter(mobGroundRingDiameter(s, table));
      drawn.push(v.groundRingDiameter);
      v.dispose();
    }
    // strictly increasing — 「三個 kind 解析出三個數字」 would be the PROPERTY;
    // this reads three real meshes (失敗形狀 ⑦).
    expect(drawn[0]!).toBeLessThan(drawn[1]!);
    expect(drawn[1]!).toBeLessThan(drawn[2]!);
    // and the king's is unmistakably a king's — 比值讀出貨設定（owner 2026-08-02
    // 把王的體型減半，寫死的 `> 10` 會在那一刻變成假話），再加一個「一眼看得出來」
    // 的下界擋掉同義反覆。
    const shippedRingRatio =
      DEFAULT_MOB_WAVES_CONFIG.boss!.sizeMult! / DEFAULT_MOB_WAVES_CONFIG.mob!.sizeMult!;
    expect(drawn[2]! / drawn[0]!).toBeCloseTo(shippedRingRatio, 5);
    expect(shippedRingRatio).toBeGreaterThanOrEqual(3);
  });
});

describe("#247 腳下圈圈 — the decision GameApp delegates", () => {
  /**
   * `GameApp` is the composition root and nothing drives it headlessly, so a
   * decision left inline there is a decision nothing guards. Measured: replacing
   * the whole hook body with `null` typechecked clean and every test stayed
   * green. The decision now lives in `mobRingDiameterFor` and this is its guard.
   */
  it("a MOB is sized from the table; a CHAMPION is left alone", () => {
    cover("mob-boss-ring");
    const king = { kind: ENTITY_KIND.MOB, mobScale: 10 };
    expect(mobRingDiameterFor(king, MOB_VISUAL_DEFAULT)).toBeCloseTo(12.5, 6);
    // ⚠️ `null`, NOT 1.25: a champion must fall through to `ChampionView`'s own
    // ring rather than be re-sized from the ZOMBIE table every frame.
    expect(mobRingDiameterFor({ kind: 0, mobScale: 10 }, MOB_VISUAL_DEFAULT)).toBeNull();
    expect(mobRingDiameterFor({ kind: 1 }, MOB_VISUAL_DEFAULT)).toBeNull();
    // a pre-GH#192 server sends no size at all → exactly the champion ring
    expect(mobRingDiameterFor({ kind: ENTITY_KIND.MOB }, MOB_VISUAL_DEFAULT)).toBeCloseTo(1.25, 6);
  });
});

describe("#247 腳下圈圈 — the registry actually wires the seam", () => {
  /**
   * ③ 「可以從渲染樹刪掉但測試還是全綠」. Everything above would still pass with
   * `view.setGroundRingDiameter(...)` deleted from `EntityViewRegistry.sync` —
   * the king would just wear a champion-sized ring forever. This drives the
   * REGISTRY and then reads the torus straight out of the Babylon scene by the
   * name `ChampionView` builds it under, so the deletion goes red.
   */
  const mob = (id: number, mobScale: number): EntityViewState => ({
    id,
    kind: ENTITY_KIND.MOB,
    seatId: -1,
    key: "champ.mob.zombie-king",
    teamId: 255,
    x: 0,
    z: 0,
    fx: 1,
    fz: 0,
    alive: true,
    mobScale,
  });
  const champ = (id: number): EntityViewState => ({
    id,
    kind: 0,
    seatId: 0,
    key: "champ.sela",
    teamId: 1,
    x: 0,
    z: 0,
    fx: 1,
    fz: 0,
    alive: true,
  });
  const passthrough = (e: EntityViewState) => ({ x: e.x, z: e.z, fx: e.fx, fz: e.fz });
  const ringOf = (id: number): number => {
    const m = scene.getMeshByName(`champ-${id}-teamring`);
    expect(m, `no team ring mesh for entity ${id}`).not.toBeNull();
    return ChampionView.TEAM_RING_DIAMETER * m!.scaling.x;
  };

  it("a MOB gets the widened ring; a CHAMPION keeps the team-identity one", () => {
    cover("mob-boss-ring");
    // THE SHIPPED HOOK BODY, not a re-implementation: `GameApp` wires exactly
    // `mobRingDiameterFor(e, this.mobVisual)` and nothing else (失敗形狀 ⑤).
    const registry = new EntityViewRegistry(scene, new AssetManager(scene), {
      groundRingDiameterFor: (e) => mobRingDiameterFor(e, MOB_VISUAL_DEFAULT),
    });
    registry.sync({
      entities: [mob(4101, 10), champ(4102)],
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
      loadModels: false,
    });
    expect(ringOf(4101)).toBeCloseTo(12.5, 4);
    // 團隊識別圈 must NOT move for a player — #231 calls team colour the highest
    // -risk surface, and a champion whose ring grew would break that read.
    expect(ringOf(4102)).toBeCloseTo(ChampionView.TEAM_RING_DIAMETER, 6);
    registry.dispose();
  });
});

/**
 * 變身 form SIZE (task #249) — the renderer's FINAL `declaredScale`, not the
 * JSON number.
 *
 * WHY THIS TEST EXISTS AT ALL. Before #249 a 變身 body rendered on the shared
 * voxel stand-in while its base rendered on the real WC3 glb, so the two
 * `relativeScale` numbers were multiplied against DIFFERENT native mesh heights
 * and were never comparable. Now that both halves resolve to the SAME glb (see
 * blizzardOverlayForms.test.ts), `relativeScale` is directly comparable — and
 * an ABSENT entry beside a non-1.0 base silently renders the transform at the
 * wrong size. godie-n01b was exactly that: base 1.28, alternate absent (= 1.0),
 * i.e. 萬解-貓王胖虎 22% SHORTER than the body it transforms out of.
 *
 * So this asserts what ChampionView actually applied — `declaredScale`, read
 * off the view after the glb adopt — against the REAL shipped
 * content/models/_standin-overrides.json, driven through the same
 * ContentDb → EntityViewRegistry seam the composition root uses.
 *
 * The body is a unit box (native height 1), so the #150 height-normalization
 * factor is exactly TARGET_HEIGHT and `declaredScale` reads back as
 * TARGET_HEIGHT × relativeScale with no measurement noise.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { CHAMPION_FORM_PAIRS } from "@ggd/shared/content";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Animation } from "@babylonjs/core/Animations/animation";
import type { ModelDoc } from "@ggd/shared/content";
import { ContentDb } from "../../content/ContentDb";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import { TARGET_HEIGHT } from "./ChampionView";
import type { AssetManager } from "../AssetManager";

const OVERRIDES_PATH = join(
  __dirname,
  "../../../../../content/models/_standin-overrides.json",
);
const OVERRIDES_FILE: unknown = JSON.parse(readFileSync(OVERRIDES_PATH, "utf8"));

function mockFetch(file: unknown): typeof fetch {
  return ((input: unknown) => {
    const url = String(input).split("?")[0]!;
    if (url === "/content/models/_standin-overrides.json") {
      return Promise.resolve({ ok: true, status: 200, json: async () => file });
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  }) as unknown as typeof fetch;
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
afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE_DOC: ModelDoc = {
  id: "blizzard-local.shared",
  schema: "model@1",
  glbPath: "assets/blizzard-local/models/Shared.glb",
  scale: 1,
  collisionRadius: 0.6,
  clipMap: { idle: "Idle", run: "Idle", attack: "Idle", cast: "Idle", hurt: "Idle", death: "Idle" },
};

function makeContainer(): AssetContainer {
  const container = new AssetContainer(scene);
  const mesh = MeshBuilder.CreateBox("body", { size: 1 }, scene);
  container.meshes.push(mesh);
  container.rootNodes.push(mesh);
  const g = new AnimationGroup("Idle", scene);
  const a = new Animation("Idle-y", "rotation.y", 60, Animation.ANIMATIONTYPE_FLOAT);
  a.setKeys([
    { frame: 0, value: 0 },
    { frame: 1, value: 0 },
  ]);
  g.addTargetedAnimation(a, mesh);
  container.animationGroups.push(g);
  container.removeAllFromScene();
  return container;
}

const champ = (id: number, seatId: number): EntityViewState => ({
  id,
  kind: 0,
  seatId,
  key: "champ.sela",
  teamId: 1,
  x: id,
  z: 0,
  fx: 1,
  fz: 0,
  alive: true,
});
const passthrough = (e: EntityViewState) => ({ x: e.x, z: e.z, fx: e.fx, fz: e.fz });

/** championId → the render scale ChampionView actually wrote. */
async function declaredScales(ids: readonly string[]): Promise<Map<string, number>> {
  vi.stubGlobal("fetch", mockFetch(OVERRIDES_FILE));
  const db = new ContentDb();
  await db.load();
  const seatChampion = new Map<number, string>(ids.map((id, i) => [100 + i, id]));
  const assets = { load: () => Promise.resolve(makeContainer()) } as unknown as AssetManager;
  const registry = new EntityViewRegistry(scene, assets, {
    modelDocFor: () => BASE_DOC,
    modelOverrideFor: (e: EntityViewState) => {
      const championId = seatChampion.get(e.seatId);
      return championId ? db.modelOverrideFor(championId) : null;
    },
  });
  registry.sync({
    entities: ids.map((_, i) => champ(900 + i, 100 + i)),
    poseFor: passthrough,
    nowMs: 0,
    dtMs: 16,
  });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const out = new Map<string, number>();
  ids.forEach((id, i) => out.set(id, registry.getChampionView(900 + i)!.declaredScale!));
  registry.dispose();
  return out;
}

describe("變身 form declaredScale (blizzard-overlay-form-scale)", () => {
  it("O030 renders at the map's 3.0 — the largest authored 變身 scale", async () => {
    cover("blizzard-overlay-form-scale");
    const s = await declaredScales(["godie-orkn", "godie-o030"]);
    expect(s.get("godie-o030")).toBeCloseTo(TARGET_HEIGHT * 3.0, 5);
    // …and it really is the bigger half of the pair
    expect(s.get("godie-o030")!).toBeGreaterThan(s.get("godie-orkn")!);
  });

  it("E010 is SMALLER than its base — the map shrinks 紮根 from usca 1.10 to 1.00", async () => {
    cover("blizzard-overlay-form-scale");
    const s = await declaredScales(["godie-e00s", "godie-e010"]);
    expect(s.get("godie-e010")!).toBeLessThan(s.get("godie-e00s")!);
    // the exact w3u ratio 1.00 / 1.10, on one shared mesh
    expect(s.get("godie-e010")! / s.get("godie-e00s")!).toBeCloseTo(1.0 / 1.1, 5);
  });

  it("H00W matches its base exactly — both halves declare usca 1.00", async () => {
    cover("blizzard-overlay-form-scale");
    const s = await declaredScales(["godie-harf", "godie-h00w"]);
    expect(s.get("godie-h00w")).toBeCloseTo(s.get("godie-harf")!, 5);
    expect(s.get("godie-h00w")).toBeCloseTo(TARGET_HEIGHT * 1.0, 5);
  });

  it("every listed 變身 entry is finite and inside a sane render range", async () => {
    cover("blizzard-overlay-form-scale");
    const s = await declaredScales([
      "godie-h00w",
      "godie-o030",
      "godie-n01b",
      "godie-e010",
      "godie-o02n",
      "godie-o02o",
    ]);
    for (const [id, v] of s) {
      expect(Number.isFinite(v), id).toBe(true);
      expect(v, id).toBeGreaterThan(0);
      expect(v, id).toBeLessThanOrEqual(TARGET_HEIGHT * 7); // #77's documented ceiling
    }
    // 曹操孟德's two halves share one model AND one usca 1.30 — equal on screen
    expect(s.get("godie-o02n")).toBeCloseTo(s.get("godie-o02o")!, 5);
  });
});

/**
 * The render assertions above cannot tell an ENTRY WORTH 1.0 from NO ENTRY —
 * both produce relativeScale 1.0, so deleting godie-h00w's row left them all
 * green (verified by mutation). That is the 「刪掉還全綠」 hole, and this block
 * closes it at the data layer: each live 變身 form must carry an EXPLICIT row
 * whose declared `usca` is the number `war3map.w3u` actually holds, read from
 * the tracked importer fixture rather than from the note prose.
 */
describe("每個變身態都有明寫的 override 條目 (blizzard-overlay-form-usca-pin)", () => {
  const overrides = (OVERRIDES_FILE as { overrides: Record<string, Record<string, unknown>> })
    .overrides;

  /** `scale` (= `usca`) per hero rawcode, straight from the importer's dump. */
  const HEROES = (
    JSON.parse(
      readFileSync(
        join(__dirname, "../../../../../tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json"),
        "utf8",
      ),
    ) as { heroes: Record<string, { scale: number | null }> }
  ).heroes;

  /** WC3 default when the unit declares no `usca` at all. */
  const uscaOf = (rawcode: string): number => HEROES[rawcode]?.scale ?? 1;

  const LIVE = ["godie-h00w", "godie-o030", "godie-n01b", "godie-e010"] as const;

  it("the fixture and the shipped overrides both really loaded", () => {
    cover("blizzard-overlay-form-usca-pin");
    expect(Object.keys(HEROES).length).toBeGreaterThan(100);
    expect(Object.keys(overrides).length).toBeGreaterThan(30);
  });

  it("each live 變身 form has its OWN row, and its usca is the map's", () => {
    cover("blizzard-overlay-form-usca-pin");
    for (const id of LIVE) {
      const row = overrides[id];
      expect(row, `${id} needs an explicit row — absent silently means 1.0`).toBeDefined();
      const pair = CHAMPION_FORM_PAIRS.find((p) => p.alternateId === id)!;
      expect(row!.usca, `${id} usca`).toBe(uscaOf(pair.alternateUnitRawcode));
      expect(typeof row!.relativeScale, `${id} relativeScale`).toBe("number");
      // bounded: a negative or absurd number would render an invisible or
      // camera-breaking champion, and nothing else in the pipeline clamps it.
      expect(row!.relativeScale as number).toBeGreaterThan(0);
      expect(row!.relativeScale as number).toBeLessThanOrEqual(7);
    }
  });

  it("O030 is the map's 3.0 and the largest 變身 usca anywhere", () => {
    cover("blizzard-overlay-form-usca-pin");
    expect(overrides["godie-o030"]!.relativeScale).toBe(3.0);
    expect(uscaOf("O030")).toBe(3.0);
    expect(uscaOf("Orkn")).toBe(1); // base declares none → WC3 default
    const alternateUscas = CHAMPION_FORM_PAIRS.map((p) => uscaOf(p.alternateUnitRawcode));
    expect(Math.max(...alternateUscas)).toBe(3.0);
  });

  it("E010 shrinks (1.10 → 1.00) while H00W and N01B hold at the base's usca", () => {
    cover("blizzard-overlay-form-usca-pin");
    expect(uscaOf("E010")).toBeLessThan(uscaOf("E00S"));
    expect(overrides["godie-e010"]!.relativeScale as number).toBeLessThan(
      overrides["godie-e00s"]!.relativeScale as number,
    );
    // the map gives both halves of 26 and 40 the same usca
    expect(uscaOf("Harf")).toBe(uscaOf("H00W"));
    expect(uscaOf("Nman")).toBe(uscaOf("N01B"));
    // …and 26's shipped rows mirror that equality (40 cannot yet — see below)
    expect(overrides["godie-h00w"]!.relativeScale).toBe(overrides["godie-harf"]!.relativeScale);
  });
});

/**
 * THE COUPLING GUARD —— **閘已經開了(2026-07-30, #223)**。
 *
 * 這一組的前一版把「閘還關著」釘住,並且明說:
 *   「These assertions FAIL THE DAY SOMEONE OPENS THE GATE — which is exactly
 *     when godie-n01b's `relativeScale` must go 1.0 → 1.28.」
 * #223 的保底 (b)(`defaultPrefersVoxelBody` 缺省即繼承對半的答案,
 * `packages/shared/src/content/voxelSkin/types.ts`)就是把那道閘打開的東西,
 * 所以這一組**照設計紅了**。它不是壞掉,是在收帳。
 *
 * 前一版的斷言方向已經和出貨相反,留著就是「一條把 bug 釘住的測試」,所以這裡
 * 翻成新的事實:閘開了 → 六具身體改穿真的 WC3 模型 → **尺寸耦合到期**。
 * 沒有刪掉任何一條要求,只是把要求從「維持關著」換成「開了就要把帳結掉」。
 */
describe("變身體素閘已開 —— 尺寸耦合到期 (blizzard-overlay-form-voxel-gate)", () => {
  /** 兩半現在會載到**同一個** glb 的那些對(閘開之後才成立)。 */
  const NOW_MODEL_BODIED = [
    "godie-h00w",
    "godie-o030",
    "godie-n01b",
    "godie-e010",
    "godie-o02n",
    "godie-u011",
  ] as const;

  it("閘真的開了:這六具不再被 preferVoxelBody 擋在方塊人裡", async () => {
    cover("blizzard-overlay-form-voxel-gate");
    const { defaultPrefersVoxelBody } = await import("@ggd/shared/content/voxelSkin");
    // 被 manifest 直接收錄的那一半,本來就已經是模型身體
    expect(defaultPrefersVoxelBody("champ.skin.barbarian", "godie-harf")).toBe(false);
    expect(defaultPrefersVoxelBody("champ.skin.rogue", "godie-nman")).toBe(false);
    // 而「經由對半解析」的那些,現在也是 —— modelKey 讀出貨文件,不是手打的表
    for (const id of NOW_MODEL_BODIED) {
      const key = shippedModelKeyOf(id);
      expect(
        defaultPrefersVoxelBody(key, id),
        `${id}: 閘又關回去了 —— #223 的保底 (b) 被拿掉,這具身體會掉回程序生成的體素`,
      ).toBe(false);
    }
  });

  /**
   * ⚠️ 到期的那筆帳。兩半現在共用一個 mesh，`relativeScale` 就直接可比 ——
   * 不一致 = 變身的瞬間身高會跳。三對不一致，逐對裁決：
   *
   *  · `godie-nman 1.28 / godie-n01b 1.00` —— **缺陷**。`_standin-overrides.json`
   *    裡 godie-n01b 自己的 note 已經把算式寫死了：
   *    `147.99 ÷ 115.63 × 1.00 = 1.28`，「否則 萬解-貓王胖虎 renders 22%
   *    SHORTER than the body it transforms out of」。這一條是紅的，而且**應該
   *    紅**，直到那個內容值改掉。
   *  · `godie-orkn 1.922 / godie-o030 3.00` —— note249overlay 明寫
   *    「OWNER DECISION PENDING」，在 owner 裁決「忠實 3× vs 鏡頭安全」之前
   *    不可以靜默改。列為已知例外。
   *  · `godie-e00s 1.10 / godie-e010 1.00` —— **故意的**：70-00 紮根 就是要變
   *    矮，地圖自己寫 usca 1.10 → 1.00。列為已知例外。
   *  · `godie-u012 1.20 / godie-u011 (無)` —— 不列入：u011 沒有自己的欄位，
   *    `championBody.modelOverrideFor` 的「缺省即繼承」會給它 u012 的 1.20。
   *    那正是那條保底存在的理由。
   */
  it("共用同一個 mesh 的兩半,relativeScale 必須一致(例外要具名)", () => {
    cover("blizzard-overlay-form-voxel-gate");
    const OWNER_PENDING = "godie-o030"; // 忠實 3× vs 鏡頭安全,等 owner
    const INTENTIONAL_SHRINK = "godie-e010"; // 紮根 本來就要變矮
    expect(overridesOf("godie-orkn").relativeScale).toBe(1.922);
    expect(overridesOf(OWNER_PENDING).relativeScale).toBe(3);
    expect(overridesOf("godie-e00s").relativeScale).toBe(1.1);
    expect(overridesOf(INTENTIONAL_SHRINK).relativeScale).toBe(1);
    // 而這一對沒有任何理由不一致 —— 內容檔自己的 note 就是這樣寫的。
    expect(overridesOf("godie-nman").relativeScale).toBe(1.28);
    expect(
      overridesOf("godie-n01b").relativeScale,
      "體素閘已開(#223 保底 b),godie-n01b 現在載的是 Nman.glb。" +
        "content/models/_standin-overrides.json 的 godie-n01b.relativeScale 必須 1 → 1.28 " +
        "(147.99 ÷ 115.63 × 1.00,該檔自己的 note 寫的算式),然後跑 pnpm content:build。" +
        "不改的話 40 地獄歌神變身後比本體矮 22%。",
    ).toBe(1.28);
  });
});

/** 出貨文件裡這位英雄的 modelKey —— 不是測試自己抄一份表。 */
function shippedModelKeyOf(id: string): string {
  const p = new URL(`../../../../../content/champions/${id}.json`, import.meta.url);
  return (JSON.parse(readFileSync(p, "utf8")) as { modelKey: string }).modelKey;
}

function overridesOf(id: string): { relativeScale: number } {
  return (OVERRIDES_FILE as { overrides: Record<string, { relativeScale: number }> }).overrides[id]!;
}

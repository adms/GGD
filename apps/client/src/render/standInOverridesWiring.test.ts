/**
 * client-standin-override (task #77/#150, mdl-64/mdl-150d): the COMPOSITION-ROOT
 * wiring. GameApp resolves each champion entity → championId and reads the
 * per-champion size override out of content/models/_standin-overrides.json (loaded
 * client-side by ContentDb), then feeds it to EntityViewRegistry.modelOverrideFor.
 *
 * This test drives the REAL curated overrides file end-to-end:
 *   1. ContentDb.load() fetches models/_standin-overrides.json and exposes each
 *      championId's override via modelOverrideFor() (resolution half);
 *   2. a GameApp-shaped seam (seatId→championId→ContentDb.modelOverrideFor) hands
 *      the override to the registry, which applies its `relativeScale` ON TOP of
 *      ChampionView's height-normalization — a LISTED champion renders at its
 *      intended size, an UNLISTED one defaults to 1.0 = the normalized target
 *      (application half).
 * Runs on Babylon's NullEngine (headless), like the other render tests.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { isShipped } from "../testkit/contentFixtures";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Animation } from "@babylonjs/core/Animations/animation";
import type { ModelDoc } from "@ggd/shared/content";
import { BLIZZARD_MODEL_CHAMPIONS, defaultPrefersVoxelBody } from "@ggd/shared/content/voxelSkin";
import { ContentDb } from "../content/ContentDb";
import {
  EntityViewRegistry,
  relativeScaleOf,
  type EntityViewState,
} from "./EntityViewRegistry";
import { TARGET_HEIGHT } from "./views/ChampionView";
import type { AssetManager } from "./AssetManager";

// The 8 curated size exceptions, mirrored from content/models/_standin-overrides.json
// so the test asserts the SHIPPED data, not a fixture. Read from disk below.
const EXPECTED: Record<string, number> = {
  "godie-n00b": 0.65, // 小叮噹 / 哆啦A夢 — small robot cat
  "godie-ofar": 0.6, // 皮卡丘 — electric mouse
  "godie-hgam": 0.62, // 妙蛙種子 — small starter Pokémon
  "godie-h02k": 0.8, // 熊貓 — short round mascot
  "godie-h02u": 0.85, // 草泥馬 — stubby alpaca
  "godie-h02v": 0.85, // 草泥馬 (alt id)
  "godie-e00r": 1.55, // 初號機 (EVA Unit-01) — giant mecha
  "godie-ubal": 1.3, // 巴恩大魔王 — boss-scale antagonist
};

/** the real shipped overrides file (repo content/, 4 levels up from src/render). */
const OVERRIDES_FILE: unknown = JSON.parse(
  readFileSync(join(__dirname, "../../../../content/models/_standin-overrides.json"), "utf8"),
);

/** fetch stub: serve the real overrides file; 404 everything else so ContentDb
 *  degrades to empty maps for the collections this test does not exercise. */
function mockFetch(overridesFile: unknown): typeof fetch {
  return ((input: unknown) => {
    const url = String(input).split("?")[0]!;
    if (url === "/content/models/_standin-overrides.json") {
      return Promise.resolve({ ok: true, status: 200, json: async () => overridesFile });
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

/** Load a ContentDb over the real overrides file (fetch stubbed). */
async function loadContentDb(): Promise<ContentDb> {
  vi.stubGlobal("fetch", mockFetch(OVERRIDES_FILE));
  const db = new ContentDb();
  await db.load();
  return db;
}

// BASE_DOC's body is a unit box (native height 1) → the height-normalization
// factor is exactly TARGET_HEIGHT, so declaredScale reads back as
// TARGET_HEIGHT × relativeScale with no measurement noise.
const BASE_DOC: ModelDoc = {
  id: "champ.sela",
  schema: "model@1",
  glbPath: "assets/models/champions/blocky-mage.glb",
  scale: 0.77, // the SHARED stand-in size — irrelevant post-#150 normalization
  collisionRadius: 0.6,
  clipMap: { idle: "Idle", run: "Idle", attack: "Idle", cast: "Idle", hurt: "Idle", death: "Idle" },
} as ModelDoc;

/** a fresh unit-box .glb container the fake AssetManager 'loads' per champion. */
function makeContainer(): AssetContainer {
  const container = new AssetContainer(scene);
  const mesh = MeshBuilder.CreateBox("kaykit-body", { size: 1 }, scene);
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
  x: id, // spread them out; irrelevant to scale
  z: 0,
  fx: 1,
  fz: 0,
  alive: true,
});

const passthrough = (e: EntityViewState) => ({ x: e.x, z: e.z, fx: e.fx, fz: e.fz });

describe("stand-in size-override composition-root wiring (client-standin-override, task #150)", () => {
  it("ContentDb resolves every curated championId→override from _standin-overrides.json", async () => {
    cover("client-standin-override");
    const db = await loadContentDb();
    for (const [championId, rel] of Object.entries(EXPECTED)) {
      const ov = db.modelOverrideFor(championId);
      expect(ov, championId).not.toBeNull();
      expect(ov!.relativeScale, championId).toBe(rel);
      // the resolved override flows through the SAME multiplier the renderer uses
      expect(relativeScaleOf(ov), championId).toBe(rel);
    }
  });

  it("an UNLISTED champion resolves to null → the renderer defaults relativeScale to 1.0", async () => {
    cover("client-standin-override");
    const db = await loadContentDb();
    expect(db.modelOverrideFor("heroshana")).toBeNull(); // 夏娜 = the normal case
    expect(db.modelOverrideFor("does-not-exist")).toBeNull();
    // default 1.0 → the height-normalized target size, unchanged
    expect(relativeScaleOf(db.modelOverrideFor("heroshana"))).toBe(1);
  });

  it("a missing/404 overrides file leaves every champion at the normalized default", async () => {
    cover("client-standin-override");
    vi.stubGlobal("fetch", mockFetch(undefined)); // even the overrides file 404s
    const db = new ContentDb();
    await db.load();
    expect(db.modelOverrideFor("godie-n00b")).toBeNull();
    expect(relativeScaleOf(db.modelOverrideFor("godie-n00b"))).toBe(1);
  });

  it("end-to-end: the GameApp seam applies the override so listed champions render at their size, unlisted at 1.0", async () => {
    cover("client-standin-override");
    const db = await loadContentDb();

    // the GameApp.modelOverrideFor seam, verbatim: entity.seatId → championId →
    // ContentDb.modelOverrideFor. render/** never touches the seat table (client-08).
    const seatChampion = new Map<number, string>([
      [11, "godie-n00b"], // 小叮噹 → 0.65 (listed, small)
      [12, "godie-e00r"], // 初號機 → 1.55 (listed, giant)
      [13, "heroshana"], // 夏娜 → unlisted → default 1.0
    ]);
    const modelOverrideFor = (e: EntityViewState) => {
      const championId = seatChampion.get(e.seatId);
      return championId ? db.modelOverrideFor(championId) : null;
    };

    const assets = { load: () => Promise.resolve(makeContainer()) } as unknown as AssetManager;
    const registry = new EntityViewRegistry(scene, assets, {
      modelDocFor: () => BASE_DOC,
      modelOverrideFor,
    });

    registry.sync({
      entities: [champ(910, 11), champ(911, 12), champ(912, 13)],
      poseFor: passthrough,
      nowMs: 0,
      dtMs: 16,
    });
    // flush the async .glb adopt (assets.load → .then measures + scales)
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const small = registry.getChampionView(910)!.declaredScale!;
    const big = registry.getChampionView(911)!.declaredScale!;
    const normal = registry.getChampionView(912)!.declaredScale!;

    // unit-box native height 1 → normalized factor = TARGET_HEIGHT; the exceptions
    // multiply it, the unlisted champion stays exactly at it.
    expect(normal).toBeCloseTo(TARGET_HEIGHT, 5); // ~1.8u — unlisted default 1.0
    expect(small).toBeCloseTo(TARGET_HEIGHT * 0.65, 5); // 小叮噹 ~1.17u
    expect(big).toBeCloseTo(TARGET_HEIGHT * 1.55, 5); // 初號機 ~2.79u
    // and the deliberate exceptions really are smaller / bigger than the default
    expect(small).toBeLessThan(normal);
    expect(big).toBeGreaterThan(normal);
    registry.dispose();
  });
});

/**
 * TASK #77 — the map's declared SCALE must survive the stand-in fallback.
 *
 * 42 `godie-*` champions point at one of the four shared CC0 KayKit meshes.
 * Their WC3 Scaling Value ('usca', tools/w3x-import/out/GoDieEX22s-src/
 * OBJECTS.json) used to be dropped on the floor, so every one of them rendered
 * at the identical normalized 1.8u.
 *
 * GH#31 SPLIT THE ROSTER IN TWO, AND WITH IT THE CORRECT RULE.
 * 40 of the 42 now adopt their real Warcraft III model from the local overlay
 * (`BLIZZARD_MODEL_CHAMPIONS`), so 「整個輪廓就是身體」 — the premise that made
 * 「relativeScale = usca 逐字照抄」 right — no longer holds for them: their own
 * mesh may be twice a paladin's height before usca is applied, and
 * ChampionView normalizes THAT away. Their rule is the rawHeight-corrected one
 * #77 already had to hand-derive for the two VillagerKid champions:
 *   relativeScale = (rawHeight ÷ HeroPaladin 115.63) × usca.
 *
 * ⚠️ 2026-07-30 (#223) — THE usca-VERBATIM HALF IS NOW EMPTY, AND THE
 * MEMBERSHIP TEST HAD DRIFTED. This comment used to end 「The remaining 2
 * (godie-o02n, godie-u011) still render a shared mesh and keep the usca-verbatim
 * rule」, and the loop below decided membership with
 * `BLIZZARD_MODEL_CHAMPIONS.includes(id)`. That constant is a PROXY for 「adopts
 * its own WC3 model」, and #223's 缺省即繼承 clause in `defaultPrefersVoxelBody`
 * broke the proxy: a 變身 half now inherits its counterpart's model even though
 * it is not itself in the list. Measured on the shipped content, SIX ids sat on
 * the wrong side of that stale proxy — godie-e010 / h00w / n01b / o02n / o030 /
 * u011 — and one of them (godie-n01b) was actively held at the wrong number by
 * it: this test demanded usca-verbatim 1.00 for a champion that had already
 * started rendering Nman.glb, i.e. it was PINNING A BUG (a 22% height drop the
 * instant 地獄歌神 transformed).
 *
 * So the loop now asks the SHIPPED predicate, `defaultPrefersVoxelBody`, and the
 * usca-verbatim group is empty — every `godie-*` stand-in champion reaches a
 * real WC3 model today. An empty loop passes vacuously, which is failure mode
 * ③, so `USCA_VERBATIM_IS_EMPTY_BECAUSE` below asserts the emptiness ON PURPOSE
 * and names where those six ARE governed instead (they share one mesh with their
 * counterpart, so their rule is 「match the counterpart」 — the 26-pair size
 * census in render/views/formAwareModelResolve.test.ts).
 *
 * The guard below reads BOTH sides from disk — the source map's objects and the
 * shipped overrides file — so it fails if a champion's map scale is ever
 * silently discarded again. It is a data contract, not a fixture.
 */
const OBJECTS: { heroes?: Record<string, { scale?: number }>; units?: Record<string, { scale?: number }> } =
  JSON.parse(
    readFileSync(
      join(__dirname, "../../../../tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json"),
      "utf8",
    ),
  );

/** The four shared stand-in meshes — a champion on one of these has no model. */
const STOCK_KEYS = new Set([
  "champ.sela",
  "champ.thorne",
  "champ.skin.barbarian",
  "champ.skin.rogue",
]);

/** The map's usca for a `godie-XXXX` champion, or 1.0 (the WC3 default). */
function mapScaleOf(championId: string): number {
  const rawcode = championId.slice("godie-".length).toUpperCase();
  const all = { ...(OBJECTS.units ?? {}), ...(OBJECTS.heroes ?? {}) };
  for (const [code, def] of Object.entries(all)) {
    if (code.toUpperCase() === rawcode) return typeof def.scale === "number" ? def.scale : 1;
  }
  return 1;
}

/**
 * The two champions whose base WC3 model is a CHILD (units\critters\VillagerKid)
 * — usca alone would render them TALLER than an adult against our normalized
 * adult height, so they carry the measured base-model correction instead.
 * See the `note` on each entry in _standin-overrides.json.
 */
const CHILD_MODEL_CORRECTED = new Set(["godie-h021", "godie-hblm"]);

/**
 * Champions where #150 hand-authored a size from LORE that disagrees with the
 * map. The shipped lore value wins until the owner rules; the disagreement is
 * recorded in the file's `note` so it cannot rot silently.
 */
const LORE_OVERRIDES_MAP = new Set(["godie-h02k", "godie-ubal"]);

/**
 * godie-u011 「死亡老二 - 克勞薩先生」 — the map declares usca 1.5 on
 * `collision.mdl`, a geometry-LESS WC3 collision dummy. That is a spec for an
 * invisible unit, not a body: there is no height for 1.5 to scale, so the value
 * is deliberately NOT carried over. #77 moved the champion off the empty model
 * onto a stand-in that actually renders (see content/champions/godie-u011.json).
 */
const NO_BODY_TO_SCALE = new Set(["godie-u011"]);

/**
 * A #150 lore tune that lands within this fraction of the map's own value is
 * treated as AGREEING with the map, not as discarding it (小叮噹 0.65 vs 0.60,
 * 初號機 1.55 vs 1.60 — both authored from lore before the map value was
 * recovered, and both within 8%).
 */
const LORE_AGREEMENT_TOLERANCE = 0.1;

/**
 * GH#31 — the 18 entries #77/#150 authored for a champion that ALSO turned out
 * to have an extracted WC3 model. Every one of them was tuned against the
 * shared KayKit mesh, so against the champion's own model they are now too
 * small (小叮噹 renders 0.81u instead of 1.55u). The owner's instruction for
 * this pass was 「已經有的不要覆蓋」, so they are carried forward untouched and
 * listed here — this set is the visible debt, not a silent exemption. Every id
 * in it must still HAVE an entry; only the formula check is waived.
 */
const PRE31_STANDIN_TUNED = new Set([
  "godie-e00r", "godie-e00s", "godie-e00t", "godie-e00u", "godie-h021",
  "godie-h02k", "godie-hapm", "godie-hblm", "godie-n00b", "godie-o02o",
  "godie-obla", "godie-oshd", "godie-othr", "godie-u012", "godie-u01f",
  "godie-ubal", "godie-ucrl", "godie-umal",
]);

describe("stand-in fallback preserves the map's declared scale (task #77)", () => {
  // `usca`/`rawHeight` are the GH#31 derivation inputs, carried in the file
  // itself so the formula stays checkable without the git-ignored overlay.
  const overrides = (
    OVERRIDES_FILE as {
      overrides: Record<string, { relativeScale?: number; usca?: number; rawHeight?: number }>;
    }
  ).overrides;

  /** every stand-in champion, straight off the shipped champion docs. */
  const standIns = readdirSync(join(__dirname, "../../../../content/champions"))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map(
      (f) =>
        JSON.parse(
          readFileSync(join(__dirname, "../../../../content/champions", f), "utf8"),
        ) as { id: string; name: string; modelKey: string },
    )
    .filter((c) => STOCK_KEYS.has(c.modelKey) && c.id.startsWith("godie-"));

  it("finds the stand-in roster (guard against the fixture silently emptying)", () => {
    cover("client-standin-override");
    // GH#323 —— ⛔ 不釘 40（那是 2026-08-13 搬家前的族群大小）。這一條在守的是
    //    「夾具沒有默默變空」，⛔ 不是「共用替身有幾位」。
    expect(standIns.length, "共用替身名單是空的 —— 底下每一條都會空跑").toBeGreaterThan(0);
  });

  /**
   * 這六位是 2026-07-30 之前被那個過時的 proxy 分到 usca-verbatim 那一邊的。
   * 現在它們六個都穿得到真的 WC3 模型(經由對半繼承),所以規則變成
   * 「跟對半一樣大」—— 由 `render/views/formAwareModelResolve.test.ts` 的
   * 26 對尺寸普查守。列在這裡是為了讓「這一組空了」是一句**有內容**的話。
   */
  const NOW_MODEL_BODIED_VIA_COUNTERPART = [
    "godie-e010",
    "godie-h00w",
    "godie-n01b",
    "godie-o02n",
    "godie-o030",
    "godie-u011",
  ];

  it("usca-verbatim 這一組已經空了 —— 而且是空得有理由,不是迴圈壞掉", () => {
    cover("client-standin-override");
    // 前提:名單本身不是空的(否則下面兩條都變成廢話)
    // GH#323 —— ⛔ 不釘 40（那是 2026-08-13 搬家前的族群大小）。這一條在守的是
    //    「夾具沒有默默變空」，⛔ 不是「共用替身有幾位」。
    expect(standIns.length, "共用替身名單是空的 —— 底下每一條都會空跑").toBeGreaterThan(0);
    const stillVoxel = standIns.filter((c) => defaultPrefersVoxelBody(c.modelKey, c.id));
    expect(
      stillVoxel.map((c) => c.id),
      "又有 godie-* 掉回程序生成的體素身體了 —— 若是刻意的,把它的 usca-verbatim 規則一起寫回來",
    ).toEqual([]);
    // 而那六位「靠對半才穿到模型」的,一個都不能**默默**從名單上消失
    // GH#323 —— ⚠️ 2026-08-13 其中四位（h00w / n01b / o02n / u011）隨變身系統整理
    //    搬進 `content/_legacy/`。那是**刻意的退場**，不是這條規則壞掉 ⇒ 跳過，
    //    ⛔ 但不是從清單刪掉：留著才看得出「哪幾位還在、規則對它們還成立」。
    const retiredHere: string[] = [];
    for (const id of NOW_MODEL_BODIED_VIA_COUNTERPART) {
      const c = standIns.find((x) => x.id === id);
      if (c === undefined && !isShipped("champions", id)) {
        retiredHere.push(id);
        continue;
      }
      expect(c, `${id} 不再是 stand-in champion 了?（而且它還在出貨名單上）`).toBeTruthy();
      expect(
        defaultPrefersVoxelBody(c!.modelKey, id),
        `${id}: #223 的保底 (b) 沒了 —— 這具身體會掉回方塊人`,
      ).toBe(false);
      expect(BLIZZARD_MODEL_CHAMPIONS.includes(id), `${id} 是靠對半繼承的,不在 manifest 裡`).toBe(
        false,
      );
    }
    // ⛔ 六位不能同時退場 —— 那樣這條就變成空跑，而它是 #223 保底 (b) 的唯一守衛。
    expect(
      retiredHere.length,
      "這六位全部退場了 —— 這條測試已經不守任何東西，該刪或該換一組樣本",
    ).toBeLessThan(NOW_MODEL_BODIED_VIA_COUNTERPART.length);
  });

  it("every stand-in champion's map scale reaches the renderer", () => {
    cover("client-standin-override");
    const dropped: string[] = [];
    for (const c of standIns) {
      // GH#31 + #223: a champion that reaches ANY real WC3 model — its own, or
      // its 變身 counterpart's — is governed by the rawHeight-corrected rule
      // (next test) or by the counterpart-match rule (the 26-pair size census in
      // render/views/formAwareModelResolve.test.ts). Only a champion still
      // wearing the procedural voxel figure answers to usca-verbatim, and today
      // that is nobody — see the test directly above, which pins that on purpose.
      // ⚠️ Do NOT put `BLIZZARD_MODEL_CHAMPIONS.includes(c.id)` back here: that
      // proxy is what held godie-n01b at the wrong number.
      if (!defaultPrefersVoxelBody(c.modelKey, c.id)) continue;
      const declared = mapScaleOf(c.id);
      const rendered = relativeScaleOf(overrides[c.id] ?? null);
      if (
        CHILD_MODEL_CORRECTED.has(c.id) ||
        LORE_OVERRIDES_MAP.has(c.id) ||
        NO_BODY_TO_SCALE.has(c.id)
      ) {
        continue;
      }
      // a map scale of 1.0 needs no entry — the renderer's default IS 1.0
      if (Math.abs(rendered - declared) > LORE_AGREEMENT_TOLERANCE * declared) {
        dropped.push(`${c.id} ${c.name}: map ${declared.toFixed(2)} → rendered ${rendered}`);
      }
    }
    expect(dropped, `map scale discarded for:\n${dropped.join("\n")}`).toEqual([]);
  });

  /**
   * GH#31 — THE DEFECT THIS REPLACES. Before this pass, 22 of the 40 WC3-model
   * champions had NO entry at all, so `relativeScaleOf` handed the renderer 1.0
   * and every one of them was squashed to the same 1.8u silhouette: 伊利丹惡魔
   * 形態, 刺蛇, 北極熊 and 聖騎士 all exactly as tall as each other. Two
   * directions are asserted, because either one alone passes on a broken build:
   *   • COVERAGE — all 40 carry an entry (a dropped one silently reverts to 1.0);
   *   • DERIVATION — each #31 entry's number really is the formula applied to
   *     the map's OWN usca, so neither the multiplier nor the input can drift.
   */
  it("GH#31: every WC3-model champion carries the rawHeight-corrected scale", () => {
    cover("client-standin-override");
    const file = OVERRIDES_FILE as {
      heroPaladinRawHeight?: number;
      overrides: Record<string, { relativeScale?: number; usca?: number; rawHeight?: number }>;
    };
    const ref = file.heroPaladinRawHeight;
    expect(ref, "the reference height the formula divides by").toBeCloseTo(115.63, 2);

    const missing: string[] = [];
    const wrong: string[] = [];
    for (const id of BLIZZARD_MODEL_CHAMPIONS) {
      const ov = overrides[id];
      if (!ov || typeof ov.relativeScale !== "number") {
        missing.push(id);
        continue;
      }
      if (PRE31_STANDIN_TUNED.has(id)) continue; // carried forward, see the note
      // the derivation inputs must be present AND agree with the source map
      expect(ov.rawHeight, `${id} rawHeight`).toBeGreaterThan(0);
      expect(ov.usca, `${id} usca vs OBJECTS.json`).toBeCloseTo(mapScaleOf(id), 2);
      const expected = (ov.rawHeight! / ref!) * ov.usca!;
      if (Math.abs(ov.relativeScale - expected) > 0.002) {
        wrong.push(`${id}: shipped ${ov.relativeScale} vs formula ${expected.toFixed(3)}`);
      }
    }
    expect(missing, `no relativeScale → renders at the flat 1.8u: ${missing.join(", ")}`).toEqual([]);
    expect(wrong, `formula drift:\n${wrong.join("\n")}`).toEqual([]);

    // …and the population is genuinely SPREAD, which is the whole point. If a
    // future edit collapsed every multiplier back to 1.0 the two checks above
    // would still pass (1.0 is a legal formula result — HeroPaladin @ usca 1).
    const rels = BLIZZARD_MODEL_CHAMPIONS.map((id) => relativeScaleOf(overrides[id] ?? null));
    expect(rels.filter((r) => r !== 1).length, "champions rendering at a non-default size")
      .toBeGreaterThanOrEqual(38);
    expect(Math.min(...rels)).toBeLessThan(1);
    expect(Math.max(...rels)).toBeGreaterThan(3);
  });

  it("小叮噹 renders smaller than a default champion, and 黑化張飛 larger", () => {
    cover("client-standin-override");
    // the owner's own example: a 0.6-scale blue panda must not render at 1.0
    expect(relativeScaleOf(overrides["godie-n00b"] ?? null)).toBeLessThan(1);
    expect(mapScaleOf("godie-n00b")).toBeCloseTo(0.6, 2);
    // and the map's largest authored unit really is the biggest on screen
    expect(relativeScaleOf(overrides["godie-u01f"] ?? null)).toBe(2);
  });

  it("the two child-model champions render as children, not as tall adults", () => {
    cover("client-standin-override");
    for (const id of CHILD_MODEL_CORRECTED) {
      expect(mapScaleOf(id), id).toBeCloseTo(1.2, 2); // the map's raw usca > 1
      expect(relativeScaleOf(overrides[id] ?? null), id).toBeLessThan(1); // rendered small
    }
  });
});

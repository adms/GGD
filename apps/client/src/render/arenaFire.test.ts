/**
 * 場地環境火焰 (GH#251) —— 「owner 說全部場地都去掉」的守衛。
 *
 * owner 2026-08-01：「場地天空火焰很礙眼 請全部場地都去掉」。
 *
 * ⚠️ 這一支**不**斷言「設定值是 false」。那是第⑦號故障（掃屬性代替掃行為）：
 * 設定是 false 而 `dressArena` 照樣建火焰，是完全可能的 —— 事實上在這張單之前
 * 根本沒有設定，那一行是寫死的。所以每一條斷言讀的都是**跑完 dressArena 之後
 * 場景裡真的有幾個火焰粒子系統**（`scene.particleSystems`），而餵進去的是
 * **出貨的** `content/config/ambient-vfx.json` 與**出貨的**
 * `content/arenas/arena.skeleton.json`（預設場地，16 支火把）。
 *
 * ⚠️ 對 Babylon 物件只比字串與數字，不比物件本身：`expect(babylonObject)` 失敗
 * 時 vitest 會深度序列化材質 → 反向參照整個 scene → heap 爆掉 → worker 死掉 →
 * reporter 收到「0 條 failed」。（見 docs/_session-handover.md 第二節。）
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import type { ArenaDoc, ArenaFire, ConfigAmbientVfxDoc } from "@ggd/shared/content";
import {
  DEFAULT_ARENA_FIRE,
  decorModelBurns,
  resolveArenaFire,
  zConfigAmbientVfxDoc,
} from "@ggd/shared/content";
import { arenaDefFromDoc } from "@ggd/shared/sim/world/ArenaDef";
import type { ArenaDef } from "@ggd/shared/sim/world/ArenaDef";
import type { AssetManager } from "./AssetManager";
import { buildArena, dressArena, disposeArena } from "./ArenaScene";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(`${REPO}${rel}`, "utf8")) as T;
}

/** 出貨的 ambient-vfx 設定文件，**過它自己的 Zod** 再用。 */
function shippedConfig(): ConfigAmbientVfxDoc {
  const raw = readJson<unknown>("content/config/ambient-vfx.json");
  const parsed = zConfigAmbientVfxDoc.safeParse(raw);
  expect(parsed.success, "出貨的 content/config/ambient-vfx.json 不合 schema").toBe(true);
  return (parsed as { data: ConfigAmbientVfxDoc }).data;
}

/** 出貨的預設場地（`SKELETON_ARENA.id`；GameApp 沒有 mapId 時蓋的就是它）。 */
const SKELETON_DOC = readJson<ArenaDoc>("content/arenas/arena.skeleton.json");
const SKELETON_DEF: ArenaDef = arenaDefFromDoc(SKELETON_DOC);
/** 出貨文件裡真的有幾支火把 —— 從檔案數出來，不是抄一個常數。 */
const SHIPPED_TORCHES = SKELETON_DOC.decor.filter((d) => d.model.includes("torch")).length;

/** 一顆方塊代替 .glb，讓 dressArena 不用真的載模型就跑得起來。 */
function stubContainer(scene: Scene, name: string): AssetContainer {
  const container = new AssetContainer(scene);
  const box = MeshBuilder.CreateBox(name, { width: 0.55, height: 1.04, depth: 0.55 }, scene);
  box.position.y = 0.52;
  box.material = new StandardMaterial(`${name}-mat`, scene);
  scene.removeMesh(box);
  container.meshes.push(box);
  container.rootNodes.push(box);
  return container;
}

function stubAssets(scene: Scene): AssetManager {
  return {
    load: async (path: string) => stubContainer(scene, path.split("/").pop() ?? path),
  } as unknown as AssetManager;
}

/** 跑一次完整的「蓋場地 + 布景」，回傳場景裡真的存在的火焰粒子系統。 */
async function dressAndCollectFlames(
  scene: Scene,
  fire: ArenaFire,
): Promise<{ names: string[]; emitRates: number[]; maxSizes: number[]; dispose: () => void }> {
  const handles = buildArena(scene, SKELETON_DEF, SKELETON_DOC.groundStyle);
  await dressArena(scene, stubAssets(scene), SKELETON_DEF, SKELETON_DOC, handles, fire);
  const live = scene.particleSystems.filter((ps) => ps.name.startsWith("torch-flame"));
  return {
    names: live.map((ps) => ps.name),
    emitRates: live.map((ps) => ps.emitRate),
    maxSizes: live.map((ps) => ps.maxSize),
    dispose: () => disposeArena(scene, handles),
  };
}

describe("場地環境火焰：出貨值真的讓場上一團火都沒有 (GH#251)", () => {
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

  it("出貨的場地文件本來就擺了火把 —— 這條測不是在測一個空集合", () => {
    // 沒有這一條的話，下面「0 團火」在「skeleton 根本沒有火把」的世界裡也會過。
    expect(SHIPPED_TORCHES).toBe(16);
  });

  it("餵出貨設定跑完 dressArena：場景裡 0 個火焰粒子系統", async () => {
    const fire = resolveArenaFire(shippedConfig());
    const got = await dressAndCollectFlames(scene, fire);
    expect(got.names).toEqual([]);
    got.dispose();
  });

  it("把開關打開就會有 16 團 —— 上一條不是因為程式碼被刪掉才綠的", async () => {
    const fire = { ...resolveArenaFire(shippedConfig()), enabled: true };
    const got = await dressAndCollectFlames(scene, fire);
    expect(got.names).toHaveLength(SHIPPED_TORCHES);
    got.dispose();
  });

  it("設定不見（舊部署／內容掛掉）時的回退值也是關的", async () => {
    const noBlock: ConfigAmbientVfxDoc = { id: "ambient-vfx", schema: "config.ambient-vfx@1", bindings: {} };
    expect(resolveArenaFire(noBlock).enabled).toBe(false);
    expect(resolveArenaFire(null).enabled).toBe(false);
    const got = await dressAndCollectFlames(scene, resolveArenaFire(null));
    expect(got.names).toEqual([]);
    got.dispose();
  });

  it("dressArena 的參數省略時也是關的 —— 忘了接線的結果是沒有火，不是有火", async () => {
    const handles = buildArena(scene, SKELETON_DEF, SKELETON_DOC.groundStyle);
    await dressArena(scene, stubAssets(scene), SKELETON_DEF, SKELETON_DOC, handles);
    expect(scene.particleSystems.filter((ps) => ps.name.startsWith("torch-flame"))).toHaveLength(0);
    disposeArena(scene, handles);
  });
});

describe("場地環境火焰：三個數值真的走到粒子系統上", () => {
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

  it("「一張場地最多幾團火」是真的上限，不是一個沒人讀的數字", async () => {
    const got = await dressAndCollectFlames(scene, {
      ...DEFAULT_ARENA_FIRE,
      enabled: true,
      maxEmitters: 4,
    });
    expect(got.names).toHaveLength(4);
    got.dispose();
  });

  it("emitRate / sizeScale 從設定讀回粒子系統本身", async () => {
    const got = await dressAndCollectFlames(scene, {
      ...DEFAULT_ARENA_FIRE,
      enabled: true,
      maxEmitters: 2,
      emitRate: 7,
      sizeScale: 2,
    });
    expect(got.emitRates).toEqual([7, 7]);
    // 出貨的 maxSize 是 0.6；×2 = 1.2。讀的是 ParticleSystem 上的值，不是設定值。
    expect(got.maxSizes.map((v) => Number(v.toFixed(4)))).toEqual([1.2, 1.2]);
    got.dispose();
  });

  it("`models` 空清單＝沒有東西冒火（開關開著也一樣）", async () => {
    const got = await dressAndCollectFlames(scene, {
      ...DEFAULT_ARENA_FIRE,
      enabled: true,
      models: [],
    });
    expect(got.names).toEqual([]);
    got.dispose();
  });
});

/**
 * 接線層：後台改了這一格，場上真的讀得到嗎（第②號故障）。
 *
 * ⚠️ **誠實聲明：這一段是原始碼掃描，不是行為。** `GameApp` 在測試裡建構不起來
 * （Babylon engine / canvas / socket），所以「它有沒有把政策傳下去」沒有辦法用
 * 行為證明。掃描擋得住的只有「忘了接線」這一種 —— 而那一種真的發生過。
 * 上面那一條「省略參數＝關」則保證了忘記接線時的結果是安全的那一邊。
 */
describe("場地環境火焰：後台 → 場景的接線", () => {
  const src = readFileSync(`${REPO}apps/client/src/GameApp.ts`, "utf8");
  // 註解裡什麼字都有，先剝掉，別讓散文滿足檢查。
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("GameApp 呼叫 dressArena 時真的把 contentDb.arenaFire() 傳下去", () => {
    expect(code).toContain("this.contentDb.arenaFire()");
    const dressAt = code.indexOf("dressArena(");
    expect(dressAt).toBeGreaterThan(0);
    // 同一個呼叫括號裡面，不是檔案裡隨便一個地方。
    const call = code.slice(dressAt, code.indexOf(")", code.indexOf("arenaFire()")) + 1);
    expect(call).toContain("this.arenaHandles");
    expect(call).toContain("this.contentDb.arenaFire()");
  });

  it("ContentDb 真的把 arenaFire 這條縫接出來", () => {
    const db = readFileSync(`${REPO}apps/client/src/content/ContentDb.ts`, "utf8");
    expect(db).toContain("resolveArenaFire(this.ambientVfx)");
  });
});

describe("場地環境火焰：出貨值 / 保險絲 / schema 界線", () => {
  it("content/config/ambient-vfx.json 的 arenaFire 和 DEFAULT_ARENA_FIRE 一格一格對得起來", () => {
    const shipped = shippedConfig().arenaFire;
    expect(shipped).toBeDefined();
    expect(shipped!.enabled).toBe(DEFAULT_ARENA_FIRE.enabled);
    expect(shipped!.models).toEqual(DEFAULT_ARENA_FIRE.models);
    expect(shipped!.maxEmitters).toBe(DEFAULT_ARENA_FIRE.maxEmitters);
    expect(shipped!.emitRate).toBe(DEFAULT_ARENA_FIRE.emitRate);
    expect(shipped!.sizeScale).toBe(DEFAULT_ARENA_FIRE.sizeScale);
    // owner 明說要拿掉 —— 出貨值就是這條裁決本身。
    expect(shipped!.enabled).toBe(false);
  });

  it("每一格都有上界，不是只有下界 (#277)", () => {
    const base = shippedConfig();
    const bad = (arenaFire: Record<string, unknown>): boolean =>
      zConfigAmbientVfxDoc.safeParse({ ...base, arenaFire }).success;
    expect(bad({ ...DEFAULT_ARENA_FIRE, maxEmitters: 65 })).toBe(false);
    expect(bad({ ...DEFAULT_ARENA_FIRE, maxEmitters: -1 })).toBe(false);
    expect(bad({ ...DEFAULT_ARENA_FIRE, maxEmitters: 1.5 })).toBe(false);
    expect(bad({ ...DEFAULT_ARENA_FIRE, emitRate: 201 })).toBe(false);
    expect(bad({ ...DEFAULT_ARENA_FIRE, emitRate: -1 })).toBe(false);
    expect(bad({ ...DEFAULT_ARENA_FIRE, sizeScale: 4.1 })).toBe(false);
    expect(bad({ ...DEFAULT_ARENA_FIRE, sizeScale: 0 })).toBe(false);
    expect(bad({ ...DEFAULT_ARENA_FIRE, models: Array(9).fill("torch") })).toBe(false);
    // 對照組：出貨值本身當然要過。
    expect(bad({ ...DEFAULT_ARENA_FIRE })).toBe(true);
  });

  it("decorModelBurns 是子字串比對，而且總開關永遠贏", () => {
    const on: ArenaFire = { ...DEFAULT_ARENA_FIRE, enabled: true };
    expect(decorModelBurns(on, "assets/models/props/torch.glb")).toBe(true);
    expect(decorModelBurns(on, "assets/models/props/torch_mounted.glb")).toBe(true);
    expect(decorModelBurns(on, "assets/models/props/pillar.glb")).toBe(false);
    expect(decorModelBurns(DEFAULT_ARENA_FIRE, "assets/models/props/torch.glb")).toBe(false);
  });
});

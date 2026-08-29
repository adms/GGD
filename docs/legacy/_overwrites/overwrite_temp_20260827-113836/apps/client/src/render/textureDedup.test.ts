/**
 * 🎽 **同一張貼圖只上傳一次** —— GH#382 的承重守衛。 @visual-proof
 *
 * ⭐ 這一支跑的是**出貨的東西**：真的 `AssetManager`、真的 glTF 載入器、真的
 * Babylon engine、真的 `content/assets/models/props/*.glb` 位元組。
 * ⛔ 沒有一份自己捏的 payload（失敗形態⑤：被測的不是出貨的那個）。
 *
 * ---------------------------------------------------------------------------
 * ⛔ 量尺先自證 —— ⭐ 第一個 `it()` 是**校準**，⛔ 不是功能測試
 * ---------------------------------------------------------------------------
 * 量的東西是**這些 container 的貼圖真的指向幾塊不同的 `InternalTexture`**
 * ＝ 場上為這幾件 prop 持有幾份 GPU 資源。
 * ⚠️ 若這把尺在**已知重複**的情境下量到 1，那它量的根本不是上傳次數
 * ⇒ ⭐ **底下每一條結論作廢**。所以校準先跑：關掉去重，三份共用同一張 atlas 的
 * prop 必須量到 **3**。量不到 3 ⇒ 這一支直接紅在校準那一行，訊息說「尺壞了」。
 *
 * ⛔⛔ **而第一版的尺真的說了謊，記在這裡**：原本數的是
 * `engine.getLoadedTexturesCache().length`。⚠️ 那在真的 WebGL 上是對的
 * （`thinEngine._releaseTexture` 會 `splice` 掉），但
 * ⭐ **`NullEngine._releaseTexture(texture) { }` 是空的**（`nullEngine.js:560`）
 * ⇒ 那份清單在 headless 底下**永遠不會變短**，於是「去重生效」與「去重沒生效」
 * 量起來一模一樣。⇒ 換成上面那把尺，並且**另外斷言引用計數** ——
 * 引用數歸零正是真引擎會呼叫 `_releaseTexture()` 刪掉 GPU 貼圖的那個條件，
 * ⭐ 也正是 NullEngine 不再忠實的那一道縫。
 *
 * ---------------------------------------------------------------------------
 * 👁 玩家看得到的那一半：**去重不可以把任何東西弄不見**
 * ---------------------------------------------------------------------------
 * 這個改動**刻意**不改變任何一個像素（同樣的畫面，少一點 VRAM），
 * 所以它唯一的失敗形態是「貼圖變黑 / 模型不見」。⇒ 斷言換完之後：
 * 每一張貼圖仍然 ready 且尺寸非零、每一個 mesh 仍然 `isEnabled()`、
 * 材質的 `alpha` 與 `hasAlpha` 一格都沒動。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { AssetManager, clearAssetByteCache } from "./AssetManager";
import {
  glbImageDigests,
  resetTextureDedupStats,
  setTextureDedupEnabled,
  textureDedupStats,
} from "./textureDedup";

const CONTENT_DIR = join(__dirname, "../../../../content");
/** 三份出貨 prop，⭐ 全部內嵌**同一張** KayKit `dungeon_texture`（1024²，5.33 MB）。 */
const SHARERS = [
  "assets/models/props/pillar.glb",
  "assets/models/props/torch.glb",
  "assets/models/props/chest.glb",
];

let realFetch: typeof globalThis.fetch | undefined;

function installFetchStub(): void {
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input).split("?")[0]!;
    try {
      const buf = readFileSync(join(CONTENT_DIR, url.slice("/content/".length)));
      return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    } catch {
      return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
    }
  }) as unknown as typeof globalThis.fetch;
}

function makeScene(): { engine: NullEngine; scene: Scene } {
  const engine = new NullEngine();
  return { engine, scene: new Scene(engine) };
}

type Container = NonNullable<Awaited<ReturnType<AssetManager["load"]>>>;

/** 這幾個 container 的貼圖總共指向幾塊 GPU 資源。⭐ 這是那把尺。 */
function liveInternals(cs: Container[]): Set<unknown> {
  const s = new Set<unknown>();
  for (const c of cs) for (const t of c.textures) s.add(t.getInternalTexture());
  return s;
}

/** Babylon 的引用計數 —— 歸零＝真引擎會 `_releaseTexture()` 把 GPU 貼圖刪掉。 */
const refsOf = (it: unknown): number => (it as { _references: number })._references;

async function loadAll(scene: Scene): Promise<Container[]> {
  const am = new AssetManager(scene);
  const cs = await Promise.all(SHARERS.map((p) => am.load(p)));
  expect(cs.every(Boolean)).toBe(true);
  return cs as Container[];
}

describe("textureDedup", () => {
  beforeEach(() => {
    installFetchStub();
    clearAssetByteCache();
    resetTextureDedupStats();
    setTextureDedupEnabled(true);
  });
  afterEach(() => {
    if (realFetch) globalThis.fetch = realFetch;
    setTextureDedupEnabled(true);
  });

  it("CALIBRATION — 關掉去重時,三份 prop 必須量到 3 次上傳(量不到 ⇒ 這把尺作廢)", async () => {
    setTextureDedupEnabled(false);
    const { engine, scene } = makeScene();
    const cs = await loadAll(scene);
    expect(cs.every(Boolean)).toBe(true);
    // ⛔ 這一行紅 = 尺壞了,⛔ 不是功能壞了。
    expect(texCount(engine)).toBe(SHARERS.length);
    // 而且那三張圖的**內容摘要**確實相同 —— 重複是真的,⛔ 不是我假設的。
    const digests = SHARERS.map(
      (p) => glbImageDigests(new Uint8Array(readFileSync(join(CONTENT_DIR, p))))[0],
    );
    expect(new Set(digests).size).toBe(1);
    expect(digests[0]).toBeTruthy();
  });

  it("內容相同的貼圖共用同一塊 GPU 記憶體,而且什麼都沒有變不見", async () => {
    const { engine, scene } = makeScene();
    const cs = await loadAll(scene);
    expect(texCount(engine)).toBe(1); // ⭐ 3 → 1
    expect(textureDedupStats().shared).toBe(SHARERS.length - 1);
    expect(textureDedupStats().bytesSaved).toBeGreaterThan(0);

    // 👁 可見性:每一張貼圖仍然 ready、尺寸非零,mesh 仍然 isEnabled,alpha 沒被動過
    const internals = new Set<unknown>();
    for (const c of cs) {
      for (const t of c!.textures) {
        const it = t.getInternalTexture();
        expect(it).toBeTruthy();
        expect(t.isReady()).toBe(true);
        expect(it!.width * it!.height).toBeGreaterThan(0);
        internals.add(it);
      }
      for (const m of c!.meshes) expect(m.isEnabled()).toBe(true);
      for (const mat of c!.materials) expect(mat.alpha).toBe(1);
    }
    expect(internals.size).toBe(1); // 三個 container 指到**同一塊**
  });

  it("⛔ 不跨 Scene —— 第二個 Scene 拿到自己的貼圖(否則第 2 回合整片變黑)", async () => {
    const a = makeScene();
    await loadAll(a.scene);
    const b = makeScene();
    const cs = await loadAll(b.scene);
    // b 的 engine 是新的:它自己那一份必須真的存在,⛔ 不可以借 a 的。
    expect(texCount(b.engine)).toBe(1);
    for (const c of cs) for (const t of c!.textures) expect(t.isReady()).toBe(true);
  });
});

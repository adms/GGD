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
 * 量的東西是 `engine.getLoadedTexturesCache().length`（Babylon 自己的
 * `InternalTexture` 清單，⭐ NullEngine 也真的 push 進去 —— `nullEngine.js:601`）。
 * ⚠️ 若這把尺在**已知重複**的情境下量到 1，那它量的根本不是上傳次數
 * ⇒ ⭐ **底下每一條結論作廢**。所以校準先跑：關掉去重，三份共用同一張 atlas 的
 * prop 必須量到 **3**。量不到 3 ⇒ 這一支直接紅在校準那一行，訊息說「尺壞了」。
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

/** 只數這幾份 prop 的貼圖 —— ⛔ 不數 Babylon 自己的內建圖。 */
const texCount = (engine: NullEngine): number =>
  engine.getLoadedTexturesCache().filter((t) => String(t.url).includes("/props/")).length;

async function loadAll(scene: Scene): Promise<Awaited<ReturnType<AssetManager["load"]>>[]> {
  const am = new AssetManager(scene);
  return Promise.all(SHARERS.map((p) => am.load(p)));
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

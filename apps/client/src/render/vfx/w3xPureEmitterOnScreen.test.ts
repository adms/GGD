/**
 * GH#98 生存守衛 — 「那 11 個零幾何的特效模型，真的會噴出粒子嗎？」
 *
 * #98 的原文說「mdx 的粒子發射器從來沒轉出來」。那是錯的：MDX 的 PRE2 本來就
 * 不是幾何，glTF 也沒有粒子系統，所以那些 glb 是空的是**正確行為**，不是缺陷。
 * 真正從來沒有人證明過的是另一件事 —— 那些發射器參數已經以 `content/vfx/`
 * doc 出貨，而且**送進真的引擎會真的生出粒子**。
 *
 * ⚠️ 這個檔案存在的直接原因（2026-07-30 實測）。把 `W3xEmitterRig.startEmitter`
 * 整個掏空 —— 不呼叫 `ps.start()`、不呼叫 `burstNow()`，也就是「發射器全部建好、
 * 定好位、參數都對，但一顆粒子都生不出來」—— 之後 `W3xEmitterRig.test.ts` 的
 * **26 條測試全部照樣綠燈**。那是七種故障的第③種（可以從渲染樹刪掉但測試還是
 * 全綠）：既有測試斷言的是 `systemCount` / `emitRate` / `plan.*` 這些**屬性**，
 * 而引擎被掏空之後這些屬性一個都沒變。
 *
 * 所以這裡只問一件事：**同時活著的粒子數 > 0**，而且是拿磁碟上真的出貨 doc
 * （不是測試自己手寫的 —— 那是第⑤種故障：被測的不是出貨的那個）餵給真的
 * `W3xEmitterRig` + 真的 `toParticleSystem` 跑出來的。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 為什麼用 `animate(true)`（preWarm）推進，而不是 `animate()` 或 `scene.render()`
 * ─────────────────────────────────────────────────────────────────────────
 * 因為在 NullEngine 上**那兩條路一顆粒子都生不出來，不管引擎有沒有壞**。
 * `ParticleSystem.animate()` 的非 preWarm 分支先過 `isReady()`，而 isReady 要
 * 編出真的 GL shader；NullEngine 沒有 GL，所以它**永遠是 false**。實測（2026-07-30，
 * 每格 60 幀，`fx.w3x.particle.enchant.p00`）：
 *
 *     started=true  animate()        → peak 0    isReady=false
 *     started=true  scene.render()   → peak 0    isReady=false
 *     started=true  animate(true)    → peak 32
 *     started=false animate(true)    → peak 0
 *
 * 補了 1×1 RawTexture 也一樣（isReady 仍 false）。也就是說用 `animate()` 寫這個
 * 檔案會得到一個**恆綠的空殼**：它在壞掉的引擎上讀到 0，在好的引擎上也讀到 0。
 *
 * preWarm 分支跑的是同一套發射邏輯（`_update` / `manualEmitCount` / `emitRate`），
 * 只是用固定步長取代 animation ratio，並跳過 GL 就緒檢查。關鍵是它**照樣尊重
 * `_started`**（上表第 4 列）與 `manualEmitCount`（burst 那條測試量到 300 vs 0），
 * 所以它對「引擎沒有 start / 沒有 burst」是有鑑別力的 —— 這正是要守的東西。
 * `驅動器本身有鑑別力` 那條測試把這個前提釘死：哪天 Babylon 改了 preWarm 的
 * 語意，先紅的會是它，而不是整個檔案默默變成永遠會過。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { VfxDoc } from "@ggd/shared/content";
import { zVfxDoc } from "@ggd/shared/content";
import { W3xEmitterRig, atPosition, type W3xEffectSpec } from "./W3xEmitterRig";

const contentPath = (rel: string): string =>
  fileURLToPath(new URL(`../../../../../content/${rel}`, import.meta.url));

/**
 * GH#98 點名的 11 個模型裡，真的是特效的那 10 個。
 *
 * 第 11 個 `collision.mdx` 蓄意不在這裡：它 0 geoset、0 PRE2、0 RIBB，只有
 * BONE+ATCH+CLID，是一個 WC3 碰撞代理 —— 本來就不該在畫面上有東西。把它列進來
 * 只會逼出一條假失敗，然後有人為了讓它變綠而把整條斷言放寬。
 *
 * 每個字串是 `content/vfx/fx.w3x.<family>.<stem>.pNN.json` 裡的 `<stem>`。
 */
const PURE_EMITTER_STEMS = [
  "babyface",
  "blackhole",
  "boomnl",
  "darkbreathdamage",
  "demonfilth",
  "divinering",
  "enchant",
  "heronarutos4effect",
  "lasercannonfinalred",
  "lavabreathdamage",
] as const;

/** `fx.w3x.*` 的三個家族前綴（#183 從真的發射器資料集抽出來的就是這三種）。 */
const FAMILIES = ["particle", "orb", "locust"] as const;

/**
 * 從磁碟讀某個 stem 的所有出貨 doc，並用**出貨的 Zod schema** 驗過。
 *
 * 讀磁碟而不是 import 一份常數，是為了讓「有人把 content/vfx 的來源刪掉」直接
 * 變成紅燈 —— 這是本檔案的來源突變點。
 */
function shippedDocsFor(stem: string): VfxDoc[] {
  const out: VfxDoc[] = [];
  for (const family of FAMILIES) {
    for (let i = 0; i < 32; i++) {
      const id = `fx.w3x.${family}.${stem}.p${String(i).padStart(2, "0")}`;
      const file = contentPath(`vfx/${id}.json`);
      if (!existsSync(file)) continue;
      out.push(zVfxDoc.parse(JSON.parse(readFileSync(file, "utf8"))));
    }
  }
  return out;
}

let engine: NullEngine;
let scene: Scene;
let rig: W3xEmitterRig;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  // createTexture: () => null —— Node 裡不解圖片。貼圖路徑本身另外由 doc 層驗。
  rig = new W3xEmitterRig(scene, { createTexture: () => null });
});
afterEach(() => {
  rig.dispose();
  scene.dispose();
  engine.dispose();
});

/**
 * 推進 `frames` 幀，回傳期間**同時活著的粒子數峰值**。
 * 驅動方式與理由見檔頭。`rig.tick()` 一起跑，KP2E 速率軌與時限才會真的動。
 */
function peakLiveParticles(systems: readonly ParticleSystem[], frames: number): number {
  let peak = 0;
  for (let f = 0; f < frames; f++) {
    rig.tick(1000 / 60);
    for (const m of scene.meshes) m.computeWorldMatrix(true);
    for (const ps of systems) {
      // 1 = 一幀。Babylon 的每幀時間步長是 `updateSpeed`（預設 0.01），preWarm
      // 分支再乘上 preWarmStepOffset；出貨時乘的是 animation ratio，60fps 下 ≈1。
      // 所以 1 才是忠實的一幀，填 1/60 會把步長再縮 60 倍、什麼都生不出來。
      ps.preWarmStepOffset = 1;
      (ps as unknown as { animate: (preWarmOnly: boolean) => void }).animate(true);
      peak = Math.max(peak, ps.getActiveCount());
    }
  }
  return peak;
}

/** 這一次 play() 新掛上場景的粒子系統（用場景快照差取得）。 */
function systemsAddedBy(fn: () => void): ParticleSystem[] {
  const before = new Set(scene.particleSystems);
  fn();
  return scene.particleSystems.filter((ps) => !before.has(ps)) as ParticleSystem[];
}

describe("GH#98：10 個純發射器模型的特效真的會噴粒子 (w3x-emitter-runtime)", () => {
  it.each(PURE_EMITTER_STEMS)("%s：出貨 doc 送進真引擎後，活著的粒子數 > 0", (stem) => {
    cover("w3x-emitter-runtime");
    const docs = shippedDocsFor(stem);
    // 來源突變點：content/vfx 的 fx.w3x.*.<stem>.* 被刪掉 → 這裡就紅。
    expect(docs.length, `content/vfx 裡找不到 ${stem} 的任何 fx.w3x doc`).toBeGreaterThan(0);

    const spec: W3xEffectSpec = { id: `gh98-${stem}`, emitters: docs.map((doc) => ({ doc })) };
    const systems = systemsAddedBy(() => {
      rig.play(spec, atPosition(4, 1.5, -3));
    });
    expect(systems.length, `${stem}：play() 一個粒子系統都沒建`).toBeGreaterThan(0);

    const peak = peakLiveParticles(systems, 90);
    expect(
      peak,
      `${stem}：${docs.length} 份出貨 doc 建了 ${systems.length} 個粒子系統，` +
        "但整整 90 幀沒有任何一顆粒子活著 —— 玩家會看到一片空白",
    ).toBeGreaterThan(0);
  });

  it("粒子生在效果被錨定的地方，不是世界原點（#131 的形狀）", () => {
    cover("w3x-emitter-runtime");
    // divinering 是 20 個發射器排成的環，彼此只差在 pivot —— 位置錯了就不是環。
    const docs = shippedDocsFor("divinering");
    expect(docs.length).toBeGreaterThan(0);

    const champion = new TransformNode("7-root", scene);
    champion.position.set(12, 0, 9);
    const systems = systemsAddedBy(() => {
      rig.play(
        { id: "gh98-anchored", emitters: docs.map((doc) => ({ doc })) },
        { kind: "node", root: champion },
      );
    });
    peakLiveParticles(systems, 60);

    const alive = systems.flatMap((ps) => ps.particles.slice(0, ps.getActiveCount()));
    expect(alive.length, "錨定在角色身上時一顆粒子都沒有").toBeGreaterThan(0);
    // 每一顆都該落在角色附近而不是 (0,0,0)：#131 就是整團被丟回世界原點。
    const strayed = alive.filter((p) => Math.hypot(p.position.x - 12, p.position.z - 9) > 6);
    expect(
      strayed.length,
      `${strayed.length}/${alive.length} 顆粒子離錨點超過 6 單位 —— 特效沒有跟著角色走`,
    ).toBe(0);
  });

  it("burst doc 真的爆得出來（burstNow 分支）", () => {
    cover("w3x-emitter-runtime");
    // 那 10 個模型全是 continuous，所以 burst 分支得用另一份真出貨 doc 來守。
    const file = contentPath("vfx/godie-blackhole1-p2.json");
    expect(existsSync(file), "godie-blackhole1-p2.json 不在了，換一份真的 burst doc").toBe(true);
    const doc = zVfxDoc.parse(JSON.parse(readFileSync(file, "utf8")));
    expect(doc.mode, "這條測試需要一份 burst doc").toBe("burst");

    const systems = systemsAddedBy(() => {
      rig.play({ id: "gh98-burst", emitters: [{ doc }] }, atPosition(0, 1, 0));
    });
    // burst 是 play() 當下就送出去的，前幾幀就該看得到。
    expect(peakLiveParticles(systems, 3), "burst doc 播下去一顆粒子都沒有").toBeGreaterThan(0);
  });

  it("驅動器本身有鑑別力：沒被 start() 的系統一顆都不生", () => {
    cover("w3x-emitter-runtime");
    // 這條不是在測產品，是在守「上面那些斷言的量測方法有效」。若 preWarm 這條
    // 路對 `_started` 不敏感，上面每一條都會變成恆真的空殼 —— 那就是把
    // startEmitter 掏空後 26 條測試全綠的那個坑，只是換了一個地方復發。
    const docs = shippedDocsFor("enchant");
    const systems = systemsAddedBy(() => {
      rig.play({ id: "gh98-driver", emitters: docs.map((doc) => ({ doc })) }, atPosition(0, 1, 0));
    });
    expect(peakLiveParticles(systems, 30), "正常播放時該生得出粒子").toBeGreaterThan(0);

    // 同樣的系統，停掉之後重置：再怎麼推也不該有粒子。
    for (const ps of systems) {
      ps.stop();
      ps.reset();
    }
    expect(
      peakLiveParticles(systems, 30),
      "停掉的系統還在生粒子 —— 這個驅動器分不出引擎有沒有真的啟動，" +
        "整個檔案的斷言都不算數",
    ).toBe(0);
  });
});

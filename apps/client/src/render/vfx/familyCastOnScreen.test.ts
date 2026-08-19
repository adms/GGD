/**
 * #230 · 三個家族真的畫在畫面上了嗎 —— **行為守衛，不是普查**。
 *
 * ===========================================================================
 * 為什麼要有這一條（先講它取代了什麼）
 * ===========================================================================
 * `familyArtCoverage.test.ts` 已經在數「258 列 / 19 個家族 / 出貨的 `fx.fam.*`
 * 文件集合和解析器要的完全一樣」。那些全部是**屬性**（第⑦號故障）：一個
 * `vfxKey` 字串長什麼樣、`content/vfx/` 有沒有那個檔，跟**引擎手上有沒有一個
 * 真的在噴粒子的 `ParticleSystem`、它擺在哪個世界座標**，是兩件事。
 * `w3xPureEmitterOnScreen.test.ts`（GH#98）證的是 `fx.w3x.*` 的**裸 rig**，
 * 家族這條路 —— 也就是 258 支技能裡的全部 —— **從來沒有人證過**。
 *
 * 這正是 #230 一直沒收斂的根因：所有既有守衛都可以在「特效整個沒畫出來」的
 * 情況下維持全綠。
 *
 * ===========================================================================
 * 這裡量的四件事，全部讀最終物件
 * ===========================================================================
 *   1. 每一個家族都真的在 `scene.particleSystems` 裡多出東西（不是「函式回傳了
 *      一個 key」）。
 *   2. 那些 system **真的生得出粒子** —— 用 `w3xPureEmitterOnScreen.test.ts`
 *      量出來的 `animate(true)` preWarm 驅動法（NullEngine 沒有 GL，`isReady()`
 *      永遠 false，所以 `animate()` / `scene.render()` 在**好的引擎上也讀到 0**，
 *      寫了等於恆綠空殼）。下面有一條「驅動器本身有鑑別力」把這個前提釘死。
 *   3. 粒子擺在**施法者身上**，不是地圖原點 —— #131 那個「卡在畫面角落的白光」
 *      就是這個形狀的故障。
 *   4. 高度 == `familyCastHeightY()` **宣稱**的高度，而且在地板之上、天花板之下。
 *      這一條是把第②號故障（算得出來但沒送到播放端）變成**結構上不可能**：
 *      `resolveFamilyArt()` 算出來的 `heightY` 今天就是在 `familyRow()` 那一行
 *      蒸發的（後台 `DEAD_FAMILY_KNOBS` 白紙黑字列著）。接上去的那一天，改的是
 *      `familyCastHeightY` 一個函式，而這條測試會逼他證明那個值**真的到得了
 *      Babylon**，而不是又在某個介面上蒸發一次。
 *
 * ⚠️ 內容一律讀**出貨的那一份**（`content/config/vfx-families.json` +
 * `content/abilities/*.json` 過真的 `zAbilityDoc`）。測試自己手寫一份長得像出貨
 * 的物件是第⑤號故障。
 *
 * ===========================================================================
 * 突變驗證（2026-07-30，每一條都真的跑過）
 * ===========================================================================
 *   · `VfxSystem.playCastVfx` 在解出 `art` 之後直接 `return`（＝把家族這一層從
 *     渲染樹整個拿掉）→ 19 個家族全部 0 個 system，本檔 **3 條紅**。
 *     ⚠️ 這正是 `...voicePlayOptions(mix)` 那個教訓：同樣的掏空，
 *     `familyArtCoverage.test.ts` 的 12 條全部照樣綠。
 *   · `W3xEmitterRig.startEmitter` 不呼叫 `ps.start()` / `burstNow()`
 *     （＝發射器都建好、參數都對，一顆粒子都不生）→「真的生得出粒子」紅。
 *   · `familyCastHeightY` 改成 `return 2.5`，但把 `playCastVfx` 的 rig 呼叫改回
 *     字面值 `1.0`（＝宣稱一套、送出另一套，就是第②號故障本身）→「高度 ==
 *     宣稱值」紅。兩邊一起改成 2.5 則綠 —— 這就是接縫該有的行為。
 *   · `abilityCast` 的 `pos`（`VfxSystem.ts:1042` 的 `this.ctx.entityPos(caster)`）
 *     釘成原點 → 「跟著施法者走」紅：「施法者移動 (9,7)，粒子只移動 (0,0)」。
 *
 * ⚠️ 這一行本來寫的是「`posFromEvent` 改成永遠回 `{x:0,z:0}` → 紅」——
 * **那是假的，實測全綠**（駁斥者 2026-07-30 抓到）。`abilityCast` 走
 * `ctx.entityPos(caster)`，**根本不經過 `posFromEvent`**（`:889`）。
 * 留著那句話會讓下一個人以為這條斷言的守備範圍比實際大。
 * 同一個檔頭的第一版斷言也是壞的：「emitter 離施法者 ≤12 單位」對
 * 「位置永遠是原點」照樣會過（原點離 (3,-4) 只有 5）—— 第④號故障。
 * 現在的寫法是 **A/B 位移**：同一支技能在兩個位置各施一次，
 * emitter 必須剛好移動 (Δx,Δz)，這樣才對壞掉的實作有鑑別力。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "./shippedAbilityArt.testkit";
import { isShipped } from "../../testkit/contentFixtures";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// The quality controller reads browser globals; pin density so the budget maths
// is the shipped one and not whatever a headless default happens to be.
vi.mock("../QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import { VfxDefs, type VfxDoc } from "@ggd/shared/content";
import { zConfigVfxFamiliesDoc } from "@ggd/shared/content/schema/vfx";
import { zAbilityDoc } from "@ggd/shared/content/schema/ability";
import { setFamilyTuning, w3xArtFor } from "./w3xAbilityArt";
import { w3xFamilyArtRows } from "./w3xFamilyArt";
import { familyCastHeightY } from "./familyCastHeight";
import { VfxSystem, type VfxContext } from "../../vfx/VfxSystem";

const root = (p: string): string => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));
const readJson = (p: string): unknown => JSON.parse(readFileSync(root(p), "utf8")) as unknown;

/** 出貨的家族總表。手寫一份就是第⑤號故障。 */
const SHIPPED = zConfigVfxFamiliesDoc.parse(readJson("content/config/vfx-families.json"));

/**
 * 施法者站的地方 —— **兩個**，因為「畫在施法者身上」只能用 A/B 證。
 *
 * ⚠️ 第一版只用一個施法者，斷言是「emitter 離施法者 ≤ 12 世界單位」（12 = 蝗蟲群
 * `aare` 600 那個環的半徑，家族版面本來就會有 pivot 位移）。實測突變：把
 * `posFromEvent` 改成永遠回 `{x:0,z:0}`（＝所有特效都畫在地圖原點，#131 那個故障
 * 的形狀）—— **測試照樣全綠**，因為原點離 (3,-4) 只有 5，還在容差內。那是第④號
 * 故障：斷言對正確的與壞掉的實作都會過。
 *
 * 改成 A/B 之後量的是**位移**：同一支技能在兩個不同位置各施一次，emitter 必須
 * 剛好移動 (Δx, Δz)。這對「畫在原點」是 0 位移 vs 期望的 (9, 7)，一定紅；而且
 * 對任何 pivot 位移免疫（環的形狀在兩次之間是一樣的，減掉就沒了）。
 */
const CASTER_A = { x: 3, z: -4 } as const;
const CASTER_B = { x: 12, z: 3 } as const;

/**
 * 「在畫面上」的上下界，世界單位。
 * 下界 0：地板。粒子的 emitter 在地板下 = 玩家看不到（第①號故障）。
 * 上界 8：戰鬥鏡頭 68° 俯角下，一位 ~1.7 單位高的英雄頭頂再上去 4 個身高。
 *   比它高的東西不在構圖裡 —— 這是「畫在畫面外」的那一半。
 */
const FLOOR_Y = 0;
const CEILING_Y = 8;

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
  setFamilyTuning(null); // 模組級狀態，不清會漏進別的檔
});

function ctx(at: { x: number; z: number }): VfxContext {
  return {
    entityPos: () => ({ x: at.x, z: at.z }),
    vfxDoc: (key: string): VfxDoc | null => {
      // 家族文件是 `setFamilyTuning` 當場鑄進 registry 的；其餘讀出貨樹。
      const minted = VfxDefs.tryGet(key);
      if (minted) return minted;
      const p = root(`content/vfx/${key}.json`);
      return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as VfxDoc) : null;
    },
  };
}

/** 一個家族挑一支**出貨的**技能當代表（表的順序是穩定的，所以這是決定性的）。 */
/**
 * 這一支技能**作者手寫**的 `vfxLayers` 會生出哪些發射器名字。
 *
 * ⚠️ 為什麼要把它們挑掉：`familyCastHeightY()` 回答的是「**w3x 家族美術**應該畫多高」
 * （來源是 `resolveFamilyArt().heightY`）。而 `vfxLayers` 是**另一個機制**
 * （#152 / #79 的疊層），高度由它自己的 `flyHeight` 決定 —— 兩者本來就不必相等。
 * `isAbilityArt` 只看 `vfx-` 前綴，所以它同時抓到兩種；一支代表技能只要被作者
 * 疊了一層，下面那條斷言就會拿家族的高度去質問一個不歸它管的發射器。
 * ⭐ 2026-08-18 #366 給 59-04 野戰型陽電子砲疊上橫放光柱時就真的撞到了。
 * ⛔ 這**不是**放寬斷言 —— 排除的集合是從**這一支技能自己的文件**算出來的，
 * 精確到名字；家族美術一個都沒有被放過。
 */
function authoredLayerEmitterNames(abilityId: string): Set<string> {
  const def = Abilities.get(abilityId as AbilityId) as { vfxLayers?: { vfxKey: string }[] } | undefined;
  return new Set((def?.vfxLayers ?? []).map((l) => `vfx-${l.vfxKey}`));
}

function oneAbilityPerFamily(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, row] of Object.entries(w3xFamilyArtRows())) {
    // GH#323 —— 代表一定要挑**還出貨**的那一支。原本挑到的幾支在 2026-08-13
    // 隨英雄退場了，於是「這個家族噴不出粒子」——⛔ 真相是那支技能根本不在名單上。
    if (!isShipped("abilities", id)) continue;
    if (!out.has(row.family)) out.set(row.family, id);
  }
  return out;
}

/**
 * 一個 `ParticleSystem` 是不是**技能自己的美術**（相對於打擊感合成器）。
 *
 * 命名不是這裡發明的，是三個工廠各自寫死的前綴：
 *   · `w3xfx-<docId>`   —— `W3xEmitterRig`（家族 / `fx.w3x.*` 那條 rig 路）
 *   · `vfx-<docId>`     —— `particleFactory`（pooled 那條路）
 *   · `vfx-preset-<key>`—— `vfxPresets` 的 `HitSpark` 打擊感合成器
 *
 * ⚠️ **第三種必須排除，而且它本身是一個發現。** EX 技能施法時，
 * `VfxSystem.handleEvent` 除了技能美術之外還會補一發 `layeredPop(...,"ex",...)`
 * ——那是 #131 修過的白熱核心，走的是 `HitSpark`，**高度規則和技能美術不同、
 * 也不經過 `familyCastHeightY`**。這一版測試的第一稿沒有分開，於是把合成器的
 * 高度也算進「宣稱 == 實際」，斷言方向就跟缺陷無關了（第④號故障）。
 *
 * 分開之後留下的真實後果，記在這裡給 owner 裁決 `heightY` 時看：
 * **家族高度一旦接上去，EX 的打擊感火花不會跟著移動**，兩層會在畫面上脫開。
 * 接 `heightY` 的那個 PR 要一起處理 `layeredPop` 的高度。
 */
function isAbilityArt(name: string): boolean {
  if (name.startsWith("vfx-preset-")) return false;
  return name.startsWith("w3xfx-") || name.startsWith("vfx-");
}

interface Drawn {
  name: string;
  /** emitter 的**世界**座標（rig 走 mesh，pooled 走 Vector3 —— 兩種都讀最終物件） */
  world: { x: number; y: number; z: number } | null;
  started: boolean;
  /** preWarm 驅動 60 幀之後同時活著的粒子峰值 */
  peak: number;
}

function emitterWorld(p: ParticleSystem): { x: number; y: number; z: number } | null {
  const em = p.emitter as unknown;
  if (!em || typeof em !== "object") return null;
  if ("getAbsolutePosition" in em) {
    const m = em as AbstractMesh;
    m.computeWorldMatrix(true);
    const v = m.getAbsolutePosition();
    return { x: v.x, y: v.y, z: v.z };
  }
  if ("x" in em && "y" in em && "z" in em) {
    const v = em as { x: number; y: number; z: number };
    return { x: v.x, y: v.y, z: v.z };
  }
  return null;
}

/** 送一次真的施法事件，回報 Babylon 場上**新多出來**的那些發射器。 */
function cast(abilityId: string, at: { x: number; z: number } = CASTER_A): Drawn[] {
  setFamilyTuning(SHIPPED);
  const docPath = root(`content/abilities/${abilityId}.json`);
  if (existsSync(docPath)) {
    // 出貨的 doc，過出貨的 schema。
    Abilities.register(
      abilityId as AbilityId,
      zAbilityDoc.parse(JSON.parse(readFileSync(docPath, "utf8"))) as never,
    );
  }
  const sys = new VfxSystem(scene, ctx(at));
  const before = new Set(scene.particleSystems);
  sys.handleEvent(
    { type: "abilityCast", data: { abilityId, caster: 1 } } as unknown as EventMessage,
    1000,
  );
  const made = scene.particleSystems.filter((ps) => !before.has(ps));
  return made.map((ps) => {
    const p = ps as unknown as ParticleSystem;
    const started = (p as unknown as { isStarted: () => boolean }).isStarted();
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      (p as unknown as { animate: (b: boolean) => void }).animate(true);
      peak = Math.max(peak, p.particles?.length ?? 0);
    }
    return { name: p.name, world: emitterWorld(p), started, peak };
  });
}

describe("#230 家族施法特效真的到得了畫面 (family-cast-on-screen)", () => {
  it("前提：`animate(true)` 驅動器本身有鑑別力 —— 沒 start 的發射器讀到 0", () => {
    // 這一條在守「上面那個 peak 不是恆真」。Babylon 哪天改了 preWarm 的語意，
    // 先紅的會是它，而不是整個檔案默默變成永遠會過。
    const drawn = cast(oneAbilityPerFamily().get("burst") as string);
    expect(drawn.length, "burst 家族連一個發射器都沒生出來").toBeGreaterThan(0);
    for (const d of drawn) expect(d.started, `${d.name} 沒有被 start()`).toBe(true);

    const idle = scene.particleSystems.find((ps) => {
      const p = ps as unknown as { isStarted: () => boolean };
      return !p.isStarted();
    });
    if (idle) {
      let peak = 0;
      for (let i = 0; i < 60; i++) {
        (idle as unknown as { animate: (b: boolean) => void }).animate(true);
        peak = Math.max(peak, (idle as unknown as ParticleSystem).particles?.length ?? 0);
      }
      expect(peak, "驅動器對『沒 start 的發射器』也吐粒子 —— 那它證明不了任何事").toBe(0);
    }
  });

  it("⭐ 19 個家族，每一個都真的在 Babylon 場上多出至少一個發射器", () => {
    const empty: string[] = [];
    for (const [family, abilityId] of oneAbilityPerFamily()) {
      if (cast(abilityId).length === 0) empty.push(`${family} (${abilityId})`);
    }
    expect(empty, `這些家族施法之後場上一個 ParticleSystem 都沒有：${empty.join(", ")}`).toEqual(
      [],
    );
  });

  it("⭐ 而且真的噴得出粒子 —— 不是「發射器建好了但一顆都不生」", () => {
    const dead: string[] = [];
    for (const [family, abilityId] of oneAbilityPerFamily()) {
      const drawn = cast(abilityId);
      const peak = Math.max(0, ...drawn.map((d) => d.peak));
      if (peak <= 0) dead.push(`${family} (${abilityId})`);
    }
    expect(dead, `這些家族的發射器一顆粒子都生不出來：${dead.join(", ")}`).toEqual([]);
  });

  it("⭐ 跟著施法者走 —— 施法者移動多少，粒子就移動多少（#131 是這個形狀的故障）", () => {
    const dx = CASTER_B.x - CASTER_A.x;
    const dz = CASTER_B.z - CASTER_A.z;
    const wrong: string[] = [];
    let compared = 0;
    for (const [family, abilityId] of oneAbilityPerFamily()) {
      const a = cast(abilityId, CASTER_A).filter((d) => isAbilityArt(d.name) && d.world);
      const b = cast(abilityId, CASTER_B).filter((d) => isAbilityArt(d.name) && d.world);
      // 同一支技能兩次施法生出來的發射器集合必須對得起來，否則下面的配對沒有意義。
      expect(b.map((d) => d.name), `${family} 兩次施法生出來的發射器不一樣`).toEqual(
        a.map((d) => d.name),
      );
      for (let i = 0; i < a.length; i++) {
        const p = a[i]?.world;
        const q = b[i]?.world;
        if (!p || !q) continue;
        compared += 1;
        // 位移，不是絕對位置：家族版面自己的 pivot 位移（蝗蟲群那個環）在兩次
        // 之間相同，相減就消掉了。
        if (Math.abs(q.x - p.x - dx) > 1e-6 || Math.abs(q.z - p.z - dz) > 1e-6) {
          wrong.push(
            `${family}/${a[i]?.name} 施法者移動 (${dx}, ${dz})，粒子只移動 (${q.x - p.x}, ${q.z - p.z})`,
          );
        }
      }
    }
    expect(compared, "一組都沒比到 —— 這條斷言等於沒斷言").toBeGreaterThan(0);
    expect(wrong, `這些發射器沒有跟著施法者：${wrong.join(" · ")}`).toEqual([]);
  });

  it("⭐ 高度 == `familyCastHeightY()` 宣稱的高度，而且在地板之上、天花板之下", () => {
    // 這一條把第②號故障釘死：渲染器**宣稱**的高度，和 Babylon **真的拿到**的
    // 高度，永遠是同一個數字。今天兩邊都是出貨值 1.0；哪天有人把
    // `familyCastHeightY` 接上 `resolveFamilyArt().heightY`，這條會逼他證明那個
    // 值真的落到 emitter 上，而不是在 `familyRow()` 那一行又蒸發一次。
    const bad: string[] = [];
    let checked = 0;
    for (const [family, abilityId] of oneAbilityPerFamily()) {
      const declared = familyCastHeightY(w3xArtFor(abilityId));
      expect(Number.isFinite(declared), `${family} 宣稱的高度不是有限數`).toBe(true);
      const authored = authoredLayerEmitterNames(abilityId);
      for (const d of cast(abilityId)) {
        if (!d.world || !isAbilityArt(d.name)) continue; // 合成器有自己的規則，見上
        if (authored.has(d.name)) continue; // 作者疊的層有自己的高度規則，見上
        checked += 1;
        if (Math.abs(d.world.y - declared) > 1e-6) {
          bad.push(`${family}/${d.name} 宣稱 y=${declared}，Babylon 拿到 y=${d.world.y}`);
        }
        if (!(d.world.y > FLOOR_Y && d.world.y < CEILING_Y)) {
          bad.push(`${family}/${d.name} 的 y=${d.world.y} 不在 (${FLOOR_Y}, ${CEILING_Y}) 之間`);
        }
      }
    }
    // ⚠️ 沒有這一行，`isAbilityArt` 哪天過濾掉全部東西，上面那個空陣列就變成
    // 一句廢話 —— 一條永遠會過的測試（第③號故障的另一種長相）。
    expect(checked, "一個技能美術發射器都沒檢查到 —— 這條斷言等於沒斷言").toBeGreaterThan(0);
    expect(bad, `宣稱的高度沒有送到引擎，或畫在畫面外：${bad.join(" · ")}`).toEqual([]);
  });
});

/**
 * #251 owner「**衝擊波特效沒有真實套用**」—— 貼地的環真的回到地板了嗎。
 *
 * ===========================================================================
 * 這條測試守的缺陷，和它為什麼不能靠既有的測試
 * ===========================================================================
 * 動手前量到的（跑真的 `VfxSystem.handleEvent`，從 Babylon 讀回 emitter 世界
 * 座標，不是讀註解）：91 支 `shockwaveRing` 技能畫出 105 個 `ParticleSystem`，
 * **emitter Y 的直方圖是單獨一格 `{1.0: 105}`**，而出貨 config 對那個家族寫的
 * 是 `heightY: 0.15`。「地面向外擴的環」全部浮在胸口。
 *
 * ⚠️ `familyCastOnScreen.test.ts` **證不了這件事**，而且不是它寫壞了：它斷言的
 * 是「`familyCastHeightY()` 宣稱的高度 == Babylon 拿到的高度」。缺陷發生時兩邊
 * 都是 1.0，所以它全綠；把這次的修法整個撤掉（`familyCastHeightY` 改回
 * `return SHIPPED_CAST_HEIGHT_Y`）它**還是**全綠。那條測試守的是②號故障的
 * 另一半（宣稱一套、送出另一套），這一條守的是「宣稱的那一套本身是對的」。
 * 兩條合起來才蓋得住。
 *
 * 所以這裡的斷言是**絕對高度的比較**，而且比較對象是家族自己算出來的值：
 * 貼地家族必須真的低於平面高度，而且要低到看得出來。
 *
 * ===========================================================================
 * 突變驗證（2026-08-01，每一條都真的跑過，紅 → 還原 → 綠）
 * ===========================================================================
 *   · `w3xAbilityArt.familyRow()` 拿掉 `heightY: resolved.heightY,`
 *     （＝把值還給那一行蒸發，也就是修這次缺陷之前的樣子）
 *     → 「衝擊波環真的貼回地板」紅：`expected 1 to be less than 0.5`。
 *   · `familyCastHeight.familyCastHeightY()` 改成永遠 `return
 *     SHIPPED_CAST_HEIGHT_Y`（＝欄位存在、算得出來，但播放端不理）
 *     → 同一條紅，訊息一樣。
 *   · `familyCastHeightY` 的 `ground` 那一行改成 `if (false)`（＝把安全的那一半
 *     變成「全部照做」）→「往上的家族在 ground 模式下不動」紅：
 *     `boltStrike 在 ground 模式飛到 3.2`。
 *   · `VfxSystem.playCastVfx` 的 EX `layeredPop` 少傳 `familyCastHeightY(...)`
 *     → 「EX 的打擊感火花和技能美術同一個高度」紅（1 vs 0.15）。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "./shippedAbilityArt.testkit";
import { readFileSync, existsSync } from "node:fs";
import { isShipped } from "../../testkit/contentFixtures";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

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
import { setFamilyTuning, w3xArtFor, w3xAbilityArtRows } from "./w3xAbilityArt";
import { w3xFamilyArtRows } from "./w3xFamilyArt";
import {
  familyCastHeightY,
  setCastHeightSource,
  SHIPPED_CAST_HEIGHT_Y,
} from "./familyCastHeight";
import { isLegacySingleVfx, type AbilityVfxSource } from "@ggd/shared/content/schema/abilityVfx";
import { VfxSystem, type VfxContext } from "../../vfx/VfxSystem";

const root = (p: string): string => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));
const readJson = (p: string): unknown => JSON.parse(readFileSync(root(p), "utf8")) as unknown;

/** 出貨的家族總表。手寫一份長得像出貨的物件就是第⑤號故障。 */
const SHIPPED = zConfigVfxFamiliesDoc.parse(readJson("content/config/vfx-families.json"));

const CASTER = { x: 3, z: -4 } as const;

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
  setFamilyTuning(null);
  setCastHeightSource(undefined); // 模組級狀態，不清會漏進別的檔
});

function ctx(): VfxContext {
  return {
    entityPos: () => ({ x: CASTER.x, z: CASTER.z }),
    vfxDoc: (key: string): VfxDoc | null => {
      const minted = VfxDefs.tryGet(key);
      if (minted) return minted;
      const p = root(`content/vfx/${key}.json`);
      return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as VfxDoc) : null;
    },
  };
}

function emitterY(p: ParticleSystem): number | null {
  const em = p.emitter as unknown;
  if (!em || typeof em !== "object") return null;
  if ("getAbsolutePosition" in em) {
    const m = em as AbstractMesh;
    m.computeWorldMatrix(true);
    return m.getAbsolutePosition().y;
  }
  if ("y" in em) return (em as { y: number }).y;
  return null;
}

interface Drawn {
  readonly name: string;
  readonly y: number;
}

/**
 * 送一次真的施法事件，回報場上**新多出來**的發射器的世界高度。
 *
 * `art` = 技能自己的美術（`w3xfx-` rig 路 / `vfx-` pooled 路）；
 * `impact` = `HitSpark` 打擊感合成器（`vfx-preset-`）。兩者分開是因為它們是
 * 兩層，而這次改動的重點之一就是**它們必須一起移動**。
 */
function cast(abilityId: string, into: Scene = scene): { art: Drawn[]; impact: Drawn[] } {
  setFamilyTuning(SHIPPED);
  const docPath = root(`content/abilities/${abilityId}.json`);
  if (existsSync(docPath)) {
    Abilities.register(
      abilityId as AbilityId,
      zAbilityDoc.parse(JSON.parse(readFileSync(docPath, "utf8"))) as never,
    );
  }
  const sys = new VfxSystem(into, ctx());
  const before = new Set(into.particleSystems);
  sys.handleEvent(
    { type: "abilityCast", data: { abilityId, caster: 1 } } as unknown as EventMessage,
    1000,
  );
  const made = into.particleSystems
    .filter((ps) => !before.has(ps))
    .map((ps) => ({ name: ps.name, y: emitterY(ps as unknown as ParticleSystem) ?? NaN }))
    .filter((d) => Number.isFinite(d.y));
  return {
    art: made.filter((d) => !d.name.startsWith("vfx-preset-")),
    impact: made.filter((d) => d.name.startsWith("vfx-preset-")),
  };
}

/**
 * 這張表裡真的走**家族原型**那條路的技能 id。
 *
 * ⚠️ `w3xAbilityArtRows()` 的硬表晉升會蓋過家族（`w3xArtFor` 是
 * `w3xAbilityArtRows()[id] ?? familyRow(id)`），而那些列播的是原圖**真的抽出來的
 * 發射器組**、不是家族原型，所以它們沒有家族高度可用，一律留在平面高度。
 * 這個交集不是我猜的：第一版沒有排除它，測試就指名紅給我看
 * （`godie-uvng.e → w3xfx-godie-tectonicfury-p0 @ y=1`）。
 * 那也是這次修法**留下來沒做**的一塊，交接時要講清楚。
 */
// GH#323 —— 只取**還出貨**的：235 支技能在 2026-08-13 搬進 `content/_legacy/`，
// 而綁定表留著它們是刻意的。⛔ 拿退場的技能當分母，這條就會用「58 不到 83」這種
// 跟「施法高度有沒有送到 Babylon」完全無關的訊息紅。
const idsOfFamily = (family: string): string[] =>
  Object.entries(w3xFamilyArtRows())
    .filter(([id, r]) => r.family === family && !w3xAbilityArtRows()[id] && isShipped("abilities", id))
    .map(([id]) => id);

describe("#251 施法高度真的送到 Babylon (cast-height-applied)", () => {
  it("前提：出貨 config 真的把衝擊波環寫成貼地的，而且技能數量沒有塌掉", () => {
    // 這一條在守「下面兩條不是恆真」。哪天有人把 config 的 0.15 改成 1.0，
    // 或這張表被清空，先紅的會是它，而不是整個檔案默默變成永遠會過。
    expect(SHIPPED.families.shockwaveRing?.heightY).toBeLessThan(SHIPPED_CAST_HEIGHT_Y);
    // GH#323 —— ⛔ 這裡原本釘 `91` 與 `> 80`，兩個都是**表的大小**。2026-08-13
    //    有 235 支技能搬進 `content/_legacy/`，於是它用「59 不到 80」報一個跟
    //    「施法高度有沒有送到 Babylon」毫無關係的錯。⭐ 真正要擋的是「分母塌成 0」
    //    ——那才會讓下面兩條變成恆真。
    expect(
      idsOfFamily("shockwaveRing").length,
      "衝擊波環一支都不出貨了 —— 下面兩條會變成恆真，這個檔案就不再守任何東西",
    ).toBeGreaterThan(0);
    expect(idsOfFamily("boltStrike").length).toBeGreaterThan(0);
  });

  it("⭐ 衝擊波環真的貼回地板 —— 91 支全部，讀 Babylon 的 emitter 世界 Y", () => {
    setCastHeightSource("ground");
    // ⚠️ 再排除一種：技能自己寫了 `vfxLayers`（#205 多層堆疊）。那條路是
    // `playCastVfx` 的第 0 級，在解出家族之前就 return，每一層帶自己的
    // `flyHeight` —— 作者已經對「這一招各層多高」下了完整陳述，家族高度不該
    // 蓋過它。同樣不是猜的：第一版沒排除，測試指名紅給我看
    // （`godie-e008.e → vfx-fx.w3x.particle.enchant.p00 @ y=1`）。
    const ids = idsOfFamily("shockwaveRing").filter((id) => {
      const p = root(`content/abilities/${id}.json`);
      if (!existsSync(p)) return true;
      return isLegacySingleVfx(
        zAbilityDoc.parse(JSON.parse(readFileSync(p, "utf8"))) as unknown as AbilityVfxSource,
      );
    });
    const floating: string[] = [];
    let drawn = 0;
    for (const id of ids) {
      for (const d of cast(id).art) {
        drawn += 1;
        // 「明顯低於胸口」而不是「等於 0.15」：每一支的 flyHeight 覆寫不同，
        // 釘死一個數字會讓這條測試變成 config 的複寫本（第⑦號故障）。
        if (!(d.y < 0.5)) floating.push(`${id} → ${d.name} @ y=${d.y}`);
      }
    }
    // 分母綁在**這一輪真的送出去的技能數**上，不是一個手打的門檻：
    // 表縮水或某一支畫不出東西都會先在這裡紅。2026-08-01 實測 87/87。
    expect(drawn, "有技能一個發射器都沒生出來 —— 那些支沒有被證到").toBeGreaterThanOrEqual(
      ids.length,
    );
    expect(
      floating,
      `這些「地面向外擴的環」仍然浮在半空：${floating.slice(0, 5).join(" / ")}`,
    ).toEqual([]);
  });

  it("`flat` 模式把每一支都送回胸口 —— 這是改壞了的回退鍵", () => {
    setCastHeightSource("flat");
    const id = idsOfFamily("shockwaveRing")[0]!;
    const ys = cast(id).art.map((d) => d.y);
    expect(ys.length).toBeGreaterThan(0);
    for (const y of ys) expect(y).toBe(SHIPPED_CAST_HEIGHT_Y);
  });

  it("`ground` 只讓想往下的往下 —— 從天而降的家族在出貨模式下一動也不動", () => {
    // 這一條是「預設值選得安全」的證明：雷擊家族想要 3.2（頭頂上方），
    // 而 owner 只點名了衝擊波。`ground` 下它必須維持在胸口。
    setCastHeightSource("ground");
    const strike = idsOfFamily("boltStrike");
    for (const id of strike) {
      for (const d of cast(id).art) {
        expect(d.y, `${id} 在 ground 模式飛到 ${d.y}`).toBe(SHIPPED_CAST_HEIGHT_Y);
      }
    }
    // …而 `family` 模式下它才真的飛上去（否則上面那條會是恆真）
    setCastHeightSource("family");
    const up = strike.flatMap((id) => cast(id).art.map((d) => d.y));
    expect(up.length).toBeGreaterThan(0);
    expect(Math.max(...up), "family 模式下雷擊仍然沒有離開胸口").toBeGreaterThan(
      SHIPPED_CAST_HEIGHT_Y,
    );
  });

  it("EX 的打擊感火花和技能美術同一個高度 —— 兩層不會在畫面上脫開", () => {
    // `familyCastOnScreen.test.ts` 的檔頭 2026-07-30 就寫下了這個後果：
    // 「家族高度一旦接上去，EX 的打擊感火花不會跟著移動」。這是它的守衛。
    setCastHeightSource("ground");
    const exIds = idsOfFamily("shockwaveRing").filter((id) => id.endsWith(".ex"));
    expect(exIds.length, "沒有任何 EX 衝擊波技能 —— 這條測試沒有被測對象").toBeGreaterThan(0);
    const id = exIds[0]!;
    // ⚠️ 打擊感合成器是**每個 scene 池化**的（`impactComposerFor(scene)`），
    // 所以在上面那些 cast 之後它的 system 早就存在，「新多出來的」濾網會把它
    // 整批濾掉 —— 第一版就是這樣讀到 0 個的。開一個乾淨的 scene 才量得到。
    const fresh = new Scene(engine);
    const { art, impact } = cast(id, fresh);
    expect(art.length, "技能美術沒畫出來").toBeGreaterThan(0);
    expect(impact.length, "EX 沒有補那一發 layeredPop —— 這條測試沒在測東西").toBeGreaterThan(0);
    const artY = art[0]!.y;
    for (const d of impact) {
      expect(d.y, `打擊感 ${d.name} 在 y=${d.y}，技能美術在 y=${artY}`).toBeCloseTo(artY, 5);
    }
  });

  it("`familyCastHeightY` 對沒有家族的技能一律回平面高度（硬表晉升那 34 支）", () => {
    // `w3xAbilityArtRows()` 的列沒有 `heightY`（它們沒有家族原型），absent 必須
    // 讀成「用平面高度」而不是 0 —— 0 = 埋進地板，第①號故障。
    setCastHeightSource("family");
    const art = w3xArtFor("godie-e002.e");
    expect(art, "拿來當對照的硬表列不見了").toBeTruthy();
    expect(art?.heightY).toBeUndefined();
    expect(familyCastHeightY(art)).toBe(SHIPPED_CAST_HEIGHT_Y);
    expect(familyCastHeightY(undefined)).toBe(SHIPPED_CAST_HEIGHT_Y);
  });
});

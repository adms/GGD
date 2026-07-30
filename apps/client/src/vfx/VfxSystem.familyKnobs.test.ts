/**
 * vfx-family-ability-knobs —— 鑄技工坊「單支技能」那一格的 α / 時間倍率，
 * 從後台文件一路到**引擎手上的粒子參數** (#205 / #230).
 *
 * ---------------------------------------------------------------------------
 * 這條守衛補的是一個死旋鈕
 * ---------------------------------------------------------------------------
 * 2026-07-30 的鏈路實測發現：`config.vfx-families@1.abilities.<id>.alpha` 與
 * `.timeScale` 是**算了但從沒送到**的第②號故障。後台驗證它、寫進耐久覆蓋層、
 * `resolveFamilyArt` 也讀得到 —— 但 `familyRow()` 把 `ResolvedFamilyArt` 塞進
 * `W3xAbilityArt` 時，那個介面**沒有這兩個欄位**，於是兩個值在那一行蒸發。
 * 而後台的 FIELD_HINT 與 schema 註解都白紙黑字寫著「家族那一張是基準，單支技能
 * 那一格覆寫它」——兩處文案在說謊。
 *
 * 所以這裡斷言的**不是**「resolveFamilyArt 回傳 0.35」（那是屬性，而且那一段
 * 本來就是對的）。斷言的是：同一支技能、同一個施法事件，只因為後台那一格填了
 * 數字，**Babylon 真的拿到的顏色梯度與壽命就不一樣**（行為）。
 *
 * 突變驗證（都真的跑過）：
 *   · 把 `familyRow()` 裡搬運 alpha/timeScale 的那兩行拿掉 → 本檔兩條紅；
 *   · 把 `applyVfxOverrides` 改成永遠 `return doc` → 同樣紅；
 *   · 把 `VfxSystem.playCastVfx` 的 `tune(...)` 換回原本的裸 doc → 同樣紅。
 *
 * ⚠️ 沒動過的技能必須**一位元不差**：最後一條釘的是 identity —— 操作者沒填的
 * 時候池 key 不可以多一個 `#` 後綴，否則 598 支技能會憑空各多開一格粒子池。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import { VfxDefs, type ConfigVfxFamiliesDoc, type VfxDoc } from "@ggd/shared/content";
import { zConfigVfxFamiliesDoc } from "@ggd/shared/content/schema/vfx";
import { zAbilityDoc } from "@ggd/shared/content/schema/ability";
import { setFamilyTuning, w3xArtFor } from "../render/vfx/w3xAbilityArt";
import { VfxSystem, type VfxContext } from "./VfxSystem";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const readJson = (p: string): unknown => JSON.parse(readFileSync(root(p), "utf8")) as unknown;

/** 出貨的那份家族總表 —— 手寫一份就是第⑤號故障（被測的不是出貨的那個）。 */
const SHIPPED = zConfigVfxFamiliesDoc.parse(readJson("content/config/vfx-families.json"));

/** 借一支出貨技能當骨架，換 id：這一列在出貨的證據表裡沒有，全靠後台無中生有。 */
const BASE_ABILITY = "godie-n003.q";
const ABILITY = "test.familyknob.q";

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  const doc = { ...(readJson(`content/abilities/${BASE_ABILITY}.json`) as object), id: ABILITY };
  Abilities.register(ABILITY as AbilityId, zAbilityDoc.parse(doc) as never);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});
afterEach(() => {
  // 模組級狀態：不清掉會漏進別的檔
  setFamilyTuning(null);
});

/** 後台那份文件 + 這一支技能的一筆 per-ability 綁定。 */
function tuning(binding: Record<string, unknown>): ConfigVfxFamiliesDoc {
  return zConfigVfxFamiliesDoc.parse({
    ...SHIPPED,
    abilities: { ...SHIPPED.abilities, [ABILITY]: binding },
  });
}

function harness(): VfxSystem {
  const ctx: VfxContext = {
    entityPos: () => ({ x: 0, z: 0 }),
    // `ContentDb.vfxFor` 的兩個來源：registry（家族文件是 setFamilyTuning 當場
    // 鑄出來註冊進去的）與出貨樹。覆寫過的 doc 帶著 `#簽章` 的池 key，但**解析**
    // 發生在套覆寫之前，所以這裡看到的永遠是乾淨的 id。
    vfxDoc: (key: string): VfxDoc | null => {
      const minted = VfxDefs.tryGet(key);
      if (minted) return minted;
      try {
        return readJson(`content/vfx/${key}.json`) as VfxDoc;
      } catch {
        return null;
      }
    },
  };
  return new VfxSystem(scene, ctx);
}

const cast = (): EventMessage =>
  ({ type: "abilityCast", data: { abilityId: ABILITY, caster: 1 } }) as unknown as EventMessage;

interface Made {
  name: string;
  /** 顏色梯度上每一階的 alpha（Babylon 的 `color1.a`） */
  alphas: number[];
  maxLife: number;
}

function fire(binding: Record<string, unknown>): Made[] {
  setFamilyTuning(tuning(binding));
  const sys = harness();
  const before = [...scene.particleSystems];
  sys.handleEvent(cast(), 1000);
  return scene.particleSystems
    .filter((ps) => !before.includes(ps))
    .map((ps) => ({
      name: ps.name,
      alphas: (ps.getColorGradients() ?? []).map((g) => g.color1.a),
      maxLife: ps.maxLifeTime,
    }));
}

function peakAlpha(m: Made): number {
  expect(m.alphas.length, `${m.name} 沒有 colour gradient`).toBeGreaterThan(0);
  for (const a of m.alphas) expect(Number.isFinite(a), `alpha 不是有限數：${String(a)}`).toBe(true);
  return Math.max(...m.alphas);
}

describe("鑄技工坊的 per-ability α / 時間倍率真的到得了引擎 (vfx-family-ability-knobs)", () => {
  it("前提：後台可以無中生有把這一支綁到一個家族原型（沒有這一步，下面兩條沒有意義）", () => {
    setFamilyTuning(tuning({ family: "burst" }));
    const art = w3xArtFor(ABILITY);
    expect(art, "後台的 family 綁定沒有生出任何一列").toBeDefined();
    expect(art?.primary.startsWith("fx.fam.burst."), `primary 是 ${art?.primary}`).toBe(true);
  });

  it("⚠️ 填了 alpha → 引擎手上的顏色梯度真的比較透明（以前這一格算完就被丟掉）", () => {
    const plain = fire({ family: "burst" });
    const faded = fire({ family: "burst", alpha: 0.35 });
    expect(plain.length, "沒有任何發射器 —— 這條測試的前提就不成立").toBeGreaterThan(0);
    expect(faded).toHaveLength(plain.length);

    const before = peakAlpha(plain[0]!);
    const after = peakAlpha(faded[0]!);
    expect(after, `alpha 0.35 之後最亮的一階仍是 ${after}（原本 ${before}）`).toBeLessThan(before);
    expect(after / before).toBeCloseTo(0.35, 1);
  });

  it("⚠️ 填了 timeScale → 粒子壽命真的變短", () => {
    const plain = fire({ family: "burst" });
    const quick = fire({ family: "burst", timeScale: 0.4 });
    expect(quick[0]!.maxLife).toBeLessThan(plain[0]!.maxLife);
    expect(quick[0]!.maxLife / plain[0]!.maxLife).toBeCloseTo(0.4, 1);
  });

  it("沒填 → 一位元不差：池 key 不會多長一個 `#` 後綴（598 支技能的向後相容）", () => {
    const plain = fire({ family: "burst" });
    for (const m of plain) {
      expect(m.name.includes("#"), `${m.name} 憑空多開了一格粒子池`).toBe(false);
    }
    // 而填了的那一次**必須**換 key，否則第二種參數會借到第一種已經建好的
    // ParticleSystem，畫面上兩者一模一樣（第③號故障的完美形狀）
    const faded = fire({ family: "burst", alpha: 0.35 });
    expect(faded.some((m) => m.name.includes("#")), "覆寫過的 doc 沒有換池 key").toBe(true);
  });
});

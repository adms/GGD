/**
 * B6 守衛之二 —— **給一支已晉升的技能加 `vfxLayers`,會把它從 rig 降級到池化路徑。**
 *
 * ---------------------------------------------------------------------------
 * 這條在守什麼
 * ---------------------------------------------------------------------------
 * `playCastVfx` 的階梯是:
 *
 *   rung 0  `vfxLayers`(#205)   → `playLayeredCast` → 池化 `play()`,每份文件
 *                                  被 `frontLoadDoc` 壓成**一次爆發**
 *   rung 1  `w3xAbilityArtRows()`    → `W3xEmitterRig`,播的是文件**作者寫的發射流**
 *
 * rung 0 **蓋過** rung 1(那是 S1 刻意的:doc 寫了層堆疊就是作者的完整陳述)。
 * 所以對 `w3xAbilityArtRows()` 那 34 支硬表技能來說,「順手補一列 `vfxLayers`」
 * 是一次**看不見的降級** —— 畫面上還是有東西,測試也不會紅,只是原本的發射流
 * 被壓成單幀爆發。這正是第③號故障的形狀(功能被撤銷,測試全綠)。
 *
 * 這裡用 B6 桶自己那支已晉升的技能 `godie-u010.r`(38-04 黑龍波吸收,綁
 * `fx.w3x.particle.flamessmoke`)把這件事**量出來**,而不是寫在註解裡:
 * 同一支技能,加層之前 rig 有活的效果,加層之後 rig 一個都沒有。
 *
 * ⚠️ 這條**不是**在說 `vfxLayers` 不好。它是在標出「哪 34 支不可以用它」,
 * 直到 `playLayeredCast` 也會走 rig 為止。B6 因此**沒有**動 `godie-u010.r`
 * 與 `godie-u00v.r` 這兩支已晉升的文件。
 *
 * 突變驗證(結果記在回報裡):把 `playCastVfx` 的 rung 0 分支
 * (`if (layers && layers.length > 0)`)刪掉 → 「加層之後 rig 不再接手」紅。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "../render/vfx/shippedAbilityArt.testkit";
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
import type { VfxDoc } from "@ggd/shared/content";
import { zAbilityDoc } from "@ggd/shared/content/schema/ability";
import { w3xAbilityArtRows, extraVfxDocIds } from "../render/vfx/w3xAbilityArt";
import { VfxSystem, type VfxContext } from "./VfxSystem";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const readJson = <T,>(p: string): T => JSON.parse(readFileSync(root(p), "utf8")) as T;
const loadVfx = (id: string): VfxDoc => readJson<VfxDoc>(`content/vfx/${id}.json`);

/** B6 桶自己的一支已晉升技能。硬表那一列是這條的前提,所以先斷言它還在。 */
const PROMOTED = "godie-u010.r";

let engine: NullEngine;
let scene: Scene;

/**
 * ⚠️ `playCastVfx` 查硬表用的是 **`def.id`**,不是事件上的 `abilityId`
 * (`VfxSystem.ts`: `this.playCastVfx(def?.id, ...)`)。所以兩份文件都必須
 * 帶**真的** `godie-u010.r` 這個 id,否則兩邊都查不到硬表、兩邊都不走 rig,
 * 這條就變成「斷言方向跟缺陷無關」(第④號故障)。
 */
function parseAs(doc: Record<string, unknown>): unknown {
  return zAbilityDoc.parse({ ...doc, id: PROMOTED });
}

let asShipped: unknown;
let withLayers: unknown;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  const shipped = readJson<Record<string, unknown>>(`content/abilities/${PROMOTED}.json`);
  asShipped = parseAs(shipped);
  // 「順手補一列」的樣子:同一支技能,把硬表那一組發射器原封不動寫成層。
  const art = w3xAbilityArtRows()[PROMOTED]!;
  withLayers = parseAs({
    ...shipped,
    vfxLayers: [art.primary, ...extraVfxDocIds(PROMOTED)].slice(0, 5).map((vfxKey) => ({ vfxKey })),
  });
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

function fire(def: unknown): { rigEffects: number; pooled: number } {
  const before = scene.particleSystems.length;
  const sys = new VfxSystem(scene, {
    entityPos: () => ({ x: 0, z: 0 }),
    vfxDoc: (key: string) => {
      try {
        return loadVfx(key);
      } catch {
        return null;
      }
    },
  } satisfies VfxContext);
  Abilities.register(PROMOTED as AbilityId, def as never);
  sys.handleEvent(
    { type: "abilityCast", data: { abilityId: PROMOTED, caster: 1 } } as unknown as EventMessage,
    1_000,
  );
  return {
    rigEffects: sys.w3xCastFx.liveCount,
    pooled: scene.particleSystems.length - before - sys.w3xCastFx.systemCount,
  };
}

describe("B6 · rung 0 會把已晉升的技能踢出 rig", () => {
  it("前提:godie-u010.r 真的在硬表上,而且出貨文件沒有 vfxLayers", () => {
    expect(w3xAbilityArtRows()[PROMOTED]).toBeDefined();
    const shipped = readJson<Record<string, unknown>>(`content/abilities/${PROMOTED}.json`);
    expect(shipped["vfxLayers"]).toBeUndefined();
    // 硬表宣稱的那一組文件真的都在 content/ 裡,否則下面量到的 0 是別的原因。
    for (const id of [w3xAbilityArtRows()[PROMOTED]!.primary, ...extraVfxDocIds(PROMOTED)]) {
      expect(() => loadVfx(id)).not.toThrow();
    }
  });

  it("出貨的樣子 → rig 接手;加了 vfxLayers → rig 一個效果都沒有", () => {
    const shipped = fire(asShipped);
    expect(shipped.rigEffects).toBeGreaterThan(0);

    const layered = fire(withLayers);
    expect(layered.rigEffects).toBe(0);
    // 而且不是「什麼都沒畫」—— 它改走池化路徑了,所以降級是靜默的。
    expect(layered.pooled).toBeGreaterThan(0);
  });
});

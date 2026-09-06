/**
 * ⭐⭐ GH#1000 —— **預設施法裝飾讓路**（`vfx-script@1.yields: ["caster.castFx"]`）的承重守衛。
 *
 * ⛔ 不是掃字串：真的 `NullEngine` 場景、真的 `Abilities` 登錄表、真的 wire 事件
 * （`abilityCast` → `castBegin` → `projectileSpawn`）、讀真的計數器
 * （`pillars.activeCount` · `scene.particleSystems` · `feedbackFx.countFor`）。
 * 骨架逐字承自 2026-09-05 退休的那兩條（`docs/legacy/_retired-guards.md`）。
 *
 * ⭐ **兩個方向都量**（CLAUDE.md：單邊校準的尺會在最需要說話時沉默）：
 *   宣告 `yields` ⇒ 三種預設裝飾**量不到**；沒宣告 ⇒ **量得到** —— 同一支 script、只差一格。
 * ⭐ 而 script 自己的段（浮動文字）在兩邊都要**在** —— 讓路的是預設，⛔ 不是作者的層。
 *
 * 突變（記在 docs/_reports/1000_temp_*.md）：拿掉 `case "castBegin"` 的那一行 `heldBy` ⇒ 這裡紅。
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { VfxDoc } from "@ggd/shared/content";
import { CAST_FX_CHANNEL, zVfxScriptDoc, type VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import { channelTakeover } from "../render/channelTakeover";
import { VfxSystem } from "./VfxSystem";

const ABILITY = "test.castfx.q";
const BURST: VfxDoc = {
  id: "test.castfx.burst",
  schema: "vfx@1",
  emitter: { shape: "point" },
  mode: "burst",
  burstCount: 1,
  lifetimeSec: { min: 0.1, max: 0.2 },
  size: { start: 0.2, end: 0 },
  color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
  blendMode: "additive",
};

let engine: NullEngine | null = null;
let scene: Scene | null = null;

beforeAll(() => {
  Abilities.register(ABILITY as AbilityId, {
    id: ABILITY as AbilityId,
    name: "讓路",
    slot: "Q",
    castType: "ground",
    maxRank: 4,
    cooldown: [10],
    manaCost: [10],
    range: 6,
    effects: [],
    vfxKey: BURST.id,
    castTimeSec: 1,
  });
});
afterEach(() => {
  scene?.dispose();
  engine?.dispose();
  scene = engine = null;
  channelTakeover.reset();
});

/** 同一次施法的三個 wire 事件，量三種預設裝飾 ＋ script 自己那一層。 */
function castOnce(yields: VfxScriptDoc["yields"]) {
  engine = new NullEngine();
  scene = new Scene(engine);
  const script: VfxScriptDoc = {
    id: ABILITY,
    schema: "vfx-script@1",
    abilityId: ABILITY,
    ...(yields !== undefined ? { yields } : {}),
    segments: [{ kind: "floatingText", on: "castStart", text: "CUSTOM", durationSec: 1 }],
  };
  const vfx = new VfxSystem(scene, {
    entityPos: () => ({ x: 0, z: 0 }),
    teamOf: () => 0,
    vfxDoc: (id) => (id === BURST.id ? BURST : null),
    vfxScriptFor: (id) => (id === ABILITY ? script : undefined),
    allVfxScripts: () => [script],
  });
  const t0 = 0;
  vfx.handleEvent({ type: "abilityCast", tick: 0, data: { abilityId: ABILITY, caster: 1, point: { x: 3, z: 0 } } }, t0);
  vfx.handleEvent({ type: "castBegin", tick: 0, data: { caster: 1, slot: "Q", abilityId: ABILITY, ticks: 30, castTimeSec: 1 } }, t0);
  // 彈道在 castEnd 那一刻才生（1 秒後）—— 窗口要撐到那裡
  vfx.handleEvent({ type: "castEnd", tick: 30, data: { caster: 1, abilityId: ABILITY } }, 1_000);
  vfx.handleEvent({ type: "projectileSpawn", tick: 30, data: { id: 9, owner: 1, projectileId: "shared.projectile", origin: `ability:${ABILITY}` } }, 1_000);
  vfx.update(t0);
  const pillars = (vfx as unknown as { pillars: { activeCount: number } }).pillars.activeCount;
  const familyArt = scene.particleSystems.filter((s) => s.name.includes(BURST.id)).length;
  const muzzle = vfx.feedbackFx.countFor("muzzle/physical/1/flash");
  const scriptText = (vfx.floatingTextEntries as readonly { active: boolean; text: string }[])
    .filter((e) => e.active && e.text === "CUSTOM").length;
  vfx.dispose();
  return { pillars, familyArt, muzzle, scriptText };
}

describe("GH#1000 預設施法裝飾讓路（caster.castFx）", () => {
  it("⭐⭐ 兩個方向：宣告 yields ⇒ 光柱／家族美術／槍口量不到；沒宣告 ⇒ 三種都量得到", () => {
    const plain = castOnce(undefined);
    expect(plain.pillars, "⛔ 前提壞了：沒宣告時光柱本來就該亮").toBeGreaterThan(0);
    expect(plain.familyArt, "⛔ 前提壞了：沒宣告時家族美術本來就該畫").toBeGreaterThan(0);
    expect(plain.muzzle, "⛔ 前提壞了：沒宣告時槍口本來就該閃").toBeGreaterThan(0);
    expect(plain.scriptText).toBe(1);

    const yielded = castOnce([CAST_FX_CHANNEL]);
    expect(yielded.pillars, "⛔ 宣告了讓路，光柱還是點了").toBe(0);
    expect(yielded.familyArt, "⛔ 宣告了讓路，家族美術還是畫了（兩套演出同時畫）").toBe(0);
    expect(yielded.muzzle, "⛔ 宣告了讓路，castEnd 才生的彈道槍口還是閃了（窗口沒跟著詠唱走）").toBe(0);
    expect(yielded.scriptText, "⛔ 讓路吃掉了 script 自己的層 —— 那是全有全無旗標，不是通道").toBe(1);
  });

  it("⭐ 出貨 10 支逐支都在資料裡說了要不要讓路（AC1）—— 而且 schema 收得下", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/vfx-scripts");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as { yields?: unknown };
      expect(zVfxScriptDoc.safeParse(doc).success, `⛔ ${f} 不過 schema`).toBe(true);
      expect(Array.isArray(doc.yields), `⛔ ${f} 沒有寫 yields —— 「沒說」跟「沒決定」長得一模一樣`).toBe(true);
    }
  });
});

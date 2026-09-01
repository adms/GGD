/**
 * Owner acceptance guard for the eight VFX Forge reference abilities.
 *
 * This intentionally checks visual grammar, not damage or balance. A green
 * schema alone cannot prove that the authored timeline still contains the
 * recognizable projectile/dash/beam/finisher/reflect shapes the editor claims
 * to build. Real frame captures remain the final visual judgement; this file
 * prevents the easy structural regressions before opening the renderer.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zVfxScriptDoc, type VfxScriptDoc, type VfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const IDS = [
  "godie-hjai.e", // 龍破斬
  "godie-hjai.r", // 神滅斬
  "godie-hart.r", // 超究武神霸斬
  "godie-nbbc.r", // 阿邦快速劍X
  "godie-nbbc.e", // 龍鬥氣砲咒文
  "godie-ogrh.r", // 龜派氣功
  "godie-e002.ex", // 理想鄉EX
  "godie-hvsh.r", // 騎英之手綱
] as const;

function load(id: string): VfxScriptDoc {
  return zVfxScriptDoc.parse(JSON.parse(readFileSync(join(CONTENT, "vfx-scripts", `${id}.json`), "utf8")));
}

function loadJson(collection: string, id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(CONTENT, collection, `${id}.json`), "utf8")) as Record<string, unknown>;
}

function collectAbilityModelKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const child of value) collectAbilityModelKeys(child, out);
  } else if (value !== null && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (rec.kind === "spawnModelFx" && typeof rec.modelKey === "string") out.add(rec.modelKey);
    for (const child of Object.values(rec)) collectAbilityModelKeys(child, out);
  }
  return out;
}

const docs = new Map(IDS.map((id) => [id, load(id)]));
const segs = (id: typeof IDS[number]): readonly VfxScriptSegment[] => docs.get(id)!.segments;
const kinds = <K extends VfxScriptSegment["kind"]>(id: typeof IDS[number], kind: K) =>
  segs(id).filter((s): s is Extract<VfxScriptSegment, { kind: K }> => s.kind === kind);

describe("八招 VFX Forge 視覺文法", () => {
  it("八份都是可由編輯器往返的 vfx-script@1，且一招不少", () => {
    expect([...docs.keys()]).toEqual(IDS);
    for (const id of IDS) expect(docs.get(id)!.abilityId).toBe(id);
  });

  it("腳本 modelFx 不與 ability 已有模型重複疊畫", () => {
    for (const id of IDS) {
      const abilityModels = collectAbilityModelKeys(loadJson("abilities", id));
      const duplicates = kinds(id, "modelFx")
        .map((segment) => segment.modelKey)
        .filter((modelKey) => abilityModels.has(modelKey));
      expect(duplicates, `${id} 同一具模型被 ability 與 script 畫了兩次`).toEqual([]);
    }
  });

  it("八招共用光束／斬痕資源不以大量 additive 粒子洗白畫面", () => {
    const caps = new Map([
      ["fx.prim.holy.beam-flat", 8],
      ["fx.prim.lightning.beam-flat", 8],
      ["fx.prim.holy.slash-lg", 6],
      ["fx.prim.lightning.slash", 6],
      ["fx.fam.light-column.holy.s150", 8],
      ["fx.fam.light-column.w3x-00ffff.s150", 8],
      ["fx.forge.beam.fire", 48],
      ["fx.forge.beam.blue", 48],
    ]);
    for (const [id, cap] of caps) {
      const vfx = loadJson("vfx", id);
      expect(vfx.blendMode, id).toBe("additive");
      expect(Number(vfx.burstCount), id).toBeGreaterThan(0);
      expect(Number(vfx.burstCount), id).toBeLessThanOrEqual(cap);
    }
  });

  it("龍破斬先飛行，飛行結束後才在遠端爆炸", () => {
    const moving = kinds("godie-hjai.e", "modelFx").find((s) => s.kind === "modelFx" && s.path === "toTarget");
    expect(moving).toBeDefined();
    expect(moving?.trailVfxId).toBeTruthy();
    const remote = kinds("godie-hjai.e", "vfx").filter((s) => s.kind === "vfx" && s.at === "target");
    expect(remote.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...remote.map((s) => s.atMs ?? 0))).toBeGreaterThanOrEqual((moving?.lifeSec ?? 0) * 900);
  });

  it.each(["godie-hjai.r", "godie-nbbc.r", "godie-hvsh.r"] as const)(
    "%s 保留隱藏本體、衝向目標、落點收刀三段",
    (id) => {
      expect(kinds(id, "hideBody")).toHaveLength(1);
      expect(kinds(id, "modelFx").some((s) => s.kind === "modelFx" && s.path === "toTarget" && (s.speed ?? 0) > 0)).toBe(true);
      expect(kinds(id, "vfx").some((s) => s.kind === "vfx" && s.at === "target")).toBe(true);
    },
  );

  it.each(["godie-nbbc.e", "godie-ogrh.r", "godie-hvsh.r"] as const)(
    "%s 是持續、雙層、可辨色的橫向氣功砲",
    (id) => {
      const beams = kinds(id, "vfx").filter((s) => s.kind === "vfx" && s.vfxId.includes("beam"));
      expect(beams.length).toBeGreaterThanOrEqual(2);
      expect(beams.every((s) => (s.durationSec ?? 0) >= 0.8)).toBe(true);
      expect(new Set(beams.map((s) => JSON.stringify(s.tint))).size).toBeGreaterThanOrEqual(2);
      for (const beam of beams) {
        const resource = loadJson("vfx", beam.vfxId);
        expect(resource.orient, `${beam.vfxId} 必須隨瞄準方向旋轉`).toEqual({ yawFrom: "aim" });
      }
    },
  );

  it("超究武神霸斬與理想鄉都有逐刀動畫和第七刀終結技", () => {
    for (const id of ["godie-hart.r", "godie-e002.ex"] as const) {
      expect(kinds(id, "anim").some((s) => s.kind === "anim" && s.on === "strike")).toBe(true);
      expect(segs(id).filter((s) => s.on === "strike" && s.strikeIndex === 7).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("理想鄉 EX 只能由反彈成功起手，不可偽裝成主動施法", () => {
    const avalon = segs("godie-e002.ex");
    expect(avalon.some((s) => s.on === "reflectSuccess")).toBe(true);
    expect(avalon.some((s) => s.on === "castStart" || s.on === "castEffect")).toBe(false);
  });
});

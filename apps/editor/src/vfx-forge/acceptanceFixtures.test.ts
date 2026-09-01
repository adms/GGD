/**
 * Owner capability guard for the eight Editor-only VFX Forge fixtures.
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
import { acceptanceFixtureFor, VFX_FORGE_ACCEPTANCE } from "./acceptanceFixtures";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const IDS = VFX_FORGE_ACCEPTANCE.map(([id]) => id);

function load(id: string): VfxScriptDoc {
  return zVfxScriptDoc.parse(acceptanceFixtureFor(id));
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

describe("八招 Editor-only VFX Forge 視覺文法", () => {
  it("八份 fixture 都是可由編輯器往返的 vfx-script@1，且一招不少", () => {
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
    const travel = kinds("godie-hjai.e", "vfx").filter(
      (s) => s.kind === "vfx" && s.vfxId === "fx.prim.fire.bolt",
    );
    expect(travel.length).toBeGreaterThanOrEqual(7);
    expect(Math.max(...travel.map((s) => s.offsetForwardU ?? 0))).toBeGreaterThanOrEqual(6);
    expect(Math.max(...travel.map((s) => s.atMs ?? 0))).toBeGreaterThanOrEqual(1000);
    // RedDragonMissile and imported.bahamut both failed the real compositor:
    // one exposed a card and the other polluted the scene with white geometry.
    expect(segs("godie-hjai.e").some((s) => s.kind === "modelFx" && s.modelKey === "w3x.stock.reddragonmissile")).toBe(false);
    expect(segs("godie-hjai.e").some((s) => s.kind === "modelFx" && s.modelKey === "imported.bahamut")).toBe(false);
    const remote = kinds("godie-hjai.e", "vfx").filter(
      (s) => s.kind === "vfx" && s.at === "self" && (s.offsetForwardU ?? 0) >= 6 && s.vfxId !== "fx.prim.fire.bolt",
    );
    expect(remote.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...remote.map((s) => s.atMs ?? 0))).toBeGreaterThanOrEqual(1150);
  });

  it("神滅斬保留隱藏本體、衝向目標、落點收刀三段", () => {
    expect(kinds("godie-hjai.r", "hideBody")).toHaveLength(1);
    expect(kinds("godie-hjai.r", "modelFx").some((s) => s.kind === "modelFx" && s.path === "toTarget" && (s.speed ?? 0) > 0)).toBe(true);
    expect(kinds("godie-hjai.r", "vfx").some((s) => s.kind === "vfx" && s.at === "target")).toBe(true);
  });

  it("阿邦快速劍X 用真小呆本體做 B 式衝刺，不用會變白的替身", () => {
    expect(kinds("godie-nbbc.r", "hideBody")).toHaveLength(0);
    expect(kinds("godie-nbbc.r", "modelFx")).toHaveLength(0);
    expect(kinds("godie-nbbc.r", "bodyMove").some((segment) => segment.mode === "teleport" && segment.offset.z >= 3)).toBe(true);
    expect(kinds("godie-nbbc.r", "anim").some((segment) => segment.on === "castEffect" && segment.at === "caster")).toBe(true);
  });

  it("騎英之手綱用真 Rider 本體做可見的突進，不靠白色模型替身", () => {
    expect(kinds("godie-hvsh.r", "hideBody")).toHaveLength(0);
    expect(kinds("godie-hvsh.r", "bodyMove").some((segment) => segment.mode === "arc" && segment.offset.z >= 3)).toBe(true);
    expect(kinds("godie-hvsh.r", "anim").some((segment) => segment.on === "castEffect" && segment.at === "caster")).toBe(true);
  });

  it.each(["godie-nbbc.e", "godie-ogrh.r", "godie-hvsh.r"] as const)(
    "%s 是持續、雙層、可辨色的橫向氣功砲",
    (id) => {
      const modelKeys = collectAbilityModelKeys(loadJson("abilities", id));
      for (const segment of kinds(id, "modelFx")) modelKeys.add(segment.modelKey);
      expect(modelKeys.has("w3x.stock.revivehuman"), `${id} 必須用 90° 橫放 MDL 當主體`).toBe(true);
      const beams = kinds(id, "vfx").filter((s) => s.kind === "vfx" && s.vfxId.includes("beam"));
      expect(beams.length).toBeGreaterThanOrEqual(8);
      expect(beams.every((s) => (s.durationSec ?? 0) >= 0.5)).toBe(true);
      const starts = [...new Set(beams.map((s) => s.atMs ?? 0))];
      expect(Math.max(...starts) - Math.min(...starts), `${id} 不可退回單幀光束`).toBeGreaterThanOrEqual(700);
      expect(new Set(beams.map((s) => JSON.stringify(s.tint))).size).toBeGreaterThanOrEqual(2);
      for (const beam of beams) {
        const resource = loadJson("vfx", beam.vfxId);
        expect(resource.orient, `${beam.vfxId} 必須橫放並隨瞄準方向旋轉`).toMatchObject({
          yawFrom: "aim",
          pitchDeg: 0,
        });
      }
    },
  );

  it("超究武神霸斬與理想鄉都有逐刀動畫和第七刀終結技", () => {
    for (const id of ["godie-hart.r", "godie-e002.ex"] as const) {
      expect(kinds(id, "anim").some((s) => s.kind === "anim" && s.on === "strike")).toBe(true);
      expect(segs(id).filter((s) => s.on === "strike" && s.strikeIndex === 7).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("理想鄉終結砲保留 ReviveHuman MDL 主體，黃藍粒子只做輔助", () => {
    const core = kinds("godie-e002.ex", "modelFx").find(
      (segment) => segment.strikeIndex === 7 && segment.modelKey === "w3x.stock.revivehuman",
    );
    expect(core).toBeDefined();
    expect(core?.scaleAxis?.[2]).toBeGreaterThan(core?.scaleAxis?.[0] ?? Number.POSITIVE_INFINITY);
    expect(kinds("godie-e002.ex", "vfx").filter((segment) => segment.strikeIndex === 7 && segment.vfxId.includes("beam")).length).toBeGreaterThanOrEqual(2);
  });

  it("理想鄉 EX 只能由反彈成功起手，不可偽裝成主動施法", () => {
    const avalon = segs("godie-e002.ex");
    expect(avalon.some((s) => s.on === "reflectSuccess")).toBe(true);
    expect(avalon.some((s) => s.on === "castStart" || s.on === "castEffect")).toBe(false);
  });
});

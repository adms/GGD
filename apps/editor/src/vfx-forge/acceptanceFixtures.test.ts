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
import {
  acceptanceFixtureFor,
  acceptanceFixtureVisualGaps,
  VFX_FORGE_ACCEPTANCE,
  VFX_FORGE_FIXTURE_SCENES,
} from "./acceptanceFixtures";
import { actionAnimationIssues, activationModeForAbility } from "./actionAnimationPrinciples";
import { isSingleArcVfxId } from "./presentationContract";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const IDS = VFX_FORGE_ACCEPTANCE.map(([id]) => id);

function load(id: string): VfxScriptDoc {
  return zVfxScriptDoc.parse(acceptanceFixtureFor(id));
}

function loadJson(collection: string, id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(CONTENT, collection, `${id}.json`), "utf8")) as Record<string, unknown>;
}

function abilityContainsEffect(value: unknown, kind: string): boolean {
  if (Array.isArray(value)) return value.some((child) => abilityContainsEffect(child, kind));
  if (value === null || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return rec.kind === kind || Object.values(rec).some((child) => abilityContainsEffect(child, kind));
}

const docs = new Map(IDS.map((id) => [id, load(id)]));
const segs = (id: typeof IDS[number]): readonly VfxScriptSegment[] => docs.get(id)!.segments;
const kinds = <K extends VfxScriptSegment["kind"]>(id: typeof IDS[number], kind: K) =>
  segs(id).filter((s): s is Extract<VfxScriptSegment, { kind: K }> => s.kind === kind);

describe("八招 Editor-only VFX Forge 視覺文法", () => {
  it("把已由真 framebuffer 證實的連續光束缺口附在所有共用該配方的驗收技能", () => {
    const affected = [
      "godie-hart.r", "godie-nbbc.e", "godie-ogrh.r", "godie-o00x.r",
      "godie-hvsh.r", "godie-e002.ex", "godie-e00l.ex",
    ];
    for (const id of affected) {
      expect(acceptanceFixtureVisualGaps(id), id).toEqual([
        expect.stringContaining("連續實心光束積木"),
      ]);
    }
    expect(acceptanceFixtureVisualGaps("godie-hjai.e")).toEqual([]);
  });

  it("Main 嚴格八主題展開的十一份文件都有 Editor 積木成品", () => {
    expect(VFX_FORGE_FIXTURE_SCENES).toHaveLength(15);
    for (const [id] of VFX_FORGE_FIXTURE_SCENES) {
      expect(acceptanceFixtureFor(id), id).not.toBeNull();
    }
  });
  it("批次驗收隔離八招 fixture，不把既有 runtime 美術疊在玩家積木成品下方", () => {
    const page = readFileSync(new URL("./VfxForgePage.tsx", import.meta.url), "utf8");
    const proofAutomation = readFileSync(new URL("./proofAutomation.ts", import.meta.url), "utf8");
    expect(page).toContain("const route = basicVisualProofRoute(ability.id, fixture, basic);");
    expect(page).toContain("acceptanceFixtureVisualGaps(row.id)");
    expect(page).toContain("captureDiagnosticEvidenceAt");
    expect(page).toContain('issueClassifier: "ggd-editor-visual-issue-rules@1"');
    expect(page).toContain('BASIC_VISUAL_REVIEW_STORAGE = "ggd-editor-basic-visual-human-review@1"');
    expect(page).toContain("stored.fingerprint !== basicVisualEvidenceFingerprint(result.frames)");
    expect(page).toContain("↻ 只重跑技術失敗");
    expect(page).toContain("↻ 只重跑未通過");
    expect(page).toContain("↻ 重跑此項");
    expect(page).toContain("retryBasicVisualCases(new Set([row.id])");
    expect(page).toContain("寫入本機驗收器");
    expect(page).toContain('<details className="vfx-basic-batch" open>');
    expect(page).toContain("sendBasicVisualProofToLoopback");
    expect(page).toContain("proofSinkFromSearch");
    expect(proofAutomation).toContain('sink.protocol !== "http:"');
    expect(proofAutomation).toContain('sink.hostname !== "127.0.0.1" && sink.hostname !== "localhost"');
    expect(page).toContain('row.status === "failed" || row.humanVerdict === "fail"');
  });

  it("每招都符合角色動作／時間軸節點／單一主斬擊原則", () => {
    for (const id of IDS) {
      const ability = loadJson("abilities", id);
      expect(actionAnimationIssues(load(id), {
        activationMode: activationModeForAbility(ability),
        allowRapidBarrage: abilityContainsEffect(ability, "comboStrikes"),
      }), id).toEqual([]);
    }
  });

  it("載入真 SimWorld cue 時自動補齊不存在於靜態配方的攻擊與受擊動作", () => {
    const strikeCues = [{ on: "strike" as const, strikeIndex: 1 }];
    const dragon = acceptanceFixtureFor("godie-hjai.e", strikeCues)!;
    expect(actionAnimationIssues(dragon, {
      activationMode: "active",
      requiredTimelineCues: strikeCues,
    })).toEqual([]);

    const projectileCues = [{ on: "projectileHit" as const }];
    const beam = acceptanceFixtureFor("godie-nbbc.e", projectileCues)!;
    expect(actionAnimationIssues(beam, {
      activationMode: "active",
      requiredTimelineCues: projectileCues,
    })).toEqual([]);
  });

  it("斬擊成品只使用 Main 收據的單發 arc，不把 26 發 slash 當一刀", () => {
    const actionSkills = ["godie-hjai.r", "godie-nbbc.r", "godie-hart.r", "godie-e002.ex"] as const;
    for (const id of actionSkills) {
      const effects = kinds(id, "vfx");
      expect(effects.some((segment) => isSingleArcVfxId(segment.vfxId)), `${id} 缺單發主斬弧`).toBe(true);
      expect(effects.some((segment) => /^fx\.prim\.[a-z0-9-]+\.slash(?:-lg)?$/i.test(segment.vfxId)),
        `${id} 仍使用 26 發舊 slash`).toBe(false);
    }
  });
  it("八份 fixture 都是可由編輯器往返的 vfx-script@1，且一招不少", () => {
    expect([...docs.keys()]).toEqual(IDS);
    for (const id of IDS) expect(docs.get(id)!.abilityId).toBe(id);
  });

  it("每份腳本內的 modelFx 主體不重複；ability 同名演出由 replacement guard 取代", () => {
    for (const id of IDS) {
      const scriptModels = kinds(id, "modelFx").map((segment) => segment.modelKey);
      expect(new Set(scriptModels).size, `${id} 腳本自己重複放同一具模型`).toBe(scriptModels.length);
    }
  });

  it("經典光束從 runtime config 取得 additive／粒子實際上限，不抄 UI 常數", () => {
    const budget = loadJson("config", "vfx-budget");
    const additiveCap = Number(budget.maxConcurrentAdditive);
    const particleCap = Number(budget.maxParticlesPerSystem);
    expect(additiveCap).toBeGreaterThan(0);
    expect(particleCap).toBeGreaterThan(0);

    for (const id of ["godie-nbbc.e", "godie-ogrh.r", "godie-hvsh.r"] as const) {
      const helpers = kinds(id, "vfx");
      // The script replaces the unsafe ReviveHuman model, so only the six
      // transparent helper systems are live. If main retunes the budget, this
      // guard follows content/config/vfx-budget.json and turns red automatically.
      expect(helpers.length, id).toBeLessThanOrEqual(additiveCap);
      for (const helper of helpers) {
        const resource = loadJson("vfx", helper.vfxId);
        expect(resource.blendMode, helper.vfxId).toBe("additive");
        expect(Number(resource.burstCount), helper.vfxId).toBeGreaterThan(0);
        expect(Number(resource.burstCount), helper.vfxId).toBeLessThanOrEqual(particleCap);
      }
    }
  });

  it("龍破斬先飛行，飛行結束後才在遠端爆炸", () => {
    const travel = kinds("godie-hjai.e", "vfx").filter((s) => s.vfxId === "fx.prim.fire.bolt");
    expect(travel).toHaveLength(6);
    expect(travel.map((s) => s.offsetForwardU)).toEqual([1.2, 3.2, 5.2, 7.2, 9.2, 11.2]);
    expect(Math.max(...travel.map((s) => s.atMs ?? 0))).toBeLessThan(500);
    // Every available model carrier failed the real compositor at some frame;
    // the accepted form is assembled entirely from safe additive primitives.
    expect(kinds("godie-hjai.e", "modelFx")).toHaveLength(0);
    expect(segs("godie-hjai.e").some((s) => s.kind === "modelFx" && s.modelKey === "w3x.stock.reddragonmissile")).toBe(false);
    expect(segs("godie-hjai.e").some((s) => s.kind === "modelFx" && s.modelKey === "w3x.stock.phoenixmissile")).toBe(false);
    expect(segs("godie-hjai.e").some((s) => s.kind === "modelFx" && s.modelKey === "imported.fireblast")).toBe(false);
    expect(segs("godie-hjai.e").some((s) => s.kind === "modelFx" && s.modelKey === "imported.bahamut")).toBe(false);
    const remote = kinds("godie-hjai.e", "vfx").filter(
      (s) => s.at === "self" && (s.offsetForwardU ?? 0) >= 12,
    );
    // One volumetric burst is the endpoint body.  Do not require a second
    // radial ring: in the real camera that family expands into an arena-sized
    // flat circle and weakens the otherwise readable explosion.
    expect(remote).toHaveLength(1);
    expect(Math.min(...remote.map((s) => s.atMs ?? 0))).toBeGreaterThanOrEqual(500);
    expect(remote).toContainEqual(expect.objectContaining({
      vfxId: "fx.prim.fire.explosion-lg",
      w3xScale: 2.2,
    }));
  });

  it("神滅斬驅動真正施法者穿越目標，不生成有底板風險的莉娜分身", () => {
    const raw = JSON.parse(readFileSync(join(
      dirname(fileURLToPath(import.meta.url)),
      "acceptance-fixtures/godie-hjai.r.json",
    ), "utf8")) as VfxScriptDoc;
    expect(raw.segments.filter((segment) => segment.kind === "hideBody")).toHaveLength(0);
    expect(raw.segments.filter((segment) => segment.kind === "modelFx")).toHaveLength(0);
    expect(kinds("godie-hjai.r", "hideBody")).toHaveLength(0);
    expect(kinds("godie-hjai.r", "modelFx")).toHaveLength(0);
    expect(kinds("godie-hjai.r", "bodyMove")).toContainEqual(expect.objectContaining({
      at: "caster", mode: "arc", offset: expect.objectContaining({ z: 4.5 }), durationMs: 560,
    }));
    expect(kinds("godie-hjai.r", "anim")).toContainEqual(expect.objectContaining({
      on: "castEffect", at: "caster", pulse: "attack",
    }));
    expect(kinds("godie-hjai.r", "vfx").some((s) => s.kind === "vfx" && s.at === "target")).toBe(true);
  });

  it("阿邦快速劍X 朝目標放 A 式衝擊波，B 式不重複 ability 已有的真實 blink", () => {
    expect(abilityContainsEffect(loadJson("abilities", "godie-nbbc.r"), "blink")).toBe(true);
    expect(kinds("godie-nbbc.r", "hideBody")).toHaveLength(0);
    expect(kinds("godie-nbbc.r", "modelFx")).toHaveLength(0);
    expect(kinds("godie-nbbc.r", "vfx")).toContainEqual(expect.objectContaining({
      vfxId: "fx.prim.lightning.beam-flat",
    }));
    expect(kinds("godie-nbbc.r", "vfx").some((segment) =>
      segment.vfxId === "fx.prim.lightning.beam-flat" && segment.facingDeg !== undefined,
    )).toBe(false);
    expect(kinds("godie-nbbc.r", "bodyMove")).toHaveLength(0);
    expect(kinds("godie-nbbc.r", "anim")).toContainEqual(expect.objectContaining({
      on: "castEffect", atMs: 330, at: "caster", pulse: "attack",
    }));
    expect(kinds("godie-nbbc.r", "anim").some((segment) => segment.on === "castEffect" && segment.at === "target")).toBe(true);
  });

  it("騎英之手綱用真 Rider 本體做可見的突進，不靠白色模型替身", () => {
    expect(kinds("godie-hvsh.r", "hideBody")).toHaveLength(0);
    expect(kinds("godie-hvsh.r", "bodyMove").some((segment) => segment.mode === "arc" && segment.offset.z >= 3)).toBe(true);
    expect(kinds("godie-hvsh.r", "anim").some((segment) => segment.on === "castEffect" && segment.at === "caster")).toBe(true);
  });

  it.each(["godie-nbbc.e", "godie-ogrh.r", "godie-hvsh.r"] as const)(
    "%s 是持續、雙層、可辨色的橫向氣功砲",
    (id) => {
      expect(kinds(id, "modelFx").some((segment) => segment.modelKey === "w3x.stock.revivehuman"),
        `${id} 的 script 不可再引入實測會露出白卡的 ReviveHuman MDL`).toBe(false);
      const beams = kinds(id, "vfx").filter((s) => s.kind === "vfx" && s.vfxId.includes("beam"));
      expect(beams).toHaveLength(4);
      expect(beams.every((s) => (s.durationSec ?? 0) >= 0.5)).toBe(true);
      const starts = [...new Set(beams.map((s) => s.atMs ?? 0))];
      expect(Math.max(...starts) - Math.min(...starts), `${id} 不可退回單幀光束`).toBeGreaterThanOrEqual(400);
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

  it.each(["godie-nbbc.e", "godie-ogrh.r"] as const)(
    "%s 的光束配方不重複播放同一個施法動作",
    (id) => {
      const opening = kinds(id, "anim").filter((segment) =>
        segment.on === "castStart" && segment.at === "caster",
      );
      expect(opening).toHaveLength(1);
    },
  );

  it("超究武神霸斬與理想鄉都有逐刀動畫和第七刀終結技", () => {
    for (const id of ["godie-hart.r", "godie-e002.ex"] as const) {
      expect(kinds(id, "anim").some((s) => s.kind === "anim" && s.on === "strike")).toBe(true);
      expect(segs(id).filter((s) => s.on === "strike" && s.strikeIndex === 7).length).toBeGreaterThanOrEqual(2);
    }
    const avalonFinal = kinds("godie-e002.ex", "vfx").filter((segment) =>
      segment.on === "strike" && segment.strikeIndex === 7 && segment.vfxId.includes("beam"),
    );
    expect(avalonFinal.some((segment) => (segment.tint?.[2] ?? 0) > (segment.tint?.[0] ?? 0) &&
      (segment.alpha ?? 0) >= 0.37 && (segment.offsetSideU ?? 0) > 0)).toBe(true);
    expect(avalonFinal.some((segment) => (segment.tint?.[0] ?? 0) > (segment.tint?.[2] ?? 0) &&
      (segment.offsetSideU ?? 0) < 0)).toBe(true);
  });

  it("超究武神霸斬第七刀保留黃藍雙柱，但不得回到遮住角色的過曝尺寸", () => {
    const columns = kinds("godie-hart.r", "vfx").filter(
      (segment) => segment.strikeIndex === 7 && segment.vfxId.endsWith("beam-lg"),
    );
    expect(columns).toHaveLength(2);
    expect(new Set(columns.map((segment) => JSON.stringify(segment.tint))).size).toBe(2);
    expect(Math.max(...columns.map((segment) => segment.w3xScale ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.max(...columns.map((segment) => segment.alpha ?? 1))).toBeLessThanOrEqual(0.32);
    expect(Math.min(...columns.map((segment) => Math.abs(segment.offsetForwardU ?? 0)))).toBeGreaterThanOrEqual(0.3);
  });

  it("理想鄉終結砲不使用白卡 MDL，黃藍長軸粒子仍保留", () => {
    expect(kinds("godie-e002.ex", "modelFx").some(
      (segment) => segment.strikeIndex === 7 && segment.modelKey === "w3x.stock.revivehuman",
    )).toBe(false);
    expect(kinds("godie-e002.ex", "vfx").filter((segment) => segment.strikeIndex === 7 && segment.vfxId.includes("beam")).length).toBeGreaterThanOrEqual(2);
  });

  it("理想鄉 EX 只能由反彈成功起手，不可偽裝成主動施法", () => {
    const avalon = segs("godie-e002.ex");
    expect(avalon.some((s) => s.on === "reflectSuccess")).toBe(true);
    expect(avalon.some((s) => s.on === "castStart" || s.on === "castEffect")).toBe(false);
  });
});

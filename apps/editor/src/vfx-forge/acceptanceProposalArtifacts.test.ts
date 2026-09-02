/**
 * Durable guard for the exact eight candidates shown to the human reviewer.
 * Fixture tests alone are insufficient: a stale proposal can still contain an
 * old trigger or screenshot after the source recipe has been fixed.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashDoc } from "@ggd/shared/content";
import { zVfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { VFX_FORGE_ACCEPTANCE } from "./acceptanceFixtures";
import {
  actionAnimationIssues,
  activationModeForAbility,
  hasAuthoritativeRapidMultiStrike,
} from "./actionAnimationPrinciples";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const PROPOSALS = join(REPO, "docs/_review/ai-proposals");
const REPORTS = join(REPO, "docs/_reports");

interface Proposal {
  schema: string;
  target: { collection: string; id: string };
  purpose: string;
  promotable: boolean;
  evidence: string[];
  visualEvidence: {
    dataUrl: string;
    atMs: number;
    view: string;
    frameAudit?: { unsafe: boolean };
  }[];
  visualAudit: {
    schema: string;
    safe: boolean;
    autoVisualScore: number;
    sampledFrames: number;
    peakParticleCount: number;
    peakSystemCount: number;
    worstAtMs: number;
    worst: { unsafe: boolean; diagnosticCheckerShare?: number };
  };
  autoVisualScore?: number;
  candidate: unknown;
  candidateHash: string;
  reviewHash: string;
  summary: string;
  baseHash: string | null;
}

function reviewHash(item: Proposal): string {
  return hashDoc({
    target: item.target,
    purpose: item.purpose,
    summary: item.summary,
    evidence: item.evidence,
    visualEvidence: item.visualEvidence,
    visualAudit: item.visualAudit ?? null,
    autoVisualScore: item.autoVisualScore ?? null,
    candidateHash: item.candidateHash,
    baseHash: item.baseHash,
  });
}

function proposal(id: string): Proposal {
  return JSON.parse(readFileSync(join(PROPOSALS, `vfx-scripts--${id}.json`), "utf8")) as Proposal;
}

function ability(id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO, "content/abilities", `${id}.json`), "utf8")) as Record<string, unknown>;
}

function currentScriptHash(id: string): string | null {
  const file = join(REPO, "content/vfx-scripts", `${id}.json`);
  return existsSync(file)
    ? hashDoc(JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>)
    : null;
}

describe("八招實際送審產物", () => {
  it("候選 hash、角色動作、兩張 framebuffer 與永久不可 Promote 的隔離全部對得上", () => {
    for (const [id] of VFX_FORGE_ACCEPTANCE) {
      const item = proposal(id);
      const candidate = zVfxScriptDoc.parse(item.candidate);
      const abilityDoc = ability(id);
      expect(item, id).toMatchObject({
        schema: "ggd-ai-change-proposal@1",
        target: { collection: "vfx-scripts", id },
        purpose: "editor-capability-fixture",
        promotable: false,
      });
      expect(item.candidateHash, id).toBe(hashDoc(candidate));
      expect(item.reviewHash, id).toBe(reviewHash(item));
      expect(item.baseHash, `${id} 的送審 Base 必須等於目前 Main 腳本；不存在時明確為 null`)
        .toBe(currentScriptHash(id));
      expect(item.visualEvidence.length, id).toBeGreaterThanOrEqual(2);
      expect(item.visualEvidence.every((frame) =>
        /^data:image\/(?:png|webp);base64,/.test(frame.dataUrl) &&
        frame.atMs >= 0 && (frame.view === "side" || frame.view === "top"),
      ), id).toBe(true);
      expect(["ggd-vfx-visual-audit@1", "ggd-vfx-visual-audit@2", "ggd-vfx-visual-audit@3"], id)
        .toContain(item.visualAudit.schema);
      expect(item.visualAudit, id).toMatchObject({ safe: true, worst: { unsafe: false } });
      // @1／@2，或缺少逐張 frameAudit 的 @3，都是這批畫面揭露的
      // 假陰性。保留畫面作失敗證據，但不得被測試誤叫成 current／
      // passable。修正 Main 素材後必須由 UI 以完整 @3 重新提交，屆時
      // 這條斷言也應連同報告一起升級。
      expect(
        item.visualAudit.schema === "ggd-vfx-visual-audit@3" &&
        item.visualEvidence.every((frame) => frame.frameAudit?.unsafe === false),
        id,
      ).toBe(false);
      expect(item.visualAudit.sampledFrames, id).toBeGreaterThan(0);
      expect(item.visualAudit.peakParticleCount, id).toBeGreaterThanOrEqual(0);
      expect(item.visualAudit.peakSystemCount, id).toBeGreaterThanOrEqual(0);
      expect(item.autoVisualScore, id).toBe(item.visualAudit.autoVisualScore);
      expect(item.evidence, id).toContain(`editor-from-blank:${id}`);
      expect(item.evidence, id).toContain("preview-target:godie-e001");
      expect(actionAnimationIssues(candidate, {
        activationMode: activationModeForAbility(abilityDoc),
        allowRapidBarrage: hasAuthoritativeRapidMultiStrike(abilityDoc),
      }), id).toEqual([]);
      expect(candidate.segments.some((segment) =>
        segment.kind === "modelFx" && segment.modelKey === "w3x.stock.revivehuman",
      ), id).toBe(false);
    }
  });

  it("純被動理想鄉只從真正反彈／逐段事件演出，不殘留假施法", () => {
    const candidate = zVfxScriptDoc.parse(proposal("godie-e002.ex").candidate);
    expect(candidate.segments.some((segment) => segment.on === "reflectSuccess")).toBe(true);
    expect(candidate.segments.some((segment) =>
      segment.on === "castStart" || segment.on === "castEffect",
    )).toBe(false);
  });

  it("最新可讀報告逐一引用同一個候選 hash 與實際 PNG", () => {
    const reportDirs = readdirSync(REPORTS)
      .filter((name) => name.startsWith("vfx_forge_8_ability_visual-proof_"))
      .sort()
      .reverse();
    const latest = reportDirs.find((name) => existsSync(join(REPORTS, name, "manifest.json")));
    expect(latest).toBeDefined();
    const root = join(REPORTS, latest!);
    const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as {
      schema: string;
      promotable: boolean;
      cases: { id: string; candidateHash: string; auditCurrent: boolean; frames: { filename: string }[] }[];
    };
    expect(manifest.schema).toBe("ggd-vfx-forge-acceptance-proof@3");
    expect(manifest.promotable).toBe(false);
    expect(manifest.cases.map((entry) => entry.id)).toEqual(VFX_FORGE_ACCEPTANCE.map(([id]) => id));
    for (const entry of manifest.cases) {
      expect(entry.candidateHash, entry.id).toBe(proposal(entry.id).candidateHash);
      expect(entry.auditCurrent, entry.id).toBe(false);
      expect(entry.frames.length, entry.id).toBeGreaterThanOrEqual(2);
      for (const frame of entry.frames) {
        const file = join(root, frame.filename);
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size, file).toBeGreaterThan(0);
      }
    }
  });
});

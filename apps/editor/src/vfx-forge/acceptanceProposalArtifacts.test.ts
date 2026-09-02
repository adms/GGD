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
  visualEvidence: { dataUrl: string; atMs: number; view: string }[];
  candidate: unknown;
  candidateHash: string;
}

function proposal(id: string): Proposal {
  return JSON.parse(readFileSync(join(PROPOSALS, `vfx-scripts--${id}.json`), "utf8")) as Proposal;
}

function ability(id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO, "content/abilities", `${id}.json`), "utf8")) as Record<string, unknown>;
}

describe("八招實際送審產物", () => {
  it("候選 hash、角色動作守衛、兩張 framebuffer 與永久不可 Promote 全部對得上", () => {
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
      expect(item.visualEvidence.length, id).toBeGreaterThanOrEqual(2);
      expect(item.visualEvidence.every((frame) =>
        /^data:image\/(?:png|webp);base64,/.test(frame.dataUrl) &&
        frame.atMs >= 0 && (frame.view === "side" || frame.view === "top"),
      ), id).toBe(true);
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
      promotable: boolean;
      cases: { id: string; candidateHash: string; frames: { filename: string }[] }[];
    };
    expect(manifest.promotable).toBe(false);
    expect(manifest.cases.map((entry) => entry.id)).toEqual(VFX_FORGE_ACCEPTANCE.map(([id]) => id));
    for (const entry of manifest.cases) {
      expect(entry.candidateHash, entry.id).toBe(proposal(entry.id).candidateHash);
      expect(entry.frames.length, entry.id).toBeGreaterThanOrEqual(2);
      for (const frame of entry.frames) {
        const file = join(root, frame.filename);
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size, file).toBeGreaterThan(0);
      }
    }
  });
});

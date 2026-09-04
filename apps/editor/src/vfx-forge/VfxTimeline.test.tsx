import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VFX_FORGE_SEGMENT_KINDS } from "./model";
import {
  SEGMENT_KIND_LABEL,
  segmentTrackSummary,
  segmentTriggerSummary,
  VfxTimeline,
} from "./VfxTimeline";

describe("VFX Forge timeline authoring surface", () => {
  it("renders an add control for every schema-valid visual segment kind", () => {
    const markup = renderToStaticMarkup(
      <VfxTimeline
        script={{
          id: "ability.test",
          schema: "vfx-script@1",
          abilityId: "ability.test",
          segments: [{ kind: "floatingText", on: "castStart", text: "test" }],
        }}
        cues={[]}
        durationMs={1000}
        playheadMs={0}
        playing={false}
        selected={0}
        onSelect={vi.fn()}
        onSeek={vi.fn()}
        onTogglePlay={vi.fn()}
        onRestart={vi.fn()}
        onStep={vi.fn()}
        onAddKind={vi.fn()}
        onDropAsset={vi.fn()}
      />,
    );
    for (const kind of VFX_FORGE_SEGMENT_KINDS) {
      expect(markup, `時間軸缺少 ${kind} 積木`).toContain(`data-kind="${kind}"`);
      expect(markup, `時間軸缺少 ${kind} 中文名稱`).toContain(`+ ${SEGMENT_KIND_LABEL[kind]}`);
    }
  });

  it("names actor tracks by role and action instead of two identical anim rows", () => {
    expect(segmentTrackSummary({
      kind: "anim", on: "strike", at: "caster", pulse: "attack",
    })).toBe("角色動作 · 施法者攻擊");
    expect(segmentTrackSummary({
      kind: "anim", on: "strike", at: "target", pulse: "hurt",
    })).toBe("角色動作 · 目標受擊");

    const markup = renderToStaticMarkup(
      <VfxTimeline
        script={{
          id: "ability.combo",
          schema: "vfx-script@1",
          abilityId: "ability.combo",
          segments: [
            { kind: "anim", on: "strike", at: "caster", pulse: "attack" },
            { kind: "anim", on: "strike", at: "target", pulse: "hurt" },
          ],
        }}
        cues={[{ on: "strike", atMs: 250, strikeIndex: 1, label: "第 1 段" }]}
        durationMs={1000}
        playheadMs={0}
        playing={false}
        selected={0}
        onSelect={vi.fn()}
        onSeek={vi.fn()}
        onTogglePlay={vi.fn()}
        onRestart={vi.fn()}
        onStep={vi.fn()}
        onAddKind={vi.fn()}
        onDropAsset={vi.fn()}
      />,
    );
    expect(markup).toContain("角色動作 · 施法者攻擊");
    expect(markup).toContain("角色動作 · 目標受擊");
    expect(markup).toContain("每段傷害 · +0ms");
    expect(markup).toContain("title=\"第 1 段 · anim\"");
    expect(markup).not.toContain("strike #1");
  });

  it("translates every authoring trigger without hiding its timing semantics", () => {
    expect(segmentTriggerSummary({
      kind: "anim", on: "castStart", at: "caster", pulse: "cast",
    })).toBe("施法起手");
    expect(segmentTriggerSummary({
      kind: "anim", on: "strike", at: "caster", pulse: "attack",
    })).toBe("每段傷害");
    expect(segmentTriggerSummary({
      kind: "anim", on: "projectileHit", at: "target", pulse: "hurt",
    })).toBe("投射物命中");
  });
});

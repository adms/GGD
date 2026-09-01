import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VFX_FORGE_SEGMENT_KINDS } from "./model";
import { VfxTimeline } from "./VfxTimeline";

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
      expect(markup, `時間軸缺少 + ${kind}`).toContain(`+ ${kind}`);
    }
  });
});

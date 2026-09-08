import { createElement } from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { mount } from "@ggd/shared/testkit/headlessUi";
import { HERO_SLOTS, zHeroProject } from "@ggd/shared/content";
import { refineAzazelProject } from "@ggd/shared/content/heroForge/communityRefinements/azazel";
import { HeroSourceDesignPanel } from "./HeroSourceDesignPanel";

const project = refineAzazelProject(zHeroProject.parse(JSON.parse(readFileSync(new URL("../../../../packages/shared/testkit/fixtures/azazel-handoff.json", import.meta.url), "utf8"))));

describe("fixed source-design review", () => {
  for (const slot of HERO_SLOTS) it(`shows the complete original ${slot} and its remaining requirements without enabling edits`, () => {
    const change = vi.fn();
    const before = structuredClone(project);
    const ui = mount(createElement(HeroSourceDesignPanel, { project, slot, readOnly: true, onSlot: vi.fn(), onChange: change }));
    const rendered = ui.text();
    const source = project.sourceDesign!;
    expect(rendered).toContain(source.ownerText);
    expect(rendered).toContain(source.reviewText);
    expect(rendered).toContain(source.slots[slot].ownerDescription);
    expect(rendered).toContain(source.slots[slot].baselineBehavior);
    expect(rendered).toContain(source.slots[slot].requiredRefinement);
    expect(rendered).toContain(project.refinementNotes![slot]);
    expect(ui.hosts().filter(node => node.type === "textarea" || node.type === "input")).toHaveLength(0);
    expect(change).not.toHaveBeenCalled();
    expect(project).toEqual(before);
  });
  it("keeps author notes editable outside fixed review while preserving source text", () => {
    const change = vi.fn();
    const ui = mount(createElement(HeroSourceDesignPanel, { project, slot: "EX", onSlot: vi.fn(), onChange: change }));
    ui.enter(ui.hosts().find(node => node.type === "textarea")!, "反轉增益已測，原作動作待驗。");
    const updated = change.mock.calls[0]![0];
    expect(updated.refinementNotes.EX).toBe("反轉增益已測，原作動作待驗。");
    expect(updated.sourceDesign).toEqual(project.sourceDesign);
  });
});

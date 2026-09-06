import { createElement, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { mount } from "@ggd/shared/testkit/headlessUi";
import { heroPackageProject, shippedHeroCatalog } from "@ggd/shared/testkit/heroPackageFixture";
import { zHeroProject, type HeroProject, type TemplateDoc } from "@ggd/shared/content";
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("@ggd/shared/testkit/headlessUi")).hookImpls }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { entries: [{ id: "root" }] } }) }));
import { HeroSlotEditor } from "./HeroSlotEditor";

describe("hero product condition editing", () => {
  it("edits the second repeated product through the real condition controls and reopens it losslessly", () => {
    const catalog = shippedHeroCatalog();
    const template = catalog.documents.get("ability-templates/tpl-on-attack") as TemplateDoc;
    let project = heroPackageProject(catalog);
    project.acceptedPlan!.slots.PASSIVE.products = ["first", "second"].map((instanceId) => ({ instanceId, template: { ref: template.id, inheritDefaults: true, params: {} } }));
    function Host() {
      const [value, setValue] = useState(project);
      return createElement(HeroSlotEditor, { project: value, slot: "PASSIVE", templates: [template], errors: {}, onChange(next: HeroProject) { project = next; setValue(next); } });
    }
    const form = mount(createElement(Host));
    expect(form.fieldOrNull("first.condition.g1.c1.chance")).not.toBeNull();
    expect(form.fieldOrNull("second.condition.g1.c1.chance")).not.toBeNull();
    const original = structuredClone(project.acceptedPlan!.slots.PASSIVE.products[0]);
    form.enter(form.field("second.condition.g1.c1.chance"), "7");
    expect(form.text()).toContain("7% 機率");
    expect(project.acceptedPlan!.slots.PASSIVE.products[0]).toEqual(original);
    const reopened = zHeroProject.parse(JSON.parse(JSON.stringify(project)));
    expect(reopened.acceptedPlan!.slots.PASSIVE.products[1]!.template.params.condition).toEqual(project.acceptedPlan!.slots.PASSIVE.products[1]!.template.params.condition);
    // The purpose textarea is intentional; a condition JSON textarea is not.
    expect(form.hosts().filter((node) => node.type === "textarea").some((node) => String(node.props.value).includes('"kind"'))).toBe(false);
  });
});

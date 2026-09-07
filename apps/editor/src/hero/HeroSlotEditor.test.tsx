import { createElement, useState } from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { mount, type HostNode, type RenderedNode } from "@ggd/shared/testkit/headlessUi";
import { heroPackageProject, shippedHeroCatalog } from "@ggd/shared/testkit/heroPackageFixture";
import { zHeroProject, type HeroProject, type TemplateDoc } from "@ggd/shared/content";
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("@ggd/shared/testkit/headlessUi")).hookImpls }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { entries: [{ id: "root" }] } }) }));
import { HeroSlotEditor } from "./HeroSlotEditor";
import { createCommunityHeroExample } from "@ggd/shared/content/heroForge/communityExamples";
import { compileHeroPackageProject } from "@ggd/shared/content/import/heroPackage";
import { refineAzazelProject } from "@ggd/shared/content/heroForge/communityRefinements/azazel";
import { defaultHeroPresentation } from "@ggd/shared/content/heroForge/presentation";

function descendants(nodes: readonly RenderedNode[]): HostNode[] {
  return nodes.flatMap((node) => typeof node === "string" ? [] : [node, ...descendants(node.children)]);
}

describe("hero product condition editing", () => {
  it("edits E's nested defensive direction and distance without JSON, then reopens and compiles", () => {
    const catalog = shippedHeroCatalog();
    const templates = [...catalog.documents.entries()].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
    const source = zHeroProject.parse(JSON.parse(readFileSync(new URL("../../../../packages/shared/testkit/fixtures/azazel-handoff.json", import.meta.url), "utf8")));
    let project = refineAzazelProject(source);
    project.presentation = defaultHeroPresentation();
    function Host() {
      const [value, setValue] = useState(project);
      return createElement(HeroSlotEditor, { project: value, slot: "E", templates, errors: {}, onChange(next: HeroProject) { project = next; setValue(next); } });
    }
    const form = mount(createElement(Host));
    const conditionPath = "acceptedPlan.slots.E.products.0.template.params.effects.0.hooks.0.condition";
    form.enter(form.field(`${conditionPath}.g0.c1.arcDegrees`), "90");
    form.enter(form.field(`${conditionPath}.g0.c0.value`), "2");
    expect(form.text()).toContain("90°");
    const reopened = zHeroProject.parse(JSON.parse(JSON.stringify(project)));
    const compiled = compileHeroPackageProject(reopened, catalog, false).compiled.abilityDrafts.E;
    expect(compiled.effects[0]).toMatchObject({ kind: "applyBuff", hooks: [{ condition: { all: [
      { kind: "distance", op: "<=", value: 2 }, { kind: "facing", subject: "self", arcDegrees: 90 },
    ] } }] });
    expect(reopened.sourceDesign).toEqual(source.sourceDesign);
    expect(form.hosts().some(node => node.type === "textarea" && String(node.props.value).includes('"facing"'))).toBe(false);
  });
  it("edits the nested curse-reversal reward with actual controls and recompiles the reopened project", () => {
    const catalog = shippedHeroCatalog();
    const templates = [...catalog.documents.entries()].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
    const source = zHeroProject.parse(JSON.parse(readFileSync(new URL("../../../../packages/shared/testkit/fixtures/azazel-handoff.json", import.meta.url), "utf8")));
    let project = refineAzazelProject(source);
    project.presentation = defaultHeroPresentation(); // No model-worker IO in this form test.
    function Host() {
      const [value, setValue] = useState(project);
      return createElement(HeroSlotEditor, { project: value, slot: "EX", templates, errors: {}, onChange(next: HeroProject) { project = next; setValue(next); } });
    }
    const form = mount(createElement(Host));
    const field = "acceptedPlan.slots.EX.products.0.template.params.effects.0.onConsumed.0.modifiers.0.value";
    form.enter(form.field(field), "0.12");
    const reopened = zHeroProject.parse(JSON.parse(JSON.stringify(project)));
    const compiled = compileHeroPackageProject(reopened, catalog, false).compiled.abilityDrafts.EX;
    const branch = compiled.effects[0];
    expect(branch?.kind).toBe("consumeStatus");
    if (branch?.kind !== "consumeStatus") throw new Error("Wrong branch");
    expect(branch.onConsumed[0]).toMatchObject({ kind: "applyBuff", modifiers: [{ stat: "ad", value: 0.12 }, { stat: "ap", value: 0.1 }] });
    expect(reopened.sourceDesign).toEqual(source.sourceDesign);
    expect(compiled.effects).toHaveLength(1);
  });
  it("protects formula-controlled AP coefficients by concrete path and follows the runtime config switch", () => {
    const catalog = shippedHeroCatalog();
    const templates = [...catalog.documents.entries()].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
    const project = createCommunityHeroExample("lux", "form-ap", templates);
    project.acceptedPlan!.slots.Q.products[0]!.template.params.damage = { damageTier: "小", ratios: [{ stat: "ap", coeff: 0.9 }, { stat: "ad", coeff: 0.4 }] };
    const render = (enabled: boolean) => mount(createElement(HeroSlotEditor, { project, slot: "Q", templates, configs: [{ schema: "config.ap-coefficient@1", enabled }], errors: {}, onChange() {} }));
    const protectedFields = (form: ReturnType<typeof mount>) => form.hosts().filter((node) => node.type === "fieldset" && node.props.disabled === true)
      .flatMap((node) => descendants(node.children).map((child) => child.props["data-field"]));
    const prefix = "acceptedPlan.slots.Q.products.0.template.params.damage.ratios";
    expect(protectedFields(render(true))).toContain(`${prefix}.0.coeff`);
    expect(protectedFields(render(true))).not.toContain(`${prefix}.1.coeff`);
    expect(protectedFields(render(false))).not.toContain(`${prefix}.0.coeff`);
    expect(project.acceptedPlan!.slots.Q.products[0]!.template.params.damage).toEqual({ damageTier: "小", ratios: [{ stat: "ap", coeff: 0.9 }, { stat: "ad", coeff: 0.4 }] });
  });

  it("makes shadowed fixed tuning and cast seconds read-only until their bands are cleared", () => {
    const catalog = shippedHeroCatalog();
    const templates = [...catalog.documents.entries()].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
    const project = createCommunityHeroExample("karthus", "form-karthus", templates);
    const render = () => mount(createElement(HeroSlotEditor, { project, slot: "Q", templates, errors: {}, onChange() { throw new Error("read-only input was changed"); } }));
    let form = render();
    for (const schemaPath of ["range", "cooldownSec", "manaCost", "castTimeSec"]) {
      const protection = form.hosts().find((node) => node.type === "fieldset" && node.props["data-owner-only-path"] === schemaPath);
      expect(protection?.props.disabled, schemaPath).toBe(true);
      expect(descendants(protection!.children).some((node) => String(node.props["data-field"]).endsWith(`.${schemaPath}`))).toBe(true);
    }
    project.acceptedPlan!.slots.Q.abilityOverrides = {};
    form = render();
    expect(form.hosts().some((node) => ["range", "cooldownSec", "manaCost", "castTimeSec"].includes(String(node.props["data-owner-only-path"])))).toBe(false);
  });

  it("edits a concept hero's shield and tier using actual controls, then compiles the reopened draft", () => {
    const catalog = shippedHeroCatalog();
    const templates = [...catalog.documents.entries()].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
    let project = createCommunityHeroExample("lux", "form-lux", templates);
    function Host() {
      const [value, setValue] = useState(project);
      return createElement(HeroSlotEditor, { project: value, slot: "W", templates, errors: {}, onChange(next: HeroProject) { project = next; setValue(next); } });
    }
    const form = mount(createElement(Host));
    form.enter(form.field("acceptedPlan.slots.W.abilityOverrides.effects.0.amount.flat"), "175");
    form.enter(form.field("acceptedPlan.slots.W.abilityOverrides.cooldownTier"), "中");
    const reopened = zHeroProject.parse(JSON.parse(JSON.stringify(project)));
    const materialized = compileHeroPackageProject(reopened, catalog, false);
    expect(materialized.compiled.abilityDrafts.W.effects).toContainEqual(expect.objectContaining({ kind: "shield", amount: expect.objectContaining({ flat: 175 }) }));
    expect(reopened.acceptedPlan!.slots.W.abilityOverrides.cooldownTier).toBe("中");
    expect(form.hosts().filter((node) => node.type === "textarea").some((node) => String(node.props.value).includes('"kind"'))).toBe(false);
  });
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

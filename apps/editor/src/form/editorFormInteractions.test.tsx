import { createElement, useState } from "react";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { mount, optionValues, type Harness, type HostNode, type RenderedNode } from "@ggd/shared/testkit/headlessUi";
import { setAt } from "@ggd/shared/content/editModel";
import { collectionEntry } from "../collections";
import { walkZod, defaultForVariant } from "./walk";
import type { UINode } from "./uiSchema";
import { heroPackageProject, shippedHeroCatalog } from "@ggd/shared/testkit/heroPackageFixture";
import type { HeroProject, TemplateDoc } from "@ggd/shared/content";
import { zHookDef } from "@ggd/shared/content/schema/effects/_hook";
import { zVfxPrimBinding } from "@ggd/shared/content/schema/vfx";
import { templateSelectionDecision } from "../forge/typeCatalog";
import type { EffectCondition } from "@ggd/shared/sim/content/condition";

vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("@ggd/shared/testkit/headlessUi")).hookImpls }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { entries: referenceIds.map((id) => ({ id })) } }) }));
import { FormRenderer } from "./FormRenderer";
import { ConditionEditor } from "../forge/ConditionEditor";
import { HeroSlotEditor } from "../hero/HeroSlotEditor";

const root = resolve(import.meta.dirname, "../../../..");
const bricks = JSON.parse(readFileSync(resolve(root, "docs/editor-contract/ggd-bricks.json"), "utf8")).bricks as Array<{ id: string; layer: string }>;
const catalog = shippedHeroCatalog();
const templates = [...catalog.documents.entries()].filter(([key]) => key.startsWith("ability-templates/")).map(([, value]) => value as TemplateDoc);
const referenceIds = templates.map((template) => template.id);
const ability = walkZod(collectionEntry("abilities").schema);
if (ability.kind !== "object") throw new Error("ability form is not an object");
const effects = ability.fields.find((node) => node.path === "effects");
if (effects?.kind !== "array" || effects.item.kind !== "discriminatedUnion") throw new Error("ability effect cards are unavailable");
const effectCard = effects.item;
const hook = walkZod(zHookDef);
const prim = walkZod(zVfxPrimBinding);
const vfx = walkZod(collectionEntry("vfx").schema);

/** Respect disabled ancestors; invoking a disabled fieldset's child handler would be fake UI evidence. */
function controls(nodes: readonly RenderedNode[], blocked = false): HostNode[] {
  return nodes.flatMap((node) => {
    if (typeof node === "string") return [];
    const disabled = blocked || node.props.disabled === true || node.props.inert === true;
    const self = !disabled && ["input", "select"].includes(node.type) && typeof node.props.onChange === "function" ? [node] : [];
    return [...self, ...controls(node.children, disabled)];
  });
}
function descendants(node: UINode): UINode[] {
  const children = node.kind === "object" ? node.fields : node.kind === "array" ? [node.item]
    : node.kind === "tuple" ? node.items : node.kind === "record" ? [node.value]
      : node.kind === "discriminatedUnion" ? node.variants.flatMap((variant) => variant.fields) : [];
  return [node, ...children.flatMap(descendants)];
}
function enumField(node: UINode, name: string): UINode {
  const field = descendants(node).find((entry) => entry.kind === "enum" && entry.path.split(".").at(-1) === name);
  if (!field) throw new Error(`No shipped enum control for ${name}`);
  return field;
}
function choose(form: Harness, id: string): void {
  const select = controls(form.nodes()).find((node) => node.type === "select" && optionValues(node).includes(id));
  expect(select, `No enabled option ${id}`).toBeDefined();
  form.enter(select!, id);
}
function editParameter(form: Harness, nodes = form.nodes(), excluded?: HostNode): boolean {
  const enabled = controls(nodes).filter((node) => node !== excluded);
  const number = enabled.find((node) => node.type === "input" && (node.props.type === "number" || node.props.inputMode === "decimal"));
  if (number) {
    const previous = Number(number.props.value ?? 0);
    const min = Number(number.props.min ?? -Infinity), max = Number(number.props.max ?? Infinity);
    const next = Math.min(max, Math.max(min, previous === 7 ? 8 : 7));
    if (Number.isFinite(next) && next !== previous) { form.enter(number, String(next)); return true; }
  }
  for (const select of enabled.filter((node) => node.type === "select")) {
    const other = optionValues(select).find((value) => value && value !== String(select.props.value ?? "") && value !== "__custom");
    if (other) { form.enter(select, other); return true; }
  }
  return false;
}

type Interaction = { id: string; layer: string; renderable: boolean; componentPath: string; surface: string; reason: string | null; controlCount: number; editedPath: string | null; parameterEdited: boolean; roundTrip: boolean; browserVerified: false };
const receipts: Interaction[] = [];
function base(brick: { id: string; layer: string }, componentPath: string, surface: string): Interaction {
  return { ...brick, componentPath, surface, renderable: true, reason: null, controlCount: 0, editedPath: null, parameterEdited: false, roundTrip: false, browserVerified: false };
}
function generic(brick: { id: string; layer: string }, node: UINode, initial: unknown, choice: string, componentPath: string, surface: string): Interaction {
  const receipt = base(brick, componentPath, surface);
  let current = { value: initial };
  function Host() {
    const [value, update] = useState(current);
    return createElement(FormRenderer, { node, value: value.value, dataPath: "value", errors: {}, onChange(path, next) {
      receipt.editedPath = path; current = setAt(value, path, next); update(current);
    } });
  }
  let form = mount(createElement(Host));
  const before = JSON.stringify(current);
  choose(form, choice);
  expect(JSON.stringify(current), `${brick.layer}/${brick.id} selection had no effect`).not.toBe(before);
  receipt.controlCount = controls(form.nodes()).length;
  // The discriminant itself is not parameter-edit evidence.
  const discriminator = controls(form.nodes()).find((node) => node.type === "select" && optionValues(node).includes(choice));
  receipt.parameterEdited = brick.layer === "effect" ? editParameter(form, form.nodes(), discriminator) : false;
  const serialized = JSON.stringify(current);
  current = JSON.parse(serialized);
  form = mount(createElement(Host));
  expect(JSON.stringify(current)).toBe(serialized);
  expect(controls(form.nodes()).length).toBeGreaterThan(0);
  receipt.roundTrip = true;
  return receipt;
}

describe("all Main brick forms through shipped React handlers", () => {
  it("measures every brick, edits controls, serializes and remounts without claiming browser acceptance", () => {
    for (const brick of bricks) {
      if (brick.layer === "effect") {
        const receipt = generic(brick, effectCard, {}, brick.id, "apps/editor/src/form/widgets/DiscriminatedUnionField.tsx", `ability.effects[].kind=${brick.id}`);
        receipts.push(receipt);
      } else if (brick.layer === "hook") {
        receipts.push(generic(brick, hook, {}, brick.id, "apps/editor/src/form/widgets/EnumSelect.tsx", `ability hook.on=${brick.id}`));
      } else if (brick.layer === "vfx-prim" || brick.layer === "vfx-subtype") {
        const field = brick.layer === "vfx-prim" ? enumField(prim, "primitive") : enumField(vfx, "presentation");
        receipts.push(generic(brick, field, undefined, brick.id, "apps/editor/src/form/widgets/EnumSelect.tsx", brick.layer === "vfx-prim" ? "vfx.prim.primitive" : "vfx.presentation"));
      } else if (brick.layer === "model-preset") {
        const decision = templateSelectionDecision(brick.id, "node");
        if (!decision.selectable) { receipts.push({ ...base(brick, "apps/editor/src/form/widgets/RefSelect.tsx", "spawnModelFx.preset"), renderable: false, reason: decision.reason ?? "preset unavailable" }); continue; }
        receipts.push(generic(brick, effectCard, defaultForVariant(effectCard, "spawnModelFx"), brick.id, "apps/editor/src/form/widgets/RefSelect.tsx", "spawnModelFx.preset"));
      } else if (brick.layer === "leaf") {
        const receipt = base(brick, "apps/editor/src/forge/ConditionEditor.tsx", `condition.kind=${brick.id}`);
        let current: EffectCondition | undefined;
        function Host() {
          const [value, update] = useState(current);
          return createElement(ConditionEditor, { label: "Condition", value, fieldPrefix: "receipt", onChange(next) { current = next; update(next); } });
        }
        let form = mount(createElement(Host));
        form.press(form.field("receipt.addFirst"));
        choose(form, brick.id);
        receipt.controlCount = controls(form.nodes()).length;
        receipt.parameterEdited = editParameter(form);
        const serialized = JSON.stringify(current);
        expect(serialized).toBeTruthy();
        current = JSON.parse(serialized!);
        form = mount(createElement(Host));
        expect(JSON.stringify(current)).toBe(serialized);
        expect(controls(form.nodes()).length).toBeGreaterThan(0);
        receipt.roundTrip = true; receipts.push(receipt);
      } else if (brick.layer === "template") {
        const template = templates.find((candidate) => candidate.id === `tpl-${brick.id}`);
        expect(template, brick.id).toBeDefined();
        const receipt = base(brick, "apps/editor/src/hero/HeroSlotEditor.tsx", `HeroProject.products[].template.ref=${template!.id}`);
        const decision = templateSelectionDecision(template!.id, "doc");
        if (!decision.selectable) { receipts.push({ ...receipt, renderable: false, reason: decision.reason ?? "template unavailable" }); continue; }
        let current = heroPackageProject(catalog);
        current.sections.skills.fieldOwnership = {};
        current.acceptedPlan!.slots.Q.products = [{ instanceId: "receipt-product", template: { ref: template!.id, inheritDefaults: true, params: {} } }];
        function Host() {
          const [value, update] = useState(current);
          return createElement(HeroSlotEditor, { project: value, slot: "Q", templates, errors: {}, onChange(next: HeroProject) { current = next; update(next); } });
        }
        let form = mount(createElement(Host));
        const product = form.hosts().find((node) => node.type === "ol" && node.props.className === "hero-products");
        expect(product, brick.id).toBeDefined();
        receipt.controlCount = controls(product!.children).length;
        const before = JSON.stringify(current.acceptedPlan!.slots.Q.products);
        receipt.parameterEdited = editParameter(form, product!.children);
        expect(receipt.parameterEdited, `${brick.id} has no enabled parameter control`).toBe(true);
        expect(JSON.stringify(current.acceptedPlan!.slots.Q.products)).not.toBe(before);
        const serialized = JSON.stringify(current);
        current = JSON.parse(serialized);
        form = mount(createElement(Host));
        expect(JSON.stringify(current)).toBe(serialized);
        expect(form.text()).toContain(template!.name);
        receipt.roundTrip = true; receipts.push(receipt);
      } else throw new Error(`Unmeasured brick layer ${brick.layer}`);
    }
    expect(receipts.length).toBe(bricks.length);
    expect(new Set(receipts.map((row) => `${row.layer}/${row.id}`)).size).toBe(bricks.length);
    expect(receipts.filter((row) => row.renderable).every((row) => row.roundTrip && row.controlCount > 0)).toBe(true);
    if (process.env.GGD_FORM_RECEIPTS_OUTPUT) writeFileSync(process.env.GGD_FORM_RECEIPTS_OUTPUT, JSON.stringify({ schema: "ggd-editor-form-interactions@1", limits: "Headless real React controls and handlers; JSON serialization and remount. Not browser, IndexedDB, runtime or full parameter coverage.", receipts }, null, 2) + "\n");
  });
});

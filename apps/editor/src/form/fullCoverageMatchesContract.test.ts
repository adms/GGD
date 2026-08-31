import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zAbilityDoc } from "@ggd/shared/content/schema/ability";
import { zModelDoc } from "@ggd/shared/content/schema/model";
import { zProjectileDoc } from "@ggd/shared/content/schema/projectile";
import { zSkinDoc } from "@ggd/shared/content/schema/skin";
import { zVfxDoc } from "@ggd/shared/content/schema/vfx";
import { zVfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import {
  CONDITION_EDITOR_LEAF_FIELDS,
  CONDITION_EDITOR_LEAF_KINDS,
} from "../forge/ConditionEditor";
import { walkZod } from "./walk";
import type {
  UIArray,
  UIDiscriminatedUnion,
  UIEnum,
  UINode,
  UIObject,
} from "./uiSchema";

/**
 * The complete editor-side half of ggd-editor-coverage@1.
 *
 * This is deliberately derived from the controls the application actually
 * renders: walkZod for schema-driven forms, ConditionEditor for condition
 * leaves, and the enabled template documents shown by ForgeGallery. It checks
 * both directions, so a missing control and a control for a dead runtime name
 * are equally red.
 */

const REPO = join(import.meta.dirname, "../../../..");

interface CoverageItem {
  readonly group: string;
  readonly name: string;
  readonly owner?: string;
}

const keyOf = (item: CoverageItem): string =>
  `${item.group}/${item.name}${item.owner ? `@${item.owner}` : ""}`;

const last = (path: string): string =>
  (path.split(".").pop() ?? "").replace(/\[\]$/, "");

function childrenOf(node: UINode): UINode[] {
  if (node.kind === "object") return node.fields;
  if (node.kind === "array") return [node.item];
  if (node.kind === "tuple") return node.items;
  if (node.kind === "record") return [node.value];
  if (node.kind === "discriminatedUnion") {
    return node.variants.flatMap((variant) => variant.fields);
  }
  return [];
}

function allNodes(root: UINode): UINode[] {
  const out: UINode[] = [];
  const visit = (node: UINode): void => {
    out.push(node);
    for (const child of childrenOf(node)) visit(child);
  };
  visit(root);
  return out;
}

/** Same field naming used by the generated visual-document contract. */
function flattenDocumentFields(node: UINode, out: string[]): void {
  if (node.kind === "enum") {
    for (const option of node.options) out.push(`${node.path}=${String(option)}`);
  }
  if (node.kind === "object") {
    for (const field of node.fields) {
      out.push(field.path);
      flattenDocumentFields(field, out);
    }
    return;
  }
  if (node.kind === "array") {
    flattenDocumentFields(node.item, out);
    return;
  }
  if (node.kind === "tuple") {
    for (const item of node.items) flattenDocumentFields(item, out);
    return;
  }
  if (node.kind === "record") {
    flattenDocumentFields(node.value, out);
    return;
  }
  if (node.kind === "discriminatedUnion") {
    for (const variant of node.variants) {
      for (const field of variant.fields) {
        const parent = node.path ? `${node.path}.` : "";
        out.push(`${parent}${node.discriminator}=${variant.tag}.${last(field.path)}`);
        flattenDocumentFields(field, out);
      }
    }
  }
}

function visualSurface(group: string, schema: unknown, owner: string): CoverageItem[] {
  const names: string[] = [];
  flattenDocumentFields(walkZod(schema as never, "", owner), names);
  return [...new Set(names)].map((name) => ({ group, name, owner }));
}

function abilitySurface(): CoverageItem[] {
  const root = walkZod(zAbilityDoc as never, "", "ability@1");
  if (root.kind !== "object") return [];
  const out: CoverageItem[] = [];

  for (const field of root.fields) {
    const name = last(field.path);
    // `schema` is the document envelope; RuntimeCapabilityManifest's
    // abilityField group intentionally describes AbilityDef only.
    if (name !== "schema") out.push({ group: "abilityField", name });
  }

  const effects = root.fields.find((field) => field.path === "effects") as UIArray | undefined;
  const effectUnion = effects?.kind === "array" && effects.item.kind === "discriminatedUnion"
    ? effects.item as UIDiscriminatedUnion
    : null;
  if (effectUnion) {
    for (const variant of effectUnion.variants) {
      out.push({ group: "effectKind", name: variant.tag });
      // The discriminant is the card-kind selector itself. It is present on
      // every runtime variant and appears once in the contract's field union.
      out.push({ group: "effectField", name: effectUnion.discriminator });
      for (const field of variant.fields) {
        out.push({ group: "effectField", name: last(field.path) });
      }
    }
  }

  for (const node of allNodes(root)) {
    if (node.kind !== "object") continue;
    const fields = (node as UIObject).fields;
    const on = fields.find((field) => last(field.path) === "on") as UIEnum | undefined;
    const effectsField = fields.some((field) => last(field.path) === "effects");
    if (on?.kind === "enum" && effectsField && on.options.includes("onAbilityCast")) {
      for (const option of on.options) out.push({ group: "hookEvent", name: String(option) });
      for (const field of fields) out.push({ group: "hookField", name: last(field.path) });
    }
    if (node.path.endsWith("auras[]")) {
      for (const field of fields) out.push({ group: "auraField", name: last(field.path) });
    }
  }

  return out;
}

function templateSurface(): CoverageItem[] {
  const dir = join(REPO, "content/ability-templates");
  const families = readdirSync(dir)
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as {
      family?: string;
      status?: string;
    })
    // ForgeGallery enables exactly the templates the runtime expander enables.
    .filter((doc) => doc.status === "enabled" && typeof doc.family === "string")
    .map((doc) => doc.family!);
  return [...new Set(families)].map((name) => ({ group: "templateFamily", name }));
}

let editorSurfaceCache: CoverageItem[] | null = null;
function editorSurface(): CoverageItem[] {
  if (editorSurfaceCache) return editorSurfaceCache;
  editorSurfaceCache = [
    ...abilitySurface(),
    ...CONDITION_EDITOR_LEAF_KINDS.map((name) => ({ group: "conditionLeaf", name })),
    ...CONDITION_EDITOR_LEAF_FIELDS.map((name) => ({ group: "conditionLeafField", name })),
    ...templateSurface(),
    ...visualSurface("vfxField", zVfxDoc, "vfx@1"),
    ...visualSurface("modelField", zModelDoc, "model@1"),
    ...visualSurface("projectileField", zProjectileDoc, "projectile@1"),
    ...visualSurface("skinField", zSkinDoc, "skin@1"),
    ...visualSurface("vfxScriptField", zVfxScriptDoc, "vfx-script@1"),
  ];
  return editorSurfaceCache;
}

let contractSurfaceCache: CoverageItem[] | null = null;
function contractSurface(): CoverageItem[] {
  if (contractSurfaceCache) return contractSurfaceCache;
  const doc = JSON.parse(
    readFileSync(join(REPO, "docs/editor-contract/ggd-editor-coverage.json"), "utf8"),
  ) as { required: CoverageItem[] };
  contractSurfaceCache = doc.required;
  return contractSurfaceCache;
}

describe("all editor-contract fields have a real authoring control", () => {
  it("the ruler is live and reads the current full contract", () => {
    const contract = contractSurface();
    expect(contract.length).toBeGreaterThanOrEqual(677);
    expect(editorSurface().length).toBeGreaterThan(600);
  });

  it("checks both directions across every coverage group", () => {
    const contract = new Set(contractSurface().map(keyOf));
    const editor = new Set(editorSurface().map(keyOf));
    const missingInEditor = [...contract].filter((key) => !editor.has(key)).sort();
    const missingInContract = [...editor].filter((key) => !contract.has(key)).sort();

    expect(
      { 契約有但編輯器沒有: missingInEditor, 編輯器有但契約沒有: missingInContract },
      "契約有但編輯器沒有＝玩家碰不到；編輯器有但契約沒有＝玩家做出的內容上線是死的",
    ).toEqual({ 契約有但編輯器沒有: [], 編輯器有但契約沒有: [] });
  });
});

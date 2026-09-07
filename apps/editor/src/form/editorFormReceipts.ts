import type { UINode } from "./uiSchema";
import { walkZod } from "./walk";
import { collectionEntry } from "../collections";
import { CONDITION_EDITOR_LEAF_KINDS } from "../forge/ConditionEditor";
import {
  GGD_TYPE_CATALOG,
  GGD_TYPE_CATALOG_ERROR,
  templateSelectionDecision,
} from "../forge/typeCatalog";

export const EDITOR_BRICK_LAYERS = [
  "effect",
  "hook",
  "leaf",
  "template",
  "vfx-prim",
  "vfx-subtype",
  "vfx-call",
  "model-preset",
] as const;

export type EditorBrickLayer = (typeof EDITOR_BRICK_LAYERS)[number];

export interface EditorBrick {
  readonly id: string;
  readonly layer: EditorBrickLayer;
}

export interface EditorFormReceipt {
  readonly id: string;
  readonly layer: EditorBrickLayer;
  readonly renderable: boolean;
  readonly componentPath: string | null;
  readonly surface: string | null;
  readonly reason: string | null;
}

const COMPONENTS = Object.freeze({
  effect: "apps/editor/src/form/widgets/DiscriminatedUnionField.tsx",
  hook: "apps/editor/src/form/widgets/EnumSelect.tsx",
  leaf: "apps/editor/src/forge/ConditionEditor.tsx",
  template: "apps/editor/src/forge/ForgeStudio.tsx",
  enum: "apps/editor/src/form/widgets/EnumSelect.tsx",
  ref: "apps/editor/src/form/widgets/RefSelect.tsx",
});

function childrenOf(node: UINode): readonly UINode[] {
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

const last = (path: string): string =>
  (path.split(".").pop() ?? "").replace(/\[\]$/, "");

function effectKinds(root: UINode): ReadonlySet<string> {
  if (root.kind !== "object") return new Set();
  const effects = root.fields.find((field) => field.path === "effects");
  if (effects?.kind !== "array" || effects.item.kind !== "discriminatedUnion") return new Set();
  return new Set(effects.item.variants.map((variant) => variant.tag));
}

function hookEvents(root: UINode): ReadonlySet<string> {
  const events = new Set<string>();
  for (const node of allNodes(root)) {
    if (node.kind !== "object") continue;
    const on = node.fields.find((field) => last(field.path) === "on");
    const hasEffects = node.fields.some((field) => last(field.path) === "effects");
    if (on?.kind !== "enum" || !hasEffects || !on.options.includes("onAbilityCast")) continue;
    for (const option of on.options) events.add(String(option));
  }
  return events;
}

function enumOptions(root: UINode, fieldName: string): ReadonlySet<string> {
  const options = new Set<string>();
  for (const node of allNodes(root)) {
    if (node.kind !== "enum" || last(node.path) !== fieldName) continue;
    for (const option of node.options) options.add(String(option));
  }
  return options;
}

const abilityForm = walkZod(collectionEntry("abilities").schema, "", "ability@1");
const configForm = walkZod(collectionEntry("config").schema, "", "config@1");
const vfxForm = walkZod(collectionEntry("vfx").schema, "", "vfx@1");
const EFFECT_KINDS = effectKinds(abilityForm);
const HOOK_EVENTS = hookEvents(abilityForm);
const CONDITION_LEAVES = new Set<string>(CONDITION_EDITOR_LEAF_KINDS);
const VFX_PRIMITIVES = enumOptions(configForm, "primitive");
const VFX_PRESENTATIONS = enumOptions(vfxForm, "presentation");

function yes(
  brick: EditorBrick,
  componentPath: string,
  surface: string,
): EditorFormReceipt {
  return {
    id: brick.id,
    layer: brick.layer,
    renderable: true,
    componentPath,
    surface,
    reason: null,
  };
}

function no(brick: EditorBrick, reason: string): EditorFormReceipt {
  return {
    id: brick.id,
    layer: brick.layer,
    renderable: false,
    componentPath: null,
    surface: null,
    reason,
  };
}

/**
 * Measure one Main brick against the Editor controls that ship today.
 *
 * This deliberately does not read `brick.editorForm`: that field is the proxy
 * this receipt is meant to replace. Every positive answer comes from the same
 * schema walk or picker decision the UI consumes; an unavailable template is
 * reported false instead of treating a raw JSON escape hatch as a form.
 */
export function editorFormReceiptFor(brick: EditorBrick): EditorFormReceipt {
  switch (brick.layer) {
    case "effect":
      return EFFECT_KINDS.has(brick.id)
        ? yes(brick, COMPONENTS.effect, `ability@1.effects[].kind=${brick.id}`)
        : no(brick, `ability@1 的表單樹沒有 effect kind ${brick.id}`);
    case "hook":
      return HOOK_EVENTS.has(brick.id)
        ? yes(brick, COMPONENTS.hook, `ability@1 hook.on=${brick.id}`)
        : no(brick, `ability@1 的表單樹沒有 hook event ${brick.id}`);
    case "leaf":
      return CONDITION_LEAVES.has(brick.id)
        ? yes(brick, COMPONENTS.leaf, `ConditionEditor leaf.kind=${brick.id}`)
        : no(brick, `ConditionEditor 沒有 condition leaf ${brick.id}`);
    case "template": {
      const entry = GGD_TYPE_CATALOG?.types.find((candidate) =>
        (candidate as typeof candidate & { family?: string }).family === brick.id
      );
      if (!entry) {
        return no(
          brick,
          GGD_TYPE_CATALOG_ERROR ?? `type catalog 沒有 family=${brick.id} 的模板`,
        );
      }
      const decision = templateSelectionDecision(entry.id, "doc");
      return decision.selectable
        ? yes(brick, COMPONENTS.template, `ForgeStudio template.ref=${entry.id}`)
        : no(brick, decision.reason ?? `模板 ${entry.id} 不可作為技能卡`);
    }
    case "vfx-prim":
      return VFX_PRIMITIVES.has(brick.id)
        ? yes(brick, COMPONENTS.enum, `config.vfx-families@1 families.*.primitive=${brick.id}`)
        : no(brick, `config 表單樹沒有 VFX primitive ${brick.id}`);
    case "vfx-subtype":
      return VFX_PRESENTATIONS.has(brick.id)
        ? yes(brick, COMPONENTS.enum, `vfx@1.presentation=${brick.id}`)
        : no(brick, `vfx@1 表單樹沒有 presentation ${brick.id}`);
    case "model-preset": {
      const decision = templateSelectionDecision(brick.id, "node");
      return decision.selectable
        ? yes(brick, COMPONENTS.ref, `ability@1.effects[].spawnModelFx.preset=${brick.id}`)
        : no(brick, decision.reason ?? `model preset ${brick.id} 不可選用`);
    }
    case "vfx-call":
      // ⭐ GH#1075（2026-09-07）：可呼叫的子模組是一塊積木，但 Forge 還沒有 picker —— 走 Codex packet
      //   `claim.vfx-subtype-picker`；在那之前誠實回「沒有表單」，⛔ 不要拿 vfx@1 的 presentation 下拉冒充。
      return no(brick, `vfx-script 的 {call:{subtype:"${brick.id}"}} 還沒有 picker（Codex packet claim.vfx-subtype-picker）`);
  }
}

export function buildEditorFormReceipts(
  bricks: readonly EditorBrick[],
): EditorFormReceipt[] {
  return [...bricks]
    .sort((a, b) => a.layer.localeCompare(b.layer) || a.id.localeCompare(b.id))
    .map(editorFormReceiptFor);
}

/**
 * ROSTER VFX BINDINGS (task #79) —— **讀取端**。逐 id 的分類在 `content/`。
 *
 * The 48 whitelisted champions (data/curation/whitelist.json) had 92% of their
 * abilities pointing at ONE generic fire placeholder (`fx.ember-bolt-cast`) —
 * 依文潔琳's ice spells rendered as fire, every sword arc looked identical.
 * The fix maps each roster ability to `(element, primitive)`: the primitive
 * (from `primitives.ts`) gives the SHAPE, the element (from `elements.ts`)
 * gives the COLOUR. The slot decides SIZE (ultimate R / EX are scaled up), so
 * one primitive serves many abilities with different looks (task #50).
 *
 * ⭐ **GH#384：那 325 格分類搬進 `content/config/vfx-ability-art.json` 了。**
 * 它們是內容 —— 一格顏色分錯，以前要重建 client 映像才改得掉（client 是 build
 * 時烘進去的），而 `content/` 是 live bind-mount，存檔就生效；而且外部編輯器
 * **看不到 TypeScript 常數，也不會知道自己漏了**（第〇·五守則的對外契約紅線）。
 * 留在這裡的是**機制**：槽位→尺寸的規則、`fx.prim.*` 的命名、以及把分類烘成
 * vfx 文件的那條路。搬家前的逐列作者註記另存在
 * `docs/legacy/_vfx-ability-art-authoring-notes.md`（知識不可以無聲消失）。
 *
 * 分類本身是讀每一支技能的中文名 + 英雄原型分出來的（fire 火/焰/爆、
 * ice 冰/凍/霜/吹雪、lightning 雷/電/伏特、wind 風/氣、earth 土/石/地、
 * holy 光/聖/神、void 闇/暗/黑/死/靈/冥、blade 斬/刀/劍/拳/爪/戟、
 * nature 草/葉/藤/種，water/blood/arcane/ki 視情況）。
 *
 * `curatedDocs()` turns the classification into the `content/vfx/fx.prim.*.json`
 * docs the runtime resolves through `ContentDb.vfxFor` — so binding an ability
 * is "set its vfxKey to `vfxKeyFor(binding)`", with ZERO change to VfxSystem.
 *
 * THIS IS THE BASELINE, NOT THE LAST WORD. The classification is read off each
 * ability's NAME — good enough to give every ability a legible element+shape,
 * but it is not evidence of what the original map drew. Where the w3x import
 * PROVES an ability's art (`w3a-override` / `w3h-override` / `jass-literal`)
 * and that art survives as shippable emitters, the ability is promoted to it in
 * `./w3xAbilityArt` and its content `vfxKey` names a `fx.w3x.*` / `godie-*` doc
 * instead of the `fx.prim.*` key computed here. So for those rows,
 * `abilityVfxKeys()` no longer matches the shipped content doc BY DESIGN —
 * it is the fallback classification, and `w3xAbilityArt` is the override.
 */
import type { VfxDoc } from "@ggd/shared/content";
import { PRIMITIVES, type PrimitiveKind } from "./primitives";
import { elementStyle, type Element } from "./elements";
import { applyArtParams } from "./artParams";
import { abilityArtRows, onAbilityArtBindingsChanged } from "./abilityArtContent";

export type Slot = "q" | "w" | "e" | "r" | "ex";
export type Size = "sm" | "md" | "lg";

/** SIZE → overall scale. Ultimates read bigger; quick utility reads smaller. */
export const SIZE_SCALE: Record<Size, number> = { sm: 0.72, md: 1, lg: 1.5 };

export interface Binding {
  abilityId: string;
  element: Element;
  primitive: PrimitiveKind;
  size: Size;
}

/** Default size by slot: Q/W/E medium, R/EX large (the fight-defining casts). */
function sizeForSlot(slot: Slot, override?: Size): Size {
  if (override) return override;
  return slot === "r" || slot === "ex" ? "lg" : "md";
}

/** The five slots an ability id can end in. Anything else has no `prim` cell. */
const SLOTS: Slot[] = ["q", "w", "e", "r", "ex"];
const SLOT_SET = new Set<string>(SLOTS);

/** `godie-e001.q` → `"q"`, `godie-e001.passive` → undefined. */
function slotOf(abilityId: string): Slot | undefined {
  const tail = abilityId.slice(abilityId.lastIndexOf(".") + 1);
  return SLOT_SET.has(tail) ? (tail as Slot) : undefined;
}

/** memoised flatten — invalidated whenever the content doc is (re)loaded. */
let flattened: Binding[] | null = null;
onAbilityArtBindingsChanged(() => {
  flattened = null;
});

/** The vfx doc id a binding resolves to (also the content filename stem). */
export function vfxKeyFor(b: { element: Element; primitive: PrimitiveKind; size: Size }): string {
  const suffix = b.size === "lg" ? "-lg" : b.size === "sm" ? "-sm" : "";
  return `fx.prim.${b.element}.${b.primitive}${suffix}`;
}

/**
 * One `Binding` per classified ability, read off `config.vfx-ability-art@1`.
 *
 * ⭐ The SLOT RULE stays in code (`sizeForSlot`) and the PARAMETERS live in the
 * JSON — that is the two-layer shape 第〇·五守則 asks for. A row states `size`
 * only when the author is overruling the slot default, so a cell that says
 * nothing keeps meaning "let the slot decide", not "medium".
 */
export function rosterBindings(): Binding[] {
  if (flattened) return flattened;
  const out: Binding[] = [];
  for (const [abilityId, row] of Object.entries(abilityArtRows())) {
    const prim = row.prim;
    if (!prim) continue;
    const slot = slotOf(abilityId);
    if (!slot) continue;
    out.push({
      abilityId,
      element: prim.element,
      primitive: prim.primitive,
      size: sizeForSlot(slot, prim.size),
    });
  }
  out.sort((a, b) => a.abilityId.localeCompare(b.abilityId));
  flattened = out;
  return out;
}

/** abilityId → vfxKey, for the content re-point pass. */
export function abilityVfxKeys(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of rosterBindings()) out[b.abilityId] = vfxKeyFor(b);
  return out;
}

/**
 * The distinct curated vfx docs the roster references, keyed by vfxKey. Each is
 * its primitive rendered with the element's colour/blend, then scaled to the
 * size tier via `applyArtParams` (task #50 — one primitive, many docs). This is
 * the SOURCE the `content/vfx/fx.prim.*.json` files are generated from.
 */
export function curatedDocs(): Map<string, VfxDoc> {
  const out = new Map<string, VfxDoc>();
  for (const b of rosterBindings()) {
    const key = vfxKeyFor(b);
    if (out.has(key)) continue;
    const style = elementStyle(b.element);
    const base = PRIMITIVES[b.primitive]({ id: key, color: style.color, blend: style.blend });
    const doc = applyArtParams(base, { scale: SIZE_SCALE[b.size] });
    doc.id = key; // applyArtParams keeps id, but be explicit (scale=1 identity path)
    out.set(key, doc);
  }
  return out;
}

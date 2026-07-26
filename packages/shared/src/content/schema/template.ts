/**
 * template@1 — the 鑄技工坊 (Skill Forge) ability-template document.
 *
 * A template is a PARAMETERISED behaviour prototype recovered from the 29 JASS
 * behaviour families (docs/ability-templates.md). An ability doc references one
 * by id and supplies the filled param slots (`ability@1.template = {ref,params}`);
 * the pure `expand()` (../templates/expand.ts) turns template+params into the
 * BEHAVIOUR half of an AbilityDef at registry time. The template only owns the
 * behaviour SHAPE — an ability's description/icon/cooldown/manaCost/range stay
 * plain skeleton fields, never template params.
 *
 * DESIGN NOTE — `zParamSlot` is a single flat object keyed by `type` rather than
 * a `z.discriminatedUnion`. Semantically it is the discriminated shape the design
 * sketches (§2.1), but a flat object keeps the fieldAdoption census (S8 guard)
 * honest: every optional key is registered ONCE and is adopted by at least one
 * real slot across the 29 templates, instead of a per-branch `optional` field
 * that no branch happens to set showing up as a phantom zero. The expander reads
 * slots by `type`; the extra keys a given type ignores are simply unused.
 */
import { z } from "zod";
import { zId } from "./common";
import { zRef } from "./common";

/** Unit a numeric slot is measured in — drives the expander's length conversion. */
/**
 * `wc3u` is a PLANAR WC3 length (range/radius/distance) and converts at
 * GGD_PER_WC3; `wc3h` is a WC3 FLY HEIGHT and converts at the separate
 * GGD_APEX_PER_WC3 — the vertical axis is set by the camera, not by the map
 * (task #247b; the full reasoning lives on GGD_APEX_PER_WC3 in templates/expand).
 */
export const zParamUnit = z.enum(["wc3u", "wc3h", "s", "count", "ratio"]);

/** The kind of value a slot carries; the expander switches on it. */
export const zParamType = z.enum(["number", "enum", "scaling", "statModifiers"]);

/**
 * One parameter slot. `type` selects how the expander reads it and how the
 * editor synthesises its form widget:
 *   number        → NumberField (min/max/unit), value is a number
 *   enum          → EnumSelect over `values`, value is one of them
 *   scaling       → the shared zScaling card, value validated at fill time
 *   statModifiers → z.array(zStatModifier), value validated at fill time
 * `default` is the exemplar's MEASURED value (never invented). `optional: true`
 * marks a slot the ability may omit (radius/terminalBurst/internalCooldown…).
 */
export const zParamSlot = z
  .object({
    type: zParamType,
    /** the exemplar's measured default (number | string | scaling | modifier[]) */
    default: z.unknown().optional(),
    /** numeric slots: inclusive bounds; the expander throws outside them */
    min: z.number().optional(),
    max: z.number().optional(),
    /** numeric slots: unit; "wc3u" slots are length-converted by the expander */
    unit: zParamUnit.optional(),
    /** enum slots: the allowed members */
    values: z.array(z.string().min(1)).optional(),
    /** the ability may omit this slot (the expander falls back / drops it) */
    optional: z.boolean().optional(),
    /**
     * 落差治理 at PARAM granularity (design §2.4 / §六). The slot records a real
     * measured value from the exemplar's JASS record, but the sim has no
     * vocabulary to honour it, so `expand()` reads it and produces nothing —
     * e.g. 行進波動's per-step march (`stepSize`/`stepCount`) collapses into one
     * projectile because the sim has no sequential-segment resolution.
     *
     * Marking it here is what stops that from being SILENT: the editor greys the
     * field and says 「本版不生效」, and paramsSchema.test.ts probes every enabled
     * template to assert that the set of slots the expander actually consumes
     * matches the set NOT marked inert. A slot that stops being inert (because
     * P2/P3 added the vocabulary) fails that test until the flag is removed.
     */
    inert: z.string().min(1).optional(),
  })
  .strict();
export type ParamSlot = z.infer<typeof zParamSlot>;

/** P1 enables 8 families; the remaining 21 ship as `draft` cards (no expand path). */
export const zTemplateStatus = z.enum(["enabled", "draft"]);

/**
 * template@1 document. Stored at content/ability-templates/<id>.json.
 */
export const zTemplateDoc = z
  .object({
    id: zId,
    schema: z.literal("template@1"),
    name: z.string().min(1),
    description: z.string().min(1),
    /** the 行為模板 family key — joins the expander's family switch + gap score */
    family: z.string().min(1),
    status: zTemplateStatus,
    /** ordered slot map; the form walker renders in insertion order */
    params: z.record(z.string(), zParamSlot),
    /** sim capability keys, checked against SIM_CAPABILITIES (expand.ts) */
    requires: z.array(z.string()),
    /** 引擎支援度 badge source: 綠≥7 / 黃4-6 / 紅≤3 (mirror of score_gap BASE) */
    gapScore: z.number().int().min(0).max(10),
    /** where the family was recovered from (skill code + JASS locus) */
    exemplar: z.object({ skill: z.string().min(1), jass: z.string().min(1) }).strict(),
  })
  .strict();
export type TemplateDoc = z.infer<typeof zTemplateDoc>;

/** The reference an ability doc stores to a template (`ability@1.template`). */
export const zAbilityTemplateRef = z
  .object({
    ref: zRef("ability-templates"),
    /** filled slot values; each is validated by its slot's semantics at fill time */
    params: z.record(z.string(), z.unknown()),
    /** §5 breaking-migration hook — P1 only STORES it and re-expands on load */
    version: z.number().int().min(1).optional(),
  })
  .strict();
export type AbilityTemplateRef = z.infer<typeof zAbilityTemplateRef>;

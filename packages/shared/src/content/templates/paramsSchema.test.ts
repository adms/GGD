/**
 * The form/expander AGREEMENT test.
 *
 * `paramsSchemaFor` is what the editor renders and validates against;
 * `expand()` is what the game runs. If they can disagree about a template's
 * params then 「表單看到的 == 遊戲跑的」 is false, and the failure is invisible —
 * the form happily accepts a value the expander rejects at registry time.
 *
 * So: for every ENABLED template shipped in content/ability-templates,
 *   (1) `defaultParamsFor` must satisfy `paramsSchemaFor`, and
 *   (2) those same defaults must expand cleanly into a valid AbilityDef half.
 * That is the whole contract, checked against the real files rather than a
 * fixture, so adding a template with a bad default fails here.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zTemplateDoc, type TemplateDoc } from "../schema/template";
import { defaultParamsFor, paramsSchemaFor } from "./paramsSchema";
import { expand, isExpandable } from "./expand";

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../content/ability-templates",
);

function allTemplates(): TemplateDoc[] {
  return readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => zTemplateDoc.parse(JSON.parse(readFileSync(join(TEMPLATES_DIR, f), "utf8"))));
}

describe("paramsSchemaFor / defaultParamsFor — the form↔expander agreement", () => {
  const templates = allTemplates();

  it("finds the shipped template docs", () => {
    expect(templates.length).toBeGreaterThanOrEqual(29);
  });

  it("every enabled template's own defaults satisfy its synthesised schema", () => {
    for (const t of templates.filter((x) => x.status === "enabled")) {
      const res = paramsSchemaFor(t).safeParse(defaultParamsFor(t));
      expect(res.success, `${t.id}: ${res.success ? "" : JSON.stringify(res.error.issues)}`).toBe(
        true,
      );
    }
  });

  it("every enabled template's defaults EXPAND (form default == a runnable skill)", () => {
    for (const t of templates.filter((x) => x.status === "enabled")) {
      expect(isExpandable(t.family), `${t.id} has no expand path`).toBe(true);
      const ex = expand(t, defaultParamsFor(t));
      expect(ex.castType, t.id).toBeTruthy();
      // a template either produces effects, or is a passive whose behaviour
      // hangs off hooks, or installs a named MARK — never all empty, which
      // would be a silent no-op skill. (`marks` joined the list on 2026-08-08:
      // 具名標記 does its work in the damage pipeline and the stat pipeline,
      // never through `runEffects`, so a mark-only card legitimately ships an
      // empty `effects` — see the `mark-stacks` family in expand.ts.)
      const inert =
        ex.effects.length === 0 && ex.passive === undefined && (ex.marks?.length ?? 0) === 0;
      expect(inert, `${t.id} expands to a skill that does NOTHING`).toBe(false);
    }
  });

  it("number ranges survive into the schema, so the form clamps", () => {
    for (const t of templates) {
      for (const [name, slot] of Object.entries(t.params)) {
        if (slot.type !== "number" || slot.max === undefined) continue;
        const over = { ...defaultParamsFor(t), [name]: slot.max + 1 };
        expect(paramsSchemaFor(t).safeParse(over).success, `${t.id}.${name}`).toBe(false);
      }
    }
  });

  /**
   * THE ANTI-SILENCE INVARIANT.
   *
   * A param slot the expander never reads is the worst kind of bug this system
   * can have: the designer types a measured number into a form, the form accepts
   * it, and the game ignores it completely. Nothing else in the stack would ever
   * report that — the doc validates, the expansion validates, the skill casts.
   *
   * So every numeric slot is PROBED: expand with the default, expand again with
   * a different in-range value, and compare. If the expansion did not move, the
   * slot is inert and MUST carry an `inert` reason (which the editor renders as
   * 「本版不生效」). Conversely a slot marked inert that DOES move must lose the
   * flag. When P2 adds `leap`/`knockback` and P3 adds `sequentialSegments`, the
   * flags stop being true and this test is what says so.
   */
  it("every numeric slot either MOVES the expansion or is declared inert", () => {
    for (const t of templates.filter((x) => x.status === "enabled")) {
      const base = defaultParamsFor(t);
      const baseline = JSON.stringify(expand(t, base));
      for (const [name, slot] of Object.entries(t.params)) {
        if (slot.type !== "number") continue;
        const current = typeof base[name] === "number" ? (base[name] as number) : 0;
        // a different value that still satisfies the slot's own range
        const lo = slot.min ?? current - 1;
        const hi = slot.max ?? current + 1;
        const probe = current === lo ? Math.min(hi, current + 1) : Math.max(lo, current - 1);
        if (probe === current) continue; // degenerate range, nothing to probe
        const moved = JSON.stringify(expand(t, { ...base, [name]: probe })) !== baseline;
        if (slot.inert === undefined) {
          expect(
            moved,
            `${t.id}.${name} is a live form field the expander IGNORES — either wire it up in expand.ts or give it an \`inert\` reason so the editor greys it out`,
          ).toBe(true);
        } else {
          expect(
            moved,
            `${t.id}.${name} is marked inert but the expander now honours it — drop the \`inert\` flag`,
          ).toBe(false);
        }
      }
    }
  });

  it("enum slots only accept their declared values", () => {
    for (const t of templates) {
      for (const [name, slot] of Object.entries(t.params)) {
        if (slot.type !== "enum" || !slot.values?.length) continue;
        const bad = { ...defaultParamsFor(t), [name]: "definitely-not-a-member" };
        expect(paramsSchemaFor(t).safeParse(bad).success, `${t.id}.${name}`).toBe(false);
      }
    }
  });

  it("defaults are deep-copied, so two open forms cannot alias the doc", () => {
    const withObject = templates.find((t) =>
      Object.values(t.params).some((s) => s.type === "scaling"),
    );
    expect(withObject).toBeDefined();
    const a = defaultParamsFor(withObject!);
    const b = defaultParamsFor(withObject!);
    const key = Object.entries(withObject!.params).find(([, s]) => s.type === "scaling")![0];
    expect(a[key]).toEqual(b[key]);
    expect(a[key]).not.toBe(b[key]);
  });

  it("a DRAFT template is refused by the expander, never half-expanded", () => {
    for (const t of templates.filter((x) => x.status === "draft")) {
      expect(isExpandable(t.family), `${t.id} is draft but has an expand path`).toBe(false);
      expect(() => expand(t, {})).toThrow();
    }
  });
});

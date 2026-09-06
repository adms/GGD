import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "vitest";
import { zTemplateDoc, type TemplateDoc } from "../schema/template";
import { defaultParamsFor, paramsSchemaFor } from "./paramsSchema";
import { expand } from "./expand";
import { resolveTemplateExpansion } from "./resolve";
import { zAbilityDoc } from "../schema/ability";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content/ability-templates");
const templates: TemplateDoc[] = readdirSync(DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => zTemplateDoc.parse(JSON.parse(readFileSync(join(DIR, f), "utf8"))));
const byId = new Map(templates.map((t) => [t.id, t]));

function through(t: TemplateDoc, params: Record<string, unknown>): string | null {
  let passive: boolean; let innateKind: string | undefined; let ex: any;
  try { ex = expand(t, params); passive = ex.innateKind !== undefined || ex.passive !== undefined || (ex.marks?.length ?? 0) > 0; innateKind = ex.innateKind; }
  catch (e) { return `expand 擲例外：${(e as Error).message}`; }
  const doc: Record<string, unknown> = { schema: "ability@1", id: "godie-probe.q", name: "探針", slot: passive ? "PASSIVE" : "Q", castType: "self", maxRank: 1, cooldown: [8], manaCost: [50], range: 5, effects: [], ...(passive ? { innateKind: innateKind ?? "passive" } : {}), template: { ref: t.id, params } };
  const res = resolveTemplateExpansion(doc, byId);
  if (!res.ok) return `resolve：${res.failure.message}`;
  const parsed = zAbilityDoc.safeParse(res.merged);
  return parsed.success ? null : parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" | ") + "  NODE=" + JSON.stringify(ex.effects[0]);
}

it("probe", () => {
  for (const t of templates.filter((x) => x.status === "enabled")) {
    const d = defaultParamsFor(t);
    for (const [k, slot] of Object.entries(t.params)) {
      if (slot.type !== "enum" || k !== "path") continue;
      for (const v of slot.values ?? []) {
        if (v === d[k]) continue;
        const params = { ...d, [k]: v };
        if (!paramsSchemaFor(t).safeParse(params).success) continue;
        const err = through(t, params);
        console.log(`${err === null ? "OK " : "BAD"} ${t.id}.path=${v}${err ? "  =>  " + err : ""}`);
      }
    }
  }
});

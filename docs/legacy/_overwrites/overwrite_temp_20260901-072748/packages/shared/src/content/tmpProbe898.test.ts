import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expandStack } from "./templates/expand";
import { zAbilityDoc } from "./schema/ability";
const ROOT = resolve(__dirname, "../../../..");
const d = (dir: string, id: string) => JSON.parse(readFileSync(resolve(ROOT, "content", dir, `${id}.json`), "utf8"));
describe("probe", () => {
  it("展開", () => {
    const a = d("abilities", "godie-huth.e");
    try {
      const r = expandStack([{ template: d("ability-templates", a.template.ref), params: a.template.params }] as never);
      console.log("  ⭐ OK:", JSON.stringify((r as { result: { effects: unknown } }).result.effects).slice(0, 400));
    } catch (e) { console.log("  ⛔ stack:", String(e).slice(0, 300)); }
    const r2 = expandStack([{ template: d("ability-templates", a.template.ref), params: a.template.params }] as never);
    const merged = { ...a, ...(r2 as { result: object }).result };
    delete (merged as { template?: unknown }).template;
    const pr = zAbilityDoc.safeParse(merged);
    console.log("  ⭐ parse:", pr.success ? "OK" : JSON.stringify(pr.error.issues.slice(0,3)).slice(0,400));
  });
});

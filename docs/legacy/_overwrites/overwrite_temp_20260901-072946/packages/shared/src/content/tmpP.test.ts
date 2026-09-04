import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expandStack } from "./templates/expand";
import { zAbilityDoc } from "./schema/ability";
const ROOT = resolve(__dirname, "../../../..");
const d = (dir: string, id: string) => JSON.parse(readFileSync(resolve(ROOT, "content", dir, `${id}.json`), "utf8"));
describe("p", () => { it("x", () => {
  const a = d("abilities", "godie-huth.e");
  const r = expandStack([{ template: d("ability-templates", a.template.ref), params: a.template.params }] as never);
  const merged = { ...a, ...(r as { result: object }).result };
  delete (merged as { template?: unknown }).template;
  const pr = zAbilityDoc.safeParse(merged);
  console.log("  ⭐", pr.success ? "OK " + JSON.stringify((merged as {effects:unknown}).effects).slice(0,300)
    : JSON.stringify(pr.error.issues.slice(0,3)).slice(0,420));
}); });

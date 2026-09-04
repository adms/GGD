import { describe, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expandStack } from "./templates/expand";
const ROOT = resolve(__dirname, "../../../..");
describe("probe", () => {
  it("展得出來嗎", () => {
    const tpls = new Map<string, unknown>();
    for (const f of readdirSync(resolve(ROOT, "content/ability-templates"))) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const d = JSON.parse(readFileSync(resolve(ROOT, "content/ability-templates", f), "utf8"));
      tpls.set(d.id, d);
    }
    let ok = 0, bad = 0; const badIds: string[] = [];
    for (const f of readdirSync(resolve(ROOT, "content/abilities"))) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const d = JSON.parse(readFileSync(resolve(ROOT, "content/abilities", f), "utf8"));
      if (!d.template || (d.effects?.length ?? 0) > 0) continue;
      try {
        const cards = (Array.isArray(d.template) ? d.template : [d.template]).map(
          (c: { ref: string; params?: Record<string, unknown> }) => ({
            template: tpls.get(c.ref) as never,
            params: c.params ?? {},
          }),
        );
        if (cards.some((c) => !c.template)) { bad += 1; badIds.push(`${f.slice(0,-5)}(模板不存在)`); continue; }
        const r = expandStack(cards as never).result;
        const n = (r as { effects?: unknown[] })?.effects?.length ?? 0;
        if (n > 0) ok += 1; else { bad += 1; badIds.push(f.slice(0, -5)); }
      } catch (e) { bad += 1; badIds.push(`${f.slice(0, -5)}(${String(e).slice(0, 50)})`); }
    }
    console.log(`  ⭐ 展得出 effects: ${ok} · ⛔ 展不出: ${bad}`);
    if (badIds.length) console.log("  ", badIds.slice(0, 8).join(", "));
  });
});

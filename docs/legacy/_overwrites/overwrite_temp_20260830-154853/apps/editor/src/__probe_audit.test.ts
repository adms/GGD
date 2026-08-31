import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { walkZod } from "./form/walk";
import { zAbilityDoc } from "@ggd/shared/content";
import { z } from "zod";

const caps = JSON.parse(readFileSync("/Users/Takuro/GGD/docs/editor-contract/ggd-runtime-capabilities.json","utf8"));

describe("probe", () => {
  it("walkZod vs contract", () => {
    const node: any = walkZod(zAbilityDoc as unknown as z.ZodTypeAny, "", "Ability");
    const paths = new Set<string>(); const tags = new Set<string>(); let unknowns = 0;
    const seen = new Set<any>();
    const rec = (n: any) => {
      if (!n || typeof n !== "object" || seen.has(n)) return; seen.add(n);
      if (typeof n.path === "string") paths.add(n.path);
      if (n.kind === "unknown") unknowns++;
      if (n.kind === "discriminatedUnion") for (const v of n.variants ?? []) { tags.add(v.tag); (v.fields ?? []).forEach(rec); }
      for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(rec); else if (v && typeof v === "object") rec(v); }
    };
    rec(node);
    const leaf = (p: string) => p.split(".").pop()!.replace(/\[\]$/, "");
    const leaves = new Set([...paths].map(leaf));
    const top = new Set([...paths].filter(p => !p.includes(".")).map(p => p.replace(/\[\]$/,"")));
    console.log("NODES", paths.size, "UNKNOWN_NODES", unknowns);
    console.log("TOP_LEVEL", JSON.stringify([...top].sort()));
    const ab: string[] = caps.abilityFields;
    console.log("abilityFields", ab.length, "MISSING_TOPLEVEL", JSON.stringify(ab.filter(f=>!top.has(f))));
    const ek: string[] = caps.effectKinds;
    console.log("effectKinds", ek.length, "variant tags seen", tags.size, "MISSING_TAGS", JSON.stringify(ek.filter(k=>!tags.has(k))));
    const ef: string[] = caps.effectFields;
    console.log("effectFields", ef.length, "MISSING_LEAF", JSON.stringify(ef.filter(f=>!leaves.has(f))));
    expect(true).toBe(true);
  });
});

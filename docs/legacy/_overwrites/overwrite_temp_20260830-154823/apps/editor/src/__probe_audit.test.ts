import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { walkZod } from "/Users/Takuro/GGD/apps/editor/src/form/walk";
import { zAbilityDoc } from "@ggd/shared/content";
import { z } from "zod";

const caps = JSON.parse(readFileSync("/Users/Takuro/GGD/docs/editor-contract/ggd-runtime-capabilities.json","utf8"));

describe("probe", () => {
  it("abilityFields coverage from walkZod", () => {
    const node: any = walkZod(zAbilityDoc as unknown as z.ZodTypeAny, "", "Ability");
    const top = new Set<string>();
    const collectTop = (n: any) => {
      if (n?.kind === "object" && Array.isArray(n.fields)) for (const f of n.fields) top.add(f.key ?? f.name ?? "");
    };
    collectTop(node);
    const want: string[] = caps.abilityFields;
    const missing = want.filter((w) => !top.has(w));
    console.log("TOP_FIELDS", JSON.stringify([...top].sort()));
    console.log("CONTRACT_abilityFields", want.length, "MISSING_FROM_WALKER", JSON.stringify(missing));
    // deep walk: all keys anywhere
    const all = new Set<string>();
    const seen = new Set<any>();
    const rec = (n: any) => { if (!n || typeof n !== "object" || seen.has(n)) return; seen.add(n);
      if (n.key) all.add(n.key);
      for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(rec); else if (v && typeof v === "object") rec(v); } };
    rec(node);
    const missingDeep = want.filter((w) => !all.has(w));
    console.log("MISSING_DEEP", JSON.stringify(missingDeep));
    // effect kinds
    const effWant: string[] = caps.effectKinds;
    const missingKinds = effWant.filter((k) => !all.has(k));
    console.log("EFFECT_KINDS", effWant.length, "not-seen-as-key", JSON.stringify(missingKinds).slice(0,400));
    const effFields: string[] = caps.effectFields;
    console.log("EFFECT_FIELDS", effFields.length, "missing", JSON.stringify(effFields.filter(f=>!all.has(f))).slice(0,800));
    expect(true).toBe(true);
  });
});

import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { CONFIG_DOC_SPECS } from "../configForms";
import { elsewhereCovers } from "./engine";
import * as CFG from "@ggd/shared/content/schema/config";
import { walkZod } from "../../../editor/src/form/walk";
const OUT = "/private/tmp/claude-503/-Users-Takuro-GGD/9fdde660-96a0-4284-a21f-0bf3abe3680c/scratchpad/labels.json";
it("dump", () => {
  const byZod = new Map<unknown, string>();
  for (const [k, v] of Object.entries(CFG)) if (k.startsWith("zConfig") && typeof v === "object" && v) byZod.set(v, k);
  const rows: unknown[] = [];
  for (const s of CONFIG_DOC_SPECS) {
    const desc = new Map<string, string>();
    const visit = (n: any): void => { if (n.description) desc.set(n.path, n.description); if (n.kind === "object") n.fields.forEach(visit); };
    visit(walkZod(s.zod as any, "", "文件"));
    for (const f of s.fields) {
      rows.push({ docId: s.docId, zodName: byZod.get(s.zod) ?? null, path: f.path, zh: f.zh, note: f.note,
        optionLabels: f.optionLabels ?? null, min: f.min ?? null, max: f.max ?? null,
        pattern: f.pattern ? String(f.pattern) : null, patternError: f.patternError ?? null,
        elsewhere: elsewhereCovers(s, f.path), existing: desc.get(f.path) ?? null });
    }
  }
  writeFileSync(OUT, JSON.stringify(rows, null, 1));
  console.log("rows", rows.length, "unmapped zod:", [...new Set(rows.filter((r: any) => !r.zodName).map((r: any) => r.docId))]);
});

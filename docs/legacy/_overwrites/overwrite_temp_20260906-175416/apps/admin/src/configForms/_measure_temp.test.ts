import { it } from "vitest";
import { CONFIG_DOC_SPECS } from "../configForms";
import { handWrittenResidue, schemaToForm } from "./schemaToForm";
it("measure", () => {
  const byReason: Record<string, number> = {};
  const rows: string[] = [];
  let total = 0;
  for (const s of CONFIG_DOC_SPECS) {
    const r = handWrittenResidue(s);
    total += r.length;
    const rr: Record<string, number> = {};
    for (const x of r) for (const reason of x.reasons) { byReason[reason] = (byReason[reason] ?? 0) + 1; rr[reason] = (rr[reason] ?? 0) + 1; }
    const derived = schemaToForm(s.zod).fields;
    const hasOpt = s.fields.filter((f) => f.optionLabels).length;
    const hasPat = s.fields.filter((f) => f.pattern).length;
    const hasBounds = s.fields.filter((f) => f.min !== undefined || f.max !== undefined).length;
    rows.push(`${s.docId}\tfields=${s.fields.length}\tresidue=${r.length}\tderived=${derived.length}\topt=${hasOpt}\tpat=${hasPat}\tbounds=${hasBounds}\t${JSON.stringify(rr)}`);
  }
  console.log(rows.join("\n"));
  console.log("TOTAL", total, JSON.stringify(byReason));
});

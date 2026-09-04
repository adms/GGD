import { readFileSync, readdirSync } from "node:fs";
import { expand } from "/Users/Takuro/GGD/packages/shared/src/content/templates/expand";
const DIR = "content/ability-templates";
const rows: string[] = [];
for (const f of readdirSync(DIR).filter((x) => x.startsWith("tpl-") && x.endsWith(".json"))) {
  const t = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"));
  const params: Record<string, unknown> = {};
  for (const [k, s] of Object.entries<any>(t.params ?? {})) if (s?.default !== undefined) params[k] = s.default;
  let verdict = "OK";
  try { expand(t as never, params); } catch (e: any) { verdict = `THROW: ${String(e?.message ?? e).slice(0, 90)}`; }
  rows.push(`${t.id.padEnd(22)} ${String(t.status).padEnd(8)} p=${String(Object.keys(t.params ?? {}).length).padStart(2)}  ${verdict}`);
}
for (const r of rows.sort()) console.log(r);

// Prototype: build a ts.Program over production sources and time it; find `.enabled` read sites.
import ts from "typescript";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "/Users/Takuro/GGD";
const SRC_ROOTS = ["packages/shared/src", "apps/game-server/src", "apps/client/src", "apps/content-api/src"];

function isProd(p: string): boolean {
  if (/\.(test|spec)\.tsx?$/.test(p)) return false;
  if (/\.d\.ts$/.test(p)) return false;
  if (/\/(__fixtures__|testkit|__tests__)\//.test(p)) return false;
  return /\.tsx?$/.test(p);
}
function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) { if (e !== "node_modules") walk(p, out); }
    else if (isProd(p)) out.push(p);
  }
}
const t0 = Date.now();
const files: string[] = [];
for (const r of SRC_ROOTS) walk(join(ROOT, r), files);
console.log("prod files", files.length);

const base = ts.readConfigFile(join(ROOT, "tsconfig.base.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(base.config, ts.sys, ROOT);
const opts: ts.CompilerOptions = {
  ...parsed.options,
  noEmit: true,
  skipLibCheck: true,
  jsx: ts.JsxEmit.ReactJSX,
  types: ["node", "vite/client"],
  incremental: false,
  tsBuildInfoFile: undefined,
};
const program = ts.createProgram({ rootNames: files, options: opts });
const checker = program.getTypeChecker();
console.log("program", Date.now() - t0, "ms; sourceFiles", program.getSourceFiles().length);

const TAG = /^config\.[a-z0-9-]+@\d+$/;
function schemaTagsOfType(t: ts.Type): string[] {
  const out: string[] = [];
  const parts = t.isUnion() ? t.types : [t];
  for (const p of parts) {
    const s = p.getProperty("schema");
    if (!s) continue;
    const st = checker.getTypeOfSymbol(s);
    const lits = st.isUnion() ? st.types : [st];
    for (const l of lits) if (l.isStringLiteral() && TAG.test(l.value)) out.push(l.value);
  }
  return [...new Set(out)];
}

let sites = 0, typed = 0;
const perTag = new Map<string, number>();
const t1 = Date.now();
for (const sf of program.getSourceFiles()) {
  if (!files.includes(sf.fileName)) continue;
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n) && n.name.text === "enabled") {
      sites++;
      const t = checker.getTypeAtLocation(n.expression);
      const tags = schemaTagsOfType(t);
      if (tags.length === 1) { typed++; perTag.set(tags[0]!, (perTag.get(tags[0]!) ?? 0) + 1); }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
console.log("sites", sites, "typed(1 tag)", typed, "in", Date.now() - t1, "ms");
console.log([...perTag.entries()].sort().map(([k, v]) => `${k}:${v}`).join("  "));

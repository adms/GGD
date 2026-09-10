import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
const ROOT = resolve("packages/shared/src");
function walk(d, o=[]) { for (const e of readdirSync(d,{withFileTypes:true})) { const p=join(d,e.name); if(e.isDirectory()){if(e.name==="node_modules")continue;walk(p,o);} else if(/\.tsx?$/.test(e.name)) o.push(p);} return o; }
function res(f,s){ if(!s.startsWith("."))return null; const b=resolve(dirname(f),s); for(const c of [b+".ts",b+".tsx",join(b,"index.ts"),join(b,"index.tsx"),b]) { try{ if(statSync(c).isFile())return c; }catch{} } return null; }
function deps(file){ const src=ts.createSourceFile(file,readFileSync(file,"utf8"),ts.ScriptTarget.ESNext,true,file.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS); const out=[];
  for(const st of src.statements){ let spec=null,isType=false;
    if(ts.isImportDeclaration(st)){ spec=st.moduleSpecifier; const c=st.importClause; if(c){ isType=c.isTypeOnly; const nb=c.namedBindings; if(!c.name&&nb&&ts.isNamedImports(nb)&&nb.elements.length>0&&nb.elements.every(e=>e.isTypeOnly)) isType=true; } }
    else if(ts.isExportDeclaration(st)&&st.moduleSpecifier){ spec=st.moduleSpecifier; isType=st.isTypeOnly; const nb=st.exportClause; if(nb&&ts.isNamedExports(nb)&&nb.elements.length>0&&nb.elements.every(e=>e.isTypeOnly)) isType=true; }
    if(!spec||isType||!ts.isStringLiteral(spec))continue; const t=res(file,spec.text); if(t) out.push({to:t, line:src.getLineAndCharacterOfPosition(st.getStart()).line+1, text:st.getText().replace(/\s+/g," ").slice(0,110)});
  } return out; }
const files=walk(ROOT).filter(f=>!/\.(test|spec)\.tsx?$/.test(f)); const set=new Set(files);
const G=new Map(); for(const f of files) G.set(f, deps(f).filter(d=>set.has(d.to)));
const R=p=>relative(ROOT,p);
// crossing edges
console.log("=== runtime edges sim/ -> content/ :");
for(const [f,ds] of G) if(R(f).startsWith("sim/")) for(const d of ds) if(R(d.to).startsWith("content/")) console.log(`  ${R(f)}:${d.line}  ->  ${R(d.to)}   | ${d.text}`);
console.log("\n=== runtime edges content/ -> sim/ (count by target):");
const m=new Map(); for(const [f,ds] of G) if(R(f).startsWith("content/")) for(const d of ds) if(R(d.to).startsWith("sim/")) { const k=R(d.to); (m.get(k)??m.set(k,[]).get(k)).push(`${R(f)}:${d.line}`); }
for(const [k,v] of [...m].sort((a,b)=>b[1].length-a[1].length)) console.log(`  ${k}  <- ${v.length}  ${v.slice(0,4).join(", ")}`);

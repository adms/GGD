/**
 * enabledSwitchesHaveConsumers.ts —— ⭐ **「三個住處」的第四格：消費端**（GH#1043）。
 *
 * owner 2026-09-06：「當初 AP 加成公式做完之後**為什麼沒有上線**？我想知道**開發流程上的疏漏**來改善」
 * ⇒ `ap-coefficient.enabled = true` 活了 4 天（#942 → #1035）而**沒有任何一行 production 程式讀它**：
 * config ＋ Zod `DEFAULT_*` ＋ admin `SHIPPED_*` 三個住處齊全、後台頁看得到 —— ⭐ 而那被讀成「已上線」。
 *
 * ── 這一支回答的問題 ─────────────────────────────────────────────────────
 * 對出貨 `content/config/*.json` 裡的**每一格** `enabled`（含巢狀，例 `multiHit.enabled`、
 * `families.<id>.enabled`）：「**哪一個 production 檔的哪一行讀了它？而那一行跑得到嗎？**」
 *
 * ── ⛔ 為什麼不是 grep ───────────────────────────────────────────────────
 * 票文（#1043）自己量到：拿 config id 的 camelCase 去 grep **高估了 4 倍**。字串比對同時漏報（消費端
 * 用 `Configs.tryGet(TAUNT_DOC_ID)` 這種常數）與誤報（註解、後台表單、產生器、測試都寫著那個字）。
 * ⇒ 這裡用 **TypeScript 的 AST ＋ checker** 走三層：
 *
 *  ① **讀取點**：production 原始碼裡每一個 `X.enabled`／`X["enabled"]`／`const { enabled } = X` 的**讀**
 *     （寫入 `X.enabled = …` 不算）。
 *  ② **歸屬**（`originsOf`）：從 `X` 往回追資料流，直到撞到一個**能證明它是哪份 config** 的東西 ——
 *     · 型別上有 `schema: "config.<id>@N"` 字面值（Zod 推導型別）
 *     · 查表鍵：`Configs.tryGet("<id>")`／`configDocs.find(c => c.schema === "config.<id>@1")`／
 *       `this.configDoc("<id>", …)`（常數會被解開；⭐ 只認**直接**當引數的鍵，⛔ 不掃引數裡的整棵子樹——
 *       否則 `wallBlockRulesFromDoc(Configs.tryGet(X))` 會在外層就停下來，把 `wallBlock.enabled` 記成 `enabled`）
 *     · 守衛：同一支函式裡 `d.schema === "config.<id>@1"` 收窄過的變數
 *     追的路：屬性鏈 · 變數初始值與賦值 · 解構（含 `...rest`）· **參數 → 呼叫點的實引數**（沿回傳值往下追時
 *     是 context-sensitive 的：那一次呼叫的實引數綁在 `Env` 上）· 類別成員的初始值與**所有** `obj.member = …`
 *     賦值 · 函式回傳值 · 物件字面值的屬性（含 `...spread`）· 三元／`??`／`||` 兩邊 · 陣列 callback 的元素
 *     （`forEach/map/find…` 與 `Object.values/entries`）。
 *  ③ **活性**（`liveness`）：讀取點所在的頂層宣告，必須從**出貨入口**（game-server `cluster/main.ts`／
 *     `index.ts`、client `main.tsx`、content-api `index.ts`）沿「值位置的識別字參照 ＋ 模組載入」走得到。
 *     ⭐ 這一層就是 #1035 的病：`resolveApCoeffOnDoc` 讀了 `cfg.enabled`，⛔ 但沒有任何 production 檔
 *     import 那個模組 —— 一個「存在但跑不到」的消費端**不算**。
 *
 * ── ⭐ 中繼（relay）不算消費 ──────────────────────────────────────────────
 * `enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT.enabled` 這種**把欄位抄進政策物件**的讀，
 * 是第二個住處，⛔ 不是決策；真正的消費端是下游 `if (!rules.enabled)` —— 而②會沿物件字面值把它追回 config。
 * ⇒ 只抄不讀的開關（#1035 的形狀再深一層）在這裡仍然是 **0 個消費端**。
 * （`cond ? a : b` 的 **cond** 位置、`&&`／`||` 的**左**運算元是決策，⛔ 不是中繼。）
 *
 * ── 誠實列出這把尺看不到的 ────────────────────────────────────────────────
 * · **Go**（platform）的消費端：不在 TS 程式裡 ⇒ 由豁免表帶「檔案＋必含字串」的證據，閘會驗證證據還在。
 * · `return d.enabled` 這種**以回傳值中繼**的函式會被算成消費（保守偏綠）。
 * · 一個參數若沒綁在 `Env` 上就退回「所有呼叫點的聯集」；聯集若指向 > `MAX_AMBIGUITY` 份不同 config
 *   ⇒ 當成「追不到」丟掉（⛔ 寧可漏報讓人來看，也不要把一個泛用 helper 的讀算給每一份 config）。
 * · 深度上限 `MAX_DEPTH`；超過就當「追不到」。
 *
 * CLI：`npx tsx src/ops/enabledSwitchesHaveConsumers.ts [--json] [--sites] [--dead]`
 *      `GGD_ENABLED_TRACE=<file>:<line>` 印出那一個讀取點的歸屬軌跡。
 */
import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

// ── 型別 ────────────────────────────────────────────────────────────────────
export interface EnabledSwitch {
  readonly file: string;
  readonly id: string;
  readonly tag: string;
  readonly path: readonly string[];
  readonly value: boolean;
}
export interface Origin {
  readonly tag: string;
  /** 從 config 根到欄位的路徑；`*` 表示任意鍵（record／陣列元素）。 */
  readonly path: readonly string[];
  readonly via: string;
}
export interface ReadSite {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly origins: readonly Origin[];
  /** 從出貨入口走得到（見檔頭③）。 */
  readonly live: boolean;
  /** 只抄進另一個物件的屬性（檔頭「中繼」）。 */
  readonly relay: boolean;
}
export interface LiteralTag {
  readonly tag: string;
  readonly file: string;
  readonly line: number;
}
export interface ScanOptions {
  /** 突變／夾具用：回 true 的讀取點會被當成不存在。 */
  readonly hideSite?: (site: ReadSite) => boolean;
}
export interface ScanResult {
  readonly switches: readonly EnabledSwitch[];
  readonly sites: readonly ReadSite[];
  readonly literalTags: readonly LiteralTag[];
  /** 出貨的每一份 config 的 schema 標籤（含沒有 `enabled` 的）。 */
  readonly shippedTags: ReadonlySet<string>;
  readonly entryFiles: readonly string[];
  readonly deadFiles: readonly string[];
  readonly population: { prodFiles: number; reachableFiles: number; ms: number };
  consumersOf(sw: EnabledSwitch): ReadSite[];
  attributedTo(sw: EnabledSwitch): ReadSite[];
}

export const SRC_ROOTS = ["packages/shared/src", "apps/game-server/src", "apps/client/src", "apps/content-api/src"] as const;
/** 出貨入口（⛔ 不含 admin／editor／tools／scripts —— 那些不是玩家跑到的程式）。 */
export const ENTRY_FILES = [
  "apps/game-server/src/cluster/main.ts",
  "apps/game-server/src/index.ts",
  "apps/client/src/main.tsx",
  "apps/content-api/src/index.ts",
] as const;
const TAG = /^config\.[a-z0-9-]+@\d+$/;
const MAX_DEPTH = 32;
const MAX_AMBIGUITY = 3;
const ELEMENT_CALLBACK_METHODS = new Set(["forEach", "map", "filter", "find", "findLast", "some", "every", "flatMap", "findIndex"]);
const ELEMENT_OF_RECEIVER = new Set(["find", "findLast", "at", "filter", "slice", "reverse", "sort", "values"]);
const PREDICATE_METHODS = new Set(["find", "findLast", "filter", "some"]);
const COMPARE = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken]);
const LOOKUP_CALLEE = /^(get|tryGet|find|findLast|filter|some|configDoc|doc|config|has|lookup|pick)$|Doc$|FromDoc$|^resolve|^load|^fetch|^read|Config$|Policy$|Rules$|Tiers$/;

// ── 檔案 ────────────────────────────────────────────────────────────────────
export function isProductionSource(p: string): boolean {
  if (!/\.tsx?$/.test(p) || /\.d\.ts$/.test(p)) return false;
  if (/\.(test|spec)\.tsx?$/.test(p)) return false;
  if (/\/(__fixtures__|testkit|__tests__|__mocks__)\//.test(p)) return false;
  return true;
}
function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== "node_modules") walk(p, out);
    } else if (isProductionSource(p)) out.push(p);
  }
}
function readConfigDir(root: string): { file: string; id: string; tag: string | undefined; doc: unknown }[] {
  const dir = join(root, "content/config");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => {
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as { id?: string; schema?: string };
      return { file: f, id: doc.id ?? f.replace(/\.json$/, ""), tag: typeof doc.schema === "string" ? doc.schema : undefined, doc };
    });
}

/** 出貨 config 裡的每一格 `enabled`（含巢狀）。⛔ 不寫死 35 —— 從目錄推導。 */
export function shippedEnabledSwitches(root: string): EnabledSwitch[] {
  const out: EnabledSwitch[] = [];
  for (const { file, id, tag, doc } of readConfigDir(root)) {
    const t = tag ?? `config.${id}@1`;
    const visit = (o: unknown, path: string[]): void => {
      if (Array.isArray(o)) o.forEach((v, i) => visit(v, [...path, String(i)]));
      else if (o && typeof o === "object") {
        for (const [k, v] of Object.entries(o)) {
          if (k === "enabled" && typeof v === "boolean") out.push({ file: `content/config/${file}`, id, tag: t, path: [...path, k], value: v });
          visit(v, [...path, k]);
        }
      }
    };
    visit(doc, []);
  }
  return out;
}

// ── 主體 ────────────────────────────────────────────────────────────────────
type Env = { readonly id: number; readonly bind: ReadonlyMap<ts.ParameterDeclaration, { expr: ts.Expression; env: Env }> };
const EMPTY_ENV: Env = { id: 0, bind: new Map() };

export function scanEnabledSwitches(root: string, opts: ScanOptions = {}): ScanResult {
  const t0 = Date.now();
  const switches = shippedEnabledSwitches(root);
  const allTags = new Set<string>();
  const allIds = new Map<string, string>();
  for (const c of readConfigDir(root)) {
    if (!c.tag) continue;
    allTags.add(c.tag);
    allIds.set(c.id, c.tag);
  }
  const trace = process.env["GGD_ENABLED_TRACE"];

  const files: string[] = [];
  for (const r of SRC_ROOTS) walk(join(root, r), files);
  const prodSet = new Set(files);
  const base = ts.readConfigFile(join(root, "tsconfig.base.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(base.config, ts.sys, root);
  const program = ts.createProgram({
    rootNames: files,
    options: { ...parsed.options, noEmit: true, skipLibCheck: true, jsx: ts.JsxEmit.ReactJSX, types: ["node", "vite/client"], incremental: false, tsBuildInfoFile: undefined },
  });
  const checker = program.getTypeChecker();
  const prodFiles = program.getSourceFiles().filter((sf) => prodSet.has(sf.fileName));
  const rel = (p: string) => relative(root, p);
  const line = (n: ts.Node) => n.getSourceFile().getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const where = (n: ts.Node) => `${rel(n.getSourceFile().fileName)}:${line(n)}`;

  // ── 小工具 ──
  const strip = (e: ts.Expression): ts.Expression => {
    for (;;) {
      if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e) || ts.isAwaitExpression(e)) e = e.expression;
      else return e;
    }
  };
  const aliased = (s: ts.Symbol | undefined): ts.Symbol | undefined => (s && s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s);
  const decl = (s: ts.Symbol | undefined): ts.Declaration | undefined => s?.valueDeclaration ?? s?.declarations?.[0];
  const isFnLike = (n: ts.Node): n is ts.FunctionLikeDeclaration => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isConstructorDeclaration(n);
  const schemaTagsOfType = (t: ts.Type): string[] => {
    const out = new Set<string>();
    for (const p of t.isUnion() ? t.types : [t]) {
      const s = p.getProperty("schema");
      if (!s) continue;
      const st = checker.getTypeOfSymbol(s);
      for (const l of st.isUnion() ? st.types : [st]) if (l.isStringLiteral() && TAG.test(l.value)) out.add(l.value);
    }
    return [...out];
  };
  /** 字串字面值／常數識別字 → 值（一跳）。 */
  const literalOf = (e: ts.Expression): string | undefined => {
    e = strip(e);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) {
      const d = decl(aliased(checker.getSymbolAtLocation(ts.isIdentifier(e) ? e : e.name)));
      const init = d && (ts.isVariableDeclaration(d) || ts.isPropertyAssignment(d) || ts.isEnumMember(d)) ? d.initializer : undefined;
      if (init) {
        const i = strip(init);
        if (ts.isStringLiteral(i) || ts.isNoSubstitutionTemplateLiteral(i)) return i.text;
      }
      const t = checker.getTypeAtLocation(e);
      if (t.isStringLiteral()) return t.value;
    }
    return undefined;
  };
  const tagOfKey = (v: string | undefined): string | undefined => (v === undefined ? undefined : TAG.test(v) ? v : allIds.get(v));
  /** 一棵子樹裡的 schema 標籤字面值（給 `find(c => c.schema === "config.x@1")` 用）。 */
  const tagLiteralsIn = (n: ts.Node): Set<string> => {
    const out = new Set<string>();
    const visit = (x: ts.Node): void => {
      if ((ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) && TAG.test(x.text)) out.add(x.text);
      else if ((ts.isIdentifier(x) && !(ts.isPropertyAccessExpression(x.parent) && x.parent.name === x)) || ts.isPropertyAccessExpression(x)) {
        const v = literalOf(x as ts.Expression);
        if (v && TAG.test(v)) out.add(v);
      }
      ts.forEachChild(x, visit);
    };
    visit(n);
    return out;
  };
  /** 查表鍵：⭐ 只認**直接**引數（字面值／常數），callback 只認 find/filter 那一族。 */
  const lookupKeyTags = (call: ts.CallExpression | ts.NewExpression): Set<string> => {
    const out = new Set<string>();
    const callee = strip(call.expression);
    const cname = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
    for (const a of call.arguments ?? []) {
      const s = strip(a);
      if (isFnLike(s)) {
        if (PREDICATE_METHODS.has(cname)) for (const t of tagLiteralsIn(s)) out.add(t);
        continue;
      }
      const v = literalOf(s);
      if (v === undefined) continue;
      if (TAG.test(v)) out.add(v);
      else if (allIds.has(v) && LOOKUP_CALLEE.test(cname)) out.add(allIds.get(v)!);
    }
    return out;
  };

  // ── 名字索引（呼叫點／賦值點先用名字粗篩，再用 symbol 確認）──
  const callsByName = new Map<string, (ts.CallExpression | ts.NewExpression)[]>();
  const assignsByName = new Map<string, ts.BinaryExpression[]>();
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);
  for (const sf of prodFiles) {
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
        const c = strip(n.expression);
        const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : undefined;
        if (name) push(callsByName, name, n);
      } else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const l = strip(n.left);
        if (ts.isPropertyAccessExpression(l)) push(assignsByName, l.name.text, n);
        else if (ts.isIdentifier(l)) push(assignsByName, l.text, n);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  const calleeDecl = (call: ts.CallExpression | ts.NewExpression): ts.Node | undefined => {
    const c = strip(call.expression);
    const nameNode = ts.isIdentifier(c) ? c : ts.isPropertyAccessExpression(c) ? c.name : undefined;
    if (!nameNode) return undefined;
    let d = decl(aliased(checker.getSymbolAtLocation(nameNode)));
    if (d && ts.isVariableDeclaration(d) && d.initializer) {
      const i = strip(d.initializer);
      if (isFnLike(i)) d = i;
    }
    if (ts.isNewExpression(call) && d && ts.isClassDeclaration(d)) d = d.members.find(ts.isConstructorDeclaration) ?? d;
    return d;
  };
  const fnOf = (d: ts.Node | undefined): ts.FunctionLikeDeclaration | undefined => {
    if (!d) return undefined;
    if (isFnLike(d)) return d;
    if (ts.isVariableDeclaration(d) && d.initializer) {
      const i = strip(d.initializer);
      if (isFnLike(i)) return i;
    }
    return undefined;
  };
  const fnName = (f: ts.FunctionLikeDeclaration): string | undefined => {
    if (ts.isConstructorDeclaration(f)) {
      const c = f.parent;
      return ts.isClassDeclaration(c) || ts.isClassExpression(c) ? c.name?.text : undefined;
    }
    if (f.name && ts.isIdentifier(f.name)) return f.name.text;
    const p = f.parent;
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
    return undefined;
  };
  const callSitesOf = (f: ts.FunctionLikeDeclaration): (ts.CallExpression | ts.NewExpression)[] => {
    const name = fnName(f);
    if (!name) return [];
    return (callsByName.get(name) ?? []).filter((c) => {
      const d = calleeDecl(c);
      return d === f || (ts.isConstructorDeclaration(f) && d === f.parent);
    });
  };
  const returnsOf = (f: ts.FunctionLikeDeclaration): ts.Expression[] => {
    if (!f.body) return [];
    if (!ts.isBlock(f.body)) return [f.body];
    const out: ts.Expression[] = [];
    const visit = (n: ts.Node): void => {
      if (isFnLike(n) && n !== f) return;
      if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
      ts.forEachChild(n, visit);
    };
    visit(f.body);
    return out;
  };
  const isMemberDecl = (d: ts.Node | undefined): d is ts.PropertyDeclaration | ts.ParameterDeclaration | ts.GetAccessorDeclaration =>
    !!d && (ts.isPropertyDeclaration(d) || (ts.isParameter(d) && ts.isConstructorDeclaration(d.parent) && ts.getCombinedModifierFlags(d) !== 0) || ts.isGetAccessorDeclaration(d));

  // ── ② 歸屬 ──
  let envSeq = 0;
  const bindEnv = (f: ts.FunctionLikeDeclaration, call: ts.CallExpression | ts.NewExpression, env: Env): Env => {
    const bind = new Map<ts.ParameterDeclaration, { expr: ts.Expression; env: Env }>();
    f.parameters.forEach((p, i) => {
      const a = call.arguments?.[i];
      if (a && !p.dotDotDotToken) bind.set(p, { expr: a, env });
    });
    return { id: ++envSeq, bind };
  };
  const memo = new Map<string, Origin[]>();
  const inFlight = new Set<string>();
  const key = (n: ts.Node, path: readonly string[], env: Env) => `${n.getSourceFile().fileName}:${n.pos}:${n.end}:${path.join(".")}#${env.id}`;
  const uniq = (xs: Origin[]): Origin[] => {
    const seen = new Set<string>();
    return xs.filter((o) => {
      const k = `${o.tag}|${o.path.join(".")}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const capped = (xs: Origin[]): Origin[] => (new Set(xs.map((o) => o.tag)).size > MAX_AMBIGUITY ? [] : xs);
  let traceOn = false;
  let cutoffs = 0;
  const originsOf = (node: ts.Node, path: readonly string[], depth: number, via: string, env: Env): Origin[] => {
    if (depth > MAX_DEPTH) {
      cutoffs++;
      return [];
    }
    const k = key(node, path, env);
    const hit = memo.get(k);
    if (hit && !traceOn) return hit; // trace 時不讀 memo —— 否則別的讀取點先算過的那一段會靜默消失
    if (inFlight.has(k)) return [];
    inFlight.add(k);
    if (traceOn) console.error(`${"  ".repeat(depth)}${where(node)} ${node.getText().slice(0, 60).replace(/\s+/g, " ")}  .${path.join(".")}  env#${env.id}`);
    const before = cutoffs;
    const out = uniq(originsOfWorker(node, path, depth, via, env));
    inFlight.delete(k);
    // ⚠️ 撞到深度上限的結果**不可以**進 memo —— 否則一次深處的截斷會毒到之後較淺的查詢。
    if (cutoffs === before) memo.set(k, out);
    return out;
  };
  const fromCallSites = (f: ts.FunctionLikeDeclaration, index: number, path: readonly string[], depth: number, via: string): Origin[] => {
    const out: Origin[] = [];
    const sites = callSitesOf(f);
    if (traceOn) console.error(`${"  ".repeat(depth + 1)}[call sites of ${fnName(f) ?? "?"}: ${sites.length} / by-name ${(callsByName.get(fnName(f) ?? "") ?? []).length}]`);
    for (const c of sites) {
      const arg = c.arguments?.[index];
      if (arg) out.push(...originsOf(arg, path, depth + 1, `${via}→call@${where(c)}`, EMPTY_ENV));
    }
    return capped(out);
  };
  const fromMember = (d: ts.PropertyDeclaration | ts.ParameterDeclaration | ts.GetAccessorDeclaration, path: readonly string[], depth: number, via: string): Origin[] => {
    const out: Origin[] = [];
    if (ts.isGetAccessorDeclaration(d)) {
      for (const r of returnsOf(d)) out.push(...originsOf(r, path, depth + 1, `${via}→get`, EMPTY_ENV));
      return capped(out);
    }
    if (d.initializer) out.push(...originsOf(d.initializer, path, depth + 1, `${via}→init`, EMPTY_ENV));
    if (ts.isParameter(d)) {
      const ctor = d.parent as ts.ConstructorDeclaration;
      out.push(...fromCallSites(ctor, ctor.parameters.indexOf(d), path, depth, via));
    }
    const name = ts.isIdentifier(d.name) ? d.name.text : undefined;
    if (name) {
      const sym = checker.getSymbolAtLocation(d.name);
      for (const a of assignsByName.get(name) ?? []) {
        const l = strip(a.left);
        if (!ts.isPropertyAccessExpression(l)) continue;
        const s = checker.getSymbolAtLocation(l.name);
        if (s && sym && (s === sym || decl(s) === d)) out.push(...originsOf(a.right, path, depth + 1, `${via}→assign@${where(a)}`, EMPTY_ENV));
      }
    }
    return capped(out);
  };
  const fromParam = (p: ts.ParameterDeclaration, path: readonly string[], depth: number, via: string, env: Env): Origin[] => {
    const bound = env.bind.get(p);
    if (bound) return originsOf(bound.expr, path, depth + 1, `${via}→arg`, bound.env);
    const out: Origin[] = [];
    if (p.initializer) out.push(...originsOf(p.initializer, path, depth + 1, `${via}→default`, EMPTY_ENV));
    const f = p.parent;
    if (!isFnLike(f)) return out;
    const index = f.parameters.indexOf(p);
    // callback 參數：`Y.method(cb)` 的元素 ＝ Y 的 `*`
    const cp = f.parent;
    if ((ts.isArrowFunction(f) || ts.isFunctionExpression(f)) && ts.isCallExpression(cp) && cp.arguments.includes(f as never) && index === 0) {
      const callee = strip(cp.expression);
      if (ts.isPropertyAccessExpression(callee) && ELEMENT_CALLBACK_METHODS.has(callee.name.text)) {
        out.push(...originsOf(callee.expression, ["*", ...path], depth + 1, `${via}→cb(${callee.name.text})`, env));
        return out;
      }
    }
    if (ts.isConstructorDeclaration(f) && ts.getCombinedModifierFlags(p) !== 0) out.push(...fromMember(p, path, depth, via));
    out.push(...fromCallSites(f, index, path, depth, via));
    return out;
  };
  const fromSymbol = (sym: ts.Symbol | undefined, path: readonly string[], depth: number, via: string, at: ts.Node, env: Env): Origin[] => {
    const d = decl(aliased(sym));
    if (!d) return [];
    const out: Origin[] = [];
    if (ts.isVariableDeclaration(d)) {
      if (d.initializer) out.push(...originsOf(d.initializer, path, depth + 1, `${via}→var`, env));
      const list = d.parent;
      if (ts.isVariableDeclarationList(list) && ts.isForOfStatement(list.parent)) out.push(...originsOf(list.parent.expression, ["*", ...path], depth + 1, `${via}→for-of`, env));
      if (ts.isIdentifier(d.name)) {
        for (const a of assignsByName.get(d.name.text) ?? []) {
          const l = strip(a.left);
          if (ts.isIdentifier(l) && checker.getSymbolAtLocation(l) === sym) out.push(...originsOf(a.right, path, depth + 1, `${via}→assign`, env));
        }
        if (out.length === 0) out.push(...fromGuard(sym, at, path, via));
      }
    } else if (ts.isBindingElement(d)) {
      out.push(...fromBinding(d, path, depth, via, env));
    } else if (ts.isParameter(d)) {
      out.push(...fromParam(d, path, depth, via, env));
      if (out.length === 0 && ts.isIdentifier(d.name)) out.push(...fromGuard(sym, at, path, via));
    } else if (isMemberDecl(d)) {
      out.push(...fromMember(d, path, depth, via));
    } else if (ts.isShorthandPropertyAssignment(d)) {
      out.push(...fromSymbol(checker.getShorthandAssignmentValueSymbol(d), path, depth + 1, via, at, env));
    } else if (ts.isPropertyAssignment(d)) {
      out.push(...originsOf(d.initializer, path, depth + 1, `${via}→prop`, env));
    }
    return out;
  };
  /** 守衛：同一支函式裡 `x.schema === "config.<id>@1"`（含常數）。 */
  const fromGuard = (sym: ts.Symbol | undefined, at: ts.Node, path: readonly string[], via: string): Origin[] => {
    let scope: ts.Node = at;
    while (scope.parent && !isFnLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
    const tags = new Set<string>();
    const EQ = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken]);
    const visit = (n: ts.Node): void => {
      if (ts.isBinaryExpression(n) && EQ.has(n.operatorToken.kind)) {
        for (const [a, b] of [[n.left, n.right], [n.right, n.left]] as const) {
          const l = strip(a);
          if (ts.isPropertyAccessExpression(l) && l.name.text === "schema") {
            const rootE = strip(l.expression);
            if (ts.isIdentifier(rootE) && checker.getSymbolAtLocation(rootE) === sym) {
              const t = tagOfKey(literalOf(b));
              if (t) tags.add(t);
            }
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(scope);
    return tags.size === 1 ? [{ tag: [...tags][0]!, path, via: `${via}→guard` }] : [];
  };
  const fromBinding = (be: ts.BindingElement, path: readonly string[], depth: number, via: string, env: Env): Origin[] => {
    const pattern = be.parent;
    let p2: readonly string[];
    if (be.dotDotDotToken) p2 = path; // `...rest` ＝ 同一個物件少幾個鍵
    else if (ts.isObjectBindingPattern(pattern)) {
      const pn = be.propertyName ?? be.name;
      p2 = [ts.isIdentifier(pn) || ts.isStringLiteral(pn) ? pn.text : "*", ...path];
    } else p2 = [String(pattern.elements.indexOf(be)), ...path];
    const holder = pattern.parent;
    if (ts.isVariableDeclaration(holder)) {
      if (holder.initializer) return originsOf(holder.initializer, p2, depth + 1, `${via}→destructure`, env);
      const list = holder.parent;
      if (ts.isVariableDeclarationList(list) && ts.isForOfStatement(list.parent)) return originsOf(list.parent.expression, ["*", ...p2], depth + 1, `${via}→for-of`, env);
      return [];
    }
    if (ts.isParameter(holder)) return fromParam(holder, p2, depth, `${via}→destructure`, env);
    if (ts.isBindingElement(holder)) return fromBinding(holder, p2, depth, via, env);
    return [];
  };
  const originsOfWorker = (node: ts.Node, path: readonly string[], depth: number, via: string, env: Env): Origin[] => {
    if (!ts.isExpression(node)) return [];
    const e = strip(node);
    if (path.length > 0) {
      const tags = schemaTagsOfType(checker.getTypeAtLocation(e));
      if (tags.length === 1) return [{ tag: tags[0]!, path, via: `${via}→type` }];
    }
    if (ts.isIdentifier(e)) return fromSymbol(checker.getSymbolAtLocation(e), path, depth, via, e, env);
    if (ts.isPropertyAccessExpression(e)) {
      const d = decl(checker.getSymbolAtLocation(e.name));
      const out: Origin[] = [];
      if (isMemberDecl(d)) out.push(...fromMember(d, path, depth, `${via}→member(${e.name.text})`));
      else if (d && ts.isPropertyAssignment(d) && path.length > 0) out.push(...originsOf(d.initializer, path, depth + 1, `${via}→prop(${e.name.text})`, env));
      else if (d && ts.isShorthandPropertyAssignment(d)) out.push(...fromSymbol(checker.getShorthandAssignmentValueSymbol(d), path, depth + 1, via, e, env));
      if (out.length === 0) out.push(...originsOf(e.expression, [e.name.text, ...path], depth + 1, via, env));
      return out;
    }
    if (ts.isElementAccessExpression(e)) {
      const lit = literalOf(e.argumentExpression);
      return originsOf(e.expression, [lit ?? "*", ...path], depth + 1, via, env);
    }
    if (ts.isCallExpression(e) || ts.isNewExpression(e)) {
      const callee = strip(e.expression);
      if (ts.isCallExpression(e) && ts.isIdentifier(callee) && callee.text === "structuredClone" && e.arguments[0]) return originsOf(e.arguments[0], path, depth + 1, `${via}→clone`, env);
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "Object" && e.arguments[0]) {
        if (callee.name.text === "freeze") return originsOf(e.arguments[0], path, depth + 1, `${via}→freeze`, env);
        if (callee.name.text === "assign") return e.arguments.flatMap((a) => originsOf(a, path, depth + 1, `${via}→assign`, env));
        if (callee.name.text === "values") return originsOf(e.arguments[0], path[0] === "*" ? path : ["*", ...path], depth + 1, `${via}→Object.values`, env);
        if (callee.name.text === "entries") {
          if (path[0] === "*" && path[1] === "0") return [];
          const rest = path[0] === "*" && path[1] === "1" ? path.slice(2) : path[0] === "*" ? path.slice(1) : path;
          return originsOf(e.arguments[0], ["*", ...rest], depth + 1, `${via}→Object.entries`, env);
        }
      }
      const keys = lookupKeyTags(e);
      if (keys.size === 1) return [{ tag: [...keys][0]!, path, via: `${via}→key` }];
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(callee)) {
        const m = callee.name.text;
        if (m === "map" || m === "flatMap") {
          const cb = e.arguments[0] && strip(e.arguments[0]);
          if (cb && isFnLike(cb)) return returnsOf(cb).flatMap((r) => originsOf(r, path[0] === "*" ? path.slice(1) : path, depth + 1, `${via}→${m}`, env));
        }
      }
      const f = fnOf(calleeDecl(e));
      if (f && f.body && prodSet.has(f.getSourceFile().fileName)) {
        const env2 = bindEnv(f, e, env);
        return returnsOf(f).flatMap((r) => originsOf(r, path, depth + 1, `${via}→ret(${fnName(f) ?? "?"})`, env2));
      }
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(callee) && ELEMENT_OF_RECEIVER.has(callee.name.text))
        return originsOf(callee.expression, ["*", ...path], depth + 1, `${via}→${callee.name.text}`, env);
      return [];
    }
    if (ts.isObjectLiteralExpression(e)) {
      if (path.length === 0) return [];
      const [p0, ...rest] = path;
      const out: Origin[] = [];
      for (const prop of e.properties) {
        const nm = prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) ? prop.name.text : undefined;
        if (ts.isSpreadAssignment(prop)) out.push(...originsOf(prop.expression, path, depth + 1, `${via}→spread`, env));
        else if (nm !== undefined && (nm === p0 || p0 === "*")) {
          if (ts.isPropertyAssignment(prop)) out.push(...originsOf(prop.initializer, rest, depth + 1, `${via}→{${nm}}`, env));
          else if (ts.isShorthandPropertyAssignment(prop)) out.push(...fromSymbol(checker.getShorthandAssignmentValueSymbol(prop), rest, depth + 1, `${via}→{${nm}}`, prop, env));
          else if (ts.isMethodDeclaration(prop) || ts.isGetAccessorDeclaration(prop)) out.push(...returnsOf(prop).flatMap((r) => originsOf(r, rest, depth + 1, `${via}→{${nm}()}`, env)));
        }
      }
      return out;
    }
    if (ts.isArrayLiteralExpression(e)) {
      if (path[0] !== "*" && !/^\d+$/.test(path[0] ?? "")) return [];
      const rest = path.slice(1);
      return e.elements.flatMap((x) => (ts.isSpreadElement(x) ? originsOf(x.expression, path, depth + 1, via, env) : originsOf(x, rest, depth + 1, via, env)));
    }
    if (ts.isConditionalExpression(e)) {
      const branches = [...originsOf(e.whenTrue, path, depth + 1, via, env), ...originsOf(e.whenFalse, path, depth + 1, via, env)];
      // `d.enabled === false ? false : true` —— 值是**條件**的函數；只在追「值本身」（path 空）時跟進去。
      return branches.length > 0 || path.length > 0 ? branches : originsOf(e.condition, path, depth + 1, `${via}→cond`, env);
    }
    if (ts.isBinaryExpression(e)) {
      const k = e.operatorToken.kind;
      if (k === ts.SyntaxKind.QuestionQuestionToken || k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.AmpersandAmpersandToken)
        return [...originsOf(e.left, path, depth + 1, via, env), ...originsOf(e.right, path, depth + 1, via, env)];
      if (k === ts.SyntaxKind.CommaToken || k === ts.SyntaxKind.EqualsToken) return originsOf(e.right, path, depth + 1, via, env);
      if (path.length === 0 && COMPARE.has(k)) return [...originsOf(e.left, path, depth + 1, via, env), ...originsOf(e.right, path, depth + 1, via, env)];
      return [];
    }
    if (path.length === 0 && ((ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) || ts.isTypeOfExpression(e))) return originsOf(ts.isPrefixUnaryExpression(e) ? e.operand : e.expression, path, depth + 1, via, env);
    if (ts.isSpreadElement(e)) return originsOf(e.expression, path, depth + 1, via, env);
    return [];
  };

  // ── ③ 活性 ──
  const topOf = (n: ts.Node): ts.Node => {
    let cur = n;
    while (cur.parent && !ts.isSourceFile(cur.parent)) cur = cur.parent;
    return cur;
  };
  const inFnBody = (n: ts.Node): boolean => {
    for (let cur: ts.Node | undefined = n.parent; cur && !ts.isSourceFile(cur); cur = cur.parent) if (isFnLike(cur)) return true;
    return false;
  };
  /** 參照的來源節點：在函式體裡 ⇒ 該頂層宣告；否則 ⇒ 檔案（模組載入時執行）。 */
  const sourceNode = (n: ts.Node): ts.Node => (inFnBody(n) ? topOf(n) : n.getSourceFile());
  const edges = new Map<ts.Node, Set<ts.Node>>();
  const addEdge = (a: ts.Node, b: ts.Node) => (edges.get(a) ?? edges.set(a, new Set()).get(a)!).add(b);
  const topNames = new Set<string>();
  for (const sf of prodFiles) {
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && st.importClause) {
        if (st.importClause.name) topNames.add(st.importClause.name.text);
        const nb = st.importClause.namedBindings;
        if (nb) {
          if (ts.isNamespaceImport(nb)) topNames.add(nb.name.text);
          else for (const s of nb.elements) topNames.add(s.name.text);
        }
      }
      const collect = (n: ts.Node): void => {
        if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isEnumDeclaration(n) || ts.isVariableDeclaration(n) || ts.isBindingElement(n)) && n.name && ts.isIdentifier(n.name)) topNames.add(n.name.text);
        if (ts.isVariableStatement(n) || ts.isVariableDeclarationList(n) || ts.isVariableDeclaration(n) || ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n) || ts.isBindingElement(n)) ts.forEachChild(n, collect);
      };
      collect(st);
    }
  }
  const moduleOf = (spec: ts.Expression): ts.SourceFile | undefined => {
    const d = checker.getSymbolAtLocation(spec)?.declarations?.[0];
    return d && ts.isSourceFile(d) ? d : undefined;
  };
  const isDeclName = (id: ts.Identifier): boolean => {
    const p = id.parent;
    return (
      ((ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p) || ts.isParameter(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isPropertyAssignment(p) || ts.isEnumMember(p) || ts.isBindingElement(p) || ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodSignature(p) || ts.isEnumDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p) || ts.isLabeledStatement(p) || ts.isJsxAttribute(p)) && (p as { name?: ts.Node }).name === id) ||
      ts.isExportSpecifier(p) ||
      (ts.isPropertyAccessExpression(p) && p.name === id) ||
      ts.isQualifiedName(p)
    );
  };
  for (const sf of prodFiles) {
    const usedImports = new Set<ts.ImportDeclaration>();
    const visit = (n: ts.Node): void => {
      if (ts.isTypeNode(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isImportDeclaration(n) || ts.isImportEqualsDeclaration(n) || ts.isExportDeclaration(n)) return;
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0]) {
        const m = moduleOf(n.arguments[0]);
        if (m) {
          addEdge(sourceNode(n), m);
          for (const st of m.statements) addEdge(sourceNode(n), st); // 動態 import：保守當成全部可達
        }
      }
      if (ts.isIdentifier(n) && topNames.has(n.text) && !isDeclName(n)) {
        const raw = checker.getSymbolAtLocation(n);
        const s = aliased(raw);
        if (raw && raw !== s) {
          const ad = raw.declarations?.[0];
          const imp = ad && (ts.isImportSpecifier(ad) ? ad.parent.parent.parent : ts.isNamespaceImport(ad) ? ad.parent.parent : ts.isImportClause(ad) ? ad.parent : undefined);
          if (imp && ts.isImportDeclaration(imp)) usedImports.add(imp);
        }
        for (const d of s?.declarations ?? []) {
          if (!prodSet.has(d.getSourceFile().fileName)) continue;
          addEdge(sourceNode(n), ts.isSourceFile(d) ? d : topOf(d));
        }
      }
      if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
        const rd = checker.getSymbolAtLocation(n.expression)?.declarations?.[0];
        if (rd && ts.isNamespaceImport(rd)) {
          const ms = aliased(checker.getSymbolAtLocation(n.name));
          for (const d of ms?.declarations ?? []) if (prodSet.has(d.getSourceFile().fileName)) addEdge(sourceNode(n), topOf(d));
          if (ts.isImportDeclaration(rd.parent.parent)) usedImports.add(rd.parent.parent);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && st.moduleSpecifier) {
        const nb = st.importClause?.namedBindings;
        const typeOnly = st.importClause?.isTypeOnly || (nb && ts.isNamedImports(nb) && nb.elements.every((e) => e.isTypeOnly));
        if (typeOnly) continue;
        if (st.importClause && !usedImports.has(st)) continue; // 只當型別用 ⇒ 會被 elide
        const m = moduleOf(st.moduleSpecifier);
        if (m) addEdge(sf, m);
      } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && !st.isTypeOnly) {
        const m = moduleOf(st.moduleSpecifier);
        if (m) addEdge(sf, m);
      }
    }
  }
  const live = new Set<ts.Node>();
  const entryFiles = ENTRY_FILES.map((f) => join(root, f)).filter((f) => prodSet.has(f));
  const queue: ts.Node[] = entryFiles.map((f) => program.getSourceFile(f)).filter((x): x is ts.SourceFile => !!x);
  while (queue.length) {
    const n = queue.pop()!;
    if (live.has(n)) continue;
    live.add(n);
    // 一個頂層宣告活著 ⇒ 它的模組一定被載入過（模組層初始化也跑了）
    if (!ts.isSourceFile(n)) queue.push(n.getSourceFile());
    for (const m of edges.get(n) ?? []) if (!live.has(m)) queue.push(m);
  }
  const isLive = (n: ts.Node): boolean => live.has(sourceNode(n));

  // ── ① 讀取點 ──
  const sites: ReadSite[] = [];
  const literalTags: LiteralTag[] = [];
  const isRelay = (read: ts.Node): boolean => {
    let cur: ts.Node = read;
    let guarded = false; // 經過 `typeof x` 或 `x === 字面值` ⇒ 那是抄寫前的型別守衛，⛔ 不是決策
    for (;;) {
      const p: ts.Node = cur.parent;
      if (!p) return false;
      if (ts.isConditionalExpression(p)) {
        if (p.condition === cur && !guarded) return false;
        cur = p;
        continue;
      }
      if (ts.isTypeOfExpression(p)) guarded = true;
      if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p) || ts.isTypeAssertionExpression(p) || ts.isSatisfiesExpression(p) || ts.isTypeOfExpression(p) || (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken)) {
        cur = p;
        continue;
      }
      if (ts.isBinaryExpression(p)) {
        const k = p.operatorToken.kind;
        if (k === ts.SyntaxKind.EqualsToken) {
          if (p.left === cur) return false;
          const l = strip(p.left);
          return ts.isPropertyAccessExpression(l) || ts.isElementAccessExpression(l);
        }
        if ((k === ts.SyntaxKind.AmpersandAmpersandToken || k === ts.SyntaxKind.BarBarToken) && p.left === cur && !guarded) return false;
        if (COMPARE.has(k)) guarded = true;
        cur = p;
        continue;
      }
      if (ts.isCallExpression(p) && p.arguments.includes(cur as ts.Expression)) {
        cur = p;
        continue;
      }
      return ts.isPropertyAssignment(p) && p.initializer === cur;
    }
  };
  for (const sf of prodFiles) {
    const visit = (n: ts.Node): void => {
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && TAG.test(n.text)) literalTags.push({ tag: n.text, file: rel(sf.fileName), line: line(n) });
      let recv: ts.Expression | undefined;
      if (ts.isPropertyAccessExpression(n) && n.name.text === "enabled") recv = n.expression;
      else if (ts.isElementAccessExpression(n) && literalOf(n.argumentExpression) === "enabled") recv = n.expression;
      if (recv) {
        const p = n.parent;
        const isWrite = (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && p.left === n) || ts.isDeleteExpression(p) || ((ts.isPostfixUnaryExpression(p) || ts.isPrefixUnaryExpression(p)) && (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken));
        if (!isWrite) {
          traceOn = !!trace && where(n) === trace;
          const origins = originsOf(recv, ["enabled"], 0, "", EMPTY_ENV);
          traceOn = false;
          sites.push({ file: rel(sf.fileName), line: line(n), text: n.getText(sf).slice(0, 80), origins, live: isLive(n), relay: isRelay(n) });
        }
      } else if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent) && !n.dotDotDotToken) {
        const pn = n.propertyName ?? n.name;
        if ((ts.isIdentifier(pn) || ts.isStringLiteral(pn)) && pn.text === "enabled") {
          traceOn = !!trace && where(n) === trace;
          const origins = uniq(fromBinding(n, [], 0, "", EMPTY_ENV));
          traceOn = false;
          sites.push({ file: rel(sf.fileName), line: line(n), text: n.parent.parent.getText(sf).slice(0, 80), origins, live: isLive(n), relay: false });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  const hide = opts.hideSite;
  const kept = hide ? sites.filter((s) => !hide(s)) : sites;
  const matches = (o: Origin, sw: EnabledSwitch): boolean => o.tag === sw.tag && o.path.length === sw.path.length && o.path.every((seg, i) => seg === "*" || seg === sw.path[i]);
  const deadFiles = prodFiles.filter((sf) => !live.has(sf)).map((sf) => rel(sf.fileName)).sort();
  return {
    switches,
    sites: kept,
    literalTags,
    shippedTags: allTags,
    entryFiles: entryFiles.map(rel),
    deadFiles,
    population: { prodFiles: prodFiles.length, reachableFiles: prodFiles.length - deadFiles.length, ms: Date.now() - t0 },
    consumersOf: (sw) => kept.filter((s) => s.live && !s.relay && s.origins.some((o) => matches(o, sw))),
    attributedTo: (sw) => kept.filter((s) => s.origins.some((o) => matches(o, sw))),
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (process.argv[1] && basename(process.argv[1]).startsWith("enabledSwitchesHaveConsumers")) {
  const root = join(import.meta.dirname ?? ".", "../../../..");
  const res = scanEnabledSwitches(root);
  const rows = res.switches.map((sw) => {
    const c = res.consumersOf(sw);
    const any = res.attributedTo(sw);
    return {
      file: sw.file,
      path: sw.path.join("."),
      value: sw.value,
      consumers: c.map((s) => `${s.file}:${s.line}`),
      attributedButNotConsuming: any.filter((s) => !c.includes(s)).map((s) => `${s.file}:${s.line}${s.live ? "" : " (dead)"}${s.relay ? " (relay)" : ""}`),
    };
  });
  if (process.argv.includes("--json")) console.log(JSON.stringify({ population: res.population, entryFiles: res.entryFiles, rows, deadFiles: res.deadFiles }, null, 2));
  else {
    console.log(`prodFiles=${res.population.prodFiles} reachableFiles=${res.population.reachableFiles} sites=${res.sites.length} ms=${res.population.ms}`);
    for (const r of rows) console.log(`${r.consumers.length ? "✅" : "⛔"} ${r.file}:${r.path}=${r.value}  ${r.consumers.slice(0, 3).join(", ")}${r.consumers.length ? "" : "  | " + r.attributedButNotConsuming.slice(0, 3).join(", ")}`);
  }
  if (process.argv.includes("--sites")) for (const s of res.sites) console.log(`${s.live ? "L" : "d"}${s.relay ? "r" : " "} ${s.file}:${s.line} ${s.text}  ⇒ ${s.origins.map((o) => `${o.tag}#${o.path.join(".")} (${o.via})`).join(" | ") || "—"}`);
  if (process.argv.includes("--dead")) for (const f of res.deadFiles) console.log(`dead ${f}`);
}

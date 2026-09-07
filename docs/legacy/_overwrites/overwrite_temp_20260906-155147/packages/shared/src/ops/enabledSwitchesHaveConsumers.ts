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
 *       `this.configDoc("<id>", …)`（⭐ 常數會被解開，⛔ 不是字串比對——它要求那個字面值就是**查表的鍵**）
 *     · 守衛：同一支函式裡 `d.schema === "config.<id>@1"` 收窄過的變數
 *     追的路：屬性鏈 · 變數初始值 · 解構 · **參數 → 呼叫點的實引數** · 類別成員的初始值與**所有**
 *     `obj.member = …` 賦值 · 函式回傳值 · 物件字面值的屬性（含 `...spread`）· 三元／`??`／`||` 兩邊 ·
 *     陣列 callback 的元素（`forEach/map/find…` 與 `Object.values/entries`）。
 *  ③ **活性**（`liveness`）：讀取點所在的頂層宣告，必須從**出貨入口**（game-server `cluster/main.ts`／
 *     `index.ts`、client `main.tsx`、content-api `index.ts`）沿「值位置的識別字參照 ＋ 模組載入」走得到。
 *     ⭐ 這一層就是 #1035 的病：`resolveApCoeffOnDoc` 讀了 `cfg.enabled`，⛔ 但沒有任何 production 檔
 *     import 那個模組 —— 一個「存在但跑不到」的消費端**不算**。
 *
 * ── ⭐ 中繼（relay）不算消費 ──────────────────────────────────────────────
 * `enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT.enabled` 這種**把欄位抄進政策物件**的讀，
 * 是第二個住處，⛔ 不是決策；真正的消費端是下游 `if (!rules.enabled)` —— 而②會沿物件字面值把它追回 config。
 * ⇒ 只抄不讀的開關（#1035 的形狀再深一層）在這裡仍然是 **0 個消費端**。
 *
 * ── 誠實列出這把尺看不到的 ────────────────────────────────────────────────
 * · **Go**（platform）的消費端：不在 TS 程式裡 ⇒ 由豁免表帶「檔案＋必含字串」的證據，閘會驗證證據還在。
 * · `return d.enabled` 這種**以回傳值中繼**的函式會被算成消費（保守偏綠）。
 * · 深度上限 `MAX_DEPTH`；超過就當「追不到」（保守偏紅——它會被列成 unattributed 讓人看）。
 *
 * CLI：`npx tsx src/ops/enabledSwitchesHaveConsumers.ts [--json] [--sites]`
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
  readonly shippedTags: ReadonlySet<string>;
  readonly entryFiles: readonly string[];
  readonly population: { prodFiles: number; reachableFiles: number; ms: number };
  consumersOf(sw: EnabledSwitch): ReadSite[];
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
const MAX_DEPTH = 14;
const ARRAY_ELEMENT_METHODS = new Set(["forEach", "map", "filter", "find", "findLast", "some", "every", "flatMap", "findIndex", "at", "slice", "reverse", "sort", "values", "filter"]);
const ELEMENT_OF_RECEIVER = new Set(["find", "findLast", "at", "filter", "slice", "reverse", "sort", "values"]);

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

/** 出貨 config 裡的每一格 `enabled`（含巢狀）。⛔ 不寫死 35 —— 從目錄推導。 */
export function shippedEnabledSwitches(root: string): EnabledSwitch[] {
  const dir = join(root, "content/config");
  const out: EnabledSwitch[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort()) {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as { id?: string; schema?: string };
    const id = doc.id ?? f.replace(/\.json$/, "");
    const tag = typeof doc.schema === "string" ? doc.schema : `config.${id}@1`;
    const visit = (o: unknown, path: string[]): void => {
      if (Array.isArray(o)) o.forEach((v, i) => visit(v, [...path, String(i)]));
      else if (o && typeof o === "object") {
        for (const [k, v] of Object.entries(o)) {
          if (k === "enabled" && typeof v === "boolean") out.push({ file: `content/config/${f}`, id, tag, path: [...path, k], value: v });
          visit(v, [...path, k]);
        }
      }
    };
    visit(doc, []);
  }
  return out;
}

// ── 主體 ────────────────────────────────────────────────────────────────────
export function scanEnabledSwitches(root: string, opts: ScanOptions = {}): ScanResult {
  const t0 = Date.now();
  const switches = shippedEnabledSwitches(root);
  const shippedTags = new Set(switches.map((s) => s.tag));
  const idToTag = new Map<string, string>();
  for (const s of switches) idToTag.set(s.id, s.tag);
  // ⭐ 沒有 `enabled` 的 config 也算「存在」——反方向要用到（讀了一份不存在的 config 才紅）。
  const allTags = new Set<string>();
  const allIds = new Map<string, string>();
  for (const f of readdirSync(join(root, "content/config")).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
    const d = JSON.parse(readFileSync(join(root, "content/config", f), "utf8")) as { id?: string; schema?: string };
    if (typeof d.schema === "string") {
      allTags.add(d.schema);
      allIds.set(d.id ?? f.replace(/\.json$/, ""), d.schema);
    }
  }

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
      if (d && ts.isVariableDeclaration(d) && d.initializer) {
        const i = strip(d.initializer);
        if (ts.isStringLiteral(i) || ts.isNoSubstitutionTemplateLiteral(i)) return i.text;
      }
      if (d && ts.isPropertyAssignment(d)) {
        const i = strip(d.initializer);
        if (ts.isStringLiteral(i) || ts.isNoSubstitutionTemplateLiteral(i)) return i.text;
      }
      if (d && ts.isEnumMember(d) && d.initializer && ts.isStringLiteral(d.initializer)) return d.initializer.text;
      // 型別是單一字串字面值（`const X = "..." as const` 之類）
      const t = checker.getTypeAtLocation(e);
      if (t.isStringLiteral()) return t.value;
    }
    return undefined;
  };
  const tagOfKey = (v: string | undefined): string | undefined => (v === undefined ? undefined : TAG.test(v) ? v : allIds.get(v));
  /** 一個子樹裡所有能當 config 查表鍵的字面值（含常數解開）→ 標籤集合。 */
  const keyTagsIn = (n: ts.Node): Set<string> => {
    const out = new Set<string>();
    const visit = (x: ts.Node): void => {
      if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) {
        const t = tagOfKey(x.text);
        if (t) out.add(t);
      } else if (ts.isIdentifier(x) && !(ts.isPropertyAccessExpression(x.parent) && x.parent.name === x) && /^[A-Z][A-Z0-9_]+$/.test(x.text)) {
        const t = tagOfKey(literalOf(x));
        if (t) out.add(t);
      } else if (ts.isPropertyAccessExpression(x) && /^[A-Z][A-Z0-9_]+$/.test(x.name.text)) {
        const t = tagOfKey(literalOf(x));
        if (t) out.add(t);
      }
      ts.forEachChild(x, visit);
    };
    visit(n);
    return out;
  };

  // ── 名字索引（呼叫點／賦值點都先用名字粗篩，再用 symbol 確認）──
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
  const sameDecl = (a: ts.Node | undefined, b: ts.Node | undefined): boolean => !!a && !!b && a === b;
  const calleeDecl = (call: ts.CallExpression | ts.NewExpression): ts.Node | undefined => {
    const c = strip(call.expression);
    const nameNode = ts.isIdentifier(c) ? c : ts.isPropertyAccessExpression(c) ? c.name : undefined;
    if (!nameNode) return undefined;
    const s = aliased(checker.getSymbolAtLocation(nameNode));
    let d = decl(s);
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
      return sameDecl(d, f) || (ts.isConstructorDeclaration(f) && sameDecl(d, f.parent));
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
  const memo = new Map<string, Origin[]>();
  const inFlight = new Set<string>();
  const key = (n: ts.Node, path: readonly string[]) => `${n.getSourceFile().fileName}:${n.pos}:${n.end}:${path.join(".")}`;
  const originsOf = (node: ts.Node, path: readonly string[], depth: number, via: string): Origin[] => {
    if (depth > MAX_DEPTH) return [];
    const k = key(node, path);
    const hit = memo.get(k);
    if (hit) return hit;
    if (inFlight.has(k)) return [];
    inFlight.add(k);
    const out = originsOfWorker(node, path, depth, via);
    inFlight.delete(k);
    memo.set(k, out);
    return out;
  };
  const uniq = (xs: Origin[]): Origin[] => {
    const seen = new Set<string>();
    return xs.filter((o) => {
      const k = `${o.tag}|${o.path.join(".")}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const fromCallSites = (f: ts.FunctionLikeDeclaration, index: number, path: readonly string[], depth: number, via: string): Origin[] => {
    const out: Origin[] = [];
    for (const c of callSitesOf(f)) {
      const arg = c.arguments?.[index];
      if (arg) out.push(...originsOf(arg, path, depth + 1, `${via}→call@${rel(c.getSourceFile().fileName)}:${line(c)}`));
    }
    return out;
  };
  const line = (n: ts.Node) => n.getSourceFile().getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const fromMember = (d: ts.PropertyDeclaration | ts.ParameterDeclaration | ts.GetAccessorDeclaration, path: readonly string[], depth: number, via: string): Origin[] => {
    const out: Origin[] = [];
    if (ts.isGetAccessorDeclaration(d)) {
      for (const r of returnsOf(d)) out.push(...originsOf(r, path, depth + 1, `${via}→get`));
      return out;
    }
    if (d.initializer) out.push(...originsOf(d.initializer, path, depth + 1, `${via}→init`));
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
        if (s && sym && (s === sym || decl(s) === d)) out.push(...originsOf(a.right, path, depth + 1, `${via}→assign@${rel(a.getSourceFile().fileName)}:${line(a)}`));
      }
    }
    return out;
  };
  const fromParam = (p: ts.ParameterDeclaration, path: readonly string[], depth: number, via: string): Origin[] => {
    const out: Origin[] = [];
    if (p.initializer) out.push(...originsOf(p.initializer, path, depth + 1, `${via}→default`));
    const f = p.parent;
    if (!isFnLike(f)) return out;
    const index = f.parameters.indexOf(p);
    // callback 參數：`Y.method(cb)` 的元素 ＝ Y 的 `*`
    const cp = f.parent;
    if ((ts.isArrowFunction(f) || ts.isFunctionExpression(f)) && ts.isCallExpression(cp) && cp.arguments.includes(f as never) && index === 0) {
      const callee = strip(cp.expression);
      if (ts.isPropertyAccessExpression(callee) && ARRAY_ELEMENT_METHODS.has(callee.name.text)) {
        out.push(...originsOf(callee.expression, ["*", ...path], depth + 1, `${via}→cb(${callee.name.text})`));
        return out;
      }
    }
    if (ts.isConstructorDeclaration(f) && ts.getCombinedModifierFlags(p) !== 0) out.push(...fromMember(p, path, depth, via));
    out.push(...fromCallSites(f, index, path, depth, via));
    return out;
  };
  const fromSymbol = (sym: ts.Symbol | undefined, path: readonly string[], depth: number, via: string, at: ts.Node): Origin[] => {
    const d = decl(aliased(sym));
    if (!d) return [];
    const out: Origin[] = [];
    if (ts.isVariableDeclaration(d)) {
      if (d.initializer) out.push(...originsOf(d.initializer, path, depth + 1, `${via}→var`));
      // `for (const v of X)` —— 元素
      const list = d.parent;
      if (ts.isVariableDeclarationList(list) && ts.isForOfStatement(list.parent)) out.push(...originsOf(list.parent.expression, ["*", ...path], depth + 1, `${via}→for-of`));
      // `let x; x = …`
      if (ts.isIdentifier(d.name)) {
        for (const a of assignsByName.get(d.name.text) ?? []) {
          const l = strip(a.left);
          if (ts.isIdentifier(l) && checker.getSymbolAtLocation(l) === sym) out.push(...originsOf(a.right, path, depth + 1, `${via}→assign`));
        }
      }
      if (out.length === 0 && ts.isIdentifier(d.name)) out.push(...fromGuard(d.name.text, sym, at, path, via));
    } else if (ts.isBindingElement(d)) {
      out.push(...fromBinding(d, path, depth, via));
    } else if (ts.isParameter(d)) {
      out.push(...fromParam(d, path, depth, via));
      if (out.length === 0 && ts.isIdentifier(d.name)) out.push(...fromGuard(d.name.text, sym, at, path, via));
    } else if (isMemberDecl(d)) {
      out.push(...fromMember(d, path, depth, via));
    } else if (ts.isShorthandPropertyAssignment(d)) {
      out.push(...fromSymbol(checker.getShorthandAssignmentValueSymbol(d), path, depth + 1, via, at));
    } else if (ts.isPropertyAssignment(d)) {
      out.push(...originsOf(d.initializer, path, depth + 1, `${via}→prop`));
    } else if (ts.isFunctionDeclaration(d) || ts.isClassDeclaration(d)) {
      // 直接引用函式／類別本身（不是呼叫）——不追
    }
    return out;
  };
  /** 守衛：同一支函式裡 `x.schema === "config.<id>@1"`（含常數）。 */
  const fromGuard = (name: string, sym: ts.Symbol | undefined, at: ts.Node, path: readonly string[], via: string): Origin[] => {
    let scope: ts.Node = at;
    while (scope.parent && !isFnLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
    const tags = new Set<string>();
    const visit = (n: ts.Node): void => {
      if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(n.operatorToken.kind)) {
        for (const [a, b] of [[n.left, n.right], [n.right, n.left]] as const) {
          const l = strip(a);
          if (ts.isPropertyAccessExpression(l) && l.name.text === "schema") {
            const rootE = strip(l.expression);
            const rootSym = ts.isIdentifier(rootE) ? checker.getSymbolAtLocation(rootE) : undefined;
            const ok = rootSym === sym || (ts.isIdentifier(rootE) && rootE.text === name && !rootSym);
            const t = tagOfKey(literalOf(b));
            if (ok && t) tags.add(t);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(scope);
    return tags.size === 1 ? [{ tag: [...tags][0]!, path, via: `${via}→guard` }] : [];
  };
  const fromBinding = (be: ts.BindingElement, path: readonly string[], depth: number, via: string): Origin[] => {
    const pattern = be.parent;
    let seg: string;
    if (ts.isObjectBindingPattern(pattern)) {
      const pn = be.propertyName ?? be.name;
      seg = ts.isIdentifier(pn) || ts.isStringLiteral(pn) ? pn.text : "*";
    } else seg = String(pattern.elements.indexOf(be));
    const holder = pattern.parent;
    const p2 = [seg, ...path];
    if (ts.isVariableDeclaration(holder)) {
      if (holder.initializer) return originsOf(holder.initializer, p2, depth + 1, `${via}→destructure`);
      const list = holder.parent;
      if (ts.isVariableDeclarationList(list) && ts.isForOfStatement(list.parent)) return originsOf(list.parent.expression, ["*", ...p2], depth + 1, `${via}→for-of`);
      return [];
    }
    if (ts.isParameter(holder)) return fromParam(holder, p2, depth, `${via}→destructure`);
    if (ts.isBindingElement(holder)) return fromBinding(holder, p2, depth, via);
    return [];
  };
  const originsOfWorker = (node: ts.Node, path: readonly string[], depth: number, via: string): Origin[] => {
    if (!ts.isExpression(node)) return [];
    const e = strip(node);
    // 型別上有 schema 字面值 ⇒ 到底了
    if (path.length > 0) {
      const tags = schemaTagsOfType(checker.getTypeAtLocation(e));
      if (tags.length === 1) return [{ tag: tags[0]!, path, via: `${via}→type` }];
    }
    if (ts.isIdentifier(e)) return uniq(fromSymbol(checker.getSymbolAtLocation(e), path, depth, via, e));
    if (ts.isPropertyAccessExpression(e)) {
      const s = checker.getSymbolAtLocation(e.name);
      const d = decl(s);
      const out: Origin[] = [];
      if (isMemberDecl(d)) out.push(...fromMember(d, path, depth, `${via}→member(${e.name.text})`));
      else if (d && ts.isPropertyAssignment(d) && path.length > 0) out.push(...originsOf(d.initializer, path, depth + 1, `${via}→prop(${e.name.text})`));
      else if (d && ts.isShorthandPropertyAssignment(d)) out.push(...fromSymbol(checker.getShorthandAssignmentValueSymbol(d), path, depth + 1, via, e));
      if (out.length === 0) out.push(...originsOf(e.expression, [e.name.text, ...path], depth + 1, via));
      return uniq(out);
    }
    if (ts.isElementAccessExpression(e)) {
      const lit = literalOf(e.argumentExpression);
      return originsOf(e.expression, [lit ?? "*", ...path], depth + 1, via);
    }
    if (ts.isCallExpression(e) || ts.isNewExpression(e)) {
      const callee = strip(e.expression);
      // `Object.values(X)` / `Object.entries(X)`
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "Object" && e.arguments[0]) {
        if (callee.name.text === "values") return originsOf(e.arguments[0], path[0] === "*" ? path : ["*", ...path], depth + 1, `${via}→Object.values`);
        if (callee.name.text === "entries") {
          const rest = path[0] === "*" && path[1] === "1" ? path.slice(2) : path[0] === "*" ? path.slice(1) : path;
          if (path[0] === "*" && path[1] === "0") return [];
          return originsOf(e.arguments[0], ["*", ...rest], depth + 1, `${via}→Object.entries`);
        }
      }
      // 查表鍵
      const keys = new Set<string>();
      for (const a of e.arguments ?? []) for (const t of keyTagsIn(a)) keys.add(t);
      if (keys.size === 1) return [{ tag: [...keys][0]!, path, via: `${via}→key` }];
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(callee)) {
        const m = callee.name.text;
        if (ELEMENT_OF_RECEIVER.has(m)) return originsOf(callee.expression, ["*", ...path], depth + 1, `${via}→${m}`);
        if (m === "map" || m === "flatMap") {
          const cb = e.arguments[0] && strip(e.arguments[0]);
          if (cb && isFnLike(cb)) return uniq(returnsOf(cb).flatMap((r) => originsOf(r, path[0] === "*" ? path.slice(1) : path, depth + 1, `${via}→${m}`)));
        }
      }
      const f = fnOf(calleeDecl(e));
      if (f) return uniq(returnsOf(f).flatMap((r) => originsOf(r, path, depth + 1, `${via}→ret(${fnName(f) ?? "?"})`)));
      return [];
    }
    if (ts.isObjectLiteralExpression(e)) {
      if (path.length === 0) return [];
      const [p0, ...rest] = path;
      const out: Origin[] = [];
      for (const prop of e.properties) {
        const nm = prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) ? prop.name.text : undefined;
        if (ts.isSpreadAssignment(prop)) out.push(...originsOf(prop.expression, path, depth + 1, `${via}→spread`));
        else if (nm !== undefined && (nm === p0 || p0 === "*")) {
          if (ts.isPropertyAssignment(prop)) out.push(...originsOf(prop.initializer, rest, depth + 1, `${via}→{${nm}}`));
          else if (ts.isShorthandPropertyAssignment(prop)) out.push(...fromSymbol(checker.getShorthandAssignmentValueSymbol(prop), rest, depth + 1, `${via}→{${nm}}`, prop));
          else if (ts.isMethodDeclaration(prop) || ts.isGetAccessorDeclaration(prop)) out.push(...returnsOf(prop).flatMap((r) => originsOf(r, rest, depth + 1, `${via}→{${nm}()}`)));
        }
      }
      return uniq(out);
    }
    if (ts.isArrayLiteralExpression(e)) {
      if (path[0] !== "*" && !/^\d+$/.test(path[0] ?? "")) return [];
      const rest = path.slice(1);
      return uniq(e.elements.flatMap((x) => (ts.isSpreadElement(x) ? originsOf(x.expression, path, depth + 1, via) : originsOf(x, rest, depth + 1, via))));
    }
    if (ts.isConditionalExpression(e)) return uniq([...originsOf(e.whenTrue, path, depth + 1, via), ...originsOf(e.whenFalse, path, depth + 1, via)]);
    if (ts.isBinaryExpression(e)) {
      const k = e.operatorToken.kind;
      if (k === ts.SyntaxKind.QuestionQuestionToken || k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.AmpersandAmpersandToken)
        return uniq([...originsOf(e.left, path, depth + 1, via), ...originsOf(e.right, path, depth + 1, via)]);
      if (k === ts.SyntaxKind.CommaToken || k === ts.SyntaxKind.EqualsToken) return originsOf(e.right, path, depth + 1, via);
      return [];
    }
    if (ts.isSpreadElement(e)) return originsOf(e.expression, path, depth + 1, via);
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
  const fileNode = (sf: ts.SourceFile): ts.Node => sf;
  /** 參照的來源節點：在函式體裡 ⇒ 該頂層宣告；否則 ⇒ 檔案（模組載入時執行）。 */
  const sourceNode = (n: ts.Node): ts.Node => (inFnBody(n) ? topOf(n) : fileNode(n.getSourceFile()));
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
        if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isEnumDeclaration(n) || ts.isVariableDeclaration(n)) && n.name && ts.isIdentifier(n.name)) topNames.add(n.name.text);
        if (ts.isVariableStatement(n) || ts.isVariableDeclarationList(n) || ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n) || ts.isBindingElement(n)) ts.forEachChild(n, collect);
        if (ts.isBindingElement(n) && ts.isIdentifier(n.name)) topNames.add(n.name.text);
      };
      collect(st);
    }
  }
  const moduleOf = (spec: ts.Expression): ts.SourceFile | undefined => {
    const s = checker.getSymbolAtLocation(spec);
    const d = s?.declarations?.[0];
    return d && ts.isSourceFile(d) ? d : undefined;
  };
  const isDeclName = (id: ts.Identifier): boolean => {
    const p = id.parent;
    return (
      ((ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p) || ts.isParameter(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isPropertyAssignment(p) || ts.isEnumMember(p) || ts.isBindingElement(p) || ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodSignature(p) || ts.isEnumDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p) || ts.isLabeledStatement(p) || ts.isJsxAttribute(p)) && p.name === id) ||
      ts.isExportSpecifier(p) ||
      (ts.isPropertyAccessExpression(p) && p.name === id) ||
      ts.isQualifiedName(p)
    );
  };
  for (const sf of prodFiles) {
    const usedImports = new Set<ts.ImportDeclaration>();
    const visit = (n: ts.Node): void => {
      if (ts.isTypeNode(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isImportDeclaration(n) || ts.isImportEqualsDeclaration(n)) return;
      if (ts.isExportDeclaration(n)) return;
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
          const dsf = d.getSourceFile();
          if (!prodSet.has(dsf.fileName)) continue;
          addEdge(sourceNode(n), ts.isSourceFile(d) ? d : topOf(d));
        }
      }
      // `ns.member` —— namespace import 的成員
      if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
        const rs = checker.getSymbolAtLocation(n.expression);
        const rd = rs?.declarations?.[0];
        if (rd && ts.isNamespaceImport(rd)) {
          const ms = aliased(checker.getSymbolAtLocation(n.name));
          for (const d of ms?.declarations ?? []) if (prodSet.has(d.getSourceFile().fileName)) addEdge(sourceNode(n), topOf(d));
          usedImports.add(rd.parent.parent);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && st.moduleSpecifier) {
        const typeOnly = st.importClause?.isTypeOnly || (st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings) && st.importClause.namedBindings.elements.every((e) => e.isTypeOnly));
        const sideEffect = !st.importClause;
        if (typeOnly) continue;
        if (!sideEffect && !usedImports.has(st)) continue; // 只當型別用 ⇒ 會被 elide
        const m = moduleOf(st.moduleSpecifier);
        if (m) addEdge(sf, m);
      } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && !st.isTypeOnly) {
        const m = moduleOf(st.moduleSpecifier);
        if (m) addEdge(sf, m);
      }
    }
  }
  const live = new Set<ts.Node>();
  const queue: ts.Node[] = [];
  const entryFiles = ENTRY_FILES.map((f) => join(root, f)).filter((f) => prodSet.has(f));
  for (const f of entryFiles) {
    const sf = program.getSourceFile(f);
    if (sf) queue.push(sf);
  }
  while (queue.length) {
    const n = queue.pop()!;
    if (live.has(n)) continue;
    live.add(n);
    for (const m of edges.get(n) ?? []) if (!live.has(m)) queue.push(m);
  }
  const isLive = (n: ts.Node): boolean => live.has(sourceNode(n));

  // ── ① 讀取點 ──
  const sites: ReadSite[] = [];
  const literalTags: LiteralTag[] = [];
  const isRelay = (read: ts.Node): boolean => {
    let cur: ts.Node = read;
    for (;;) {
      const p: ts.Node = cur.parent;
      if (!p) return false;
      if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p) || ts.isTypeAssertionExpression(p) || ts.isSatisfiesExpression(p) || ts.isConditionalExpression(p) || ts.isTypeOfExpression(p)) { cur = p; continue; }
      if (ts.isBinaryExpression(p)) {
        const k = p.operatorToken.kind;
        if (k === ts.SyntaxKind.EqualsToken && p.left === cur) return false;
        if (k === ts.SyntaxKind.EqualsToken) { const l = strip(p.left); return ts.isPropertyAccessExpression(l) || ts.isElementAccessExpression(l); }
        cur = p; continue;
      }
      if (ts.isCallExpression(p) && p.arguments.includes(cur as ts.Expression)) { cur = p; continue; }
      if (ts.isPropertyAssignment(p) && p.initializer === cur) return true;
      return false;
    }
  };
  for (const sf of prodFiles) {
    const visit = (n: ts.Node): void => {
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && TAG.test(n.text)) literalTags.push({ tag: n.text, file: rel(sf.fileName), line: line(n) });
      let read: { recv: ts.Expression; node: ts.Node } | undefined;
      if (ts.isPropertyAccessExpression(n) && n.name.text === "enabled") read = { recv: n.expression, node: n };
      else if (ts.isElementAccessExpression(n) && literalOf(n.argumentExpression) === "enabled") read = { recv: n.expression, node: n };
      if (read) {
        const p = n.parent;
        const isWrite = (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && p.left === n) || ts.isDeleteExpression(p) || (ts.isPostfixUnaryExpression(p) || ts.isPrefixUnaryExpression(p)) && (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken);
        if (!isWrite) {
          const origins = originsOf(read.recv, ["enabled"], 0, "");
          sites.push({ file: rel(sf.fileName), line: line(n), text: n.getText(sf).slice(0, 80), origins, live: isLive(n), relay: isRelay(n) });
        }
      } else if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent)) {
        const pn = n.propertyName ?? n.name;
        if ((ts.isIdentifier(pn) || ts.isStringLiteral(pn)) && pn.text === "enabled") {
          const origins = fromBinding(n, [], 0, "");
          sites.push({ file: rel(sf.fileName), line: line(n), text: n.parent.parent.getText(sf).slice(0, 80), origins, live: isLive(n), relay: false });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  const hide = opts.hideSite;
  const kept = hide ? sites.filter((s) => !hide(s)) : sites;
  const matches = (o: Origin, sw: EnabledSwitch): boolean =>
    o.tag === sw.tag && o.path.length === sw.path.length && o.path.every((seg, i) => seg === "*" || seg === sw.path[i]);
  const reachableFiles = [...live].filter((n) => ts.isSourceFile(n)).length;
  return {
    switches,
    sites: kept,
    literalTags,
    shippedTags: allTags,
    entryFiles: entryFiles.map(rel),
    population: { prodFiles: prodFiles.length, reachableFiles, ms: Date.now() - t0 },
    consumersOf: (sw) => kept.filter((s) => s.live && !s.relay && s.origins.some((o) => matches(o, sw))),
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (process.argv[1] && basename(process.argv[1]).startsWith("enabledSwitchesHaveConsumers")) {
  const root = join(import.meta.dirname ?? ".", "../../../..");
  const res = scanEnabledSwitches(root);
  const json = process.argv.includes("--json");
  const rows = res.switches.map((sw) => {
    const c = res.consumersOf(sw);
    const any = res.sites.filter((s) => s.origins.some((o) => o.tag === sw.tag && o.path.length === sw.path.length && o.path.every((seg, i) => seg === "*" || seg === sw.path[i])));
    return { file: sw.file, path: sw.path.join("."), value: sw.value, consumers: c.map((s) => `${s.file}:${s.line}`), attributedButNotConsuming: any.filter((s) => !c.includes(s)).map((s) => `${s.file}:${s.line}${s.live ? "" : " (dead)"}${s.relay ? " (relay)" : ""}`) };
  });
  if (json) console.log(JSON.stringify({ population: res.population, entryFiles: res.entryFiles, rows }, null, 2));
  else {
    console.log(`prodFiles=${res.population.prodFiles} reachableFiles=${res.population.reachableFiles} sites=${res.sites.length} ms=${res.population.ms}`);
    for (const r of rows) console.log(`${r.consumers.length ? "✅" : "⛔"} ${r.file}:${r.path}=${r.value}  ${r.consumers.slice(0, 3).join(", ")}${r.consumers.length ? "" : "  | " + r.attributedButNotConsuming.slice(0, 3).join(", ")}`);
  }
  if (process.argv.includes("--sites")) for (const s of res.sites) console.log(`${s.live ? "L" : "d"}${s.relay ? "r" : " "} ${s.file}:${s.line} ${s.text}  ⇒ ${s.origins.map((o) => `${o.tag}#${o.path.join(".")} (${o.via})`).join(" | ") || "—"}`);
}

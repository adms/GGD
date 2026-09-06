/**
 * todoDoneBeaconsHaveEmitters.test.ts —— `docs/todo/*.md` 裡每一列 `done` 的 Test ID，
 * 整棵原始碼樹裡要有人**發射**它（`cover("<id>")`）—— GH#996。
 *
 * ⭐ 反方向（第二守則形態⑫）：`todo:runtime` 從「跑到的信標」那一頭走（done 而沒跑到 ⇒ 紅），
 * ⛔ 但它只在 CI 的**最後一步**跑（前面任何 job 紅它就不跑；main 的 CI 在 2026-09-05 之前紅了 42 天），
 * 本機從來不跑。這一條從「宣告」那一頭走：唯讀、≈1 秒、每一次 `pnpm test` 都跑 ——
 * 一個 done 的 Test ID 在原始碼裡連一個 `cover(...)` 都指不到 ⇒ 紅並指名那一列。
 *
 * ⚠️ 量尺先自證（GH#996 的教訓）：票文的「零命中」是 `grep -rn` 量的，而 grep 把含 NUL 位元組的
 * `versionBadgeBand.test.ts` 整檔當 binary **靜默跳過** ⇒ 一個真的存在的 `cover("ping-band-gutter")`
 * 被量成零。這裡逐檔 `readFileSync`（NUL 不會讓它失明），而且哨兵驗**兩個方向**。
 *
 * 認得的發射形狀：`cover("id")` · Go `Cover(t, "id")` · `cover(\`prefix-${…}\`)`（前綴比對）·
 * `cover(ident)`（退而求其次：那一檔裡每一個 kebab 字串字面值都算 —— 刻意**多算**，
 * 所以它紅的時候是真的沒人提過那個 id）。
 * ⭐ 對照 CI 的 `todo:runtime`（run 33988952551 前一次，2026-09-05）：這裡指名的 26 列**全部**在它的
 * 31 列裡 ⇒ 零誤報；它多出的 5 列是「有發射器但 CI 上沒跑到」—— 那是 runtime 閘的管區。
 *
 * 帳本 `KNOWN_UNEMITTED` 只能變短（GH#1031 逐列列著它們與修法）。⛔ 體驗層：不做突變。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const REPO = join(dirname(SELF), "../../../..");

/** `tools/todo-check/src/parse.ts` 的形狀（⛔ 規則不抄：解析走真的那一支，動態載入避開 rootDir）。 */
interface TodoItem {
  id: string;
  testId: string;
  status: string;
  file: string;
  line: number;
}
type ParseTodo = (file: string, content: string) => { items: TodoItem[] };
async function realParser(): Promise<ParseTodo> {
  const url = pathToFileURL(join(REPO, "tools/todo-check/src/parse.ts")).href;
  return ((await import(url)) as { parseTodoMarkdown: ParseTodo }).parseTodoMarkdown;
}
const SKIP = new Set(["node_modules", "dist", "out", ".git", ".claude", ".venv", "__pycache__"]);
const SRC = /\.(ts|tsx|mjs|js|go|py)$/;

function walk(dir: string, out: string[]): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    // ⛔ 這個檔自己不算：它的帳本就是一串 kebab 字面值，而它提到 `cover(` ⇒ 退回模式會把帳本
    //    讀成「有人發射」，於是 26 列全部變綠 —— 一把量到自己的尺（第一次跑就中了）。
    else if (SRC.test(e.name) && p !== SELF) out.push(p);
  }
  return out;
}

interface Emitters {
  exact: Set<string>;
  prefixes: Set<string>;
}

/** `cover(` / `Cover(t,` 的第一個參數：字串 → exact；含 `${` 的模板 → 前綴；其餘 → 退回整檔字面值。 */
const CALL = /\b[Cc]over\(\s*(?:t\s*,\s*)?("[^"\n]*"|'[^'\n]*'|`[^`]*`|[^)\n]*)\)/g;
const KEBAB = /^[a-z0-9][a-z0-9._-]*-[a-z0-9._-]*$/i;
const ANY_LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`$\n]*)`/g;

/** ⭐ 真檔與哨兵走**同一條路**（⛔ 不是失敗形態⑤的虛構通道）。 */
export function emittersOf(sources: Iterable<string>): Emitters {
  const exact = new Set<string>();
  const prefixes = new Set<string>();
  for (const text of sources) {
    if (!/\b[Cc]over\(/.test(text)) continue;
    let fallback = false;
    for (const m of text.matchAll(CALL)) {
      const a = m[1]!.trim();
      if (a[0] === '"' || a[0] === "'") exact.add(a.slice(1, -1));
      else if (a[0] === "`") {
        const v = a.slice(1, -1);
        const i = v.indexOf("${");
        if (i < 0) exact.add(v);
        else if (i >= 3) prefixes.add(v.slice(0, i));
        else fallback = true;
      } else fallback = true;
    }
    if (fallback)
      for (const n of text.matchAll(ANY_LITERAL)) {
        const v = n[1] ?? n[2] ?? n[3];
        if (v && v.length >= 4 && KEBAB.test(v)) exact.add(v);
      }
  }
  return { exact, prefixes };
}

const emitted = (id: string, em: Emitters): boolean =>
  em.exact.has(id) || [...em.prefixes].some((p) => id.startsWith(p));

/** done 而零發射器的列，逐列指名（與 `todo:runtime` 一樣：Test ID 逐字比對，⛔ 不拆 `a / b`）。 */
export function audit(items: TodoItem[], em: Emitters): string[] {
  return items
    .filter((i) => i.status === "done" && !emitted(i.testId, em))
    .map((i) => `${i.file}:${i.line} (${i.id}) 是 done，但 "${i.testId}" 在原始碼裡零個 cover()`);
}

function loadTodos(parse: ParseTodo): TodoItem[] {
  const dir = join(REPO, "docs/todo");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .sort()
    .flatMap((f) => parse(`docs/todo/${f}`, readFileSync(join(dir, f), "utf8")).items);
}

/**
 * ⭐ 棘輪帳本 —— **只能變短**。2026-09-06 第一次跑量到 26 列（GH#1031），同日全部清掉：
 * 17 列補了 `cover()`（守衛本來就在，只是沒發射）· 5 列一格多 id **拆列**（一列一個 Test ID；
 * ⚠️ 其中 3 個 id 本來就是**別列**的 Test ID —— 多 id 的格子躲過了 `todo:check` 的唯一性檢查，
 * 拆出來的列各自拿到新 id 與斷言自己那句話的守衛）·
 * 2 列 Test ID 改指到**真的在發射**的守衛（`audio-fx-mp3-ceiling` · `model-facing-measured`，
 * 原 id 描述的東西已被取代）· 3 列不再是 done（`hud-desc-role-colour` withdrawn GH#757 ·
 * `econ-stat-roll-parity` withdrawn #260 · `tint263-capture` deferred：沒有自動化守衛）。
 * ⇒ 帳本空了：從今起**任何**新的「done 而零發射器」的列會**當場**紅並指名，⛔ 不要把它加進來。
 * ⚠️ 含 ` / ` 或 `, ` 的格子是**一格多個 id** —— 結構上永遠對不到任何信標（runtime 閘也是逐字比對），
 * 修法是拆列，⛔ 不是加 cover()。
 */
const KNOWN_UNEMITTED: readonly string[] = [];

describe("docs/todo 的每一列 done 都有人發射它的信標（GH#996，反方向）", async () => {
  const parse = await realParser();
  const items = loadTodos(parse);
  const files = ["apps", "packages", "tools"].flatMap((r) => walk(join(REPO, r), []));
  const em = emittersOf(files.map((f) => readFileSync(f, "utf8")));
  const problems = audit(items, em);

  it("非空洞：宣告與發射兩個分母都真的有東西", () => {
    expect(items.filter((i) => i.status === "done").length).toBeGreaterThan(500);
    expect(em.exact.size).toBeGreaterThan(500);
    // ⭐ GH#996 的那一顆：grep 曾經量成零，這把尺要量得到
    expect(em.exact.has("ping-band-gutter")).toBe(true);
  });

  it("⛔ 帳本以外，沒有任何 done 列是零發射器的", () => {
    const known = new Set(KNOWN_UNEMITTED);
    const fresh = problems.filter((p) => !KNOWN_UNEMITTED.some((k) => p.includes(`"${k}"`)));
    expect(fresh, "補上 cover(\"<id>\")，或（一格多 id 的）拆列；⛔ 不要把它加進帳本").toEqual([]);
    expect(known.size).toBe(KNOWN_UNEMITTED.length);
  });

  it("⭐ 帳本只能變短：有了發射器（或不再 done）的列要刪掉", () => {
    const stillBad = new Set(problems.map((p) => /"([^"]+)" 在原始碼裡/.exec(p)?.[1]));
    const stale = KNOWN_UNEMITTED.filter((k) => !stillBad.has(k));
    expect(stale, "這幾列已經有發射器了 —— 從 KNOWN_UNEMITTED 刪掉").toEqual([]);
  });

  it("⭐ 哨兵：缺發射器的被指名，有的（字面值／前綴／退回）不被誤判", () => {
    const md = [
      "| ID | Item | Test ID | Category | Status |",
      "| --- | --- | --- | --- | --- |",
      "| s-1 | a | sent-lit | unit | done |",
      "| s-2 | b | sent-pre-x | unit | done |",
      "| s-3 | c | sent-ident | unit | done |",
      "| s-4 | d | sent-nope | unit | done |",
      "| s-5 | e | sent-pending | unit | pending |",
    ].join("\n");
    const src = ['cover("sent-lit");', "cover(`sent-pre-${k}`);", 'const T = "sent-ident"; cover(T);'];
    const bad = audit(parse("x.md", md).items, emittersOf(src));
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('"sent-nope"');
  });
});

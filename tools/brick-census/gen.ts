/**
 * ⭐⭐ **積木普查** —— owner 2026-09-01 逐字定義的分工，這一支是它的量尺：
 *
 * > 「[後台編輯器及codex編輯器] 是**堆積木**的角色 **要充分了解有哪些積木**,
 * >  而 main 遊戲主程式 是**做出積木**供使用的角色」
 *
 * ⇒ ⭐ 「要充分了解有哪些積木」是一個**對外契約**，⛔ 不是一句話。
 * 而在 2026-09-01 之前，那份清單**不存在** —— 編輯器只能自己去翻 46 份模板檔，
 * ⛔ 而其中 37 份是零採用、19 份是空殼，⚠️ 從檔案上分不出來。
 *
 * ── ⭐ 這一支回答三個問題（⛔ 每一個都是量出來的）──────────────────────────
 * ① **有哪些積木**：引擎認得的 template family（`expand.ts` 的 `FAMILIES`）
 * ② **哪些是空盒子**：有模板檔而引擎不認得 / `status:draft` / `params:{}`
 * ③ **誰在用**：每一個 family 今天被幾支出貨技能接上
 *
 * ⚠️ ⭐ 而 ②「空盒子」有一族**刻意永遠是空的** —— `tpl-data-no-trigger` 與
 * `tpl-pure-cosmetic` 的檔頭自陳它們是**普查的分流終點**（「永遠不會有參數，
 * 也永遠不會 enabled」）⇒ ⛔ 把它們算成「待補的積木」是把統計灌大，
 * ⭐ 而一個灌大的統計讀起來跟真的一模一樣（CLAUDE.md 記過三次）。
 *
 *   pnpm bricks:build     # 重新產生
 *   pnpm bricks:check     # 逐位元組比對（唯讀）
 */
// ggd:writes docs/editor-contract/ggd-brick-census.json
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isExpandable } from "@ggd/shared/content/templates/expand";

const ROOT = resolve(__dirname, "../..");
const OUT = join(ROOT, "docs/editor-contract/ggd-brick-census.json");

/** ⭐ 引擎認得的 family —— 從**出貨原始碼**推導，⛔ 不是手寫清單。 */
/**
 * ⭐⭐ 引擎認得的 family —— **問出貨的那支**（`isExpandable`），⛔ 不是用正則猜。
 *
 * ── ⛔⛔ 在此之前這裡是一條正則，而它**對外少報了 8 塊積木** ────────────
 * 舊的寫法是 `/^ {2}"([a-z0-9-]+)":\s*\(t, p\)/gm` ——
 * ⇒ ⭐ 它只認**行內箭頭函式**，⛔ 而八個 family 是**共用的引用**：
 *
 * ```ts
 * "beam-roll": modelFxFamily,     // ← 正則看不到
 * "radial-burst": modelFxFamily,
 * "locust-line": modelFxFamily,   // …另外五個 locust-*
 * "line-blast": modelFxFamily,
 * ```
 *
 * ⇒ ⛔ 對外的普查說「引擎有 19 個 family」，⭐ 而它其實有 **27** 個。
 * ⚠️ 而 CLAUDE.md 第〇·五守則逐字點名這種錯：
 * 「宣告 unsupported 但引擎其實有 → 紅（**對方白白繞路**）」——
 * ⭐ 外部編輯器看不到我們的 registry，⛔ **沒有辦法發現我們在說謊**。
 *
 * ⇒ ⭐ 判準改成：**候選名單用正則掃（寬），答案問 `isExpandable()`（準）**。
 * ⛔ 正則從此只負責「有哪些名字值得問」，⛔ 不負責回答。
 */
function engineFamilies(): string[] {
  const src = readFileSync(join(ROOT, "packages/shared/src/content/templates/expand.ts"), "utf8");
  // ⭐ 候選：`FAMILIES` 區塊裡每一個字串鍵（⛔ 不看它的值長什麼樣）。
  const block = /const FAMILIES[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src)?.[1] ?? "";
  const candidates = new Set([...block.matchAll(/^ {2}"([a-z0-9-]+)":/gm)].map((m) => m[1]!));
  // ⭐ 而模板文件宣告的 family 也要問一次 —— 一個引擎有、⛔ 而 FAMILIES 區塊
  //   排版換過的家族，不該因為正則而消失。
  for (const d of templates().values()) if (d.family) candidates.add(d.family);
  return [...candidates].filter((f) => isExpandable(f)).sort();
}

interface TplDoc {
  family?: string;
  status?: string;
  params?: Record<string, unknown>;
  /** ⚠️ 出貨模板用的是 `description`（⛔ 不是 `note` —— 我第一版讀錯欄位，terminal 量到 0）。 */
  description?: string;
  note?: string;
}

function templates(): Map<string, TplDoc> {
  const dir = join(ROOT, "content/ability-templates");
  const out = new Map<string, TplDoc>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    out.set(f.slice(0, -5), JSON.parse(readFileSync(join(dir, f), "utf8")) as TplDoc);
  }
  return out;
}

/** ⭐ 每一個 family 今天被幾支出貨技能接上（三種 `template` 寫法都收）。 */
function adoption(): Map<string, number> {
  const dir = join(ROOT, "content/abilities");
  const out = new Map<string, number>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as { template?: unknown };
    for (const ref of refsOf(d.template)) out.set(ref, (out.get(ref) ?? 0) + 1);
  }
  return out;
}

function refsOf(t: unknown): string[] {
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.flatMap(refsOf);
  if (t && typeof t === "object") {
    const o = t as { ref?: unknown; stack?: unknown };
    if (typeof o.ref === "string") return [o.ref];
    if (Array.isArray(o.stack)) return o.stack.flatMap(refsOf);
  }
  return [];
}

/**
 * ⭐ 這一份模板是不是**刻意永遠空的分流終點**。
 * ⛔ 判準是它**自己的 note**，⛔ 不是一張寫在這裡的名單（那會過期）。
 */
function isTerminal(doc: TplDoc): boolean {
  const n = `${doc.description ?? ""}${doc.note ?? ""}`;
  return n.includes("永遠不會有參數") || n.includes("分流終點");
}

function build(): unknown {
  const fams = engineFamilies();
  const tpl = templates();
  const used = adoption();
  const rows = [...tpl]
    .map(([id, d]) => ({
      id,
      family: d.family ?? null,
      engineKnows: d.family ? fams.includes(d.family) : false,
      status: d.status ?? "enabled",
      params: Object.keys(d.params ?? {}).length,
      abilities: used.get(id) ?? 0,
      terminal: isTerminal(d),
    }))
    .sort((a, b) => (b.abilities - a.abilities) || a.id.localeCompare(b.id));

  const shell = rows.filter((r) => !r.terminal && (r.status === "draft" || r.params === 0));
  return {
    schema: "ggd-brick-census@1",
    note:
      "⭐ 積木普查（owner 2026-09-01：「編輯器是堆積木的角色，要充分了解有哪些積木；" +
      "main 是做出積木的角色」）。⛔ 產物 —— 改 `tools/brick-census/gen.ts`，⛔ 不要手改。",
    counts: {
      engineFamilies: fams.length,
      templateDocs: rows.length,
      /** ⭐ 引擎認得**而且**有模板檔的 —— 這才是「編輯器拼得動的積木」。 */
      usable: rows.filter((r) => r.engineKnows && r.status !== "draft" && r.params > 0).length,
      /** ⛔ 有模板檔而引擎不認得 —— 一份寫得出來、⛔ 展不開的東西。 */
      engineMissing: rows.filter((r) => !r.engineKnows && !r.terminal).length,
      /** ⛔ 空盒子（draft 或零參數），⭐ 已扣掉刻意永遠空的分流終點。 */
      shells: shell.length,
      /** ⛔ 零採用（⚠️ 含空盒子 —— 空盒子當然沒人用）。 */
      zeroAdoption: rows.filter((r) => r.abilities === 0 && !r.terminal).length,
      /** ⭐ 刻意永遠空的分流終點（⛔ 不是待補的積木）。 */
      terminal: rows.filter((r) => r.terminal).length,
    },
    engineFamilies: fams,
    /** ⭐ 引擎認得但**沒有任何模板檔**用它 —— 一塊做好了沒人拿的積木。 */
    unusedEngineFamilies: fams.filter((f) => ![...tpl.values()].some((d) => d.family === f)),
    templates: rows,
  };
}

const json = `${JSON.stringify(build(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  const cur = (() => {
    try {
      return readFileSync(OUT, "utf8");
    } catch {
      return "";
    }
  })();
  if (cur !== json) {
    console.error("⛔ ggd-brick-census.json 過期了 —— 跑 `pnpm bricks:build` 然後 git add");
    process.exit(1);
  }
  console.log("bricks:check OK");
} else {
  writeFileSync(OUT, json);
  const c = (JSON.parse(json) as { counts: Record<string, number> }).counts;
  console.log(`✅ ${OUT}`);
  console.log(`   ${JSON.stringify(c)}`);
}

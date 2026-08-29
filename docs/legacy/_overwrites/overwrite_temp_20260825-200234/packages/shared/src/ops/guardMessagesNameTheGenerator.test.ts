/**
 * guardMessagesNameTheGenerator.test.ts
 * —— ⭐ **守衛的失敗訊息不可以叫人去改產物，卻不說那個檔是誰寫的。**
 *
 * owner 2026-08-24：
 *
 * > 「這個問題發生上百次了，為什麼總是會改到產物而不是產生器？」
 *
 * 2026-08-25 的誤導源稽核（`docs/_reports/product-edit-misinfo_20260825.md`）給的答案是
 * 一個形狀：**缺陷報告寄給了「文件」，⛔ 從來沒有寄給「寫那份文件的產生器」。**
 * 守衛在我正要動手的那一秒說話，而它指名一條出貨路徑就結束了 ——
 * 於是我照著它改產物，下一次 sync 打回來，而那個「又紅了」看起來像**新的**錯。
 *
 * ⇒ 這一條把那個形狀關起來：
 * **訊息裡出現產物路徑 ⇒ 同一支測試的訊息裡必須也出現擁有者線索**（genguard／genrun／…）。
 *
 * ── 判準：⭐ 刻意**寧可漏報也不要誤報** ────────────────────────────────────────
 * 誤報會逼人加豁免，而一張長出來的豁免表會訓練大家忽略這條閘。所以：
 * ① 只讀**訊息字串**：`expect(_, 訊息)` 的第二參數（含 `const message = [...]` 這種同檔常數）、
 *    `it/test/describe` 的標題、**檔頭** block comment。⛔ 不讀程式碼、import、路徑常數。
 * ② 認 `content/{abilities,champions,config,items,augments,status-effects}/…` ——
 *    前三個是稽核點名的；後三個 2026-08-25 收進來（content/augments 量到 **60/92
 *    是 grail:wishes 的產物** ⇒「混著手編檔所以不掃」不再站得住）。
 *    ⭐ 混目錄天然安全：判定逐檔問 sync-io，不在 writes 裡的手編檔解析成 null（＝跳過）。
 * ③ glob 與 `<id>` 佔位**只在它涵蓋的每一個實檔都是產物時**才算命中：
 *    `content/abilities/*.json`（實測 422/422 全是產物）算，
 *    `content/config/*.json`（7/89）⛔ 不算 —— 那裡絕大多數真的是人在編的。
 * ④ 「是不是產物」只有一個住處：`tools/parallel-gates/sync-io.json` 的 `steps[].writes`
 *    （⛔ 不抄第二份表 —— 那正是第〇·四守則說的第二個住處）。
 * ⑤ 擁有者線索**逐檔**判定，⛔ 不是逐則訊息 —— 又一次偏向漏報。
 *
 * ⚠️ 已知的漏（誠實列出，⛔ 不要把「綠」讀成「掃乾淨了」）：
 *   · 訊息用 `${n.file}` **動態**印路徑的掃不到（`tierFlatExclusive` 與
 *     `slowLabelMatchesMultiplier` 原本就是這一種，那一批是**手動**補的）。
 *     ⭐ 2026-08-25 把這一類**整個掃過一次**（走訪 `content/{abilities,champions}` 的
 *     測試 × 訊息裡有插值）：40 支候選裡只有 **3 支真的把「檔名」印進失敗訊息**
 *     （`blinkNotDash` · `rangeTierAdoption` · `championFormsResolve`），其餘印的是
 *     **英雄／技能 id**，⛔ 不是「去改這一份檔」。那 3 支已手動補上。
 *   · tools/** 與 scripts/** 的 print／echo／docstring guidance 不在這支的域裡 ——
 *     那一半在 `guardProseNamesTheGenerator.test.ts`（同一個 OWNERS 推導，⛔ 不抄第二份表）。
 *   · 已經在 PENDING 上的檔再加一則新的誤導訊息，只要路徑集合不變就不會紅
 *     —— ⭐ 2026-08-25 之後 PENDING 是**空的**，所以這一條暫時沒有母體。
 *
 * ⭐ 棘輪：豁免表 `tools/parallel-gates/guard-message-pending.json` **只准變短**，
 * 而 2026-08-25 它已經**抽乾**（39 → 0）⇒ 現在的語意是「零豁免」。
 * ⛔ 不准往表裡加列 —— 新的違規檔會直接紅。
 *
 * ⭐ 第三條（2026-08-25 新增）：**補上去的那句話自己也要是真的。**
 * 39 支的修法是在訊息裡寫「改來源再 `bash scripts/genrun.sh <某一支>`」——
 * 而那個步驟名是**第二個住處**（第〇·四守則）：sync-io 的擁有權一改，39 句就同時
 * 變成謊話，⛔ 而且沒有任何東西會紅。⇒ 這一條逐則比對：訊息裡具名的 genrun 步驟
 * 必須**真的寫得到**同一支測試點名的那些產物（`<…>` 佔位跳過）。
 *
 * 突變紀錄（一條，最承重）：把 `abilityCodeParityForms.test.ts` 訊息裡
 * `bash scripts/genguard.sh …` 那四行拿掉 → 這一條紅並**指名那一支**。改回來。
 */
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const PENDING_JSON = "tools/parallel-gates/guard-message-pending.json";

/** 產物 → 寫它的步驟。⭐ 量出來的（sync-io 的 writes），⛔ 不是手寫的名單。 */
const OWNERS = new Map<string, string[]>();
for (const s of (JSON.parse(readFileSync(join(REPO, "tools/parallel-gates/sync-io.json"), "utf8")) as {
  steps: { name: string; writes?: string[] }[];
}).steps) {
  for (const p of s.writes ?? []) {
    const cur = OWNERS.get(p);
    if (!cur) OWNERS.set(p, [s.name]);
    else if (!cur.includes(s.name)) cur.push(s.name);
  }
}

type Row = { product: string; owner: string };
const PENDING = (JSON.parse(readFileSync(join(REPO, PENDING_JSON), "utf8")) as { pending: Record<string, Row> })
  .pending;

/** ⛔ `legacy` 進不了母體（docs/legacy/ 是退休區）；`.claude` 擋掉別的 lane 的 worktree。 */
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", "out", ".claude", "legacy"]);
function testFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIR.has(e.name)) testFiles(join(dir, e.name), acc);
    } else if (e.name.endsWith(".test.ts") || e.name.endsWith(".test.tsx")) acc.push(join(dir, e.name));
  }
  return acc;
}

/** 只有這三種位置算「訊息」—— ⛔ 程式碼裡的路徑常數不算（判準①）。 */
function messagesOf(sf: ts.SourceFile, text: string): { pos: number; text: string }[] {
  const out: { pos: number; text: string }[] = [];
  for (const c of ts.getLeadingCommentRanges(text, 0) ?? []) out.push({ pos: c.pos, text: text.slice(c.pos, c.end) });
  const consts = new Map<string, ts.Expression>();
  const collect = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) consts.set(n.name.text, n.initializer);
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const ex = n.expression.getText(sf);
      const a0 = n.arguments[0];
      if (["it", "test", "describe"].includes(ex.split(".")[0] ?? "") && a0 !== undefined &&
        (ts.isStringLiteralLike(a0) || ts.isTemplateExpression(a0)))
        out.push({ pos: a0.getStart(sf), text: a0.getText(sf) });
      const a1 = n.arguments[1];
      if (ex === "expect" && a1 !== undefined) {
        const node = ts.isIdentifier(a1) ? consts.get(a1.text) : a1;
        if (node) out.push({ pos: node.getStart(sf), text: node.getText(sf) });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const PATH_RE = /content\/(?:abilities|champions|config)\/[^\s"'`,)（）。，、｜|\\]+/g;
const MARKERS = ["genguard", "genrun", "skills:sync", "產生器", "不要手改", "改來源"];

const dirCache = new Map<string, string[]>();
function listDir(d: string): string[] {
  let v = dirCache.get(d);
  if (v === undefined) {
    try {
      v = readdirSync(join(REPO, d));
    } catch {
      v = [];
    }
    dirCache.set(d, v);
  }
  return v;
}

/** 這條路徑是產物嗎？是 ⇒ 回擁有它的步驟；不是／說不準 ⇒ `null`（＝漏報那一邊）。 */
function productOwners(raw: string): string[] | null {
  const p = raw.replace(/[.。、，,:：;；)）」』】>]+$/, "");
  const dir = p.split("/").slice(0, 2).join("/");
  const base = p.slice(dir.length + 1);
  if (!/[*<>${}[\]?]/.test(base)) return OWNERS.get(p) ?? null;
  const rx = new RegExp(
    "^" +
      base
        .replace(/<[^>]*>/g, " ")
        .replace(/\$\{[^}]*\}/g, " ")
        .replace(/\*/g, " ")
        .replace(/[.+^${}()|[\]\\?]/g, "\\$&")
        .replace(/ /g, ".*") +
      "$",
  );
  const files = listDir(dir).filter((f) => rx.test(f));
  if (files.length === 0) return null;
  const owners = new Set<string>();
  for (const f of files) {
    const o = OWNERS.get(`${dir}/${f}`);
    if (!o) return null; // 一個不是產物 ⇒ 整條 glob 不算（判準③）
    for (const x of o) owners.add(x);
  }
  return [...owners];
}

/** sync-io 認得的步驟名（⭐ 同一個住處，⛔ 不抄第二份）。 */
const STEP_NAMES = new Set([...OWNERS.values()].flat());
/** 訊息裡具名的 `bash scripts/genrun.sh <step>`。`<…>` 佔位不算（那是刻意的通用寫法）。 */
const GENRUN_RE = /genrun\.sh\s+([A-Za-z][\w.-]*:[\w.-]+)/g;

type Hit = {
  file: string;
  named: boolean;
  where: string[];
  product: string;
  owner: string;
  steps: string[];
};
function scan(): { hits: Hit[]; scanned: number } {
  const hits: Hit[] = [];
  const files = testFiles(REPO).sort();
  for (const abs of files) {
    const text = readFileSync(abs, "utf8");
    if (!text.includes("content/")) continue;
    const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true);
    const msgs = messagesOf(sf, text);
    const rel = relative(REPO, abs).split(sep).join("/");
    const where: string[] = [];
    const paths: string[] = [];
    const owners = new Set<string>();
    for (const m of msgs) {
      for (const mt of m.text.matchAll(PATH_RE)) {
        const o = productOwners(mt[0]);
        if (!o) continue;
        const line = sf.getLineAndCharacterOfPosition(m.pos + (mt.index ?? 0)).line + 1;
        const clean = mt[0].replace(/[.。、，,:：;；)）」』】>]+$/, "");
        where.push(`${rel}:${line} 叫人改 ${clean} —— 那是 ${o.join(" · ")} 的產物`);
        if (!paths.includes(clean)) paths.push(clean);
        for (const x of o) owners.add(x);
      }
    }
    if (paths.length === 0) continue;
    const steps = new Set<string>();
    for (const m of msgs) for (const g of m.text.matchAll(GENRUN_RE)) steps.add(g[1]!);
    hits.push({
      file: rel,
      named: MARKERS.some((k) => msgs.some((m) => m.text.includes(k))),
      where,
      product: paths.join(" · "),
      owner: [...owners].join(" · "),
      steps: [...steps],
    });
  }
  return { hits, scanned: files.length };
}

const { hits, scanned } = scan();
const violating = hits.filter((h) => !h.named);

const HOWTO =
  `\n⭐ 修法（照 abilityCodeParityForms.test.ts 的模板，⛔ 不要加進 ${PENDING_JSON}）：\n` +
  `   在那支的訊息裡補一句 ——\n` +
  `   「⚠️⚠️ 改之前先查那一份是誰的：bash scripts/genguard.sh <路徑>\n` +
  `     · 產生器的產物 ⇒ 改**來源**（tools/…）再 bash scripts/genrun.sh <step>。\n` +
  `     ⛔ 直接改出貨 JSON 會被下一次 sync 打回來，而那個「又紅了」看起來像**新的**錯。」`;

describe("守衛訊息必須指名產生器（誤導源稽核 ③）", () => {
  it("GUARD-THE-GUARD：解析器真的看得到東西（掃到 0 個對任何內容都是綠的）", () => {
    expect(scanned, "掃到的 *.test.ts 太少 —— 走訪或路徑壞了").toBeGreaterThan(400);
    expect(OWNERS.size, "sync-io.json 的 writes 太少 —— 產物表壞了").toBeGreaterThan(500);
    expect(hits.length, "沒有任何訊息指名產物路徑 —— 訊息抽取器壞了").toBeGreaterThanOrEqual(20);
  });

  it("⛔ 訊息指名產物卻不提誰寫它 —— 新增一律紅（PENDING 只准變短）", () => {
    const unlisted = violating.filter((h) => PENDING[h.file] === undefined).flatMap((h) => h.where);
    expect(
      unlisted.join("\n"),
      `⛔ ${unlisted.length} 則守衛訊息叫人去改一個**產生器的產物**，而訊息裡沒有一個字說那是誰寫的。\n` +
        `照著它做 = 改產物 ⇒ 下一次 sync 打回來 ⇒ 那個「又紅了」看起來像新的錯（owner 2026-08-24：「發生上百次」）。` +
        HOWTO,
    ).toBe("");
  });

  it("⭐ 訊息裡具名的 genrun 步驟必須真的寫得到那個檔（⛔ 補上去的那句話不可以說謊）", () => {
    // ⚠️ 這一條是 2026-08-25「把 39 列抽乾」的**必要配套**：修法是在 39 支訊息裡寫下
    // 「改來源再 bash scripts/genrun.sh <某一支>」，而那個步驟名是 sync-io 的**第二個住處**。
    // 沒有這一條，擁有權一改就是 39 句同時過期而**零紅燈**（第三守則：註解會說謊）。
    const wrong: string[] = [];
    for (const h of hits) {
      for (const s of h.steps) {
        if (!STEP_NAMES.has(s)) wrong.push(`${h.file} 叫人跑 genrun.sh ${s} —— sync-io.json 裡沒有這個步驟`);
        else if (!h.owner.split(" · ").includes(s))
          wrong.push(
            `${h.file} 叫人跑 genrun.sh ${s}，但它寫的不是這支點名的產物（${h.product} 的主人是 ${h.owner}）`,
          );
      }
    }
    expect(
      wrong.join("\n"),
      "⛔ 守衛訊息指錯了產生器 —— 照著跑會得到「產生器說 OK 但檔案沒動」，\n" +
        "   而那比不說更糟（它看起來像已經修好了）。\n" +
        "⭐ 步驟名只有一個住處：tools/parallel-gates/sync-io.json 的 steps[].writes。",
    ).toBe("");
  });

  it("⭐ 棘輪：PENDING 上修好的／消失的列必須刪掉（表只准變短）", () => {
    const live = new Map(violating.map((h) => [h.file, h]));
    const stale: string[] = [];
    for (const [file, row] of Object.entries(PENDING)) {
      const h = live.get(file);
      if (!h) stale.push(`${file} —— 已經修好（或檔案沒了）⇒ 把這一列刪掉`);
      else if (h.product !== row.product || h.owner !== row.owner)
        stale.push(`${file} —— 這一列過期了：實測「${h.product} · ${h.owner}」，表上寫「${row.product} · ${row.owner}」`);
    }
    expect(stale.join("\n"), `⛔ ${PENDING_JSON} 是棘輪：修好一支就刪一列，⛔ 不可以留著。`).toBe("");
  });
});

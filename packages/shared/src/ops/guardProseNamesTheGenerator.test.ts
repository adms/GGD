/**
 * guardProseNamesTheGenerator.test.ts
 * —— ⭐ **tools／scripts 的 prose（print／echo／註解／docstring）提到產物，也要指名產生器。**
 *
 * `guardMessagesNameTheGenerator.test.ts` 關掉了「守衛失敗訊息叫人改產物」那一半 ——
 * 但誤導源不只住在測試裡：一支腳本的 docstring 寫「PATCHES … in content/champions/*.json」、
 * 一句 print 說「content/config/vfx-families.json 與量測不一致」而**不說那個檔是誰寫的**，
 * 下一輪（或下一條 lane）照著它動手，就是同一個「改產物 → sync 打回來 → 看起來像新的錯」。
 * 2026-08-25 首輪掃到的最貴一句：resolve_unit_tints.py 的 docstring 逐字宣稱
 * "content/champions/*.json is … hand-maintained"（⛔ 它們是 skillremake:json 的產物）。
 *
 * ── 判準：與姊妹閘同一個立場，⭐ 寧可漏報也不要誤報 ─────────────────────────
 * ① 只讀 **prose**：註解（# ／ // ／ block comment）、python docstring、
 *    以及 print／echo／console／throw 那一類「說給人聽」的行。
 *    ⛔ 純程式碼的字串（`readJson("content/…")` 的參數）不算 —— 那是路徑，不是 guidance。
 * ② 域：`tools/**\/*.{py,mjs,ts}`（⛔ 不含 `*.test.ts` —— 那是姊妹閘的域）＋ `scripts/*.{sh,py}`。
 * ③ 「是不是產物」只有一個住處：`tools/parallel-gates/sync-io.json` 的 `steps[].writes`。
 *    glob／佔位（`*`、`<id>`、`${x}`、`{aid}`）只在涵蓋的每一個實檔都是產物時才命中。
 * ④ 擁有者線索**逐檔**判定：MARKERS 或**任何一個 sync-io 步驟名**出現在檔案任何地方就算。
 * ⑤ 順手也抓「請改這個 JSON」型祈使句（GUIDE_RE）—— 2026-08-25 母體是 0，留給未來。
 *
 * ⚠️ 已知的漏（誠實列出）：
 *   · 動態拼出來的路徑（`f"content/abilities/" + aid`）拆在兩個字串裡 ⇒ 掃不到。
 *   · 報表資料裡的字串（dict 的 value、表格 label）刻意不算 prose ⇒ 掃不到。
 *   · 檔案只要提到**任何一個**步驟名就整檔算 named（判準④偏漏報那一邊）。
 *
 * ⭐ 棘輪：`tools/parallel-gates/guard-prose-pending.json` **只准變短** ——
 * 首輪抓到而沒當場修的檔進表；修好一支刪一列；新的違規檔直接紅。
 * ⚠️ `scripts/genguard.sh` 與 `scripts/preserve-before-overwrite.py` 由 NORM lane 持有，
 * 它們若違規**進棘輪**，⛔ 不要在這條 lane 改它們（實測兩份都自帶 genguard 字樣 ⇒ named）。
 *
 * 突變紀錄（2026-08-25 實跑）：往 tools/w3x-import/mesh_audit_report.py 塞一行
 * `# 改 content/config/stat-caps.json 讓上限一致` → 「新增一律紅」指名那一檔那一行。撤掉。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const PENDING_JSON = "tools/parallel-gates/guard-prose-pending.json";

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
/**
 * ⭐ 步驟名的真來源是 `steps[].name`，⛔ **不是** OWNERS 的值 ——
 * 有些步驟的 `writes` 是空的（trace 沒抓到它寫了什麼，例：`contract:numbers`
 * 寫的那份文件被歸給 `skillremake:docs`），而它們仍然是**真的步驟**。
 * ⚠️ 2026-08-25 這條閘就是這樣把 `contract:numbers` 誤判成幽靈名的 —— 一條
 * 說謊的閘比沒有閘更糟，因為它會叫人把對的東西改掉。
 */
const STEP_NAMES = new Set(
  (JSON.parse(readFileSync(join(REPO, "tools/parallel-gates/sync-io.json"), "utf8")) as {
    steps: { name: string }[];
  }).steps.map((s) => s.name),
);

type Row = { product: string; owner: string };
const PENDING = (JSON.parse(readFileSync(join(REPO, PENDING_JSON), "utf8")) as { pending: Record<string, Row> })
  .pending;

const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", "out", "legacy", "__pycache__"]);
function proseFiles(): string[] {
  const acc: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIR.has(e.name) && !e.name.startsWith(".")) walk(join(dir, e.name));
      } else if (
        (e.name.endsWith(".py") || e.name.endsWith(".mjs") || e.name.endsWith(".ts")) &&
        !e.name.endsWith(".test.ts") // 姊妹閘的域
      )
        acc.push(join(dir, e.name));
    }
  };
  walk(join(REPO, "tools"));
  for (const e of readdirSync(join(REPO, "scripts"), { withFileTypes: true }))
    if (e.isFile() && (e.name.endsWith(".sh") || e.name.endsWith(".py"))) acc.push(join(REPO, "scripts", e.name));
  return acc.sort();
}

/** 「說給人聽」的行 —— print／echo／console／throw 家族（判準①）。 */
const PRINT_PY = /\bprint\s*\(|file\s*=\s*sys\.std(?:err|out)|\braise\b/;
const PRINT_SH = /\b(?:echo|printf|die|warn|log)\b/;
const PRINT_TS = /console\.|process\.std(?:err|out)|\bthrow\b/;

/** 逐行抽 prose 片段（⛔ 不用 AST —— 行級狀態機就夠，錯了偏漏報那一邊）。 */
function proseSegments(path: string, text: string): { line: number; seg: string }[] {
  const out: { line: number; seg: string }[] = [];
  const lines = text.split("\n");
  const isPy = path.endsWith(".py");
  const isSh = path.endsWith(".sh");
  let inTriple: string | null = null; // python docstring
  let inBlock = false; // ts/mjs block comment
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i]!;
    const n = i + 1;
    if (isPy) {
      if (inTriple) {
        out.push({ line: n, seg: s });
        if (s.includes(inTriple)) inTriple = null;
        continue;
      }
      const tq = /("""|''')/.exec(s);
      if (tq) {
        out.push({ line: n, seg: s });
        const q = tq[1]!;
        if (!s.slice(tq.index + 3).includes(q)) inTriple = q;
        continue;
      }
      const h = s.indexOf("#");
      if (h >= 0) out.push({ line: n, seg: s.slice(h) });
      const code = h >= 0 ? s.slice(0, h) : s;
      if (PRINT_PY.test(code)) out.push({ line: n, seg: code });
    } else if (isSh) {
      const h = s.indexOf("#");
      if (h >= 0) out.push({ line: n, seg: s.slice(h) });
      const code = h >= 0 ? s.slice(0, h) : s;
      if (PRINT_SH.test(code)) out.push({ line: n, seg: code });
    } else {
      if (inBlock) {
        out.push({ line: n, seg: s });
        if (s.includes("*/")) inBlock = false;
        continue;
      }
      const st = s.trimStart();
      if (st.startsWith("/*")) {
        out.push({ line: n, seg: s });
        if (!s.includes("*/")) inBlock = true;
        continue;
      }
      const c = s.indexOf("//");
      if (c >= 0) out.push({ line: n, seg: s.slice(c) });
      const code = c >= 0 ? s.slice(0, c) : s;
      if (PRINT_TS.test(code)) out.push({ line: n, seg: code });
    }
  }
  return out;
}

const PATH_RE = /content\/(?:abilities|champions|config|items|augments|status-effects)\/[^\s"'`,)（）。，、｜|\\]+/g;
/** 「請改這個 JSON」型祈使句（判準⑤）。⛔ 否定句（不要手改…）自帶 MARKERS 所以不會誤中。 */
const GUIDE_RE = /(?:請|去|直接|就)\s*(?:手改|改|編輯)\s*(?:這|該|此)[^\n。；;]{0,8}(?:JSON|json|檔)/;
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

/** 與姊妹閘同一套：產物 ⇒ 擁有步驟；不是／說不準 ⇒ null（＝漏報那一邊）。 */
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
        .replace(/\{[^}]*\}/g, " ") // python f-string 佔位
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
  return [...owners].sort(); // ⭐ readdirSync 的順序跟檔案系統走 —— 排序讓 PENDING 的列跨機器穩定
}

const GENRUN_RE = /genrun\.sh\s+([A-Za-z][\w.-]*:[\w.-]+)/g;

type Hit = { file: string; named: boolean; where: string[]; product: string; owner: string; steps: string[] };
function scan(): { hits: Hit[]; scanned: number } {
  const hits: Hit[] = [];
  const files = proseFiles();
  for (const abs of files) {
    const text = readFileSync(abs, "utf8");
    if (!text.includes("content/")) continue;
    const rel = relative(REPO, abs).split(sep).join("/");
    const where: string[] = [];
    const paths: string[] = [];
    const owners = new Set<string>();
    for (const { line, seg } of proseSegments(rel, text)) {
      for (const mt of seg.matchAll(PATH_RE)) {
        const o = productOwners(mt[0]);
        if (!o) continue;
        const clean = mt[0].replace(/[.。、，,:：;；)）」』】>]+$/, "");
        where.push(`${rel}:${line} 提到 ${clean} —— 那是 ${o.join(" · ")} 的產物`);
        if (!paths.includes(clean)) paths.push(clean);
        for (const x of o) owners.add(x);
      }
      if (GUIDE_RE.test(seg) && seg.includes("content/")) {
        where.push(`${rel}:${line} 是「請改這個 JSON」型 guidance：${seg.trim().slice(0, 80)}`);
        if (!paths.includes("「改這個JSON」guidance")) paths.push("「改這個JSON」guidance");
      }
    }
    if (paths.length === 0) continue;
    const named =
      MARKERS.some((k) => text.includes(k)) || [...STEP_NAMES].some((sn) => text.includes(sn));
    const steps = new Set<string>();
    for (const g of text.matchAll(GENRUN_RE)) steps.add(g[1]!);
    hits.push({
      file: rel,
      named,
      where,
      product: paths.join(" · "),
      owner: [...owners].sort().join(" · "),
      steps: [...steps],
    });
  }
  return { hits, scanned: files.length };
}

const { hits, scanned } = scan();
const violating = hits.filter((h) => !h.named);

const HOWTO =
  `\n⭐ 修法（只改那一句 prose，⛔ 不要加進 ${PENDING_JSON} —— 那張表只准變短）：\n` +
  `   在那句話旁邊補上擁有者線索 ——\n` +
  `   「⚠️ 那一份是產生器的產物：bash scripts/genguard.sh <路徑> 查擁有者，\n` +
  `     要改就改**來源**再 bash scripts/genrun.sh <step>。\n` +
  `     ⛔ 直接改出貨 JSON 會被下一次 sync 打回來，而那個「又紅了」看起來像**新的**錯。」`;

describe("tools／scripts 的 prose 必須指名產生器（誤導源稽核的另一半）", () => {
  it("GUARD-THE-GUARD：解析器真的看得到東西（掃到 0 個對任何內容都是綠的）", () => {
    expect(scanned, "掃到的 tools/scripts 檔太少 —— 走訪或路徑壞了").toBeGreaterThan(300);
    expect(OWNERS.size, "sync-io.json 的 writes 太少 —— 產物表壞了").toBeGreaterThan(500);
    expect(hits.length, "沒有任何 prose 提到產物路徑 —— 片段抽取器壞了").toBeGreaterThanOrEqual(8);
  });

  it("⛔ prose 提到產物卻不提誰寫它 —— 新增一律紅（PENDING 只准變短）", () => {
    const unlisted = violating.filter((h) => PENDING[h.file] === undefined).flatMap((h) => h.where);
    expect(
      unlisted.join("\n"),
      `⛔ ${unlisted.length} 句 tools/scripts 的 prose 提到一個**產生器的產物**，而整個檔案沒有一個字說那是誰寫的。\n` +
        `照著它動手 = 改產物 ⇒ 下一次 sync 打回來 ⇒ 那個「又紅了」看起來像新的錯（owner 2026-08-24：「發生上百次」）。` +
        HOWTO,
    ).toBe("");
  });

  it("⭐ prose 裡具名的 genrun 步驟必須真的存在（⛔ 幽靈名：prose:apply 的前科）", () => {
    const wrong: string[] = [];
    for (const h of hits)
      for (const s of h.steps)
        if (!STEP_NAMES.has(s)) wrong.push(`${h.file} 叫人跑 genrun.sh ${s} —— sync-io.json 裡沒有這個步驟`);
    expect(
      wrong.join("\n"),
      "⛔ prose 指了一個不存在的產生器步驟 —— 照著跑會得到「找不到步驟」或跑錯支，\n" +
        "   而那比不說更糟（它看起來像已經有答案了）。步驟名只有一個住處：sync-io.json。",
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

/**
 * 🔍 **裝飾性設定欄位普查** —— GH#927。
 *
 * owner 2026-09-01（逐字）：
 *
 * > 「`reward.xp: 40` 實質上是裝飾。因為每 6 隻就清空一次經驗條
 * >  **=> 還有類似這種設定嗎**」
 *
 * ⭐ 這一支是**第一·五守則在「設定」上的版本**。
 * `noOpModifierClaims.test.ts` 管的是 `content/{items,abilities,augments,champions}`
 * 的 modifier —— ⛔ **它管不到 `content/config/`**。一格後台欄位如果調了玩家量不到
 * 差別，在 2026-09-02 之前**沒有任何東西會說話**：它會一直待在後台，
 * 看起來像一個可用的旋鈕。
 *
 * ── ⭐ 兩頭都要走（CLAUDE.md 綠燈假來源⑫）────────────────────────────────
 * 「這條掃描**從哪一頭走**？從『欄位』走 ⇒ 一定漏掉『引擎做得到而沒有欄位』的；
 *  從『引擎』走 ⇒ 一定漏掉『有欄位而沒有讀端』的。⇒ **兩頭都要走**。」
 *
 * | 類 | 病 | 這一支怎麼判（⛔ 全部是**關係**，不是名詞） |
 * |---|---|---|
 * | **A** `no-read-end` | 有欄位而**零讀端** | 這一格的鍵名在**出貨消費端語彙**裡出現 **0** 次 |
 * | **A** `dominated` | **被同軸的另一格蓋掉** | 同一個物件裡的 xp 格與等級格，在出貨值下算出的**佔比** |
 * | **B** `schema-locks-engine-zero` | 引擎做得到而 schema 不准 | Zod `min > 0` **且**引擎原始碼有 `<鍵> ⋯ 0` 的分支 |
 * | **B** `single-point-range` | 上下界夾成一個點 | Zod `min === max` |
 * | **C** 正常 | —— | 以上皆非 |
 *
 * ── ⛔ 為什麼結論**不可以**寫成一張名單 ───────────────────────────────────
 * 票文逐字：「『調了沒差』是**相對於出貨設定**的 —— owner 把另一格改掉之後，
 * 同一格可能就有效了 ⇒ 守衛要**從出貨設定推導**，⛔ 不可以把結論寫死成一張名單
 * （那會變成一張說謊的表）」。
 * ⇒ `killsPerLevel` 一旦被設成 0（GH#918 正在做的事），`reward.xp` **自動**
 * 從 A 變回 C，⛔ 不必改這一支、⛔ 也不必改守衛。
 *
 *   pnpm decor:build     # 重新產生
 *   pnpm decor:check     # 逐位元組比對（唯讀）
 *   npx tsx tools/config-decor/gen.ts --json          # 給守衛讀的原始普查
 *   npx tsx tools/config-decor/gen.ts --json --fixture <夾具目錄>   # ⭐ sentinel
 *
 * ⚠️ **刻意沒有產生日期**（與 `caps:export` 同一個理由）：任何隨時鐘變動的欄位
 * 都會讓逐位元組比對永遠不相等，於是 `--check` 只能被放寬成模糊比對 ——
 * 而一條被放寬的閘等於沒有閘。
 */
// ggd:writes docs/editor-contract/ggd-config-decoration-census.json
// ggd:writes docs/editor-contract/ggd-config-decoration-census.md
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(__dirname, "../..");

/**
 * ⛔⛔ **為什麼是 `import(ROOT/…)` 而不是 `import "@ggd/shared/…"`**（2026-09-02 量到的）：
 *
 * 在一個 `isolation: "worktree"` 的 lane 裡，`require.resolve("@ggd/shared/…")`
 * 解到的是 **`/Users/Takuro/GGD/packages/shared`（主 checkout）**，⛔ 不是這棵樹 ——
 * 而 `ROOT` 是這棵樹。⇒ ⭐ 一支同時讀「這棵樹的 content」與「別棵樹的 schema」
 * 的普查器，會報出一個**兩棵樹混出來的**結論，⚠️ 而它讀起來跟真的一模一樣。
 * （實測：這棵樹的 `killsPerLevel` 是 `min(1)`，主 checkout 已經是 `min(0)` ⇒
 *   B 類那一格整個消失。）
 * ⇒ ⭐ 兩個輸入**必須來自同一棵樹**，⛔ 而唯一能保證這件事的是絕對路徑。
 */
const requireFromTree = createRequire(pathToFileURL(join(ROOT, "tools/")).href);
const fromTree = <T>(rel: string): T => requireFromTree(join(ROOT, rel)) as T;

const { zConfigDoc } = fromTree<{ zConfigDoc: unknown }>("packages/shared/src/content/schema/config/index.ts");
const { xpToNext, LEVEL_CAP } = fromTree<{
  xpToNext: (level: number) => number;
  LEVEL_CAP: number;
}>("packages/shared/src/sim/economy/progression.ts");

const OUT_JSON = join(ROOT, "docs/editor-contract/ggd-config-decoration-census.json");
const OUT_MD = join(ROOT, "docs/editor-contract/ggd-config-decoration-census.md");

/**
 * ⭐ **佔比門檻** —— 一格在自己那條軸上動得了的比例低於這個數，就叫「裝飾」。
 *
 * ⛔ 這個數字**不是憑感覺挑的**，它被 owner 自己的實例夾在中間：
 *  · 下界 —— owner 逐字把 **9%**（`reward.xp` 在中位等級的佔比）稱為「裝飾」
 *    ⇒ 門檻必須 **> 9%**，否則它抓不到 owner 親自點名的那一格。
 *  · 上界 —— 一格佔自己那條軸 **50%** 顯然不是裝飾（它與另一格平手）
 *    ⇒ 門檻必須 **< 50%**。
 * ⇒ ⭐ **25%** ＝ 「同軸的另一格值 3 倍以上」。這是一個**能被反駁的理由**：
 * 要反駁它，只要指出一格佔比在 25% 附近而玩家**真的**量得出差別。
 * ⚠️ 而出貨量到的三格是 **5.2% / 1.6% / 1.9%** —— ⛔ 離門檻很遠，
 * ⭐ 所以這個常數今天**不承重**（改成 15% 或 40% 結論一樣）。
 */
const DOMINATED_SHARE = 0.25;

// ─────────────────────────────────────────────────────────────────────────────
// ① 母體：**知識住 Zod**，⛔ 不是掃 JSON 的葉子
// ─────────────────────────────────────────────────────────────────────────────
/**
 * ⛔⛔ **為什麼母體不可以是「JSON 的每一片葉子」**（第一版就是這樣，⛔ 而它是錯的）：
 *
 * `content/config/audio-map.json` 有 1,011 片葉子，而它們絕大多數的鍵是
 * **內容 id**（`godie-h02u`…）—— 那些鍵當然不會出現在引擎的語彙裡
 * ⇒ 「零讀端」偵測會把**整張資料表**判成裝飾。
 * ⭐ 而一條會誤報的閘會被人放寬 —— 那正是這份普查要防的東西的反面。
 *
 * ⇒ ⭐ **一格「旋鈕」的定義：它的最後一段是 Zod 物件裡一個靜態的鍵。**
 * 走 `z.record()` 的鍵（`*`）與陣列索引（`[]`）**是資料，⛔ 不是旋鈕**。
 * （⚠️ 但 `schedule[].mobsPerWaveCap` **是**旋鈕 —— 中間經過陣列沒關係，
 *   ⭐ 判準是**最後一段**。）
 */
export type Knob = {
  /** 出貨檔名，例 `arena-rules.json`。 */
  file: string;
  /** schema tag，例 `config.arena-rules@1`。 */
  tag: string;
  /** 由靜態鍵組成的路徑，例 `mobWaves.schedule[].mobsPerWaveCap`。 */
  path: string;
  /** 最後一段（＝要拿去問「有沒有讀端」的那個名字）。 */
  key: string;
  type: string;
  min?: number;
  max?: number;
};

type ZodAny = {
  _def: Record<string, unknown> & { typeName: string };
};

const def = (s: unknown) => (s as ZodAny)._def;

/** 剝掉所有包裝層（optional / default / effects / …），回到真正的型別。 */
function unwrap(s: unknown, depth = 0): unknown {
  if (!s || depth > 24) return s;
  const d = def(s);
  switch (d?.typeName) {
    case "ZodOptional":
    case "ZodNullable":
    case "ZodDefault":
    case "ZodCatch":
    case "ZodReadonly":
      return unwrap(d.innerType, depth + 1);
    case "ZodEffects":
      return unwrap(d.schema, depth + 1);
    case "ZodBranded":
      return unwrap(d.type, depth + 1);
    case "ZodPipeline":
      return unwrap(d.out, depth + 1);
    case "ZodLazy":
      return unwrap((d.getter as () => unknown)(), depth + 1);
    default:
      return s;
  }
}

function numericBounds(s: unknown): { min?: number; max?: number } {
  const checks = (def(s)?.checks ?? []) as Array<{ kind: string; value: number }>;
  const out: { min?: number; max?: number } = {};
  for (const c of checks) {
    if (c.kind === "min") out.min = c.value;
    if (c.kind === "max") out.max = c.value;
  }
  return out;
}

/** 走一份 config schema，吐出它的每一格旋鈕。 */
function knobsOf(schema: unknown, file: string, tag: string): Knob[] {
  const out: Knob[] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown, path: string, depth: number): void => {
    if (depth > 14) return;
    const s = unwrap(node);
    const d = def(s);
    if (!d) return;
    switch (d.typeName) {
      case "ZodObject": {
        if (seen.has(s)) return;
        seen.add(s);
        const shape = (d.shape as () => Record<string, unknown>)();
        for (const [k, v] of Object.entries(shape)) {
          if (path === "" && (k === "id" || k === "schema")) continue; // 文件外殼，⛔ 不是旋鈕
          walk(v, path ? `${path}.${k}` : k, depth + 1);
        }
        seen.delete(s);
        return;
      }
      case "ZodArray":
        walk(d.type, `${path}[]`, depth + 1);
        return;
      case "ZodRecord":
        // ⭐ record 的**鍵**是資料（內容 id），只往下走它的**值**。
        walk(d.valueType, `${path}.*`, depth + 1);
        return;
      case "ZodTuple":
        for (const [i, t] of (d.items as unknown[]).entries()) walk(t, `${path}[${i}]`, depth + 1);
        return;
      case "ZodUnion":
      case "ZodDiscriminatedUnion":
        for (const o of d.options as unknown[]) walk(o, path, depth + 1);
        return;
      case "ZodIntersection":
        walk(d.left, path, depth + 1);
        walk(d.right, path, depth + 1);
        return;
      default:
        break;
    }
    // ── 葉子 ──
    const key = path.split(".").pop() ?? "";
    // ⭐ 最後一段是 record 的鍵或陣列索引 ⇒ **資料**，⛔ 不是旋鈕。
    if (key === "*" || key === "" || /^\[/.test(key) || key.endsWith("]")) return;
    const b = d.typeName === "ZodNumber" ? numericBounds(s) : {};
    out.push({ file, tag, path, key, type: String(d.typeName).replace(/^Zod/, "").toLowerCase(), ...b });
  };
  walk(schema, "", 0);
  // 同一條路徑可能被 union 的兩個分支各走一次 —— 去重，保留較寬的界。
  const byPath = new Map<string, Knob>();
  for (const k of out) {
    const prev = byPath.get(k.path);
    if (!prev) byPath.set(k.path, k);
    else {
      if (prev.min !== undefined && k.min !== undefined) prev.min = Math.min(prev.min, k.min);
      else prev.min = undefined;
      if (prev.max !== undefined && k.max !== undefined) prev.max = Math.max(prev.max, k.max);
      else prev.max = undefined;
    }
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** 出貨 Zod union 裡的每一份 config → 它的旋鈕清單。 */
function shippedKnobs(configDir: string): Knob[] {
  const tagToFile = new Map<string, string>();
  for (const f of readdirSync(configDir).filter((f) => f.endsWith(".json") && f !== "_index.json")) {
    const raw = JSON.parse(readFileSync(join(configDir, f), "utf8")) as { schema?: string };
    if (raw.schema) tagToFile.set(raw.schema, f);
  }
  const out: Knob[] = [];
  for (const opt of def(zConfigDoc).options as unknown[]) {
    const shape = (def(opt).shape as () => Record<string, unknown>)();
    const tag = String(def(unwrap(shape.schema))?.value ?? "");
    const file = tagToFile.get(tag);
    if (!file) continue; // union 有這一員而 content/ 裡沒有那份文件 —— 不是本票的題目
    out.push(...knobsOf(opt, file, tag));
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.path.localeCompare(b.path));
}

// ─────────────────────────────────────────────────────────────────────────────
// ② 出貨消費端的**語彙** —— 「有沒有讀端」問的是這個
// ─────────────────────────────────────────────────────────────────────────────
/**
 * ⛔ **排除的兩塊，各有理由**（⛔ 不是「掃起來比較乾淨」）：
 *  · `apps/admin/**` —— 後台是**第二個住處**（`SHIPPED_*` ＋ 欄位表）。
 *    一格只被後台認識 ＝ 它能被填，⛔ 而沒有人讀 —— ⭐ 那就是裝飾的定義。
 *  · 任何 `.test.` / `.spec.` 檔 —— 一條測試提到某個名字，⛔ 不會讓玩家量到任何差別。
 *
 * ⚠️⚠️ ⭐ **`content/schema/` 刻意*不*在這裡** —— 2026-09-02 第一版排掉了整個目錄，
 * ⛔ 而那是錯的：出貨的 schema 檔**同時住著宣告與解析器**
 * （`weather.ts:607` 逐字 `policy.fogDensityAtFull` ⇒ 那是一個**真的讀端**）
 * ⇒ 排掉整個目錄會把「有解析器」誤報成「零讀端」。
 * ⭐ 分開它們的不是目錄，是**寫法**：見 {@link READ}。
 */
const CORPUS_EXCLUDE = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)(dist|build|out)(\/|$)/,
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
  /^apps\/admin\//,
  /(^|\/)__fixtures__(\/|$)/,
];

const CORPUS_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|go|py)$/;

/**
 * ⭐ 消費端**包含 `tools/` 與 `scripts/`**。
 *
 * ⚠️ 這一格是 2026-09-02 改過的：第一版只掃 `packages/shared/src` 與 `apps/`，
 * 於是 `icon-style.json` 的 6 格提示詞被判成「零讀端」—— ⛔ 而它們的讀端是
 * `tools/icon-gen/`，⭐ **而那支產生器畫出來的圖玩家真的看得到**。
 * ⇒ 判準是「**玩家量不量得到差別**」，⛔ 不是「引擎讀不讀」——
 *   一支產生器讀它並把結果烘進出貨內容，那就是一個讀端。
 */

function walkFiles(dir: string, root: string, acc: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    const rel = relative(root, p);
    if (CORPUS_EXCLUDE.some((r) => r.test(rel))) continue;
    if (st.isDirectory()) walkFiles(p, root, acc);
    else if (CORPUS_EXT.test(e)) acc.push(p);
  }
}

type Hit = { file: number; line: string };

/**
 * ⭐⭐ **「被讀」長什麼樣** —— ⛔ 「這個字出現過」不算。
 *
 * | 寫法 | 是不是讀 |
 * |---|---|
 * | `policy.fogDensityAtFull` · `cfg["xp"]` | ⭐ **是** —— 成員存取 |
 * | `const { xp } = reward` | ⭐ **是** —— 解構 |
 * | `xp: z.number().int().min(0)` | ⛔ 不是 —— **宣告**（問題本身） |
 * | `xp: 40,` | ⛔ 不是 —— **預設值**（第二個住處） |
 * | `` * 這一格叫 `xp` `` | ⛔ 不是 —— 散文（第三守則：註解會說謊） |
 *
 * ⇒ ⭐ 這一條讓「排掉整個 schema 目錄」變成不必要：宣告與解析器住同一個檔
 * **而它們的寫法不一樣**，⛔ 目錄分不開它們，⭐ 寫法分得開。
 */
const READ = /[.[]\s*["']?([A-Za-z_$][\w$]*)/g;
/**
 * ⭐ **查表式的讀** —— `{ mob: "goldMobKill", elite: "goldEliteKill" }` 這種
 * 「鍵名住在一個字串常數裡，再拿去索引」的寫法。
 *
 * ⚠️ 2026-09-02 量到：漏掉這一條會把 `combat-env` 的 **11 格系統倍率**
 * （owner 自己的旋鈕！）判成零讀端 —— ⛔ 而那是最不能誤報的一族。
 * ⚠️ 只認 `"…"` 與 `'…'`，⛔ 不認反引號：這個 repo 的註解一律用
 * `` `欄位名` `` 引用欄位，收進來就等於「散文也算讀端」（第三守則）。
 */
const READ_STR = /["']([A-Za-z_$][\w$]*)["']/g;
/** 解構那一半：`} =` / `}) =>` / `}: T` 這幾種收尾都算。 */
const DESTRUCTURE = /\}\s*[=:)]/;

type Corpus = {
  /** ⭐ **被讀過**的識別字（見 {@link READ}），⛔ 不是「提到過」的。 */
  vocab: Set<string>;
  /** 每一個識別字 → 提到它的**行**（給「零與 0 比較」那條關係用）。 */
  hits: Map<string, Hit[]>;
  /** 每一份檔案自己的語彙 —— ⭐ 「同一份檔也提到它的**父路徑**」那條關係要用。 */
  fileVocab: Array<Set<string>>;
  /**
   * 每一個識別字出現在**幾份**檔案裡。
   * ⚠️ ⛔ 不可以拿 `hits` 去數 —— 那一份為了記憶體**每個名字只留 60 筆**，
   * ⭐ 於是 `push`（幾乎每份檔都有）會被數成 60 ⇒ 「稀有」判定整條反過來。
   */
  spread: Map<string, number>;
  files: number;
};

function readCorpus(roots: string[], base: string): Corpus {
  const files: string[] = [];
  for (const r of roots) if (existsSync(r)) walkFiles(r, base, files);
  const vocab = new Set<string>();
  const hits = new Map<string, Hit[]>();
  const fileVocab: Array<Set<string>> = [];
  const ID = /[A-Za-z_$][A-Za-z0-9_$]*/g;
  for (const [fi, f] of files.entries()) {
    const own = new Set<string>();
    fileVocab.push(own);
    const text = readFileSync(f, "utf8");
    for (const line of text.split("\n")) {
      const ids = line.match(ID);
      if (!ids) continue;
      // ── `hits` / `fileVocab`：**提到過**就算（B 類要在行裡找 0 分支與主詞）──
      for (const id of new Set(ids)) {
        own.add(id);
        const arr = hits.get(id);
        if (arr === undefined) hits.set(id, [{ file: fi, line: line.trim() }]);
        else if (arr.length < 60) arr.push({ file: fi, line: line.trim() });
      }
      // ── `vocab`：⭐ 只收**被讀**的（A 類「零讀端」問的是這個）──
      for (const m of line.matchAll(READ)) vocab.add(m[1]!);
      for (const m of line.matchAll(READ_STR)) vocab.add(m[1]!);
      if (DESTRUCTURE.test(line)) for (const id of ids) vocab.add(id);
    }
  }
  const spread = new Map<string, number>();
  for (const own of fileVocab) for (const id of own) spread.set(id, (spread.get(id) ?? 0) + 1);
  return { vocab, hits, fileVocab, spread, files: files.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ 三個偵測器
// ─────────────────────────────────────────────────────────────────────────────
export type Finding = {
  klass: "A" | "B";
  kind: "no-read-end" | "dominated" | "schema-locks-engine-zero" | "single-point-range";
  file: string;
  path: string;
  /** 出貨值（走過陣列/record 的路徑會是 `"(varies)"`）。 */
  value: unknown;
  /** ⭐ **量到的**理由，⛔ 不是形容詞。 */
  why: string;
};

/** 把 `a.b[].c` / `a.*.c` 在一份 JSON 裡解出**所有**命中的值。 */
function resolve_(doc: unknown, path: string): unknown[] {
  let cur: unknown[] = [doc];
  for (const seg of path.split(".")) {
    const next: unknown[] = [];
    for (const node of cur) {
      if (node === null || node === undefined) continue;
      const m = /^(.*)\[\]$/.exec(seg);
      const name = m ? m[1]! : seg;
      const hit: unknown[] =
        name === "*"
          ? typeof node === "object"
            ? Object.values(node as object)
            : []
          : name === ""
            ? [node]
            : typeof node === "object"
              ? [(node as Record<string, unknown>)[name]]
              : [];
      for (const h of hit) {
        if (h === undefined) continue;
        if (m) {
          if (Array.isArray(h)) next.push(...h);
        } else next.push(h);
      }
    }
    cur = next;
  }
  return cur.filter((v) => v !== undefined);
}

/**
 * ⛔⛔ **這條偵測對哪一族結構上是瞎的** —— ⭐ 誠實列出來，⛔ 不要讓它沉默地誤報。
 *
 * 級距表的鍵是**標籤**（`radius.極大` · `proportionality.expectedHits.單體`），
 * 而引擎讀它們的方式是 `TABLE[tier]` —— ⭐ **那個鍵名從來不會出現在原始碼裡**。
 * ⇒ 拿「語彙裡有沒有這個字」去問它們，答案**永遠是「沒有」** ——
 * ⚠️ 2026-09-02 第一版就是這樣一次誤報 **287 格**（`stat-normalization` 185 格
 * 全是 `Stat` 列舉的鍵、`aoe-tiers`/`damage-tiers`/… 全是五級距的中文標籤）。
 * ⭐ 而一條會誤報的閘會被人放寬 —— 那正是這份普查要防的東西的反面。
 *
 * ⇒ 判準：**鍵名不是一個合法的 JS 識別字 ⇒ 這條偵測對它不適用**（進 `notAssessable`）。
 * ⛔ 它們沒有被判成 C（那會說謊），⭐ 而是被記成「這把尺量不到」。
 */
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** ⭐ 【A · 零讀端】這一格的名字在出貨消費端裡**被讀** 0 次。 */
function detectNoReadEnd(configDir: string, knobs: Knob[], corpus: Corpus): Finding[] {
  const out: Finding[] = [];
  for (const k of knobs) {
    if (!IDENT.test(k.key)) continue;
    if (corpus.vocab.has(k.key)) continue;
    out.push({
      klass: "A",
      kind: "no-read-end",
      file: k.file,
      path: k.path,
      value: shippedValue(configDir, k),
      why:
        // ⛔⛔ **母體大小刻意不寫進這一句**（2026-09-02）—— 在此之前它是
        //   `在 ${corpus.files} 份…裡` ⇒ ⭐ **任何人多加一個原始碼檔,這 23 列
        //   的散文會一起變** ⇒ 產物過期而內容其實一模一樣。
        //   ⚠️ 那與 CLAUDE.md 記過的「時鐘欄位逼得 --check 被放寬」是同一個病:
        //   一格會隨無關改動而變的欄位,會讓逐位元組比對變成雜訊。
        //   ⭐ 母體只住 `population.corpusFiles` **一格**（那裡它是真資訊）。
        `\`${k.key}\` 在出貨消費端原始碼裡**被讀** 0 次 ` +
        `（讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）` +
        `⇒ 沒有任何東西讀得到它。`,
    });
  }
  return out;
}

/** 出貨值 —— 走過陣列/record 的路徑會有很多份，這裡回**第一份**並標明筆數。 */
function shippedValue(configDir: string, k: Knob): unknown {
  const p = join(configDir, k.file);
  if (!existsSync(p)) return null;
  const hits = resolve_(JSON.parse(readFileSync(p, "utf8")), k.path);
  if (hits.length === 0) return "(未出現在出貨文件裡)";
  if (hits.length === 1) return hits[0];
  return `${JSON.stringify(hits[0])} …（${hits.length} 筆）`;
}

/**
 * ⭐ 【A · 被同軸的另一格蓋掉】—— owner 親自點名的那一族。
 *
 * ⭐ 配對是**從出貨 JSON 的結構推導**的：同一個物件裡同時有
 * 「一格發經驗」與「一格直接發等級」⇒ 它們在**同一條軸**上，
 * 而玩家感受到的是**兩者的和**。
 *
 * | 鍵的形狀 | 語意 | 一次事件值多少級 |
 * |---|---|---|
 * | `…PerLevel`（`killsPerLevel`） | 每 N 次事件送 1 級 | `1 / N` |
 * | `…Levels`（`bountyLevels`） | 一次事件送 N 級 | `N` |
 *
 * ⚠️ **等級是區間**（CLAUDE.md：行為相依的量不能報單一數字）——
 * 這裡報 `[Lmin, 99]` 兩端的佔比，並用**中位**判定。
 */
function detectDominated(configDir: string, knobs: Knob[]): Finding[] {
  const out: Finding[] = [];
  const byFile = new Map<string, Knob[]>();
  for (const k of knobs) byFile.set(k.file, [...(byFile.get(k.file) ?? []), k]);
  for (const [file, ks] of byFile) {
    const p = join(configDir, file);
    if (!existsSync(p)) continue;
    const doc = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    const window = levelWindow(doc);
    // 同一個父物件底下的 xp 格 ↔ 等級格
    const parentOf = (path: string) => path.split(".").slice(0, -1).join(".");
    const groups = new Map<string, Knob[]>();
    for (const k of ks) groups.set(parentOf(k.path), [...(groups.get(parentOf(k.path)) ?? []), k]);
    for (const [, sibs] of groups) {
      const xps = sibs.filter((s) => /xp$/i.test(s.key) && s.type === "number");
      const lvls = sibs.filter((s) => /(PerLevel|Levels)$/.test(s.key) && s.type === "number");
      if (!xps.length || !lvls.length) continue;
      for (const xp of xps) {
        const xpVal = Number(resolve_(doc, xp.path)[0]);
        if (!Number.isFinite(xpVal) || xpVal === 0) continue;
        /**
         * ⭐⭐ **兩邊一定要用同一個「事件窗」當分母** —— ⛔ 2026-09-02 第一版就是
         * 這裡錯的：xp 那一邊乘了 6 隻，而等級那一邊用的是「每一隻 1/6 級」
         * ⇒ 佔比被高估 **4.8 倍**（24.9% vs 真正的 5.2%），⚠️ 而它**正好卡在
         * 門檻上** —— 一個算錯的量尺剛好在邊界上，是最貴的一種綠燈。
         *
         * ⇒ 窗的定義：`killsPerLevel = N` ⇒ 窗＝**N 隻**、直給 **1 級**；
         *   `bountyLevels = M` ⇒ 窗＝**1 隻**、直給 **M 級**。
         */
        const perLevelKnob = lvls.find((l) => /PerLevel$/.test(l.key));
        const events = perLevelKnob ? Number(resolve_(doc, perLevelKnob.path)[0]) || 1 : 1;
        let levels = 0;
        const via: string[] = [];
        for (const l of lvls) {
          const v = Number(resolve_(doc, l.path)[0]);
          if (!Number.isFinite(v) || v <= 0) continue; // ⭐ 0 ＝ 那一格關著 ⇒ 蓋不到任何東西
          levels += /PerLevel$/.test(l.key) ? 1 : v * events;
          via.push(`${l.key}=${v}`);
        }
        if (levels <= 0) continue;
        const share = (L: number) => {
          const xpLevels = (xpVal * events) / xpToNext(L);
          return xpLevels / (xpLevels + levels);
        };
        const mid = Math.round((window.min + window.max) / 2);
        const s = share(mid);
        if (s >= DOMINATED_SHARE) continue;
        out.push({
          klass: "A",
          kind: "dominated",
          file,
          path: xp.path,
          value: xpVal,
          why:
            `同一個物件裡的 ${via.join(" · ")} 在同一條軸上直接發等級。` +
            `等級區間 L${window.min}–L${window.max}（從 \`rounds[].grantLevels\` 與 ` +
            `\`mobWaves.fromRound\` 推導）⇒ 這一格佔那一次獎勵的 ` +
            `**${pct(share(window.max))}–${pct(share(window.min))}**（中位 ${pct(s)}，` +
            `門檻 ${pct(DOMINATED_SHARE)}）。`,
        });
      }
    }
  }
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/**
 * ⭐ 玩家**拿得到殭屍獎勵**的等級區間 —— 從出貨的回合給等表推導，⛔ 不是猜一個 30。
 * 下界＝殭屍開始出現的那一回合為止累積的給等；上界＝等級上限。
 */
function levelWindow(doc: Record<string, unknown>): { min: number; max: number } {
  const mw = doc.mobWaves as { fromRound?: number } | undefined;
  const rounds = doc.rounds as Record<string, { grantLevels?: number }> | undefined;
  if (!mw || !rounds) return { min: 1, max: LEVEL_CAP };
  const from = Number(mw.fromRound ?? 1);
  let lv = 1;
  for (const [r, v] of Object.entries(rounds)) if (Number(r) <= from) lv += Number(v.grantLevels ?? 0);
  return { min: Math.max(1, Math.min(lv, LEVEL_CAP)), max: LEVEL_CAP };
}

/**
 * ⭐ 【B · 引擎做得到而 schema 不准】—— ⭐ **反方向的同一個病**。
 *
 * ⚠️ 這一條驗的是**兩個名詞的關係**（CLAUDE.md 部署後置條件那一節）：
 * 「Zod 的下界」與「引擎的分支」分開看**各自都是對的**，
 * ⭐ 只有把它們對起來才看得出「一個做得到卻調不到的狀態」。
 */
function detectSchemaLocksEngineZero(knobs: Knob[], corpus: Corpus): Finding[] {
  const out: Finding[] = [];
  for (const k of knobs) {
    if (k.type !== "number" || k.min === undefined || k.min <= 0) continue;
    if (!IDENT.test(k.key)) continue;
    /**
     * ⭐ **兩條關係都要成立**，⛔ 一條不算（CLAUDE.md 綠燈假來源⑪：兩條各自
     * 驗一半的守衛可以同時是綠的而接縫是死的 —— 這裡是它的反面：
     * 兩個各自寬鬆的比對合起來才**指得準**）。
     */
    const hit = (corpus.hits.get(k.key) ?? []).find((h) => zeroBranch(h.line, k.key) && sameSubject(h, k, corpus));
    if (!hit) continue;
    out.push({
      klass: "B",
      kind: "schema-locks-engine-zero",
      file: k.file,
      path: k.path,
      value: `zod min ${k.min}`,
      why:
        `Zod 的下界是 \`min(${k.min})\`，⛔ 而引擎把 0 當成一個活的分支：` +
        `\`${hit.line.slice(0, 160)}\` ⇒ 一個**做得到卻調不到**的狀態。`,
    });
  }
  return out;
}

/**
 * ⭐ 關係①：這一行真的把**這一格自己**拿去跟 0 比。
 *
 * ⛔⛔ **`!== 0` 不夠** —— 2026-09-02 第一版就被這一行騙了：
 * `world.tick % moveFeelRules(world).chaosRerollTicks !== 0`
 * ⇒ 跟 0 比的是**取餘數的結果**，⛔ 不是那一格。（而且 `% 0` 是 NaN，
 *   把它讀成「引擎支援 0」正好是反過來的。）
 * ⇒ 判準：那一格必須是比較的**直接左運算元** —— 它前面（跳過 `.` 與識別字）
 *   不可以是一個算術運算子。
 */
function zeroBranch(line: string, key: string): boolean {
  const re = new RegExp(`\\b${key}\\s*(?:>|<=|===|!==|==|!=)\\s*0(?![\\d.])`, "g");
  for (const m of line.matchAll(re)) {
    // 往回走過 `foo.bar(x).baz.` 這串前綴（⭐ **含呼叫括號** —— 少了這一段就是
    // `world.tick % moveFeelRules(world).chaosRerollTicks !== 0` 騙過去的那一次），
    // 再看它前面那一個非空白字元是什麼。
    let i = m.index!;
    for (;;) {
      while (i > 0 && /[\w$.]/.test(line[i - 1]!)) i--;
      if (i > 0 && line[i - 1] === ")") {
        let depth = 0;
        i--;
        while (i > 0) {
          if (line[i] === ")") depth++;
          else if (line[i] === "(") {
            depth--;
            if (depth === 0) break;
          }
          i--;
        }
        continue;
      }
      break;
    }
    while (i > 0 && /\s/.test(line[i - 1]!)) i--;
    if (i === 0 || !"%+-*/".includes(line[i - 1]!)) return true;
  }
  // `!cfg.foo` —— 「沒有值/是 0」當成一個分支
  return new RegExp(`!\\s*[A-Za-z_$][\\w$]*(?:\\.[\\w$]+)*\\.${key}\\b`).test(line);
}

/**
 * ⭐ 關係②：那一行**談的是同一個東西**。
 *
 * ⛔⛔ 語彙表只認得**葉子的名字**，而 `size` / `damage` / `power` 這種名字
 * 到處都是 —— 2026-09-02 第一版因此把 `icon-style.size` 配到了
 * `n.duration.size === 0`（粒子動畫），把 `round-grade.grade.refs.damage`
 * 配到了 `damage === 0 && heal === 0`（技能分類）。
 * ⭐ 判準：命中的那**一份檔案**，也要提到這一格的**父路徑段**
 * （`impactDebris` · `damageLine` · `arenaFire`…）或這份 config 的駝峰名。
 * ⇒ ⛔ 沒有任何可辨識的主詞時（頂層的單字鍵），**不判** —— 誤報比漏報貴。
 */
function sameSubject(hit: Hit, k: Knob, corpus: Corpus): boolean {
  const vocab = corpus.fileVocab[hit.file];
  return subjectsOf(k, corpus).some((s) => vocab?.has(s));
}

/**
 * ⭐ 一格旋鈕的**可辨識主詞**。
 *
 * ⛔⛔ **一個到處都有的名字不是主詞** —— `displacement-tiers.json` 的
 * `push.極大.distance` 的父段是 `push`，⚠️ 而 `arr.push(…)` 出現在**幾乎每一份檔案**裡
 * ⇒ 「同一份檔也提到 push」對任何一行都成立 ⇒ ⭐ 關係②整條退化成永遠為真。
 * ⇒ 判準：主詞必須**稀有**（出現在 ≤ 2% 的檔案裡）。
 *
 * ⭐ **2% 是量出來的，⛔ 不是挑一個好看的數字**（2026-09-02，母體 13,221 檔）：
 * 真主詞 `worldCues` 0.1% · `mobWaves` 0.2% · `damageLine` 0.4% · `reward` 0.4%
 * · `boss` 0.6%，而 TS 的通用變數名 `line` 是 **12.2%** ——
 * ⭐ 中間有**一個數量級的鴻溝**，2% 落在鴻溝裡（真主詞上限的 3 倍、`line` 的 1/6）。
 * ⚠️ 在此之前這一格是 20%，⛔ 於是 `line` 過關，把 `world-cues.json` 的
 * `line.damageLine.lifeMs` 配到了 `WorldAnchorLayer.tsx` 的
 * `e.lifeMs > 0 ? ageMs / e.lifeMs : 1`（浮動錨層的**另一個** `lifeMs`）——
 * ⭐ 而那個檔連 `damageLine` / `worldCues` 都一次沒提過。
 *   ⛔ 一個都不稀有 ⇒ **不判**（誤報比漏報貴）。
 */
/**
 * ⭐ **⛔ 不可能是 config 主詞的字** —— 它們是**程式語言側**的常見識別字。
 *
 * ⚠️ ⭐ 稀有度攔不住它們，⛔ 因為稀有度問的是「這個字**多普遍**」而不是
 * 「它**是不是這一格的主詞**」。量到的分佈（2026-09-02，母體 13,221 檔）：
 * 真主詞 `worldCues` 0.1% · `mobWaves` 0.2% · `damageLine` 0.4% · `reward` 0.4%
 * · `boss` 0.6%，而 `line` 是 **12.2%** —— ⭐ 中間有一個數量級的鴻溝，
 * ⛔ 但把 cap 從 20% 收到 2% 會連 `mobWaves` / `reward` 一起弄丟
 * （普查器的 spread 母體與離線量測不同）⇒ ⭐ 收 cap 是在誤報與漏報之間換邊，
 * 而黑名單是**零誤傷**的那一條。
 *
 * ⭐ 已發生的誤判：`world-cues.json` 的 `line.damageLine.lifeMs` 被頂層分組名
 * **`line`** 配到 `WorldAnchorLayer.tsx:430` 的 `e.lifeMs > 0 ? ageMs / e.lifeMs : 1`
 * （浮動錨層的**另一個** `lifeMs`）—— 那個檔連 `damageLine` / `worldCues`
 * 都一次沒出現過，而 `line` 在它裡面只是一個迴圈變數。
 *
 * ⚠️ **加字進來要說得出「它在程式側是什麼」** —— ⛔ 「這一列很吵」不是理由。
 */
const GENERIC_SUBJECTS = new Set(["line", "value", "key", "name", "type", "id", "data", "item", "index"]);

function subjectsOf(k: Knob, corpus: Corpus): string[] {
  const cap = Math.max(1, Math.floor(corpus.files * 0.2));
  const spread = (s: string) => corpus.spread.get(s) ?? 0;
  /**
   * ⛔⛔ ⭐ 主詞比對的母體是「這一份檔**真的去讀**的識別字」，
   * ⛔ 不是「檔案裡出現過的任何 token」（那會收進**區域變數名**）——
   * 2026-09-02 `world-cues.json` 的 `line.damageLine.lifeMs` 就是被頂層分組名
   * **`line`** 配到 `WorldAnchorLayer.tsx` 的 `e.lifeMs > 0 ? ageMs / e.lifeMs : 1`
   * （浮動錨層的**另一個** `lifeMs`），而那個檔裡的 `line` 只是一個迴圈變數，
   * `damageLine` / `worldCues` 一次都沒出現過。
   * ⭐ 而稀有度攔不住它：稀有度問「這個字**多普遍**」，
   * ⛔ 問不出「這個檔**是不是在讀這一格**」。
   */
  return [
    ...k.path
      .split(".")
      .slice(0, -1)
      .map((s) => s.replace(/\[\]$/, ""))
      .filter((s) => IDENT.test(s)),
    k.file.replace(/\.json$/, "").replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
  ].filter((s) => !GENERIC_SUBJECTS.has(s) && spread(s) <= cap);
}

/** ⭐ 【B · 上下界夾成一個點】—— 那一格在後台是一個永遠不會動的輸入框。 */
function detectSinglePointRange(knobs: Knob[]): Finding[] {
  return knobs
    .filter((k) => k.type === "number" && k.min !== undefined && k.max !== undefined && k.min === k.max)
    .map((k) => ({
      klass: "B" as const,
      kind: "single-point-range" as const,
      file: k.file,
      path: k.path,
      value: k.min,
      why: `Zod 的上下界相等（\`min(${k.min}).max(${k.max})\`）⇒ 它只收得下一個值。`,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// ④ 組裝
// ─────────────────────────────────────────────────────────────────────────────
export type Census = {
  population: {
    configFiles: number;
    knobs: number;
    corpusFiles: number;
    /** 玩家拿殭屍獎勵時的等級區間（給 `dominated` 用的分母）。 */
    levelWindow: { min: number; max: number };
  };
  counts: Record<string, number>;
  /** ⭐ 只列 A 與 B。**C ＝ 母體減去這一份** —— ⛔ 不落地成第二張表（第〇·四守則）。 */
  findings: Finding[];
  /** 每一份 config 的 A/B 格數（0 的不列）。 */
  perFile: Array<{ file: string; knobs: number; a: number; b: number }>;
};

export type Sources = { configDir: string; corpusRoots: string[]; base: string; knobs: Knob[] };

/** ⭐ 出貨的三個輸入。 */
function shippedSources(): Sources {
  const configDir = join(ROOT, "content/config");
  return {
    configDir,
    corpusRoots: [join(ROOT, "packages"), join(ROOT, "apps"), join(ROOT, "tools"), join(ROOT, "scripts")],
    base: ROOT,
    knobs: shippedKnobs(configDir),
  };
}

/**
 * ⭐⭐ **sentinel 模式** —— 三個輸入**全部**換成夾具，⛔ 而判準程式碼是同一份。
 *
 * ⚠️ 為什麼一定要有這個：CLAUDE.md 逐字「**一把只驗過單邊的尺，不算自證過**」。
 * 一支普查器在出貨資料上「抓到三格」證明得了「它會叫」，
 * ⛔ 證明不了「它在該閉嘴的時候閉嘴」—— ⭐ 而誤報正是會讓這條閘被放寬的東西。
 *
 * 夾具目錄的形狀：`config/*.json` · `src/**`（假的消費端）· `knobs.json`（假的 Zod 面）。
 */
function fixtureSources(dir: string): Sources {
  const knobs = JSON.parse(readFileSync(join(dir, "knobs.json"), "utf8")) as Knob[];
  return { configDir: join(dir, "config"), corpusRoots: [join(dir, "src")], base: dir, knobs };
}

function build(src: Sources): Census {
  const corpus = readCorpus(src.corpusRoots, src.base);
  const findings = [
    ...detectNoReadEnd(src.configDir, src.knobs, corpus),
    ...detectDominated(src.configDir, src.knobs),
    ...detectSchemaLocksEngineZero(src.knobs, corpus),
    ...detectSinglePointRange(src.knobs),
  ].sort((a, b) => a.file.localeCompare(b.file) || a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));

  const counts: Record<string, number> = { A: 0, B: 0 };
  for (const f of findings) {
    counts[f.klass] = (counts[f.klass] ?? 0) + 1;
    counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  }
  /**
   * ⭐ 「零讀端」這把尺量不到的那一族（見 {@link IDENT} 的檔頭）——
   * ⛔ 刻意**不**併進 C：一格「沒被判成 A」與一格「量不到」是兩件事，
   * ⚠️ 而把後者寫成前者，就是 CLAUDE.md 那條「表頭的括號悄悄定義了它量了什麼」。
   */
  counts.notAssessable = src.knobs.filter((k) => !IDENT.test(k.key)).length;
  counts.C = src.knobs.length - findings.length - counts.notAssessable;

  const knobsPerFile = new Map<string, number>();
  for (const k of src.knobs) knobsPerFile.set(k.file, (knobsPerFile.get(k.file) ?? 0) + 1);
  const perFile = [...new Set(findings.map((f) => f.file))].sort().map((file) => ({
    file,
    knobs: knobsPerFile.get(file) ?? 0,
    a: findings.filter((f) => f.file === file && f.klass === "A").length,
    b: findings.filter((f) => f.file === file && f.klass === "B").length,
  }));

  const arena = join(src.configDir, "arena-rules.json");
  const window = existsSync(arena)
    ? levelWindow(JSON.parse(readFileSync(arena, "utf8")) as Record<string, unknown>)
    : { min: 1, max: LEVEL_CAP };

  return {
    population: {
      configFiles: new Set(src.knobs.map((k) => k.file)).size,
      knobs: src.knobs.length,
      corpusFiles: corpus.files,
      levelWindow: window,
    },
    counts,
    findings,
    perFile,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ 產物
// ─────────────────────────────────────────────────────────────────────────────
const KIND_LABEL: Record<Finding["kind"], string> = {
  "no-read-end": "零讀端",
  dominated: "被同軸的另一格蓋掉",
  "schema-locks-engine-zero": "引擎做得到而 schema 不准（0）",
  "single-point-range": "上下界夾成一個點",
};

function markdown(c: Census): string {
  const L: string[] = [];
  L.push("# 🔍 裝飾性設定欄位普查（GH#927）");
  L.push("");
  L.push("> `reward.xp: 40` 實質上是裝飾。因為每 6 隻就清空一次經驗條 **=> 還有類似這種設定嗎**");
  L.push(">");
  L.push("> — owner 2026-09-01（逐字）");
  L.push("");
  L.push("⛔ **這一份是產生的**（`pnpm decor:build`）—— 手改會被 `pnpm decor:check` 判 stale。");
  L.push("⭐ 結論**從出貨設定推導**：owner 把同軸那一格關掉的那一刻，這裡自己就變短，⛔ 不必改任何程式。");
  L.push("");
  L.push("## 母體（⭐ 量出來的）");
  L.push("");
  L.push("| | |");
  L.push("|---|---:|");
  L.push(`| 出貨 config 文件 | ${c.population.configFiles} |`);
  L.push(`| **旋鈕**（Zod 靜態鍵的葉子，⛔ 不含 record 的鍵與陣列索引） | **${c.population.knobs}** |`);
  L.push(`| 消費端原始碼（⛔ 已排除後台欄位表與測試） | ${c.population.corpusFiles} |`);
  L.push(
    `| 殭屍獎勵的等級區間（\`dominated\` 的分母） | L${c.population.levelWindow.min}–L${c.population.levelWindow.max} |`,
  );
  L.push("");
  L.push("## 分類");
  L.push("");
  L.push("| 類 | 意思 | 格數 |");
  L.push("|---|---|---:|");
  L.push(`| **A** | 調了玩家量不到差別 | **${c.counts.A ?? 0}** |`);
  L.push(`| **B** | 引擎做得到而調不到 | **${c.counts.B ?? 0}** |`);
  L.push(`| C | 正常 | ${c.counts.C ?? 0} |`);
  L.push(
    `| ⚠️ 量不到 | 鍵名不是識別字（級距標籤／列舉鍵）—— ⭐ 「零讀端」這把尺對它們**結構上是瞎的** | ${c.counts.notAssessable ?? 0} |`,
  );
  L.push("");
  for (const kind of Object.keys(KIND_LABEL) as Array<Finding["kind"]>) {
    const rows = c.findings.filter((f) => f.kind === kind);
    if (!rows.length) continue;
    L.push(`### ${KIND_LABEL[kind]} · ${rows.length} 格（${rows[0]!.klass} 類）`);
    L.push("");
    L.push("| 檔 | 路徑 | 出貨值 | 量到的 |");
    L.push("|---|---|---|---|");
    for (const r of rows) {
      L.push(`| \`${r.file}\` | \`${r.path}\` | \`${JSON.stringify(r.value)}\` | ${r.why} |`);
    }
    L.push("");
  }
  L.push("## 每一份 config 的 A/B 格數");
  L.push("");
  L.push("| 檔 | 旋鈕 | A | B |");
  L.push("|---|---:|---:|---:|");
  for (const p of c.perFile) L.push(`| \`${p.file}\` | ${p.knobs} | ${p.a} | ${p.b} |`);
  L.push("");
  L.push("---");
  L.push("");
  L.push("⚠️ ⛔ **這份普查刻意不改任何出貨數值** —— 第零守則⑧：排序是 owner 的權力。");
  L.push("⭐ 修法有三條（第一·五守則）：換成做得到的機制 · 把說明改成只講真的會發生的事 · 升級成 owner 的決定。");
  return `${L.join("\n")}\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const fixture = arg("--fixture");
const sources = fixture ? fixtureSources(resolve(fixture)) : shippedSources();
const census = build(sources);

if (argv.includes("--json")) {
  /**
   * ⭐ `--with-knobs` 把**母體本身**（含每一格的 Zod 上下界）一起吐出來。
   *
   * ⚠️ 它**刻意只在 `--json` 模式有**，⛔ 不進產物：那 1,800 列是**中間值**，
   * 收進產物只會讓每一次 schema 微調都變成一次大 diff。
   * ⭐ 它存在的理由是守衛要問「Zod 對這一格的下界是多少」——
   * ⛔ 而守衛**不可以自己 import zod 再抄一份走法**（那是第二個住處，而且它會漂）。
   */
  const withKnobs = argv.includes("--with-knobs");
  process.stdout.write(`${JSON.stringify(withKnobs ? { ...census, knobs: sources.knobs } : census, null, 2)}\n`);
} else {
  const json = `${JSON.stringify(census, null, 2)}\n`;
  const md = markdown(census);
  if (argv.includes("--check")) {
    const read = (p: string) => {
      try {
        return readFileSync(p, "utf8");
      } catch {
        return "";
      }
    };
    const stale = [
      [OUT_JSON, json],
      [OUT_MD, md],
    ].filter(([p, want]) => read(p!) !== want);
    if (stale.length) {
      console.error(
        `⛔ ${stale.map(([p]) => basename(p!)).join(" · ")} 過期了 —— 跑 \`pnpm decor:build\` 然後 git add`,
      );
      process.exit(1);
    }
    console.log(`decor:check OK（${census.population.knobs} 格旋鈕 · A ${census.counts.A} · B ${census.counts.B}）`);
  } else {
    writeFileSync(OUT_JSON, json);
    writeFileSync(OUT_MD, md);
    console.log(`✅ ${OUT_JSON}`);
    console.log(`✅ ${OUT_MD}`);
    console.log(
      `   旋鈕 ${census.population.knobs} · A ${census.counts.A} · B ${census.counts.B} · C ${census.counts.C}`,
    );
  }
}

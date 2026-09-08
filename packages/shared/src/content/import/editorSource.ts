/**
 * ⭐⭐ **產生器來源轉接器**（P0-1）—— 讓編輯器改得到「產物背後那份來源」。
 *
 * ── ⛔ 為什麼不能讓編輯器直接寫產物 ────────────────────────────────────────
 * `content/abilities/` 底下 **421 份裡有 90 份是 `skillremake:json` 的產物**
 * （來源是 `tools/skill-remake/heroes/<heroId>.py`）。
 * ⇒ ⭐ 直接改那 90 份 **下一次 `pnpm skills:sync` 就被打回來** ——
 * ⚠️ 而那個「又變回去了」看起來像**新的**錯，⛔ 不像「我改錯地方了」。
 * CLAUDE.md 逐字記著這個坑發生過**數十次**。
 *
 * ── ⭐ 三種擁有權（從**量出來的**戶籍表推導，⛔ 不是一張手寫名單）──────────
 * | 值 | 意思 | 編輯器能做什麼 |
 * |---|---|---|
 * | `generator-owned` | 有產生器**產生**它 | ⛔ 不可直接寫產物；⭐ 走 source adapter 改來源 |
 * | `normalizer-only` | 只有**正規化器**就地改幾個欄位（⛔ 它不是作者） | ⭐ 可直接寫產物 |
 * | `hand-authored`   | 沒有任何產生器碰它 | ⭐ 可直接寫產物 |
 *
 * ⚠️ ⭐ `normalizer-only` 這一格是必要的：`sync-io.json` 用 **glob** 認領
 * （`content/abilities/*.json`），而 `skillremake:provenance` 只寫 `provenance` 一格、
 * `castderive:build:raw` 只寫 `castTimeSec` ——⛔ 把它們算成「作者」會讓 331 份
 * 手編檔變成不可寫，⭐ 而那正是 2026-08-27 一天內擋掉三條 lane 的那個死路。
 *
 * ── ⭐ 寫入契約：CAS on the **source**，⛔ 不是 on the product ────────────────
 * `expectedSourceSha256` 對的是**來源檔**的位元組。改完跑**唯一**的重生成指令，
 * 再驗「產物真的變了」。⇒ 中途有人動過來源 ⇒ 409，⛔ 不是覆蓋。
 */
import { createHash } from "node:crypto";

export const EDITOR_SOURCE_SCHEMA = "ggd-editor-source@1" as const;

export type SourceOwnership =
  "hand-authored" | "generator-owned" | "normalizer-only";

/** 編輯器**這一份**可以怎麼寫（規格 §2）。 */
export type WritePolicy = "document" | "source-adapter" | "readonly";

/** 戶籍表裡這一支需要的那一小片（`tools/parallel-gates/sync-io.json`）。 */
export interface SyncIoFacts {
  readonly steps: readonly {
    readonly name: string;
    readonly writes?: readonly string[];
  }[];
}

/** `normalizers.json` 裡被明確歸類成「就地改欄位」的那些 step。 */
export interface NormalizerFacts {
  readonly normalizers: readonly {
    readonly step: string;
    /**
     * ⭐ 這一支**只在自己 `writes` 之外**才是正規化器 —— 在裡面它是**作者**。
     *
     * ⚠️ ⭐ 為什麼需要這一格（2026-09-02 量到）：`skillremake:json` 內部呼叫
     * `deriveCastTimes` ⇒ 它會在**自己沒有產生**的手編檔上改一格 `castTimeSec`
     * ⇒ 執行期對帳要求它登記成正規化器。⛔ 而一旦登記，`ownershipOf` 就把
     * **421 份技能全部**判成 `normalizer-only` ⇒ ⭐ 編輯器會直接寫那 91 份產物，
     * 而下一次 sync 打回來 —— ⛔ 正是這整套要防的那件事。
     */
    readonly onlyOutsideOwnWrites?: boolean;
    /**
     * ⭐ **路徑範圍**（選填）——「⛔ **只有**這些路徑算正規化器，其餘照樣是作者」。
     *
     * ⚠️ 分類是**逐檔**的，⛔ 不是逐步驟：`apconv:build` 就地改
     * `content/abilities/*.json`（正規化器），而 `docs/_data/ap-conversion-applied.json`
     * 是它自己整份 emit 的清單（**作者**）。
     *
     * ⚠️⚠️ 2026-09-07（GH#1099 量到）：這一格在此之前**這一支讀不到** ——
     * 於是 `ownershipOf` 對 `docs/_data/ap-conversion-applied.json` 與
     * `docs/_release/ggd-board.html` 兩份**真產物**回 `normalizer-only`＝「編輯器可以
     * 直接寫」。⛔ 那是 `onlyOutsideOwnWrites` 那個洞的**第二個實例**（同一個病、
     * 另一格設定），⭐ 而它是被「四個執行點逐檔比對」那條閘找到的，⛔ 不是被看出來的。
     */
    readonly only?: readonly string[];
  }[];
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** fnmatch 的一小片：只支援 `*`（⛔ 不跨 `/`）—— 戶籍表裡只有這一種。 */
function globMatches(glob: string, path: string): boolean {
  if (!glob.includes("*")) return glob === path;
  const re = new RegExp(
    `^${glob
      .split("*")
      .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^/]*")}$`,
  );
  return re.test(path);
}

/** 哪幾支 step 寫這條路徑（含 glob）。 */
export function writersOf(path: string, io: SyncIoFacts): string[] {
  const out = new Set<string>();
  for (const s of io.steps)
    for (const w of s.writes ?? []) if (globMatches(w, path)) out.add(s.name);
  return [...out].sort();
}

/**
 * ⭐ 這條路徑的擁有權。
 *
 * ⚠️ 判準是「**有沒有一支非正規化器的 step 寫它**」——
 * ⛔ 不是「它在不在 `content/` 底下」（那個目錄是混的，肉眼分不出來）。
 */
export function ownershipOf(
  path: string,
  io: SyncIoFacts,
  norms: NormalizerFacts,
): { ownership: SourceOwnership; writers: string[]; authors: string[] } {
  const writers = writersOf(path, io);
  // ⭐ 這一段與 `tools/parallel-gates/normalizer_rules.py::normalizes()` 是**同一條規則**
  //   （⛔ 這裡叫不到 python：這一支跑在 content-api 的行程裡）⇒ 兩者一致由
  //   `packages/shared/src/ops/normalizerRuleAgreesAcrossEntrypoints.test.ts` **逐檔**比對。
  const byStep = new Map<string, { onlyOutsideOwnWrites?: boolean; only?: readonly string[] }>();
  for (const n of norms.normalizers) {
    if (!byStep.has(n.step)) byStep.set(n.step, n);
    // ⭐ `:raw` 後綴同時登記去掉後綴的名字（`ownership.go` 也這樣做）。
    if (n.step.endsWith(":raw") && !byStep.has(n.step.slice(0, -":raw".length)))
      byStep.set(n.step.slice(0, -":raw".length), n);
  }
  const normalizes = (step: string): boolean => {
    const n = byStep.get(step);
    if (!n) return false;
    // ⭐ 「只在自己 writes 之外才是正規化器」⇒ ⛔ 在裡面就是**作者**。
    //   ⚠️ 因為 `writersOf()` **已經**只回傳「writes 匹配到這條路徑」的 step
    //   ⇒ 它出現在這裡就代表**這條路徑在它的 writes 裡**。
    if (n.onlyOutsideOwnWrites === true) return false;
    // ⭐ `only` ＝ 路徑範圍（逐檔，⛔ 不是逐步驟）。比不中 ⇒ 它對這條路徑是作者。
    if (n.only) return n.only.some((g) => globMatches(g, path));
    return true;
  };
  const authors = writers.filter((w) => !normalizes(w));
  if (authors.length > 0)
    return { ownership: "generator-owned", writers, authors };
  if (writers.length > 0)
    return { ownership: "normalizer-only", writers, authors };
  return { ownership: "hand-authored", writers, authors };
}

/**
 * ⭐ 產物 → 來源檔的對照。
 *
 * ⚠️ ⭐ 這是**唯一**一處需要知道「哪一支產生器的來源長什麼樣」的地方，
 * 而它刻意寫成一張**帶理由**的小表 —— ⛔ 不是散在各處的字串拼接。
 * ⭐ 每一列都要說得出「來源路徑怎麼從產物 id 算出來」，
 * 而 `sourceExists` 由呼叫端驗（這一支不碰檔案系統：可測性 ＋ 決定性）。
 */
export interface SourceAdapter {
  /** ⭐ 對外的穩定 id —— 對面引用**這個**，⛔ 不是 `regenerate` 那個字串。 */
  readonly adapterId: string;
  readonly step: string;
  /** 產物路徑 → 來源檔路徑（算不出來 ⇒ null）。 */
  readonly sourceFor: (productPath: string) => string | null;
  /** ⭐ **唯一**的重生成指令。⛔ 不是一串步驟。 */
  readonly regenerate: string;
  /** Trusted source archive inputs; content/config/templates live in the
   * accompanying catalog snapshot. This does not authorize source execution. */
  readonly archive: { readonly pythonDirectories: readonly string[]; readonly files: readonly string[] };
  readonly why: string;
}

/**
 * ⭐⭐ **`adapterId` 是對外的**穩定名字**，⛔ `regenerate` 不是。**
 *
 * ── ⛔ 交接文件逐字 ─────────────────────────────────────────────────────
 * 「`regenerateCommand` **只能當人類說明／audit metadata**。Client 不得回傳或
 *   要求 server 執行任意 shell string；真正執行的是 Main 註冊的 `adapterId`。
 *   ⭐ 否則 source adapter 會變成**遠端命令入口**。」
 *
 * ⇒ ⭐ 對面引用的是 `adapterId`；`regenerate` 那個字串只給人看與寫稽核。
 * ⚠️ 出貨的實作**本來就**是 server 端選 adapter（`adapterFor()`），
 * ⛔ 但那個性質在 2026-09-02 之前**只有一行註解在守** ——
 * ⭐ 現在有一條測試證明「請求裡的任何字串都到不了 `execFileSync`」。
 */
export const SOURCE_ADAPTERS: readonly SourceAdapter[] = Object.freeze([
  {
    adapterId: "skillremake-hero-py.ability@1",
    step: "skillremake:json",
    sourceFor: (p) => {
      const m = /^content\/abilities\/([a-z0-9-]+)\.[a-z0-9]+\.json$/.exec(p);
      return m ? `tools/skill-remake/heroes/${m[1]!}.py` : null;
    },
    regenerate: "bash scripts/genrun.sh skillremake:json",
    archive: { pythonDirectories: ["tools/skill-remake"], files: ["skill-tag-manifest.json"] },
    why:
      "⭐ 90 份技能 JSON 由 `tools/skill-remake/heroes/<英雄 id>.py` 產生 —— " +
      "產物 id 的第一段**就是**英雄 id（`godie-e00s.r` → `godie-e00s.py`）。",
  },
  {
    adapterId: "skillremake-hero-py.champion@1",
    step: "skillremake:json",
    sourceFor: (p) => {
      const m = /^content\/champions\/([a-z0-9-]+)\.json$/.exec(p);
      return m ? `tools/skill-remake/heroes/${m[1]!}.py` : null;
    },
    regenerate: "bash scripts/genrun.sh skillremake:json",
    archive: { pythonDirectories: ["tools/skill-remake"], files: ["skill-tag-manifest.json"] },
    why: "⭐ 英雄卡內嵌的技能鏡像與技能 JSON **同一份來源**（同編號＝同一支技能）。",
  },
]);

/** 找得到轉接器就回它，⛔ 找不到回 null（⇒ 那一份今天改不了，而回應要說出來）。 */
export function adapterFor(
  productPath: string,
  authors: readonly string[],
): SourceAdapter | null {
  for (const a of SOURCE_ADAPTERS) {
    if (!authors.includes(a.step)) continue;
    if (a.sourceFor(productPath) !== null) return a;
  }
  return null;
}

/**
 * ⭐⭐ **下游正規化器擁有的欄位** —— 走來源改它們，值**不會**原樣存活。
 *
 * ⚠️ ⭐ 這一格是量出來才寫下的（2026-09-02）：把來源的 `cooldown` 從 `[90,90,90]`
 * 改成 `[77,77,77]`、跑完重生成 ⇒ 回來仍是 **90**。
 * ⛔ 那**不是**接縫壞掉 —— `tierize()` 是「值 → 級別 → 值」，而 77 與 90 落在
 * **同一個級距**（大）⇒ 兩者都解析回 90。⭐ 那正是第〇·四守則要的行為
 * （「值在載入時從共用表解析，⛔ 不烘進每一份文件」）。
 *
 * ⚠️ ⭐ 但**編輯器不知道這件事**：它寫 77、拿回 90、會判定接縫壞了並開一張假票。
 * ⇒ 所以回應要**明說**這幾格由誰擁有 —— 這是契約，⛔ 不是註解。
 *
 * ⚠️ 這份清單**不可以是手抄的**：閘 `editorSource.test.ts` ⑤ 逐字讀
 * `tools/skill-remake/tierize.py` 的 `doc["…"] =` 寫入端再比對。
 * 那支 python 多寫一個欄位而這裡沒跟上 ⇒ 🔴。
 */
export const NORMALIZER_OWNED_FIELDS: readonly string[] = Object.freeze([
  "cooldown",
  "cooldownTier",
  "description",
  "manaCost",
  "manaCostTier",
  "range",
  "rangeTier",
]);

/**
 * ⭐ 這份**來源**還會產生哪些文件（改它的 blast radius）。
 *
 * ⚠️ 編輯器必須知道：改 `heroes/godie-e00s.py` 一次會重生成**六支技能 ＋ 一張英雄卡**，
 * ⛔ 不是只有它點開的那一份。⭐ 而這份清單是從戶籍表**推導**的，⛔ 不是手寫。
 */
export function membersOf(
  sourcePath: string,
  adapter: SourceAdapter,
  io: SyncIoFacts,
): string[] {
  const step = io.steps.find((s) => s.name === adapter.step);
  // ⚠️ ⭐ 要問**這一支 step 的每一條轉接器** —— `skillremake:json` 有兩條
  //   （`content/abilities/*` 一條、`content/champions/*` 一條）。
  //   ⛔ 只問呼叫端手上那一條，英雄卡就永遠不會出現在 blast radius 裡，
  //   而編輯器會以為改來源不動英雄卡（⇒ 一份會靜靜漂掉的鏡像）。
  const sibling = SOURCE_ADAPTERS.filter((x) => x.step === adapter.step);
  const out = new Set<string>();
  for (const w of step?.writes ?? []) {
    if (w.includes("*")) continue; // ⛔ glob 展不開就不猜（⇒ 少報，不誤報）
    if (sibling.some((x) => x.sourceFor(w) === sourcePath)) out.add(w);
  }
  return [...out].sort();
}

/** ⭐ 這一份**怎麼寫**（規格 §2 的 `writePolicy`）。 */
export function writePolicyFor(
  ownership: SourceOwnership,
  hasAdapter: boolean,
): WritePolicy {
  if (ownership !== "generator-owned") return "document";
  return hasAdapter ? "source-adapter" : "readonly";
}

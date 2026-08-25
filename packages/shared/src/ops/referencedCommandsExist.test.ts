/**
 * referencedCommandsExist.test.ts
 * —— ⭐ **guidance 裡引用的指令必須真的存在。**
 *
 * 背景（誤導源稽核 `docs/_reports/product-edit-misinfo_20260825.md` 的續集）：
 * `prose:apply` 這個名字在 `scripts/genguard.sh` 與 `scripts/preserve-before-overwrite.py`
 * 裡躺了很久 —— package.json 沒有這個 script（真名 `prose:build` / `prose:check`），
 * sync-io 也沒有這個步驟 —— 而**沒有任何東西紅**。一句指著不存在的指令的 guidance
 * 比不說更糟：照著跑會得到「command not found」，或（更糟）一個集合比對永遠不命中，
 * 於是那條規則**看起來在跑其實從來沒生效**。owner 的常設方向是「盡量變成自動化 script」
 * （經主 session 轉述，2026-08-25）—— 所以這一條把「引用要指得到東西」變成會紅的閘。
 *
 * ── 掃什麼（手寫 guidance 檔，⛔ 不掃程式邏輯本身）────────────────────────────
 *   · `scripts/*.sh` · `scripts/*.py`（頂層；`__pycache__` 之類的目錄不進母體）
 *   · `CLAUDE.md`
 *   · `tools/parallel-gates/*.json`（當純文字掃 —— 字串值裡的引用一樣會過期）
 *
 * ── 抽哪四種引用 ─────────────────────────────────────────────────────────────
 *   (a) `pnpm <name>`，name 含冒號（步驟名）        → 必須 ∈ package.json `scripts`
 *   (b) `scripts/<f>.sh` / `scripts/<f>.py` 路徑    → 檔案必須存在
 *   (c) `python3 tools/<path>.py`                   → 檔案必須存在
 *   (d) 引號整包起來的步驟形 token（'prose:apply'） → 必須 ∈ package.json `scripts`
 *       ⭐ (d) 是這條閘的**創始案例**：兩個已知的 `prose:apply` 都是集合成員，
 *       ⛔ 不帶 `pnpm` 前綴 —— 只做 (a) 會漏掉催生這條閘的那個幽靈。
 *
 * ── 判準：⭐ 寧可漏報也不要誤報（同 guardMessagesNameTheGenerator）──────────────
 *   · 佔位／示例直接跳過：引用裡有 `<…>`、`$VAR`、`${…}`、`*` 的不算
 *     （例：CLAUDE.md 的「bash scripts/genrun.sh <step>」是刻意的通用寫法）。
 *   · `node:fs` 這族 **Node builtin specifier** 是另一個命名空間，⛔ 不是步驟名 —— 結構性排除。
 *   · (b) 只認以 `scripts/` 開頭、前面不是路徑字元的引用 —— `docs/legacy/scripts/x.sh` 不算。
 *   · 真的要豁免的字面名寫進 `referencedCommandsExist.exemptions.json`，**每列帶理由**，
 *     ⛔ 不是把抽取正則寫鬆到什麼都比不中（一條被放寬的閘等於沒有閘）。
 *   · ⭐ 豁免表是**棘輪**：一列必須還罩得住至少一個活的幽靈，修好了就要刪列。
 *
 * ── GUARD-THE-GUARD ──────────────────────────────────────────────────────────
 *   掃到 0 個引用對任何內容都是綠的 ⇒ 先斷言母體大小與哨兵：
 *   ① 語料檔數／各類引用數有下限（2026-08-25 實測 24 檔 · pnpm 44 · path 20 · bare 45）
 *   ② 抽取器餵一段自造的、已知有四種幽靈的文字，四種都要抓得到、佔位都要跳得過
 *     （量尺先自證 —— 同 visual-proof 的 calibrate()）。
 *
 * 突變紀錄（一條，最承重）：把 CLAUDE.md 裡 `pnpm echoloop:check` 改成
 * `pnpm echoloop:checkk` → 「(a)」那條紅並指名 CLAUDE.md 的行號。改回來。
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const EXEMPT_JSON = "packages/shared/src/ops/referencedCommandsExist.exemptions.json";

type Exemption = { ref: string; files?: string[]; reason: string };
const EXEMPTIONS = (JSON.parse(readFileSync(join(REPO, EXEMPT_JSON), "utf8")) as { exemptions: Exemption[] })
  .exemptions;

const PKG_SCRIPTS = new Set(
  Object.keys((JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts),
);

// ── 語料 ────────────────────────────────────────────────────────────────────
function corpus(): string[] {
  const files: string[] = [];
  for (const e of readdirSync(join(REPO, "scripts"), { withFileTypes: true })) {
    if (e.isFile() && (e.name.endsWith(".sh") || e.name.endsWith(".py"))) files.push(`scripts/${e.name}`);
  }
  files.push("CLAUDE.md");
  for (const e of readdirSync(join(REPO, "tools/parallel-gates"), { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(".json")) files.push(`tools/parallel-gates/${e.name}`);
  }
  return files.sort();
}

// ── 抽取 ────────────────────────────────────────────────────────────────────
// (a) pnpm 步驟名（含冒號才算 —— `pnpm typecheck` 這種單字 script 誤報面太大，不收）
const PNPM_RE = /pnpm\s+(?:-s\s+|run\s+)?([a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+)/g;
// (b) scripts/ 底下的 .sh/.py —— 前一個字元不可以是路徑字元（docs/legacy/scripts/… 不算）
const SH_RE = /(?:^|[^\w/.-])(scripts\/[A-Za-z0-9._-]+\.(?:sh|py))/g;
// (c) python3 tools/….py
const PY_RE = /python3?\s+(tools\/[A-Za-z0-9._/-]+\.py)/g;
// (d) 引號整包的步驟形 token —— 兩側都要是引號，段與段之間全是 [a-z0-9-]（數字開頭的段不算，
//     所以 '12:30'、'width:100' 這種比不中；`node:*` 是 builtin specifier，結構性排除）
const BARE_RE = /['"`]([a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+)['"`]/g;

const isPlaceholder = (s: string): boolean => /[<>*]|\$\{|\$[A-Za-z]/.test(s);

type Kind = "pnpm" | "path" | "bare";
type Refs = Map<string, string[]>; // ref → ["file:line", …]

function extract(text: string, fileLabel: string, acc: Record<Kind, Refs>): void {
  const rec = (m: Refs, ref: string, where: string): void => {
    const cur = m.get(ref);
    if (cur) cur.push(where);
    else m.set(ref, [where]);
  };
  text.split("\n").forEach((line, i) => {
    const where = `${fileLabel}:${i + 1}`;
    for (const m of line.matchAll(PNPM_RE)) if (!isPlaceholder(m[1]!)) rec(acc.pnpm, m[1]!, where);
    for (const m of line.matchAll(SH_RE)) if (!isPlaceholder(m[1]!)) rec(acc.path, m[1]!, where);
    for (const m of line.matchAll(PY_RE)) if (!isPlaceholder(m[1]!)) rec(acc.path, m[1]!, where);
    for (const m of line.matchAll(BARE_RE)) {
      if (!isPlaceholder(m[1]!) && !m[1]!.startsWith("node:")) rec(acc.bare, m[1]!, where);
    }
  });
}

const FILES = corpus();
const HITS: Record<Kind, Refs> = { pnpm: new Map(), path: new Map(), bare: new Map() };
for (const f of FILES) extract(readFileSync(join(REPO, f), "utf8"), f, HITS);

// ── 判定 ────────────────────────────────────────────────────────────────────
const isGhost: Record<Kind, (ref: string) => boolean> = {
  pnpm: (ref) => !PKG_SCRIPTS.has(ref),
  path: (ref) => !existsSync(join(REPO, ref)),
  bare: (ref) => !PKG_SCRIPTS.has(ref),
};

/** 一筆豁免罩不罩得住這個 (ref, file)？`files` 省略＝全語料。 */
const exempted = (ref: string, file: string): Exemption | undefined =>
  EXEMPTIONS.find((row) => row.ref === ref && (!row.files || row.files.includes(file)));

type Verdict = { violations: string[]; usedRows: Set<Exemption> };
function judge(kind: Kind): Verdict {
  const violations: string[] = [];
  const usedRows = new Set<Exemption>();
  for (const [ref, where] of [...HITS[kind]].sort()) {
    if (!isGhost[kind](ref)) continue;
    for (const w of where) {
      const file = w.slice(0, w.lastIndexOf(":"));
      const row = exempted(ref, file);
      if (row) usedRows.add(row);
      else violations.push(`${w} 引用 \`${ref}\``);
    }
  }
  return { violations, usedRows };
}

const PNPM_V = judge("pnpm");
const PATH_V = judge("path");
const BARE_V = judge("bare");

const HOWTO =
  `\n⭐ 修法（照順序試）：\n` +
  `   ① 多半是錯字或改了名 —— 把**引用它的那一行**改成真名（package.json scripts 是唯一住處）。\n` +
  `   ② 引用住在產物裡（例：tools/parallel-gates/sync-io.json 是 merge-io 量出來的）\n` +
  `      ⇒ 改**產生器來源**再重生成；先 bash scripts/genguard.sh <路徑> 問那份是誰的。\n` +
  `   ③ 真的要留這個字面名（歷史紀錄、對外文案）⇒ ${EXEMPT_JSON} 加一列**帶理由**。\n` +
  `   ⛔ 不要把這裡的抽取正則改鬆 —— 一條被放寬的閘等於沒有閘。`;

describe("guidance 引用的指令必須存在（referencedCommandsExist）", () => {
  it("GUARD-THE-GUARD①：語料與抽取器真的看得到東西（掃到 0 個對任何內容都是綠的）", () => {
    expect(FILES.length, "語料檔太少 —— scripts/ 或 tools/parallel-gates/ 的走訪壞了").toBeGreaterThanOrEqual(15);
    expect(HITS.pnpm.size, "抽到的 pnpm 步驟引用太少 —— PNPM_RE 壞了").toBeGreaterThanOrEqual(30);
    expect(HITS.path.size, "抽到的 scripts/tools 路徑引用太少 —— SH_RE/PY_RE 壞了").toBeGreaterThanOrEqual(12);
    expect(HITS.bare.size, "抽到的引號步驟 token 太少 —— BARE_RE 壞了").toBeGreaterThanOrEqual(30);
    // 兩個一定在的哨兵（CLAUDE.md 第〇·五守則那兩行）
    expect(HITS.pnpm.has("skills:sync"), "CLAUDE.md 的 `pnpm skills:sync` 沒被抽到 —— 抽取器壞了").toBe(true);
    expect(HITS.path.has("scripts/genguard.sh"), "`bash scripts/genguard.sh` 沒被抽到 —— 抽取器壞了").toBe(true);
  });

  it("GUARD-THE-GUARD②：自造的幽靈四種都抓得到、佔位都跳得過（量尺先自證）", () => {
    const fixture = [
      "跑 `pnpm ghost:step` 然後 bash scripts/no-such-file.sh",
      "python3 tools/nowhere/gen.py 與集合成員 'phantom:name'",
      "佔位不算：bash scripts/genrun.sh <step,例 shapes:build> 與 scripts/<f>.py 與 pnpm <name> 與 require('node:fs')",
    ].join("\n");
    const acc: Record<Kind, Refs> = { pnpm: new Map(), path: new Map(), bare: new Map() };
    extract(fixture, "fixture", acc);
    expect([...acc.pnpm.keys()], "自造的 pnpm 幽靈沒被抓到").toContain("ghost:step");
    expect([...acc.path.keys()], "自造的 .sh 幽靈沒被抓到").toContain("scripts/no-such-file.sh");
    expect([...acc.path.keys()], "自造的 python3 tools 幽靈沒被抓到").toContain("tools/nowhere/gen.py");
    expect([...acc.bare.keys()], "自造的引號步驟幽靈沒被抓到（＝創始案例 prose:apply 的形狀）").toContain("phantom:name");
    const all = [...acc.pnpm.keys(), ...acc.path.keys(), ...acc.bare.keys()];
    expect(all.filter((r) => r.includes("<")), "佔位（<…>）被抽成了引用 —— 誤報面打開了").toEqual([]);
    expect(all, "node: builtin specifier 被抽成了步驟名").not.toContain("node:fs");
  });

  it("(a) `pnpm <步驟名>` 必須 ∈ package.json scripts", () => {
    expect(
      PNPM_V.violations.join("\n"),
      `⛔ ${PNPM_V.violations.length} 處 guidance 叫人跑一個 package.json 裡不存在的 pnpm script。\n` +
        `照著跑＝「command not found」，或更糟：那句規則從來沒生效過而零紅燈。` +
        HOWTO,
    ).toBe("");
  });

  it("(b)(c) 引用的 scripts/*.{sh,py} 與 python3 tools/*.py 檔案必須存在", () => {
    expect(
      PATH_V.violations.join("\n"),
      `⛔ ${PATH_V.violations.length} 處 guidance 指向一個不存在的檔案。\n` +
        `指令搬家或改名時，引用它的每一句話都要跟著動（grep 一遍，同 bountyGold 文案的教訓）。` +
        HOWTO,
    ).toBe("");
  });

  it("(d) 引號整包的步驟形 token 必須 ∈ package.json scripts（創始案例：prose:apply）", () => {
    expect(
      BARE_V.violations.join("\n"),
      `⛔ ${BARE_V.violations.length} 個步驟名字面值在 package.json 裡不存在（真名多半是 *:build / *:check）。\n` +
        `這種幽靈最毒：它常是集合比對的一員 —— 永遠不命中、看起來卻像在守。` +
        HOWTO,
    ).toBe("");
  });

  it("⭐ 棘輪：豁免表每一列都要有理由、而且還罩得住一個活的幽靈（修好就刪列）", () => {
    const used = new Set<Exemption>([...PNPM_V.usedRows, ...PATH_V.usedRows, ...BARE_V.usedRows]);
    const stale: string[] = [];
    for (const row of EXEMPTIONS) {
      if (typeof row.reason !== "string" || row.reason.trim() === "")
        stale.push(`「${row.ref}」—— 沒有理由。一個不能被反駁的豁免不是豁免，是把閘關掉`);
      else if (!used.has(row)) stale.push(`「${row.ref}」—— 已經沒有罩到任何活的幽靈（修好了或引用沒了）⇒ 刪掉這一列`);
    }
    expect(stale.join("\n"), `⛔ ${EXEMPT_JSON} 是棘輪：只准變短，⛔ 不准留殭屍列。`).toBe("");
  });
});

/**
 * ⭐⭐ `authoringProcessor` 的守衛（規格 §1）。
 *
 * ── ⛔ 這條要防的是「**一個手寫版本字串**」──────────────────────────────────
 * `fingerprint` 的唯一用途是讓對面知道「我上次驗過的那套規則還是不是這一套」。
 * ⚠️ 一個 `"runtime-direct@1.0.3"` 會在 schema 改了而版本沒 bump 時
 * **靜靜地繼續說「一樣」** —— 那正是本 repo 記過 N 次的「散文守著一個數字」。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `processorFingerprint` 改成回傳常數 `"runtime-direct@1"` → 🔴（②：改了位元組指紋沒動）
 *   · `buildProcessorReceipt` 的 `throw` 換成 `return null` 跳過 → 🔴（③：缺檔沒被抓到）
 */
import { describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  cpSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  AUTHORING_PROCESSOR_CONTRACT_VERSION,
  AUTHORING_PROCESSOR_KIND,
  PROCESSOR_SURFACES,
  buildAuthoringProcessor,
  buildProcessorReceipt,
  processorFingerprint,
  sourceClosure,
} from "./authoringProcessor";

const REPO = resolve(__dirname, "../../../../..");

/** ⭐ 把七個面的檔案複製到一棵臨時樹 ⇒ 可以**真的改壞它**再量。 */
function mirror(): string {
  const dir = mkdtempSync(join(tmpdir(), "ggd-proc-"));
  for (const s of buildProcessorReceipt(REPO).surfaces) {
    for (const { path: p } of s.files) {
      const dst = join(dir, p);
      mkdirSync(dirname(dst), { recursive: true });
      cpSync(resolve(REPO, p), dst);
    }
  }
  return dir;
}

describe("authoringProcessor（規格 §1 runtime-direct）", () => {
  it("collects real imports behind glob comments, aliases and dynamic imports without reading fake imports in text", () => {
    const root = mkdtempSync(join(tmpdir(), "ggd-source-parser-"));
    try {
      mkdirSync(join(root, "packages/shared/src"), { recursive: true });
      writeFileSync(join(root, "entry.ts"), [
        '// sim/** is a glob in a line comment, not the start of a block comment.',
        'import { value } from "./live";',
        '/** A later real block comment. */',
        'const prose = `from "./missing-in-string"`;',
        '// import "./missing-in-comment";',
        'export { root } from "@ggd/shared";',
        'export { aliased } from "@ggd/shared/alias";',
        'const load = () => import("./dynamic");',
      ].join('\n'));
      for (const name of ["live", "dynamic", "packages/shared/src/index", "packages/shared/src/alias"]) writeFileSync(join(root, `${name}.ts`), "export const value = 1;");
      expect(sourceClosure(root, ["entry.ts"])).toEqual(["dynamic.ts", "entry.ts", "live.ts", "packages/shared/src/alias.ts", "packages/shared/src/index.ts"]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("① ⭐ 宣告的三格逐字就是規格要的值（⛔ 不是「看起來像」）", () => {
    const d = buildAuthoringProcessor(REPO);
    expect(d.kind).toBe(AUTHORING_PROCESSOR_KIND);
    expect(d.kind).toBe("runtime-direct");
    expect(d.contractVersion).toBe(AUTHORING_PROCESSOR_CONTRACT_VERSION);
    expect(d.contractVersion).toBe("runtime-direct@1");
    expect(d.fingerprint).toMatch(/^[0-9a-f]{12}$/);
    // ⭐ 決定性：同一棵樹算兩次要一樣（⛔ 不可以吃時鐘／亂數）。
    expect(buildAuthoringProcessor(REPO).fingerprint).toBe(d.fingerprint);
  });

  it("★★ ② ⭐ **任何一個面**動一個位元組 ⇒ 指紋要跟著動", () => {
    const dir = mirror();
    const base = processorFingerprint(buildProcessorReceipt(dir));
    expect(base).toBe(buildAuthoringProcessor(REPO).fingerprint);

    const moved: string[] = [];
    for (const s of PROCESSOR_SURFACES) {
      const victim = join(dir, s.paths[0]!);
      const before = readFileSync(victim, "utf8");
      writeFileSync(victim, before + "\n// mutation\n", "utf8");
      const after = processorFingerprint(buildProcessorReceipt(dir));
      writeFileSync(victim, before, "utf8");
      if (after !== base) moved.push(s.surface);
    }
    expect(
      moved.sort(),
      "⛔⛔ 有一個面改了位元組而指紋**沒動** ⇒ ⭐ 對面會以為規則沒變，\n" +
        "   而它下一包會用一套已經過期的理解去產內容。",
    ).toEqual(PROCESSOR_SURFACES.map((s) => s.surface).sort());
  });

  it("★★ ③ ⭐ 表上有而磁碟上沒有 ⇒ **擲例外**（⛔ 不是靜靜跳過）", () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-proc-empty-"));
    expect(
      () => buildProcessorReceipt(dir),
      "⛔ 跳過缺檔會產出一個**穩定但涵蓋不到東西**的指紋 —— ⭐ 讀起來跟真的一模一樣",
    ).toThrow(/不存在的檔/);
  });

  it("④ runtime-direct 與完整英雄各自的實作面都納入指紋", () => {
    expect(PROCESSOR_SURFACES.map((s) => s.surface)).toEqual([
      "hero-project-compiler",
      "ability-item-zod-schemas",
      "exact-ref-collector",
      "capability-applicability",
      "authoring-rules",
      "runtime-loader",
      "derived-rebuild-rules",
      "golden-vectors",
    ]);
    // ⭐ 每一面都要說得出**為什麼是這幾個檔** —— ⛔ 一個能被反駁的理由。
    for (const s of PROCESSOR_SURFACES) {
      expect(
        s.paths.length,
        `⛔ ${s.surface} 一個檔都沒有 ⇒ 它對指紋沒有貢獻`,
      ).toBeGreaterThan(0);
      expect(s.why.length, `⛔ ${s.surface} 沒有理由`).toBeGreaterThan(30);
    }
  });
});

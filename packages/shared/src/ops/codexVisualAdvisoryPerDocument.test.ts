/**
 * ⭐ GH#986 —— 跑**出貨的那一支產生器**（複製進 tmp 樹，⛔ 不重寫它的邏輯＝失敗形態⑤），
 * 問三件 2026-09-07 之前都答錯的事：① 一份證據變了只作廢那一份（票文 AC 第 2 條）· ② 分母是推導的
 * （驗收包 46→47 不會讓它在乾淨 checkout 上失敗＝形態⑨）· ③ 積木名從 `ggd-bricks.json` 推導。
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../../..");
const SCRIPT = "tools/skill-forge/build-codex-visual-advisory.mjs";
const OUT = "docs/_reports/editor-skill-codex-advisory/review.json";
const DOCS = {
  source: "tools/skill-forge/codex-visual-advisory.source.json",
  packet: "docs/_reports/editor-skill-human-review/index.json",
  manifest: "docs/_reports/editor-skill-basic-visual-proof/manifest.json",
  acceptance: "docs/_reports/editor-skill-acceptance-42x46.json",
  bricks: "docs/editor-contract/ggd-bricks.json",
} as const;
type Docs = Record<keyof typeof DOCS, any>;

/** 把出貨的產生器 ＋ 它的五份輸入複製進 tmp 樹，套用 `edit` 之後真的跑它。 */
function run(edit: (docs: Docs) => void = () => {}): any {
  const dir = mkdtempSync(join(tmpdir(), "ggd-advisory-"));
  const docs = Object.fromEntries(
    Object.entries(DOCS).map(([k, rel]) => [k, JSON.parse(readFileSync(join(REPO, rel), "utf8"))]),
  ) as Docs;
  edit(docs);
  for (const [k, rel] of [["", SCRIPT] as const, ...Object.entries(DOCS)]) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    if (k === "") cpSync(join(REPO, rel), join(dir, rel));
    else writeFileSync(join(dir, rel), JSON.stringify(docs[k as keyof Docs]));
  }
  execFileSync("node", [join(dir, SCRIPT)], { encoding: "utf8", stdio: "pipe" });
  return JSON.parse(readFileSync(join(dir, OUT), "utf8"));
}

describe("GH#986 Codex visual advisory", () => {
  it("⭐ 一份證據變了只作廢那一份 —— 其餘保留原審閱（⛔ 不是整包重來）", () => {
    const before = run();
    const staleIds = (o: any) => o.rows.filter((r: any) => r.reviewState === "stale").map((r: any) => r.id).sort();
    const victim = before.rows.find((r: any) => r.reviewState === "current").id as string;
    const after = run((d) => {
      const row = d.packet.documentSources.find((r: any) => r.id === victim);
      row.sourceDigest = row.sourceDigest.replace(/^./, (c: string) => (c === "a" ? "b" : "a"));
    });
    expect(staleIds(after)).toEqual([...staleIds(before), victim].sort());
    // ⭐ 其餘每一列逐列都還在、新鮮度沒變、審閱原文一個字都沒掉；stale 那一列不進任何摘要。
    const kept = (o: any) => o.rows.filter((r: any) => r.id !== victim).map((r: any) => `${r.id}:${r.reviewState}|${r.note}`);
    expect(kept(after)).toEqual(kept(before));
    expect(after.summary.reviewFreshness.current).toBe(before.summary.reviewFreshness.current - 1);
    expect(Object.values(after.summary.dispositions).reduce((a: any, b: any) => a + b, 0)).toBe(after.summary.reviewFreshness.current);
  });

  it("⭐ 分母是推導的 —— 驗收包擴編一列不會讓它整支失敗，那一列進 awaitingCapture", () => {
    const out = run((d) => {
      const seed = d.acceptance.rows[0];
      d.acceptance.rows = [...d.acceptance.rows, { ...seed, id: "godie-zzzz.q", name: "新增但還沒擷取" }];
      d.acceptance.summary.documents = d.acceptance.rows.length;
    });
    expect(out.coverage.awaitingCapture).toContain("godie-zzzz.q");
    expect(out.scope.acceptanceDocuments).toBe(out.scope.reviewedDocuments + out.coverage.awaitingCapture.length);
  });

  it("⭐ 積木名從清冊推導 —— 換一顆仍數得出擋住幾支；已出貨的積木被標成缺 ⇒ 紅", () => {
    const rename = (d: Docs, to: string) => {
      for (const c of d.manifest.cases) for (const i of c.machineIssues ?? []) if (i.code === "MISSING_VISUAL_BRICK") i.brickId = to;
      for (const e of d.source.entries) e.flags = (e.flags ?? []).map((f: string) => (f.startsWith("missing-") ? `missing-${to}` : f));
    };
    const blocked = run().summary.missingBrickBlocks["solid-beam"].documents as number;
    expect(blocked).toBeGreaterThan(1);
    const renamed = run((d) => rename(d, "wide-ribbon"));
    expect(renamed.summary.missingBrickBlocks["wide-ribbon"].documents).toBe(blocked);
    // ⭐ 「缺」是一個**關係**：那顆積木出貨的那一天，這條閘要紅並指名它。
    const shipped = (d: Docs) => d.bricks.bricks.find((b: any) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.id)).id as string;
    expect(() => run((d) => rename(d, shipped(d)))).toThrow(/already shipped/);
  });
});

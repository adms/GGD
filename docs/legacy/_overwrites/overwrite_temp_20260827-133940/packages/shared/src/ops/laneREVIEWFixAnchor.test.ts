/**
 * laneREVIEWFixAnchor.test.ts —— 兩條承重的線（體驗／工具層，⛔ 不開對抗輪）。
 * ① **GH#797 修復錨**：判準是 **diff**，⛔ 不是 commit 訊息。承重的一跳是
 *    `modelKey → content/models/*.json → glbPath → .glb` —— 少了它，`invprim`
 *    （錨 `e44bf446`，而它動的正是 `revivehuman.glb`）會被誤判成「錨錯了」。
 * ② **GH#756**：triage 認得 voice，門檻**讀自 gate JSON**（⛔ 不抄字面值）。
 * 突變（2026-08-27）：`fixTouchesBatch` 開頭插 `return { status:"touches", … }` → ① 紅。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error —— repo 工具腳本（.mjs，無型別宣告）；測的就是出貨的那一支
import { fixTouchesBatch } from "../../../../tools/review/fix-anchor.mjs";
// @ts-expect-error —— 同上
import { buildQueue } from "../../../../tools/review/triage.mjs";

const git = (r: string, ...a: string[]) =>
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: r, encoding: "utf8" });

/** 一個**真的 git repo**：⛔ 不自造「commit 動了哪些檔」的夾具（失敗形態⑤）。 */
function seed(): { root: string; fix: string; evidence: string; other: string } {
  const r = mkdtempSync(join(tmpdir(), "review-anchor-"));
  const w = (rel: string, body: string) => (
    mkdirSync(join(r, rel, ".."), { recursive: true }), writeFileSync(join(r, rel), body)
  );
  w("content/abilities/zz.a.json", JSON.stringify({ id: "zz.a", effects: [{ modelKey: "m1" }] }));
  w("content/models/m1.json", JSON.stringify({ id: "m1", glbPath: "assets/models/imported/m1.glb" }));
  w("content/assets/models/imported/m1.glb", "glb-v1");
  git(r, "init", "-q");
  git(r, "add", "-A");
  git(r, "commit", "-qm", "seed");
  // 修復＝重轉那顆 .glb（＝ invprim 的形狀：技能沒動、模型的位元組動了）
  w("content/assets/models/imported/m1.glb", "glb-v2");
  git(r, "commit", "-qam", "chore(ops): 一支訊息看不出來是修復的 commit");
  const fix = git(r, "rev-parse", "HEAD").trim();
  // 只加證據圖的 commit（訊息卻寫「修復」）
  w("docs/_reports/zz_visual-proof_x/f.png", "png");
  git(r, "add", "-A");
  git(r, "commit", "-qm", "fix(vfx): 看起來像修復，其實零行修復");
  const evidence = git(r, "rev-parse", "HEAD").trim();
  w("README.md", "x");
  git(r, "add", "-A");
  git(r, "commit", "-qm", "docs: 無關");
  return { root: r, fix, evidence, other: git(r, "rev-parse", "HEAD").trim() };
}

describe("修復錨與語音漏斗", () => {
  it("① 錨的判準是 diff：訊息說謊也騙不過，⛔ 而看不到的那一面回 null", () => {
    const { root, fix, evidence, other } = seed();
    const b = { abilities: ["zz.a"], rollbackDocRel: null as string | null };

    const good = fixTouchesBatch(root, { ...b, commit: fix });
    expect(good.status, "訊息寫 chore，但它動了這批引用的 .glb ⇒ 它就是錨").toBe("touches");
    expect(good.matched.map((m: { path: string }) => m.path)).toContain(
      "content/assets/models/imported/m1.glb",
    );

    expect(
      fixTouchesBatch(root, { ...b, commit: evidence }).status,
      "只加證據圖 ⇒ 證據不是修復（⛔ 與宣稱集合寬窄無關）",
    ).toBe("evidence-only");
    expect(fixTouchesBatch(root, { ...b, commit: other }).status).toBe("unrelated");
    expect(fixTouchesBatch(root, { ...b, commit: "" }).status, "沒登記 ⇒ 判不了").toBeNull();
    // ⭐ 沒登記 abilities ⇒ 看不到渲染端 ⇒ ⛔ 不可以據此指控（會冤枉正確的錨）
    expect(
      fixTouchesBatch(root, { abilities: [], rollbackDocRel: "content/models/m1.json", commit: other }).status,
    ).toBeNull();
  });

  it("② 語音進得了漏斗，而門檻讀自 gate JSON（⛔ 不是抄一份數字）", () => {
    const q = buildQueue(process.cwd());
    const gate = JSON.parse(
      readFileSync("content/assets/audio/voices/_separation-qc-gate.json", "utf8"),
    ) as { thresholdLadder: { rows: { clipsPerChampion: number }[] } };
    expect(q.counts.voice.champions, "triage 在此之前對 voice 零命中").toBeGreaterThan(0);
    expect(
      gate.thresholdLadder.rows.map((r) => r.clipsPerChampion),
      "選中的 ladder 列必須真的存在於 gate 裡",
    ).toContain(q.counts.voice.ladderRow);
    // ⛔ 量測過期時一對都選不出來 —— 那要是一個**看得見的字串**，⛔ 不是沉默的 0。
    if (q.counts.voice.status !== "ok") expect(q.counts.voice.reason).toMatch(/\S/);
  });
});

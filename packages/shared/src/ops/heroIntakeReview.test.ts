/**
 * 🧍🖼🎙 **新英雄上架一頁檢核**的承重守衛 —— owner 2026-09-11：
 * > 「全部放到一頁檢核頁面讓我複查，這個過程**全部自動化**，只留**最後我的審查通過與否**」
 *
 * ## 三條不變量，三條都是**關係**，⛔ 不是名詞
 *  ① **材料是算出來的**：拿**真的** repo 跑 `tools/hero-intake/run.mjs --check` ——
 *     材料與磁碟上的英雄狀態一致才綠。⛔ 不是「那個 json 在不在」。
 *  ② **裁決綁在那一份材料上**：材料重跑過（digest 變了）⇒ 舊裁決標 `stale`。
 *     ⛔ 沒有這一條，owner 看的是 A、按的卻記在 B 身上。
 *  ③ **退回必填原因**（owner 2026-08-24「追加原因的HITL」）——
 *     ⛔ 一個沒有理由的退回，下一輪讀到時沒有人知道要修什麼。
 *
 *  ④ **「交付表有這一列」⛔ 不等於「模型交出來了」**：`files: []` 有**兩個相反**的意思 ——
 *     沒有 modelKey ⇒ 還沒做出來（⛔ 擋上架）；有 modelKey ⇒ 檔本來就在這個 repo（只是順序沒到）。
 *     ⛔ 沒有這一條，那 8 位「只有骨架、動作還沒做」會以「0/0 個檔都到齊了」的樣子通過。
 *     同一條也驗 join key：同一列⛔ 不可以被兩位英雄認領（key 漂掉就是這樣放大成資料毀損的）。
 *
 * ⚠️ 這一條**不驗畫面**（那要真的開後台）；它驗的是頁面吃的那份資料與寫回去的那條路。
 *
 * ── 突變紀錄（一批一條，挑最承重的）────────────────────────────────────
 *  · `heroIntake.mjs` 的 `stale` 改成永遠 false → 第 ② 條紅（重跑後舊裁決被算成有效）。實測過。
 *  · `run.mjs` 的「files 空 ＋ 沒有 modelKey ⇒ blocker」改成 warning → 第 ④ 條紅（8 位沒有模型的
 *    英雄被算成可上架）。實測過。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 一個只有「材料＋結果」兩個住處的最小 repo —— ⭐ 驗的是出貨的那兩支 .mjs 的行為。 */
function sandbox(digest: string) {
  const root = mkdtempSync(join(tmpdir(), "hero-intake-"));
  mkdirSync(join(root, "docs/_review/material/hero-intake"), { recursive: true });
  mkdirSync(join(root, "docs/_review/verdicts"), { recursive: true });
  writeFileSync(
    join(root, "docs/_review/material/hero-intake/t.json"),
    JSON.stringify({ schema: "ggd-hero-intake@1", batch: "t", digest, counts: {}, heroes: [{ id: "h1", name: "測試", blockers: [], warnings: [], ready: true, model: {}, icon: {}, voice: {} }] }),
  );
  return root;
}

describe("新英雄上架一頁檢核 (hero-intake-review)", () => {
  it("⭐ ① 材料是算出來的：--check 在出貨 repo 上對得起磁碟", () => {
    const r = spawnSync("node", ["tools/hero-intake/run.mjs", "--batch", "ship153", "--all", "--check"], {
      cwd: REPO, encoding: "utf8", timeout: 180_000,
    });
    expect(
      r.status,
      `hero-intake --check 回了 ${r.status}：\n${r.stdout}\n${r.stderr}\n` +
        "⇒ 材料過期（磁碟上的模型／圖示／語音已經變了）。重跑 pnpm hero:intake --batch ship153 --all。",
    ).toBe(0);
  });

  it("⭐ ② 裁決綁在那一份材料上：材料重跑過 ⇒ 舊裁決標 stale", async () => {
    const mod = await import(join(REPO, "tools/review/heroIntake.mjs"));
    const root = sandbox("AAA");
    try {
      mod.saveHeroIntakeVerdict(root, "local", { batch: "t", heroId: "h1", digest: "AAA", verdict: "approve", reason: "" });
      expect(mod.buildHeroIntakeQueue(root).batches[0].heroes[0].stale).toBe(false);
      // 材料重跑：同一位英雄、不同 digest
      writeFileSync(
        join(root, "docs/_review/material/hero-intake/t.json"),
        JSON.stringify({ schema: "ggd-hero-intake@1", batch: "t", digest: "BBB", counts: {}, heroes: [{ id: "h1", name: "測試", blockers: [], warnings: [], ready: true, model: {}, icon: {}, voice: {} }] }),
      );
      const after = mod.buildHeroIntakeQueue(root).batches[0].heroes[0];
      expect(after.verdict, "裁決仍在（⛔ 不是刪掉它）").toBe("approve");
      expect(after.stale, "⛔ 你看的那一份已經不是現在的那一份 —— 必須標 stale").toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("⭐ ④ 空的交付列有兩個相反的意思，而 join key 一列只能被一位英雄認領", () => {
    const doc = JSON.parse(readFileSync(join(REPO, "docs/_review/material/hero-intake/ship34.json"), "utf8")) as {
      delivery: { rows: number; claimed: number; unclaimed: string[]; doubleClaimed: string[] };
      heroes: { id: string; model: { files?: number; modelKey?: string | null; severity?: string; gap?: string } }[];
    };
    expect(doc.delivery.doubleClaimed, "⛔ 同一列交付被兩位英雄認領 —— 那是 join key 漂掉的樣子").toEqual([]);
    expect(doc.delivery.claimed, "對不上的交付列會讓整張表不能被相信").toBe(doc.delivery.rows);
    const empty = doc.heroes.filter((h) => h.model.files === 0);
    expect(empty.length, "ship34 裡本來就有『交付列是空的』那一族（10 位沿用既有＋8 位還沒做）").toBeGreaterThan(0);
    for (const h of empty) {
      if (h.model.modelKey == null) {
        expect(h.model.severity, `${h.id}：0 個檔又沒有 modelKey ＝ **沒有模型**，⛔ 不可以算成只是順序沒到`).toBe("blocker");
        expect(h.model.gap ?? "").toMatch(/沒有模型/);
      } else {
        expect(h.model.severity, `${h.id}：0 個檔但 modelKey 查得到（檔本來就在這裡）⇒ ⛔ 不是缺漏`).not.toBe("blocker");
      }
    }
  });

  it("⭐ ③ 退回必填原因，⛔ 通過不強迫填", async () => {
    const mod = await import(join(REPO, "tools/review/heroIntake.mjs"));
    const root = sandbox("AAA");
    try {
      expect(() =>
        mod.saveHeroIntakeVerdict(root, "local", { batch: "t", heroId: "h1", digest: "AAA", verdict: "reject", reason: "  " }),
      ).toThrow(/原因/);
      expect(() =>
        mod.saveHeroIntakeVerdict(root, "local", { batch: "t", heroId: "h1", digest: "AAA", verdict: "approve" }),
      ).not.toThrow();
      expect(() =>
        mod.saveHeroIntakeVerdict(root, "local", { batch: "t", heroId: "h1", digest: "AAA", verdict: "maybe" }),
      ).toThrow(/approve/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * 批次驗收頁要收得下**非視覺**的成果 —— ⭐ 而假的證據／假的開關仍然被拒（GH#868）。
 *
 * ⚠️ 在此之前登記器**唯一**接受的證據是「連續圖片序列」，rollback **只認 config 文件**
 * ⇒ 帳本 21 批**全部**是 `*_visual-proof_*`，而手把操作、後台頁、部署這些成果
 * **結構上登記不了** ⇒ ⭐ owner 的事後否決權在那些層一直是空的
 * （⛔ 不是「沒有人記得登記」—— 那是我一開始的假前提）。
 *
 * ⭐ 這條守衛守的是**一般化沒有變成放寬**：兩個方向都要驗（失敗形態⑫）。
 *
 * 突變紀錄：把 `grepEnvSwitch` 的回傳改成恆為 `["x"]` → 「假 env 被拒」那條紅。
 */
import { describe, it, expect } from "vitest";
// ⚠️ `tools/review/features.mjs` 是純 JS（⛔ 沒有 .d.ts）⇒ 具名 import 會 TS7016。
// ⭐ 用動態 import 拿到出貨的**同一支**函式（⛔ 不是複製一份實作進測試）。
type RegisterBatch = (repoRoot: string, batch: Record<string, unknown>) => { evidenceKind: string; rollback: { configId: string } };
const registerBatch: RegisterBatch = (
  (await import(/* @vite-ignore */ ("../../../../tools/review/features.mjs" as string))) as { registerBatch: RegisterBatch }
).registerBatch;
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function sandbox(): string {
  const t = mkdtempSync(join(tmpdir(), "ggd-review-"));
  mkdirSync(join(t, "docs/_review/material"), { recursive: true });
  mkdirSync(join(t, "docs/_reports"), { recursive: true });
  mkdirSync(join(t, "content/config"), { recursive: true });
  mkdirSync(join(t, "tools/x"), { recursive: true });
  writeFileSync(join(t, "content/config/demo.json"), JSON.stringify({ id: "demo", active: "new" }));
  // ⭐ 一個**真的有人讀**的 env 開關
  writeFileSync(join(t, "tools/x/reader.mjs"), 'if (process.env.GGD_DEMO_SWITCH !== "0") {}\n');
  writeFileSync(join(t, "docs/_reports/note.md"), "# 證據\n");
  return t;
}

const rb = (configId: string, field: string) => ({ configId, field, rollbackValue: "old" });

describe("批次驗收頁收得下非視覺成果（GH#868）", () => {
  it("✅ 收：config 開關 ＋ 存在的證據檔", () => {
    const t = sandbox();
    const out = registerBatch(t, {
      id: "gate_batch", title: "t", evidence: "docs/_reports/note.md", rollback: rb("demo", "active"),
    });
    expect(out.evidenceKind, "⛔ 非視覺的那一批要標成 gate").toBe("gate");
  });

  it("✅ 收：env 開關（⭐ 而且要有人讀它）", () => {
    const t = sandbox();
    const out = registerBatch(t, {
      id: "env_batch", title: "t", evidence: "docs/_reports/note.md",
      rollback: rb("env:GGD_DEMO_SWITCH", "env"),
    });
    expect(out.rollback.configId).toBe("env:GGD_DEMO_SWITCH");
  });

  it("⛔ 拒：沒有人讀的 env 名字（⭐ 一般化 ≠ 放寬）", () => {
    const t = sandbox();
    expect(() =>
      registerBatch(t, { id: "b", title: "t", evidence: "docs/_reports/note.md", rollback: rb("env:GGD_NOBODY_READS", "env") }),
    ).toThrow(/沒有任何一行讀它/);
  });

  it("⛔ 拒：指不到的證據檔", () => {
    const t = sandbox();
    expect(() =>
      registerBatch(t, { id: "b", title: "t", evidence: "docs/_reports/nope.md", rollback: rb("demo", "active") }),
    ).toThrow(/這個檔不存在/);
  });

  it("⛔ 拒：完全沒有證據", () => {
    const t = sandbox();
    expect(() => registerBatch(t, { id: "b", title: "t", rollback: rb("demo", "active") })).toThrow(
      /找不到連續圖片序列/,
    );
  });
});

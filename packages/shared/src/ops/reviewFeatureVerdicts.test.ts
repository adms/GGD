/**
 * reviewFeatureVerdicts.test.ts —— GH#669 功能級「先上線 + 事後否決」的薄守衛（體驗層）。
 *
 * 兩條承重的線，⛔ 其餘（欄位標籤、鍵盤、樣式）不測：
 *   ① **登記閘** —— 寫不出可用的 rollback 開關 ⇒ 拒絕登記。這是 owner 常設指令
 *      「留後台開關可以簡易 rollback」的閘化；閘沒了，帳本上的 rollback 就只是散文。
 *   ② 帳本契約 —— 預設 live · 否決必填原因 · 否決落帳本並指名開關 · 序列重渲染 ⇒ 裁決過期。
 *
 * 突變驗證（2026-08-25）：features.mjs 的 `if (!rb.ok) throw` 拿掉 → ①紅（假登記被放行）。
 *
 * ⚠️ 2026-08-27（GH#794）：帳本從**一個檔**變成**兩個分署的資料夾**
 * （`docs/_review/material/` 我寫 · `docs/_review/verdicts/` owner 按）。
 * ⇒ ② 改成分開讀兩份，並且**互相斷言對方的欄位不在**——⭐ 那才是分署的不變量，
 *   ⛔ 不是「換一個路徑繼續讀同一坨」。
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error —— repo 工具腳本（.mjs，無型別宣告）；測的就是出貨的那一支
import { registerBatch, saveFeatureVerdict, buildFeatureQueue } from "../../../../tools/review/features.mjs";

const SEQ = "zzz_visual-proof_20260825-0000";

function seedRepo(): string {
  const r = mkdtempSync(join(tmpdir(), "review-features-"));
  mkdirSync(join(r, "content/config"), { recursive: true });
  mkdirSync(join(r, `docs/_reports/${SEQ}`), { recursive: true });
  writeFileSync(join(r, "content/config/zzz.json"), JSON.stringify({ id: "zzz", knobs: { path: "static" } }));
  writeFileSync(
    join(r, `docs/_reports/${SEQ}/frames.md`),
    "# 測試序列\n\n| 圖 | 亮像素 | lit |\n|---|---:|---:|\n| f0_cast | 0 | 0 |\n| f1_peak | **1,384** | 3060 |\n",
  );
  for (const f of ["f0_cast.png", "f1_peak.png"]) writeFileSync(join(r, `docs/_reports/${SEQ}/${f}`), f);
  return r;
}
const ok = { configId: "zzz", field: "knobs.path", liveValue: "static", rollbackValue: "forward" };

describe("功能級連續圖片批核（#669）", () => {
  it("① 登記閘：寫不出（或解析不到）rollback 開關 ⇒ 拒絕登記", () => {
    const r = seedRepo();
    expect(() => registerBatch(r, { id: SEQ })).toThrow(/rollback/);
    expect(() => registerBatch(r, { id: SEQ, rollback: { configId: "zzz", field: "knobs.path" } })).toThrow(
      /rollbackValue/,
    );
    // 開關「看起來像一格」但出貨文件裡根本沒有那條路徑 —— 這正是散文與閘的差別
    expect(() =>
      registerBatch(r, { id: SEQ, rollback: { ...ok, field: "knobs.nope" } }),
    ).toThrow(/沒有欄位/);
    expect(() => registerBatch(r, { id: SEQ, rollback: { ...ok, configId: "nosuch" } })).toThrow(/解析不到/);
    expect(buildFeatureQueue(r).counts.unregistered, "拒絕登記＝帳本裡沒有它").toBe(1);
  });

  it("② 預設 live → 否決必填原因 → 落帳本指名開關 → 重渲染則裁決過期", () => {
    const r = seedRepo();
    registerBatch(r, { id: SEQ, title: "測試批", commit: "deadbeef", rollback: ok });
    const q1 = buildFeatureQueue(r);
    const b1 = q1.batches[0];
    expect(b1.status, "⭐ 預設＝已上線待批核，⛔ 不是等審批").toBe("pending");
    expect(b1.rollbackOk).toBe(true);
    expect(b1.frames.map((f: { label: string; bright: number | null }) => [f.label, f.bright])).toEqual([
      ["f0_cast", 0],
      ["f1_peak", 1384],
    ]);

    expect(() => saveFeatureVerdict(r, { id: SEQ, hash: b1.hash, verdict: "veto", reason: "  " })).toThrow(
      /必填原因/,
    );
    saveFeatureVerdict(r, { id: SEQ, hash: b1.hash, verdict: "veto", reason: "光束太短" });
    // ⭐ GH#794 起，材料與結果**分署不同資料夾**（owner 2026-08-27「避免讀寫混淆」）。
    //   ⇒ 這裡刻意**分開讀兩份**：一份不可以有另一份的欄位，那正是分署的重點。
    const verdicts = JSON.parse(readFileSync(join(r, "docs/_review/verdicts/local.json"), "utf8"));
    const material = JSON.parse(readFileSync(join(r, "docs/_review/material/batches.json"), "utf8"));
    expect(verdicts.verdicts[SEQ].reason).toBe("光束太短");
    expect(material.batches[SEQ].rollback.field, "否決要指名翻哪一格").toBe("knobs.path");
    expect(verdicts.verdicts[SEQ].rollback, "⛔ 裁決檔裡不可以有登記欄位（分署破了）").toBeUndefined();
    expect(material.batches[SEQ].verdict, "⛔ 材料檔裡不可以有裁決欄位（分署破了）").toBeUndefined();
    expect(buildFeatureQueue(r).batches[0].status).toBe("vetoed");

    writeFileSync(join(r, `docs/_reports/${SEQ}/f1_peak.png`), "changed");
    const b2 = buildFeatureQueue(r).batches[0];
    expect(b2.status, "序列重渲染 ⇒ hash 漂 ⇒ 裁決過期，回 pending（仍然是上線狀態）").toBe("pending");
    expect(b2.blockers.join()).toContain("hash 漂");
  });
});

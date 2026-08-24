/**
 * reviewTriage.test.ts —— GH#664 HITL 驗收 triage 的薄守衛（體驗層，≤80 行）。
 * 一條 sentinel 走完整個生命週期：pending → pass → 內容變（hash 漂）→ 又 pending。
 * 帳本契約（review-approvals@1 的鍵形 `<kind>:<id>` 與 hash 判準）就是跨 lane 契約 ——
 * 這一條紅了，審查頁記下的裁決就再也對不回資產。
 * 突變驗證（2026-08-24）：buildQueue 的 `e.hash === a.hash` 改成 `!!e` → 紅（hash 漂了不回 pending）。
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error —— repo 工具腳本（.mjs，無型別宣告）；測的就是出貨的那一支
import { buildQueue, saveVerdict } from "../../../../tools/review/triage.mjs";

function seedRepo(): string {
  const r = mkdtempSync(join(tmpdir(), "review-triage-"));
  for (const d of ["content/vfx", "content/abilities", "content/config", "docs/_review"])
    mkdirSync(join(r, d), { recursive: true });
  writeFileSync(join(r, "content/vfx/fx.zzz.json"), JSON.stringify({ id: "fx.zzz", schema: "vfx@1" }));
  writeFileSync(join(r, "content/vfx/fx.orphan.json"), JSON.stringify({ id: "fx.orphan", schema: "vfx@1" }));
  writeFileSync(join(r, "content/abilities/a.r.json"), JSON.stringify({ id: "a.r", slot: "R", vfxKey: "fx.zzz" }));
  writeFileSync(join(r, "content/config/audio-map.json"), JSON.stringify({ sfx: {} }));
  writeFileSync(join(r, "docs/_review/approvals.json"), JSON.stringify({ schema: "review-approvals@1", entries: {} }));
  return r;
}

describe("review triage（#664）", () => {
  it("sentinel：pending → pass 落帳本 → hash 漂 → 又 pending", () => {
    const r = seedRepo();
    const q1 = buildQueue(r);
    const item = q1.items.find((i: { id: string }) => i.id === "fx.zzz");
    expect(item, "未核准的被引用資產要在佇列").toBeTruthy();
    expect(item.risk, "R 槽引用加權 ×2").toBe(2);
    expect(item.refs).toEqual(["a.r"]);
    expect(
      q1.items.find((i: { id: string }) => i.id === "fx.orphan"),
      "零引用資產屬 Tier0（機器閘），⛔ 不進人審佇列",
    ).toBeUndefined();

    // 帳本 round-trip：寫進去的鍵形與 verdict 讀得回來，且佇列消掉它
    saveVerdict(r, { kind: "vfx", id: "fx.zzz", hash: item.hash, verdict: "pass", note: "ok" });
    const ledger = JSON.parse(readFileSync(join(r, "docs/_review/approvals.json"), "utf8"));
    expect(ledger.schema).toBe("review-approvals@1");
    expect(ledger.entries["vfx:fx.zzz"].verdict).toBe("pass");
    expect(ledger.entries["vfx:fx.zzz"].hash).toBe(item.hash);
    expect(buildQueue(r).items.find((i: { id: string }) => i.id === "fx.zzz")).toBeUndefined();

    // 內容變了 ⇒ 核准過期 ⇒ 回 pending（這一條就是「核准跟著 hash 走」的契約）
    writeFileSync(
      join(r, "content/vfx/fx.zzz.json"),
      JSON.stringify({ id: "fx.zzz", schema: "vfx@1", mode: "burst" }),
    );
    const back = buildQueue(r).items.find((i: { id: string }) => i.id === "fx.zzz");
    expect(back, "hash 與帳本不符時要回 pending").toBeTruthy();
    expect(back.reasons.join()).toContain("hash 過期");
  });
});

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
import {
  buildQueue,
  saveVerdict,
  rendererFingerprint,
  buildInventory,
} from "../../../../tools/review/triage.mjs";

function seedRepo(): string {
  const r = mkdtempSync(join(tmpdir(), "review-triage-"));
  for (const d of [
    "content/vfx",
    "content/abilities",
    "content/config",
    "docs/_review",
    // ⭐ GH#664 Phase 2 —— 渲染層指紋的來源（`editorcov:build` 的產物）。
    "docs/editor-contract",
  ])
    mkdirSync(join(r, d), { recursive: true });
  writeFileSync(join(r, "content/vfx/fx.zzz.json"), JSON.stringify({ id: "fx.zzz", schema: "vfx@1" }));
  writeFileSync(join(r, "content/vfx/fx.orphan.json"), JSON.stringify({ id: "fx.orphan", schema: "vfx@1" }));
  writeFileSync(join(r, "content/abilities/a.r.json"), JSON.stringify({ id: "a.r", slot: "R", vfxKey: "fx.zzz" }));
  writeFileSync(join(r, "content/config/audio-map.json"), JSON.stringify({ sfx: {} }));
  writeFileSync(join(r, "docs/_review/approvals.json"), JSON.stringify({ schema: "review-approvals@1", entries: {} }));
  writeFileSync(
    join(r, "docs/editor-contract/ggd-editor-coverage.json"),
    JSON.stringify({ fingerprint: "rendererV1" }),
  );
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

  /**
   * ⭐⭐ GH#664 Phase 2 —— **第二軸：渲染層變了**。
   *
   * 上面那一條驗的是「**這份資產的內容**變了」。⛔ 而一個資產的**畫面**可以在
   * 內容位元組一個都沒動的情況下改變 —— 渲染層改了就會。
   *
   * ⭐ 2026-08-31 就發生了兩次，兩次都沒動任何 `content/vfx/*.json`：
   * `model@1.fxEmitters`（GH#803）與 `families[*].models`（GH#761）。
   * ⇒ 那些資產的綠燈是**對舊的畫面**發的。
   *
   * MUTATION LOG：
   *   · `staleRenderer` 那一行拿掉 → 「渲染層變了要回 pending」紅
   *   · `e.renderer !== undefined &&` 拿掉 → 「舊條目不可以被洗掉」紅
   */
  it("★ ⭐ 內容一個位元組都沒動，但**渲染層變了** ⇒ 回 pending", () => {
    const r = seedRepo();
    expect(rendererFingerprint(r), "量尺先自證：讀得到指紋").toBe("rendererV1");

    const item = buildQueue(r).items.find((i: { id: string }) => i.id === "fx.zzz");
    saveVerdict(r, { kind: "vfx", id: "fx.zzz", hash: item.hash, verdict: "pass" });
    const led = JSON.parse(readFileSync(join(r, "docs/_review/approvals.json"), "utf8"));
    expect(led.entries["vfx:fx.zzz"].renderer, "⛔ 沒記下這一格 = 之後永遠比不出漂移").toBe("rendererV1");
    expect(buildQueue(r).items.find((i: { id: string }) => i.id === "fx.zzz")).toBeUndefined();

    // ⭐ 只動渲染層契約 —— `content/vfx/fx.zzz.json` **一個位元組都沒動**
    writeFileSync(
      join(r, "docs/editor-contract/ggd-editor-coverage.json"),
      JSON.stringify({ fingerprint: "rendererV2" }),
    );
    const back = buildQueue(r).items.find((i: { id: string }) => i.id === "fx.zzz");
    expect(back, "⛔ 綠燈是對舊畫面發的，而它還掛著").toBeTruthy();
    expect(back.reasons.join()).toContain("渲染層變了");
    expect(back.hash, "⭐ 內容 hash 沒變 —— 這正是 `hash` 那一軸看不見它的原因").toBe(item.hash);
  });

  it("★ ⭐ **risk 0 的資產**核准過而渲染層漂了 ⇒ 也要回佇列（⛔ 不論 risk）", () => {
    /**
     * ⚠️ ⭐ 這一條是突變驗證逼出來的：拿掉 `staleApproval` 裡的 `|| staleRenderer`
     * 之後上面那條**仍然是綠的** —— 因為 `fx.zzz` 的 risk 是 2，走的是
     * 「已審且 hash 相同」那條路（`!staleRenderer` 在那裡承重）。
     * ⭐ `staleApproval` 真正承重的是 **`risk <= 0` 的早退**，
     * 而 `fx.orphan`（零引用）正是那一種。
     * ⇒ ⛔ 少了這一條，一半的機制沒有守衛（失敗形態⑩的反面：夾具挑錯了）。
     */
    const r = seedRepo();
    // `fx.orphan` 零引用 ⇒ risk 0 ⇒ Tier0，平常**不進**佇列
    expect(buildQueue(r).items.find((i: { id: string }) => i.id === "fx.orphan")).toBeUndefined();
    // ⭐⭐ 必須用它**真正的** hash —— ⛔ 一個假 hash 會讓「內容軸」自己就成立，
    //   於是這條測試對「渲染軸有沒有生效」**兩邊都綠**（我第一版就是這樣，
    //   而突變驗證抓到了它）。
    const inv = buildInventory(r, { pairs: [], inventory: [] }) as { kind: string; id: string; hash: string }[];
    const orphan = inv.find((x) => x.id === "fx.orphan");
    expect(orphan, "量尺自證：盤點裡要有這一份").toBeTruthy();
    saveVerdict(r, { kind: "vfx", id: "fx.orphan", hash: orphan!.hash, verdict: "pass" });
    writeFileSync(
      join(r, "docs/editor-contract/ggd-editor-coverage.json"),
      JSON.stringify({ fingerprint: "rendererV2" }),
    );
    expect(
      buildQueue(r).items.find((i: { id: string }) => i.id === "fx.orphan"),
      "⛔ 核准過而畫面可能變了的資產必須回佇列 —— ⛔ 不論 risk",
    ).toBeTruthy();
  });

  it("⭐ **舊條目不可以被洗掉** —— 沒有 `renderer` 那一格 ⇒ 這一軸未知，⛔ 不判過期", () => {
    const r = seedRepo();
    const item = buildQueue(r).items.find((i: { id: string }) => i.id === "fx.zzz");
    // 手寫一筆**沒有** `renderer` 的舊帳本條目（這一格出現以前的形狀）
    writeFileSync(
      join(r, "docs/_review/approvals.json"),
      JSON.stringify({
        schema: "review-approvals@1",
        entries: { "vfx:fx.zzz": { hash: item.hash, verdict: "pass", note: "", reviewer: "owner" } },
      }),
    );
    writeFileSync(
      join(r, "docs/editor-contract/ggd-editor-coverage.json"),
      JSON.stringify({ fingerprint: "rendererV999" }),
    );
    expect(
      buildQueue(r).items.find((i: { id: string }) => i.id === "fx.zzz"),
      "⛔ 一次 schema 改動把整本舊帳洗回 pending = 這一格比沒有還糟",
    ).toBeUndefined();
  });
});

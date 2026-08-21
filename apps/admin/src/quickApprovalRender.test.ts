/**
 * Quick Approval renders — a no-browser smoke test (task #242).
 *
 * The console has no DOM test environment (vitest runs in plain node and only
 * collects `src/**\/*.test.ts`), so React components here are normally verified
 * only by the type checker. That is enough for a page whose logic lives in a
 * pure module — EXCEPT that this page's whole value is being reachable on the
 * real deploy, and a component that throws on first paint fails in exactly the
 * situation nobody is watching: the owner opening it on a phone.
 *
 * `renderToString` needs no DOM, so this costs milliseconds and covers the two
 * things the type checker cannot: that the module graph actually loads (an
 * import cycle through ../api would surface here), and that every ROW SHAPE the
 * page can legitimately produce renders — approvable, risky, read-only,
 * account, exposure — including the branches for a null risk and an absent
 * stat line.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { QuickApprovalPage, RowCard, ResultPanel } from "./ui/QuickApprovalPage";
import { buildRows, editorExposureRow, summarizeResult, type QuickRow } from "./quickApproval";

const noop = (): void => undefined;

describe("the page renders without a browser", () => {
  it("paints its header and a loading state before any request lands", () => {
    cover("adminui-quick-approval");
    const html = renderToString(createElement(QuickApprovalPage));
    expect(html).toContain("Quick Approval");
    // the promise the page makes, stated before any row exists
    expect(html).toContain("永遠不會替你移除任何已啟用的內容");
    // GH#495: 第②區 paints before the first read lands (its cards say 載入中),
    // and 第③區 says where the uncollected owner-only actions are
    expect(html).toContain("② 清理／移除");
    expect(html).toContain("③ 其他只有你能按的動作");
  });

  it("renders EVERY row shape, including the read-only ones", () => {
    cover("adminui-quick-approval");
    const rows: QuickRow[] = [
      ...buildRows({
        declaredChampions: ["ok", "risky"],
        liveChampions: ["peer", "extra"],
        liveAbilities: ["peer.q", "peer.w", "peer.e", "peer.r", "peer.ex", "extra.ex"],
        stats: new Map([
          // `attributeDerived: false` = "these came straight off the card".
          // Synthetic rows here on purpose: this file tests RENDERING, and the
          // derivation itself is covered against real docs in quickApproval.test.ts.
          ["peer", { id: "peer", name: "同伴", role: "fighter", maxHealth: 480, armor: 6, mr: 28, ms: 5.9, attributeDerived: false }],
          ["ok", { id: "ok", name: "健康", role: "mage", maxHealth: 460, armor: 5, mr: 28, ms: 5.9, attributeDerived: false }],
          ["risky", { id: "risky", name: "危險", role: "tank", maxHealth: 100, armor: 0, mr: 0, ms: 3, attributeDerived: false }],
          ["extra", { id: "extra", name: "多出來的", role: "tank", maxHealth: 100, armor: 0, mr: 0, ms: 3, attributeDerived: false }],
        ]),
        pendingAccounts: [{ id: "a1", username: "表哥", waited: "等了 3 分鐘" }],
        editorProbe: { status: 200, servesEditor: true },
      }),
      // the degenerate shapes: no risk, no stat line, no owning page
      {
        key: "bare",
        kind: "exposure",
        title: "無風險列",
        subtitle: "—",
        what: "x",
        why: "y",
        effect: "z",
        risk: null,
        tone: "dim",
        tickable: false,
        needsSecondConfirm: false,
      },
      editorExposureRow({ status: null, error: "offline" }),
    ];
    for (const row of rows) {
      const html = renderToString(
        createElement(RowCard, {
          row,
          checked: false,
          busy: false,
          onToggle: noop,
          onNavigate: noop,
        }),
      );
      expect(html, row.key).toContain(row.title);
      // the four mandatory prose labels are on every card
      for (const label of ["這是什麼", "為什麼在等", "送出後", "風險"]) {
        expect(html, `${row.key} must show ${label}`).toContain(label);
      }
      // a read-only row offers a lock, never a checkbox
      if (row.tickable) expect(html, row.key).toContain('type="checkbox"');
      else expect(html, row.key).not.toContain('type="checkbox"');
    }
  });

  it("renders the result panel for a partial failure", () => {
    cover("adminui-quick-approval");
    const result = summarizeResult(
      [
        { label: "開放英雄", ok: true, detail: "已加入 1 個 id" },
        { label: "通過帳號", ok: false, detail: "boom" },
      ],
      {
        champions: [],
        abilities: [],
        items: [],
        accounts: [],
        skipped: [{ key: "k", title: "略過的", why: "沒有打勾" }],
      },
    );
    const html = renderToString(createElement(ResultPanel, { result }));
    expect(html).toContain("有項目失敗");
    expect(html).toContain("略過的");
    expect(html).toContain("沒有打勾");
  });
});

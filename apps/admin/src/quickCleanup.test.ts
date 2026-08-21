/**
 * 第②區 的移除，⛔ 按不到 —— 除非先預覽 (GH#495).
 *
 * 一鍵送出確認 is safe to press WITHOUT READING because every request it sends
 * carries `disable: []`. 第②區 breaks that by design, and the only thing between
 * a mis-tap and a deleted hero is: THE CONFIRM DOES NOT EXIST UNTIL A PREVIEW
 * HAS BEEN SEEN. So this drives the REAL card (headless React, no DOM) and
 * asserts on what the action RECEIVED, not on the page's source.
 * Mutation verified: render the confirm outside `preview !== null` → ① red.
 */
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { cover } from "@ggd/shared/testkit/cover";
import { mount } from "./testkit/headlessUi";
import { QuickCleanupSection } from "./ui/QuickCleanupSection";
import { cleanupWriteRequest, confirmGate, disablePreview } from "./quickCleanup";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("./testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

const KIND = "undeclared-champions" as const;

describe("第②區：移除一定經過預覽", () => {
  it("no preview ⇒ no confirm, and the action is never entered", async () => {
    cover("adminui-quick-approval");
    const seen: ReturnType<typeof disablePreview>[] = [];
    let undone = 0;
    const action = {
      kind: KIND,
      blurb: "測試用",
      unavailable: null,
      preview: () => Promise.resolve(disablePreview(KIND, [{ id: "extra", name: "多出來的" }], 3)),
      run: (p: ReturnType<typeof disablePreview>) => {
        seen.push(p);
        return Promise.resolve({ text: "已下架", undo: () => Promise.resolve(`回 ${++undone}`) });
      },
    };
    const h = mount(createElement(QuickCleanupSection, { busy: false, actions: [action] }));

    // ① the door does not exist yet
    expect(h.fieldOrNull(`cleanup-confirm-${KIND}`)).toBeNull();
    expect(seen).toEqual([]);

    // ② the preview names every item — 名字 + id (an operator cannot agree to
    //    「移除 <一串英數 id>」)
    h.press(h.field(`cleanup-preview-${KIND}`));
    await h.flush();
    expect(h.text()).toContain("多出來的");
    expect(h.text()).toContain("extra");

    // ③ only now — and the action gets THE PREVIEWED SET, not a recomputed one
    h.press(h.field(`cleanup-confirm-${KIND}`));
    await h.flush();
    expect(seen).toHaveLength(1);
    expect(cleanupWriteRequest(seen[0]!)).toEqual({
      kind: "champions",
      enable: [],
      disable: ["extra"],
    });

    // ④ …and it is takeable back in one press
    h.press(h.field(`cleanup-undo-${KIND}`));
    await h.flush();
    expect(undone).toBe(1);
  });

  it("the gate refuses in its own right", () => {
    cover("adminui-quick-approval");
    expect(confirmGate(null).allowed).toBe(false);
    expect(confirmGate(disablePreview(KIND, [], 3)).allowed).toBe(false); // nothing to remove
    expect(confirmGate(disablePreview(KIND, [{ id: "a", name: "a" }], 1)).allowed).toBe(false);
  });
});

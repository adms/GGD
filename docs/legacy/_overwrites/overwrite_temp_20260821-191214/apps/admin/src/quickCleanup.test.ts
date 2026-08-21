/**
 * 第②區 的移除，⛔ 按不到 —— 除非先預覽 (GH#495).
 *
 * THE ONE CLAIM WORTH A GUARD. Quick Approval's 一鍵送出確認 is safe to press
 * without reading because every request it sends carries `disable: []`. 第②區
 * breaks that by design, and the only thing standing between a mis-tap and a
 * deleted hero is: THE CONFIRM DOES NOT EXIST UNTIL A PREVIEW HAS BEEN SEEN.
 *
 * So this drives the REAL card (headless React, no DOM): it presses the real
 * buttons and asserts on WHAT THE ACTION RECEIVED — not on the page's source.
 * Mutation: render the confirm outside `preview !== null` in QuickCleanupSection
 * → the first two assertions go red.
 */
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { cover } from "@ggd/shared/testkit/cover";
import { mount } from "./testkit/headlessUi";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("./testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

const { QuickCleanupSection } = await import("./ui/QuickCleanupSection");
const { cleanupWriteRequest, confirmGate, disablePreview } = await import("./quickCleanup");
const KIND = "undeclared-champions";

describe("第②區：移除一定經過預覽", () => {
  it("no preview ⇒ no confirm button, and the action is never entered", async () => {
    cover("adminui-quick-approval");
    const seen: unknown[] = [];
    let undone = 0;
    const h = mount(
      createElement(QuickCleanupSection, {
        busy: false,
        actions: [
          {
            kind: KIND,
            blurb: "測試用",
            unavailable: null,
            preview: () =>
              Promise.resolve(disablePreview(KIND, [{ id: "extra", name: "多出來的" }], 3)),
            run: (p) => {
              seen.push(p);
              return Promise.resolve({
                text: "已下架",
                undo: () => {
                  undone++;
                  return Promise.resolve("加回去了");
                },
              });
            },
          },
        ],
      }),
    );

    // ① the door does not exist yet
    expect(h.fieldOrNull(`cleanup-confirm-${KIND}`)).toBeNull();
    expect(seen).toEqual([]);

    // ② preview names every item — 名字 + id, because 「移除 <一串英數 id>」 is
    //    not something an operator can meaningfully agree to
    h.press(h.field(`cleanup-preview-${KIND}`));
    await h.flush();
    expect(h.text()).toContain("多出來的");
    expect(h.text()).toContain("extra");

    // ③ only now, and it hands the action THE PREVIEWED SET — not a recomputed one
    h.press(h.field(`cleanup-confirm-${KIND}`));
    await h.flush();
    expect(seen).toHaveLength(1);
    expect(cleanupWriteRequest(seen[0] as ReturnType<typeof disablePreview>)).toEqual({
      kind: "champions",
      enable: [],
      disable: ["extra"],
    });

    // ④ and the removal is takeable back in one press
    h.press(h.field(`cleanup-undo-${KIND}`));
    await h.flush();
    expect(undone).toBe(1);
  });

  it("the gate refuses a missing preview in its own right", () => {
    cover("adminui-quick-approval");
    expect(confirmGate(null).allowed).toBe(false);
    expect(confirmGate(disablePreview(KIND, [], 3)).allowed).toBe(false); // nothing to remove
    expect(confirmGate(disablePreview(KIND, [{ id: "a", name: "a" }], 1)).allowed).toBe(false); // would empty
  });
});

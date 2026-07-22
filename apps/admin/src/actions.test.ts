/** adminui-action-machines: the ban / M COIN action flow — confirm → busy →
 * done/error — surfaces the API error envelope (success / 403 / 404). */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { ApiError } from "./session";
import { beginConfirm, cancel, executeConfirmed, idle, runAdminAction } from "./actions";

describe("action state machines (adminui-action-machines)", () => {
  it("confirm → cancel returns to idle", () => {
    cover("adminui-action-machines");
    const c = beginConfirm("ban", "acct-1", "Ban Shadow");
    expect(c).toEqual({ phase: "confirm", confirm: { kind: "ban", targetId: "acct-1", label: "Ban Shadow" } });
    expect(cancel()).toBe(idle);
  });

  it("runAdminAction resolves ok on success", async () => {
    cover("adminui-action-machines");
    expect(await runAdminAction(async () => ({ mcoin: 500 }))).toEqual({ ok: true });
  });

  it("runAdminAction surfaces a 403 admin_required from the envelope", async () => {
    cover("adminui-action-machines");
    const res = await runAdminAction(async () => {
      throw new ApiError(403, "admin_required", "admin role required");
    });
    expect(res).toEqual({ ok: false, code: "admin_required", message: "admin role required" });
  });

  it("runAdminAction surfaces a 404 not_found", async () => {
    cover("adminui-action-machines");
    const res = await runAdminAction(async () => {
      throw new ApiError(404, "not_found", "account not found");
    });
    expect(res).toEqual({ ok: false, code: "not_found", message: "account not found" });
  });

  it("executeConfirmed advances confirm → done on success and → error on ApiError", async () => {
    cover("adminui-action-machines");
    const confirm = beginConfirm("mcoin", "acct-2", "Grant 500");
    const done = await executeConfirmed(confirm, async () => undefined, "Granted 500 M COIN");
    expect(done).toEqual({ phase: "done", message: "Granted 500 M COIN" });

    const errored = await executeConfirmed(
      confirm,
      async () => {
        throw new ApiError(404, "not_found", "account not found");
      },
      "unused",
    );
    expect(errored).toEqual({ phase: "error", code: "not_found", message: "account not found" });

    // a non-confirm state is returned unchanged
    expect(await executeConfirmed(idle, async () => undefined, "x")).toBe(idle);
  });
});

/**
 * adminui-account-approval — the #126 approval console's classification rules.
 *
 * The bug this whole feature exists to fix was NOT a broken endpoint: the
 * platform's approve/deny/pending routes shipped complete and well tested. What
 * shipped broken was the console's model of them — `AccountRow` had no `status`
 * at all, so every account rendered identically and a relative waiting in the
 * queue was indistinguishable from one who was already playing.
 *
 * So these tests pin the two things that failure was actually made of:
 *   1. NO STATE IS SILENT. Every input — including a missing field and a status
 *      string this console has never heard of — produces a visible badge, and
 *      never the reassuring one.
 *   2. APPROVAL AND BAN ARE SEPARATE AXES. Folding them into one "status" word
 *      is precisely what hid 待審核 behind "active".
 */
import { describe, expect, it } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";

import {
  DENY_VS_BAN,
  STATUS_FILTERS,
  accountBadges,
  approvalState,
  canApprove,
  canDeny,
  pendingBannerText,
  pendingRows,
  shortTime,
  stateBadge,
  summarizeApprovals,
  waitedText,
  type ApprovableAccount,
} from "./approvals";
import type { AccountRow } from "./types";

const ID = "adminui-account-approval";

function row(over: Partial<AccountRow> = {}): AccountRow {
  return {
    id: "acct-1",
    username: "cousin",
    email: "cousin@example.com",
    mmr: 1000,
    games: 0,
    wins: 0,
    mcoin: 0,
    banned: false,
    roles: [],
    createdAt: "2026-07-24T09:00:00Z",
    status: "pending",
    approved: false,
    ...over,
  };
}

describe("approvalState classifies every shape the server can send", () => {
  it("maps the three real statuses", () => {
    cover(ID);
    expect(approvalState({ status: "pending" })).toBe("pending");
    expect(approvalState({ status: "approved" })).toBe("approved");
    expect(approvalState({ status: "denied" })).toBe("denied");
  });

  it('distinguishes "" (grandfathered) from undefined (server never said)', () => {
    cover(ID);
    // Both are falsy and both would collapse to the same thing under a naive
    // `row.status || "approved"` — which is exactly the check that would let an
    // un-approved account render as fine against an older platform build.
    expect(approvalState({ status: "" })).toBe("legacy");
    expect(approvalState({})).toBe("unknown");
    expect(approvalState({ status: undefined })).toBe("unknown");
  });

  it("reports an unrecognised status as unknown rather than guessing", () => {
    cover(ID);
    expect(approvalState({ status: "quarantined" })).toBe("unknown");
    // and the badge for it must not read as approval
    expect(stateBadge("unknown").tone).not.toBe("ok");
  });
});

describe("every state renders a visible, non-blank badge", () => {
  it("no state produces an empty label", () => {
    cover(ID);
    for (const s of ["pending", "approved", "denied", "legacy", "unknown"] as const) {
      const b = stateBadge(s);
      expect(b.text.length, s).toBeGreaterThan(0);
      expect(b.emoji.length, s).toBeGreaterThan(0);
      // the hint is what an operator reads before pressing something
      // irreversible-feeling; a bare label is how this got missed
      expect(b.hint.length, s).toBeGreaterThan(10);
    }
  });

  it("only the genuinely-approved states use the reassuring tone", () => {
    cover(ID);
    expect(stateBadge("approved").tone).toBe("ok");
    for (const s of ["pending", "denied", "unknown"] as const) {
      expect(stateBadge(s).tone, s).not.toBe("ok");
    }
  });
});

describe("approval and ban are independent axes", () => {
  it("an approved-but-banned account shows BOTH badges", () => {
    cover(ID);
    const badges = accountBadges(row({ status: "approved", banned: true }));
    expect(badges).toHaveLength(2);
    expect(badges[0]?.text).toBe("已通過");
    expect(badges[1]?.text).toBe("已停權");
  });

  it("a pending account is never labelled active just because it is not banned", () => {
    cover(ID);
    // THE ORIGINAL BUG, as an assertion: the old table said banned-or-active,
    // so a pending relative read as a normal player.
    const badges = accountBadges(row({ status: "pending", banned: false }));
    expect(badges.map((b) => b.text)).toEqual(["待審核"]);
  });

  it("banning does not change the approval half, and vice versa", () => {
    cover(ID);
    expect(approvalState(row({ status: "pending", banned: true }))).toBe("pending");
    expect(accountBadges(row({ status: "denied", banned: true })).map((b) => b.text)).toEqual([
      "已婉拒",
      "已停權",
    ]);
  });

  it("婉拒 and 停權 are described as different actions with different audiences", () => {
    cover(ID);
    expect(DENY_VS_BAN.deny.label).not.toBe(DENY_VS_BAN.ban.label);
    expect(DENY_VS_BAN.deny.who).not.toBe(DENY_VS_BAN.ban.who);
    expect(DENY_VS_BAN.deny.effect).not.toBe(DENY_VS_BAN.ban.effect);
  });
});

describe("which actions a row admits", () => {
  it("pending can be approved or denied", () => {
    cover(ID);
    const r: ApprovableAccount = { status: "pending" };
    expect(canApprove(r)).toBe(true);
    expect(canDeny(r)).toBe(true);
  });

  it("approving a denied account is the undo, so it stays offered", () => {
    cover(ID);
    expect(canApprove({ status: "denied" })).toBe(true);
    expect(canDeny({ status: "denied" })).toBe(false);
  });

  it("an approved account offers no second approve", () => {
    cover(ID);
    expect(canApprove({ status: "approved" })).toBe(false);
    expect(canDeny({ status: "approved" })).toBe(true);
  });

  it("a grandfathered account can still have access taken away", () => {
    cover(ID);
    expect(canDeny({ status: "" })).toBe(true);
  });

  it("an unreadable state offers NOTHING — a button whose effect we cannot predict is worse than none", () => {
    cover(ID);
    expect(canApprove({})).toBe(false);
    expect(canDeny({})).toBe(false);
  });
});

describe("queue helpers", () => {
  it("pendingRows keeps only who is actually waiting", () => {
    cover(ID);
    const rows = [
      row({ id: "a", status: "pending" }),
      row({ id: "b", status: "approved" }),
      row({ id: "c", status: "denied" }),
      row({ id: "d", status: "pending" }),
    ];
    expect(pendingRows(rows).map((r) => r.id)).toEqual(["a", "d"]);
  });

  it("summarizeApprovals counts each bucket, unknown included", () => {
    cover(ID);
    const s = summarizeApprovals([
      { status: "pending" },
      { status: "pending" },
      { status: "approved" },
      { status: "denied" },
      { status: "" },
      {},
    ]);
    expect(s).toEqual({ pending: 2, approved: 1, denied: 1, other: 2 });
  });

  it("the banner says nothing when the queue is empty or unknown", () => {
    cover(ID);
    expect(pendingBannerText(0)).toBe("");
    expect(pendingBannerText(-1)).toBe("");
    expect(pendingBannerText(3)).toContain("3");
  });

  it("the status filters cover every actionable state and default to 全部", () => {
    cover(ID);
    expect(STATUS_FILTERS[0]?.value).toBe("");
    expect(STATUS_FILTERS.map((f) => f.value)).toContain("pending");
    expect(STATUS_FILTERS.map((f) => f.value)).toContain("denied");
  });
});

describe("waitedText — the queue's ordering, made legible", () => {
  const now = new Date("2026-07-24T12:00:00Z");

  it("scales from minutes to days", () => {
    cover(ID);
    expect(waitedText("2026-07-24T11:59:40Z", now)).toBe("剛剛註冊");
    expect(waitedText("2026-07-24T11:45:00Z", now)).toBe("等了 15 分鐘");
    expect(waitedText("2026-07-24T09:00:00Z", now)).toBe("等了 3 小時");
    expect(waitedText("2026-07-22T09:00:00Z", now)).toBe("等了 2 天");
  });

  it("never throws or renders NaN on a bad timestamp", () => {
    cover(ID);
    expect(waitedText("", now)).toBe("—");
    expect(waitedText("not a date", now)).toBe("—");
    // clock skew between the platform host and the operator's phone must not
    // produce "等了 -1 分鐘"
    expect(waitedText("2026-07-24T12:05:00Z", now)).toBe("剛剛");
  });

  it("shortTime degrades to an em-dash rather than Invalid Date", () => {
    cover(ID);
    expect(shortTime("nope")).toBe("—");
    expect(shortTime("2026-07-24T09:05:00Z")).toMatch(/^2026\/07\/24 \d{2}:05$/);
  });
});

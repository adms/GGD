import { describe, expect, it } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";

import {
  FALLBACK_LIMITS,
  canRevoke,
  defaultRegisterUrl,
  expiryText,
  filterBySource,
  inviteMessage,
  normalizeInvitePayload,
  parseMint,
  statusLabel,
  summarize,
  type InviteRow,
} from "./invites";

function row(over: Partial<InviteRow> = {}): InviteRow {
  return {
    code: "GGD-7K2M-9QXA",
    note: "媽媽",
    status: "active",
    effectiveStatus: "active",
    source: "admin",
    createdBy: "acct-owner",
    createdAt: "2026-07-23T10:00:00Z",
    expiresAt: "2026-08-06T10:00:00Z",
    redeemedBy: "",
    redeemedUsername: "",
    redeemedAt: "",
    revokedBy: "",
    revokedAt: "",
    ...over,
  };
}

describe("normalizeInvitePayload", () => {
  it("survives a malformed / empty body without throwing", () => {
    for (const bad of [null, undefined, 0, "nope", {}, { invites: "no" }]) {
      const p = normalizeInvitePayload(bad);
      expect(p.invites).toEqual([]);
      expect(p.minted).toEqual([]);
      expect(p.limits).toEqual(FALLBACK_LIMITS);
    }
  });

  it("keeps the server's limits so the form cannot offer what the validator refuses", () => {
    const p = normalizeInvitePayload({
      invites: [],
      limits: { maxNoteRunes: 12, maxBatch: 4, defaultTtlDays: 30, minTtlDays: 2, maxTtlDays: 60 },
    });
    expect(p.limits).toEqual({ maxNoteRunes: 12, maxBatch: 4, defaultTtlDays: 30, minTtlDays: 2, maxTtlDays: 60 });
  });

  it("drops rows with no code and falls back to status when effectiveStatus is absent", () => {
    const p = normalizeInvitePayload({
      invites: [{ code: "" }, { code: "GGD-2345-6789", status: "redeemed" }],
    });
    expect(p.invites).toHaveLength(1);
    expect(p.invites[0]?.effectiveStatus).toBe("redeemed");
  });

  it("reads the minted list off a mint response", () => {
    const p = normalizeInvitePayload({ minted: [row()], invites: [row()] });
    expect(p.minted.map((r) => r.code)).toEqual(["GGD-7K2M-9QXA"]);
  });
});

describe("status presentation", () => {
  it("names all four states in 繁體中文", () => {
    expect(statusLabel("active").text).toBe("未使用");
    expect(statusLabel("redeemed").text).toBe("已使用");
    expect(statusLabel("expired").text).toBe("已過期");
    expect(statusLabel("revoked").text).toBe("已撤銷");
  });

  it("only an unused code can be revoked", () => {
    expect(canRevoke(row())).toBe(true);
    expect(canRevoke(row({ effectiveStatus: "expired" }))).toBe(true);
    expect(canRevoke(row({ effectiveStatus: "redeemed" }))).toBe(false);
    expect(canRevoke(row({ effectiveStatus: "revoked" }))).toBe(false);
  });

  it("answers the owner's actual question about expiry", () => {
    const now = new Date("2026-07-23T10:00:00Z");
    expect(expiryText("2026-07-30T10:00:00Z", now)).toBe("剩 7 天");
    expect(expiryText("2026-07-23T18:00:00Z", now)).toBe("今天到期");
    expect(expiryText("2026-07-22T10:00:00Z", now)).toBe("已過期");
    expect(expiryText("", now)).toBe("—");
  });

  it("counts by state for the panel header", () => {
    expect(
      summarize([
        row(),
        row({ effectiveStatus: "redeemed" }),
        row({ effectiveStatus: "revoked" }),
        row({ effectiveStatus: "expired" }),
      ]),
    ).toEqual({ active: 1, redeemed: 1, dead: 2, admin: 4, referral: 0 });
  });

  // adminui-invites-source: the #246 來源 split. The list has been a MIXED feed
  // since #203 — one auto-minted personal referral code per registration,
  // interleaved newest-first with the operator's own — so the console has to be
  // able to tell them apart and say how many of each there are.
  it("counts admin vs referral rows so the header can state what is filtered", () => {
    cover("adminui-invites-source");
    const s = summarize([row(), row({ source: "referral" }), row({ source: "referral" })]);
    expect(s.admin).toBe(1);
    expect(s.referral).toBe(2);
    // the pre-existing three are untouched — this ADDED fields, never replaced any
    expect(s.active).toBe(3);
  });
});

describe("filterBySource (adminui-invites-source)", () => {
  const rows = [
    row({ code: "GGD-AAAA-1111", source: "admin" }),
    row({ code: "GGD-BBBB-2222", source: "referral" }),
    // an older server build that predates the source tag
    row({ code: "GGD-CCCC-3333", source: "" }),
  ];

  it("empty filter is a no-op — nothing is ever removed, only hidden from a view", () => {
    cover("adminui-invites-source");
    expect(filterBySource(rows, "")).toHaveLength(3);
  });

  it("referral matches only the tagged rows", () => {
    cover("adminui-invites-source");
    expect(filterBySource(rows, "referral").map((r) => r.code)).toEqual(["GGD-BBBB-2222"]);
  });

  it("an UNTAGGED row counts as admin — the direction that cannot hide the owner's own codes", () => {
    cover("adminui-invites-source");
    expect(filterBySource(rows, "admin").map((r) => r.code)).toEqual(["GGD-AAAA-1111", "GGD-CCCC-3333"]);
  });

  it("every row is reachable: the two source views partition the list exactly", () => {
    cover("adminui-invites-source");
    const admin = filterBySource(rows, "admin");
    const referral = filterBySource(rows, "referral");
    expect(admin.length + referral.length).toBe(rows.length);
  });
});

describe("parseMint", () => {
  const L = FALLBACK_LIMITS;

  it("requires a 備註 — a list of random strings is useless without one", () => {
    expect(parseMint({ note: "   ", count: 1, ttlDays: 14 }, L)).toEqual({
      ok: false,
      error: expect.stringContaining("備註"),
    });
  });

  it("counts 備註 by CHARACTER, not by byte (中文 must not be penalised)", () => {
    const forty = "字".repeat(40);
    expect(parseMint({ note: forty, count: 1, ttlDays: 14 }, L).ok).toBe(true);
    expect(parseMint({ note: forty + "字", count: 1, ttlDays: 14 }, L).ok).toBe(false);
  });

  it("enforces the SERVER's batch and ttl bounds", () => {
    expect(parseMint({ note: "n", count: 0, ttlDays: 14 }, L).ok).toBe(false);
    expect(parseMint({ note: "n", count: L.maxBatch + 1, ttlDays: 14 }, L).ok).toBe(false);
    expect(parseMint({ note: "n", count: 1, ttlDays: 0 }, L).ok).toBe(false);
    expect(parseMint({ note: "n", count: 1, ttlDays: L.maxTtlDays + 1 }, L).ok).toBe(false);
    expect(parseMint({ note: "n", count: 1.5, ttlDays: 14 }, L).ok).toBe(false);

    const tight = { ...L, maxBatch: 3 };
    expect(parseMint({ note: "n", count: 4, ttlDays: 14 }, tight)).toEqual({
      ok: false,
      error: expect.stringContaining("3"),
    });
  });

  it("trims the note it returns", () => {
    const r = parseMint({ note: "  大表哥  ", count: 12, ttlDays: 30 }, L);
    expect(r).toEqual({ ok: true, value: { note: "大表哥", count: 12, ttlDays: 30 } });
  });
});

describe("the message the owner actually sends", () => {
  it("carries the URL, the code, the expiry and the single-use rule", () => {
    const msg = inviteMessage(row(), "https://ggd.example.com/");
    expect(msg).toContain("GGD-7K2M-9QXA");
    expect(msg).toContain("https://ggd.example.com/");
    expect(msg).toContain("一次");
    expect(msg).toContain("邀請碼");
  });

  it("points at the game, not at the console's own dev port", () => {
    expect(defaultRegisterUrl("http://192.168.1.20:60721")).toBe("http://192.168.1.20:39527/");
    expect(defaultRegisterUrl("https://ggd.example.com")).toBe("https://ggd.example.com/");
    expect(defaultRegisterUrl("")).toBe("");
  });
});

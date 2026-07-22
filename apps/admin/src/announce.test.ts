/** adminui-announcement-form: draft validation (title required, length caps)
 * and the active toggle. */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { draftFrom, emptyDraft, toggleActive, validateDraft } from "./announce";
import type { Announcement } from "./types";

describe("announcement form (adminui-announcement-form)", () => {
  it("requires a non-blank title", () => {
    cover("adminui-announcement-form");
    expect(validateDraft(emptyDraft).ok).toBe(false);
    expect(validateDraft({ ...emptyDraft, title: "   " }).errors.title).toBeTruthy();
    expect(validateDraft({ ...emptyDraft, title: "Season 2" }).ok).toBe(true);
  });

  it("caps title and body length", () => {
    cover("adminui-announcement-form");
    expect(validateDraft({ ...emptyDraft, title: "x".repeat(141) }).errors.title).toContain("140");
    expect(validateDraft({ ...emptyDraft, title: "ok", body: "y".repeat(4001) }).errors.body).toContain("4000");
  });

  it("toggleActive flips immutably", () => {
    cover("adminui-announcement-form");
    const d = { ...emptyDraft, active: true };
    const t = toggleActive(d);
    expect(t.active).toBe(false);
    expect(d.active).toBe(true); // original untouched
  });

  it("draftFrom seeds edit mode from an existing announcement", () => {
    cover("adminui-announcement-form");
    const a: Announcement = {
      id: "ann-1",
      title: "Maintenance",
      body: "Down at 3am",
      active: false,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    };
    expect(draftFrom(a)).toEqual({ id: "ann-1", title: "Maintenance", body: "Down at 3am", active: false });
  });
});

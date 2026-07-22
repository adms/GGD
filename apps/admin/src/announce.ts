/** Announcement form model — pure draft state + validation, unit-tested. */
import type { Announcement } from "./types";

export interface AnnouncementDraft {
  id: string | null; // null = new
  title: string;
  body: string;
  active: boolean;
}

export const emptyDraft: AnnouncementDraft = { id: null, title: "", body: "", active: true };

/** Seed a draft from an existing announcement (edit mode). */
export function draftFrom(a: Announcement): AnnouncementDraft {
  return { id: a.id, title: a.title, body: a.body, active: a.active };
}

export interface DraftValidation {
  ok: boolean;
  errors: { title?: string; body?: string };
}

/** Validate a draft: a non-blank title is required; body is optional but
 * capped so an operator can't paste unbounded content. */
export function validateDraft(d: AnnouncementDraft): DraftValidation {
  const errors: { title?: string; body?: string } = {};
  if (d.title.trim() === "") errors.title = "Title is required";
  else if (d.title.length > 140) errors.title = "Title must be ≤ 140 characters";
  if (d.body.length > 4000) errors.body = "Body must be ≤ 4000 characters";
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Toggle the active flag immutably. */
export function toggleActive(d: AnnouncementDraft): AnnouncementDraft {
  return { ...d, active: !d.active };
}

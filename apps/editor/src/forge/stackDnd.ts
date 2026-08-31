import type { AbilityTemplateCard } from "@ggd/shared/content";

/** Private MIME keeps ordinary text/URL drags from becoming template cards. */
export const TEMPLATE_STACK_DRAG_MIME = "application/x-ggd-template-stack-card";

export type TemplateStackDragPayload =
  | { readonly kind: "catalog-template"; readonly templateId: string }
  | { readonly kind: "stack-card"; readonly index: number };

export function encodeTemplateStackDrag(payload: TemplateStackDragPayload): string {
  return JSON.stringify(payload);
}

/** Browser drag payloads are untrusted; malformed or extra-shaped input is ignored. */
export function decodeTemplateStackDrag(raw: string): TemplateStackDragPayload | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const exactTwoFields = typeof value === "object" && value !== null && Object.keys(value).length === 2;
    if (
      exactTwoFields &&
      value["kind"] === "catalog-template" &&
      typeof value["templateId"] === "string" &&
      value["templateId"].length > 0
    ) {
      return { kind: "catalog-template", templateId: value["templateId"] };
    }
    if (
      exactTwoFields &&
      value["kind"] === "stack-card" &&
      Number.isInteger(value["index"]) &&
      (value["index"] as number) >= 0
    ) {
      return { kind: "stack-card", index: value["index"] as number };
    }
  } catch {
    // Invalid JSON is the normal result when another app is dragged over us.
  }
  return null;
}

/** Insert before `at`; clamps the slot and honours the shared stack ceiling. */
export function insertTemplateCard(
  cards: readonly AbilityTemplateCard[],
  card: AbilityTemplateCard,
  at: number,
  maxCards: number,
): AbilityTemplateCard[] {
  if (cards.length >= maxCards) return [...cards];
  const slot = Math.max(0, Math.min(cards.length, Math.trunc(at)));
  return [...cards.slice(0, slot), card, ...cards.slice(slot)];
}

/** Move one existing card to an insertion slot (0..length), preserving identity. */
export function moveTemplateCard(
  cards: readonly AbilityTemplateCard[],
  from: number,
  at: number,
): AbilityTemplateCard[] {
  if (!Number.isInteger(from) || from < 0 || from >= cards.length) return [...cards];
  const slot = Math.max(0, Math.min(cards.length, Math.trunc(at)));
  const next = [...cards];
  const [card] = next.splice(from, 1);
  if (!card) return [...cards];
  const adjusted = slot > from ? slot - 1 : slot;
  next.splice(adjusted, 0, card);
  return next;
}

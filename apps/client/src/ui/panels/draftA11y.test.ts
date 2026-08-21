/**
 * rr-15..rr-18 (draft-a11y, task #265 / owner's #252): 「三選一卡片沒有無障礙名稱 ——
 * 手把焦點停上去沒東西可念」.
 *
 * ── WHY THIS SCANS INSTEAD OF ASSERTING THREE CARDS ─────────────────────────
 * A test that checks "the silver augment card has a name" passes forever and
 * catches nothing: the next 三選一 flavour is added by widening
 * `OfferState.tier`, and it inherits whatever markup the panel happens to have
 * that week. So this walks the RENDERED MARKUP of the whole modal family — one
 * offer per tier the panel serves (silver / gold / prismatic augments, the
 * legendary WEAPON round and the 傳說寶珠 gacha, which projects as `weapon`) —
 * finds EVERY focusable element in it, computes each one's accessible name the
 * way an AT would, and fails on the first empty one.
 *
 * What "focusable" means is not re-typed either: the selector list is read out
 * of `ui/PadFocusNav.tsx`, the file that actually decides what a gamepad can
 * land on. Widen that list and this guard widens with it.
 *
 * The client's vitest runs in the `node` env, so there is no DOM and no
 * `Element.computedName`. Both are replaced here: `react-dom/server` produces
 * the real markup (the same approach `MerchantShop.test.ts` uses for the shop
 * portrait) and the small parser below implements the slice of the accname
 * algorithm this markup can exercise — aria-label, then aria-labelledby with id
 * resolution, then name-from-contents, with `aria-hidden` subtrees excluded
 * exactly as the spec (and `GlyphTile`) require.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { Augments, Items } from "@ggd/shared/sim/content/registry";
import type { AugmentId, ItemId } from "@ggd/shared/ids";
import type { AugmentDef, ItemDef } from "@ggd/shared/sim/content/defs";
import { DraftOffer } from "./AugmentDraftPanel";
import { tierLabel } from "./draftCardStyle";
import {
  draftChoiceSuffix,
  draftCardDescId,
  draftCardLabelledBy,
  draftCardNameId,
  draftDialogLabel,
  draftDialogLabelId,
} from "./draftA11y";

// One beacon per TODO row (docs/todo/round-report.md).
const SCAN = "draft-a11y-scan";
const EXPLICIT = "draft-a11y-explicit";
const NAME_ORDER = "draft-a11y-name-order";
const DIALOG = "draft-a11y-dialog";

const readUi = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

/* ─────────────────────────── a tiny HTML reader ─────────────────────────── */

interface Node {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
  text: string;
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([:@a-zA-Z_][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const m of raw.matchAll(re)) {
    out[m[1]!.toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

/** Parse static markup into a forest. Adequate for react-dom/server output. */
function parseHtml(html: string): Node[] {
  const token =
    /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  const roots: Node[] = [];
  const stack: Node[] = [];
  const push = (n: Node): void => {
    (stack.length > 0 ? stack[stack.length - 1]!.children : roots).push(n);
  };
  for (const m of html.matchAll(token)) {
    if (m[0].startsWith("<!--")) continue;
    if (m[1] !== undefined) {
      // closing tag
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]!.tag === m[1].toLowerCase()) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    if (m[2] !== undefined) {
      const node: Node = {
        tag: m[2].toLowerCase(),
        attrs: parseAttrs(m[3] ?? ""),
        children: [],
        text: "",
      };
      push(node);
      if (m[4] !== "/" && !VOID_TAGS.has(node.tag)) stack.push(node);
      continue;
    }
    if (m[5] !== undefined && m[5].trim() !== "") {
      push({ tag: "#text", attrs: {}, children: [], text: decode(m[5]) });
    }
  }
  return roots;
}

function walk(nodes: readonly Node[], visit: (n: Node) => void): void {
  for (const n of nodes) {
    visit(n);
    walk(n.children, visit);
  }
}

function idMap(roots: readonly Node[]): Map<string, Node> {
  const out = new Map<string, Node>();
  walk(roots, (n) => {
    if (n.attrs.id) out.set(n.attrs.id, n);
  });
  return out;
}

/** Visible text, with `aria-hidden` subtrees and non-rendered tags excluded. */
function textOf(node: Node): string {
  if (node.tag === "#text") return node.text;
  if (node.attrs["aria-hidden"] === "true") return "";
  if (node.tag === "style" || node.tag === "script") return "";
  return node.children.map(textOf).join("");
}

/**
 * The accname subset this markup can exercise, in SPEC ORDER:
 * aria-labelledby (ids resolved against the document) → aria-label → name from
 * contents → title. `aria-labelledby` first is not a detail: it is what makes
 * the announced name the DRAWN one, with `aria-label` only a fallback for
 * readers that do not implement it.
 */
function accessibleName(node: Node, ids: Map<string, Node>): string {
  const lb = (node.attrs["aria-labelledby"] ?? "").trim();
  if (lb !== "") {
    return lb
      .split(/\s+/)
      .map((id) => {
        const target = ids.get(id);
        // A DANGLING reference is worse than no label: the element ends up with
        // an empty computed name and nothing warns you.
        return target === undefined ? "" : textOf(target);
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const label = (node.attrs["aria-label"] ?? "").trim();
  if (label !== "") return label;
  const contents = textOf(node).replace(/\s+/g, " ").trim();
  if (contents !== "") return contents;
  return (node.attrs.title ?? "").trim();
}

/**
 * The name a reader that implements NEITHER `aria-labelledby` NOR
 * name-from-contents across nested elements would compute. Measured against
 * this repo's own browser tooling (see draftA11y.ts) — that reader exists, and
 * a card carrying only `aria-labelledby` shows up in it as an unnamed button,
 * which is indistinguishable from the bug.
 */
function flatFallbackName(node: Node): string {
  return (node.attrs["aria-label"] ?? "").trim();
}

/* ─────────── what "focusable" means, read from the pad focus layer ───────── */

/** The selector strings in PadFocusNav's FOCUSABLE_SELECTOR, in source order. */
function padFocusableSelectors(): string[] {
  const src = readUi("../PadFocusNav.tsx");
  const block = /const FOCUSABLE_SELECTOR\s*=\s*\[([\s\S]*?)\]\s*\.join/.exec(src);
  expect(
    block,
    "could not find FOCUSABLE_SELECTOR in ui/PadFocusNav.tsx — re-point this guard rather " +
      "than deleting it; it is what keeps 'focusable' from being re-typed here",
  ).not.toBeNull();
  // delimiter-aware: one entry is single-quoted BECAUSE it contains a "
  return [...block![1]!.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]!);
}

const FOCUSABLE_TAGS = new Set(["a", "button", "input", "select", "textarea"]);

function isFocusable(n: Node): boolean {
  if (n.attrs.disabled !== undefined) return false;
  if (n.tag === "a") return n.attrs.href !== undefined;
  if (n.tag === "input") return n.attrs.type !== "hidden";
  if (FOCUSABLE_TAGS.has(n.tag)) return true;
  if (n.attrs["data-pad-focusable"] !== undefined) return true;
  const ti = n.attrs.tabindex;
  return ti !== undefined && ti !== "-1";
}

/* ───────────────────────────── the fixtures ─────────────────────────────── */

const AUG = (id: string, name: string, desc: string, tier: string): AugmentDef =>
  ({
    id: id as AugmentId,
    name,
    description: desc,
    tier,
    weight: 1,
    tags: [],
  }) as unknown as AugmentDef;

const AUGMENTS: ReadonlyArray<readonly [string, string, string]> = [
  ["tp-a11y-aug-1", "鐵壁", "每回合開始獲得 12 點護甲"],
  ["tp-a11y-aug-2", "疾風之靴", "移動速度提高 8%"],
  ["tp-a11y-aug-3", "嗜血", "普攻吸血 6%"],
];

const WEAPON_ID = "tp-a11y-weapon" as ItemId;

beforeAll(() => {
  for (const [id, name, desc] of AUGMENTS) Augments.register(id as AugmentId, AUG(id, name, desc, "silver"));
  Items.register(WEAPON_ID, {
    id: WEAPON_ID,
    name: "測試傳說武器",
    cost: 1200,
    tags: ["wc3-import"],
    modifiers: [],
  } as unknown as ItemDef);
});

/** Every tier the ONE panel serves (its own header lists them). */
const TIERS = ["silver", "gold", "prismatic", "weapon"] as const;

function renderOffer(tier: string, choices: readonly string[]): string {
  return renderToStaticMarkup(
    createElement(DraftOffer, {
      offer: { offerId: `offer/${tier}#1`, tier, choices: [...choices] },
    }),
  );
}

function choicesFor(tier: string): string[] {
  return tier === "weapon"
    ? [WEAPON_ID, AUGMENTS[1]![0], AUGMENTS[2]![0]]
    : AUGMENTS.map(([id]) => id);
}

/* ══════════════════════════════ the guard ════════════════════════════════ */

describe("the 三選一 modal family has accessible names (rr-15..rr-18)", () => {
  it("KNOWN SET: PadFocusNav still decides focus with the selectors this guard mirrors", () => {
    cover(SCAN);
    expect(padFocusableSelectors()).toEqual([
      // ⚠️ 2026-08-22（#505/K3）拿掉了 `:not([disabled])` —— 停用的控制項現在
      // **聚焦得到但按不動**（買不起的造型／英雄本來整列對手把隱形）。
      "a[href]",
      "button",
      "input:not([type=hidden])",
      "select",
      "textarea",
      '[tabindex]:not([tabindex="-1"])',
      "[data-pad-focusable]",
    ]);
  });

  it("SCAN: every focusable element in every tier's offer has a non-empty name", () => {
    cover(SCAN);
    const problems: string[] = [];
    let scanned = 0;
    for (const tier of TIERS) {
      const roots = parseHtml(renderOffer(tier, choicesFor(tier)));
      const ids = idMap(roots);
      walk(roots, (n) => {
        if (!isFocusable(n)) return;
        scanned += 1;
        const name = accessibleName(n, ids);
        if (name === "") {
          problems.push(
            `tier "${tier}": a <${n.tag}> is focusable but has NO accessible name — ` +
              `a pad or screen reader lands on it with nothing to announce ` +
              `(attrs: ${JSON.stringify(n.attrs)})`,
          );
        }
      });
    }
    expect(problems).toEqual([]);
    // non-vacuous: three cards per tier really were scanned
    expect(scanned).toBe(TIERS.length * 3);
  });

  it("SCAN: every focusable element declares its name EXPLICITLY, not by accident", () => {
    cover(EXPLICIT);
    // The stronger half of the guard, and the one that would have failed on the
    // pre-#265 markup. Those cards were not literally silent — the browser
    // could still build a name from their contents — but that name was an
    // ACCIDENT of two unlabelled sibling divs: it has no declared separator (so
    // 「鐵壁」 and its effect line can run together depending on the engine), it
    // silently changes shape whenever anyone adds a badge or a cost chip inside
    // the card, and nothing anywhere said the panel was a dialog. Requiring an
    // explicit source is what makes the next 三選一 flavour fail loudly instead
    // of inheriting whatever the markup happened to concatenate that week.
    const problems: string[] = [];
    for (const tier of TIERS) {
      const roots = parseHtml(renderOffer(tier, choicesFor(tier)));
      walk(roots, (n) => {
        if (!isFocusable(n)) return;
        const explicit =
          (n.attrs["aria-label"] ?? "").trim() !== "" ||
          (n.attrs["aria-labelledby"] ?? "").trim() !== "";
        if (!explicit) {
          problems.push(
            `tier "${tier}": <${n.tag}> relies on name-from-contents. Point it at the nodes it ` +
              `already renders with aria-labelledby (see draftA11y.ts) so the announced name is ` +
              `the drawn one and cannot drift.`,
          );
        }
      });
    }
    expect(problems).toEqual([]);
  });

  it("SCAN: the flat fallback name is non-empty too, and says the same thing", () => {
    cover(EXPLICIT);
    // Spec order puts `aria-labelledby` first, so this is never what a compliant
    // screen reader speaks. It is what a NAIVE tree walker speaks — and one of
    // those is this repo's own browser snapshot, where a labelledby-only card
    // reads as an unnamed button. Both attributes are built from the same two
    // expressions, so this also pins that they cannot drift apart.
    const problems: string[] = [];
    for (const tier of TIERS) {
      const roots = parseHtml(renderOffer(tier, choicesFor(tier)));
      const ids = idMap(roots);
      walk(roots, (n) => {
        if (n.tag !== "button") return;
        const flat = flatFallbackName(n);
        if (flat === "") {
          problems.push(`tier "${tier}": a card has no flat fallback name`);
          return;
        }
        const spoken = accessibleName(n, ids);
        // same characters, same order — modulo whitespace collapsing
        if (flat.replace(/\s+/g, " ") !== spoken.replace(/\s+/g, " ")) {
          problems.push(
            `tier "${tier}": the fallback name 「${flat}」 and the spoken name 「${spoken}」 ` +
              `have drifted apart — both must come from the same two expressions`,
          );
        }
      });
    }
    expect(problems).toEqual([]);
  });

  it("the name is 增益名稱 + 效果摘要, in that order, from the nodes already drawn", () => {
    cover(NAME_ORDER);
    for (const tier of TIERS) {
      const choices = choicesFor(tier);
      const roots = parseHtml(renderOffer(tier, choices));
      const ids = idMap(roots);
      const buttons: Node[] = [];
      walk(roots, (n) => {
        if (n.tag === "button") buttons.push(n);
      });
      expect(buttons.length, tier).toBe(3);
      buttons.forEach((b, idx) => {
        const offerId = `offer/${tier}#1`;
        // it points at the ids this module mints…
        expect(b.attrs["aria-labelledby"], `${tier}/${idx}`).toBe(
          draftCardLabelledBy(offerId, idx),
        );
        // …and BOTH of them resolve (a dangling id computes to an empty name,
        // which is the failure this whole task is about)
        for (const id of [draftCardNameId(offerId, idx), draftCardDescId(offerId, idx)]) {
          expect(ids.has(id), `${tier}/${idx}: unresolved ${id}`).toBe(true);
        }
        const name = accessibleName(b, ids);
        const shownName = textOf(ids.get(draftCardNameId(offerId, idx))!).trim();
        const shownDesc = textOf(ids.get(draftCardDescId(offerId, idx))!).trim();
        expect(shownName).not.toBe("");
        expect(name.startsWith(shownName), `${tier}/${idx}: "${name}"`).toBe(true);
        if (shownDesc !== "") expect(name).toContain(shownDesc);
      });
    }
  });

  it("the icon stays out of the name — GlyphTile is aria-hidden, so it adds nothing", () => {
    cover(NAME_ORDER);
    // the reason name-from-contents alone was never enough
    expect(readUi("../components/GlyphTile.tsx")).toMatch(/aria-hidden/);
    const roots = parseHtml(renderOffer("silver", choicesFor("silver")));
    const ids = idMap(roots);
    const first = (() => {
      let b: Node | null = null;
      walk(roots, (n) => {
        if (b === null && n.tag === "button") b = n;
      });
      return b!;
    })() as Node;
    // the seeded glyph letter never leaks into the announced name
    expect(accessibleName(first, ids)).toBe("鐵壁 每回合開始獲得 12 點護甲");
  });

  it("the offer announces its own tier — the header IS the label node", () => {
    cover(DIALOG);
    for (const tier of TIERS) {
      const roots = parseHtml(renderOffer(tier, choicesFor(tier)));
      const ids = idMap(roots);
      const header = ids.get(draftDialogLabelId(`offer/${tier}#1`));
      expect(header, `${tier}: no dialog label node`).toBeDefined();
      const spoken = textOf(header!).replace(/\s+/g, " ").trim();
      expect(spoken).toBe(draftDialogLabel(tierLabel(tier), tier));
      // ⭐ 後綴跟著**階級**走：三個願望階級唸「聖杯顯現」，
      //    ⛔ 傳說武器唸「三選一」（規則 §1 它屬於裝備層不是願望）。
      expect(`${tier}:${spoken.includes(draftChoiceSuffix(tier))}`).toBe(`${tier}:true`);
    }
  });

  it("the panel itself is a labelled modal dialog", () => {
    cover(DIALOG);
    // The panel reads the store, so its ARIA is asserted at the source: it used
    // to carry no aria attribute at all, which is why opening it announced
    // nothing over the shop it dims.
    const src = readUi("./AugmentDraftPanel.tsx");
    expect(src).toMatch(/role="dialog"/);
    expect(src).toMatch(/aria-modal="true"/);
    expect(src).toMatch(/aria-labelledby=\{offers\.map\(\(o\) => draftDialogLabelId\(o\.offerId\)\)/);
  });

  it("ids survive an opaque server offerId", () => {
    cover(DIALOG);
    // offer ids come from the server and are not guaranteed to be id-safe; a
    // stray quote or space would silently break the reference.
    const weird = 'off er"#1/x';
    for (const id of [draftCardNameId(weird, 0), draftCardDescId(weird, 0), draftDialogLabelId(weird)]) {
      expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
    }
    expect(draftCardLabelledBy(weird, 2)).toBe(
      `${draftCardNameId(weird, 2)} ${draftCardDescId(weird, 2)}`,
    );
  });
});

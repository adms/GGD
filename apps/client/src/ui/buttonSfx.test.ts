/**
 * ui: the shared button feedback — hover/click SFX (buttonSfx), the click
 * ripple visual (spawnClickRipple) and the <SfxButton> wrapper that combines
 * them onto every raw button in the client.
 *
 *   • buttonSfx: hover → "uiHoverCyber"; click → unlock → "uiClick" → original,
 *     IN THAT ORDER; an optional volume attenuates both voices;
 *   • SfxButton renders a <button>, and its click handler fires the sfx +
 *     the caller's onClick (a disabled button stays silent);
 *   • the ripple is skipped under prefers-reduced-motion, and painted (one
 *     self-cleaning <span class="ggd-ripple">) otherwise.
 *
 * Env note: the client vitest runs in a `node` environment (no DOM), so the
 * component is exercised by invoking its composed handlers directly + a
 * react-dom/server static render; the ripple uses injected fake DOM.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { audioSystem } from "../audio";
import { buttonSfx, prefersReducedMotion, rippleEnabled, spawnClickRipple } from "./buttonSfx";
import { SfxButton, type SfxButtonProps } from "./SfxButton";
import { Btn } from "./platform/widgets";

// ---------------------------------------------------------------------------
// audioSystem spies — stub the singleton so no real WebAudio work runs
// ---------------------------------------------------------------------------

let order: string[] = [];
let playSpy: MockInstance<typeof audioSystem.playSfx>;
let unlockSpy: MockInstance<typeof audioSystem.unlock>;

beforeEach(() => {
  order = [];
  playSpy = vi
    .spyOn(audioSystem, "playSfx")
    .mockImplementation((event: string) => {
      order.push(`play:${event}`);
      return true;
    });
  unlockSpy = vi.spyOn(audioSystem, "unlock").mockImplementation(() => {
    order.push("unlock");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// buttonSfx handlers
// ---------------------------------------------------------------------------

describe("buttonSfx: hover + click handlers (ui-button-sfx)", () => {
  it("hover plays uiHoverCyber — the long ring-out, NOT the plain tick (and nothing else)", () => {
    cover("ui-button-sfx");
    buttonSfx().onPointerEnter();
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledWith("uiHoverCyber");
    expect(unlockSpy).not.toHaveBeenCalled();
  });

  it("click unlocks, plays uiClick, then runs the original onClick — in order", () => {
    cover("ui-button-sfx");
    const onClick = vi.fn(() => order.push("orig"));
    buttonSfx(onClick).onClick();
    expect(order).toEqual(["unlock", "play:uiClick", "orig"]);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("a missing onClick is fine (sfx still fires)", () => {
    cover("ui-button-sfx");
    expect(() => buttonSfx().onClick()).not.toThrow();
    expect(order).toEqual(["unlock", "play:uiClick"]);
  });

  it("an sfxVolume attenuates both the hover and the click voice", () => {
    cover("ui-button-sfx");
    const props = buttonSfx(undefined, { volume: 0.5 });
    props.onPointerEnter();
    props.onClick();
    expect(playSpy).toHaveBeenCalledWith("uiHoverCyber", { volume: 0.5 });
    expect(playSpy).toHaveBeenCalledWith("uiClick", { volume: 0.5 });
  });
});

// ---------------------------------------------------------------------------
// SfxButton wrapper
// ---------------------------------------------------------------------------

/** Build the composed props of an SfxButton without a DOM (it renders a <button>). */
function sfxButtonProps(props: SfxButtonProps): Record<string, unknown> {
  const el = SfxButton(props) as unknown as { type: string; props: Record<string, unknown> };
  expect(el.type).toBe("button");
  return el.props;
}

/** Minimal PointerEvent-ish for invoking a handler off the DOM. */
function clickEvt(): { currentTarget: HTMLElement; clientX: number; clientY: number } {
  return { currentTarget: { style: {} } as HTMLElement, clientX: 4, clientY: 6 };
}

describe("SfxButton: renders + fires (ui-button-fx)", () => {
  it("renders a real <button> carrying its children and forwarded props", () => {
    cover("ui-button-fx");
    const html = renderToStaticMarkup(
      createElement(SfxButton, { title: "go", children: "Play" } as SfxButtonProps),
    );
    expect(html).toContain("<button");
    expect(html).toContain('title="go"');
    expect(html).toContain("Play");
  });

  it("firing its click handler unlocks + plays uiClick + runs the caller onClick", () => {
    cover("ui-button-fx");
    const onClick = vi.fn(() => order.push("orig"));
    const props = sfxButtonProps({ onClick });
    (props.onPointerEnter as () => void)();
    (props.onClick as (e: unknown) => void)(clickEvt());
    expect(order).toEqual(["play:uiHoverCyber", "unlock", "play:uiClick", "orig"]);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("a disabled button stays silent and never runs onClick", () => {
    cover("ui-button-fx");
    const onClick = vi.fn();
    const props = sfxButtonProps({ onClick, disabled: true });
    (props.onPointerEnter as () => void)();
    (props.onClick as (e: unknown) => void)(clickEvt());
    expect(playSpy).not.toHaveBeenCalled();
    expect(unlockSpy).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(props.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// reduced-motion + ripple
// ---------------------------------------------------------------------------

interface FakeNode {
  className: string;
  style: Record<string, string>;
  listeners: Record<string, () => void>;
  addEventListener(type: string, cb: () => void): void;
  remove(): void;
}

function fakeDoc(): { created: FakeNode[] } & Pick<Document, "createElement"> {
  const created: FakeNode[] = [];
  return {
    created,
    createElement(_tag: string): FakeNode {
      const node: FakeNode = {
        className: "",
        style: {},
        listeners: {},
        addEventListener(type, cb) {
          this.listeners[type] = cb;
        },
        remove() {},
      };
      created.push(node);
      return node;
    },
  } as never;
}

function fakeHost(): { appended: unknown[] } & Pick<HTMLElement, "getBoundingClientRect" | "appendChild"> {
  const appended: unknown[] = [];
  return {
    appended,
    getBoundingClientRect: () => ({ width: 40, height: 20, left: 0, top: 0 }) as DOMRect,
    appendChild(node: unknown) {
      appended.push(node);
      return node;
    },
  } as never;
}

// ---------------------------------------------------------------------------
// shared JRPG + cyber-glow skin (buttonFx.css)
// ---------------------------------------------------------------------------

const UI_DIR = fileURLToPath(new URL(".", import.meta.url));
const SRC_DIR = resolve(UI_DIR, "..");

function walkSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkSources(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("button skin: shared buttonFx.css (ui-button-skin)", () => {
  it("is imported exactly once across the client source tree", () => {
    cover("ui-button-skin");
    const importRe = /import\s+["'][^"']*buttonFx\.css["']/;
    const importers = walkSources(SRC_DIR).filter((f) => importRe.test(readFileSync(f, "utf8")));
    expect(importers).toHaveLength(1);
    expect(importers[0]!.endsWith("main.tsx")).toBe(true);
  });

  it("defines the base class + a prefers-reduced-motion block", () => {
    cover("ui-button-skin");
    const css = readFileSync(join(UI_DIR, "buttonFx.css"), "utf8");
    expect(css).toContain(".ggd-btn");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    // the flowing cyber gradient + light-leak sheen are present
    expect(css).toContain(".ggd-btn::before");
    expect(css).toContain(".ggd-btn::after");
  });

  it("SfxButton carries .ggd-btn (+ the kind modifier)", () => {
    cover("ui-button-skin");
    const base = renderToStaticMarkup(createElement(SfxButton, { children: "x" } as SfxButtonProps));
    expect(base).toContain('class="ggd-btn"');
    const subdued = renderToStaticMarkup(
      createElement(SfxButton, { kind: "subdued", className: "ggd-tap", children: "x" } as SfxButtonProps),
    );
    expect(subdued).toContain("ggd-btn");
    expect(subdued).toContain("ggd-btn--subdued");
    expect(subdued).toContain("ggd-tap"); // caller className preserved
  });

  it("the shared Btn carries .ggd-btn + its kind modifier", () => {
    cover("ui-button-skin");
    const primary = renderToStaticMarkup(createElement(Btn, { kind: "primary", children: "Play" }));
    expect(primary).toContain("ggd-btn");
    expect(primary).toContain("ggd-btn--primary");
    const ghost = renderToStaticMarkup(createElement(Btn, { children: "Cancel" }));
    expect(ghost).toContain("ggd-btn--ghost"); // default kind
  });
});

describe("button ripple: reduced-motion gate (ui-button-reduced-motion)", () => {
  it("prefersReducedMotion is false in a non-DOM env; rippleEnabled mirrors the flag", () => {
    cover("ui-button-reduced-motion");
    expect(prefersReducedMotion()).toBe(false); // no window/matchMedia in node
    expect(rippleEnabled(true)).toBe(false);
    expect(rippleEnabled(false)).toBe(true);
  });

  it("skips the ripple under reduced-motion — no element is created or appended", () => {
    cover("ui-button-reduced-motion");
    const host = fakeHost();
    const doc = fakeDoc();
    const painted = spawnClickRipple(host as unknown as HTMLElement, 10, 5, {
      reduced: true,
      doc: doc as unknown as Document,
    });
    expect(painted).toBe(false);
    expect(doc.created).toHaveLength(0);
    expect(host.appended).toHaveLength(0);
  });

  it("paints one self-cleaning .ggd-ripple span when motion is allowed", () => {
    cover("ui-button-fx");
    vi.useFakeTimers();
    try {
      const host = fakeHost();
      const doc = fakeDoc();
      const painted = spawnClickRipple(host as unknown as HTMLElement, 10, 5, {
        reduced: false,
        doc: doc as unknown as Document,
      });
      expect(painted).toBe(true);
      expect(doc.created).toHaveLength(1);
      const ripple = doc.created[0]!;
      expect(ripple.className).toBe("ggd-ripple");
      expect(ripple.style.position).toBe("absolute");
      expect(ripple.style.borderRadius).toBe("50%");
      expect(host.appended).toEqual([ripple]);
      // registers an animationend cleanup + a fallback timer that both remove it
      expect(typeof ripple.listeners.animationend).toBe("function");
      const removeSpy = vi.spyOn(ripple, "remove");
      vi.runOnlyPendingTimers();
      expect(removeSpy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * GUARD — every button in the GLOBAL audio cluster speaks (GH#113).
 *
 * `<AudioToggle/>` is mounted unconditionally by ui/GlobalChrome and portaled to
 * <body>, so its three buttons are the most ubiquitous controls in the game. The
 * 🎚 disclosure had no handler beyond a state flip (no hover, no click, no
 * `unlock()`), and 🎵/🔊 were silent on HOVER — they only clicked because the
 * CONTAINER called `playSfx` by hand inside its mute handler.
 *
 * WHY IT READS THE ELEMENT TREE: the client's vitest env is `node`, this
 * component portals to <body>, and static markup shows no handlers at all — a
 * markup assertion stays green with the wiring deleted (失敗形態 ③). So it
 * shallow-renders `AudioToggleView` and reads the handler props off the real
 * JSX. It asserts CUE NAMES, never gains.
 */
import { describe, it, expect, afterEach } from "vitest";
import { audioSystem, type AudioBus } from "../audio";
import { AudioToggleView } from "./AudioToggle";

interface El { type: unknown; props: Record<string, unknown> }

/** Flatten to HOST elements, invoking function components (so BusButton counts). */
function hosts(node: unknown, out: El[] = [], depth = 0): El[] {
  if (Array.isArray(node)) return node.reduce<El[]>((a, n) => hosts(n, a, depth), out);
  if (node === null || typeof node !== "object" || !("props" in node)) return out;
  const el = node as El;
  if (typeof el.type === "function" && depth < 6) {
    return hosts((el.type as (p: unknown) => unknown)(el.props), out, depth + 1);
  }
  out.push(el);
  return hosts(el.props?.children, out, depth);
}

function cluster(onToggle: (bus: AudioBus) => void = () => undefined): El[] {
  return hosts(
    AudioToggleView({ bgmMuted: false, sfxMuted: false, onToggle, onToggleExpanded: () => undefined }),
  );
}

let undo: (() => void) | null = null;
afterEach(() => {
  undo?.();
  undo = null;
});

/** Swap playSfx for a recorder until the test ends. */
function recordSfx(): string[] {
  const played: string[] = [];
  const real = audioSystem.playSfx;
  audioSystem.playSfx = (event: string): boolean => played.push(event) > 0;
  undo = () => {
    audioSystem.playSfx = real;
  };
  return played;
}

/** Hover then click the button, and demand the press cue exists too. */
function press(btn: El | undefined, played: string[]): string[] {
  if (!btn) throw new Error("the audio cluster no longer renders that button");
  (btn.props.onPointerEnter as (() => void) | undefined)?.();
  (btn.props.onClick as (() => void) | undefined)?.();
  expect(typeof btn.props.onPointerDown, "no press cue on this button").toBe("function");
  return played;
}

const CUES = ["uiHoverCyber", "uiToggle"];

describe("the global audio cluster's buttons all have hover + click cues (GH#113)", () => {
  it("the 🎚 disclosure is not silent", () => {
    const played = recordSfx();
    const btn = cluster().find((n) => n.type === "button" && "data-ggd-audio-expand" in n.props);
    expect(press(btn, played), "the most global button in the game is silent").toEqual(CUES);
  });

  it("🎵/🔊 get the SAME cues, and the cue does not replace the mute action", () => {
    const flipped: AudioBus[] = [];
    const played = recordSfx();
    const btn = cluster((b) => flipped.push(b)).find((n) => n.props["data-bus"] === "bgm");
    expect(press(btn, played), "the mute buttons lost hover, or the cue moved").toEqual(CUES);
    expect(flipped).toEqual(["bgm"]);
  });
});

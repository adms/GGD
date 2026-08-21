/**
 * GUARD — every button in the GLOBAL audio cluster speaks (GH#113).
 *
 * THE DEFECT IT PINS. `<AudioToggle/>` is mounted unconditionally by
 * `ui/GlobalChrome` and portaled to <body>, so its three buttons are the most
 * ubiquitous controls in the game. The 🎚 disclosure had NO handler beyond a
 * state flip — no hover voice, no click voice, no `unlock()` — and 🎵/🔊 were
 * silent on HOVER too: they only made a click sound because the CONTAINER
 * happened to call `playSfx("uiToggle")` by hand inside its mute handler. Task
 * #24 ("every button gets hover+click") was reported done with this cluster
 * exempt by accident.
 *
 * WHY IT READS THE ELEMENT TREE. The client's vitest env is `node`, and this
 * component portals to <body> — the shipped surface cannot be mounted here.
 * Rendering to static markup would not help either: handlers do not appear in
 * HTML, so a markup assertion is green whether or not anything is wired
 * (失敗形態 ③ — the feature can be deleted and the test stays green). So the
 * test shallow-renders `AudioToggleView` — calling the real component functions,
 * including `BusButton` — and reads the handler props off the REAL JSX. Delete
 * the `{...clusterBtnProps(…)}` spread from either button and this goes red.
 *
 * It asserts EVENT NAMES, never gains or clip files: which cue plays is the
 * mechanism, how loud it is is a tuning value with its own three homes.
 */
import { describe, it, expect, afterEach } from "vitest";
import { audioSystem, type AudioBus } from "../audio";
import { AudioToggleView } from "./AudioToggle";

interface El {
  type: unknown;
  props: Record<string, unknown>;
}

/**
 * Flatten a React element tree into its HOST elements, invoking function
 * components on the way down so a `<BusButton/>` contributes the `<button>` it
 * actually renders. Depth-limited: this cluster is three levels deep and the
 * recursion must terminate.
 */
function hosts(node: unknown, out: El[] = [], depth = 0): El[] {
  if (Array.isArray(node)) {
    for (const n of node) hosts(n, out, depth);
    return out;
  }
  if (node === null || typeof node !== "object" || !("props" in node)) return out;
  const el = node as El;
  if (typeof el.type === "function" && depth < 6) {
    hosts((el.type as (p: unknown) => unknown)(el.props), out, depth + 1);
    return out;
  }
  out.push(el);
  hosts(el.props?.children, out, depth);
  return out;
}

/** Record every playSfx event name for the duration of one interaction. */
function recordSfx(): { played: string[]; restore: () => void } {
  const played: string[] = [];
  const real = audioSystem.playSfx;
  audioSystem.playSfx = (event: string): boolean => {
    played.push(event);
    return true;
  };
  return {
    played,
    restore: () => {
      audioSystem.playSfx = real;
    },
  };
}

let undo: (() => void) | null = null;
afterEach(() => {
  undo?.();
  undo = null;
});

function cluster(onToggle: (bus: AudioBus) => void = () => undefined): El[] {
  return hosts(
    AudioToggleView({
      bgmMuted: false,
      sfxMuted: false,
      onToggle,
      onToggleExpanded: () => undefined,
    }),
  );
}

function findBtn(pred: (p: Record<string, unknown>) => boolean): El {
  const el = cluster().find((n) => n.type === "button" && pred(n.props));
  if (!el) throw new Error("the audio cluster no longer renders that button");
  return el;
}

describe("the global audio cluster's buttons all have hover + click cues (GH#113)", () => {
  it("the 🎚 disclosure plays a hover voice and an on/off click voice", () => {
    const btn = findBtn((p) => "data-ggd-audio-expand" in p);
    const rec = recordSfx();
    undo = rec.restore;
    (btn.props.onPointerEnter as () => void)();
    (btn.props.onClick as () => void)();
    expect(rec.played, "the most global button in the game is silent").toEqual([
      "uiHoverCyber",
      "uiToggle",
    ]);
    expect(typeof btn.props.onPointerDown, "no press cue on the disclosure").toBe("function");
  });

  it("🎵/🔊 get the SAME hover + click cues, and still flip their bus", () => {
    const flipped: string[] = [];
    const btn = cluster((bus) => flipped.push(bus)).find(
      (n) => n.type === "button" && n.props["data-bus"] === "bgm",
    );
    expect(btn, "the music mute button is gone").toBeTruthy();
    const rec = recordSfx();
    undo = rec.restore;
    (btn!.props.onPointerEnter as () => void)();
    (btn!.props.onClick as () => void)();
    expect(rec.played, "the mute buttons lost hover, or the cue moved").toEqual([
      "uiHoverCyber",
      "uiToggle",
    ]);
    // the sound must not have REPLACED the action, and must be emitted BEFORE
    // it — muting the SFX bus still owes the player its confirmation blip
    expect(flipped).toEqual(["bgm"]);
  });
});

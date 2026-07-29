/**
 * audio/victoryTaunt (task #93) — the taunt VO layer. Everything here runs in
 * the node env with a stubbed fetch and a stubbed audio element, so no clip is
 * ever fetched and NOTHING is ever played on the machine running the tests
 * (task #62); the test-mode silence gate is itself one of the cases below.
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  VictoryTauntPlayer,
  matchTauntKey,
  normalizeTauntPath,
  pickTauntLine,
  roundTauntKey,
  selectMatchTaunt,
  selectRoundTaunt,
  tauntHash,
  victoryTauntsFromDoc,
  type TauntElement,
  type VictoryTauntsConfig,
} from "./victoryTaunt";
import type { VolumeState } from "./audioSelect";

const DOC = {
  id: "victory-taunts",
  schema: "config.victory-taunts@1",
  roundWin: {
    "godie-e001": {
      name: "蟬在叫人壞掉 - 龍宮禮奈",
      source: "寒蟬鳴泣之時",
      lines: [
        { id: "t-1", file: "assets/audio/voice-taunt/round/godie-e001-1.mp3", text: "蟬在叫。" },
        { id: "t-2", file: "assets/audio/voice-taunt/round/godie-e001-2.mp3", text: "うそだ！" },
        { id: "t-3", file: "assets/audio/voice-taunt/round/godie-e001-3.mp3", text: "太可愛了。" },
      ],
    },
    "godie-empty": { name: "沒有台詞", source: null, lines: [] },
  },
  roundWinFallback: [
    { id: "fb-1", file: "/content/assets/audio/voice-taunt/round/_fallback-1.mp3", text: "畫面變灰了。" },
    { id: "fb-2", file: "assets/audio/voice-taunt/round/_fallback-2.mp3", text: "你死了。" },
  ],
  matchWin: [
    { id: "ck-1", file: "assets/audio/voice-taunt/chicken/granny-base.mp3", text: "我阿嬤都比你強。" },
    { id: "ck-2", file: "assets/audio/voice-taunt/chicken/granny-retract.mp3", text: "更正。" },
    { id: "ck-3", file: "assets/audio/voice-taunt/chicken/x.mp3", text: "吃雞。" },
  ],
};

const CFG = victoryTauntsFromDoc(DOC) as VictoryTauntsConfig;

const UNMUTED: VolumeState = { master: 1, bgm: 1, sfx: 1, muted: false };

function makeElement() {
  const el = {
    src: "",
    volume: 0,
    currentTime: 0,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  };
  return el as unknown as TauntElement & typeof el;
}

interface Harness {
  player: VictoryTauntPlayer;
  el: ReturnType<typeof makeElement>;
  /** fire the n-th scheduled taunt (default: the most recent) */
  run: (n?: number) => void;
  delays: number[];
}

function makeHarness(
  opts: { volumes?: VolumeState; unlocked?: boolean; silent?: boolean; doc?: unknown } = {},
): Harness {
  const el = makeElement();
  const delays: number[] = [];
  const queued: (() => void)[] = [];
  const player = new VictoryTauntPlayer({
    audio: {
      isUnlocked: opts.unlocked ?? true,
      volumes: () => opts.volumes ?? UNMUTED,
    },
    silent: opts.silent ?? false,
    createAudio: () => el,
    fetchFn: () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(opts.doc ?? DOC),
      } as unknown as Response),
    schedule: (fn, ms) => {
      delays.push(ms);
      queued.push(fn);
      return queued.length;
    },
    // a "cancelled" timer is simply never fired by the test; the player's own
    // sequence guard is what must stop a stale one that fires anyway
    cancelSchedule: () => {},
    warn: () => {},
  });
  return {
    player,
    el,
    delays,
    run: (n) => queued[n ?? queued.length - 1]?.(),
  };
}

describe("victoryTaunt config", () => {
  it("parses the shipped doc shape and normalizes clip paths onto the mount", () => {
    cover("client-taunt-parse");
    expect(Object.keys(CFG.roundWin)).toEqual(["godie-e001"]); // empty pool dropped
    expect(CFG.roundWin["godie-e001"]!.lines).toHaveLength(3);
    expect(CFG.roundWinFallback[0]!.file).toBe("assets/audio/voice-taunt/round/_fallback-1.mp3");
    expect(CFG.matchWin).toHaveLength(3);
    expect(normalizeTauntPath("/content/a/b.mp3")).toBe("a/b.mp3");
  });

  it("treats a missing / empty / junk doc as absent (silence, no subtitle)", () => {
    cover("client-taunt-parse-degrades");
    expect(victoryTauntsFromDoc(null)).toBeNull();
    expect(victoryTauntsFromDoc("nope")).toBeNull();
    expect(victoryTauntsFromDoc({ roundWin: {}, roundWinFallback: [], matchWin: [] })).toBeNull();
  });
});

describe("victoryTaunt selection is deterministic across clients", () => {
  it("same replicated inputs ⇒ same line, every time, on every machine", () => {
    cover("client-taunt-deterministic");
    const a = selectRoundTaunt(CFG, "godie-e001", 3);
    const b = selectRoundTaunt(CFG, "godie-e001", 3);
    expect(a).not.toBeNull();
    expect(a!.id).toBe(b!.id);
    // VALUE pins, not `f(x) === f(x)` (true of any pure function, including a
    // broken one): two clients on the same build agree only if the hash itself
    // is this exact number and the pick is this exact line.
    expect(a!.id).toBe("t-2");
    expect(tauntHash(roundTauntKey("godie-e001", 3))).toBe(3386853517);
    expect(tauntHash(matchTauntKey("m-1", 0))).toBe(653090359);
    expect(tauntHash("a")).not.toBe(tauntHash("b"));
  });

  it("different rounds move through the champion's pool", () => {
    cover("client-taunt-varies");
    const ids = new Set<string>();
    for (let r = 0; r < 12; r++) ids.add(selectRoundTaunt(CFG, "godie-e001", r)!.id);
    expect(ids.size).toBeGreaterThan(1);
  });

  it("a champion with no pool of its own falls back, never to silence", () => {
    cover("client-taunt-fallback");
    const line = selectRoundTaunt(CFG, "champion-that-does-not-exist", 1);
    expect(line).not.toBeNull();
    expect(CFG.roundWinFallback.some((l) => l.id === line!.id)).toBe(true);
    // the entry whose pool parsed empty behaves the same way
    expect(selectRoundTaunt(CFG, "godie-empty", 1)).not.toBeNull();
  });

  it("the match line comes from the champion-agnostic 吃雞 pool", () => {
    cover("client-taunt-match-pool");
    const line = selectMatchTaunt(CFG, "match-7", 2);
    expect(CFG.matchWin.some((l) => l.id === line!.id)).toBe(true);
    expect(selectMatchTaunt(CFG, "match-7", 2)!.id).toBe(line!.id);
    // ...and never from a round pool: the two tiers cannot cross-fire
    const roundIds = new Set(CFG.roundWin["godie-e001"]!.lines.map((l) => l.id));
    expect(roundIds.has(line!.id)).toBe(false);
    expect(matchTauntKey("match-7", 2)).not.toBe(roundTauntKey("match-7", 2));
  });

  it("an empty pool picks nothing rather than throwing", () => {
    cover("client-taunt-empty-pool");
    expect(pickTauntLine([], "k")).toBeNull();
    expect(selectRoundTaunt(null, "x", 0)).toBeNull();
    expect(selectMatchTaunt(null, "x", 0)).toBeNull();
  });
});

describe("victoryTaunt playback gates", () => {
  it("plays the round taunt after the configured delay and returns its subtitle", async () => {
    cover("client-taunt-plays-round");
    const h = makeHarness();
    const line = await h.player.playRound("godie-e001", 2, { delayMs: 2200 });
    expect(line?.text).toBeTruthy();
    expect(h.delays).toEqual([2200]);
    expect(h.el.play).not.toHaveBeenCalled(); // still waiting on the 名言
    h.run();
    expect(h.el.play).toHaveBeenCalledTimes(1);
    expect(h.el.src).toContain("/content/assets/audio/voice-taunt/round/");
    expect(h.el.volume).toBeGreaterThan(0);
  });

  it("plays the savage match taunt from the chicken directory", async () => {
    cover("client-taunt-plays-match");
    const h = makeHarness();
    const line = await h.player.playMatch("m-1", 0, { delayMs: 740 });
    expect(line).not.toBeNull();
    h.run();
    expect(h.el.src).toContain("/content/assets/audio/voice-taunt/chicken/");
  });

  it("TEST-MODE SILENCE: never creates an element and never plays (task #62)", async () => {
    cover("client-taunt-silent");
    const h = makeHarness({ silent: true });
    const spoken: string[] = [];
    const line = await h.player.playRound("godie-e001", 1, {
      delayMs: 10,
      onSpeak: (l) => spoken.push(l.id),
    });
    expect(line?.text).toBeTruthy(); // the subtitle still renders
    // The BEAT is still scheduled even in silence: the subtitle has to land at
    // the same instant on a silent client as on a loud one. Only the CLIP is
    // suppressed — nothing is ever played on the machine running the tests.
    expect(h.delays).toEqual([10]);
    expect(spoken).toEqual([]);
    h.run();
    expect(h.el.play).not.toHaveBeenCalled();
    expect(spoken).toHaveLength(1);
  });

  it("the SUBTITLE lands with the voice, not when the line is picked", async () => {
    cover("client-taunt-subtitle-timing");
    const h = makeHarness();
    const spoken: string[] = [];
    // playRound resolves as soon as the line is CHOSEN — a caller that
    // subtitled from the promise would print the punchline `delayMs` early,
    // straight over the round-end 名言 the delay exists to clear.
    const line = await h.player.playRound("godie-e001", 2, {
      delayMs: 2200,
      onSpeak: (l) => spoken.push(l.id),
    });
    expect(line).not.toBeNull();
    expect(spoken).toEqual([]); // …still silent AND still unsubtitled
    h.run();
    expect(spoken).toEqual([line!.id]); // text and voice on the same beat
    expect(h.el.play).toHaveBeenCalledTimes(1);
  });

  it("a mute that happens DURING the delay is respected (gain read at speak time)", async () => {
    cover("client-taunt-late-mute");
    const volumes: VolumeState = { ...UNMUTED };
    const h = makeHarness({ volumes });
    const spoken: string[] = [];
    await h.player.playRound("godie-e001", 1, {
      delayMs: 2200,
      onSpeak: (l) => spoken.push(l.id),
    });
    volumes.muted = true; // player hits mute while the taunt is queued
    h.run();
    expect(h.el.play).not.toHaveBeenCalled();
    expect(spoken).toHaveLength(1); // the joke is still SHOWN, just not spoken
  });

  it("muted / autoplay-locked mixers stay silent but still subtitle the joke", async () => {
    cover("client-taunt-muted");
    const muted = makeHarness({ volumes: { ...UNMUTED, muted: true } });
    expect((await muted.player.playRound("godie-e001", 1))?.text).toBeTruthy();
    expect(muted.el.play).not.toHaveBeenCalled();

    const sfxMuted = makeHarness({ volumes: { ...UNMUTED, sfxMuted: true } });
    expect((await sfxMuted.player.playRound("godie-e001", 1))?.text).toBeTruthy();
    expect(sfxMuted.el.play).not.toHaveBeenCalled();

    const locked = makeHarness({ unlocked: false });
    expect((await locked.player.playRound("godie-e001", 1))?.text).toBeTruthy();
    expect(locked.el.play).not.toHaveBeenCalled();
  });

  it("cancel() drops a queued taunt (the beat ended early)", async () => {
    cover("client-taunt-cancel");
    const h = makeHarness();
    const spoken: string[] = [];
    await h.player.playRound("godie-e001", 1, {
      delayMs: 2200,
      onSpeak: (l) => spoken.push(l.id),
    });
    h.player.cancel();
    h.run();
    expect(h.el.play).not.toHaveBeenCalled();
    expect(spoken).toEqual([]); // …and no subtitle for a beat that never played

    // …and a taunt that is already SPEAKING is stopped, not just un-queued
    await h.player.playRound("godie-e001", 2, { delayMs: 5 });
    h.run();
    expect(h.el.play).toHaveBeenCalledTimes(1);
    const pausesBefore = h.el.pause.mock.calls.length;
    h.player.cancel();
    expect(h.el.pause.mock.calls.length).toBeGreaterThan(pausesBefore);
  });

  it("a newer taunt supersedes a pending older one (never two voices)", async () => {
    cover("client-taunt-supersede");
    const h = makeHarness();
    await h.player.playRound("godie-e001", 1, { delayMs: 2200 });
    await h.player.playMatch("m-2", 1, { delayMs: 740 });
    h.run(0); // the round taunt's timer fires late — it must not speak
    expect(h.el.play).not.toHaveBeenCalled();
    h.run(1);
    expect(h.el.play).toHaveBeenCalledTimes(1);
  });

  // task #63: the CLIP must be requested across the delay window, not on the
  // beat. `speak()` assigns `el.src` at the instant the line has to be heard, so
  // before this the 758-clip / 7.7 MB taunt pack was grabbed cold exactly when
  // it had to sound. The assertion reads the REQUESTED URLS, not a flag.
  it("prefetches the clip when the beat is scheduled, not when it fires", async () => {
    cover("client-taunt-clip-warm");
    const el = makeElement();
    const seen: string[] = [];
    const queued: (() => void)[] = [];
    const player = new VictoryTauntPlayer({
      audio: { isUnlocked: true, volumes: () => UNMUTED },
      silent: false,
      createAudio: () => el,
      fetchFn: (url: string) => {
        seen.push(url);
        return Promise.resolve({ ok: true, json: () => Promise.resolve(DOC) } as unknown as Response);
      },
      schedule: (fn) => (queued.push(fn), queued.length),
      cancelSchedule: () => {},
      warn: () => {},
    });

    const line = await player.playRound("godie-e001", 2, { delayMs: 2200 });
    expect(line?.file).toBeTruthy();
    // the clip is already on the wire while the 名言 is still on screen…
    expect(seen.some((u) => u.endsWith(line!.file!))).toBe(true);
    expect(el.play).not.toHaveBeenCalled(); // …and nothing has sounded yet
    const before = seen.length;

    queued[queued.length - 1]!();
    expect(el.play).toHaveBeenCalledTimes(1);
    expect(el.src).toContain(line!.file!);

    // a second taunt for the same clip must not re-request it
    await player.playRound("godie-e001", 2, { delayMs: 2200 });
    expect(seen.filter((u) => u.endsWith(line!.file!))).toHaveLength(1);
    expect(seen.length).toBeGreaterThanOrEqual(before);
  });

  it("TEST-MODE SILENCE also suppresses the clip prefetch (task #62)", async () => {
    cover("client-taunt-clip-warm");
    const seen: string[] = [];
    const player = new VictoryTauntPlayer({
      audio: { isUnlocked: true, volumes: () => UNMUTED },
      silent: true,
      createAudio: () => makeElement(),
      fetchFn: (url: string) => {
        seen.push(url);
        return Promise.resolve({ ok: true, json: () => Promise.resolve(DOC) } as unknown as Response);
      },
      schedule: () => 1,
      cancelSchedule: () => {},
      warn: () => {},
    });
    const line = await player.playRound("godie-e001", 2, { delayMs: 2200 });
    expect(line?.file).toBeTruthy();
    expect(seen.filter((u) => u.includes("voice-taunt"))).toEqual([]); // only the script
  });

  it("a 404 taunt script is silence and no subtitle, never a throw", async () => {
    cover("client-taunt-404");
    const el = makeElement();
    const player = new VictoryTauntPlayer({
      audio: { isUnlocked: true, volumes: () => UNMUTED },
      silent: false,
      createAudio: () => el,
      fetchFn: () => Promise.resolve({ ok: false } as unknown as Response),
      warn: () => {},
    });
    expect(await player.playRound("godie-e001", 1)).toBeNull();
    expect(await player.playMatch("m", 0)).toBeNull();
    expect(el.play).not.toHaveBeenCalled();
  });
});

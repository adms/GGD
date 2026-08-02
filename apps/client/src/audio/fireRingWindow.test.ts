/**
 * firering-config / audio-scene-map — the fire ring's CUE window.
 *
 * Task #132 shipped green with a hardcoded `FIRE_RING_SEC = 30` while the
 * authored config ignites the ring with 60 s left, so the tension BGM and the
 * minimap danger rim arrived 30 s after champions started burning. These tests
 * lock the derivation to the real content doc and lock the literal back OUT of
 * the source, because the only thing that made the drift survivable was that
 * nothing tied the two numbers together.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { Configs } from "@ggd/shared/content";
import type { ConfigDoc } from "@ggd/shared/content";
import {
  FIRE_RING_SEC,
  FIRE_RING_SHRINK_SEC,
  NO_RING_FALLBACK_SEC,
  __resetFireRingDriftAlarm,
  fireRingShrinkSecFrom,
  fireRingWindowSec,
  fireRingWindowSecFrom,
  noteFireRingIgnition,
} from "./fireRingWindow";
import { sceneForMatch } from "./scene";

const CONFIG_PATH = join(__dirname, "../../../../content/config/config.match.json");

interface MatchBlock {
  combatMaxSec: number;
  fireRing?: { startSec: number; shrinkSec?: number };
}

function readMatchConfig(): MatchBlock {
  const doc = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as { match: MatchBlock };
  return doc.match;
}

/** Register a synthetic `config.match` so the derivation has something to read. */
function registerMatchConfig(match: MatchBlock): void {
  Configs.register({
    id: "config.match",
    schema: "config@1",
    match,
  } as unknown as ConfigDoc);
}

beforeEach(() => {
  Configs.clear();
  __resetFireRingDriftAlarm();
  fireRingWindowSec(); // re-resolve the live binding for this test's registry state
});

afterEach(() => {
  Configs.clear();
  fireRingWindowSec();
});

describe("fire-ring cue window is derived, not authored twice (firering-config)", () => {
  it("is combatMaxSec - fireRing.startSec for the SHIPPED config, and is not the old 30", () => {
    cover("firering-config");
    const match = readMatchConfig();
    expect(match.fireRing).toBeTruthy();
    const expected = match.combatMaxSec - match.fireRing!.startSec;
    expect(fireRingWindowSecFrom(match)).toBe(expected);
    // ⚠️ 出貨值**不寫死**。`combatMaxSec` 2026-08-01 從 100 改成 180（窗口 40 → 120）,
    // 而原本釘死的 40 / 100 / 60 讓這兩條從那一刻起就紅著跟過兩個版本 —— 而且訊息
    // 看起來像「BGM 換床壞了」。這條要驗的是**推導**：窗口 = 回合長度 − 火圈起點。
    // 真正要擋的東西只有一個：它不可以剛好等於那個 legacy literal,否則下面那條
    // 分不出「真的在推導」還是「碰巧撞上寫死的 30」。
    expect(expected).not.toBe(NO_RING_FALLBACK_SEC);
    expect(expected).toBeGreaterThan(0);
  });

  it("derives the SHRINK duration separately — 40 is not 20 (firering-config)", () => {
    cover("firering-config");
    const match = readMatchConfig();
    // Two different questions, two different numbers. Folding them into one
    // scalar is how the #132 drift happened, one layer down: `FIRE_RING_SEC` is
    // "seconds left when it ignites" (compared against phaseSecondsLeft), this
    // is "how long the contraction lasts" (the band's animation length).
    expect(fireRingShrinkSecFrom(match)).toBe(20);
    expect(fireRingShrinkSecFrom(match)).not.toBe(fireRingWindowSecFrom(match));
    // degenerate inputs fall back to the schema's own default, never to 0
    expect(fireRingShrinkSecFrom(null)).toBe(20);
    expect(fireRingShrinkSecFrom({ combatMaxSec: 100 })).toBe(20);
    expect(fireRingShrinkSecFrom({ combatMaxSec: 100, fireRing: { startSec: 60 } })).toBe(20);
    // and it tracks a registered doc through the live binding
    registerMatchConfig({ combatMaxSec: 200, fireRing: { startSec: 100, shrinkSec: 35 } });
    fireRingWindowSec();
    expect(FIRE_RING_SHRINK_SEC).toBe(35);
  });

  it("tracks the registered content doc, including the live FIRE_RING_SEC binding", () => {
    cover("firering-config");
    registerMatchConfig({ combatMaxSec: 240, fireRing: { startSec: 180 } });
    expect(fireRingWindowSec()).toBe(60);
    // ui/hud/Minimap.tsx reads this binding directly; ESM live-binding semantics
    // are what keep the rim and the bed on one number without editing that file.
    expect(FIRE_RING_SEC).toBe(60);

    // move the mechanic → the cue moves with it, with no code change
    registerMatchConfig({ combatMaxSec: 300, fireRing: { startSec: 120 } });
    expect(fireRingWindowSec()).toBe(180);
    expect(FIRE_RING_SEC).toBe(180);
  });

  it("degenerates safely: no doc / no ring → the legacy window, unreachable ring → never cue", () => {
    cover("firering-config");
    expect(fireRingWindowSec()).toBe(NO_RING_FALLBACK_SEC); // registry cleared in beforeEach
    expect(fireRingWindowSecFrom({ combatMaxSec: 240 })).toBe(NO_RING_FALLBACK_SEC);
    expect(fireRingWindowSecFrom(null)).toBe(NO_RING_FALLBACK_SEC);
    // startSec at/after the phase cap: the phase force-ends before the ring can
    // burn, so cueing anything would be a lie.
    expect(fireRingWindowSecFrom({ combatMaxSec: 240, fireRing: { startSec: 240 } })).toBe(0);
    expect(fireRingWindowSecFrom({ combatMaxSec: 240, fireRing: { startSec: 999 } })).toBe(0);
    // a ring armed at t=0 burns the whole phase, but never longer than it
    expect(fireRingWindowSecFrom({ combatMaxSec: 240, fireRing: { startSec: 0 } })).toBe(240);
  });

  it("swaps the BGM bed at the derived instant, not at a literal", () => {
    cover("audio-scene-map");
    const match = readMatchConfig();
    registerMatchConfig(match);
    // 換床的那一刻由出貨設定決定,不是字面值 —— 這正是這條測試的名字。
    const W = match.combatMaxSec - match.fireRing!.startSec;
    // W+1 秒剩餘：火圈還沒點燃 → combat bed
    expect(sceneForMatch({ phase: "combat", phaseSecondsLeft: W + 1 })).toBe("combat");
    // W 秒剩餘：點燃 → tension bed。這條在 #132 的整個生命期都是假的（它一路
    // 回答 "combat" 直到剩 30 秒），而 #195 之後它**跟著機制走**,不需要改程式。
    expect(sceneForMatch({ phase: "combat", phaseSecondsLeft: W })).toBe("fireRing");
    expect(sceneForMatch({ phase: "combat", phaseSecondsLeft: Math.ceil(W / 2) })).toBe("fireRing");
    expect(sceneForMatch({ phase: "combat", phaseSecondsLeft: 5 })).toBe("fireRing");
    // …而且它真的在**那一秒**翻面,不是「一路都是 fireRing」——
    // 少了這一行,一個永遠回傳 "fireRing" 的實作也會過。
    expect(sceneForMatch({ phase: "combat", phaseSecondsLeft: W + 30 })).toBe("combat");
  });

  it("never re-hardcodes the window at its OWNER (S3 source lock)", () => {
    cover("firering-config");
    // The lock now points at fireRingWindow.ts, because scene.ts only
    // RE-EXPORTS the binding — a literal reintroduced in the owning module
    // would sail straight past a check aimed at the re-export.
    const src = readFileSync(join(__dirname, "fireRingWindow.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    // a numeric assignment to either window is exactly how this broke the first time
    expect(src).not.toMatch(/FIRE_RING_SEC\s*(:\s*number\s*)?=\s*\d/);
    expect(src).not.toMatch(/FIRE_RING_SHRINK_SEC\s*(:\s*number\s*)?=\s*\d/);
    // …and scene.ts must stay a pure re-export of both
    const scene = readFileSync(join(__dirname, "scene.ts"), "utf8");
    expect(scene).not.toMatch(/FIRE_RING_SEC\s*(:\s*number\s*)?=\s*\d/);
    expect(scene).toMatch(/from "\.\/fireRingWindow"/);
  });
});

describe("fire-ring ignition drift alarm (firering-config)", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => {});
    registerMatchConfig({ combatMaxSec: 240, fireRing: { startSec: 180 } });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("stays silent when the sim ignites at the derived instant (±1 s quantisation)", () => {
    cover("firering-config");
    noteFireRingIgnition(60);
    noteFireRingIgnition(61);
    noteFireRingIgnition(59);
    expect(spy).not.toHaveBeenCalled();
  });

  it("shouts, once, with BOTH numbers when the cue and the burn part company", () => {
    cover("firering-config");
    noteFireRingIgnition(30); // what the old hardcoded cue would have implied
    expect(spy).toHaveBeenCalledTimes(1);
    const msg = String(spy.mock.calls[0]?.[0] ?? "");
    expect(msg).toContain("30s");
    expect(msg).toContain("60s");
    expect(msg).toContain("config.match@1");
    // one-shot: the config is frozen for the match, so this must not spam
    noteFireRingIgnition(30);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("ignores a garbage or absent clock rather than crying wolf", () => {
    cover("firering-config");
    noteFireRingIgnition(Number.NaN);
    // 0 = no combat clock at all (disconnected / phase not running / a synthetic
    // event in another unit test). Nothing to compare against.
    noteFireRingIgnition(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("still trips when the derived window is 0 but the sim burns anyway", () => {
    cover("firering-config");
    // startSec beyond the phase cap → this client would never cue the ring …
    registerMatchConfig({ combatMaxSec: 240, fireRing: { startSec: 300 } });
    // … but the sim ignited it with 5 s left. That is exactly the invisible
    // failure this alarm exists for.
    noteFireRingIgnition(5);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

/**
 * task #35: the champ-select CONFIRM seam. `hudActions.selectChampion` is the
 * single place a pick becomes an action — every UI entry point (roster row,
 * 隨機英雄, couch seats) funnels through it and both the online and offline
 * flows continue into the same `RoomConnection.sendSelectChampion` — so the
 * Japanese full-name VO is fired exactly once here, per confirm, and the room
 * message is still sent FIRST and unconditionally (the VO can never block or
 * fail the pick). The VO's own gates (unlock / mute / ~1 s double-fire guard)
 * are covered in audio/nameVoice.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";

const { spoken, warmed, fail } = vi.hoisted(() => ({
  spoken: [] as string[],
  warmed: { n: 0 },
  fail: { on: false },
}));
vi.mock("../audio/nameVoice", () => ({
  playChampionNameVo: (championId: string): Promise<boolean> => {
    spoken.push(championId);
    return fail.on ? Promise.reject(new Error("no audio")) : Promise.resolve(true);
  },
  loadChampionNames: (): Promise<null> => {
    warmed.n++;
    return Promise.resolve(null);
  },
}));

import { hudActions, registerHudActions } from "./actions";

describe("hudActions.selectChampion → champion name VO", () => {
  beforeEach(() => {
    spoken.length = 0;
    warmed.n = 0;
    fail.on = false;
    registerHudActions(null);
  });

  it("sends the pick and speaks the name exactly once per confirm", () => {
    cover("name-vo-wired-to-confirm");
    const sent: string[] = [];
    registerHudActions({
      sendCommand: () => {},
      selectChampion: (id) => sent.push(id),
      sendCheat: () => {},
      focusWorld: () => {},
      sendOrder: () => {},
      setArenaRenderSuppressed: () => {},
      localChampionModel: () => null,
    });

    hudActions.selectChampion("godie-o02l");
    expect(sent).toEqual(["godie-o02l"]);
    expect(spoken).toEqual(["godie-o02l"]); // one confirm ⇒ one call-out

    hudActions.selectChampion("godie-u010");
    expect(sent).toEqual(["godie-o02l", "godie-u010"]);
    expect(spoken).toEqual(["godie-o02l", "godie-u010"]);
    registerHudActions(null);
  });

  it("never lets the VO break the pick: no impl, or a rejected play", async () => {
    cover("name-vo-never-blocks-pick");
    // seam not registered yet (pre-boot HUD): still no throw, still no VO crash
    expect(() => hudActions.selectChampion("godie-e001")).not.toThrow();
    expect(spoken).toEqual(["godie-e001"]);

    fail.on = true;
    const sent: string[] = [];
    registerHudActions({
      sendCommand: () => {},
      selectChampion: (id) => sent.push(id),
      sendCheat: () => {},
      focusWorld: () => {},
      sendOrder: () => {},
      setArenaRenderSuppressed: () => {},
      localChampionModel: () => null,
    });
    expect(() => hudActions.selectChampion("godie-e001")).not.toThrow();
    expect(sent).toEqual(["godie-e001"]); // the room message went out regardless
    await Promise.resolve();
    registerHudActions(null);
  });

  it("warms the name manifest only where a DOM can resolve the URL", () => {
    cover("name-vo-boot-warm");
    // node test env: no `window`, so boot must NOT kick a relative-URL fetch
    expect(typeof window).toBe("undefined");
    registerHudActions({ sendCommand: () => {}, selectChampion: () => {}, sendCheat: () => {}, focusWorld: () => {}, sendOrder: () => {}, setArenaRenderSuppressed: () => {}, localChampionModel: () => null });
    expect(warmed.n).toBe(0);
    registerHudActions(null);
  });
});

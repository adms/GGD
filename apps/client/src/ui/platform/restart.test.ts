/**
 * restart-decision: the offline (clear-battlefield) vs online (return-to-lobby)
 * restart split, plus the app store wiring that drives it.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { restartAction, ONLINE_RESTART_NOTE } from "./restart";
import { appStore } from "./store";

describe("restart action decision", () => {
  it("offline recreates the world; online returns to lobby", () => {
    cover("restart-decision");
    expect(restartAction("offline")).toBe("recreate");
    expect(restartAction("platform")).toBe("returnToLobby");
    expect(ONLINE_RESTART_NOTE.length).toBeGreaterThan(0);
  });
});

describe("app store restartMatch (offline)", () => {
  it("bumps matchEpoch and stays in the same offline match", () => {
    cover("restart-decision");
    appStore.getState().playOffline();
    expect(appStore.getState().screen).toBe("match");
    const before = appStore.getState().matchEpoch;
    appStore.getState().restartMatch();
    expect(appStore.getState().matchEpoch).toBe(before + 1); // main.tsx rebuilds the GameApp
    expect(appStore.getState().screen).toBe("match"); // still in-match
    expect(appStore.getState().match?.mode).toBe("offline");
  });

  it("is a no-op outside a match", async () => {
    cover("restart-decision");
    await appStore.getState().returnToLobby(); // leave the match cleanly
    expect(appStore.getState().screen).not.toBe("match");
    const before = appStore.getState().matchEpoch;
    appStore.getState().restartMatch();
    expect(appStore.getState().matchEpoch).toBe(before);
  });
});

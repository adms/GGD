// @vitest-environment jsdom
/**
 * MEASUREMENT SCRATCH — how many React commits does the draft subtree take
 * while the player is still deciding?
 */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { describe, expect, it } from "vitest";
import type { MatchState } from "@ggd/shared/protocol/schema";

import { resetHudStore, syncHudFromState } from "../../net/RoomStore";
import { AugmentDraftPanel } from "./AugmentDraftPanel";

const ME = "acc-me";

function fakeState(mana: number): MatchState {
  return {
    matchId: "m_draft",
    phase: "intermission",
    round: 3,
    tick: 30,
    phaseTicksLeft: 300,
    seed: 1,
    seats: new Map([
      [
        "0",
        {
          seatId: 0,
          teamId: 0,
          accountId: ME,
          displayName: "me",
          connected: true,
          driver: "human",
          championId: "champ.sela",
          entityId: 101,
          level: 1,
          gold: 0,
          xp: 0,
          ready: false,
          unspentPoints: 0,
          lastAckSeq: 0,
          items: [],
          augments: [],
          abilityRanks: [1, 0, 0, 0],
          cooldowns: [0, 0, 0, 0],
          offers: [{ offerId: "of_1", tier: "weapon", choices: ["all-might-hair", "bezoar-of-the-apothecary", "book-of-gospel"] }],
          mobKills: 0,
        },
      ],
    ]),
    entities: new Map([
      [
        "101",
        {
          id: 101,
          kind: 1,
          seatId: 0,
          x: 0,
          z: 0,
          fx: 1,
          fz: 0,
          zone: 0,
          alive: true,
          hp: 100,
          maxHp: 100,
          shield: 0,
          mana,
          maxMana: 500,
        },
      ],
    ]),
    teams: [],
  } as unknown as MatchState;
}

describe("draft commits", () => {
  it("measure", () => {
    resetHudStore();
    syncHudFromState(fakeState(10), ME);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    let commits = 0;
    const durs: number[] = [];
    act(() => {
      root.render(
        React.createElement(
          React.Profiler,
          {
            id: "draft",
            onRender: (_i: string, _p: string, actual: number) => {
              commits += 1;
              durs.push(actual);
            },
          },
          React.createElement(AugmentDraftPanel),
        ),
      );
    });
    expect(host.querySelector('[role="dialog"]'), "面板沒掛上").not.toBeNull();
    const before = commits;
    const scrim = host.firstElementChild;
    const html0 = host.innerHTML;
    let mutations = 0;
    const mo = new MutationObserver((recs) => { mutations += recs.length; });
    mo.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
    for (let i = 1; i <= 20; i += 1) {
      act(() => syncHudFromState(fakeState(10 + i), ME));
    }
    mo.takeRecords();
    mo.disconnect();
    // eslint-disable-next-line no-console
    console.log("MUTATIONS =", mutations, "scrimSame=", scrim === host.firstElementChild, "htmlSame=", html0 === host.innerHTML);
    // eslint-disable-next-line no-console
    console.log("COMMITS_AFTER_20_SNAPSHOTS =", commits - before, "mount_ms=", durs[0], "resnap_ms=", durs.slice(1).map((d)=>Math.round(d*100)/100).join(","));
    act(() => root.unmount());
    host.remove();
    expect(commits - before).toBe(-1);
  });
});

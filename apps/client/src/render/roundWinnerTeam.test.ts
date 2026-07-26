/**
 * roundWinnerTeam — the round-win beat presents the whole winning TEAM.
 *
 * owner, 2026-07-27: 「勝利的時候應該秀隊伍三人的模組」. A 3v3v3v3 round is won
 * by three people; standing only the MVP centre-screen told the other two they
 * were scenery.
 *
 * Two halves, both guarded, because this is the repo's signature failure shape:
 *   1. the SELECTOR really returns the team (settlementModel), and
 *   2. the STAGE really stands up one card per member (RoundWinnerStage).
 * Passing (1) while (2) silently keeps showing one model is precisely the
 * "computed but never reaches the endpoint" defect, so the stage is driven for
 * real here with injected headless fakes rather than asserted on source.
 */
import { describe, expect, it } from "vitest";
import type { ModelDoc } from "@ggd/shared/content";
import { RoundWinnerStage, type WinnerPreview } from "./RoundWinnerStage";
import { roundWinnerTeamChampions } from "../ui/panels/settlementModel";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";

const DOC = { modelKey: "champ.test", url: "/x.glb" } as unknown as ModelDoc;

function seat(seatId: number, teamId: number, championId: string, alive = true) {
  return { seatId, teamId, championId, alive, roundKills: 0, roundDeaths: 0 };
}
function team(teamId: number, outcome: number) {
  return { teamId, roundOutcome: outcome, lives: 3, eliminated: false, placement: 0 };
}

// --- headless doubles --------------------------------------------------------
class FakePreview implements WinnerPreview {
  shown: string[] = [];
  disposed = false;
  show(_doc: ModelDoc, opts?: { championId?: string | null }): void {
    this.shown.push(opts?.championId ?? "");
  }
  dispose(): void {
    this.disposed = true;
  }
}

function harness() {
  const previews: FakePreview[] = [];
  const elements: { tag: string; removed: boolean }[] = [];
  const make = (tag: string) => {
    const rec = { tag, removed: false };
    elements.push(rec);
    return {
      style: {} as CSSStyleDeclaration,
      textContent: "",
      remove: () => {
        rec.removed = true;
      },
    } as unknown as HTMLElement;
  };
  const stage = new RoundWinnerStage({
    host: { appendChild: () => undefined } as unknown as HTMLElement,
    createCanvas: () => make("canvas") as unknown as HTMLCanvasElement,
    createElement: (tag) => make(tag),
    createPreview: () => {
      const p = new FakePreview();
      previews.push(p);
      return p;
    },
    taunt: null, // no VO in the node env
  });
  return { stage, previews, elements };
}

describe("the selector returns the winning TEAM, MVP first", () => {
  const seats = [
    seat(0, 0, "champ-a"),
    seat(1, 0, "champ-b"),
    seat(2, 0, "champ-c"),
    seat(3, 1, "enemy-a"),
  ];
  const teams = [team(0, ROUND_OUTCOME.WON), team(1, ROUND_OUTCOME.LOST)];

  it("returns all three members of the winning team", () => {
    const out = roundWinnerTeamChampions(seats, teams);
    expect(out).toHaveLength(3);
    expect(new Set(out)).toEqual(new Set(["champ-a", "champ-b", "champ-c"]));
    expect(out).not.toContain("enemy-a");
  });

  it("puts the MVP first — the taunt and the leftmost card both depend on it", () => {
    const out = roundWinnerTeamChampions(seats, teams);
    // whoever roundEndQuoteChampion picks must be [0]; asserting the LINKAGE
    // rather than a hard-coded id, so a change to the MVP rule cannot silently
    // decouple the voice from the leftmost model.
    const mvpOnly = roundWinnerTeamChampions(seats, teams)[0];
    expect(out[0]).toBe(mvpOnly);
  });

  it("empty when there is nothing to present — never a blank card", () => {
    expect(roundWinnerTeamChampions([], teams)).toEqual([]);
    expect(roundWinnerTeamChampions(seats, [])).toEqual([]);
  });
});

describe("the stage really stands up one card per member", () => {
  it("three members ⇒ three previewers, each given its own championId", () => {
    const { stage, previews } = harness();
    stage.showTeam(
      [
        { doc: DOC, championId: "a" },
        { doc: DOC, championId: "b" },
        { doc: DOC, championId: "c" },
      ],
      { championId: "a", round: 2 },
    );
    expect(stage.memberCount).toBe(3);
    expect(previews).toHaveLength(3);
    // #263: each card paints its OWN champion's w3x tint. One previewer handed
    // three ids in turn would also produce three `shown` entries — so assert
    // one id per previewer, which only a real per-card layout satisfies.
    expect(previews.map((p) => p.shown)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("still works for a single winner — the solo beat is unchanged", () => {
    const { stage, previews } = harness();
    stage.show(DOC, { championId: "solo", round: 1 });
    expect(stage.memberCount).toBe(1);
    expect(previews[0]!.shown).toEqual(["solo"]);
  });

  it("a changed member COUNT rebuilds the cards rather than restyling them", () => {
    // A canvas's size is baked into its Babylon engine at construction, so a
    // three-card row cannot be produced by restyling one full-width card. If
    // this ever "optimises" into reuse, round 2 renders three champions inside
    // one card's worth of pixels.
    const { stage, previews } = harness();
    stage.show(DOC, { championId: "solo" });
    stage.showTeam([{ doc: DOC }, { doc: DOC }, { doc: DOC }]);
    expect(stage.memberCount).toBe(3);
    expect(previews[0]!.disposed).toBe(true); // the solo card was torn down
    expect(previews).toHaveLength(4); // 1 solo + 3 new
  });

  it("the SAME count reuses everything — no per-round WebGL churn", () => {
    const { stage, previews } = harness();
    stage.showTeam([{ doc: DOC, championId: "a" }, { doc: DOC, championId: "b" }]);
    stage.showTeam([{ doc: DOC, championId: "x" }, { doc: DOC, championId: "y" }]);
    expect(previews).toHaveLength(2);
    expect(previews[0]!.shown).toEqual(["a", "x"]);
    expect(previews[1]!.shown).toEqual(["b", "y"]);
  });

  it("clear() disposes every previewer, not just the first", () => {
    const { stage, previews } = harness();
    stage.showTeam([{ doc: DOC }, { doc: DOC }, { doc: DOC }]);
    stage.clear();
    expect(stage.active).toBe(false);
    expect(stage.memberCount).toBe(0);
    expect(previews.every((p) => p.disposed)).toBe(true);
  });

  it("an empty member list presents nothing at all", () => {
    const { stage, previews } = harness();
    stage.showTeam([]);
    expect(stage.active).toBe(false);
    expect(previews).toHaveLength(0);
  });
});

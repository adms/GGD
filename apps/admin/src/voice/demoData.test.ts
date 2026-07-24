/**
 * adminui-voice-demo — the DEMO driver exists so a 2,208-clip console can be
 *                        proven at full size before the voice service exists.
 *                        It is only safe if it can never be mistaken for real
 *                        work, so this suite pins exactly that: it is
 *                        deterministic, it invents no champion, every script it
 *                        writes is prefixed as a demo, its rollup is COMPUTED
 *                        from the same lines the detail view renders (so the
 *                        page's own partition check passes honestly), and not
 *                        one of its clips can be approved.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { BUNDLED_SCHEMA, expandLines } from "./categories";
import {
  DEMO_BANNER,
  DEMO_TEXT_PREFIX,
  demoChampionsFromQuotes,
  demoStatus,
  demoWorld,
  demoWriteRefusal,
  type DemoChampion,
} from "./demoData";
import {
  canApproveLine,
  canGenerateLine,
  countsFor,
  countsPartitionOk,
  progressOf,
  rosterTotals,
} from "./voiceModel";

const LINES = expandLines(BUNDLED_SCHEMA);

const QUOTES = {
  quotes: {
    "godie-e001": { name: "蟬在叫人壞掉 - 龍宮禮奈", gender: "female" },
    "godie-e002": { name: "亞瑟王 - Saber", gender: "female" },
    "godie-o02l": { name: "皮卡丘", gender: "neutral" },
  },
};

function champs(): DemoChampion[] {
  return demoChampionsFromQuotes(QUOTES, null);
}

describe("the demo borrows the repo's roster and invents nothing", () => {
  it("reads names and genders out of the 名言 pack", () => {
    cover("adminui-voice-demo");
    const list = champs();
    expect(list.map((c) => c.championId)).toEqual(["godie-e001", "godie-e002", "godie-o02l"]);
    expect(list[0]?.name).toBe("蟬在叫人壞掉 - 龍宮禮奈");
    expect(list[2]?.gender).toBe("neutral");
  });

  it("narrows to the curation whitelist when it could be read", () => {
    cover("adminui-voice-demo");
    expect(demoChampionsFromQuotes(QUOTES, ["godie-o02l"]).map((c) => c.championId)).toEqual([
      "godie-o02l",
    ]);
    // an id NOT in the pack can never appear, whatever the whitelist says
    expect(demoChampionsFromQuotes(QUOTES, ["not-a-champion"])).toEqual([]);
  });

  it("returns nothing rather than a fabricated roster when the pack is unreadable", () => {
    cover("adminui-voice-demo");
    expect(demoChampionsFromQuotes(null, null)).toEqual([]);
    expect(demoChampionsFromQuotes({ quotes: "nope" }, null)).toEqual([]);
    expect(demoChampionsFromQuotes({}, null)).toEqual([]);
  });
});

describe("the demo is deterministic and self-consistent", () => {
  it("produces the same world twice — the page never wobbles between renders", () => {
    cover("adminui-voice-demo");
    const a = demoStatus(champs()[0] as DemoChampion, LINES);
    const b = demoStatus(champs()[0] as DemoChampion, LINES);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("gives every champion exactly the expected line set", () => {
    cover("adminui-voice-demo");
    const st = demoStatus(champs()[0] as DemoChampion, LINES);
    expect(Object.keys(st.lines).sort()).toEqual(LINES.map((l) => l.lineId).sort());
  });

  it("computes the rollup FROM the statuses, so the partition check passes honestly", () => {
    cover("adminui-voice-demo");
    const world = demoWorld(champs(), LINES);
    for (const row of world.roster.champions) {
      const st = world.statuses.get(row.championId) ?? null;
      expect(countsPartitionOk(row.counts)).toBe(true);
      // the SAME arithmetic the page runs over the detail view
      expect(row.counts).toEqual(countsFor(LINES, st));
      expect(row.counts.total).toBe(LINES.length);
    }
    expect(rosterTotals(world.roster).total).toBe(LINES.length * champs().length);
  });

  it("shows work IN PROGRESS — neither all-done nor all-empty would prove anything", () => {
    cover("adminui-voice-demo");
    const totals = rosterTotals(demoWorld(champs(), LINES).roster);
    const p = progressOf(totals);
    expect(p.percent).toBeGreaterThan(0);
    expect(p.percent).toBeLessThan(100);
    expect(totals.stub).toBeGreaterThan(0);
    expect(totals.noText).toBeGreaterThan(0);
  });

  it("keeps a reference-less champion at 待撰稿/待生成 — the gate is visible, not theoretical", () => {
    cover("adminui-voice-demo");
    const world = demoWorld(champs(), LINES);
    for (const [, st] of world.statuses) {
      if (st.reference !== null) continue;
      for (const rec of Object.values(st.lines)) {
        expect(["noText", "pending"]).toContain(rec.state);
        // …and the page's own gate agrees about why nothing can be generated
        expect(canGenerateLine(st.reference, rec).ok).toBe(false);
      }
    }
  });
});

describe("the demo can never be mistaken for real work", () => {
  it("labels every fabricated script", () => {
    cover("adminui-voice-demo");
    for (const [, st] of demoWorld(champs(), LINES).statuses) {
      for (const rec of Object.values(st.lines)) {
        if (rec.text !== null) expect(rec.text.startsWith(DEMO_TEXT_PREFIX)).toBe(true);
      }
    }
  });

  it("declares itself a stub engine, and its own banner is distinct from the engine's", () => {
    cover("adminui-voice-demo");
    expect(demoWorld(champs(), LINES).roster.engine.stub).toBe(true);
    expect(DEMO_BANNER).toContain("DEMO");
    // the two banners must not share wording, or one of them becomes invisible
    expect(DEMO_BANNER).not.toContain("語音引擎未就緒");
    expect(demoWriteRefusal()).toContain("示範資料");
  });

  it("APPROVES NOTHING: every stub line it paints is refused by the same gate the UI uses", () => {
    cover("adminui-voice-demo");
    let stubs = 0;
    for (const [, st] of demoWorld(champs(), LINES).statuses) {
      for (const rec of Object.values(st.lines)) {
        if (rec.state !== "stub") continue;
        stubs++;
        expect(canApproveLine(rec).ok).toBe(false);
        expect(rec.current?.stub).toBe(true);
        expect(rec.takes.every((t) => t.stub)).toBe(true);
      }
    }
    expect(stubs).toBeGreaterThan(0);
  });
});

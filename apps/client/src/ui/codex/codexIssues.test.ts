/**
 * codex-issues / codex-icon-hash: the supplementary broken-data report.
 *
 * The report is the codex's SECOND job, so these tests pin two things: that it
 * finds every issue type the user asked for, and that it stays a separate,
 * grouped table (grouped by type, counted, empty groups dropped) rather than
 * leaking warnings into the browse rows.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { normaliseAbility, normaliseChampion, normaliseItem, UNKNOWN_WHITELIST } from "./codexData";
import { collectIssues, issueTotal, type CodexIssueType } from "./codexIssues";
import { parsePlan } from "@ggd/shared/codex/codexPlan";
import { duplicateIconGroups, hashIcons } from "@ggd/shared/codex/codexIcons";
import { buildRecipeGraph } from "./codexRecipes";
import type { CodexAbility, CodexChampion, CodexData, CodexItem } from "@ggd/shared/codex/codexTypes";

function data(over: Partial<CodexData> = {}): CodexData {
  return {
    contentVersion: "cv_test",
    counts: {
      item: { manifest: null, indexed: 0, loaded: 0 },
      champion: { manifest: null, indexed: 0, loaded: 0 },
      ability: { manifest: null, indexed: 0, loaded: 0 },
    },
    items: [],
    champions: [],
    abilities: [],
    whitelist: UNKNOWN_WHITELIST,
    loadedAt: 0,
    loadErrors: [],
    ...over,
  };
}

const champ = (over: Record<string, unknown>): CodexChampion =>
  normaliseChampion({ id: "c1", name: "王 - 甲", role: "fighter", attackType: "melee", abilities: {}, ...over }) as CodexChampion;
const item = (over: Record<string, unknown>): CodexItem =>
  normaliseItem({ id: "i1", name: "刀", cost: 100, tier: 2, tags: [], ...over }) as CodexItem;
const ability = (over: Record<string, unknown>): CodexAbility =>
  normaliseAbility({
    id: "c1.q",
    name: "20-01 技",
    slot: "Q",
    castType: "self",
    maxRank: 1,
    cooldown: [1],
    manaCost: [0],
    range: 0,
    effects: [],
    ...over,
  }) as CodexAbility;

function types(groups: readonly { type: CodexIssueType }[]): CodexIssueType[] {
  return groups.map((g) => g.type);
}

describe("codex broken-data report", () => {
  it("detects every issue type the codex is responsible for", () => {
    cover("codex-issues");
    const groups = collectIssues({
      data: data({
        champions: [champ({ id: "c1", icon: null, description: null, exAbility: null })],
        items: [item({ id: "i065", name: "i065", modifiers: [], description: "說明" })],
        abilities: [ability({ id: "c1.q", description: null, icon: "assets/icons/abilities/c1.q.png" })],
      }),
    });
    expect(types(groups)).toEqual(
      expect.arrayContaining(["name-equals-id", "no-ex-ability", "no-description", "zero-modifiers", "no-icon"]),
    );
    const nameEqId = groups.find((g) => g.type === "name-equals-id");
    expect(nameEqId?.issues).toHaveLength(1);
    expect(nameEqId?.issues[0]?.ref).toEqual({ kind: "item", id: "i065" });
  });

  it("drops empty groups so the table only ever lists real work", () => {
    cover("codex-issues");
    const clean = collectIssues({
      data: data({
        champions: [champ({ icon: "assets/i.png", description: "說明", exAbility: "c1.ex" })],
      }),
    });
    expect(clean).toEqual([]);
    expect(issueTotal(clean)).toBe(0);
  });

  it("groups by type with a count, ordered smallest-and-most-actionable first", () => {
    cover("codex-issues");
    const groups = collectIssues({
      data: data({
        items: [
          item({ id: "a", name: "a", description: null, modifiers: [] }),
          item({ id: "b", name: "刀", description: null, modifiers: [] }),
        ],
      }),
    });
    expect(types(groups)).toEqual(["name-equals-id", "no-description", "zero-modifiers", "no-icon"]);
    expect(groups.map((g) => g.issues.length)).toEqual([1, 2, 2, 2]);
    // With no plan published the note must NOT invent provenance numbers — the
    // previous version hard-coded "695 stock / 2 map-custom / 168 orphans" from
    // the asset register and all three were wrong. It may only state what it
    // counted, and say where the real classification comes from.
    const note = groups.find((g) => g.type === "no-icon")?.note ?? "";
    expect(note).toContain("宣告了 0 個圖示"); // neither of the two items declares one
    expect(note).toContain("tools/icon-gen/src/plan.py");
    expect(note).not.toMatch(/\b695\b|\b168\b/);
  });

  it("splits icon-less entries into dropped / blocked / real backlog when a plan exists", () => {
    cover("codex-issues");
    const plan = parsePlan({
      schema: "config.icon-plan@1",
      templateVersion: "icon-gen/1",
      contentDigest: "deadbeef",
      counts: { total: { docs: 3, have: 0, drop: 1, blocked: 1, generate: 1, tier1: 1, tier2: 0 } },
      provenance: { stock: 3 },
      dropped: { "recipe-book": { label: "合成書", note: "沒有合成系統", ids: ["book"] } },
      blocked: { "third-party-ip": { label: "第三方版權", note: "等待裁定", ids: ["mascot"] } },
      generate: { tier1: [], tier2: [] },
    });
    const groups = collectIssues({
      data: data({
        items: [
          item({ id: "book", name: "製作書", description: "x", modifiers: [{ stat: "ad", op: "add", value: 1 }] }),
          item({ id: "mascot", name: "吉祥物", description: "x", modifiers: [{ stat: "ad", op: "add", value: 1 }] }),
          item({ id: "real", name: "真刀", description: "x", modifiers: [{ stat: "ad", op: "add", value: 1 }] }),
        ],
      }),
      plan,
    });
    const byType = new Map(groups.map((g) => [g.type, g.issues.map((i) => i.ref.id)]));
    expect(byType.get("icon-dropped")).toEqual(["book"]);
    expect(byType.get("icon-blocked")).toEqual(["mascot"]);
    expect(byType.get("no-icon")).toEqual(["real"]);
    // the per-row detail carries the RULE's own justification, not a bare key
    expect(groups.find((g) => g.type === "icon-dropped")?.issues[0]?.detail).toContain("沒有合成系統");
    // and the headline note is computed from the plan, never typed
    expect(groups.find((g) => g.type === "no-icon")?.note).toContain("真正要產生的是 1 張");
  });

  it("ignores a plan it does not understand rather than mis-reporting", () => {
    cover("codex-issues");
    expect(parsePlan({ schema: "config.icon-plan@99", counts: { total: {} } })).toBeNull();
    expect(parsePlan(null)).toBeNull();
    expect(parsePlan({ schema: "config.icon-plan@1" })).toBeNull();
  });

  it("reports byte-identical icons as a mis-assignment, naming the collision", () => {
    cover("codex-issues");
    const groups = collectIssues({
      data: data({
        champions: [
          champ({ id: "c1", name: "曹操孟德", icon: "assets/icons/champions/c1.png", description: "x", exAbility: "c1.ex" }),
          champ({ id: "c2", name: "皮卡丘", icon: "assets/icons/champions/c2.png", description: "x", exAbility: "c2.ex" }),
        ],
      }),
      iconHashes: {
        hashes: new Map([
          ["assets/icons/champions/c1.png", "deadbeef"],
          ["assets/icons/champions/c2.png", "deadbeef"],
        ]),
        failed: [],
      },
    });
    const dup = groups.find((g) => g.type === "duplicate-icon");
    expect(dup?.issues).toHaveLength(2);
    expect(dup?.issues[0]?.detail).toContain("皮卡丘");
    expect(dup?.issues[1]?.detail).toContain("曹操孟德");
  });

  it("separates 'declares an icon that 404s' from 'declares no icon'", () => {
    cover("codex-issues");
    const groups = collectIssues({
      data: data({ items: [item({ icon: "assets/icons/items/i1.png", description: "x", modifiers: [{ stat: "ad", op: "flat", value: 1 }] })] }),
      iconHashes: { hashes: new Map(), failed: ["assets/icons/items/i1.png"] },
    });
    expect(types(groups)).toEqual(["icon-load-failed"]);
  });

  it("lists recipe components that resolve to nothing", () => {
    cover("codex-issues");
    const items = [item({ id: "ring", name: "戒指", description: "合成配方：\n寶石碎片\n", modifiers: [{ stat: "ad", op: "flat", value: 1 }], icon: "assets/x.png" })];
    const groups = collectIssues({ data: data({ items }), recipes: buildRecipeGraph(items) });
    const g = groups.find((x) => x.type === "unresolved-recipe-component");
    expect(g?.issues[0]?.detail).toContain("寶石碎片");
  });
});

describe("codex icon hashing", () => {
  it("hashes each distinct path once and records unfetchable ones", async () => {
    cover("codex-icon-hash");
    const seen: string[] = [];
    const res = await hashIcons(["a.png", "b.png", "a.png", "gone.png"], {
      base: "/content",
      fetchFn: async (url) => {
        seen.push(url);
        if (url.endsWith("gone.png")) return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
        // a.png and b.png deliberately return the SAME bytes
        return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
      },
      digest: async (bytes) => bytes.join("-"),
    });
    expect(seen).toHaveLength(3); // deduped
    expect(res.hashes.get("a.png")).toBe("1-2-3");
    expect(res.failed).toEqual(["gone.png"]);
  });

  it("groups only paths that share bytes", () => {
    cover("codex-icon-hash");
    const groups = duplicateIconGroups(
      new Map([
        ["a.png", "h1"],
        ["b.png", "h1"],
        ["c.png", "h2"],
      ]),
    );
    expect([...groups.values()]).toEqual([["a.png", "b.png"]]);
  });

  it("never rejects when the network throws", async () => {
    cover("codex-icon-hash");
    const res = await hashIcons(["x.png"], {
      fetchFn: async () => {
        throw new Error("offline");
      },
    });
    expect(res.hashes.size).toBe(0);
    expect(res.failed).toEqual(["x.png"]);
  });
});

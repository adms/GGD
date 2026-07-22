/**
 * codex-edit-model (task #96) — the pure half of the codex editor.
 *
 * The two things that decide whether an edit is SAFE, tested without a server:
 *
 *   • the mirror rule. Every Q/W/E/R ability is stored twice — standalone AND
 *     embedded in its champion — and the SIM reads the embedded copy. An editor
 *     that wrote only the standalone doc would look like it worked and change
 *     nothing in game, so `writePlan` must produce BOTH writes.
 *   • the diff. There is no version control in this repo, so the panel shows
 *     exactly what a save would overwrite before it overwrites it; a diff that
 *     lies is worse than none.
 *
 * Plus the field parsing that turns text back into JSON, where "empty means
 * ABSENT, not empty string" is the rule the shared zod schemas expect.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  applyEdits,
  collectionOf,
  diffDocs,
  docUrl,
  embeddedForm,
  embeddedSlotOf,
  formatField,
  getAt,
  manifestUrl,
  parseField,
  setAt,
  writePlan,
} from "./codexEditModel";

// deliberately synthetic ids: codexLive.test.ts forbids real content ids in
// this directory's SOURCES, and inventing them here keeps the fixtures honest.
const ABILITY_ID = "hero-x.q";
const CHAMPION_ID = "hero-x";

const ability = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: ABILITY_ID,
  schema: "ability@1",
  name: "01-01 Test Strike",
  slot: "Q",
  castType: "self",
  maxRank: 5,
  cooldown: [10, 9, 8, 7, 6],
  manaCost: [50, 55, 60, 65, 70],
  range: 0,
  effects: [],
  ...over,
});

const champion = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: CHAMPION_ID,
  schema: "champion@1",
  name: "Title - Test Hero",
  role: "fighter",
  attackType: "melee",
  modelKey: "champ.test",
  baseStats: { hp: 600, ad: 55 },
  growth: { hp: 80, ad: 3 },
  abilities: {
    Q: embeddedForm(ability()),
    W: embeddedForm(ability({ id: "hero-x.w", slot: "W", name: "01-02 Two" })),
    E: embeddedForm(ability({ id: "hero-x.e", slot: "E", name: "01-03 Three" })),
    R: embeddedForm(ability({ id: "hero-x.r", slot: "R", name: "01-04 Four" })),
  },
  skillOrder: ["Q", "W", "E", "R"],
  buildPriority: [],
  tags: [],
  ...over,
});

describe("collections and urls", () => {
  it("maps codex kinds onto the content collections the api uses", () => {
    cover("codex-edit-model");
    expect(collectionOf("item")).toBe("items");
    expect(collectionOf("champion")).toBe("champions");
    expect(collectionOf("ability")).toBe("abilities");
    expect(docUrl("items", "a-b")).toBe("/content-api/items/a-b");
    expect(docUrl("abilities", ABILITY_ID, "validate")).toBe(`/content-api/abilities/${ABILITY_ID}/validate`);
    expect(manifestUrl()).toBe("/content-api/manifest");
    // an id is escaped, never concatenated raw
    expect(docUrl("items", "a/b")).toBe("/content-api/items/a%2Fb");
  });
});

describe("field parse / format round-trip", () => {
  it("empty means ABSENT — clearing a field removes the key, never writes \"\"", () => {
    cover("codex-edit-model");
    for (const kind of ["text", "number", "integer", "boolean", "stringList", "numberList"] as const) {
      const r = parseField(kind, "   ");
      expect(r.ok && r.value, kind).toBe(undefined);
    }
    const doc = { id: "x", icon: "assets/icons/x.png" };
    expect(setAt(doc, "icon", undefined)).toEqual({ id: "x" });
    expect("icon" in setAt(doc, "icon", undefined)).toBe(false);
  });

  it("rejects text that is not the field's type instead of coercing it", () => {
    cover("codex-edit-model");
    expect(parseField("number", "abc")).toMatchObject({ ok: false });
    expect(parseField("integer", "2.5")).toMatchObject({ ok: false });
    expect(parseField("boolean", "maybe")).toMatchObject({ ok: false });
    expect(parseField("numberList", "10, x, 8")).toMatchObject({ ok: false });
    // …and accepts the legitimate forms
    expect(parseField("number", "-2.5")).toEqual({ ok: true, value: -2.5 });
    expect(parseField("integer", "7")).toEqual({ ok: true, value: 7 });
    expect(parseField("boolean", "TRUE")).toEqual({ ok: true, value: true });
    expect(parseField("boolean", "false")).toEqual({ ok: true, value: false });
    expect(parseField("numberList", "10, 9,8\n7")).toEqual({ ok: true, value: [10, 9, 8, 7] });
    expect(parseField("stringList", " ad , crit ,, ")).toEqual({ ok: true, value: ["ad", "crit"] });
  });

  it("formats a stored value back into what the input shows", () => {
    cover("codex-edit-model");
    expect(formatField("numberList", [10, 9])).toBe("10, 9");
    expect(formatField("stringList", ["ad", "crit"])).toBe("ad, crit");
    expect(formatField("number", 0)).toBe("0"); // 0 is a value, not "absent"
    expect(formatField("text", undefined)).toBe("");
    expect(formatField("boolean", true)).toBe("true");
    // a round trip through the editor must not change an untouched value
    const parsed = parseField("numberList", formatField("numberList", [30, 30, 30, 75, 75]));
    expect(parsed).toEqual({ ok: true, value: [30, 30, 30, 75, 75] });
  });
});

describe("immutable path edits", () => {
  it("reads and writes nested paths without mutating the input", () => {
    cover("codex-edit-model");
    const doc = champion();
    const frozen = JSON.stringify(doc);
    expect(getAt(doc, "baseStats.hp")).toBe(600);
    expect(getAt(doc, "abilities.Q.cooldown.0")).toBe(10);
    expect(getAt(doc, "nope.deep.path")).toBe(undefined);

    const next = setAt(doc, "baseStats.hp", 777);
    expect(next["baseStats"]).toEqual({ hp: 777, ad: 55 });
    expect(JSON.stringify(doc), "the original document must be untouched").toBe(frozen);
    // untouched branches are shared, not deep-cloned
    expect(next["abilities"]).toBe(doc["abilities"]);
  });

  it("creates missing intermediate containers", () => {
    cover("codex-edit-model");
    const out = setAt({ id: "x" }, "growth.hp", 12);
    expect(out).toEqual({ id: "x", growth: { hp: 12 } });
  });

  it("applies a whole edit map deterministically", () => {
    cover("codex-edit-model");
    const doc = champion();
    const a = applyEdits(doc, { "baseStats.hp": 700, role: "tank", tags: ["front"] });
    const b = applyEdits(doc, { tags: ["front"], role: "tank", "baseStats.hp": 700 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a["role"]).toBe("tank");
  });
});

describe("the diff shown before a save", () => {
  it("reports leaf changes, additions and removals — and nothing else", () => {
    cover("codex-edit-model");
    const before = champion();
    const after = applyEdits(before, {
      "baseStats.hp": 700,
      role: undefined, // removed
      icon: "assets/icons/champions/x.png", // added
    });
    const changes = diffDocs(before, after);
    expect(changes.map((c) => c.path).sort()).toEqual(["baseStats.hp", "icon", "role"]);
    const byPath = new Map(changes.map((c) => [c.path, c]));
    expect(byPath.get("baseStats.hp")).toMatchObject({ before: "600", after: "700" });
    expect(byPath.get("role")?.after).toBe("（無）");
    expect(byPath.get("icon")?.before).toBe("（無）");
  });

  it("is empty for an untouched document (no false 'you changed this')", () => {
    cover("codex-edit-model");
    expect(diffDocs(champion(), champion())).toEqual([]);
    // key ORDER is not a change
    expect(diffDocs({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
  });

  it("compares arrays whole rather than exploding them into index paths", () => {
    cover("codex-edit-model");
    const changes = diffDocs(ability(), ability({ cooldown: [10, 9, 8, 7, 5] }));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.path).toBe("cooldown");
    expect(changes[0]?.after).toBe("[10,9,8,7,5]");
  });
});

describe("THE MIRROR RULE — an ability edit must write both copies", () => {
  it("finds the embedded slot that holds an ability", () => {
    cover("codex-edit-model");
    expect(embeddedSlotOf(champion(), ABILITY_ID)).toBe("Q");
    expect(embeddedSlotOf(champion(), "hero-x.e")).toBe("E");
    expect(embeddedSlotOf(champion(), "hero-x.ex")).toBeNull();
    expect(embeddedSlotOf(null, ABILITY_ID)).toBeNull();
    expect(embeddedSlotOf({ id: "x" }, ABILITY_ID)).toBeNull();
  });

  it("plans TWO writes for a Q/W/E/R ability, and the embedded copy matches", () => {
    cover("codex-edit-model");
    const edited = ability({ cooldown: [4, 4, 4, 4, 4] });
    const steps = writePlan("ability", ABILITY_ID, edited, champion());
    expect(steps.map((s) => `${s.collection}/${s.id}:${s.reason}`)).toEqual([
      `abilities/${ABILITY_ID}:edit`,
      `champions/${CHAMPION_ID}:mirror`,
    ]);
    const mirrored = getAt(steps[1]!.doc, "abilities.Q") as Record<string, unknown>;
    // identical to the standalone doc MINUS the schema discriminator, which the
    // embedded shape (zAbilityDef, strict) forbids
    expect(mirrored).toEqual(embeddedForm(edited));
    expect("schema" in mirrored).toBe(false);
    expect(mirrored["cooldown"]).toEqual([4, 4, 4, 4, 4]);
    // the champion's other slots are untouched
    expect(getAt(steps[1]!.doc, "abilities.W")).toEqual(getAt(champion(), "abilities.W"));
  });

  it("plans ONE write for an EX ability (referenced, never embedded)", () => {
    cover("codex-edit-model");
    const ex = ability({ id: "hero-x.ex", slot: "EX" });
    const steps = writePlan("ability", "hero-x.ex", ex, champion({ exAbility: "hero-x.ex" }));
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ collection: "abilities", reason: "edit" });
  });

  it("plans ONE write for items and champions, and never mirrors without an owner", () => {
    cover("codex-edit-model");
    expect(writePlan("item", "x", { id: "x" })).toHaveLength(1);
    expect(writePlan("champion", CHAMPION_ID, champion())).toHaveLength(1);
    // an orphan ability (owner missing from content) still saves its own doc
    expect(writePlan("ability", ABILITY_ID, ability(), null)).toHaveLength(1);
  });
});

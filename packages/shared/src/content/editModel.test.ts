/**
 * content-edit-model (task #96) — the pure half of the codex editor.
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
import { cover } from "../../testkit/cover";
import {
  applyEdits,
  EDIT_COLLECTIONS,
  isEditCollection,
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
  spliceEmbeddedSlot,
  spliceMembers,
  spliceTopLevelMember,
  stringifyEmbedded,
} from "./editModel";

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
    cover("content-edit-model");
    expect(isEditCollection("items")).toBe(true);
    expect(isEditCollection("champions")).toBe(true);
    expect(isEditCollection("ability")).toBe(false);
    // 特效管理 (task #205) + 場景物件管理 join the editable set — both must be
    // recognised by the guard AND enumerated in EDIT_COLLECTIONS.
    expect(isEditCollection("vfx")).toBe(true);
    expect(isEditCollection("arenas")).toBe(true);
    expect(EDIT_COLLECTIONS).toContain("vfx");
    expect(EDIT_COLLECTIONS).toContain("arenas");
    // 鑄形工坊 (task #229) saves a model@1 doc through the SAME gate, so
    // `models` must be recognised too — and, like the two above, it mirrors
    // nowhere, so the write plan stays a single step and needs no change.
    expect(isEditCollection("models")).toBe(true);
    expect(EDIT_COLLECTIONS).toContain("models");
    // …and still no mirror for them (single-write plan, like abilities-standalone)
    expect(writePlan("vfx", "fx.x", { id: "fx.x" })).toHaveLength(1);
    expect(writePlan("arenas", "arena.x", { id: "arena.x" })).toHaveLength(1);
    expect(writePlan("models", "voxel.x", { id: "voxel.x" })).toHaveLength(1);
    expect(writePlan("models", "voxel.x", { id: "voxel.x" })[0]?.reason).toBe("edit");
    expect(docUrl("items", "a-b")).toBe("/content-api/items/a-b");
    expect(docUrl("abilities", ABILITY_ID, "validate")).toBe(`/content-api/abilities/${ABILITY_ID}/validate`);
    expect(manifestUrl()).toBe("/content-api/manifest");
    // an id is escaped, never concatenated raw
    expect(docUrl("items", "a/b")).toBe("/content-api/items/a%2Fb");
  });
});

describe("field parse / format round-trip", () => {
  it("empty means ABSENT — clearing a field removes the key, never writes \"\"", () => {
    cover("content-edit-model");
    for (const kind of ["text", "number", "integer", "boolean", "stringList", "numberList"] as const) {
      const r = parseField(kind, "   ");
      expect(r.ok && r.value, kind).toBe(undefined);
    }
    const doc = { id: "x", icon: "assets/icons/x.png" };
    expect(setAt(doc, "icon", undefined)).toEqual({ id: "x" });
    expect("icon" in setAt(doc, "icon", undefined)).toBe(false);
  });

  it("rejects text that is not the field's type instead of coercing it", () => {
    cover("content-edit-model");
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
    cover("content-edit-model");
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
    cover("content-edit-model");
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
    cover("content-edit-model");
    const out = setAt({ id: "x" }, "growth.hp", 12);
    expect(out).toEqual({ id: "x", growth: { hp: 12 } });
  });

  it("applies a whole edit map deterministically", () => {
    cover("content-edit-model");
    const doc = champion();
    const a = applyEdits(doc, { "baseStats.hp": 700, role: "tank", tags: ["front"] });
    const b = applyEdits(doc, { tags: ["front"], role: "tank", "baseStats.hp": 700 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a["role"]).toBe("tank");
  });
});

describe("the diff shown before a save", () => {
  it("reports leaf changes, additions and removals — and nothing else", () => {
    cover("content-edit-model");
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
    cover("content-edit-model");
    expect(diffDocs(champion(), champion())).toEqual([]);
    // key ORDER is not a change
    expect(diffDocs({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
  });

  it("compares arrays whole rather than exploding them into index paths", () => {
    cover("content-edit-model");
    const changes = diffDocs(ability(), ability({ cooldown: [10, 9, 8, 7, 5] }));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.path).toBe("cooldown");
    expect(changes[0]?.after).toBe("[10,9,8,7,5]");
  });
});

describe("THE MIRROR RULE — an ability edit must write both copies", () => {
  it("finds the embedded slot that holds an ability", () => {
    cover("content-edit-model");
    expect(embeddedSlotOf(champion(), ABILITY_ID)).toBe("Q");
    expect(embeddedSlotOf(champion(), "hero-x.e")).toBe("E");
    expect(embeddedSlotOf(champion(), "hero-x.ex")).toBeNull();
    expect(embeddedSlotOf(null, ABILITY_ID)).toBeNull();
    expect(embeddedSlotOf({ id: "x" }, ABILITY_ID)).toBeNull();
  });

  it("plans TWO writes for a Q/W/E/R ability, and the embedded copy matches", () => {
    cover("content-edit-model");
    const edited = ability({ cooldown: [4, 4, 4, 4, 4] });
    const steps = writePlan("abilities", ABILITY_ID, edited, champion());
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
    cover("content-edit-model");
    const ex = ability({ id: "hero-x.ex", slot: "EX" });
    const steps = writePlan("abilities", "hero-x.ex", ex, champion({ exAbility: "hero-x.ex" }));
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ collection: "abilities", reason: "edit" });
  });

  it("plans ONE write for items and champions, and never mirrors without an owner", () => {
    cover("content-edit-model");
    expect(writePlan("items", "x", { id: "x" })).toHaveLength(1);
    expect(writePlan("champions", CHAMPION_ID, champion())).toHaveLength(1);
    // an orphan ability (owner missing from content) still saves its own doc
    expect(writePlan("abilities", ABILITY_ID, ability(), null)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 鑄技工坊 / #78 — the LINE EDIT writer
// ---------------------------------------------------------------------------
//
// The rule these enforce: an edit to ONE member must not restate the rest of the
// file. Content docs come out of a PYTHON exporter that writes whole numbers as
// `30.0`; `JSON.stringify(doc, null, 2)` writes `30`. So a save that round-trips
// the whole doc silently rewrites every `X.0` in it — the diff pollution #78
// spent a batch cleaning up, and the reason the forge writes through PATCH.
//
// Two properties: (1) SEMANTICS — the spliced text parses to what `setAt` would
// produce; (2) BYTES — everything outside the replaced span is identical, and
// splicing a member back with its own value returns the text unchanged.

/** A champion doc as the Python exporter actually writes one: `30.0`, not `30`. */
const PY_CHAMPION = `{
  "id": "hero-x",
  "schema": "champion@1",
  "name": "Title - Test Hero",
  "baseStats": {
    "maxHealth": 600.0,
    "ad": 55.0
  },
  "abilities": {
    "Q": {
      "id": "hero-x.q",
      "name": "01-01 One",
      "cooldown": 8.0,
      "range": 6.0,
      "effects": []
    },
    "W": {
      "id": "hero-x.w",
      "name": "01-02 Two",
      "cooldown": 30.0,
      "range": 9.17,
      "effects": []
    }
  },
  "tags": []
}
`;

describe("LINE EDIT — the mirror writeback must not reformat the rest of the file", () => {
  it("splicing a slot back with its OWN current value returns the text UNCHANGED", () => {
    cover("content-edit-model");
    const current = getAt(JSON.parse(PY_CHAMPION), "abilities.W") as Record<string, unknown>;
    // THE assertion a JSON round-trip fails: `30.0` would come back as `30`.
    expect(spliceEmbeddedSlot(PY_CHAMPION, "W", current)).toBe(PY_CHAMPION);
    expect(spliceTopLevelMember(PY_CHAMPION, "tags", [])).toBe(PY_CHAMPION);
  });

  it("means exactly setAt, semantically", () => {
    cover("content-edit-model");
    const next = { id: "hero-x.w", name: "01-02 Renamed", cooldown: 12, range: 9.17, effects: [] };
    const spliced = JSON.parse(spliceEmbeddedSlot(PY_CHAMPION, "W", next)) as unknown;
    expect(spliced).toEqual(setAt(JSON.parse(PY_CHAMPION) as Record<string, unknown>, "abilities.W", next));
  });

  it("leaves every OTHER slot's bytes — floats included — untouched", () => {
    cover("content-edit-model");
    const out = spliceEmbeddedSlot(PY_CHAMPION, "W", {
      id: "hero-x.w",
      name: "01-02 Renamed",
      cooldown: 30,
      range: 9.17,
      effects: [],
    });
    // Q's `8.0` / `6.0` and the top-level `600.0` / `55.0` all survive…
    expect(out).toContain('"cooldown": 8.0');
    expect(out).toContain('"range": 6.0');
    expect(out).toContain('"maxHealth": 600.0');
    expect(out).toContain('"ad": 55.0');
    // …and the edited slot re-renders whole numbers in the file's own float
    // convention, so the NEXT edit of it is a no-op diff too.
    expect(out).toContain('"cooldown": 30.0');
    // exactly ONE line differs — the renamed one
    const before = PY_CHAMPION.split("\n");
    const after = out.split("\n");
    expect(after.length).toBe(before.length);
    expect(after.filter((l, i) => l !== before[i])).toEqual(['      "name": "01-02 Renamed",']);
  });

  it("patches ONLY the named top-level members of a standalone doc", () => {
    cover("content-edit-model");
    const doc = `{
  "id": "hero-x.q",
  "schema": "ability@1",
  "name": "01-01 One",
  "cooldown": 8.0,
  "castType": "self",
  "effects": []
}
`;
    const out = spliceMembers(doc, {
      castType: "targeted",
      effects: [{ kind: "damage", damageType: "magic", amount: { perRank: [100] } }],
    });
    const parsed = JSON.parse(out) as { castType: string; effects: unknown[] };
    expect(parsed.castType).toBe("targeted");
    expect(parsed.effects).toHaveLength(1);
    // and `cooldown: 8.0` did NOT become `8`
    expect(out).toContain('"cooldown": 8.0');
    expect(out).toContain('"name": "01-01 One"');
  });

  it("refuses an absent member rather than appending it in the wrong place", () => {
    cover("content-edit-model");
    expect(() => spliceTopLevelMember(PY_CHAMPION, "nope", 1)).toThrow(/no top-level member/);
    expect(() => spliceEmbeddedSlot(PY_CHAMPION, "E", {})).toThrow(/no abilities\.E/);
  });

  it("stringifyEmbedded keeps the float convention on FLOAT fields only", () => {
    cover("content-edit-model");
    const out = stringifyEmbedded({ cooldown: 30, maxRank: 3, effects: [] }, "  ");
    expect(out).toContain('"cooldown": 30.0'); // a float field
    expect(out).toContain('"maxRank": 3'); // a count — stays an integer
  });

  it("survives strings that contain braces and escaped quotes", () => {
    cover("content-edit-model");
    const tricky = `{
  "id": "hero-x",
  "note": "a } brace and a \\" quote",
  "abilities": {
    "Q": { "id": "hero-x.q", "cooldown": 8.0 }
  }
}
`;
    const out = spliceEmbeddedSlot(tricky, "Q", { id: "hero-x.q", cooldown: 9 });
    expect(JSON.parse(out)).toMatchObject({ note: 'a } brace and a " quote' });
    expect((JSON.parse(out) as { abilities: { Q: { cooldown: number } } }).abilities.Q.cooldown).toBe(9);
  });
});

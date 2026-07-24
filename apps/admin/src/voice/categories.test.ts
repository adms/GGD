/**
 * adminui-voice-categories — the owner's 41-category list is DATA and the page
 *                        renders it verbatim. This suite pins the ids, HIS
 *                        exact labels and HIS order (a reorder is a content
 *                        decision, never a refactor), and pins the expansion
 *                        arithmetic the whole page's scale rests on:
 *                        39 + 5 + 2 = 46 lines per champion, 2,208 across the
 *                        48-champion open roster.
 * adminui-voice-schema — CATEGORIES.json is the authority and the bundled
 *                        snapshot is only a fallback: the parser is tolerant,
 *                        a hand-edit is detectable (schemaDrift), and a 42nd
 *                        category changes every derived number with no code
 *                        change at all.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  BUNDLED_CATEGORIES,
  BUNDLED_SCHEMA,
  CATEGORY_COUNT,
  expandLines,
  isSafeLineId,
  linesPerChampion,
  parseCategorySchema,
  schemaDrift,
  totalClips,
} from "./categories";

/** The whitelist's open roster, the denominator the owner's spec talks about. */
const OPEN_CHAMPIONS = 48;

/**
 * The owner's list, re-split from his own sentence rather than retyped, so this
 * fixture cannot silently drift towards whatever the code happens to say.
 */
const OWNER_LINE =
  "角色名言、喊出技能名稱、勝利宣言、戰敗宣言、受傷、重傷、暈眩、中毒、被緩慢、致盲、受束縛/封印、被擊倒、被治癒、被混亂、被麻痺、感謝、諷刺/挑釁、咒罵、哼歌、輕攻擊、重攻擊、暴擊、防禦、閃避、衝刺/奔跑、跳躍、回應隊友OK/NO、疑惑、愛心、比讚/肯定、退下、衝鋒、觀望、自由行動、首殺、一殺、雙殺、三殺、四殺、五殺、無人能敵";

describe("the owner's category list", () => {
  it("is 41 items — not the 42 he counted, and no 42nd was invented", () => {
    cover("adminui-voice-categories");
    const owner = OWNER_LINE.split("、");
    expect(owner).toHaveLength(41);
    // the code agrees with HIS list, and nothing hardcodes the number
    expect(CATEGORY_COUNT).toBe(owner.length);
    expect(BUNDLED_CATEGORIES).toHaveLength(owner.length);
  });

  it("keeps his exact wording and his exact order", () => {
    cover("adminui-voice-categories");
    expect(BUNDLED_CATEGORIES.map((c) => c.label)).toEqual(OWNER_LINE.split("、"));
    // `order` is 1-based and matches the array position, so the page can sort
    // by it and never by id
    BUNDLED_CATEGORIES.forEach((c, i) => expect(c.order).toBe(i + 1));
  });

  it("has unique, filename-safe ids and a brief for every one", () => {
    cover("adminui-voice-categories");
    const ids = BUNDLED_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of BUNDLED_CATEGORIES) {
      expect(c.id, c.label).toMatch(/^[a-z0-9-]+$/);
      expect(c.hint.length, `${c.id} needs a brief`).toBeGreaterThan(0);
      expect(c.maxSeconds).toBeGreaterThan(0);
    }
  });

  it("expands EXACTLY the two categories that legitimately expand", () => {
    cover("adminui-voice-categories");
    const expanding = BUNDLED_CATEGORIES.filter((c) => c.expand !== undefined);
    expect(expanding.map((c) => c.id).sort()).toEqual(["respond", "skill-name"]);
    // the passive is not shouted, so it is NOT one of the castable slots
    expect(BUNDLED_SCHEMA.expansions.abilitySlots).toEqual(["q", "w", "e", "r", "ex"]);
    expect(BUNDLED_SCHEMA.expansions.abilitySlots).not.toContain("passive");
    expect(BUNDLED_SCHEMA.expansions.okNo).toEqual(["ok", "no"]);
  });
});

describe("the expansion arithmetic the page's scale rests on", () => {
  it("is 46 lines per champion and 2,208 across the open roster", () => {
    cover("adminui-voice-categories");
    const lines = expandLines(BUNDLED_SCHEMA);
    expect(lines).toHaveLength(39 + 5 + 2);
    expect(linesPerChampion(BUNDLED_SCHEMA)).toBe(46);
    expect(totalClips(BUNDLED_SCHEMA, OPEN_CHAMPIONS)).toBe(2208);
    // …which is NOT the ~2,016 the spec estimated. The page must display the
    // number it computed, so the difference is asserted rather than smoothed.
    expect(totalClips(BUNDLED_SCHEMA, OPEN_CHAMPIONS)).not.toBe(2016);
  });

  it("keeps the owner's order after expansion and gives every line a safe id", () => {
    cover("adminui-voice-categories");
    const lines = expandLines(BUNDLED_SCHEMA);
    expect(lines.map((l) => l.order)).toEqual([...lines.map((l) => l.order)].sort((a, b) => a - b));
    expect(new Set(lines.map((l) => l.lineId)).size).toBe(lines.length);
    for (const l of lines) expect(isSafeLineId(l.lineId), l.lineId).toBe(true);
    expect(lines.filter((l) => l.categoryId === "skill-name").map((l) => l.lineId)).toEqual([
      "skill-name.q",
      "skill-name.w",
      "skill-name.e",
      "skill-name.r",
      "skill-name.ex",
    ]);
    expect(lines.filter((l) => l.categoryId === "respond").map((l) => l.lineId)).toEqual([
      "respond.ok",
      "respond.no",
    ]);
  });

  it("refuses a lineId that could escape the champion directory", () => {
    cover("adminui-voice-categories");
    for (const bad of ["../secret", "a/b", "a.b.c", "Quote", "quote ", "", "quote.."]) {
      expect(isSafeLineId(bad), bad).toBe(false);
    }
  });

  it("a 42nd category is a one-file edit — every derived number follows", () => {
    cover("adminui-voice-schema");
    const parsed = parseCategorySchema({
      categories: [
        ...BUNDLED_CATEGORIES.map((c) => ({ ...c })),
        { id: "sneeze", label: "打噴嚏", order: 42, hint: "哈啾", maxSeconds: 1 },
      ],
      expansions: { abilitySlots: ["q", "w", "e", "r", "ex"], okNo: ["ok", "no"] },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.categories).toHaveLength(42);
    expect(linesPerChampion(parsed!)).toBe(47);
    expect(totalClips(parsed!, OPEN_CHAMPIONS)).toBe(47 * 48);
  });
});

describe("CATEGORIES.json is the authority; the snapshot is only a fallback", () => {
  it("marks where the schema came from so the page can never lie about it", () => {
    cover("adminui-voice-schema");
    expect(BUNDLED_SCHEMA.fromDisk).toBe(false);
    const disk = parseCategorySchema({ categories: [{ id: "quote", label: "角色名言" }] }, "abc");
    expect(disk?.fromDisk).toBe(true);
    expect(disk?.sha256).toBe("abc");
  });

  it("returns null on bytes that are not a category schema, rather than half a list", () => {
    cover("adminui-voice-schema");
    expect(parseCategorySchema(null)).toBeNull();
    expect(parseCategorySchema("nope")).toBeNull();
    expect(parseCategorySchema({})).toBeNull();
    expect(parseCategorySchema({ categories: [] })).toBeNull();
    // entries with an unusable id are dropped; a doc of only those is null
    expect(parseCategorySchema({ categories: [{ id: "Bad Id!" }] })).toBeNull();
  });

  it("fills sane defaults without inventing content", () => {
    cover("adminui-voice-schema");
    const s = parseCategorySchema({ categories: [{ id: "quote" }, { id: "hum", expand: "bogus" }] });
    expect(s?.categories[0]?.label).toBe("quote"); // id, not a made-up Chinese label
    expect(s?.categories[0]?.order).toBe(1);
    expect(s?.categories[1]?.expand).toBeUndefined(); // an unknown expansion is not honoured
    expect(s?.expansions.okNo).toEqual(["ok", "no"]);
  });

  it("makes a hand-edit VISIBLE — added, removed and reworded categories", () => {
    cover("adminui-voice-schema");
    const edited = parseCategorySchema({
      categories: [
        { id: "quote", label: "角色台詞", order: 1 },
        { id: "sneeze", label: "打噴嚏", order: 2 },
      ],
    });
    const drift = schemaDrift(edited!);
    expect(drift.added).toEqual(["sneeze"]);
    expect(drift.removed).toContain("victory");
    expect(drift.relabelled).toEqual([{ id: "quote", was: "角色名言", now: "角色台詞" }]);
    expect(drift.countChanged).toBe(true);
    // and the untouched snapshot reports no drift against itself
    const clean = schemaDrift(BUNDLED_SCHEMA);
    expect(clean.added).toEqual([]);
    expect(clean.removed).toEqual([]);
    expect(clean.relabelled).toEqual([]);
    expect(clean.countChanged).toBe(false);
  });
});

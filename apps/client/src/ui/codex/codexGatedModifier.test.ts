/**
 * THE CODEX MUST NOT PRINT A SELF-CONTRADICTING STAT BLOCK.
 *
 * 貫雷槍 (godie-i01g) authors 「近戰攻擊距離+4；遠戰攻擊距離+2」 as TWO rows on
 * one stat, separated only by a `requires` 職業限定閘. The codex normaliser used
 * to DROP that key, so the detail page rendered:
 *
 *     攻擊距離 +4
 *     攻擊距離 +2
 *
 * — two bare lines about the same stat, with nothing on the page to tell a
 * reader that he gets exactly one of them. That is not a missing nicety; it is
 * the page actively teaching the wrong thing about the item, and the only
 * conclusion available to a careful reader is that something is broken.
 *
 * The shop card had solved this already (`panels/itemStats.formatAuthoredBonus`
 * appends `requirementShortLabel`). The codex simply never carried the field, so
 * two surfaces described the same content two different ways — with the codex
 * being the one that is supposed to show 「the file on disk」.
 *
 * ⚠️ ASSERTED AGAINST THE SHIPPED DOC (CLAUDE.md 失敗形態 ⑤). A fixture proving
 * the normaliser *can* carry `requires` would stay green while the real 貫雷槍
 * doc rendered wrong. The behaviour under test is the FINAL STRING a player
 * reads, not the presence of a property (失敗形態 ⑦ 「掃屬性代替掃行為」).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { normaliseItem } from "./codexData";
import { formatModifier } from "./codexLabels";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../../content");

/** The shipped 貫雷槍 doc, read the way the codex reads it: raw JSON. */
function lanceDoc(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(CONTENT_DIR, "items/godie-i01g.json"), "utf-8")) as Record<
    string,
    unknown
  >;
}

describe("codex renders the 職業限定閘 on the row it qualifies", () => {
  it("貫雷槍's two 攻擊距離 rows are LABELLED 近戰 / 遠程, not printed bare", () => {
    cover("codex-gated-modifier-lance");
    const item = normaliseItem(lanceDoc());
    expect(item).not.toBeNull();
    const lines = item!.modifiers.map(formatModifier);

    // The exact strings a player reads. Both rows present, and DISTINGUISHABLE.
    expect(lines).toContain("攻擊距離 +4（近戰）");
    expect(lines).toContain("攻擊距離 +2（遠程）");

    // THE REGRESSION, stated as its own assertion so a failure names it: the
    // bare forms are what the page printed while `requires` was being stripped.
    expect(lines).not.toContain("攻擊距離 +4");
    expect(lines).not.toContain("攻擊距離 +2");

    // No two rows may render identically — that is the reader's whole problem.
    expect(new Set(lines).size).toBe(lines.length);
  });

  it("an UNGATED modifier still prints bare — no empty parens on 218 other items", () => {
    cover("codex-gated-modifier-ungated");
    const item = normaliseItem({
      id: "t1",
      name: "t",
      cost: 100,
      modifiers: [{ stat: "ad", op: "flat", value: 30 }],
    });
    expect(item!.modifiers.map(formatModifier)).toEqual(["攻擊力 +30"]);
    expect(item!.modifiers[0]!.requires).toBeUndefined();
  });

  it("a requirement that constrains NOTHING prints bare, not （）", () => {
    cover("codex-gated-modifier-empty");
    // `{}` and an unknown axis both mean 「everybody」 — see requirement.ts. A
    // naive carry-through would render 「攻擊力 +30（）」.
    for (const requires of [{}, { attackType: "amphibious" }, "nonsense", null]) {
      const item = normaliseItem({
        id: "t2",
        name: "t",
        cost: 100,
        modifiers: [{ stat: "ad", op: "flat", value: 30, requires }],
      });
      expect(item!.modifiers.map(formatModifier), JSON.stringify(requires)).toEqual(["攻擊力 +30"]);
    }
  });

  it("carries the 主屬性 axis and the reduced-mode percentage", () => {
    cover("codex-gated-modifier-axes");
    const item = normaliseItem({
      id: "t3",
      name: "t",
      cost: 100,
      modifiers: [
        { stat: "ap", op: "flat", value: 10, requires: { primaryStat: "INT" } },
        {
          stat: "armor",
          op: "flat",
          value: 5,
          requires: { attackType: "melee", primaryStat: "STR", onMismatch: "reduced", mismatchScale: 0.4 },
        },
        // Out of bounds on purpose: the codex must never print a percentage the
        // sim would refuse to apply (requirement.ts clamps to [0,1]).
        {
          stat: "mr",
          op: "flat",
          value: 5,
          requires: { attackType: "ranged", onMismatch: "reduced", mismatchScale: 5 },
        },
      ],
    });
    expect(item!.modifiers.map(formatModifier)).toEqual([
      "法術強度 +10（智力）",
      "護甲 +5（近戰·力量，其他 40%）",
      "魔法抗性 +5（遠程，其他 100%）",
    ]);
  });
});

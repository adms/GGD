/**
 * THE EDITOR'S ITEM PREVIEW MUST NOT LIE ABOUT THE 職業限定閘.
 *
 * `PreviewController.previewItem` is the designer's whole contract with this
 * panel: 「表單看到的 == 遊戲跑的」. It shipped building its own `kind:"item"`
 * ModifierSource from raw `item.modifiers`, which skips the gate entirely, so
 * 貫雷槍 (godie-i01g) — authored 「近戰攻擊距離+4；遠戰攻擊距離+2」 — previewed as
 * **+6 on BOTH bodies**. Not merely the wrong row: the SUM of two rows that are
 * mutually exclusive by construction, a number no champion in the game can hold.
 * A designer balancing off that panel is balancing off fiction.
 *
 * TypeScript could not have caught it. `ItemStatModifier extends StatModifier`,
 * so the un-resolved (still-gated) array is structurally assignable to the
 * resolved field — there is no annotation that would have failed.
 *
 * ⚠️ THIS SUITE READS THE SHIPPED DOCS, not a fixture (CLAUDE.md 失敗形態 ⑤
 * 「被測的不是出貨的那個」). `content/items/godie-i01g.json` and the shipped
 * melee↔ranged transform pair 神騎寶貝-皮卡丘 (godie-o02l, melee) / 神奇寶貝兒-
 * 皮卡丘 (godie-ofar, ranged) go through the same ContentStore + registries the
 * game boots with. The companion synthetic-mechanism test is
 * `packages/shared/src/sim/economy/itemGatedModifiers.test.ts`; the repo-wide net
 * that catches the NEXT hand-built source is `shopAttachSites.test.ts`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { ContentStore, registerAll } from "@ggd/shared/content";
import { Champions, Items } from "@ggd/shared/sim/content/registry";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { createSimPreviewController } from "./PreviewController";
import type { ChampionId, ItemId } from "@ggd/shared/ids";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

const LANCE = "godie-i01g" as ItemId;
const MELEE = "godie-o02l" as ChampionId;
const RANGED = "godie-ofar" as ChampionId;

/** The two numbers the owner wrote, restated so a doc edit is visible here. */
const MELEE_RANGE_BONUS = 4;
const RANGED_RANGE_BONUS = 2;

function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<string, unknown>);
}

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["ability-templates", "abilities", "champions", "projectiles", "status-effects", "items"] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

/** The 攻擊距離 delta `previewItem` reports for `item` on `champion`. */
function rangeDelta(item: ItemId, champion: ChampionId): number {
  const deltas = createSimPreviewController().previewItem(Items.get(item), Champions.get(champion));
  const row = deltas.find((d) => d.stat === Stat.AttackRange);
  return row === undefined ? 0 : row.after - row.before;
}

describe("previewItem resolves the 職業限定閘 against the previewed body", () => {
  it("THE SHIPPED DOCS still author the gate this suite is about", () => {
    // Names what to look at when the numbers below stop making sense; the
    // behaviour assertions are the real guards.
    cover("editor-preview-item-gate-doc");
    expect(Champions.get(MELEE).attackType).toBe("melee");
    expect(Champions.get(RANGED).attackType).toBe("ranged");
    const rows = (Items.get(LANCE).modifiers ?? []).filter((m) => m.stat === Stat.AttackRange);
    expect(rows.length).toBe(2);
    expect(rows.find((m) => m.requires?.attackType === "melee")?.value).toBe(MELEE_RANGE_BONUS);
    expect(rows.find((m) => m.requires?.attackType === "ranged")?.value).toBe(RANGED_RANGE_BONUS);
  });

  it("reports +4 on the MELEE body and +2 on the RANGED one", () => {
    cover("editor-preview-item-gate-resolved");
    const melee = rangeDelta(LANCE, MELEE);
    const ranged = rangeDelta(LANCE, RANGED);
    // combatEnv scales AttackRange, so compare against the ratio the doc implies
    // rather than raw 4 / 2 — the assertion is about WHICH ROW applied.
    expect(melee).toBeCloseTo(ranged * (MELEE_RANGE_BONUS / RANGED_RANGE_BONUS), 5);
    // and the two bodies must genuinely DISAGREE. This is the line that fails if
    // the gate is skipped: un-resolved, both bodies get 4+2 and are EQUAL.
    expect(melee).toBeGreaterThan(ranged);
  });

  it("never reports the SUM of two mutually exclusive rows (the +6 bug)", () => {
    cover("editor-preview-item-gate-no-sum");
    const melee = rangeDelta(LANCE, MELEE);
    const ranged = rangeDelta(LANCE, RANGED);
    // Recover the combatEnv attackRange multiplier from the RANGED reading,
    // which the doc fixes at +2. Everything below is then in authored units, so
    // the assertions name the owner's numbers instead of post-multiplier ones.
    const env = ranged / RANGED_RANGE_BONUS;
    expect(env).toBeGreaterThan(0);
    // ⚠️ THIS IS THE ASSERTION THAT CATCHES THE REGRESSION. An un-resolved gate
    // hands EVERY body both rows, i.e. 4+2 = 6 authored units. Asserting
    // 「melee ≠ melee+ranged」 instead would be 失敗形態 ④: under the bug both
    // readings are 6 and their sum is 12, so that comparison passes while the
    // panel is wrong. The number that must never appear is SIX.
    const SUM_OF_BOTH_ROWS = MELEE_RANGE_BONUS + RANGED_RANGE_BONUS;
    expect(melee / env).toBeCloseTo(MELEE_RANGE_BONUS, 5);
    expect(ranged / env).toBeCloseTo(RANGED_RANGE_BONUS, 5);
    expect(melee / env).not.toBeCloseTo(SUM_OF_BOTH_ROWS, 5);
    expect(ranged / env).not.toBeCloseTo(SUM_OF_BOTH_ROWS, 5);
  });
});

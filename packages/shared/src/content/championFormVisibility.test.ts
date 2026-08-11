/**
 * 變身 VISIBILITY (task #249) — every transform a player can reach must be one
 * the player can SEE.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO MAKE LOUD
 * ---------------------------------------------------------------------------
 * `sim/championFormAdoption.test.ts` ships three transforms and states the rule
 * it picked them by: 「THE SWAP IS VISIBLE — the two halves resolve to DIFFERENT
 * `modelKey`s … 19 of the other pairs share one mesh between their halves (they
 * are still correct, just invisible), and those wait for art rather than
 * shipping as a transform nobody can see.」
 *
 * That rule lived only in a comment, and a comment cannot fail. So when this
 * pass wired the remaining `championForm` effects into the ability docs, every
 * newly-reachable transform whose two halves share a mesh became CLAUDE.md
 * failure ① — computed, sent, applied to the stat sheet, and invisible on
 * screen. Nothing in the suite went red, because nothing was measuring it.
 *
 * ---------------------------------------------------------------------------
 * WHAT MAKES A TRANSFORM VISIBLE
 * ---------------------------------------------------------------------------
 * Exactly two things, and this suite reads both off the shipped content:
 *
 *   1. the two halves resolve to DIFFERENT `modelKey`s — a genuinely different
 *      mesh walks out; or
 *   2. `content/config/form-visuals.json` carries an entry KEYED BY THE
 *      ALTERNATE's championId, giving it a `tint` and/or `scaleMult` — the
 *      config that exists precisely so a same-mesh pair can still read as a
 *      transform (its own note calls those numbers 美術決定, not w3x facts).
 *
 * A pair with neither is art debt, and {@link ART_DEBT} is the ledger of it.
 * The list is the deliverable: it names exactly which heroes are owed a
 * form-visuals entry before their transform means anything on screen.
 *
 * ---------------------------------------------------------------------------
 * WHY AN ALLOW-LIST AND NOT A BARE ASSERTION
 * ---------------------------------------------------------------------------
 * Same reason `fieldAdoption.test.ts` carries landing exemptions: a bare
 * "everything must be visible" would be red on arrival and would simply be
 * deleted. An explicit ledger is red the moment someone wires a TWENTIETH
 * transform without thinking about art, and it shrinks by deletion as
 * form-visuals entries land — the debt cannot be paid off silently, and it
 * cannot grow silently either.
 *
 * ⚠️ Adding an id here is only correct for a pair that really does share a mesh
 * AND really has no form-visuals entry. Removing one is only correct once the
 * pair passes on its own. Both directions are checked below, so this list can
 * never drift into decoration.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { CHAMPION_FORM_PAIRS } from "./championForms";
import { retiredChampionIdsFromDoc } from "./championRetirement";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

type Doc = Record<string, unknown>;

function docs(collection: string): Doc[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Doc);
}

/**
 * Alternate-form champion ids whose transform is currently INVISIBLE: the two
 * halves share a `modelKey` and no `form-visuals` entry gives the body a tint
 * or a scale of its own. Keyed by the ALTERNATE, matching form-visuals itself.
 *
 * 18 entries: the 17 still wired (of the 18 this pass wired — 20 Saber already
 * had a form-visuals entry, and 12 天地志狼 lost its entry ability entirely when
 * owner 2026-08-12 ruled 「刻意減少變身」) plus 70 紮根, which was ALREADY shipped
 * invisible before this pass and which nothing was measuring — this suite found
 * it, not a human.
 *
 * None of these is a bug in the transform: the swap and the stat sheet are
 * correct. They are art debt, and until it is paid the player feels the numbers
 * change and sees nothing.
 */
const ART_DEBT: ReadonlySet<string> = new Set([
  "godie-e010", // 70 白木卡迪那 紮根 — PRE-EXISTING, shipped invisible before this pass
  "godie-e00n", // 22 龍宮禮奈
  "godie-e00z", // 19 安云
  "godie-e00x", // 77 櫻綻剎那
  // owner 2026-08-12 裁決：「是的，我刻意減少變身的技能，減少額外設定開銷」——
  // 舊行為 12 天地志狼 的 12-03 破凰之心 是一支 Metamorphosis，變身成 godie-e007，
  // 而那個第二身體跟本體共用一顆 mesh，所以它欠一筆美術債；
  // 新規格 12-03 是 [被動][暴擊][機率][普攻時][AP加成]，一個變身字都沒有 ——
  // 這個變身**沒有入口了**，godie-e007 也已經進 roster.json 的 retiredChampions。
  // 一筆沒有人會看到的美術債不是債，所以它從帳本上離開的方式是「不再 reachable」，
  // 不是「有人畫了 form-visuals」。⚠️ 這一格由下面「the ledger is exact」把關：
  // 12 的變身若哪天重新接上入口，它會立刻要求把這個 id 放回來。
  "godie-h01o", // 79 黑崎一護 卍解
  "godie-h02u", // 92 草泥馬 臥草
  "godie-h00w", // 26 鄭先生 洨者聖臨
  "godie-h02r", // 90 妙蛙花
  "godie-h020", // 04 莉娜因巴斯
  "godie-n01g", // 42 依文潔琳
  "godie-n01c", // 08 勇者小呆 龍魔人
  "godie-n01b", // 40 憤怒的胖虎 萬解
  "godie-o02v", // 81 高町奈葉 白色惡魔
  "godie-o02o", // 87 阿瞞大人
  "godie-o030", // 30 臭作 變態紳士
  "godie-u00o", // 76 魯夫 二檔
  "godie-u01u", // 11 索隆 武裝色霸氣
  "godie-u010", // 38 飛影 邪眼全開
]);

interface Reachable {
  /** the ability doc that carries the championForm effect */
  abilityId: string;
  baseId: string;
  altId: string;
  sameMesh: boolean;
  hasFormVisual: boolean;
}

/**
 * Every transform a player can actually press, resolved from the SHIPPED docs:
 * an ability doc carrying a `championForm` effect, owned by a champion that
 * declares `transform.role === "base"`, with a `counterpartId` to travel to.
 *
 * Read by direct path rather than through `ContentLoader`, like
 * abilityMirror/icons/championFormContent — so it is green both before and
 * after `pnpm content:build`.
 */
function reachableTransforms(): Reachable[] {
  const champs = new Map(docs("champions").map((d) => [d.id as string, d]));
  const formVisuals = (
    JSON.parse(readFileSync(join(CONTENT_DIR, "config/form-visuals.json"), "utf-8") as string) as {
      forms: Record<string, unknown>;
    }
  ).forms;

  const out: Reachable[] = [];
  for (const ab of docs("abilities")) {
    const effects = (ab.effects ?? []) as Array<{ kind?: string; to?: string }>;
    if (!effects.some((e) => e.kind === "championForm")) continue;
    // the owning champion is the id prefix of `<championId>.<slot>`
    const baseId = String(ab.id).split(".")[0]!;
    const champ = champs.get(baseId);
    const link = champ?.transform as
      | { role?: string; counterpartId?: string }
      | undefined;
    // Only the BASE half is reachable in a match: `spawnChampion` binds ability
    // ids once, from the picked (base) champion, and never re-reads them after
    // a swap — so the alternate's mirrored copy is never cast.
    if (link?.role !== "base" || !link.counterpartId) continue;
    const alt = champs.get(link.counterpartId);
    if (!alt) continue;
    out.push({
      abilityId: String(ab.id),
      baseId,
      altId: link.counterpartId,
      sameMesh: champ!.modelKey === alt.modelKey,
      hasFormVisual: Object.prototype.hasOwnProperty.call(formVisuals, link.counterpartId),
    });
  }
  return out;
}

describe("every reachable 變身 is one the player can see (#249)", () => {
  it("finds the reachable transforms at all — vacuity guard", () => {
    cover("champion-form-visibility");
    const found = reachableTransforms();
    // The floor is DERIVED, never a copied literal: 26 w3x pairs, minus the ones
    // shipped content says nobody can reach. Two ways a pair leaves that count,
    // and both are read back out rather than written down:
    //
    //   · UNREACHABLE_BY_DESIGN — 61 鳳凰蛋 is a death-state morph with no trigger
    //     ability at all (task #119 owns it); `godie-u011` even ships maxHealth
    //     -450, so it is not a body anyone is meant to walk around in.
    //   · RETIRED — owner 2026-08-12 裁決:「是的，我刻意減少變身的技能，減少額外
    //     設定開銷」—— 舊行為 12-03 破凰之心 was a Metamorphosis into godie-e007,
    //     新規格 12-03 是 [被動][暴擊][機率][普攻時][AP加成]，所以那個變身沒有
    //     入口了，而 e007 進了 roster.json 的 retiredChampions。
    //
    // Written as a floor (the roster may grow a transform that is not a w3x
    // pair), but the interesting failure is downward: un-retire e007 without
    // giving 12 an entry ability again and this goes red instead of every
    // assertion below quietly passing on a shrunken set.
    const retired = retiredChampionIdsFromDoc(
      JSON.parse(readFileSync(join(CONTENT_DIR, "config/roster.json"), "utf-8")),
    );
    const UNREACHABLE_BY_DESIGN: ReadonlySet<string> = new Set(["godie-u011"]);
    const expectedReachable = CHAMPION_FORM_PAIRS.filter(
      (p) =>
        !UNREACHABLE_BY_DESIGN.has(p.alternateId) &&
        !retired.has(p.alternateId) &&
        !retired.has(p.baseId),
    ).length;
    expect(expectedReachable, "the pair table or the retirement list has collapsed").toBeGreaterThan(
      20,
    );
    expect(found.length).toBeGreaterThanOrEqual(expectedReachable);
    expect(found.every((r) => r.baseId !== "" && r.altId !== "")).toBe(true);
  });

  it("no reachable transform is invisible unless it is on the art-debt ledger", () => {
    cover("champion-form-visibility");
    const invisible = reachableTransforms().filter((r) => r.sameMesh && !r.hasFormVisual);
    // Collect EVERY offender before failing: a bare expect inside the loop
    // would report 1 defect for 18.
    const unlisted = invisible.filter((r) => !ART_DEBT.has(r.altId));
    expect(
      unlisted.map((r) => `${r.abilityId} → ${r.altId} (same mesh, no form-visuals entry)`),
      "a transform was wired that the player cannot see, and it is not on ART_DEBT",
    ).toEqual([]);
  });

  it("the ledger is exact — nothing on it has quietly become visible", () => {
    cover("champion-form-visibility");
    const invisible = new Set(
      reachableTransforms()
        .filter((r) => r.sameMesh && !r.hasFormVisual)
        .map((r) => r.altId),
    );
    const stale = [...ART_DEBT].filter((id) => !invisible.has(id));
    expect(
      stale,
      "these ids are on ART_DEBT but are already visible — delete them from the list",
    ).toEqual([]);
    // and the ledger is the whole of the debt, not a sample
    expect(invisible.size).toBe(ART_DEBT.size);
  });

  it("a transform with a DIFFERENT mesh needs no ledger entry", () => {
    cover("champion-form-visibility");
    // The three shipped in the first batch (妖狐藏馬 / 拳四郎 / 皮卡丘) plus
    // 傑富力士 swap to a genuinely different body. If a future edit points a
    // pair at one shared mesh, it drops out of here and into the assertion
    // above — which is the whole point of measuring the mesh rather than
    // counting how many docs carry the effect.
    const byBase = new Map(reachableTransforms().map((r) => [r.baseId, r]));
    for (const base of ["godie-nsjs", "godie-umal", "godie-ofar", "godie-ucrl"]) {
      const r = byBase.get(base);
      expect(r, `${base} is reachable`).toBeDefined();
      expect(r!.sameMesh, `${base} swaps to a different mesh`).toBe(false);
      expect(ART_DEBT.has(r!.altId), `${base} is not art debt`).toBe(false);
    }
  });
});

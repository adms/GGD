/**
 * shopAttachSites — THE NET. Nobody may hand-build a `kind: "item"`
 * ModifierSource outside `economy/itemSource.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS (and why it did not, until 2026-08-01)
 *
 * `economy/shop.ts` carried a comment claiming 「`shopAttachSites.test.ts`
 * drives all three paths ... so dropping any ONE of them back to a hand-built
 * literal goes red」. **THE FILE DID NOT EXIST.** A `find` over the tree
 * returned nothing (CLAUDE.md 第三守則 — 註解會說謊). The claim was not merely
 * decorative: it was cited as the reason the 職業限定閘 was safe to resolve at
 * attach time, and its absence is exactly how the sixth site shipped broken.
 *
 * The BEHAVIOURAL half of the claim is real, just under another name:
 * `itemGatedModifiers.test.ts` 「every attach site resolves the gate — buy /
 * undo-sell / free grant」 drives all three shop paths and compares the resolved
 * lists. That test is not duplicated here. But it can only ever check the three
 * sites it names — it is structurally incapable of noticing a FOURTH, and that
 * is precisely what went wrong:
 *
 *   `apps/editor/src/preview/PreviewController.ts.previewItem` built the source
 *   by hand from raw `item.modifiers`, so the gate was never resolved and 貫雷槍
 *   (godie-i01g, 「近戰攻擊距離+4；遠戰攻擊距離+2」) previewed as **+6 on BOTH
 *   bodies** — a number no champion in the game can receive, shown to the person
 *   whose whole job is to trust that panel.
 *
 * TypeScript cannot catch it: `ItemStatModifier extends StatModifier`, so an
 * UN-resolved (still-gated) array is structurally assignable to the resolved
 * field. There is no type to add that would have failed. Only a structural check
 * over the source can, so that is what this file is.
 *
 * ⚠️ THIS IS A SOURCE SCAN, i.e. CLAUDE.md 失敗形態 ⑥ (「用掃原始碼字串代替行為」)
 * ON PURPOSE, and it is only defensible because the behaviour is already guarded
 * elsewhere. This is the NET for the site that does not exist yet, not the
 * assertion that the mechanism works. It also parses with the real TypeScript
 * AST rather than grepping strings, so a `kind: "item"` inside a comment or a
 * template literal cannot produce a phantom failure — and, more importantly, the
 * detector is exercised against the real regression in `describe("the detector
 * itself")` below, so a walker that silently scans zero files fails instead of
 * passing vacuously.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { cover } from "../../../testkit/cover";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../../../..");

/** Where a production `kind:"item"` ModifierSource may legally be constructed. */
const THE_ONE_BUILDER = join("packages", "shared", "src", "sim", "economy", "itemSource.ts");

/**
 * The OTHER file allowed to mint a `kind: "item"` source — 套裝
 * (`economy/itemSets.ts`), added 2026-08-01.
 *
 * ⚠️ WHY AN EXCEPTION IS SAFE HERE AND NOWHERE ELSE. This guard exists because a
 * hand-built literal SKIPS THE 職業限定閘 — it copies raw `item.modifiers` and
 * TypeScript cannot see the difference. `itemSets.ts` does not: its one literal's
 * `modifiers` initializer is `resolveGatedModifiers`, the same call
 * `itemModifierSource` makes, and `theBuilderIsHonest` below asserts that for
 * BOTH files rather than trusting this paragraph. A source keyed to a SET cannot
 * live in `itemSource.ts` anyway — it is not per-slot, it is per-inventory, so it
 * has no `(itemId, slot)` to be built from.
 *
 * Adding a THIRD entry here should be argued, not assumed: every entry is one
 * more place the gate can be forgotten.
 */
const THE_SET_BUILDER = join("packages", "shared", "src", "sim", "economy", "itemSets.ts");

/** Both legal construction sites, as repo-relative platform paths. */
const LEGAL_BUILDERS = [THE_ONE_BUILDER, THE_SET_BUILDER];

/** Roots that ship code to a player or a designer. */
const SCAN_ROOTS = ["apps", "packages"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".vite", "coverage", ".turbo"]);

/**
 * A wrong REPO_ROOT (or a skip-list that ate everything) would make every
 * assertion below pass while checking nothing. Measured at 2026-08-01: 1,900+
 * files match. The floor is deliberately far below that — it is a smoke alarm
 * for 「scanned nothing」, not a census nobody may change.
 */
const MIN_FILES_SCANNED = 400;

interface Site {
  readonly file: string;
  readonly line: number;
}

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    // Test files legitimately hand-build sources as FIXTURES to drive the hook /
    // aura machinery (incomingReflect.test.ts, condition.test.ts, evasion.test.ts
    // …). A fixture is not a path a player's stats travel down, and forcing them
    // through the registry-backed builder would make them test the builder
    // instead of the thing under test.
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/**
 * Fields that exist on `ModifierSource` and on NOTHING ELSE carrying
 * `kind: "item"`. `modifiers` is deliberately absent from this list: `CodexItem`
 * (codexTypes.ts) is also `{kind:"item", id, …, modifiers}`, so keying on it
 * alone makes the codex normaliser a permanent false positive — and a guard that
 * cries wolf is a guard the third person to hit it deletes.
 *
 * Kept in sync with `stats/modifiers.ts` by the 「ONE legal builder」 test below,
 * which fails if the real builder stops matching this shape.
 */
const SOURCE_ONLY_KEYS = [
  "hooks",
  "auras",
  "grantedAbilities",
  "expiresAtTick",
  "stacks",
  "visualStacks",
  "damageReduction",
  "hookLastFired",
  "hookLastFiredBySlot",
  "auraOrigin",
];

/**
 * Every `kind: "item"` object literal in `source` that is SHAPED LIKE a
 * ModifierSource.
 *
 * The discriminator matters as much as the search: `kind: "item"` on its own is
 * all over the tree and is usually NOT a ModifierSource — it is a `CodexRef`
 * (`{kind:"item", id}`), a draft/shop OFFER in MatchController, a coverage row,
 * a normalised `CodexItem`. Two ways to qualify, so neither a rich literal nor a
 * minimal one escapes:
 *
 *   ① it carries a ModifierSource-EXCLUSIVE key (`hooks`, `auras`, `stacks`, …)
 *      — which is how the PreviewController regression is caught; or
 *   ② it carries `modifiers` AND is handed straight to an `attach*Source(…)`
 *      call, i.e. it is being installed on a champion right now. This is the arm
 *      that catches the minimal future site `{id, kind:"item", modifiers}`,
 *      which arm ① cannot see.
 */
const namedProp = (
  o: ts.ObjectLiteralExpression,
  key: string,
): ts.ObjectLiteralElementLike | undefined =>
  o.properties.find((p) => p.name !== undefined && ts.isIdentifier(p.name) && p.name.text === key);

/** Is this literal an argument to `attachSource` / `attachItemSource` / …? */
function isAttachArgument(node: ts.ObjectLiteralExpression): boolean {
  const call = node.parent;
  if (call === undefined || !ts.isCallExpression(call) || !call.arguments.includes(node)) return false;
  const callee = call.expression;
  const name = ts.isPropertyAccessExpression(callee)
    ? callee.name.text
    : ts.isIdentifier(callee)
      ? callee.text
      : "";
  return /^attach\w*Source$/.test(name);
}

/** THE predicate, shared by the scanner and the builder check (never duplicated). */
function isItemSourceLiteral(node: ts.ObjectLiteralExpression): boolean {
  const kind = namedProp(node, "kind");
  const isItem =
    kind !== undefined &&
    ts.isPropertyAssignment(kind) &&
    ts.isStringLiteralLike(kind.initializer) &&
    kind.initializer.text === "item";
  if (!isItem || namedProp(node, "id") === undefined) return false;
  const exclusive = SOURCE_ONLY_KEYS.some((k) => namedProp(node, k) !== undefined);
  const attachedNow = namedProp(node, "modifiers") !== undefined && isAttachArgument(node);
  return exclusive || attachedNow;
}

function eachItemSourceLiteral(
  source: string,
  fileName: string,
  fn: (node: ts.ObjectLiteralExpression, sf: ts.SourceFile) => void,
): void {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node) && isItemSourceLiteral(node)) fn(node, sf);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function findItemSourceLiterals(source: string, fileName: string): number[] {
  const hits: number[] = [];
  eachItemSourceLiteral(source, fileName, (node, sf) => {
    hits.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
  });
  return hits;
}

/**
 * The name of the function called to produce the `modifiers` of the ONE
 * `kind:"item"` ModifierSource literal in `source` — `"resolveGatedModifiers"`
 * when the gate is honoured, `null` when the value is forwarded raw.
 *
 * Deliberately reads the initializer of THAT literal's property rather than
 * searching the file for a substring: `itemSource.ts` legitimately calls
 * `resolveGatedModifiers` twice (the builder AND `syncItemSources`), so a text
 * match cannot distinguish 「the builder resolves」 from 「something in this file
 * resolves」 — and that is exactly how the first version of this test passed a
 * mutation that gutted the builder.
 */
function modifiersInitializerOf(source: string, fileName: string): string | null {
  let found: string | null = null;
  eachItemSourceLiteral(source, fileName, (node) => {
    const mods = namedProp(node, "modifiers");
    if (mods !== undefined && ts.isPropertyAssignment(mods) && ts.isCallExpression(mods.initializer)) {
      const callee = mods.initializer.expression;
      if (ts.isIdentifier(callee)) found = callee.text;
    }
  });
  return found;
}

function scanRepo(): { sites: Site[]; filesScanned: number } {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);
  const sites: Site[] = [];
  for (const full of files) {
    const rel = relative(REPO_ROOT, full);
    if (LEGAL_BUILDERS.includes(rel.split("/").join(sep))) continue;
    for (const line of findItemSourceLiterals(readFileSync(full, "utf-8"), full)) {
      sites.push({ file: rel, line });
    }
  }
  return { sites, filesScanned: files.length };
}

// ---------------------------------------------------------------------------
// THE NET
// ---------------------------------------------------------------------------

describe("every kind:\"item\" ModifierSource comes from economy/itemSource.ts", () => {
  it("no production file hand-builds one", () => {
    cover("shop-attach-sites-structural");
    const { sites, filesScanned } = scanRepo();
    // Proves the walker actually walked. Without this a bad REPO_ROOT turns the
    // assertion below into `expect([]).toEqual([])` — green, and blind.
    expect(filesScanned).toBeGreaterThan(MIN_FILES_SCANNED);
    expect(
      sites,
      `A kind:"item" ModifierSource must be built by attachItemSource / ` +
        `itemModifierSource (packages/shared/src/sim/economy/itemSource.ts), never by hand — ` +
        `a literal skips the 職業限定閘 (\`requires\`) and TypeScript cannot see it, because ` +
        `ItemStatModifier extends StatModifier. Offending site(s): ` +
        sites.map((s) => `${s.file}:${s.line}`).join(", "),
    ).toEqual([]);
  });

  it("the ONE legal builder is still there and still resolves the gate", () => {
    cover("shop-attach-sites-builder-intact");
    // Guards the other direction: someone "fixes" this suite by deleting the
    // builder, or by making itemModifierSource forward `def.modifiers` raw.
    //
    // ⚠️ This assertion was a `toContain("resolveGatedModifiers(world, holder,
    // def.modifiers)")` and it was USELESS — mutation-tested 2026-08-01: gutting
    // `itemModifierSource` to `modifiers: def.modifiers` left the suite GREEN,
    // because `syncItemSources` (further down the same file) contains that exact
    // substring. A string search cannot tell two functions apart. So the check
    // reads the AST and pins the initializer of THE builder's `modifiers`
    // property specifically.
    for (const builder of LEGAL_BUILDERS) {
      const src = readFileSync(join(REPO_ROOT, builder), "utf-8");
      const literals = findItemSourceLiterals(src, builder);
      expect(literals.length, `${builder}'s ModifierSource literal`).toBe(1);
      // BOTH legal builders must resolve the gate — that is the entire reason
      // either of them is allowed to build one.
      expect(modifiersInitializerOf(src, builder), builder).toBe("resolveGatedModifiers");
    }
  });
});

// ---------------------------------------------------------------------------
// THE DETECTOR ITSELF — a scanner nobody tests is a scanner that scans nothing
// ---------------------------------------------------------------------------

describe("the detector itself", () => {
  /** VERBATIM the literal that shipped in PreviewController.previewItem. */
  const THE_REGRESSION = `
    attachSource(sb.world, sb.id, {
      id: \`preview:item:\${item.id}\`,
      kind: "item",
      modifiers: item.modifiers,
      hooks: item.passive,
    });
  `;

  it("FIRES on the exact literal that shipped the +6 preview bug", () => {
    cover("shop-attach-sites-detector-positive");
    expect(findItemSourceLiterals(THE_REGRESSION, "regression.ts")).toEqual([2]);
  });

  it("FIRES on the MINIMAL future site that carries no exclusive key", () => {
    cover("shop-attach-sites-detector-minimal");
    // Arm ②. `{id, kind, modifiers}` shares every key with a CodexItem, so only
    // the fact that it is being ATTACHED right now identifies it.
    expect(
      findItemSourceLiterals(`attachSource(w, e, { id: "x", kind: "item", modifiers: def.modifiers });`, "e.ts"),
    ).toEqual([1]);
  });

  it("does NOT fire on the look-alikes that are not ModifierSources", () => {
    cover("shop-attach-sites-detector-negative");
    // CodexRef — `{kind:"item", id}`, no payload. All over codex/ and MatchController.
    expect(findItemSourceLiterals(`const r = { kind: "item", id: it.id };`, "a.ts")).toEqual([]);
    // A draft/shop OFFER (MatchController) — same discriminant, different type.
    expect(
      findItemSourceLiterals(`push({ kind: "item", tier: 3, itemId: id, cost: 100 });`, "b.ts"),
    ).toEqual([]);
    // Another source KIND that legitimately carries modifiers (augment/passive).
    expect(
      findItemSourceLiterals(`attachSource(w, e, { id: "a", kind: "augment", modifiers: m });`, "c.ts"),
    ).toEqual([]);
    // THE ONE THAT MADE THIS DISCRIMINATOR NECESSARY: codexData.normaliseItem
    // returns `{kind:"item", id, …, modifiers}` and is not a source at all.
    expect(
      findItemSourceLiterals(
        `return { kind: "item", id, name, cost: 0, tags, modifiers: mods, unique: false, doc };`,
        "codexData.ts",
      ),
    ).toEqual([]);
  });

  it("is not fooled by the word appearing in a comment or a string", () => {
    cover("shop-attach-sites-detector-text");
    // This is the whole reason it parses instead of grepping: prose about the
    // rule (there is a lot of it) must not trip the rule.
    expect(
      findItemSourceLiterals(
        `// forwarded onto the kind: "item" source, with modifiers, by every attach\n` +
          `const doc = 'kind: "item", modifiers: []';`,
        "d.ts",
      ),
    ).toEqual([]);
  });
});

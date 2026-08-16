/**
 * The FIRST OPEN ROSTER (對戰可選名單), read from TRACKED source.
 *
 * WHY THIS EXISTS. The live roster a deployment offers in champ-select is the
 * operator's curation whitelist — `data/curation/whitelist.json` — which is
 * deliberately `.gitignore`d (it is operational state, not a program constant).
 * A test that reads it therefore works ONLY on the owner's machine and dies of
 * ENOENT in every fresh clone, worktree and CI run. That is not a flaky test,
 * it is a test that never ran.
 *
 * The seed of that whitelist, however, IS tracked: `starterChampions` in
 * apps/platform/internal/curation/starter.go is the hand-picked champion
 * bundle a fresh install applies (`ApplyStarterSet`) — 53 ids as of owner
 * 2026-07-30; `starterRoster.test.ts` owns the pinned count — id-for-id by
 * Go's TestFirstOpenRoster and cross-checked against the content tree by
 * TestStarterSetMatchesContentTree. Parsing it gives every environment the same
 * real roster, with no fixture to drift out of date.
 *
 * The parser is intentionally strict: a starter.go that no longer declares the
 * block in the expected shape throws with an explanatory message instead of
 * quietly returning an empty roster. starter.go carries a NOTE asking the block
 * to stay `name = []string{` with one quoted id per line, for exactly this
 * reason — apps/game-server/src/curation/whitelist.test.ts parses it too.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Path of the tracked bundle, relative to the repo root. */
export const STARTER_GO_REL = "apps/platform/internal/curation/starter.go";

/**
 * Pull one `name = []string{ "a", "b" }` block's quoted ids out of Go source.
 * Throws when the block is absent or unterminated — a silently empty list would
 * turn a sweep into a no-op, which is the failure mode this module exists to
 * prevent.
 */
export function goStringSlice(src: string, name: string): string[] {
  const start = src.indexOf(`${name} = []string{`);
  if (start < 0) {
    throw new Error(
      `${STARTER_GO_REL} no longer declares \`${name} = []string{\` — ` +
        "the tracked roster source moved; update the parser (and starter.go's NOTE).",
    );
  }
  const open = src.indexOf("{", start);
  const close = src.indexOf("\n\t}", open);
  if (close < 0) {
    throw new Error(`could not find the end of \`${name}\` in ${STARTER_GO_REL}`);
  }
  // Drop `//` line comments FIRST: the per-entry annotations are prose and can
  // themselves contain quoted words, which the id regex would otherwise scrape
  // in as bogus elements.
  const body = src.slice(open, close).replace(/\/\/[^\n]*/g, "");
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

/**
 * The canonical champion ids of the first open roster, in declaration order.
 * ⛔ 這裡刻意**不寫數字** —— 名單長度是 `starter.go` 的事實，不是這份註解的。
 * `repoRoot` is the monorepo root (the directory holding `apps/`).
 */
export function readStarterRoster(repoRoot: string): string[] {
  const path = join(repoRoot, STARTER_GO_REL);
  let src: string;
  try {
    src = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(
      `cannot read the tracked starter roster at ${STARTER_GO_REL} ` +
        `(resolved to ${path}): ${(err as Error).message}. This file is committed — ` +
        "a checkout missing it is broken, not merely un-curated.",
    );
  }
  const ids = goStringSlice(src, "starterChampions");
  if (ids.length === 0) {
    throw new Error(`${STARTER_GO_REL} declares an EMPTY starterChampions block`);
  }
  return ids;
}

/**
 * ⭐ 名單**長度**的唯一住處 —— 從 `starter.go` 推導。
 *
 * ⚠️ 2026-08-16 之前這個數字被**抄在四個地方**（`starterRoster.test.ts` 的
 * `ROSTER_SIZE`、`castabilitySweep.test.ts`、`combatVoiceCoverage.test.ts`、
 * `bindings.test.ts`），於是 owner 下架四位英雄時**四條測試同時紅**，而每一條
 * 的訊息都在講自己的功能壞了（「語音覆蓋率不對」「VFX 綁定少了」），
 * 沒有一條說出真相：**名單變短了，這四條都是對的。**
 *
 * ⇒ 現在它們一起讀這一支。名單再變一次，四個消費端零改動。
 * 這正是 CLAUDE.md 第零守則⑨（N 個同型 = 一個模板 + 一張表）在測試上的樣子。
 */
export function starterRosterSize(repoRoot: string): number {
  return readStarterRoster(repoRoot).length;
}

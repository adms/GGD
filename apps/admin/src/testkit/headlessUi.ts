/**
 * MOVED 2026-07-31 → `packages/shared/testkit/headlessUi.ts`.
 *
 * The DOM-free interactive React renderer was written for the admin console's
 * form pages, but it is not console-specific: the EDITOR (鑄技工坊's condition
 * widget) and the CLIENT (ability/item cards) have the same problem — vitest
 * runs in plain node, `renderToString` drops every handler, so "the control is
 * on screen" was the strongest thing a test could say. Those two apps cannot
 * import out of `apps/admin`, so the harness now lives in `@ggd/shared/testkit`.
 *
 * This file stays as a RE-EXPORT so the eleven `*Save.test.ts` suites that
 * import `./testkit/headlessUi` keep working unchanged. It must stay a plain
 * re-export: the harness holds module-level state (the hook instance map, the
 * rendered tree), so a copy — rather than a re-export — would give a test that
 * mocks `react` via one path and calls `mount` via the other two disconnected
 * renderers, and every assertion would read an empty tree.
 */
export * from "@ggd/shared/testkit/headlessUi";

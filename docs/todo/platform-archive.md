# Platform data migration (一鍵 ZIP 匯出/匯入) — TODO

Task #243. `apps/platform/internal/platformarchive` + `cmd/platformarchive` +
the 資料搬遷 console page. The primary scenario is 舊主機 → **全新** 主機：export
on the old machine, import into an empty `data/`, log in with the same passwords.

## THE PLAN IS THE CONTRACT

The whole safety story of this feature is 「看試算，然後按確認」. It was not true in
the first cut, and that is what these items exist to keep fixed.

`CollectionPlan.Items` used to carry only the entries worth reading, and `Apply`
defaulted every entry it could not find in that list to `ResultAdded` and wrote
it. So a re-import of an already-imported archive showed 「將寫入 0 筆」 and then
rewrote every document in the target. Measured on the repo's own fixture:
`plan.Writes=0`, `ApplyResult.Written=169`, `Added=169`. The re-import is not an
exotic case — it is exactly what a nervous operator does when they are unsure
whether the first import worked.

The fix is structural rather than defensive:

- exactly ONE function decides a verdict (`planEntry`);
- exactly ONE path carries a verdict to a write (`Plan.Executable`), which
  resolves the approved plan back onto the archive and refuses on any mismatch;
- the plan enumerates EVERY entry, so the digest that guards the commit covers
  the per-entry verdicts and not merely the entry set.

**A note on the beacons below.** The Go suite does not emit `cover()` beacons —
only the vitest side does. Each item's beacon is therefore emitted by the guard
in `apps/admin/src/migrationGate.test.ts` that pins the corresponding Go test's
presence and the source shape that caused the bug; the Go tests themselves run
in the `go-platform` CI job (`go test ./internal/platformarchive/...`). Both have
to pass for the claim to hold, and the guard names the Go test so a rename is
loud instead of silent.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| archive-1 | The plan is COMPLETE: every entry the commit will consider appears in `CollectionPlan.Items` with the verdict the commit will reach, `unchanged` included — the console filters the list for display, the server never shortens it | archive-plan-complete | regression | done |
| archive-2 | Apply derives NO verdict of its own: it executes `Plan.Executable`, and an entry the plan did not name (or names but the archive does not carry) is a refusal with zero writes, never a silent skip and never a silent write | archive-plan-is-contract | regression | done |
| archive-3 | Re-importing the SAME archive rewrites nothing — asserted file by file on mtime, because identical bytes cannot tell "not written" from "written again" (`TestReImportWritesNothingItDidNotPromise`) | archive-reimport-zero-write | regression | done |
| archive-4 | THE PROPERTY: for a randomised mix of fresh / identical / modified / newer-target documents the plan's per-entry verdict map equals the commit's per-entry result map EXACTLY, and a blocked plan writes nothing (`TestPlanVerdictMapEqualsApplyResultMapExactly`) | archive-verdict-property | regression | done |
| archive-5 | The 409 digest guard covers the per-entry VERDICTS, not just the entry set: two targets with an identical entry set and identical aggregate counts but swapped verdicts hash differently (`TestPlanDigestCoversPerEntryVerdicts`) | archive-digest-verdicts | regression | done |
| archive-6 | The console's copy promises only what the plan delivers: the zero-write case says 「不會寫入任何文件」 rather than 「即將寫入 0 個文件」, the contract sentence is on the confirm step, and the result panel reports the commit AGAINST the promise (red when they differ) | archive-commit-copy | unit | done |

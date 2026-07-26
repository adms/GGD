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

## THE RECOVERY IS PARTIAL, AND EVERY SURFACE SAYS SO

The feature never deletes, so a restore cannot be complete. Owner decision
2026-07-26: it STAYS non-deleting — a reconciling restore would be the only
operation in the product able to destroy 35 real family accounts, run once, by
one frightened non-DBA facing a "delete 214 documents?" prompt he cannot audit.
The price of that decision is one sentence: 「這裡是這次匯入新增的清單，多出來的
自己處理」.

**That sentence is only worth anything if the list is true.** The first attempt
built it from `ApplyResult.AddedDocs` accumulated in a second pass over the
write loop, so it inherited the plan-completeness bug wholesale. Measured on the
repo's own fixture, re-importing a byte-identical archive:

| | before (`fix/243-recovery-honesty`) | after |
| --- | --- | --- |
| plan | `Writes=0` | `Writes=0`, `Unchanged=169` |
| apply | `Written=163  Added=163` | `Written=0  Added=0` |
| receipt | `addedDocs` named **all 163** documents, admin included | `addedDocs=[]`, and the note says 「這次沒有新增任何文件」 |
| after the restore | `added=1`, naming `accounts/u_TARGET_OWNER` — **the host's own admin** | `added=0`, `addedDocs=[]` |

So the list is now a PROJECTION of the one per-entry result map, not a second
tally, and the two runbook instructions it points at are driven end to end
against a genuinely imported account and a genuinely imported invite code.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| archive-7 | `AddedDocs` is a projection of `ApplyResult.Results`, never accumulated separately: exactly one assignment, `res.AddedDocs = addedDocsOf(res.Results)`, and for 24 randomised target states it equals the plan's `added` entries EXACTLY — checked against the fixture's own record of what it seeded (`TestAddedDocsAgreeWithThePlanForEveryEntry`) | archive-addeddocs-property | regression | done |
| archive-8 | Re-importing the identical archive names NOTHING as added — `added=0`, `addedDocs=[]` — and the receipt says so in words rather than as an empty list; the restore path likewise never names the target's own pre-existing accounts (`TestNoOpReImportNamesNothingAsAdded`, `TestRestoreNeverNamesTheHostsOwnAccounts`) | archive-addeddocs-noop-reimport | regression | done |
| archive-9 | The console groups the additions by collection, biggest first, so accounts and invite codes are never buried under ranking snapshots | archive-addeddocs-grouping | unit | done |
| archive-10 | The documented restore command carries BOTH flags and really recovers the adopt-archive lockout: identity refs return to the target's own owner and its password hash is restored (`TestDocumentedRestoreCommandIsTheOneThatWorks`; `-allow-overwrite` alone is refused with zero writes) | archive-restore-command-works | regression | done |
| archive-11 | The restore does NOT remove what the import added, and the disclosure says so AND names the control for each kind — 婉拒 / 撤銷 — rather than shrugging (`TestRestoreDoesNotRemoveWhatTheImportAdded`) | archive-restore-never-deletes | regression | done |
| archive-12 | The runbook's residue instruction is TRUE end to end: an IMPORTED account appears on the Players page, 婉拒 makes its login `account_denied`; an IMPORTED invite code appears on the 邀請碼 page, 撤銷 makes it unusable for registration; and an already-redeemed imported code is refused by 撤銷, which the disclosure states (`TestTheRunbooksResidueInstructionActuallyWorks`) | archive-restore-runbook | integration | done |
| archive-13 | The recovery copy cannot drift: `RESTORE_RECOVERS` / `RESTORE_LIMITS` in the console are compared character for character against `platformarchive.RestoreRecovers` / `RestoreLimits`, which the CLI, the runbook §5.5 and the backup sidecar all render | archive-restore-copy-mirrored | unit | done |
| archive-14 | The confirm step warns BEFORE the write that the undo is partial — 「不會刪除任何東西」 has a flip side and the page used to show only the flattering half | archive-restore-preview-warning | unit | done |

# 平台資料搬遷封存 — 匯入前備份的保留與可見性 (#243) — TODO

Scope of THIS file: the pre-import backup that `/admin/platform-archive/commit`
writes to `data/_migration/backups/<UTC>.zip` before it touches anything.

Why it needed its own rows. The archive feature's security work (path traversal,
absolute paths, zip bombs, truncated archives, CRC tampering, unknown
collections — all refused with zero files written) was verified separately and
is not tracked here. What was NOT covered was what happens AFTER a successful
import: the backup it takes is in the same format as the export, so it holds
every account document and therefore every `$argon2id$` hash on the deploy — and
nothing ever removed one. `SweepStaging` had a branch for staged uploads and a
branch for abandoned `.incoming-*`, and none at all for backups; run with a
clock a year in the future it removed nothing. `DATA_DIR` was quietly becoming a
pile of complete password databases that the console never mentioned.

The retention policy and the reasoning behind its exact shape (why age decides
and count only ever protects, why keep-N-most-recent alone is backwards here)
live in the comment above `backupTTL` in
`apps/platform/internal/platformarchive/backup.go`. It is not repeated here so
the two cannot drift.

## Retention — the sweep

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| arch-243-01 | `SweepBackups` + the shared `Sweep` entry point (boot + every stage upload) expire backups older than `backupTTL`, keeping at least `backupMinKeep` newest; clock-injectable so the rule is testable without waiting 90 days. | arch-243-backup-retention | unit | done |
| arch-243-02 | A same-session RETRY BURST is never trimmed: the pre-session snapshot is the oldest of the burst and the one worth restoring, which is exactly what a keep-N-most-recent policy would evict first. | arch-243-retention-burst | regression | done |
| arch-243-03 | The sweep can never remove the ONLY backup, at any age, including with a clock decades ahead — the count floor is checked before the age is. | arch-243-retention-last | regression | done |
| arch-243-04 | An IN-FLIGHT import's backup is never swept: it is by construction the newest on disk, so both the TTL and the count floor protect it. Covers `BackupTarget`'s own trim and an unrelated far-future sweep. | arch-243-retention-inflight | regression | done |

## Visibility — the operator's half

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| arch-243-05 | 狀態 tab lists every backup with timestamp, size, entry count and WHAT IT WAS TAKEN BEFORE (source host + export time, read back from the sidecar), plus the pile total; copy states that each one contains argon2id password hashes. | arch-243-backup-visibility | unit | done |
| arch-243-06 | `DELETE /admin/platform-archive/backups/{stamp}` removes one backup deliberately (admin-gated + audited as `archive.backup_delete`); the stamp is re-parsed as a UTC second so a path can never be spelled; the manual delete MAY remove the last one, unlike the sweep. | arch-243-backup-delete | security | done |
| arch-243-07 | The page states the retention policy in the numbers `/status` sent (`backupRetention`), never a second hard-coded copy, and degrades to 「未知」 rather than printing NaN when an older platform omits it. | arch-243-retention-reported | unit | done |

## Modes — who can read a credential dump

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| arch-243-08 | The backup zip and its sidecar are written at exactly 0640 and `_migration` + `_migration/backups` at exactly 0750, asserted rather than inherited from jsonstore's reputation — including tightening a directory that already existed as 0777. | arch-243-backup-modes | security | done |
| arch-243-09 | The pending file is staged INSIDE the backups directory (`renameio.WithTempDir`), so a complete password database never transits a shared `/tmp`; asserted while the handle is open, since the rename would hide it afterwards. | arch-243-backup-tmpdir | security | done |

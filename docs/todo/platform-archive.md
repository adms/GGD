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

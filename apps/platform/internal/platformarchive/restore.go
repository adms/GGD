package platformarchive

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"github.com/google/renameio/v2"
)

// ============================================================================
// THE RECOVERY STORY, in one file, as DATA.
//
// Everything an operator is ever told about undoing an import comes from the
// three values below. The runbook (§5.5), the CLI help, the console page and
// the backup's own sidecar all render THESE — they do not paraphrase them —
// and archiveRestore.test.ts fails if the TypeScript mirror drifts by a
// character. Four surfaces making four slightly different promises about the
// one paragraph somebody reads immediately after breaking their own platform
// is exactly how "the documented recovery does not recover" happened once
// already.
//
// WHO THIS IS WRITTEN FOR. Not a DBA. The owner of a ~35-account family
// deploy, at 1am, who has just imported the wrong file and locked himself and
// his kids out of the game. He will read the FIRST line and act on the LAST
// one. So: no jargon, the reassurance and the limitation are separated into
// two lists that are each true on their own, and every limitation is followed
// by the concrete click that deals with it.
//
// OWNER DECISION (2026-07-26), NOT UP FOR RE-LITIGATION: this feature stays
// NON-DELETING. A restore that reconciled the target by deleting documents
// would be the only operation in the whole product capable of destroying 35
// real family accounts, and it would be run exactly once, by one frightened
// non-DBA, facing a "delete 214 documents?" prompt he has no way to audit. The
// residue it would clean up is handled instead by controls that already exist,
// are reversible and are audited: 婉拒 an account, 撤銷 an invite code.
// ============================================================================

// RestoreCommand renders the ONE command that actually restores a backup.
//
// `-resolve-collisions=adopt-archive` is NOT garnish, and leaving it out was a
// real defect in the first cut of this feature. If the bad import was itself an
// adopt-archive one, it REPOINTED usernames at the archive's accounts. The
// backup's own refs then look to the planner like a fresh identity collision,
// planIdentity blocks the whole plan, and the operator — who by then cannot log
// in as the account they were using — gets a refusal that writes NOTHING at all.
// In the restore direction "adopt the archive" means "adopt this host's own
// backup", which is precisely what restoring is. After any other kind of bad
// import there are no collisions and the flag is a no-op, so it is always safe
// to hand over one command instead of a decision tree.
//
// Pinned by TestDocumentedRestoreCommandIsTheOneThatWorks, which drives the
// lockout end to end and checks the operator gets their own login back.
func RestoreCommand(zipPath string) string {
	return "docker compose … exec -T platform /platformarchive apply " +
		"-in - -data /data -content /srv/content " +
		"-allow-overwrite -resolve-collisions=adopt-archive < " + zipPath
}

// RestoreRecovers is what re-applying a backup genuinely DOES undo.
//
// Stated first and stated plainly, because it is true and because a reader who
// is panicking needs to know the important half is recoverable before he can
// take in the caveats.
var RestoreRecovers = []string{
	"被這次匯入蓋掉的文件，會變回匯入前那一版。",
	"被改指到別人身上的使用者名稱／email，會指回原本的帳號 —— " +
		"也就是你自己的後台登入會回來。",
	"密碼也一起回來：帳號文件是整份換回去的，所以你原本的密碼照樣能用。",
}

// RestoreLimits is what re-applying a backup does NOT undo.
//
// The list leads with the limitation, not with a hedge, and every entry that
// leaves the operator with something to do names the exact button. An item
// that says "some residue may remain" and stops would be a shrug; that is the
// shape this rework exists to remove.
var RestoreLimits = []string{
	"它不會刪東西。這次匯入「新增」的帳號、邀請碼、水晶紀錄，還原完都還在 —— " +
		"新帳號甚至還能用它自己的密碼登入。",
	"但你不用猜是哪些：匯入完成那一頁會逐筆列出新增了什麼，同一份清單也寫在備份旁邊的 " +
		".json 裡（import.addedDocs）。這次如果沒有新增，那份清單就是空的，" +
		"代表還原之後就真的乾淨了。",
	"照著清單處理：多出來的帳號，到後台「玩家」頁按「婉拒」，他就登不進來了" +
		"（按錯了再按一次「放行」就好）；多出來的邀請碼，到「邀請碼」頁按「撤銷」。" +
		"兩個都會留下稽核紀錄。",
	"清單裡如果有已經被用掉的邀請碼，撤銷不了，也不必撤銷 —— 它早就沒有效力了，" +
		"要處理的是它帶進來的那個帳號。",
	"備份之後才發生的事會一起被蓋掉：有人打了幾場、改了密碼、後台改了設定，" +
		"全部回到備份當時。所以要還原就趁早。",
	"稽核紀錄、個人戰績履歷、內容覆蓋層歷程是只增不改的，還原不動它們 —— " +
		"壞匯入的那一行會永遠留在稽核裡，這是刻意的。",
	"備份只涵蓋這次匯入會碰到的資料組。沒被碰到的資料組本來就沒被動過，" +
		"所以不在備份裡也不影響。",
	"還原本身也是一次匯入，所以它自己也會先備份一次 —— 連「還原還原錯了」都有退路。",
}

// recordImportReceipt rewrites a backup's sidecar with what the import that
// followed it actually did.
//
// This is the load-bearing half of the honest-restore decision. Telling an
// operator "the restore will not remove what the import added, deal with those
// yourself" is only actionable if they can find out WHICH ones — and the
// console result disappears the moment the tab closes, while the frightening
// moment is usually later. So the list lands on disk, next to the backup it
// belongs to, in the one directory an export can never sweep up (_migration).
//
// THE LIST MUST BE TRUE OR THIS FILE IS A LIABILITY. A previous cut wrote it
// from a count that had never been validated: every byte-identical document
// was named as an addition, so a no-op re-import produced a durable, named
// instruction to 婉拒 the host's own admin account. res.AddedDocs is now a
// projection of the per-entry result map (see apply.go) and
// TestAddedDocsAgreeWithThePlanForEveryEntry keeps it that way.
//
// Best-effort by contract: the import has ALREADY succeeded when this runs, so
// a failure here is a warning on the result, never an error that would make a
// completed import look failed.
func recordImportReceipt(res *ApplyResult, at time.Time) error {
	if res.Backup == nil {
		return nil
	}
	raw, err := os.ReadFile(res.Backup.ManifestPath) // #nosec G304 -- path built by BackupTarget.
	if err != nil {
		return err
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return err
	}
	// Only what this run knows. restoreWith / restoreRecovers / restoreLimits
	// are already at the top level, written before the import — repeating them
	// here would double the length of a file whose whole job is to be read
	// quickly by somebody who is not calm.
	doc["import"] = map[string]any{
		"at":        at.UTC(),
		"written":   res.Written,
		"added":     res.Added,
		"addedDocs": res.AddedDocs,
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	return writeBackupFile(filepath.Dir(res.Backup.ManifestPath), res.Backup.ManifestPath,
		func(f *renameio.PendingFile) error {
			_, writeErr := f.Write(append(out, '\n'))
			return writeErr
		})
}

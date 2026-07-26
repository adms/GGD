/**
 * 匯入前備份的保留與可見性 (task #243, blocker 3) — the admin half.
 *
 * THE DEFECT THIS COVERS. Every import writes data/_migration/backups/<UTC>.zip
 * before it touches anything. That file is the SAME format as the export, which
 * means every account document and every argon2id hash on the deploy. Nothing
 * removed one, and — worse for an owner who has said he wants to understand
 * what the system is doing rather than have it hidden — nothing in the console
 * said they existed at all.
 *
 * The fix has two halves and this file guards both:
 *   A. the page SHOWS them: a list, a total, a delete, and copy that says out
 *      loud what is in the file;
 *   B. the page states the SERVER's retention numbers rather than a second copy
 *      of them, so a change in platformarchive/backup.go cannot leave this page
 *      telling the operator something false.
 *
 * Pure helpers + source assertions only. No DOM, no network, no live host.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";

import {
  BACKUP_WARNING,
  backupSummary,
  deleteBackupConfirm,
  formatBytes,
  retentionLine,
  type BackupInfo,
} from "./archive";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");
/** Strip comments so prose cannot satisfy a check (the repo's codexEditGate idiom). */
const code = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const backup = (over: Partial<BackupInfo> = {}): BackupInfo => ({
  stamp: "20260726-140311Z",
  path: "/data/_migration/backups/20260726-140311Z.zip",
  createdAt: "2026-07-26T14:03:11Z",
  bytes: 1_500_000,
  entries: 420,
  reason: "匯入「ggd-old」於 2026-07-01 09:00 UTC 匯出的封存（420 個檔案）之前",
  empty: false,
  ...over,
});

// ---------------------------------------------------------------------------
// A. the operator can SEE them
// ---------------------------------------------------------------------------

describe("A: the backups are visible, not a silent pile in DATA_DIR", () => {
  it("says out loud that a backup contains password hashes", () => {
    cover("arch-243-backup-visibility");
    const all = BACKUP_WARNING.join("\n");
    // The one fact nobody can infer from the word 「備份」.
    expect(all).toContain("密碼雜湊");
    expect(all).toContain("argon2id");
    // Where it is, so it can be found with scp / rm without this console.
    expect(all).toContain("data/_migration/backups/");
    // And that removing it is a deliberate act, not something that happens for
    // you — the owner's standing objection to hidden behaviour.
    expect(all).toContain("刪除");
  });

  it("summarises the pile as one number instead of a column to add up", () => {
    cover("arch-243-backup-visibility");
    expect(backupSummary([], 0)).toContain("沒有備份");
    const line = backupSummary([backup(), backup({ stamp: "20260726-150000Z" })], 3_000_000);
    expect(line).toContain("2 包");
    expect(line).toContain(formatBytes(3_000_000));
    expect(line).toContain("密碼雜湊");
  });

  it("the delete confirmation escalates when it is the LAST backup", () => {
    cover("arch-243-backup-visibility");
    const many = deleteBackupConfirm(backup(), 4);
    expect(many).toContain("無法復原");
    expect(many).not.toContain("最後一包");

    const last = deleteBackupConfirm(backup(), 1);
    // This is the press that leaves the host with no undo — the one thing the
    // automatic sweep is forbidden from ever doing.
    expect(last).toContain("最後一包");
    expect(last).toContain("沒有任何還原點");
    // …and it names the alternative rather than only scolding.
    expect(last).toContain("scp");
  });

  it("the page renders the list, the reason and a two-press delete", () => {
    cover("arch-243-backup-visibility");
    const page = code(read("apps/admin/src/ui/DataMigrationPage.tsx"));
    expect(page).toContain("archiveDeleteBackup");
    expect(page).toContain("BACKUP_WARNING");
    expect(page).toContain("retentionLine");
    expect(page).toContain("deleteBackupConfirm");
    // WHAT it was taken before — a bare list of timestamps is unactionable.
    expect(page).toMatch(/b\.reason/);
    // Two presses: 刪除 arms it, 確認刪除 fires. A single-click delete of the
    // only undo an import has is not acceptable.
    expect(page).toContain("確認刪除");
    expect(page).toContain("setConfirming");
    // The stamp is the handle sent to the server — never the path.
    expect(page).toContain("archiveDeleteBackup(b.stamp)");
    expect(page).not.toContain("archiveDeleteBackup(b.path)");
  });

  it("the import step warns that the backup it is about to take is a credential dump", () => {
    cover("arch-243-backup-visibility");
    const page = read("apps/admin/src/ui/DataMigrationPage.tsx");
    expect(page).toContain("那一包備份跟匯出檔一樣含全部帳號與密碼雜湊");
  });

  it("the API wrapper targets the backups route with an encoded stamp", () => {
    cover("arch-243-backup-visibility");
    const api = code(read("apps/admin/src/api.ts"));
    expect(api).toContain("/admin/platform-archive/backups/");
    expect(api).toContain("encodeURIComponent(stamp)");
    expect(api).toMatch(/method:\s*"DELETE"/);
  });
});

// ---------------------------------------------------------------------------
// B. the policy shown is the policy enforced
// ---------------------------------------------------------------------------

describe("B: the retention sentence comes from the server, not a second copy", () => {
  it("builds the sentence out of the numbers the server sent", () => {
    cover("arch-243-backup-retention");
    const line = retentionLine({ ttlDays: 90, minKeep: 3 });
    expect(line).toContain("90 天");
    expect(line).toContain("最新的 3 包");
    // The two promises the sweep actually makes.
    expect(line).toContain("不會被清掉"); // a same-session retry burst
    expect(line).toContain("唯一的還原點"); // never the last one

    // A different policy produces a different sentence — proving it is not a
    // hard-coded string with the numbers pasted in front of it.
    const other = retentionLine({ ttlDays: 30, minKeep: 5 });
    expect(other).toContain("30 天");
    expect(other).toContain("最新的 5 包");
  });

  it("degrades honestly when the server did not send a policy", () => {
    cover("arch-243-backup-retention");
    // An old platform build against a new console: say "unknown" rather than
    // print "NaN 天" or invent a number the sweep is not enforcing.
    for (const bad of [null, undefined, { ttlDays: 0, minKeep: 0 }]) {
      const line = retentionLine(bad);
      expect(line).toContain("未知");
      expect(line).not.toContain("NaN");
    }
  });

  it("the numbers in the sentence are the ones platformarchive enforces", () => {
    cover("arch-243-backup-retention");
    // The Go side is the single source of truth; this pins that the console is
    // fed from it rather than from a literal in TypeScript.
    const go = read("apps/platform/internal/platformarchive/backup.go");
    expect(go).toContain("backupTTL     = 90 * 24 * time.Hour");
    expect(go).toContain("backupMinKeep = 3");
    // The service sends the live policy on /status.
    const svc = read("apps/platform/internal/platformarchive/service.go");
    expect(svc).toContain("BackupRetention: Retention()");
    // And the page uses THAT, not a constant of its own.
    const page = code(read("apps/admin/src/ui/DataMigrationPage.tsx"));
    expect(page).toContain("retentionLine(props.status.backupRetention)");
    const archive = code(read("apps/admin/src/archive.ts"));
    expect(archive).not.toMatch(/ttlDays\s*[:=]\s*\d/);
  });

  it("the sweep really has a backups branch now, not only staging", () => {
    cover("arch-243-backup-retention");
    // The verifier's finding, verbatim: SweepStaging had no branch for the
    // backups directory. Sweep is the entry point boot and stage now call.
    const go = read("apps/platform/internal/platformarchive/backup.go");
    expect(go).toContain("func SweepBackups(");
    expect(go).toContain("func Sweep(");
    const svc = code(read("apps/platform/internal/platformarchive/service.go"));
    expect(svc).toContain("Sweep(d.DataDir, d.Now())");
    const staging = code(read("apps/platform/internal/platformarchive/staging.go"));
    expect(staging).toContain("Sweep(dataDir, now)");
  });
});

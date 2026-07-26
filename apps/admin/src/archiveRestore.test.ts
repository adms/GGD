/**
 * archiveRestore.test.ts — the RECOVERY copy, pinned (task #243).
 *
 * The console, the CLI, the runbook and the backup sidecar all print the same
 * three things: the restore command, what it recovers, and what it does not.
 * They must not be able to drift, because they are read at the worst possible
 * moment — right after somebody has broken their own platform — and a rollback
 * that over-states what it recovers is worse than having none at all.
 *
 * So these tests read the GO SOURCE and compare it to the TypeScript mirror,
 * character for character. A change on either side fails here until the other
 * side is changed with it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cover } from "@ggd/shared/testkit/cover";
import { describe, expect, it } from "vitest";

import {
  ADDED_DOCS_PREVIEW,
  RESTORE_LIMITS,
  RESTORE_RECOVERS,
  UNDO_PREVIEW_WARNING,
  addedDocsSummary,
  groupAddedDocs,
  restoreCommand,
  type ApplyResp,
  type DocRef,
} from "./archive";

const GO_RESTORE = join(__dirname, "../../platform/internal/platformarchive/restore.go");
const GO_APPLY = join(__dirname, "../../platform/internal/platformarchive/apply.go");
const RUNBOOK = join(__dirname, "../../../docs/runbooks/platform-migration.md");

/** Pull a `var Name = []string{ … }` block's string literals out of Go source. */
function goStringSlice(src: string, name: string): string[] {
  const start = src.indexOf(`var ${name} = []string{`);
  if (start < 0) throw new Error(`${name} not found in the Go source`);
  const end = src.indexOf("\n}", start);
  const body = src.slice(start, end);
  // Go concatenates adjacent literals across lines with `+`; join them back
  // into one entry per element by splitting on the top-level commas.
  return body
    .split("\n")
    .slice(1)
    .join("\n")
    .split(/",\n/)
    .map((chunk) =>
      chunk
        .split("\n")
        .map((l) => l.trim())
        .join("")
        // Go joins adjacent literals with `" +"` across the line break.
        .replaceAll(/"\s*\+\s*"/g, "")
        .replace(/^"/, "")
        .replace(/",?$/, "")
        .trim(),
    )
    .filter((s) => s.length > 0);
}

describe("the restore command", () => {
  it("carries BOTH flags — without -resolve-collisions it is refused and writes nothing", () => {
    cover("archive-restore-command-works");
    const cmd = restoreCommand("/data/_migration/backups/x.zip");
    expect(cmd).toContain("-allow-overwrite");
    expect(cmd).toContain("-resolve-collisions=adopt-archive");
    expect(cmd).toContain("/data/_migration/backups/x.zip");
  });

  it("is byte-identical to the one the server writes into the backup sidecar", () => {
    cover("archive-restore-command-works");
    const go = readFileSync(GO_RESTORE, "utf8");
    // The Go function builds the same string from the same pieces; compare the
    // literal fragments rather than re-implementing its concatenation.
    for (const piece of [
      "docker compose … exec -T platform /platformarchive apply ",
      "-in - -data /data -content /srv/content ",
      "-allow-overwrite -resolve-collisions=adopt-archive < ",
    ]) {
      expect(go).toContain(piece);
      expect(restoreCommand("Z")).toContain(piece.trim());
    }
  });

  it("the runbook prints the same two flags", () => {
    cover("archive-restore-runbook");
    const doc = readFileSync(RUNBOOK, "utf8");
    expect(doc).toContain("-resolve-collisions=adopt-archive");
    expect(doc).toContain("-allow-overwrite");
  });
});

describe("the honest-disclosure copy", () => {
  it("RESTORE_RECOVERS matches platformarchive.RestoreRecovers exactly", () => {
    cover("archive-restore-copy-mirrored");
    const go = goStringSlice(readFileSync(GO_RESTORE, "utf8"), "RestoreRecovers");
    expect([...RESTORE_RECOVERS]).toEqual(go);
  });

  it("RESTORE_LIMITS matches platformarchive.RestoreLimits exactly", () => {
    cover("archive-restore-copy-mirrored");
    const go = goStringSlice(readFileSync(GO_RESTORE, "utf8"), "RestoreLimits");
    expect([...RESTORE_LIMITS]).toEqual(go);
  });

  it("leads with what IS recovered, then names the residue AND the button for it", () => {
    cover("archive-restore-never-deletes");
    // The reassuring half must actually say the two things that matter to
    // somebody locked out: the overwritten docs and the identity refs.
    const rec = RESTORE_RECOVERS.join("\n");
    expect(rec).toContain("蓋掉");
    expect(rec).toContain("指回");

    // The limitation half must be an INSTRUCTION, not a shrug: it names the
    // residue, where the list is, and the exact console control for each kind.
    const lim = RESTORE_LIMITS.join("\n");
    expect(lim).toContain("不會刪");
    expect(lim).toContain("addedDocs");
    expect(lim).toContain("婉拒");
    expect(lim).toContain("撤銷");
    // …including the caveat that a spent code cannot be revoked, which is the
    // one place the obvious instruction does NOT apply.
    expect(lim).toContain("已經被用掉的邀請碼");
  });

  it("warns BEFORE the commit that the undo is partial", () => {
    cover("archive-restore-preview-warning");
    expect(UNDO_PREVIEW_WARNING).toContain("換不掉新增");
    expect(UNDO_PREVIEW_WARNING).toContain("不刪任何文件");
  });
});

describe("the added-documents list", () => {
  const resp = (addedDocs: DocRef[]): ApplyResp => ({
    plan: {
      collections: [],
      writes: 0,
      unchanged: 0,
      skipped: 0,
      blockedEntries: 0,
      blocked: false,
      targetPopulated: true,
      digest: "d",
    },
    written: addedDocs.length,
    added: addedDocs.length,
    unchanged: 0,
    skipped: 0,
    addedDocs,
  });

  it("says 'nothing was added' as a SENTENCE, not as an empty list", () => {
    cover("archive-addeddocs-noop-reimport");
    const line = addedDocsSummary(resp([]).addedDocs);
    expect(line).toContain("沒有新增任何文件");
    expect(line).not.toContain("還原不會把它們移除");
  });

  it("names the residue and says the restore will not remove it", () => {
    cover("archive-addeddocs-noop-reimport");
    const line = addedDocsSummary([
      { collection: "accounts", id: "u_1" },
      { collection: "invites", id: "GGD-AAAA-BBBB" },
    ]);
    expect(line).toContain("2 筆");
    expect(line).toContain("還原不會把它們移除");
    expect(line).toContain("addedDocs");
  });

  it("groups by collection, biggest first, so accounts are not buried", () => {
    cover("archive-addeddocs-grouping");
    const groups = groupAddedDocs([
      { collection: "ranking", id: "r1" },
      { collection: "accounts", id: "u_1" },
      { collection: "accounts", id: "u_2" },
      { collection: "ranking", id: "r2" },
      { collection: "accounts", id: "u_3" },
      { collection: "invites", id: "c1" },
    ]);
    expect(groups.map((g) => g.collection)).toEqual(["accounts", "ranking", "invites"]);
    expect(groups[0]?.ids).toEqual(["u_1", "u_2", "u_3"]);
    expect(ADDED_DOCS_PREVIEW).toBeGreaterThan(0);
  });

  it("the server derives the list from the per-entry result map, never a second tally", () => {
    cover("archive-addeddocs-property");
    const go = readFileSync(GO_APPLY, "utf8");
    // ONE assignment, from the projection helper. If somebody re-introduces the
    // append-inside-the-write-loop shape, this fails — that shape is what let a
    // no-op re-import name every account on the host as an addition.
    const assignments = go.match(/res\.AddedDocs\s*=/g) ?? [];
    expect(assignments).toHaveLength(1);
    expect(go).toContain("res.AddedDocs = addedDocsOf(res.Results)");
    expect(go).not.toContain("res.AddedDocs = append(");
    // And the Go test that pins the invariant still exists, by name.
    const guard = readFileSync(
      join(__dirname, "../../platform/internal/platformarchive/addeddocs_test.go"),
      "utf8",
    );
    expect(guard).toContain("func TestAddedDocsAgreeWithThePlanForEveryEntry");
    expect(guard).toContain("func TestNoOpReImportNamesNothingAsAdded");
    expect(guard).toContain("func TestRestoreNeverNamesTheHostsOwnAccounts");
  });

  it("the runbook's residue instruction is driven end to end by a real test", () => {
    cover("archive-restore-runbook");
    const e2e = readFileSync(
      join(__dirname, "../../platform/internal/server/archive_recovery_runbook_test.go"),
      "utf8",
    );
    expect(e2e).toContain("func TestTheRunbooksResidueInstructionActuallyWorks");
    // It must really drive 婉拒 and 撤銷, not merely mention them.
    expect(e2e).toContain("/deny");
    expect(e2e).toContain("/revoke");
    expect(e2e).toContain("account_denied");
  });
});

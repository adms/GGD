/**
 * Guards for tools/deploy/ggd-backup.sh — the scheduled OFF-MACHINE backup
 * (GH#123). Run from the repo root:
 *
 *   pnpm exec vitest run tools/deploy/test/ggd-backup.test.ts
 *
 * (tools/deploy has no package.json on purpose — same reasoning as
 * tools/icon-gen: one test file is not worth a lockfile entry. suites.yaml
 * registers it with `cwd: .`.)
 *
 * ---------------------------------------------------------------------------
 * WHAT THESE TESTS ARE FOR, AND WHY THEY ARE SHAPED LIKE THIS
 * ---------------------------------------------------------------------------
 * A backup script is the archetype of code that passes every test and still
 * loses your data, because the ways it fails are all "it exited 0 and nothing
 * happened":
 *
 *   · it wrote the archive next to the original and called that a backup
 *   · the container was down, the shell created the file anyway, 0 bytes
 *   · the upload tool printed "Copying…" and the object is not in the bucket
 *   · the object is there and is half a ZIP
 *   · the job stopped running in March and nobody looked until August
 *
 * So NOT ONE of these tests asserts on a log line, a flag, or the presence of a
 * function. Every one of them asserts on an OUTCOME AT THE DESTINATION or on a
 * non-zero exit. `ships the archive to the off-machine destination` is the
 * load-bearing one: delete the `copy_offsite` call in cmd_run and it goes red,
 * because it stats the destination path.
 *
 * The last block runs the REAL exporter (`go run ./cmd/platformarchive`) over a
 * synthetic DATA_DIR and then restores the shipped archive back into a scratch
 * dir and counts the accounts — the 還原演練 as an automated guard, not a
 * paragraph in a runbook that nobody re-runs.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "ggd-backup.sh");
const REPO = join(HERE, "..", "..", "..");

/**
 * /private/tmp, not os.tmpdir(): the project rule is that scratch files go
 * there, and on macOS os.tmpdir() is a per-user /var/folders path that the
 * `docker run -v` line in `verify --deep` cannot share into a VM anyway.
 */
const SCRATCH_ROOT = "/private/tmp/ggd-backup-tests";
mkdirSync(SCRATCH_ROOT, { recursive: true });

let boxes: string[] = [];
function newBox(): string {
  const d = mkdtempSync(join(SCRATCH_ROOT, "box-"));
  boxes.push(d);
  mkdirSync(join(d, "staging"), { recursive: true });
  mkdirSync(join(d, "offsite"), { recursive: true });
  return d;
}
afterAll(() => {
  for (const b of boxes) rmSync(b, { recursive: true, force: true });
  try {
    if (readdirSync(SCRATCH_ROOT).length === 0) rmSync(SCRATCH_ROOT, { recursive: true, force: true });
  } catch { /* another run is using it */ }
});

type Run = { code: number; out: string; err: string };
function runScript(args: string[], env: Record<string, string>): Run {
  // cwd is the test's own box, NOT the repo. The script cds into
  // GGD_BACKUP_REPO itself for every docker/go call, so it does not need the
  // repo as cwd — and a broken destination path (the `user@host:` split, say)
  // resolves RELATIVE to cwd. Running from the repo meant a mutation test could
  // create `can@backup.example:/…/` in the working tree; running from the box
  // both keeps the tree clean and makes the stray directory something the
  // assertions can actually see.
  const box = dirname(env.GGD_BACKUP_STAGING ?? SCRATCH_ROOT);
  const r = spawnSync("sh", [SCRIPT, ...args], {
    encoding: "utf8",
    // GGD_BACKUP_CONF is pointed at a path that cannot exist so a real
    // /etc/ggd/backup.env on the developer's machine can never colour a test.
    env: { ...process.env, GGD_BACKUP_CONF: "/nonexistent/ggd-backup.env", ...env },
    cwd: box,
  });
  return { code: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
}

/**
 * A stand-in for `docker`. The seam being faked is the PROCESS BOUNDARY into
 * the container — everything on this side of it (the size check, the parse-back,
 * the ship, the read-back, the state file) is the real script.
 *
 * Modes:
 *   good      export writes a plausible archive; inspect succeeds
 *   truncated export writes 3 bytes and exits 0   (the classic silent failure)
 *   garbage   export writes plenty of bytes; inspect exits 1 (not a real ZIP)
 *   deadexec  `exec` fails, `run` succeeds        (crash-looping platform)
 *   halfway   export writes a BIG, INSPECTABLE archive and then exits 1
 *
 * `halfway` is the nastiest of the five and the only one that no size check and
 * no parse-back can see: the exporter got some of the way through, what it left
 * on disk is well over GGD_BACKUP_MIN_BYTES and passes `inspect`, and the only
 * evidence that it is incomplete is the exit code nobody looked at. See the
 * 部分成功 block below.
 */
function fakeDocker(box: string, mode: "good" | "truncated" | "garbage" | "deadexec" | "halfway"): string {
  const p = join(box, "fake-docker.sh");
  writeFileSync(
    p,
    `#!/bin/sh
# fake docker for ggd-backup.sh tests
MODE=${mode}
case " $* " in
  *" inspect "*)
    cat > /dev/null
    if [ "$MODE" = garbage ]; then echo "not a ggd archive" >&2; exit 1; fi
    echo "ggd-platform-archive v1 (fake)"; exit 0 ;;
  *" export "*)
    IS_RUN=no
    case " $* " in *" run "*) IS_RUN=yes ;; esac
    if [ "$MODE" = deadexec ] && [ "$IS_RUN" = no ]; then
      echo "Error: No such container: platform" >&2; exit 1
    fi
    if [ "$MODE" = truncated ]; then printf 'PK\\003'; exit 0; fi
    printf 'PK\\003\\004'
    i=0; while [ $i -lt 400 ]; do printf 'ggd-fake-archive-payload-'; i=$((i+1)); done
    # halfway: the bytes are already written and look fine — only the exit code
    # says the export never finished.
    if [ "$MODE" = halfway ]; then echo "platformarchive: context deadline exceeded" >&2; exit 1; fi
    exit 0 ;;
esac
exit 0
`,
    { mode: 0o755 },
  );
  return p;
}

/**
 * A stand-in for `gcloud storage`. `UPLOAD` decides what actually lands, which
 * is how "the tool said OK and the object is not there" becomes testable:
 *   ok      write the object, report its true size
 *   silent  exit 0, write nothing              (upload evaporated)
 *   short   write a truncated object           (upload half-arrived)
 */
function fakeGcloud(box: string, bucketDir: string, upload: "ok" | "silent" | "short"): string {
  const p = join(box, "fake-gcloud.sh");
  mkdirSync(bucketDir, { recursive: true });
  writeFileSync(
    p,
    `#!/bin/sh
# fake \`gcloud storage\` for ggd-backup.sh tests. gs://<anything>/<name> maps to ${bucketDir}/<name>
BUCKET='${bucketDir}'
UPLOAD=${upload}
[ "$1" = storage ] || exit 0
shift
op=$1; shift
localpath() { printf '%s/%s' "$BUCKET" "\${1##*/}"; }
case "$op" in
  cp)
    src=$1; dst=$2
    case "$src" in
      gs://*) cp "$(localpath "$src")" "$dst" ;;   # download
      *)
        case "$UPLOAD" in
          ok)     cp "$src" "$(localpath "$dst")" ;;
          silent) : ;;
          short)  head -c 10 "$src" > "$(localpath "$dst")" ;;
        esac ;;
    esac ;;
  ls)
    if [ "$1" = "-l" ]; then
      shift; f=$(localpath "$1")
      [ -f "$f" ] || exit 1
      printf '%s  2026-07-30T00:00:00Z  %s\\n' "$(wc -c < "$f" | tr -d ' ')" "$1"
    else
      ls -1 "$BUCKET" 2>/dev/null | sed "s#^#gs://bucket/#"
    fi ;;
  rm) rm -f "$(localpath "$1")" ;;
esac
exit 0
`,
    { mode: 0o755 },
  );
  return p;
}

/**
 * Stand-ins for `ssh` and `rsync`. The rsync destination is the one an operator
 * reaches for when he does not want to touch the VM's GCP scopes (runbook
 * §2a-alt), and it is the only destination whose URI has to be TAKEN APART
 * (`user@host:/path`) before it can be used — three separate places in the
 * script do that split, so it gets a real exercise rather than a review.
 *
 * The fakes execute against the local filesystem: `user@host:/tmp/x` behaves as
 * `/tmp/x`. That keeps the parsing honest (a script that forgot to strip the
 * `user@host:` prefix writes to a path with a colon in it and the assertions
 * miss it) without needing sshd.
 */
function fakeSsh(box: string): string {
  const p = join(box, "fake-ssh.sh");
  writeFileSync(p, `#!/bin/sh\nshift\nsh -c "$*"\n`, { mode: 0o755 });
  return p;
}
function fakeRsync(box: string): string {
  const p = join(box, "fake-rsync.sh");
  writeFileSync(
    p,
    `#!/bin/sh
# fake rsync: drop flags, strip a user@host: prefix from either side, copy.
strip() { case "$1" in *@*:*) printf '%s' "\${1#*:}" ;; *) printf '%s' "$1" ;; esac; }
args=""
for a in "$@"; do case "$a" in -*) ;; *) args="$args $a" ;; esac; done
# shellcheck disable=SC2086
set -- $args
src=$(strip "$1"); dst=$(strip "$2")
mkdir -p "$(dirname "$dst")"
cp "$src" "$dst"
`,
    { mode: 0o755 },
  );
  return p;
}

function baseEnv(box: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    GGD_BACKUP_REPO: REPO,
    GGD_BACKUP_STAGING: join(box, "staging"),
    GGD_BACKUP_SOURCE: "exec",
    GGD_BACKUP_GROUPS: "core",
    GGD_BACKUP_INSPECT: "1",
    ...extra,
  };
}

function offsiteZips(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".zip")).sort();
}

// ===========================================================================
describe("ggd-backup.sh — the bytes must leave the machine", () => {
  beforeEach(() => { /* each test builds its own box */ });

  it("refuses to run at all when no off-machine destination is configured", () => {
    const box = newBox();
    const r = runScript(["run"], baseEnv(box, {
      GGD_BACKUP_DOCKER: fakeDocker(box, "good"),
      GGD_BACKUP_DEST: "none",
    }));
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("GGD_BACKUP_DEST");
    // and it must not have produced a local-only "backup" as a consolation prize
    expect(readdirSync(join(box, "staging")).filter((f) => f.endsWith(".zip"))).toHaveLength(0);
  });

  it("ships the archive to the off-machine destination", () => {
    // THE load-bearing assertion. Delete the copy_offsite call in cmd_run and
    // this goes red: it stats the destination, not the log.
    const box = newBox();
    const dest = join(box, "offsite");
    const r = runScript(["run"], baseEnv(box, {
      GGD_BACKUP_DOCKER: fakeDocker(box, "good"),
      GGD_BACKUP_DEST: "dir",
      GGD_BACKUP_DEST_URI: dest,
    }));
    expect(r.code, r.err).toBe(0);

    const shipped = offsiteZips(dest);
    expect(shipped).toHaveLength(1);

    // and what arrived is byte-identical to what was made, not merely present
    const staged = readdirSync(join(box, "staging")).filter((f) => f.endsWith(".zip"));
    expect(staged).toHaveLength(1);
    expect(readFileSync(join(dest, shipped[0]!))).toEqual(readFileSync(join(box, "staging", staged[0]!)));
  });

  it("records the off-machine URI in the success stamp, so `status` cannot be satisfied by a local copy", () => {
    const box = newBox();
    const dest = join(box, "offsite");
    runScript(["run"], baseEnv(box, {
      GGD_BACKUP_DOCKER: fakeDocker(box, "good"),
      GGD_BACKUP_DEST: "dir",
      GGD_BACKUP_DEST_URI: dest,
    }));
    const state = JSON.parse(readFileSync(join(box, "staging", ".state", "last-success.json"), "utf8"));
    expect(state.destUri.startsWith(dest)).toBe(true);
    expect(state.remoteBytes).toBe(state.bytes);
    expect(state.bytes).toBeGreaterThan(1024);
    expect(state.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("ggd-backup.sh — a copy tool's opinion is not evidence", () => {
  it("fails when the upload reports success and the object is not there", () => {
    const box = newBox();
    const bucket = join(box, "bucket");
    const r = runScript(["run"], baseEnv(box, {
      GGD_BACKUP_DOCKER: fakeDocker(box, "good"),
      GGD_BACKUP_GCLOUD: fakeGcloud(box, bucket, "silent"),
      GGD_BACKUP_DEST: "gcs",
      GGD_BACKUP_DEST_URI: "gs://ggd-test/ggd",
    }));
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/nothing is readable/);
    // a failed ship must NOT leave a success stamp behind
    expect(existsSync(join(box, "staging", ".state", "last-success.json"))).toBe(false);
  });

  it("fails when the object arrives truncated", () => {
    const box = newBox();
    const bucket = join(box, "bucket");
    const r = runScript(["run"], baseEnv(box, {
      GGD_BACKUP_DOCKER: fakeDocker(box, "good"),
      GGD_BACKUP_GCLOUD: fakeGcloud(box, bucket, "short"),
      GGD_BACKUP_DEST: "gcs",
      GGD_BACKUP_DEST_URI: "gs://ggd-test/ggd",
    }));
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/size mismatch/);
    expect(existsSync(join(box, "staging", ".state", "last-success.json"))).toBe(false);
  });

  it("succeeds against a well-behaved bucket and prunes to GGD_BACKUP_KEEP_REMOTE", () => {
    const box = newBox();
    const bucket = join(box, "bucket");
    const env = baseEnv(box, {
      GGD_BACKUP_DOCKER: fakeDocker(box, "good"),
      GGD_BACKUP_GCLOUD: fakeGcloud(box, bucket, "ok"),
      GGD_BACKUP_DEST: "gcs",
      GGD_BACKUP_DEST_URI: "gs://ggd-test/ggd",
      GGD_BACKUP_KEEP_REMOTE: "2",
      GGD_BACKUP_KEEP_LOCAL: "1",
    });
    // Three runs one second apart — the stamp has second resolution, so without
    // the sleep the second run would overwrite the first and prove nothing.
    for (let i = 0; i < 3; i++) {
      const r = runScript(["run"], env);
      expect(r.code, r.err).toBe(0);
      if (i < 2) execFileSync("sleep", ["1"]);
    }
    expect(offsiteZips(bucket)).toHaveLength(2);
    expect(readdirSync(join(box, "staging")).filter((f) => f.endsWith(".zip"))).toHaveLength(1);
  });
});

describe("ggd-backup.sh — the ssh destination (no cloud credentials at all)", () => {
  it("splits user@host:/path correctly and lands the archive at the path, not at a path with a colon in it", () => {
    const box = newBox();
    const remote = join(box, "remote-store");
    const r = runScript(["run"], baseEnv(box, {
      GGD_BACKUP_DOCKER: fakeDocker(box, "good"),
      GGD_BACKUP_SSH: fakeSsh(box),
      GGD_BACKUP_RSYNC: fakeRsync(box),
      GGD_BACKUP_DEST: "rsync",
      GGD_BACKUP_DEST_URI: `can@backup.example:${remote}`,
    }));
    expect(r.code, r.err).toBe(0);
    expect(offsiteZips(remote)).toHaveLength(1);
    // nothing may have been created under a literal "can@backup.example:…" name
    expect(readdirSync(box).some((f) => f.includes("@"))).toBe(false);
  });
});

describe("ggd-backup.sh — a file is not an archive", () => {
  it("rejects a truncated export instead of shipping a stub", () => {
    const box = newBox();
    const dest = join(box, "offsite");
    const r = runScript(["run"], baseEnv(box, {
      GGD_BACKUP_DOCKER: fakeDocker(box, "truncated"),
      GGD_BACKUP_DEST: "dir",
      GGD_BACKUP_DEST_URI: dest,
    }));
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/truncated stream|GGD_BACKUP_MIN_BYTES/);
    expect(offsiteZips(dest)).toHaveLength(0);
    // the stub is deleted, so tomorrow's prune cannot mistake it for a backup
    expect(readdirSync(join(box, "staging")).filter((f) => f.endsWith(".zip"))).toHaveLength(0);
  });

  it("rejects bytes that do not parse as an archive", () => {
    const box = newBox();
    const dest = join(box, "offsite");
    const r = runScript(["run"], baseEnv(box, {
      GGD_BACKUP_DOCKER: fakeDocker(box, "garbage"),
      GGD_BACKUP_DEST: "dir",
      GGD_BACKUP_DEST_URI: dest,
    }));
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/does not parse/);
    expect(offsiteZips(dest)).toHaveLength(0);
  });
});

// ===========================================================================
// 部分成功 — the shape that makes a backup worse than no backup.
//
// Every other failure in this file announces itself: 0 bytes, garbage, a
// missing object. A PARTIAL success does not. The exporter runs, streams a
// perfectly plausible archive, dies half-way through, and leaves behind a file
// that is big, well-formed, and INSPECTS CLEAN. The only difference between it
// and a real backup is an exit code — so the moment anything downgrades that
// exit code to a warning, the job stays green forever and every archive after
// it is missing an unknowable amount of data.
//
// The assertions are deliberately about WHICH guard fired. "it exited non-zero"
// is satisfied by the size floor, and the size floor is exactly what a partial
// success sails past, so a test that only checked the exit code would pass for
// the wrong reason and keep passing after the real guard was removed.
// ===========================================================================
describe("ggd-backup.sh — an exporter that died half-way did NOT take a backup", () => {
  it("refuses the run, ships nothing, and stamps nothing when the exporter exits non-zero after writing a big, inspectable archive", () => {
    const box = newBox();
    const dest = join(box, "offsite");
    const r = runScript(["run"], baseEnv(box, {
      GGD_BACKUP_DOCKER: fakeDocker(box, "halfway"),
      GGD_BACKUP_DEST: "dir",
      GGD_BACKUP_DEST_URI: dest,
      GGD_BACKUP_INSPECT: "1", // and the parse-back SUCCEEDS — that is the point
    }));

    expect(r.code).not.toBe(0);
    // It must be the exporter's exit code that stopped this, not the size floor:
    // 10 KB of plausible payload is well clear of GGD_BACKUP_MIN_BYTES.
    expect(r.err).toMatch(/the exporter failed/);
    expect(r.err).not.toMatch(/GGD_BACKUP_MIN_BYTES|truncated stream/);

    // Nothing may have left the machine…
    expect(offsiteZips(dest)).toHaveLength(0);
    // …no half-archive may be left in staging for tomorrow's prune to promote…
    expect(readdirSync(join(box, "staging")).filter((f) => f.endsWith(".zip"))).toHaveLength(0);
    // …and `status` must keep reporting the job as never having succeeded.
    expect(existsSync(join(box, "staging", ".state", "last-success.json"))).toBe(false);
    const st = runScript(["status"], baseEnv(box, { GGD_BACKUP_DEST: "dir", GGD_BACKUP_DEST_URI: dest }));
    expect(st.code).not.toBe(0);
  });

  it("a half-way death on the LAST configured source is still a failure (auto exhausts its fallback)", () => {
    // `auto` exists so a crash-looping platform still gets a backup. It must not
    // become "try until something writes bytes": both attempts here leave a
    // plausible file behind, and neither of them finished.
    const box = newBox();
    const dest = join(box, "offsite");
    const r = runScript(["run"], baseEnv(box, {
      GGD_BACKUP_DOCKER: fakeDocker(box, "halfway"),
      GGD_BACKUP_SOURCE: "auto",
      GGD_BACKUP_DEST: "dir",
      GGD_BACKUP_DEST_URI: dest,
    }));
    expect(r.code).not.toBe(0);
    expect(offsiteZips(dest)).toHaveLength(0);
    expect(existsSync(join(box, "staging", ".state", "last-success.json"))).toBe(false);
  });
});

describe("ggd-backup.sh — the night the platform is the broken thing", () => {
  it("source=auto falls back to a throwaway container when exec fails", () => {
    const box = newBox();
    const dest = join(box, "offsite");
    const r = runScript(["run"], baseEnv(box, {
      GGD_BACKUP_DOCKER: fakeDocker(box, "deadexec"),
      GGD_BACKUP_SOURCE: "auto",
      GGD_BACKUP_DEST: "dir",
      GGD_BACKUP_DEST_URI: dest,
      // the readback would also exec into the dead container; the fallback is
      // about producing the archive, so the parse-back is out of scope here
      GGD_BACKUP_INSPECT: "0",
    }));
    expect(r.code, r.err).toBe(0);
    expect(offsiteZips(dest)).toHaveLength(1);
  });

  it("source=exec does NOT silently fall back — a pinned mode stays pinned", () => {
    const box = newBox();
    const dest = join(box, "offsite");
    const r = runScript(["run"], baseEnv(box, {
      GGD_BACKUP_DOCKER: fakeDocker(box, "deadexec"),
      GGD_BACKUP_SOURCE: "exec",
      GGD_BACKUP_DEST: "dir",
      GGD_BACKUP_DEST_URI: dest,
      GGD_BACKUP_INSPECT: "0",
    }));
    expect(r.code).not.toBe(0);
    expect(offsiteZips(dest)).toHaveLength(0);
  });
});

describe("ggd-backup.sh — status answers 'did it stop running?'", () => {
  it("exits non-zero when no backup has ever completed", () => {
    const box = newBox();
    const r = runScript(["status"], baseEnv(box, { GGD_BACKUP_DEST: "dir", GGD_BACKUP_DEST_URI: join(box, "offsite") }));
    expect(r.code).not.toBe(0);
  });

  it("exits non-zero once the last verified backup is older than the threshold", () => {
    const box = newBox();
    const stateDir = join(box, "staging", ".state");
    mkdirSync(stateDir, { recursive: true });
    const old = Math.floor(Date.now() / 1000) - 5 * 24 * 3600;
    writeFileSync(
      join(stateDir, "last-success.json"),
      JSON.stringify({ stamp: "20260101T000000Z", finishedAtEpoch: old, bytes: 4242, destUri: "gs://b/x.zip" }, null, 2),
    );
    const stale = runScript(["status"], baseEnv(box, { GGD_BACKUP_MAX_AGE_HOURS: "36" }));
    expect(stale.code).not.toBe(0);
    expect(stale.err).toMatch(/STALE/);

    // …and green again when the threshold genuinely allows that age
    const ok = runScript(["status"], baseEnv(box, { GGD_BACKUP_MAX_AGE_HOURS: "9999" }));
    expect(ok.code, ok.err).toBe(0);
  });
});

describe("ggd-backup.sh — cron line is derived from the configured schedule", () => {
  it("prints the operator's schedule, not a baked-in one", () => {
    const box = newBox();
    const r = runScript(["cron"], baseEnv(box, { GGD_BACKUP_SCHEDULE: "9 3 * * 0" }));
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain("9 3 * * 0");
    expect(r.out).toContain("ggd-backup.sh run");
  });
});

// ===========================================================================
// THE RESTORE DRILL. Everything above fakes the container boundary; this block
// fakes nothing except the data. It runs the REAL exporter over a synthetic
// DATA_DIR, ships the result, pulls it back from the off-machine copy, applies
// it into a scratch DATA_DIR, and counts the accounts that came back.
//
// A backup nobody has restored is a rumour — and this is the cheapest way to
// stop that from being true only on the day somebody remembers to try.
// ===========================================================================
function haveGo(): boolean {
  try {
    execFileSync("go", ["version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

describe.runIf(haveGo())("ggd-backup.sh — restore drill against the REAL exporter", () => {
  it("an account written before the backup comes back after the restore", () => {
    const box = newBox();
    const dataDir = join(box, "data");
    const dest = join(box, "offsite");
    mkdirSync(join(dataDir, "accounts", "by-username"), { recursive: true });
    mkdirSync(join(dataDir, "curation"), { recursive: true });

    // Two documents whose loss is the actual disaster: an account and its
    // 藍水晶 wallet. Shapes follow data/accounts/*.json and data/curation.
    writeFileSync(
      join(dataDir, "accounts", "01TESTACCOUNT0000000000001.json"),
      JSON.stringify({ id: "01TESTACCOUNT0000000000001", username: "drilluser", email: "drill@example.test", passwordHash: "$argon2id$fake", status: "approved" }),
    );
    writeFileSync(
      join(dataDir, "accounts", "by-username", "drilluser.json"),
      JSON.stringify({ id: "drilluser", accountId: "01TESTACCOUNT0000000000001" }),
    );
    mkdirSync(join(dataDir, "walletmeta"), { recursive: true });
    writeFileSync(
      join(dataDir, "walletmeta", "01TESTACCOUNT0000000000001.json"),
      JSON.stringify({ id: "01TESTACCOUNT0000000000001", crystals: 1234, favourites: ["godie-hart"] }),
    );

    const env = baseEnv(box, {
      GGD_BACKUP_SOURCE: "local",
      GGD_BACKUP_DATA_DIR: dataDir,
      GGD_BACKUP_CONTENT_DIR: join(REPO, "content"),
      GGD_BACKUP_GROUPS: "all",
      GGD_BACKUP_DEST: "dir",
      GGD_BACKUP_DEST_URI: dest,
    });

    const run = runScript(["run"], env);
    expect(run.code, run.err).toBe(0);
    expect(offsiteZips(dest)).toHaveLength(1);

    // Now lose the machine: the drill reads ONLY from the off-machine copy.
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(join(box, "staging"), { recursive: true, force: true });

    const verify = runScript(["verify", "--deep"], env);
    expect(verify.code, verify.err + verify.out).toBe(0);
    expect(verify.out).toMatch(/restore drill: [1-9]\d* account document/);
  }, 180_000);

  it("the crystal balance survives the round trip byte-for-byte", () => {
    // Separate from the account count on purpose: "N documents came back" is a
    // count, and #123 is about VALUES — 藍水晶 and 排行榜. A restore that
    // recreates 19 empty wallets would pass a count and lose the game.
    const box = newBox();
    const dataDir = join(box, "data");
    const dest = join(box, "offsite");
    mkdirSync(join(dataDir, "walletmeta"), { recursive: true });
    mkdirSync(join(dataDir, "accounts"), { recursive: true });
    const wallet = { id: "01TESTACCOUNT0000000000002", crystals: 8675309, favourites: ["godie-hblm", "godie-efur"] };
    writeFileSync(join(dataDir, "walletmeta", `${wallet.id}.json`), JSON.stringify(wallet));
    writeFileSync(
      join(dataDir, "accounts", `${wallet.id}.json`),
      JSON.stringify({ id: wallet.id, username: "crystaluser", passwordHash: "$argon2id$fake" }),
    );

    const env = baseEnv(box, {
      GGD_BACKUP_SOURCE: "local",
      GGD_BACKUP_DATA_DIR: dataDir,
      GGD_BACKUP_CONTENT_DIR: join(REPO, "content"),
      GGD_BACKUP_GROUPS: "core",
      GGD_BACKUP_DEST: "dir",
      GGD_BACKUP_DEST_URI: dest,
    });
    expect(runScript(["run"], env).code).toBe(0);

    const shipped = offsiteZips(dest);
    expect(shipped).toHaveLength(1);

    // Restore the OFF-MACHINE artifact into a clean tree with the real applier.
    const restored = join(box, "restored");
    mkdirSync(restored, { recursive: true });
    const apply = spawnSync(
      "sh",
      ["-c", `go -C apps/platform run ./cmd/platformarchive apply -in '${join(dest, shipped[0]!)}' -data '${restored}' -content '${join(REPO, "content")}'`],
      { cwd: REPO, encoding: "utf8" },
    );
    expect(apply.status, apply.stderr).toBe(0);

    const back = JSON.parse(readFileSync(join(restored, "walletmeta", `${wallet.id}.json`), "utf8"));
    expect(back.crystals).toBe(8675309);
    expect(back.favourites).toEqual(["godie-hblm", "godie-efur"]);
  }, 180_000);
});

// ===========================================================================
// 內容普查 — "the archive exists" is a property; "the archive IS the data" is
// the behaviour.
//
// Every assertion before this block treats the archive as an opaque lump: it is
// present, it is big enough, it parses, it arrived intact, it restores at least
// one account. Not one of them can tell the difference between a full backup
// and a backup MISSING AN ENTIRE COLLECTION — which is not a hypothetical:
//
//   · dropping every append-only collection (history / admin-audit /
//     content-overlay-log) from the exporter's selection left all 16 tests green
//   · dropping accounts/by-username + accounts/by-email — the failure the
//     exporter's own comments call out, "every password is correct and no
//     username resolves" — also left all 16 tests green
//
// So this block does the only thing that actually settles it: it plants a known
// file in EVERY collection the archive is supposed to carry, runs the real
// shipping exporter through the real script to the off-machine destination,
// unpacks what ARRIVED THERE, and compares the two sets file-for-file and
// byte-for-byte.
//
// The comparison is SET EQUALITY, in both directions, on purpose:
//   · a file that stopped travelling  → red (silent data loss)
//   · a file that STARTED travelling  → red (config/ai-provider.json and
//     config/slack-notify.json are plaintext secrets; the id filter on the
//     `config` rule is the whole security boundary, and a boundary nobody tests
//     is a boundary that erodes)
//
// The expected set is written out here BY HAND rather than derived from the
// exporter's own rule table. Deriving it would make the test agree with any
// mutation of that table — the classic tautology where both sides of the
// assertion move together (failure mode ⑤).
// ===========================================================================

/** Is a command on PATH? Used to pick a ZIP reader, never to skip the census. */
function haveCmd(cmd: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${cmd} >/dev/null 2>&1`], { stdio: "ignore" }).status === 0;
}

const PY_EXTRACT = [
  "import sys, zipfile, os",
  "src, dst = sys.argv[1], sys.argv[2]",
  "z = zipfile.ZipFile(src)",
  "for n in z.namelist():",
  "    p = os.path.join(dst, n)",
  "    os.makedirs(os.path.dirname(p), exist_ok=True)",
  "    open(p, 'wb').write(z.read(n))",
  "    sys.stdout.write(n + '\\n')",
].join("\n");

/**
 * Unpack an archive and return {entry name → bytes}.
 *
 * Node has no ZIP reader, so this shells one. If NEITHER python3 nor unzip is
 * present it THROWS rather than returning empty or letting the caller skip: the
 * entire subject of this file is a check that silently stops checking.
 */
function extractArchive(zipPath: string, into: string): Map<string, Buffer> {
  rmSync(into, { recursive: true, force: true });
  mkdirSync(into, { recursive: true });
  let names: string[];
  if (haveCmd("python3")) {
    names = execFileSync("python3", ["-c", PY_EXTRACT, zipPath, into], { encoding: "utf8" })
      .split("\n").map((s) => s.trim()).filter(Boolean);
  } else if (haveCmd("unzip")) {
    names = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
      .split("\n").map((s) => s.trim()).filter(Boolean);
    execFileSync("unzip", ["-o", "-qq", zipPath, "-d", into]);
  } else {
    throw new Error(
      "no ZIP reader (python3 / unzip) on this host — the archive census cannot run. " +
      "It is failing loudly instead of skipping, because a verification that quietly " +
      "stops verifying is the exact bug this file exists to prevent.",
    );
  }
  const out = new Map<string, Buffer>();
  for (const n of names) out.set(n, readFileSync(join(into, n)));
  return out;
}

type CensusFile = { rel: string; body: string | Buffer; travels: boolean; why: string };

const j = (rel: string, obj: unknown, travels: boolean, why: string): CensusFile =>
  ({ rel, body: JSON.stringify(obj), travels, why });
const raw = (rel: string, body: string | Buffer, travels: boolean, why: string): CensusFile =>
  ({ rel, body, travels, why });

const ACC_A = "01CENSUSACCOUNT00000000A";
const ACC_B = "01CENSUSACCOUNT00000000B";
/** 256 distinct byte values: proves the opaque path survives NUL and 0xFF too. */
const REPLAY_BYTES = Buffer.from(Array.from({ length: 256 }, (_, i) => i));

/**
 * One planted file per collection in the rule table, plus the four that must be
 * REFUSED. Paths and shapes follow the owning Go packages' collection
 * constants (account.ColByUsername, wallet.ColWalletMeta, room.ColTemplates,
 * matchstats.CollectionPrefix, …).
 */
const CENSUS_FILES: CensusFile[] = [
  // --- core: losing any of these is the disaster GH#123 is about -----------
  j(`accounts/${ACC_A}.json`, { id: ACC_A, username: "censusalice", email: "alice@census.test", passwordHash: "$argon2id$fake$a", status: "approved" }, true,
    "帳號本體 —— 沒有它，新主機上沒有人可以登入"),
  j(`accounts/${ACC_B}.json`, { id: ACC_B, username: "censusbob", email: "bob@census.test", passwordHash: "$argon2id$fake$b", status: "approved" }, true,
    "第二個帳號 —— 一個帳號會過的斷言，兩個才看得出「只帶了一部分」"),
  raw("accounts/_index.json", JSON.stringify([ACC_A, ACC_B]), false,
    "衍生索引：匯出用 Scan 枚舉，匯入由 jsonstore.Put 自己重建"),
  j("accounts/by-username/censusalice.json", { id: "censusalice", accountId: ACC_A }, true,
    "使用者名稱索引 —— 掉了就是「密碼全對，但沒有一個帳號認得出來」"),
  j("accounts/by-username/censusbob.json", { id: "censusbob", accountId: ACC_B }, true,
    "同上，第二筆"),
  j("accounts/by-email/alice@census.test.json", { id: "alice@census.test", accountId: ACC_A }, true,
    "Email 索引 —— id 裡有 @ 和 .，任何「收緊命名規則」的硬化都會先殺掉這一列"),
  j("invites/CENSUSINVITE01.json", { id: "CENSUSINVITE01", code: "CENSUSINVITE01", redeemed: false }, true,
    "未兌換邀請碼 —— 掉了就沒有人能再註冊"),
  raw("invites/_index.json", JSON.stringify(["CENSUSINVITE01"]), false,
    "衍生索引"),
  j(`walletmeta/${ACC_A}.json`, { id: ACC_A, crystals: 1234, favourites: ["godie-hart"] }, true,
    "藍水晶餘額 —— owner 明說的不可重建資料"),
  j(`walletmeta/${ACC_B}.json`, { id: ACC_B, crystals: 5678, favourites: [] }, true,
    "同上，第二筆"),
  j("curation/whitelist.json", { id: "whitelist", champions: ["godie-hart"], items: [] }, true,
    "內容白名單 —— 掉了玩家一個英雄都選不到"),
  j("announcements/CENSUSNOTICE01.json", { id: "CENSUSNOTICE01", text: "census" }, true, "公告"),
  j(`friends/${ACC_A}.json`, { id: ACC_A, friends: [ACC_B] }, true, "好友"),
  j("rooms/templates/censusroom.json", { id: "censusroom", name: "census" }, true,
    "房間範本 —— 巢狀 collection（rooms/templates），一層的枚舉會漏掉它"),
  j("content-overlay/overlay.json", { id: "overlay", champions: {} }, true,
    "內容覆蓋層 —— 後台改過的每一個內容值都在這裡"),
  raw("content-overlay-log/2026-07-30.jsonl", '{"at":"2026-07-30T00:00:00Z","who":"census"}\n{"at":"2026-07-30T00:00:01Z","who":"census"}\n', true,
    "覆蓋層歷程 —— KindJSONL，附加檔；副檔名分類寫錯就整類消失"),
  j("config/combat-env.json", { id: "combat-env", damageDealt: 0.5 }, true,
    "戰鬥系統設定 —— config 集合裡「可以搬」的那一半"),
  j("config/server-ops.json", { id: "server-ops", maintenance: false }, true,
    "系統運維設定 —— config 集合裡「可以搬」的另一半"),
  j("config/ai-provider.json", { id: "ai-provider", apiKey: "not-a-real-key-census-fixture" }, false,
    "明文 API key —— 絕對不可隨檔案移動；這是 config 規則 AllowID 的整條安全邊界"),
  j("config/slack-notify.json", { id: "slack-notify", webhook: "https://example.invalid/census" }, false,
    "Slack webhook 是密鑰 —— 同上"),
  j("rankings/s2026a/leaderboard.json", { id: "leaderboard", rows: [] }, true,
    "排行榜快照 —— rankings/<season>，前綴規則枚舉"),
  j("rankings/s2026a/champions/godie-hart.json", { id: "godie-hart", wins: 3 }, true,
    "英雄別排行 —— rankings/<season>/champions，比上一列多一層"),

  // --- matches group ------------------------------------------------------
  j("matches/2026/07/CENSUSMATCH01.json", { id: "CENSUSMATCH01", winner: "A" }, true,
    "對戰紀錄 —— matches/<YYYY>/<MM> 分區"),
  j("match-stats/2026/07/CENSUSMATCH01.json", { id: "CENSUSMATCH01", kills: 7 }, true,
    "覆盤帳本 —— 和上一列同分區但不同 collection；只帶其中一個，後台覆盤頁全空"),

  // --- history / audit groups (both KindJSONL) ----------------------------
  raw(`history/${ACC_A}.jsonl`, '{"match":"CENSUSMATCH01","place":1}\n', true,
    "個人戰績履歷 —— KindJSONL"),
  raw("admin-audit/2026-07-30.jsonl", '{"at":"2026-07-30T00:00:00Z","action":"census"}\n', true,
    "管理稽核紀錄 —— KindJSONL"),

  // --- replays group (opaque bytes) ---------------------------------------
  raw("replays/CENSUSMATCH01.jsonl.gz", REPLAY_BYTES, true,
    "對戰回放 —— 不透明位元組，owner 算在不可重建的那一類"),
];

describe.runIf(haveGo())("ggd-backup.sh — 內容普查：what left the machine IS what was on it", () => {
  let dataDir = "";
  let archive: Map<string, Buffer> = new Map();
  let shippedNames: string[] = [];

  beforeAll(() => {
    const box = newBox();
    dataDir = join(box, "data");
    const dest = join(box, "offsite");
    for (const f of CENSUS_FILES) {
      const abs = join(dataDir, f.rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, f.body);
    }

    const env = baseEnv(box, {
      GGD_BACKUP_SOURCE: "local",
      GGD_BACKUP_DATA_DIR: dataDir,
      GGD_BACKUP_CONTENT_DIR: join(REPO, "content"),
      GGD_BACKUP_GROUPS: "all",
      GGD_BACKUP_DEST: "dir",
      GGD_BACKUP_DEST_URI: dest,
      // The exporter resolves the replay directory from this env var FIRST, so
      // pin it: a developer with GGD_ARCHIVE_REPLAY_DIR exported would otherwise
      // have the census read somebody else's directory and pass for free.
      GGD_ARCHIVE_REPLAY_DIR: join(dataDir, "replays"),
    });

    const r = runScript(["run"], env);
    expect(r.code, r.err).toBe(0);
    const shipped = offsiteZips(dest);
    expect(shipped).toHaveLength(1);
    // Read the OFF-MACHINE copy, not the staging one: the staging file is what
    // the exporter wrote, the off-machine file is what a restore would have.
    archive = extractArchive(join(dest, shipped[0]!), join(box, "unpacked"));
    shippedNames = [...archive.keys()].filter((n) => n !== "manifest.json").sort();
  }, 180_000);

  it("carries EXACTLY the files it is supposed to carry — no more, no fewer", () => {
    const expected = CENSUS_FILES.filter((f) => f.travels).map((f) => f.rel).sort();
    // Guard the guard: if the fixture ever collapses, this test must not pass by
    // comparing two empty lists (failure mode ③).
    expect(expected.length).toBeGreaterThanOrEqual(20);
    expect(shippedNames).toEqual(expected);
  });

  it("every carried file is byte-for-byte identical to the source file", () => {
    for (const f of CENSUS_FILES.filter((x) => x.travels)) {
      const got = archive.get(f.rel);
      expect(got, `${f.rel} is NOT in the archive — ${f.why}`).toBeDefined();
      expect(
        got!.equals(readFileSync(join(dataDir, f.rel))),
        `${f.rel} came back with different bytes — ${f.why}`,
      ).toBe(true);
    }
  });

  it("refuses to carry the secrets and the derived index, by name", () => {
    for (const f of CENSUS_FILES.filter((x) => !x.travels)) {
      expect(shippedNames, `${f.rel} MUST NOT travel — ${f.why}`).not.toContain(f.rel);
    }
    // and the refusal is not "we shipped nothing from that collection": the two
    // config documents that DO travel are in the same directory as the secrets.
    expect(shippedNames).toContain("config/combat-env.json");
    expect(shippedNames).toContain("config/server-ops.json");
  });
});

// ===========================================================================
// verify — the last line of defence, and the one nothing was testing.
//
// `verify` exists to answer "is the newest off-machine copy still a usable
// backup?". It fetches it and hands it to `platformarchive inspect`, which
// recomputes every collection digest. That check is real — but the SCRIPT's
// obligation is to let the answer through. One `|| true` on that line and
// `verify` reports 「✓ verify passed」 over a bucket full of corrupted archives,
// which is worse than never having run it.
//
// The tamper below keeps the entry's LENGTH identical and leaves it valid JSON,
// so it sails past every size and structural check: a byte count that matches
// is not evidence, only the content hash is.
// ===========================================================================
const PY_TAMPER = [
  "import sys, zipfile, os",
  "src, name, old, new = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]",
  "assert len(old) == len(new), 'the tamper must preserve length'",
  "tmp = src + '.tampered'",
  "zin = zipfile.ZipFile(src)",
  "zout = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)",
  "hit = 0",
  "for info in zin.infolist():",
  "    data = zin.read(info.filename)",
  "    if info.filename == name:",
  "        assert old.encode() in data, 'tamper target not found in ' + name",
  "        data = data.replace(old.encode(), new.encode(), 1)",
  "        hit += 1",
  "    zout.writestr(info, data)",
  "zout.close()",
  "zin.close()",
  "assert hit == 1, 'entry ' + name + ' not present'",
  "os.replace(tmp, src)",
].join("\n");

describe.runIf(haveGo())("ggd-backup.sh — `verify` must not bless a tampered off-machine copy", () => {
  it("passes on the untouched copy and FAILS once one document's bytes are edited", () => {
    if (!haveCmd("python3")) {
      throw new Error("python3 is required to rewrite the archive for the tamper case; failing loudly rather than skipping a verification test");
    }
    const box = newBox();
    const dataDir = join(box, "data");
    const dest = join(box, "offsite");
    mkdirSync(join(dataDir, "accounts"), { recursive: true });
    mkdirSync(join(dataDir, "walletmeta"), { recursive: true });
    writeFileSync(
      join(dataDir, "accounts", `${ACC_A}.json`),
      JSON.stringify({ id: ACC_A, username: "tamperuser", passwordHash: "$argon2id$fake" }),
    );
    writeFileSync(
      join(dataDir, "walletmeta", `${ACC_A}.json`),
      JSON.stringify({ id: ACC_A, crystals: 1234, favourites: [] }),
    );

    const env = baseEnv(box, {
      GGD_BACKUP_SOURCE: "local",
      GGD_BACKUP_DATA_DIR: dataDir,
      GGD_BACKUP_CONTENT_DIR: join(REPO, "content"),
      GGD_BACKUP_GROUPS: "core",
      GGD_BACKUP_DEST: "dir",
      GGD_BACKUP_DEST_URI: dest,
      GGD_ARCHIVE_REPLAY_DIR: join(dataDir, "replays"),
    });
    expect(runScript(["run"], env).code).toBe(0);
    const shipped = offsiteZips(dest);
    expect(shipped).toHaveLength(1);
    const artifact = join(dest, shipped[0]!);

    // CONTROL. Without this the test could go green for the wrong reason — a
    // `verify` that fails on everything is not a verification either.
    const clean = runScript(["verify"], env);
    expect(clean.code, clean.err).toBe(0);
    expect(clean.out).toMatch(/verify passed/);

    // Edit one wallet balance inside the archive. Same length, still valid
    // JSON, CRC recomputed by the rewriter — only the collection hash knows.
    execFileSync("python3", ["-c", PY_TAMPER, artifact, `walletmeta/${ACC_A}.json`, '"crystals":1234', '"crystals":9999'], { encoding: "utf8" });

    const bad = runScript(["verify"], env);
    expect(bad.code, "verify blessed an archive whose contents were edited after export").not.toBe(0);
    expect(bad.err + bad.out).toMatch(/walletmeta/);
    expect(bad.err + bad.out).toMatch(/雜湊/);
    expect(bad.out).not.toMatch(/verify passed/);
  }, 180_000);
});

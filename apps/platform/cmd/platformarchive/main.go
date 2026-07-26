// Command platformarchive moves the WHOLE platform data tree between hosts as
// one ZIP — accounts (with password hashes), invites, wallets, the whitelist,
// the content overlay, and optionally matches / history / audit / replays.
//
// THIS CLI IS NOT A CONVENIENCE. It is the ONLY path that works in the primary
// scenario. A brand-new host has no account, therefore nobody can log into the
// admin console, therefore the console's button is unreachable at exactly the
// moment it is most needed. The documented first import is:
//
//	docker compose … exec -T platform /platformarchive apply \
//	    -in - -data /data -content /srv/content < ggd-platform-archive-….zip
//
// then restart the platform and sign in with the OLD host's credentials. The
// console button serves the two remaining cases: "the target already has the
// right owner" and "run it again".
//
// Same shape as cmd/opstate (stdin, so the host filesystem is never touched).
// The two tools are NOT interchangeable: opstate carries operator CHOICES and
// refuses credentials; this carries the credentials.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/ggd/platform/internal/platformarchive"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "export":
		err = runExport(os.Args[2:])
	case "inspect":
		err = runInspect(os.Args[2:])
	case "plan":
		err = runPlanOrApply(os.Args[2:], true)
	case "apply":
		err = runPlanOrApply(os.Args[2:], false)
	case "-h", "--help", "help":
		usage()
		return
	default:
		fmt.Fprintf(os.Stderr, "platformarchive: unknown command %q\n\n", os.Args[1])
		usage()
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "✗ "+err.Error())
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `platformarchive — move the whole platform data tree between hosts

  platformarchive export  -data DIR [-content DIR] [-out FILE|-] [-groups LIST]
  platformarchive inspect -in FILE|-
  platformarchive plan    -in FILE|- -data DIR [-groups LIST] [-allow-overwrite] [-resolve-collisions=adopt-archive]
  platformarchive apply   -in FILE|- -data DIR [-content DIR] [same flags as plan]

  -groups              comma list of: core,matches,history,audit,replays,all   (core is ALWAYS included)
  -allow-overwrite     replace target documents that differ (DANGEROUS: the target is where people played)
  -resolve-collisions  "adopt-archive" — let the archive's account own a colliding username/email
  -json                machine-readable report

Environment fallbacks: -data ← DATA_DIR, -content ← CONTENT_DIR, replays ← GGD_ARCHIVE_REPLAY_DIR.

UNDOING AN IMPORT. Every apply first writes an automatic backup to
data/_migration/backups/<UTC ts>.zip. Re-apply it with BOTH flags:

    platformarchive apply -in - -data /data -content /srv/content \
        -allow-overwrite -resolve-collisions=adopt-archive < <backup>.zip

-resolve-collisions is not optional. A bad import run WITH adopt-archive
repointed usernames at its own accounts, so the backup's refs now read as a
fresh collision — without the flag the restore is refused and writes nothing.

That restore DOES bring back: every document the bad import overwrote, the
identity refs it repointed, and therefore your own console login.

It does NOT delete, so anything the bad import ADDED is still there afterwards.
Every apply prints the additions BY NAME and stores the same list in the
backup's .json (import.addedDocs); an import that added nothing prints so. Deal
with the residue in the console: 玩家 page → 婉拒 the extra accounts, 邀請碼
page → 撤銷 the extra codes. Full detail: docs/runbooks/platform-migration.md §5.5.

The archive contains PASSWORD HASHES and UNREDEEMED INVITE CODES. Move it with
scp or a USB stick, never email/chat/cloud, and delete both copies afterwards.
`)
}

func splitList(s string) []string {
	out := []string{}
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func runExport(args []string) error {
	fs := flag.NewFlagSet("export", flag.ContinueOnError)
	data := fs.String("data", os.Getenv("DATA_DIR"), "DATA_DIR to read (env: DATA_DIR)")
	content := fs.String("content", os.Getenv("CONTENT_DIR"), "content/ tree, for the version stamp (env: CONTENT_DIR)")
	out := fs.String("out", "ggd-platform-archive.zip", `output file, or "-" for stdout`)
	groups := fs.String("groups", "", "comma list of groups (default: core)")
	jsonOut := fs.Bool("json", false, "print the machine report")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *data == "" {
		return fmt.Errorf("platformarchive: -data (or DATA_DIR) is required")
	}
	var w io.Writer
	var closeFn func() error
	if *out == "-" {
		w = os.Stdout
	} else {
		f, err := os.Create(*out) // #nosec G304 -- operator-supplied output path.
		if err != nil {
			return err
		}
		w, closeFn = f, f.Close
	}
	rep, err := platformarchive.Export(w, platformarchive.ExportOptions{
		DataDir:         *data,
		ContentDir:      *content,
		Groups:          splitList(*groups),
		PlatformVersion: os.Getenv("GGD_PLATFORM_VERSION"),
	})
	if closeFn != nil {
		if cerr := closeFn(); err == nil {
			err = cerr
		}
	}
	if err != nil {
		return err
	}
	if *jsonOut {
		return printJSON(rep)
	}
	fmt.Fprintf(os.Stderr, "✓ exported %d file(s) / %d bytes → %s\n", rep.Entries, rep.Bytes, pathLabel(*out))
	for _, c := range rep.Collections {
		fmt.Fprintf(os.Stderr, "    %-28s %5d 個  %10d bytes\n", c.Name, c.Entries, c.Bytes)
	}
	printLines(os.Stderr, "note", rep.Notes)
	printLines(os.Stderr, "WARN", rep.Warnings)
	return nil
}

func readInput(path string) ([]byte, error) {
	if path == "-" || path == "" {
		return io.ReadAll(os.Stdin)
	}
	return os.ReadFile(path) // #nosec G304 -- operator-supplied input path.
}

func openArchive(path string) (*platformarchive.Archive, error) {
	raw, err := readInput(path)
	if err != nil {
		return nil, err
	}
	return platformarchive.OpenReaderAt(bytes.NewReader(raw), int64(len(raw)))
}

func runInspect(args []string) error {
	fs := flag.NewFlagSet("inspect", flag.ContinueOnError)
	in := fs.String("in", "-", `archive file, or "-" for stdin`)
	jsonOut := fs.Bool("json", false, "print the manifest as JSON")
	if err := fs.Parse(args); err != nil {
		return err
	}
	a, err := openArchive(*in)
	if err != nil {
		return err
	}
	defer func() { _ = a.Close() }()
	if *jsonOut {
		return printJSON(a.Manifest)
	}
	m := a.Manifest
	fmt.Printf("kind            %s v%d\n", m.Kind, m.ArchiveVersion)
	fmt.Printf("exported        %s  by %s\n", m.ExportedAt.Format("2006-01-02 15:04:05Z"), m.Source.Tool)
	fmt.Printf("source host     %s   (%s)\n", m.Source.Host, m.Source.DataDir)
	fmt.Printf("content version %s\n", orNone(m.Source.ContentVersion))
	fmt.Printf("platform build  %s\n", orNone(m.Source.PlatformVersion))
	fmt.Printf("groups          %s\n", strings.Join(m.Scope.Selected, ", "))
	fmt.Printf("totals          %d file(s) / %d bytes\n", m.Totals.Entries, m.Totals.UncompressedBytes)
	fmt.Printf("checksum        %s\n", map[bool]string{true: "verified", false: "ABSENT (integrity not claimed)"}[a.ChecksumVerified])
	fmt.Println("collections")
	for _, c := range m.Collections {
		fmt.Printf("    %-28s %-9s %-8s %5d 個  %10d bytes\n", c.Name, c.Kind, c.Group, c.Entries, c.Bytes)
	}
	fmt.Println("deliberately NOT in this archive")
	for _, ex := range m.Scope.Excluded {
		fmt.Printf("    %-22s %s\n", ex.Name, ex.Reason)
	}
	printLines(os.Stdout, "WARN", a.Warnings)
	return nil
}

func runPlanOrApply(args []string, dryRun bool) error {
	name := "apply"
	if dryRun {
		name = "plan"
	}
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	in := fs.String("in", "-", `archive file, or "-" for stdin`)
	data := fs.String("data", os.Getenv("DATA_DIR"), "DATA_DIR to write into (env: DATA_DIR)")
	content := fs.String("content", os.Getenv("CONTENT_DIR"), "content/ tree (env: CONTENT_DIR)")
	groups := fs.String("groups", "", "comma list of groups (default: every group the archive carries)")
	allowOverwrite := fs.Bool("allow-overwrite", false, "replace target documents that differ")
	resolve := fs.String("resolve-collisions", "", `"adopt-archive" to let the archive own a colliding username/email`)
	jsonOut := fs.Bool("json", false, "print the machine report")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *data == "" {
		return fmt.Errorf("platformarchive: -data (or DATA_DIR) is required")
	}
	a, err := openArchive(*in)
	if err != nil {
		return err
	}
	defer func() { _ = a.Close() }()
	t, err := platformarchive.NewTarget(*data, "")
	if err != nil {
		return err
	}
	opts := platformarchive.PlanOptions{
		Groups:            splitList(*groups),
		AllowOverwrite:    *allowOverwrite,
		ResolveCollisions: *resolve,
	}
	plan, err := platformarchive.BuildPlan(a, t, opts)
	if err != nil {
		return err
	}
	if dryRun {
		if *jsonOut {
			return printJSON(plan)
		}
		printPlan(plan)
		if plan.Blocked {
			return fmt.Errorf("platformarchive: 這個 plan 被擋下，匯入會被拒絕（見上方 BLOCKED）")
		}
		return nil
	}

	res, err := platformarchive.Apply(context.Background(), a, t, platformarchive.ApplyOptions{
		PlanOptions:     opts,
		ExpectDigest:    plan.Digest,
		ContentDir:      *content,
		PlatformVersion: os.Getenv("GGD_PLATFORM_VERSION"),
	})
	if err != nil {
		return err
	}
	if *jsonOut {
		return printJSON(res)
	}
	printPlan(res.Plan)
	fmt.Printf("\n✓ 匯入完成：寫入 %d 筆（新增 %d）、相同不動 %d 筆、略過 %d 筆\n",
		res.Written, res.Added, res.Unchanged, res.Skipped)
	if res.Written != res.Plan.Writes {
		fmt.Printf("  ⚠ 試算承諾寫入 %d 筆，實際寫入 %d 筆 —— 請檢查備份\n", res.Plan.Writes, res.Written)
	}
	if res.Backup != nil {
		fmt.Printf("  備份：%s\n", res.Backup.Path)
		printUndo(res)
	}
	printLines(os.Stdout, "note", res.Notes)
	printLines(os.Stdout, "WARN", res.Warnings)
	fmt.Println("\n  Redis 熱層沒有從 CLI 重建（這支程式不連 Redis）——" +
		"請重啟平台，開機會從帳號 JSON 重建索引與排行榜。")
	return nil
}

// printUndo is the recovery block, printed on the SUCCESS path because the
// import that needs undoing is by definition one that reported success.
//
// The order is deliberate: what comes BACK first (a frightened reader must
// learn the important half is recoverable before he can take in anything
// else), then what does not, then the command, then the names.
//
// THE NAMES ARE THE POINT. "Deal with the extra ones yourself" is only an
// instruction if the operator can see which ones they are. The previous cut of
// this block printed a list built from an unvalidated count, and on a no-op
// re-import it named every account on the host — including the operator's own
// family — as something to 婉拒. So the empty case is printed EXPLICITLY here:
// "this import added nothing" is a real, reassuring answer, not an absence.
func printUndo(res *platformarchive.ApplyResult) {
	fmt.Println("\n  要還原這次匯入（兩個旗標都不能少）：")
	fmt.Println("    " + platformarchive.RestoreCommand(res.Backup.Path))
	fmt.Println("  還原救得回來：")
	for _, l := range platformarchive.RestoreRecovers {
		fmt.Println("    ✓ " + l)
	}
	fmt.Println("  還原救不回來：")
	for _, l := range platformarchive.RestoreLimits {
		fmt.Println("    ! " + l)
	}
	if len(res.AddedDocs) == 0 {
		fmt.Println("  這次新增了 0 筆文件 —— 沒有殘留要你處理，還原就能完整回到匯入前。")
		return
	}
	fmt.Printf("  這次新增的 %d 筆（還原不會移除，清單也在 %s）：\n",
		len(res.AddedDocs), res.Backup.ManifestPath)
	for _, d := range res.AddedDocs {
		fmt.Printf("    + %s/%s\n", d.Collection, d.ID)
	}
}

func printPlan(p *platformarchive.Plan) {
	fmt.Printf("%-28s %6s %6s %6s %6s %6s\n", "資料", "新增", "覆蓋", "相同", "略過", "擋下")
	for _, c := range p.Collections {
		fmt.Printf("%-28s %6d %6d %6d %6d %6d\n",
			c.Collection, c.Added, c.Written, c.Unchanged, c.Skipped, c.Blocked)
	}
	// The full account, not just the writes: "0 筆" has to be readable as a
	// FACT ("everything is already there") rather than as a missing number.
	fmt.Printf("\n將寫入 %d 筆；相同不動 %d 筆、略過 %d 筆、擋下 %d 筆。digest %s\n",
		p.Writes, p.Unchanged, p.Skipped, p.BlockedEntries, p.Digest[:16])
	fmt.Println("這份試算就是契約：apply 只會執行上面逐筆列出的判定，不多寫任何一筆。")
	for _, line := range p.BlockedLines() {
		fmt.Println("  BLOCKED  " + line)
	}
	printLines(os.Stdout, "note", p.Notes)
	printLines(os.Stdout, "WARN", p.Warnings)
}

func printLines(w io.Writer, tag string, lines []string) {
	for _, l := range lines {
		fmt.Fprintf(w, "  %s  %s\n", tag, l)
	}
}

func printJSON(v any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

func pathLabel(p string) string {
	if p == "-" {
		return "stdout"
	}
	return p
}

func orNone(s string) string {
	if s == "" {
		return "(none)"
	}
	return s
}

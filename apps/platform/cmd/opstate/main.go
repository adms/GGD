// Command opstate moves OPERATOR STATE — the content whitelist and the
// combat-env / server-ops overrides the owner curated by hand — between two
// DATA_DIRs. It is the fix for the deploy blind spot: .gitignore excludes
// /data/**, so a freshly-cloned family host boots with an EMPTY whitelist and
// nobody can pick a champion. Snapshot on the laptop, restore on the host.
//
//	# on the laptop, snapshot what makes this HIS game
//	go run ./cmd/opstate export -data "$DATA_DIR" -content "$CONTENT_DIR" -out ggd-operator-state.json
//
//	# on the host, before first boot, put it back (verifies every id still exists)
//	go run ./cmd/opstate restore -in ggd-operator-state.json -data "$DATA_DIR" -content "$CONTENT_DIR"
//
// It reads and writes files, not a running server, so it needs no credentials
// and works on a host whose platform will not yet boot. It runs in BOTH
// directions with the same two commands: after playtest one, export from the
// host and restore onto the laptop to bring his console edits home.
//
// See internal/opstate for the format and the invariants; docs/runbooks/
// family-deploy.md § operator-state for where this slots into the deploy.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/ggd/platform/internal/opstate"
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
	case "restore":
		err = runRestore(os.Args[2:])
	case "inspect":
		err = runInspect(os.Args[2:])
	case "-h", "--help", "help":
		usage()
		return
	default:
		fmt.Fprintf(os.Stderr, "opstate: unknown command %q\n\n", os.Args[1])
		usage()
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "✗ "+err.Error())
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `opstate — move operator state (whitelist + combat-env) between deploys

  opstate export  -data DIR [-content DIR] [-out FILE] [-parts LIST] [-allow-empty]
  opstate restore -in FILE  -data DIR [-content DIR] [-parts LIST] [-force] [-strict] [-dry-run]
  opstate inspect -in FILE

  -parts   comma list of: curation,combat-env,server-ops,accounts,all  (default: curation,combat-env,server-ops)
  -force   restore: overwrite target state that is NEWER than the bundle
  -strict  restore: fail if the bundle names content the target tree no longer has
  -dry-run restore: report what WOULD change, write nothing

Environment fallbacks: -data ← DATA_DIR, -content ← CONTENT_DIR.
`)
}

// jsonOut, when true (-json), prints the machine report instead of prose.
func addCommonFlags(fs *flag.FlagSet) (data, content *string, parts *string, jsonOut *bool) {
	data = fs.String("data", os.Getenv("DATA_DIR"), "DATA_DIR to read/write (env: DATA_DIR)")
	content = fs.String("content", os.Getenv("CONTENT_DIR"), "content/ tree, for id verification and the version stamp (env: CONTENT_DIR)")
	parts = fs.String("parts", "", "comma list of parts (default: curation,combat-env,server-ops)")
	jsonOut = fs.Bool("json", false, "emit the report as JSON")
	return
}

func splitParts(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return strings.Split(s, ",")
}

func runExport(args []string) error {
	fs := flag.NewFlagSet("export", flag.ContinueOnError)
	data, content, parts, jsonOut := addCommonFlags(fs)
	out := fs.String("out", "ggd-operator-state.json", "bundle file to write (\"-\" for stdout)")
	allowEmpty := fs.Bool("allow-empty", false, "allow exporting a whitelist that enables no champion")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *data == "" {
		return fmt.Errorf("export: -data (or DATA_DIR) is required")
	}
	bundle, rep, err := opstate.Export(opstate.ExportOptions{
		DataDir:             *data,
		ContentDir:          *content,
		Parts:               splitParts(*parts),
		AllowEmptyWhitelist: *allowEmpty,
		Tool:                "opstate/cli",
	})
	if err != nil {
		return err
	}
	raw, err := bundle.Marshal()
	if err != nil {
		return err
	}
	if *out == "-" {
		os.Stdout.Write(raw)
	} else {
		if err := os.WriteFile(*out, raw, 0o600); err != nil {
			return fmt.Errorf("export: writing %s: %w", *out, err)
		}
	}
	if *jsonOut {
		return printJSON(rep)
	}
	fmt.Printf("✓ exported %s (%d bytes)\n", pathLabel(*out), len(raw))
	fmt.Printf("  parts: %s\n", strings.Join(rep.Parts, ", "))
	fmt.Printf("  whitelist: %d champions / %d items / %d abilities\n", rep.Champions, rep.Items, rep.Abilities)
	if rep.Accounts > 0 {
		fmt.Printf("  accounts: %d\n", rep.Accounts)
	}
	for _, n := range rep.Notes {
		fmt.Printf("  · %s\n", n)
	}
	for _, wn := range rep.Warnings {
		fmt.Printf("  ! %s\n", wn)
	}
	return nil
}

func runRestore(args []string) error {
	fs := flag.NewFlagSet("restore", flag.ContinueOnError)
	data, content, parts, jsonOut := addCommonFlags(fs)
	in := fs.String("in", "", "bundle file to read (\"-\" for stdin)")
	force := fs.Bool("force", false, "overwrite target state that is NEWER than the bundle")
	strict := fs.Bool("strict", false, "fail if the bundle names content the target tree no longer has")
	dryRun := fs.Bool("dry-run", false, "report what would change, write nothing")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *in == "" {
		return fmt.Errorf("restore: -in is required")
	}
	if *data == "" {
		return fmt.Errorf("restore: -data (or DATA_DIR) is required")
	}
	raw, err := readInput(*in)
	if err != nil {
		return err
	}
	bundle, err := opstate.Parse(raw)
	if err != nil {
		return err
	}
	rep, err := opstate.Restore(bundle, opstate.RestoreOptions{
		DataDir:    *data,
		ContentDir: *content,
		Parts:      splitParts(*parts),
		Force:      *force,
		Strict:     *strict,
		DryRun:     *dryRun,
	})
	// Print the report even on error — a blocked/strict failure is the report.
	if rep != nil {
		if *jsonOut {
			_ = printJSON(rep)
		} else {
			printRestore(rep, bundle, *dryRun)
		}
	}
	return err
}

func runInspect(args []string) error {
	fs := flag.NewFlagSet("inspect", flag.ContinueOnError)
	in := fs.String("in", "", "bundle file to read (\"-\" for stdin)")
	jsonOut := fs.Bool("json", false, "emit the bundle metadata as JSON")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *in == "" {
		return fmt.Errorf("inspect: -in is required")
	}
	raw, err := readInput(*in)
	if err != nil {
		return err
	}
	bundle, err := opstate.Parse(raw)
	if err != nil {
		return err
	}
	ok, checkErr := bundle.VerifyChecksum()
	if *jsonOut {
		return printJSON(bundle)
	}
	fmt.Printf("bundle format v%d, exported %s\n", bundle.BundleVersion, bundle.ExportedAt.Format("2006-01-02 15:04:05 MST"))
	fmt.Printf("  from host %q, DATA_DIR %s\n", bundle.Source.Host, bundle.Source.DataDir)
	fmt.Printf("  content version: %s\n", orNone(bundle.Source.ContentVersion))
	fmt.Printf("  parts: %s\n", strings.Join(bundle.Parts(), ", "))
	if bundle.Curation != nil {
		fmt.Printf("  whitelist: %d champions / %d items / %d abilities\n",
			len(bundle.Curation.Doc.Champions), len(bundle.Curation.Doc.Items), len(bundle.Curation.Doc.Abilities))
	}
	fmt.Printf("  combat-env: %s\n", configPartWord(bundle.CombatEnv))
	fmt.Printf("  server-ops: %s\n", configPartWord(bundle.ServerOps))
	if bundle.Accounts != nil {
		fmt.Printf("  accounts: %d documents\n", bundle.Accounts.Count())
	}
	switch {
	case checkErr != nil:
		fmt.Printf("  checksum: FAILED — %v\n", checkErr)
	case ok:
		fmt.Printf("  checksum: verified\n")
	default:
		fmt.Printf("  checksum: none (hand-written bundle)\n")
	}
	return nil
}

func configPartWord(p *opstate.ConfigPart) string {
	if p == nil {
		return "not in bundle"
	}
	if !p.Configured {
		return "NEVER CONFIGURED on source (carries absence — restore writes nothing)"
	}
	return "stored override (updatedAt " + p.UpdatedAt().Format("2006-01-02 15:04:05 MST") + ")"
}

func printRestore(rep *opstate.RestoreReport, bundle *opstate.Bundle, dryRun bool) {
	head := "restore"
	if dryRun {
		head = "restore (dry-run — nothing written)"
	}
	fmt.Printf("%s from bundle exported %s\n", head, bundle.ExportedAt.Format("2006-01-02 15:04:05 MST"))
	for _, a := range rep.Actions {
		fmt.Printf("  %-6s %-11s %s\n", symbol(a.Result), a.Part, a.Detail)
		for _, c := range a.Changes {
			fmt.Printf("            %s\n", c)
		}
	}
	for _, n := range rep.Notes {
		fmt.Printf("  · %s\n", n)
	}
	for _, w := range rep.Warnings {
		fmt.Printf("  ! %s\n", w)
	}
	if rep.Changed {
		fmt.Println("  → target changed.")
	} else if !rep.Blocked {
		fmt.Println("  → nothing to change; target already matches the bundle.")
	}
}

func symbol(result string) string {
	switch result {
	case opstate.ResultWritten:
		return "✓"
	case opstate.ResultUnchanged:
		return "="
	case opstate.ResultSkipped:
		return "·"
	case opstate.ResultBlocked:
		return "✗"
	case opstate.ResultPlanned:
		return "~"
	}
	return "?"
}

func readInput(path string) ([]byte, error) {
	if path == "-" {
		return io.ReadAll(os.Stdin)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", path, err)
	}
	return raw, nil
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

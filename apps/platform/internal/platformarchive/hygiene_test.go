package platformarchive

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// FAILURE MODE #3 — the traps must be STRUCTURALLY unreachable, not filtered.
// ---------------------------------------------------------------------------

func TestExportNeverCarriesTheTraps(t *testing.T) {
	f := newFixture(t)
	raw := f.exportBytes(t, "all")
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatal(err)
	}
	forbidden := []string{
		"owner-setup-token",  // the ownership claim
		"journal/",           // the settlement WAL
		"blizzard-overlay/",  // 84 MB of assets that travel with the image
		"content-backups/",   // dev content-api artefact
		"icon-src-original/", // local asset pipeline
		"_index.json",        // derived state
		"_migration/",        // this feature's own working area
		"ai-provider",        // PLAINTEXT provider key
		"slack-notify",       // webhook secret
	}
	for _, f := range zr.File {
		for _, bad := range forbidden {
			if strings.Contains(f.Name, bad) {
				t.Errorf("archive contains %q, which must be unreachable (matched %q)", f.Name, bad)
			}
		}
	}
	// And the secrets must not appear as CONTENT either — a rule that only
	// checks names would pass on an archive that inlined the key somewhere.
	if bytes.Contains(raw, []byte("sk-PLAINTEXT-SECRET-NEVER-EXPORT")) {
		t.Error("the AI provider key appears in the archive bytes")
	}
	if bytes.Contains(raw, []byte("hooks.slack.test/SECRET")) {
		t.Error("the Slack webhook appears in the archive bytes")
	}
	if bytes.Contains(raw, []byte("OWNER-SETUP-TOKEN-DO-NOT-MOVE")) {
		t.Error("the owner setup token appears in the archive bytes")
	}
}

// ---------------------------------------------------------------------------
// FAILURE MODE #2 — a lost _index.json must not silently empty the archive.
// ---------------------------------------------------------------------------

func TestExportUsesScanNotList(t *testing.T) {
	f := newFixture(t)
	// Destroy the derived index the way a half-written disk would.
	if err := os.Remove(filepath.Join(f.dir, "accounts", "_index.json")); err != nil {
		t.Fatal(err)
	}
	raw := f.exportBytes(t)
	a, err := OpenReaderAt(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = a.Close() }()
	if got := a.Manifest.CountFor("accounts"); got != fixtureAccounts {
		t.Fatalf("accounts in archive = %d, want %d — List() fail-open would give 0", got, fixtureAccounts)
	}
}

// ---------------------------------------------------------------------------
// FAILURE MODE #9 — the id rule must stay jsonstore's, or nobody can log in.
// ---------------------------------------------------------------------------

func TestEmailAndUsernameRefsSurvive(t *testing.T) {
	f := newFixture(t)
	raw := f.exportBytes(t)
	a, err := OpenReaderAt(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = a.Close() }()
	for _, col := range []string{"accounts/by-username", "accounts/by-email"} {
		if got := a.Manifest.CountFor(col); got != fixtureAccounts {
			t.Fatalf("%s = %d, want %d", col, got, fixtureAccounts)
		}
	}
	// The email ref id really does contain `@` and `.` — the exact shape a
	// well-meaning "stricter" sanitiser would reject.
	found := false
	for _, e := range a.ByCollection["accounts/by-email"] {
		if strings.Contains(e.ID, "@") && strings.Contains(e.ID, ".") {
			found = true
		}
	}
	if !found {
		t.Fatal("no by-email entry carried an @ and a . — the fixture stopped exercising the rule")
	}
}

// ---------------------------------------------------------------------------
// ZIP HYGIENE — every one of these refuses the WHOLE archive.
// ---------------------------------------------------------------------------

// craft builds a ZIP with an arbitrary entry set and a manifest that matches
// it, so hygiene refusals are tested in isolation from manifest mismatches.
func craft(t *testing.T, entries map[string][]byte, mutate func(*Manifest)) []byte {
	t.Helper()
	man := &Manifest{
		Kind: Kind, ArchiveVersion: ArchiveVersion,
		ExportedAt: time.Now().UTC(),
		Scope:      Scope{Selected: []string{GroupCore}, Excluded: ExcludedItems()},
		Entries:    map[string]int64{},
	}
	// Only KNOWN collections get a CollectionInfo. That keeps the crafted
	// manifest structurally valid, so each test reaches the specific check it
	// is about instead of tripping the generic "unknown collection" refusal in
	// Manifest.Validate first.
	byCol := map[string][]string{}
	for name := range entries {
		if i := strings.LastIndex(name, "/"); i > 0 && RuleFor(name[:i]) != nil {
			byCol[name[:i]] = append(byCol[name[:i]], name)
		}
		man.Entries[name] = int64(len(entries[name]))
		man.Totals.Entries++
		man.Totals.UncompressedBytes += int64(len(entries[name]))
	}
	for col, names := range byCol {
		rule := RuleFor(col)
		h := newCollectionHasher()
		ids := []string{}
		idOf := map[string]string{}
		for _, n := range names {
			base := n[strings.LastIndex(n, "/")+1:]
			id := base
			if got, err := entryID(rule, n, base); err == nil {
				id = got
			}
			ids = append(ids, id)
			idOf[id] = n
		}
		for _, id := range sortedIDs(ids) {
			body := entries[idOf[id]]
			if err := h.addEntry(id, int64(len(body))); err != nil {
				t.Fatal(err)
			}
			_, _ = h.Write(body)
		}
		digest, count, size := h.sum()
		man.Collections = append(man.Collections, CollectionInfo{
			Name: col, Kind: rule.Kind, Group: rule.Group, ZH: rule.ZH,
			Entries: count, Bytes: size, SHA256: digest,
		})
	}
	if mutate != nil {
		mutate(man)
	}
	// A mutate that set an explicit Checksum keeps it — that is how the
	// tampered-checksum case is expressed.
	if man.Checksum == "" {
		if err := man.Seal(); err != nil {
			t.Fatal(err)
		}
	}
	body, err := man.Marshal()
	if err != nil {
		t.Fatal(err)
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, data := range entries {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	mf, err := zw.Create(ManifestName)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := mf.Write(body); err != nil {
		t.Fatal(err)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func mustReject(t *testing.T, raw []byte, want string) {
	t.Helper()
	_, err := OpenReaderAt(bytes.NewReader(raw), int64(len(raw)))
	if err == nil {
		t.Fatalf("expected a refusal mentioning %q, got none", want)
	}
	if !strings.Contains(err.Error(), want) {
		t.Fatalf("refusal %q does not mention %q", err.Error(), want)
	}
}

func TestRejectsPathTraversal(t *testing.T) {
	raw := craft(t, map[string][]byte{"accounts/../../etc/passwd.json": []byte(`{}`)}, nil)
	mustReject(t, raw, "..")
}

func TestRejectsAbsolutePath(t *testing.T) {
	raw := craft(t, map[string][]byte{"/etc/passwd.json": []byte(`{}`)}, nil)
	mustReject(t, raw, "絕對路徑")
}

func TestRejectsBackslash(t *testing.T) {
	raw := craft(t, map[string][]byte{`accounts\evil.json`: []byte(`{}`)}, nil)
	mustReject(t, raw, "反斜線")
}

func TestRejectsRootLevelEntry(t *testing.T) {
	raw := craft(t, map[string][]byte{"stray.json": []byte(`{}`)}, nil)
	mustReject(t, raw, "根目錄")
}

func TestRejectsUnknownCollection(t *testing.T) {
	// THE case the design calls out by name: a hand-inserted journal file must
	// be REFUSED BY NAME, not silently skipped.
	raw := craft(t, map[string][]byte{"journal/2026-07-26.json": []byte(`{}`)}, nil)
	mustReject(t, raw, "journal")
}

func TestRejectsDerivedIndex(t *testing.T) {
	raw := craft(t, map[string][]byte{"accounts/_index.json": []byte(`[]`)}, nil)
	mustReject(t, raw, "_index.json")
}

func TestRejectsSecretConfigDoc(t *testing.T) {
	raw := craft(t, map[string][]byte{"config/ai-provider.json": []byte(`{"apiKey":"x"}`)}, nil)
	mustReject(t, raw, "config")
}

func TestRejectsUndeclaredEntry(t *testing.T) {
	raw := craft(t, map[string][]byte{"accounts/a.json": []byte(`{}`)}, func(m *Manifest) {
		delete(m.Entries, "accounts/a.json")
	})
	mustReject(t, raw, "沒有宣告")
}

func TestRejectsMissingEntry(t *testing.T) {
	raw := craft(t, map[string][]byte{"accounts/a.json": []byte(`{}`)}, func(m *Manifest) {
		m.Entries["accounts/ghost.json"] = 2
	})
	mustReject(t, raw, "ghost")
}

func TestRejectsWrongKind(t *testing.T) {
	raw := craft(t, map[string][]byte{"accounts/a.json": []byte(`{}`)}, func(m *Manifest) {
		m.Kind = "ggd-operator-state"
	})
	mustReject(t, raw, Kind)
}

func TestRejectsNewerArchiveVersion(t *testing.T) {
	raw := craft(t, map[string][]byte{"accounts/a.json": []byte(`{}`)}, func(m *Manifest) {
		m.ArchiveVersion = ArchiveVersion + 1
	})
	mustReject(t, raw, "NEWER build")
}

func TestRejectsTamperedChecksum(t *testing.T) {
	raw := craft(t, map[string][]byte{"accounts/a.json": []byte(`{"id":"a"}`)}, func(m *Manifest) {
		m.Checksum = strings.Repeat("0", 64) // a syntactically fine, wrong checksum
	})
	mustReject(t, raw, "checksum mismatch")
}

func TestRejectsAlteredCollectionContent(t *testing.T) {
	// Same manifest, different bytes: the collection digest must catch it. The
	// entry SIZE is kept identical on purpose, so this can only be caught by
	// hashing the content — which is the property the format is built around.
	raw := craft(t, map[string][]byte{"accounts/a.json": []byte(`{"id":"a"}`)}, nil)
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			t.Fatal(err)
		}
		if f.Name == "accounts/a.json" {
			data = []byte(`{"id":"B"}`)
		}
		w, err := zw.Create(f.Name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	mustReject(t, buf.Bytes(), "雜湊")
}

func TestRejectsZipBombRatio(t *testing.T) {
	// 1 MiB of one repeated byte deflates to about a kilobyte — a ~1000:1
	// ratio. Nothing this platform legitimately stores looks like that, and the
	// ratio guard is what stops such a member from being decompressed at all.
	body := bytes.Repeat([]byte("A"), 1<<20)
	raw := craft(t, map[string][]byte{"accounts/bomb.json": body}, nil)
	mustReject(t, raw, "壓縮比")
}

func TestRejectsHeaderSizeLie(t *testing.T) {
	raw := craft(t, map[string][]byte{"accounts/a.json": []byte(`{"id":"a"}`)}, func(m *Manifest) {
		m.Entries["accounts/a.json"] = 999
	})
	mustReject(t, raw, "標頭")
}

func TestRejectsInvalidJSONDoc(t *testing.T) {
	raw := craft(t, map[string][]byte{"accounts/a.json": []byte(`not json`)}, nil)
	mustReject(t, raw, "有效的 JSON")
}

func TestManifestChecksumIsOptionalNotFatal(t *testing.T) {
	raw := craft(t, map[string][]byte{"accounts/a.json": []byte(`{"id":"a"}`)}, nil)
	// Blank the checksum the way a hand-assembled archive would.
	var man Manifest
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range zr.File {
		if f.Name != ManifestName {
			continue
		}
		b, err := readEntry(f, MaxManifestBytes)
		if err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(b, &man); err != nil {
			t.Fatal(err)
		}
	}
	man.Checksum = ""
	ok, err := man.VerifyChecksum()
	if err != nil || ok {
		t.Fatalf("an empty checksum must be ok=false with no error, got ok=%v err=%v", ok, err)
	}
}

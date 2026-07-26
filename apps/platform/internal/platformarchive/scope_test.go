package platformarchive

import (
	"strings"
	"testing"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/ai"
	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/invite"
)

// The allowlist is the security boundary. These tests pin the two halves of it:
// what it MUST accept (or the migration is incomplete) and what it MUST refuse
// (or the migration is a leak).

func TestScopeAcceptsEveryCollectionAMigrationNeeds(t *testing.T) {
	must := []string{
		account.ColAccounts, account.ColByUsername, account.ColByEmail,
		invite.Collection, "walletmeta", curation.Collection,
		"config", "content-overlay", "content-overlay-log",
		"announcements", "friends", "rooms/templates",
		"rankings/s1", "rankings/s1/champions",
		"matches/2026/07", "history", admin.ColAudit, ColReplays,
	}
	for _, col := range must {
		if RuleFor(col) == nil {
			t.Errorf("collection %q must be in scope — without it the migration is incomplete", col)
		}
	}
}

func TestScopeRefusesEverythingElse(t *testing.T) {
	// The four that matter most, each named in the design's failure modes.
	for _, col := range []string{
		"journal",           // replays old settlements on the new host
		"blizzard-overlay",  // 84 MB of assets that travel with the image
		"content-backups",   // dev artefact
		"icon-src-original", // local asset pipeline
		"_migration",        // this feature's own working area
		"_migration/staging",
		"secrets",
		"..",
		"",
	} {
		if RuleFor(col) != nil {
			t.Errorf("collection %q must NOT be in scope", col)
		}
	}
}

func TestConfigCollectionCarriesTheTwoDocsAndRefusesBothSecrets(t *testing.T) {
	rule := RuleFor("config")
	if rule == nil || rule.AllowID == nil {
		t.Fatal("the config rule must restrict which documents travel")
	}
	for _, id := range []string{"combat-env", "server-ops"} {
		if !rule.AllowID(id) {
			t.Errorf("config/%s must travel", id)
		}
	}
	for id := range SecretConfigDocs {
		if rule.AllowID(id) {
			t.Errorf("config/%s is a SECRET and must never travel", id)
		}
	}
	if rule.AllowID(ai.DocID) {
		t.Error("the AI provider document must never travel")
	}
}

func TestMigrationDirCanNeverBeACollection(t *testing.T) {
	// This is the structural guarantee the staging/backup area relies on: a
	// leading underscore fails jsonstore's segment rule, so export cannot read
	// it and no archive entry can address it.
	if segmentRe.MatchString(MigrationDir) {
		t.Fatalf("%q must not satisfy the collection-segment rule", MigrationDir)
	}
}

func TestEntryIDRuleMatchesJSONStore(t *testing.T) {
	// Positive cases that a "stricter" rule would wrongly reject.
	for _, id := range []string{
		"takuro", "adms@mobagel.com", "u_01HZZZ", "2026-07-26",
		"godie-a001.ex", "m_0001.jsonl.gz",
	} {
		if !entryIDRe.MatchString(id) {
			t.Errorf("id %q must be accepted — jsonstore accepts it, and login resolves through it", id)
		}
	}
	for _, id := range []string{"", "../etc", "-leading-dash", ".hidden", "with/slash", "with\\backslash"} {
		if entryIDRe.MatchString(id) {
			t.Errorf("id %q must be rejected", id)
		}
	}
}

func TestNormalizeGroupsAlwaysIncludesCore(t *testing.T) {
	got, err := NormalizeGroups([]string{"replays"})
	if err != nil {
		t.Fatal(err)
	}
	if got[0] != GroupCore {
		t.Fatalf("core must always lead: %v", got)
	}
	if _, err := NormalizeGroups([]string{"journal"}); err == nil {
		t.Fatal("an unknown group must be an error, not silently dropped")
	}
	all, err := NormalizeGroups([]string{"all"})
	if err != nil || len(all) != len(AllGroups) {
		t.Fatalf(`"all" must expand to every group, got %v (%v)`, all, err)
	}
}

func TestExcludedListNamesEveryRefusalWithAReason(t *testing.T) {
	// "It is not in the archive" must never be confusable with "I forgot".
	items := ExcludedItems()
	if len(items) < 8 {
		t.Fatalf("the excluded list looks truncated: %d entries", len(items))
	}
	for _, ex := range items {
		if strings.TrimSpace(ex.Name) == "" || strings.TrimSpace(ex.Reason) == "" {
			t.Errorf("excluded entry %+v must carry both a name and a reason", ex)
		}
	}
	want := map[string]bool{
		"config/ai-provider": false, "config/slack-notify": false,
		"journal": false, "owner-setup-token": false, "blizzard-overlay": false,
	}
	for _, ex := range items {
		if _, ok := want[ex.Name]; ok {
			want[ex.Name] = true
		}
	}
	for name, seen := range want {
		if !seen {
			t.Errorf("the manifest must state that %q was left behind, and why", name)
		}
	}
}

func TestPreviewSizesEachGroupBeforeTheOperatorClicks(t *testing.T) {
	f := newFixture(t)
	pv, err := BuildPreview(ExportOptions{DataDir: f.dir})
	if err != nil {
		t.Fatal(err)
	}
	byGroup := map[string]GroupPreview{}
	for _, row := range pv.Groups {
		byGroup[row.Group] = row
	}
	if byGroup[GroupCore].Entries == 0 || byGroup[GroupCore].Bytes == 0 {
		t.Fatal("core must be sized")
	}
	if byGroup[GroupReplays].Entries != 3 {
		t.Fatalf("replays = %d, want 3", byGroup[GroupReplays].Entries)
	}
	// The UI must be able to say "this is the game-server's data, use scp".
	if !strings.Contains(byGroup[GroupReplays].Note, "scp") {
		t.Fatal("the replays row must tell the operator to use scp")
	}
	if !strings.Contains(byGroup[GroupCore].Note, "密碼雜湊") {
		t.Fatal("the core row must say out loud that it carries password hashes")
	}
}

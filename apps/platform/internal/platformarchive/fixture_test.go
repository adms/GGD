package platformarchive

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/ai"
	"github.com/ggd/platform/internal/combatenv"
	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/friend"
	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/invite"
	"github.com/ggd/platform/internal/opsenv"
	"github.com/ggd/platform/internal/room"
	"github.com/ggd/platform/internal/wallet"
)

// ============================================================================
// THE FIXTURE. Owner directive, 2026-07-26: this feature is developed and
// verified against a SYNTHETIC data tree only. Nothing here reads, copies or
// contacts the live deploy — the real host holds 35 real family accounts with
// their progress, and there is no "just to check against real data" exception.
//
// So the fixture is grown from the REAL STRUCTS (account.Account, invite docs,
// curation.Doc, …) through the platform's own writer, which is what makes it a
// faithful stand-in: if a struct changes, this stops compiling.
//
// It deliberately plants the TRAPS as well as the payload:
//   - data/owner-setup-token           (the 0600 ownership claim, DATA_DIR root)
//   - data/journal/<date>.log          (the settlement WAL)
//   - data/blizzard-overlay/x.mdx      (84 MB of assets in real life)
//   - data/content-backups/y.json      (dev content-api artefact)
//   - data/icon-src-original/z.png     (local asset pipeline)
//   - data/config/ai-provider.json     (PLAINTEXT provider API key)
//   - data/config/slack-notify.json    (webhook secret)
//   - every collection's _index.json   (derived state)
//
// Every one of them must be absent from the archive, and hygiene_test.go
// asserts exactly that.
// ============================================================================

const fixtureAccounts = 35

type fixture struct {
	dir       string
	store     *jsonstore.Store
	accountID []string
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	dir := t.TempDir()
	store, err := jsonstore.New(dir)
	if err != nil {
		t.Fatal(err)
	}
	f := &fixture{dir: dir, store: store}
	base := time.Date(2026, 7, 26, 14, 3, 11, 0, time.UTC)

	for i := range fixtureAccounts {
		id := fmt.Sprintf("u_01H%029d", i)
		username := fmt.Sprintf("player%02d", i)
		email := fmt.Sprintf("player%02d@example.test", i)
		acc := account.Account{
			ID: id, Username: username, Email: email,
			// A REALISTIC argon2id-shaped string. It is a fixture value, not a
			// hash of anything, and it is what makes "this file is a credential"
			// concrete in the tests.
			PasswordHash: "$argon2id$v=19$m=65536,t=1,p=2$c29tZXNhbHQ$fixturehashvalue" + fmt.Sprint(i),
			MMR:          1000 + i*7,
			Games:        i % 5,
			Wins:         i % 3,
			CreatedAt:    base.Add(-time.Duration(i) * time.Hour),
			UpdatedAt:    base,
			SeasonPoints: i * 11,
			ChampionPoints: map[string]int{
				"godie-a001": i * 3,
			},
			OwnedChampions: []string{"godie-a001"},
			Status:         account.StatusApproved,
		}
		if i == 0 {
			acc.Roles = []string{admin.RoleAdmin}
		}
		mustPut(t, store, account.ColAccounts, id, acc)
		mustPut(t, store, account.ColByUsername, username, map[string]string{"id": id})
		mustPut(t, store, account.ColByEmail, email, map[string]string{"id": id})
		mustPut(t, store, wallet.ColWalletMeta, id, map[string]any{
			"accountId": id, "crystals": 1000 + i, "favourites": []string{"godie-a001"},
		})
		f.accountID = append(f.accountID, id)
	}

	// UNREDEEMED invite codes — anyone holding one can register.
	for i := range 12 {
		id := fmt.Sprintf("inv_%08d", i)
		mustPut(t, store, invite.Collection, id, map[string]any{
			"id": id, "code": fmt.Sprintf("GGD-TEST-%04d", i), "status": "active",
			"createdAt": base, "version": invite.SchemaVersion,
		})
	}

	mustPut(t, store, curation.Collection, curation.DocID, curation.Doc{
		Version: curation.SchemaVersion, UpdatedAt: base,
		Champions: []string{"godie-a001", "godie-a002"},
		Items:     []string{"item-001"},
		Abilities: []string{"godie-a001.q"},
	})
	mustPut(t, store, combatenv.Collection, combatenv.DocID, map[string]any{
		"multipliers": map[string]float64{"damageDealt": 0.5}, "updatedAt": base,
	})
	mustPut(t, store, opsenv.Collection, opsenv.DocID, map[string]any{
		"maxRooms": 8, "snapshotHz": 30, "updatedAt": base,
	})
	mustPut(t, store, contentoverlay.Collection, contentoverlay.DocID, map[string]any{
		"version": contentoverlay.SchemaVersion, "updatedAt": base,
		"entries": map[string]any{"champions/godie-a001": map[string]any{"name": "測試英雄"}},
	})
	mustPut(t, store, admin.ColAnnouncements, "ann_0001", map[string]any{
		"id": "ann_0001", "title": "測試公告", "active": true,
	})
	mustPut(t, store, friend.ColFriends, f.accountID[0], map[string]any{
		"accountId": f.accountID[0], "friends": []string{f.accountID[1]},
	})
	mustPut(t, store, room.ColTemplates, "tpl_0001", map[string]any{"id": "tpl_0001", "mode": "arena"})
	mustPut(t, store, "rankings/s1", "snapshot", map[string]any{"season": "s1", "entries": []any{}})
	mustPut(t, store, "rankings/s1", "meta", map[string]any{"season": "s1"})
	mustPut(t, store, "rankings/s1/champions", "godie-a001", map[string]any{"championId": "godie-a001"})
	mustPut(t, store, "matches/2026/07", "m_0001", map[string]any{"matchId": "m_0001", "endedAt": base})

	// append-only files
	mustAppend(t, store, gamelink.ColHistory, f.accountID[0], map[string]any{"matchId": "m_0001"})
	mustAppend(t, store, admin.ColAudit, "2026-07-26", admin.AuditEntry{
		AdminID: f.accountID[0], Action: "seed", TS: base,
	})
	mustAppend(t, store, contentoverlay.LogCollection, "2026-07-26", map[string]any{"op": "seed"})

	// opaque replays (game-server's files)
	replays := filepath.Join(dir, ColReplays)
	mustMkdir(t, replays)
	for i := range 3 {
		mustWrite(t, filepath.Join(replays, fmt.Sprintf("m_%04d.jsonl.gz", i)), []byte("not-really-gzip-"+fmt.Sprint(i)))
	}

	// ---- THE TRAPS ---------------------------------------------------------
	mustWrite(t, filepath.Join(dir, "owner-setup-token"), []byte("OWNER-SETUP-TOKEN-DO-NOT-MOVE"))
	mustMkdir(t, filepath.Join(dir, "journal"))
	mustWrite(t, filepath.Join(dir, "journal", "2026-07-26.log"), []byte(`{"intent":"settle"}`))
	mustMkdir(t, filepath.Join(dir, "blizzard-overlay"))
	mustWrite(t, filepath.Join(dir, "blizzard-overlay", "x.mdx"), []byte("BLIZZARD-ASSET"))
	mustMkdir(t, filepath.Join(dir, "content-backups"))
	mustWrite(t, filepath.Join(dir, "content-backups", "y.json"), []byte(`{"backup":true}`))
	mustMkdir(t, filepath.Join(dir, "icon-src-original"))
	mustWrite(t, filepath.Join(dir, "icon-src-original", "z.png"), []byte("PNG"))
	mustPut(t, store, ai.Collection, ai.DocID, map[string]any{
		"provider": "openai", "apiKey": "sk-PLAINTEXT-SECRET-NEVER-EXPORT",
	})
	mustPut(t, store, "config", "slack-notify", map[string]any{
		"webhookUrl": "https://hooks.slack.test/SECRET", "enabled": true,
	})
	return f
}

func mustPut(t *testing.T, s *jsonstore.Store, col, id string, v any) {
	t.Helper()
	if err := s.Put(col, id, v); err != nil {
		t.Fatalf("put %s/%s: %v", col, id, err)
	}
}

func mustAppend(t *testing.T, s *jsonstore.Store, col, id string, v any) {
	t.Helper()
	if err := s.AppendLine(col, id, v); err != nil {
		t.Fatalf("append %s/%s: %v", col, id, err)
	}
}

func mustMkdir(t *testing.T, p string) {
	t.Helper()
	if err := os.MkdirAll(p, 0o750); err != nil {
		t.Fatal(err)
	}
}

func mustWrite(t *testing.T, p string, b []byte) {
	t.Helper()
	if err := os.WriteFile(p, b, 0o600); err != nil {
		t.Fatal(err)
	}
}

// exportBytes runs a full export of the fixture into memory.
func (f *fixture) exportBytes(t *testing.T, groups ...string) []byte {
	t.Helper()
	var buf writerTo
	_, err := Export(&buf, ExportOptions{
		DataDir:  f.dir,
		Groups:   groups,
		Hostname: "fixture-host",
		Now:      func() time.Time { return time.Date(2026, 7, 26, 14, 3, 11, 0, time.UTC) },
	})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	return buf.b
}

// writerTo is a tiny bytes.Buffer stand-in that avoids importing bytes twice
// with different aliases across the test files.
type writerTo struct{ b []byte }

func (w *writerTo) Write(p []byte) (int, error) {
	w.b = append(w.b, p...)
	return len(p), nil
}

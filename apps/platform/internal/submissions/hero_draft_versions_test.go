package submissions

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
)

func TestHeroDraftVersionsRestoreCompleteDataWithoutPublishing(t *testing.T) {
	s, _ := heroFixture(t)
	enabled := true
	enableModelAssets(s, &enabled)
	model, hash := draftModelGLB("original-model-and-clips")
	if err := s.SaveModelAsset("alice", hash, model); err != nil {
		t.Fatal(err)
	}
	payload := json.RawMessage(fmt.Sprintf(`{"project":{"schema":"ggd-hero-project@2","projectId":"hero-proof","brief":{"name":"阿薩謝爾","concept":"THE END OF SON\n「完整台詞」\n"},"stats":{"ad":123},"mechanic":{"sameCaster":true,"consume":3,"enemyBuff":0.1},"presentation":{"uploadedModel":{"sha256":%q,"byteSize":%d},"animationBindings":{"EX":"cast"},"vfx":"golden","audio":"curse"}},"rawInputs":{"unfinished":{"text":"1e-"}},"originalIcons":[{"base64":"AA=="}]}`, hash, len(model)))
	a, err := s.SaveDraft("alice", "hero-proof", 1, payload, nil)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := freezeHero(t, s, "v1")
	publishHero(t, s, snapshot, "published-before-draft-restore")
	controlBefore := heroHash(controlOf(t, s))
	b, err := s.SaveDraft("alice", a.ID, 2, heroDraft(a.ID), nil)
	if err != nil {
		t.Fatal(err)
	}
	store, err := jsonstore.New(s.store.Root())
	if err != nil {
		t.Fatal(err)
	}
	reopened := NewHeroService(store, nil)
	router := heroHTTP(t, reopened, &enabled)
	path := "/hero-works/hero-proof/draft-versions/" + strings.ReplaceAll(a.DraftVersion, ":", "%3A")
	response := heroRequest(router, "GET", path, "alice", "")
	var selected HeroWork
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &selected) != nil || selected.DraftDigest != a.DraftDigest || heroHash(selected.Draft) != heroHash(payload) {
		t.Fatalf("lost original data: %s", response.Body.String())
	}
	response = heroRequest(router, "POST", path+"/restore", "alice", `{"expectedRevision":3}`)
	var restored HeroWork
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &restored) != nil || restored.DraftRevision != 4 || restored.DraftDigest != a.DraftDigest {
		t.Fatalf("restore: %s", response.Body.String())
	}
	page, err := reopened.DraftHistory(context.Background(), restored, "")
	if err != nil || len(page.Versions) != 4 || page.Versions[0].RestoredFrom != a.DraftVersion || page.Versions[1].VersionID != b.DraftVersion {
		t.Fatalf("history lost: %+v %v", page, err)
	}
	if got, err := reopened.ModelAsset("alice", hash); err != nil || !bytes.Equal(got, model) {
		t.Fatal("model/animation bytes lost")
	}
	if heroHash(controlOf(t, s)) != controlBefore {
		t.Fatal("draft browsing/restoring changed published/pending/history state")
	}
	if response := heroRequest(router, "POST", path+"/restore", "alice", `{"expectedRevision":3}`); response.Code != 409 {
		t.Fatal("stale restore overwrote newer draft")
	}
}

func TestHeroDraftVersionsBaselineKeepsLegacyDraftAndSource(t *testing.T) {
	s, _ := heroFixture(t)
	legacy, _ := s.Work("hero-proof")
	legacy.DraftVersion = ""
	legacy.DraftRevision = 27
	legacy.Source = &HeroSource{WorkID: "original", SubmissionID: "source-version", AuthorID: "original-author", PackageDigest: heroHash("source")}
	if err := s.store.Put(CollectionHeroWorks, legacy.ID, legacy); err != nil {
		t.Fatal(err)
	}
	page, err := s.DraftHistory(context.Background(), legacy, "")
	if err != nil || len(page.Versions) != 1 || page.Versions[0].Revision != 27 {
		t.Fatal("legacy baseline missing or fabricated older history")
	}
	firstID := page.HeadVersion
	read, err := s.DraftVersion(context.Background(), legacy, firstID)
	if err != nil || heroHash(read.Source) != heroHash(legacy.Source) || read.DraftDigest != legacy.DraftDigest {
		t.Fatal("legacy read lost source")
	}
	next, err := s.SaveDraft("alice", legacy.ID, 27, heroDraft(legacy.ID), nil)
	if err != nil {
		t.Fatal(err)
	}
	read, err = s.DraftVersion(context.Background(), next, firstID)
	if err != nil || heroHash(read.Source) != heroHash(legacy.Source) || read.DraftRevision != 27 {
		t.Fatal("baseline lost on migration")
	}
}

func TestHeroDraftVersionsDoNotExposeOrphansOtherWorksOrOtherOwners(t *testing.T) {
	s, _ := heroFixture(t)
	work, _ := s.Work("hero-proof")
	orphanWork := work
	orphanWork.DraftRevision++
	orphan := newDraftVersion(orphanWork, work.DraftVersion, "")
	if err := s.putDraftVersion(orphan, work.Draft); err != nil {
		t.Fatal(err)
	}
	other, err := s.SaveDraft("alice", "other-work", 0, heroDraft("other-work"), nil)
	if err != nil {
		t.Fatal(err)
	}
	enabled := false // History still works while intake is closed.
	router := heroHTTP(t, s, &enabled)
	base := "/hero-works/hero-proof/draft-versions"
	for _, test := range []struct {
		method, path, actor, body string
		status                    int
	}{
		{"GET", base, "", "", 401}, {"GET", base, "bob", "", 403},
		{"GET", base + "/" + work.DraftVersion, "bob", "", 403},
		{"POST", base + "/" + work.DraftVersion + "/restore", "bob", `{"expectedRevision":1}`, 403},
		{"GET", base + "/" + other.DraftVersion, "alice", "", 404},
		{"GET", base + "/" + orphan.VersionID, "alice", "", 404},
		{"GET", base + "?cursor=" + orphan.VersionID, "alice", "", 404},
		{"POST", base + "/" + orphan.VersionID + "/restore", "alice", `{"expectedRevision":1}`, 404},
		{"GET", base, "alice", "", 200},
	} {
		if got := heroRequest(router, test.method, test.path, test.actor, test.body); got.Code != test.status {
			t.Fatalf("%s %s as %s = %d: %s", test.method, test.path, test.actor, got.Code, got.Body.String())
		}
	}
}

func TestHeroDraftVersionsConcurrentCASHasOneWinnerAndNoHistoryFork(t *testing.T) {
	s, _ := heroFixture(t)
	s.now = func() time.Time { return time.Date(2026, 9, 7, 1, 0, 0, 0, time.UTC) }
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for _, text := range []string{"A", "B"} {
		wg.Add(1)
		go func(text string) {
			defer wg.Done()
			_, err := s.SaveDraft("alice", "hero-proof", 1, json.RawMessage(strings.ReplaceAll(string(heroDraft("hero-proof")), "1e", text)), nil)
			errs <- err
		}(text)
	}
	wg.Wait()
	close(errs)
	winners := 0
	for err := range errs {
		if err == nil {
			winners++
		}
	}
	work, _ := s.Work("hero-proof")
	page, err := s.DraftHistory(context.Background(), work, "")
	if winners != 1 || err != nil || work.DraftRevision != 2 || len(page.Versions) != 2 {
		t.Fatalf("CAS lost history: %d %+v %v", winners, page, err)
	}
}

func TestHeroDraftVersionsKeepAllHistoryWithBoundedPages(t *testing.T) {
	s, _ := heroFixture(t)
	work, _ := s.Work("hero-proof")
	for i := 1; i < 53; i++ {
		var err error
		work, err = s.SaveDraft("alice", work.ID, work.DraftRevision, work.Draft, nil)
		if err != nil {
			t.Fatal(err)
		}
	}
	page, err := s.DraftHistory(context.Background(), work, "")
	if err != nil || len(page.Versions) != 50 || page.NextVersion == "" {
		t.Fatalf("first page: %+v %v", page, err)
	}
	second, err := s.DraftHistory(context.Background(), work, page.NextVersion)
	if err != nil || len(second.Versions) != 3 || second.NextVersion != "" || second.Versions[2].Revision != 1 {
		t.Fatal("old history truncated")
	}
}

func TestHeroDraftVersionFailureNeverMovesHead(t *testing.T) {
	for _, failure := range []string{"metadata-unwritable", "payload-corrupt", "head-corrupt"} {
		t.Run(failure, func(t *testing.T) {
			s, _ := heroFixture(t)
			before, _ := s.Work("hero-proof")
			switch failure {
			case "metadata-unwritable":
				// A regular file in place of a collection is deterministic on all OSes.
				dir := filepath.Join(s.store.Root(), CollectionHeroDraftVersions)
				if err := os.Rename(dir, dir+"-saved"); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(dir, []byte("unavailable"), 0600); err != nil {
					t.Fatal(err)
				}
			case "payload-corrupt":
				if err := s.store.Put(CollectionHeroDraftPayloads, strings.TrimPrefix(before.DraftDigest, "sha256:"), json.RawMessage(`{"corrupt":true}`)); err != nil {
					t.Fatal(err)
				}
			case "head-corrupt":
				var v HeroDraftVersion
				_ = s.store.Get(CollectionHeroDraftVersions, strings.TrimPrefix(before.DraftVersion, "sha256:"), &v)
				v.Revision++
				if err := s.store.Put(CollectionHeroDraftVersions, strings.TrimPrefix(v.VersionID, "sha256:"), v); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := s.SaveDraft("alice", before.ID, before.DraftRevision, before.Draft, nil); err == nil {
				t.Fatal("save succeeded despite unavailable history")
			}
			after, err := s.Work(before.ID)
			if err != nil || heroHash(after) != heroHash(before) {
				t.Fatal("failed archive changed current draft")
			}
		})
	}
}

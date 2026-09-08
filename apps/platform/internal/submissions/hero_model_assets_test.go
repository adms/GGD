package submissions

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"sync"
	"testing"
)

func draftModelGLB(label string) ([]byte, string) {
	raw := []byte(fmt.Sprintf(`{"asset":{"version":"2.0","generator":%q},"buffers":[{"byteLength":4}]}`, label))
	for len(raw)%4 != 0 {
		raw = append(raw, ' ')
	}
	data := make([]byte, 28+len(raw)+4)
	binary.LittleEndian.PutUint32(data, 0x46546c67)
	binary.LittleEndian.PutUint32(data[4:], 2)
	binary.LittleEndian.PutUint32(data[8:], uint32(len(data)))
	binary.LittleEndian.PutUint32(data[12:], uint32(len(raw)))
	binary.LittleEndian.PutUint32(data[16:], 0x4e4f534a)
	copy(data[20:], raw)
	binary.LittleEndian.PutUint32(data[20+len(raw):], 4)
	binary.LittleEndian.PutUint32(data[24+len(raw):], 0x004e4942)
	sum := sha256.Sum256(data)
	return data, hex.EncodeToString(sum[:])
}
func enableModelAssets(s *HeroService, enabled *bool) {
	s.SetIntakePolicy(func() (HeroIntakePolicy, error) {
		return HeroIntakePolicy{Enabled: true, MaxPendingPerPlayer: 5, QuotaPerPlayerPerDay: 20, MaxBytes: 262144, ModelUploadsEnabled: *enabled}, nil
	})
}
func TestHeroModelAssetsPrivateImmutableAndRollback(t *testing.T) {
	s, _ := heroFixture(t)
	enabled := true
	enableModelAssets(s, &enabled)
	data, hash := draftModelGLB("original")
	for i := 0; i < 2; i++ {
		if err := s.SaveModelAsset("alice", hash, data); err != nil {
			t.Fatal(err)
		}
	}
	if got, err := s.ModelAsset("alice", hash); err != nil || !bytes.Equal(got, data) {
		t.Fatalf("original changed: %v", err)
	}
	if _, err := s.ModelAsset("bob", hash); err == nil {
		t.Fatal("another actor read private bytes")
	}
	var ledger heroModelLedger
	if err := s.store.Get(heroModelLedgerCollection, heroModelOwnerKey("alice"), &ledger); err != nil || len(ledger.Files) != 1 || ledger.Files[hash] != len(data) {
		t.Fatalf("retry counted twice: %+v %v", ledger, err)
	}
	corrupt := bytes.Clone(data)
	corrupt[len(corrupt)-1]++
	if err := s.SaveModelAsset("alice", hash, corrupt); err == nil {
		t.Fatal("digest mismatch overwritten")
	}
	enabled = false
	if err := s.SaveModelAsset("alice", hash, data); err == nil {
		t.Fatal("disabled uploads accepted")
	}
	if got, err := s.ModelAsset("alice", hash); err != nil || !bytes.Equal(got, data) {
		t.Fatal("rollback prevented original recovery")
	}
}
func TestHeroModelAssetsDraftReferencesRequireOwnedDurableBytes(t *testing.T) {
	s, _ := heroFixture(t)
	enabled := true
	enableModelAssets(s, &enabled)
	data, hash := draftModelGLB("reference")
	payload := json.RawMessage(fmt.Sprintf(`{"project":{"schema":"ggd-hero-project@2","projectId":"model-draft","presentation":{"uploadedModel":{"sha256":%q,"byteSize":%d}}}}`, hash, len(data)))
	if _, err := s.SaveDraft("alice", "model-draft", 0, payload, nil); err == nil {
		t.Fatal("missing private asset accepted")
	}
	if err := s.SaveModelAsset("bob", hash, data); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveDraft("alice", "model-draft", 0, payload, nil); err == nil {
		t.Fatal("another actor asset accepted")
	}
	if err := s.SaveModelAsset("alice", hash, data); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveDraft("alice", "model-draft", 0, payload, nil); err != nil {
		t.Fatal(err)
	}
	var broken map[string]any
	_ = json.Unmarshal(payload, &broken)
	broken["modelFiles"] = []any{map[string]any{"sha256": hash, "base64": "AA=="}}
	raw, _ := json.Marshal(broken)
	if _, err := s.SaveDraft("alice", "model-draft", 1, raw, nil); err == nil {
		t.Fatal("binary smuggled into draft JSON")
	}
	work, _ := s.Work("model-draft")
	if work.DraftRevision != 1 {
		t.Fatal("rejection altered cloud draft")
	}
}
func TestHeroModelAssetsConcurrentQuotaReservations(t *testing.T) {
	s, _ := heroFixture(t)
	enabled := true
	enableModelAssets(s, &enabled)
	ledger := heroModelLedger{OwnerID: "alice", Files: map[string]int{}}
	for i := 0; i < MaxHeroModelStoredFiles-1; i++ {
		ledger.Files[fmt.Sprintf("%064x", i)] = 20
	}
	if err := s.store.Put(heroModelLedgerCollection, heroModelOwnerKey("alice"), ledger); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for _, name := range []string{"a", "b"} {
		wg.Add(1)
		go func(name string) {
			defer wg.Done()
			data, hash := draftModelGLB(name)
			errs <- s.SaveModelAsset("alice", hash, data)
		}(name)
	}
	wg.Wait()
	close(errs)
	passed := 0
	for err := range errs {
		if err == nil {
			passed++
		}
	}
	if passed != 1 {
		t.Fatalf("quota raced: %d accepted", passed)
	}
	ledger.Files = map[string]int{}
	for i := 0; i < 4; i++ {
		ledger.Files[fmt.Sprintf("%064x", i)] = MaxHeroModelAssetBytes
	}
	if err := s.store.Put(heroModelLedgerCollection, heroModelOwnerKey("alice"), ledger); err != nil {
		t.Fatal(err)
	}
	data, hash := draftModelGLB("over bytes")
	if err := s.SaveModelAsset("alice", hash, data); err == nil {
		t.Fatal("byte quota bypassed")
	}
}
func TestHeroModelAssetHTTPUsesSessionAndBinaryBoundary(t *testing.T) {
	s, _ := heroFixture(t)
	enabled := true
	enableModelAssets(s, &enabled)
	router := heroHTTP(t, s, &enabled)
	data, hash := draftModelGLB("http")
	request := func(method, actor, mime string, body []byte) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/v1/hero-model-assets/"+hash, bytes.NewReader(body))
		r.Header.Set("x-test-actor", actor)
		r.Header.Set("Content-Type", mime)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	if got := request("PUT", "", "model/gltf-binary", data).Code; got != 401 {
		t.Fatalf("anonymous upload: %d", got)
	}
	if got := request("PUT", "alice", "application/json", data).Code; got != 400 {
		t.Fatalf("wrong MIME: %d", got)
	}
	if got := request("PUT", "alice", "model/gltf-binary", data); got.Code != 200 {
		t.Fatal(got.Body.String())
	}
	if got := request("GET", "bob", "", nil).Code; got != 404 {
		t.Fatalf("other actor read: %d", got)
	}
	got := request("GET", "alice", "", nil)
	if got.Code != 200 || !bytes.Equal(got.Body.Bytes(), data) || got.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatal("private recovery failed")
	}
}
func TestHeroModelSubmissionRollbackDuringValidationAndPlacement(t *testing.T) {
	for _, phase := range []string{"initial", "inspect", "prepare"} {
		t.Run(phase, func(t *testing.T) {
			s, b := heroFixture(t)
			enabled := phase != "initial"
			enableModelAssets(s, &enabled)
			inspection := b.inspections["v1"]
			inspection.Project = json.RawMessage(`{"projectId":"hero-proof","presentation":{"uploadedModel":{"sha256":"fixture"}}}`)
			b.inspections["v1"] = inspection
			if phase == "inspect" {
				b.onInspect = func() { enabled = false }
			}
			if phase == "prepare" {
				b.onPrepare = func() { enabled = false }
			}
			if _, err := s.Submit(context.Background(), "alice", "hero-proof", "model-submit", []byte("v1"), false); err == nil {
				t.Fatal("disabled model submission accepted")
			}
			control, _ := s.Control("hero-proof")
			if control.PendingSubmission != "" {
				t.Fatal("rejected model entered review")
			}
		})
	}
}

func TestHeroModelArchiveLimitDoesNotRaiseOrdinaryHeroLimit(t *testing.T) {
	for _, kind := range []string{"ordinary", "model", "tightened"} {
		t.Run(kind, func(t *testing.T) {
			s, b := heroFixture(t)
			policy := HeroIntakePolicy{Enabled: true, MaxPendingPerPlayer: 5, QuotaPerPlayerPerDay: 20, MaxBytes: 4096, ModelUploadsEnabled: true, ModelMaxBytes: 8192}
			s.SetIntakePolicy(func() (HeroIntakePolicy, error) { return policy, nil })
			archive := bytes.Repeat([]byte("x"), 6000)
			inspection := b.inspections["v1"]
			if kind != "ordinary" {
				inspection.Project = json.RawMessage(`{"projectId":"hero-proof","presentation":{"uploadedModel":{"sha256":"fixture"}}}`)
			}
			b.inspections[string(archive)] = inspection
			if kind == "tightened" {
				b.onInspect = func() { policy.ModelMaxBytes = 4096 }
			}
			_, err := s.Submit(context.Background(), "alice", "hero-proof", "size-limit", archive, false)
			if (err == nil) != (kind == "model") {
				t.Fatalf("%s: %v", kind, err)
			}
			if kind != "model" && len(b.archives) != 0 {
				t.Fatal("oversized archive was placed")
			}
		})
	}
}

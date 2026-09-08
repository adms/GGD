package submissions

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
	"github.com/go-chi/chi/v5"
)

const (
	CollectionHeroDraftVersions = "hero-draft-versions"
	CollectionHeroDraftPayloads = "hero-draft-payloads"
	heroDraftHistoryPageSize    = 50
)

// Metadata stays small when traversing history. Payloads (including unfinished
// inputs and original icons) are immutable and shared only by exact digest.
// Model/animation bytes remain in the owner's immutable model asset store.
type HeroDraftVersion struct {
	Schema          string      `json:"schema"`
	VersionID       string      `json:"versionId"`
	WorkID          string      `json:"workId"`
	OwnerID         string      `json:"ownerId"`
	Revision        int         `json:"revision"`
	DraftDigest     string      `json:"draftDigest"`
	Source          *HeroSource `json:"source,omitempty"`
	CreatedAt       time.Time   `json:"createdAt"`
	UpdatedAt       time.Time   `json:"updatedAt"`
	PreviousVersion string      `json:"previousVersion,omitempty"`
	RestoredFrom    string      `json:"restoredFrom,omitempty"`
}

type HeroDraftHistory struct {
	HeadVersion string             `json:"headVersion"`
	Revision    int                `json:"revision"`
	Versions    []HeroDraftVersion `json:"versions"`
	NextVersion string             `json:"nextVersion,omitempty"`
}

func draftHistoryCorrupt() error {
	return httpx.Err(503, "hero_draft_history_corrupt", "草稿版本資料無法驗證，未覆寫目前作品。")
}
func validSHA256(id string) bool {
	if len(id) != 71 || !strings.HasPrefix(id, "sha256:") || id != strings.ToLower(id) {
		return false
	}
	_, err := hex.DecodeString(id[7:])
	return err == nil
}
func draftVersionDigest(version HeroDraftVersion) string {
	version.VersionID = ""
	return heroHash(version)
}
func newDraftVersion(work HeroWork, previous, restoredFrom string) HeroDraftVersion {
	v := HeroDraftVersion{Schema: "ggd-hero-draft-version@1", WorkID: work.ID, OwnerID: work.OwnerID, Revision: work.DraftRevision, DraftDigest: work.DraftDigest, Source: work.Source, CreatedAt: work.CreatedAt, UpdatedAt: work.UpdatedAt, PreviousVersion: previous, RestoredFrom: restoredFrom}
	v.VersionID = draftVersionDigest(v)
	return v
}
func (v HeroDraftVersion) work(payload json.RawMessage) HeroWork {
	return HeroWork{Schema: "ggd-hero-work@1", ID: v.WorkID, OwnerID: v.OwnerID, DraftRevision: v.Revision, DraftDigest: v.DraftDigest, DraftVersion: v.VersionID, Draft: payload, Source: v.Source, CreatedAt: v.CreatedAt, UpdatedAt: v.UpdatedAt}
}

func (s *HeroService) putDraftVersion(version HeroDraftVersion, payload json.RawMessage) error {
	if version.VersionID != draftVersionDigest(version) || version.DraftDigest != heroHash(payload) {
		return draftHistoryCorrupt()
	}
	// Never overwrite different bytes, including when an interrupted save left
	// objects behind. No Store methods are called from inside Update callbacks.
	if err := s.store.Update(CollectionHeroDraftPayloads, strings.TrimPrefix(version.DraftDigest, "sha256:"), func(raw json.RawMessage) (any, error) {
		if len(raw) > 0 && heroHash(raw) != version.DraftDigest {
			return nil, draftHistoryCorrupt()
		}
		return payload, nil
	}); err != nil {
		return err
	}
	return s.store.Update(CollectionHeroDraftVersions, strings.TrimPrefix(version.VersionID, "sha256:"), func(raw json.RawMessage) (any, error) {
		var old HeroDraftVersion
		if len(raw) > 0 && (json.Unmarshal(raw, &old) != nil || heroHash(old) != heroHash(version)) {
			return nil, draftHistoryCorrupt()
		}
		return version, nil
	})
}

func (s *HeroService) readDraftVersion(id string) (HeroDraftVersion, error) {
	var version HeroDraftVersion
	if !validSHA256(id) {
		return version, httpx.BadRequest("草稿版本 ID 格式錯誤。")
	}
	if err := s.store.Get(CollectionHeroDraftVersions, strings.TrimPrefix(id, "sha256:"), &version); err != nil {
		return version, draftHistoryCorrupt()
	}
	if version.Schema != "ggd-hero-draft-version@1" || version.VersionID != id || draftVersionDigest(version) != id || version.Revision < 1 || !validSHA256(version.DraftDigest) || (version.PreviousVersion != "" && !validSHA256(version.PreviousVersion)) {
		return version, draftHistoryCorrupt()
	}
	return version, nil
}

func (s *HeroService) draftHead(work HeroWork) (HeroDraftVersion, error) {
	// Legacy works are readable without a migration write. The exact remaining
	// draft becomes the baseline on the next save; overwritten pre-upgrade drafts
	// cannot be reconstructed and are never advertised as recovered history.
	if work.DraftVersion == "" {
		return newDraftVersion(work, "", ""), nil
	}
	version, err := s.readDraftVersion(work.DraftVersion)
	if err != nil {
		return version, err
	}
	if heroHash(version.work(work.Draft)) != heroHash(work) {
		return version, draftHistoryCorrupt()
	}
	return version, nil
}

// Walk only the chain rooted at the committed work, not the storage index.
// Failed CAS/crash candidates and another work's versions are never selectable.
func (s *HeroService) visitDraftHistory(ctx context.Context, work HeroWork, visit func(HeroDraftVersion) bool) error {
	v, err := s.draftHead(work)
	if err != nil {
		return err
	}
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		if !visit(v) || v.PreviousVersion == "" {
			return nil
		}
		previous, err := s.readDraftVersion(v.PreviousVersion)
		if err != nil {
			return err
		}
		if previous.WorkID != work.ID || previous.OwnerID != work.OwnerID || previous.Revision != v.Revision-1 || heroHash(previous.Source) != heroHash(work.Source) || !previous.CreatedAt.Equal(work.CreatedAt) {
			return draftHistoryCorrupt()
		}
		v = previous
	}
}

func (s *HeroService) DraftHistory(ctx context.Context, work HeroWork, cursor string) (HeroDraftHistory, error) {
	page := HeroDraftHistory{Revision: work.DraftRevision, Versions: []HeroDraftVersion{}}
	if cursor != "" && !validSHA256(cursor) {
		return page, httpx.BadRequest("草稿歷史游標格式錯誤。")
	}
	started := cursor == ""
	err := s.visitDraftHistory(ctx, work, func(v HeroDraftVersion) bool {
		if page.HeadVersion == "" {
			page.HeadVersion = v.VersionID
		}
		if v.VersionID == cursor {
			started = true
		}
		if !started {
			return true
		}
		page.Versions = append(page.Versions, v)
		if len(page.Versions) == heroDraftHistoryPageSize {
			page.NextVersion = v.PreviousVersion
			return false
		}
		return true
	})
	if err == nil && !started {
		err = httpx.NotFound("這份作品沒有此草稿版本。")
	}
	return page, err
}

func (s *HeroService) DraftVersion(ctx context.Context, work HeroWork, id string) (HeroWork, error) {
	var selected *HeroDraftVersion
	if !validSHA256(id) {
		return HeroWork{}, httpx.BadRequest("草稿版本 ID 格式錯誤。")
	}
	err := s.visitDraftHistory(ctx, work, func(v HeroDraftVersion) bool {
		if v.VersionID == id {
			selected = &v
			return false
		}
		return true
	})
	if err != nil {
		return HeroWork{}, err
	}
	if selected == nil {
		return HeroWork{}, httpx.NotFound("這份作品沒有此草稿版本。")
	}
	payload := work.Draft
	if work.DraftVersion != "" {
		if err := s.store.Get(CollectionHeroDraftPayloads, strings.TrimPrefix(selected.DraftDigest, "sha256:"), &payload); err != nil {
			return HeroWork{}, draftHistoryCorrupt()
		}
	}
	if heroHash(payload) != selected.DraftDigest {
		return HeroWork{}, draftHistoryCorrupt()
	}
	return selected.work(payload), nil
}

func (h *HeroHandlers) draftHistory(w http.ResponseWriter, r *http.Request) {
	work, err := h.own(r, chi.URLParam(r, "id"))
	if err != nil {
		heroError(w, err)
		return
	}
	page, err := h.svc.DraftHistory(r.Context(), work, r.URL.Query().Get("cursor"))
	if err != nil {
		heroError(w, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.WriteJSON(w, 200, page)
}

func draftVersionParam(r *http.Request) string {
	value, err := url.PathUnescape(chi.URLParam(r, "version"))
	if err != nil {
		return ""
	}
	return value
}

func (h *HeroHandlers) draftVersion(w http.ResponseWriter, r *http.Request) {
	work, err := h.own(r, chi.URLParam(r, "id"))
	if err != nil {
		heroError(w, err)
		return
	}
	version, err := h.svc.DraftVersion(r.Context(), work, draftVersionParam(r))
	if err != nil {
		heroError(w, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.WriteJSON(w, 200, version)
}
func (h *HeroHandlers) restoreDraftVersion(w http.ResponseWriter, r *http.Request) {
	work, err := h.own(r, chi.URLParam(r, "id"))
	if err != nil {
		heroError(w, err)
		return
	}
	var in struct {
		ExpectedRevision int `json:"expectedRevision"`
	}
	if !heroBody(w, r, &in, 4096) {
		return
	}
	if work.DraftRevision != in.ExpectedRevision {
		heroError(w, heroConflict("雲端草稿已更新，請重新比較後再回復。"))
		return
	}
	version, err := h.svc.DraftVersion(r.Context(), work, draftVersionParam(r))
	if err != nil {
		heroError(w, err)
		return
	}
	out, err := h.svc.saveDraftVersion(auth.MustIdentity(r.Context()).AccountID, work.ID, in.ExpectedRevision, version.Draft, work.Source, version.DraftVersion)
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, out)
}

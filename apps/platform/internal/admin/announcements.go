package admin

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/httpx"
)

// ColAnnouncements is the durable announcement collection
// (data/announcements/<id>.json).
const ColAnnouncements = "announcements"

// Announcement is one operator broadcast. Active announcements are exposed to
// all clients via the public feed; inactive ones are drafts/retired.
type Announcement struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// PublicAnnouncement is the client-facing projection (no operator metadata).
type PublicAnnouncement struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
}

// CreateAnnouncement mints a durable announcement. createdAt/updatedAt come
// from the clock seam (server-authoritative, deterministic under test).
func (s *Service) CreateAnnouncement(ctx context.Context, adminID, title, body string, active bool) (Announcement, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return Announcement{}, httpx.BadRequest("title is required")
	}
	now := s.now().UTC()
	a := Announcement{
		ID: s.newID(), Title: title, Body: body, Active: active,
		CreatedAt: now, UpdatedAt: now,
	}
	if err := s.store.Put(ColAnnouncements, a.ID, a); err != nil {
		return Announcement{}, err
	}
	if err := s.audit(ctx, adminID, "announcement_create", a.ID, map[string]any{"title": a.Title, "active": a.Active}); err != nil {
		return Announcement{}, err
	}
	return a, nil
}

// UpdateAnnouncement edits title/body/active in place (createdAt is preserved).
func (s *Service) UpdateAnnouncement(ctx context.Context, adminID, id, title, body string, active bool) (Announcement, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return Announcement{}, httpx.BadRequest("title is required")
	}
	var a Announcement
	if err := s.store.Get(ColAnnouncements, id, &a); err != nil {
		return Announcement{}, announcementNotFoundOr(err)
	}
	a.Title, a.Body, a.Active = title, body, active
	a.UpdatedAt = s.now().UTC()
	if err := s.store.Put(ColAnnouncements, a.ID, a); err != nil {
		return Announcement{}, err
	}
	if err := s.audit(ctx, adminID, "announcement_update", a.ID, map[string]any{"title": a.Title, "active": a.Active}); err != nil {
		return Announcement{}, err
	}
	return a, nil
}

// DeleteAnnouncement removes an announcement (idempotent).
func (s *Service) DeleteAnnouncement(ctx context.Context, adminID, id string) error {
	var a Announcement
	if err := s.store.Get(ColAnnouncements, id, &a); err != nil {
		return announcementNotFoundOr(err)
	}
	if err := s.store.Delete(ColAnnouncements, id); err != nil {
		return err
	}
	return s.audit(ctx, adminID, "announcement_delete", id, map[string]any{"title": a.Title})
}

// ListAnnouncements returns every announcement, newest first (admin view).
func (s *Service) ListAnnouncements(ctx context.Context) ([]Announcement, error) {
	ids, err := s.store.List(ColAnnouncements)
	if err != nil {
		return nil, err
	}
	out := []Announcement{}
	for _, id := range ids {
		var a Announcement
		if err := s.store.Get(ColAnnouncements, id, &a); err == nil {
			out = append(out, a)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

// PublicFeed returns active announcements only, newest first (client feed).
func (s *Service) PublicFeed(ctx context.Context) ([]PublicAnnouncement, error) {
	all, err := s.ListAnnouncements(ctx)
	if err != nil {
		return nil, err
	}
	out := []PublicAnnouncement{}
	for _, a := range all {
		if a.Active {
			out = append(out, PublicAnnouncement{ID: a.ID, Title: a.Title, Body: a.Body, CreatedAt: a.CreatedAt})
		}
	}
	return out, nil
}

func announcementNotFoundOr(err error) error {
	if errors.Is(err, jsonstore.ErrNotFound) {
		return httpx.NotFound("announcement not found")
	}
	return err
}

func trimNonEmpty(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t' || s[0] == '\n' || s[0] == '\r') {
		s = s[1:]
	}
	for len(s) > 0 {
		c := s[len(s)-1]
		if c == ' ' || c == '\t' || c == '\n' || c == '\r' {
			s = s[:len(s)-1]
		} else {
			break
		}
	}
	return s
}

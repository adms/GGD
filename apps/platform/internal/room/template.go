package room

import (
	"context"
	"crypto/rand"
	"errors"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/httpx"
)

// ColTemplates is the durable room-template collection
// (data/rooms/templates/<id>.json) — the only durable part of rooms.
const ColTemplates = "rooms/templates"

// Template is a saved room configuration.
type Template struct {
	ID            string    `json:"id"`
	OwnerID       string    `json:"ownerId"`
	Name          string    `json:"name"`
	MapID         string    `json:"mapId"`
	Mode          string    `json:"mode"`
	BotDifficulty string    `json:"botDifficulty"`
	CreatedAt     time.Time `json:"createdAt"`
}

// Templates persists room templates in the JSON store.
type Templates struct {
	store *jsonstore.Store
}

// NewTemplates builds the template repo.
func NewTemplates(store *jsonstore.Store) *Templates { return &Templates{store: store} }

// Save writes a template owned by actor.
func (t *Templates) Save(ctx context.Context, actor string, st Settings) (Template, error) {
	if st.Name == "" {
		return Template{}, httpx.BadRequest("name required")
	}
	if err := validateName(st.Name); err != nil {
		return Template{}, err
	}
	tpl := Template{
		ID:      "tpl_" + ulid.MustNew(ulid.Timestamp(time.Now()), rand.Reader).String(),
		OwnerID: actor, Name: st.Name,
		MapID:         firstNonEmpty(st.MapID, "arena-default"),
		Mode:          "PairedDuels",
		BotDifficulty: firstNonEmpty(st.BotDifficulty, "normal"),
		CreatedAt:     time.Now(),
	}
	if err := t.store.Put(ColTemplates, tpl.ID, tpl); err != nil {
		return Template{}, err
	}
	return tpl, nil
}

// Get loads one template.
func (t *Templates) Get(ctx context.Context, id string) (Template, error) {
	var tpl Template
	err := t.store.Get(ColTemplates, id, &tpl)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return tpl, httpx.NotFound("template not found")
	}
	return tpl, err
}

// List returns all template ids.
func (t *Templates) List(ctx context.Context) ([]string, error) {
	return t.store.List(ColTemplates)
}

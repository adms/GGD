package approvelink

import (
	"errors"
	"strings"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/httpx"
)

// Slack config is stored EXACTLY like the AI provider key (internal/ai): the
// durable truth is one server-side JSON document, data/config/slack-notify.json,
// written through the jsonstore. It holds the enable flag AND the webhook URL —
// the webhook is a SECRET (anyone who has it can post into the owner's channel),
// so it is NEVER returned to a client in full (GET returns it masked) and is
// NEVER written to content/ or anything the client can read.
const (
	slackCollection    = "config"
	slackDocID         = "slack-notify"
	slackSchemaVersion = 1
	// maxWebhookLen bounds the stored webhook so a buggy/malicious PUT cannot
	// bloat the durable file.
	maxWebhookLen = 512
)

// SlackConfig is the durable, server-side notification configuration. Like
// ai.Config it is the on-disk truth and is NEVER serialized to a client — the
// webhook would leak; handlers return SlackPublic instead.
type SlackConfig struct {
	Version    int       `json:"version"`
	UpdatedAt  time.Time `json:"updatedAt"`
	Enabled    bool      `json:"enabled"`
	WebhookURL string    `json:"webhookUrl"`
}

// DefaultSlackConfig is the shipped state: DISABLED, no webhook.
func DefaultSlackConfig() SlackConfig { return SlackConfig{Version: slackSchemaVersion} }

// SlackPublic is the masked, client-safe projection. The raw webhook never
// appears — only a masked hint plus the booleans the UI needs.
type SlackPublic struct {
	Version   int       `json:"version"`
	UpdatedAt time.Time `json:"updatedAt"`
	Enabled   bool      `json:"enabled"`
	// WebhookMasked is a non-reversible hint like "https://hooks.slack.com/…wXyZ"
	// ("" when unset).
	WebhookMasked string `json:"webhookMasked"`
	// HasWebhook reports whether a webhook is stored (without revealing it).
	HasWebhook bool `json:"hasWebhook"`
	// EnvWebhook reports that GGD_SLACK_WEBHOOK_URL is set in the environment,
	// which OVERRIDES the stored one — so the console can explain why editing the
	// stored value has no effect.
	EnvWebhook bool `json:"envWebhook"`
	// Ready reports whether a real notification would be sent right now (enabled,
	// a webhook from either source, AND an absolute public URL to build the link).
	Ready bool `json:"ready"`
}

// maskWebhook turns the secret webhook into a client-safe hint: scheme+host and
// the last 4 characters. A short/odd value is fully starred.
func maskWebhook(u string) string {
	u = strings.TrimSpace(u)
	if u == "" {
		return ""
	}
	host := u
	if i := strings.Index(u, "://"); i >= 0 {
		rest := u[i+3:]
		if j := strings.IndexByte(rest, '/'); j >= 0 {
			host = u[:i+3+j]
		}
	}
	r := []rune(u)
	if len(r) <= len(host)+4 {
		return host + "/…"
	}
	return host + "/…" + string(r[len(r)-4:])
}

// slackRepo is the durable store of the single slack-notify document.
type slackRepo struct{ store *jsonstore.Store }

func newSlackRepo(store *jsonstore.Store) *slackRepo { return &slackRepo{store: store} }

// Load reads the JSON truth. A missing file is the shipped default (disabled).
func (r *slackRepo) Load() (SlackConfig, error) {
	var c SlackConfig
	err := r.store.Get(slackCollection, slackDocID, &c)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return DefaultSlackConfig(), nil
	}
	if err != nil {
		return DefaultSlackConfig(), err
	}
	if c.Version == 0 {
		c.Version = slackSchemaVersion
	}
	return c, nil
}

// Save writes the JSON truth atomically.
func (r *slackRepo) Save(c SlackConfig) error {
	return r.store.Put(slackCollection, slackDocID, c)
}

// SlackUpdate is the write payload: every field is OPTIONAL (nil = not sent, so
// the stored value survives), the same partial-update rule ai.Update has, so a
// console can toggle enabled without resending the secret.
type SlackUpdate struct {
	Enabled    *bool
	WebhookURL *string
}

// validWebhook checks the webhook shape. Empty is allowed (clears it). It MUST
// be https — an incoming webhook is a secret bearer URL, and http would send it
// (and every registrant's username/email in the payload) in the clear.
func validWebhook(u string) error {
	u = strings.TrimSpace(u)
	if u == "" {
		return nil
	}
	if len(u) > maxWebhookLen {
		return httpx.BadRequest("webhook URL too long")
	}
	if !strings.HasPrefix(u, "https://") {
		return httpx.BadRequest("webhook URL must start with https://")
	}
	return nil
}

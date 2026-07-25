package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// resolveBool is the enable-toggle parser shared by GGD_SLACK_NOTIFY_ENABLED.
// The point of the table is the DEFAULT: anything unrecognised — including empty
// — is OFF, so the #209 feature never turns itself on by accident.
func TestResolveBool(t *testing.T) {
	on := []string{"1", "true", "TRUE", "yes", "on", "  On  "}
	off := []string{"", "0", "false", "no", "off", "maybe", "2", "garbage"}
	for _, v := range on {
		assert.True(t, resolveBool(v), "resolveBool(%q) must be true", v)
	}
	for _, v := range off {
		assert.False(t, resolveBool(v), "resolveBool(%q) must be false", v)
	}
}

// Load reads the #209 env inputs: the public URL (trailing slash trimmed so the
// approve link is built cleanly) and the Slack webhook + enable toggle. A
// loopback bind is used so checkDeploySecrets is skipped and the test needs no
// production-strength secrets.
func TestLoadReadsSlackAndPublicURL(t *testing.T) {
	t.Setenv("PLATFORM_ADDR", "127.0.0.1:8080")
	t.Setenv("JWT_SIGNING_SECRET", "x")
	t.Setenv("PLATFORM_GAME_SHARED_SECRET", "y")
	t.Setenv("GGD_PUBLIC_URL", "https://ggd.adms.ai/")
	t.Setenv("GGD_SLACK_WEBHOOK_URL", "  https://hooks.slack.com/services/T/B/xyz  ")
	t.Setenv("GGD_SLACK_NOTIFY_ENABLED", "1")

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, "https://ggd.adms.ai", cfg.PublicURL, "the trailing slash must be trimmed")
	assert.Equal(t, "https://hooks.slack.com/services/T/B/xyz", cfg.SlackWebhookURL, "the webhook must be trimmed")
	assert.True(t, cfg.SlackNotifyEnabled)
}

// Unset → the feature is off and no URL is carried.
func TestLoadSlackDefaultsOff(t *testing.T) {
	t.Setenv("PLATFORM_ADDR", "127.0.0.1:8080")
	t.Setenv("JWT_SIGNING_SECRET", "x")
	t.Setenv("PLATFORM_GAME_SHARED_SECRET", "y")
	// Deliberately unset the #209 vars.
	t.Setenv("GGD_PUBLIC_URL", "")
	t.Setenv("GGD_SLACK_WEBHOOK_URL", "")
	t.Setenv("GGD_SLACK_NOTIFY_ENABLED", "")

	cfg, err := Load()
	require.NoError(t, err)
	assert.Empty(t, cfg.PublicURL)
	assert.Empty(t, cfg.SlackWebhookURL)
	assert.False(t, cfg.SlackNotifyEnabled)
}

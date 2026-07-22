package ai_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// grantAdmin promotes an account to the admin role on the JSON truth. AdminOnly
// reloads the account per request, so the existing token gains admin rights.
func grantAdmin(t *testing.T, ts *testutil.TS, id string) {
	t.Helper()
	_, err := ts.Srv.Accounts.Update(context.Background(), id, func(a *account.Account) error {
		if !a.HasRole(admin.RoleAdmin) {
			a.Roles = append(a.Roles, admin.RoleAdmin)
		}
		return nil
	})
	require.NoError(t, err)
}

// ai-api-admin-config: the provider config is admin-gated. No token → 401, a
// normal user → 403, an admin → 200. A PUT with a key round-trips MASKED (the
// raw key never comes back), and the fresh install is disabled (stub mode).
func TestAPIAdminConfig(t *testing.T) {
	testkit.Cover(t, "ai-api-admin-config")
	ts := testutil.New(t)
	normal := ts.Register("normal")
	boss := ts.Register("boss")

	// GET: no token → 401; normal user → 403.
	r := ts.Do(http.MethodGet, "/api/v1/admin/ai/config", "", nil)
	assert.Equal(t, http.StatusUnauthorized, r.Status)
	r = ts.Do(http.MethodGet, "/api/v1/admin/ai/config", normal.Access, nil)
	assert.Equal(t, http.StatusForbidden, r.Status)
	assert.Equal(t, "admin_required", r.ErrCode())

	// PUT: normal user → 403.
	body := map[string]any{
		"enabled":      true,
		"imageBaseUrl": "https://api.example.com/v1",
		"imageModel":   "img-1",
		"textBaseUrl":  "https://api.example.com/v1",
		"textModel":    "txt-1",
		"apiKey":       "sk-live-DONOTLEAK-9999",
	}
	r = ts.Do(http.MethodPut, "/api/v1/admin/ai/config", normal.Access, body)
	assert.Equal(t, http.StatusForbidden, r.Status)

	// Promote boss → admin GET shows the shipped default (disabled, no key).
	grantAdmin(t, ts, boss.ID)
	r = ts.Do(http.MethodGet, "/api/v1/admin/ai/config", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status, "admin GET: %s", string(r.Raw))
	assert.Equal(t, false, r.Body["enabled"])
	assert.Equal(t, false, r.Body["hasKey"])
	assert.Equal(t, "", r.Body["apiKeyMasked"])

	// Admin PUT saves; the key comes back MASKED and never in full.
	r = ts.Do(http.MethodPut, "/api/v1/admin/ai/config", boss.Access, body)
	require.Equal(t, http.StatusOK, r.Status, "admin PUT: %s", string(r.Raw))
	assert.Equal(t, true, r.Body["enabled"])
	assert.Equal(t, true, r.Body["hasKey"])
	masked, _ := r.Body["apiKeyMasked"].(string)
	assert.NotEqual(t, "sk-live-DONOTLEAK-9999", masked)
	assert.NotContains(t, string(r.Raw), "DONOTLEAK", "the raw key must never be in a client response")
	assert.Equal(t, true, r.Body["imageReady"])

	// A fresh GET still masks and never leaks the raw key.
	r = ts.Do(http.MethodGet, "/api/v1/admin/ai/config", boss.Access, nil)
	require.Equal(t, http.StatusOK, r.Status)
	assert.NotContains(t, string(r.Raw), "DONOTLEAK")
	assert.Equal(t, true, r.Body["hasKey"])
}

// ai-api-icon-stub: /ai/icon is authed (any valid token) and, unconfigured,
// returns the stub placeholder shape { pngBase64, dataUrl, mime, stub:true }.
func TestAPIIconStub(t *testing.T) {
	testkit.Cover(t, "ai-api-icon-stub")
	ts := testutil.New(t)
	user := ts.Register("editor")

	// No token → 401.
	r := ts.Do(http.MethodPost, "/api/v1/ai/icon", "", map[string]any{"prompt": "a dragon"})
	assert.Equal(t, http.StatusUnauthorized, r.Status)

	// Authed, unconfigured → stub PNG.
	r = ts.Do(http.MethodPost, "/api/v1/ai/icon", user.Access, map[string]any{
		"prompt": "a fiery dragon knight", "style": "voxel", "size": 128,
	})
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	assert.Equal(t, true, r.Body["stub"])
	assert.Equal(t, "image/png", r.Body["mime"])
	b64, _ := r.Body["pngBase64"].(string)
	assert.NotEmpty(t, b64)
	dataURL, _ := r.Body["dataUrl"].(string)
	assert.Contains(t, dataURL, "data:image/png;base64,")

	// Empty prompt → 400.
	r = ts.Do(http.MethodPost, "/api/v1/ai/icon", user.Access, map[string]any{"prompt": "  "})
	assert.Equal(t, http.StatusBadRequest, r.Status)
	assert.Equal(t, "bad_request", r.ErrCode())
}

// ai-api-tts-stub: /ai/tts is authed and, unconfigured, answers a 501-style
// JSON { stub:true } (NO audio) so client tooling keeps its local clips.
func TestAPITTSStub(t *testing.T) {
	testkit.Cover(t, "ai-api-tts-stub")
	ts := testutil.New(t)
	user := ts.Register("voagent")

	// No token → 401.
	r := ts.Do(http.MethodPost, "/api/v1/ai/tts", "", map[string]any{"text": "歡迎", "lang": "zh-TW"})
	assert.Equal(t, http.StatusUnauthorized, r.Status)

	// Authed, unconfigured → 501 Not Implemented with stub:true (no audio field).
	r = ts.Do(http.MethodPost, "/api/v1/ai/tts", user.Access, map[string]any{
		"text": "請確認你的隊友是不是白目", "lang": "zh-TW",
	})
	require.Equal(t, http.StatusNotImplemented, r.Status, "%s", string(r.Raw))
	assert.Equal(t, true, r.Body["stub"])
	assert.Equal(t, "tts_not_configured", r.Body["code"])
	assert.NotContains(t, r.Body, "mp3Base64", "stub mode carries no audio")

	// Empty text → 400.
	r = ts.Do(http.MethodPost, "/api/v1/ai/tts", user.Access, map[string]any{"text": "  "})
	assert.Equal(t, http.StatusBadRequest, r.Status)
	assert.Equal(t, "bad_request", r.ErrCode())
}

// ai-api-text-stub: /ai/text is authed and, unconfigured, returns
// { text, stub:true } with a non-empty canned string.
func TestAPITextStub(t *testing.T) {
	testkit.Cover(t, "ai-api-text-stub")
	ts := testutil.New(t)
	user := ts.Register("editor")

	r := ts.Do(http.MethodPost, "/api/v1/ai/text", "", map[string]any{"prompt": "x", "field": "description"})
	assert.Equal(t, http.StatusUnauthorized, r.Status)

	r = ts.Do(http.MethodPost, "/api/v1/ai/text", user.Access, map[string]any{
		"prompt": "生成英雄描述", "field": "description", "context": "name: 火龍騎士",
	})
	require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
	assert.Equal(t, true, r.Body["stub"])
	text, _ := r.Body["text"].(string)
	assert.NotEmpty(t, text)
}

// ai-api-music-stub: /ai/music is authed and, unconfigured, answers a 501-style
// JSON { stub:true } naming the LOCAL generator (tools/bgm-gen) rather than
// pretending to produce a track.
func TestAPIMusicStub(t *testing.T) {
	testkit.Cover(t, "ai-api-music-stub")
	ts := testutil.New(t)
	user := ts.Register("composer")

	// No token → 401.
	r := ts.Do(http.MethodPost, "/api/v1/ai/music", "", map[string]any{"prompt": "battle theme"})
	assert.Equal(t, http.StatusUnauthorized, r.Status)

	// Authed, unconfigured → 501 Not Implemented with stub:true (no audio field).
	r = ts.Do(http.MethodPost, "/api/v1/ai/music", user.Access, map[string]any{
		"prompt": "sacred choral battle theme in D minor", "scene": "combat", "durationSec": 45,
	})
	require.Equal(t, http.StatusNotImplemented, r.Status, "%s", string(r.Raw))
	assert.Equal(t, true, r.Body["stub"])
	assert.Equal(t, "music_not_configured", r.Body["code"])
	assert.NotContains(t, r.Body, "mp3Base64", "stub mode carries no audio")
	assert.Contains(t, string(r.Raw), "tools/bgm-gen", "the 501 names the local generator")

	// Empty prompt → 400.
	r = ts.Do(http.MethodPost, "/api/v1/ai/music", user.Access, map[string]any{"prompt": "  "})
	assert.Equal(t, http.StatusBadRequest, r.Status)
	assert.Equal(t, "bad_request", r.ErrCode())
}

// ai-api-music-config: the music provider fields round-trip through the
// admin-gated config endpoint, and the API key is never returned in full.
func TestAPIMusicConfig(t *testing.T) {
	testkit.Cover(t, "ai-api-music-config")
	ts := testutil.New(t)
	boss := ts.Register("boss2")
	grantAdmin(t, ts, boss.ID)

	r := ts.Do(http.MethodPut, "/api/v1/admin/ai/config", boss.Access, map[string]any{
		"enabled":      true,
		"musicBaseUrl": "https://api.example.com/v1",
		"musicModel":   "music-1",
		"apiKey":       "sk-live-DONOTLEAK-7777",
	})
	require.Equal(t, http.StatusOK, r.Status, "admin PUT: %s", string(r.Raw))
	assert.Equal(t, true, r.Body["musicReady"], "enabled + key + endpoint + model → music ready")
	assert.Equal(t, false, r.Body["imageReady"], "image left unconfigured stays stub")
	assert.Equal(t, "music-1", r.Body["musicModel"])
	assert.NotContains(t, string(r.Raw), "DONOTLEAK", "the raw key must never be in a client response")

	// A normal user cannot read or write the music provider config.
	normal := ts.Register("normal2")
	r = ts.Do(http.MethodGet, "/api/v1/admin/ai/config", normal.Access, nil)
	assert.Equal(t, http.StatusForbidden, r.Status)
}

// ai-api-config-partial-save: the config PUT is a PARTIAL update. A client that
// sends only the fields it knows about must NOT blank the capabilities it
// omitted — the admin console only sends enabled + image/text, so a plain save
// used to silently wipe a TTS/music provider configured over the API and drop
// both back to stub mode. An explicitly-sent empty string still clears.
func TestAPIConfigPartialSaveKeepsOmittedFields(t *testing.T) {
	testkit.Cover(t, "ai-api-config-partial-save")
	ts := testutil.New(t)
	boss := ts.Register("boss3")
	grantAdmin(t, ts, boss.ID)

	// Configure EVERY capability (the API-only path: tts + music included).
	r := ts.Do(http.MethodPut, "/api/v1/admin/ai/config", boss.Access, map[string]any{
		"enabled":      true,
		"imageBaseUrl": "https://api.example.com/v1",
		"imageModel":   "img-1",
		"textBaseUrl":  "https://api.example.com/v1",
		"textModel":    "txt-1",
		"ttsBaseUrl":   "https://api.example.com/v1",
		"ttsModel":     "tts-1",
		"ttsVoice":     "shimmer",
		"musicBaseUrl": "https://api.example.com/v1",
		"musicModel":   "music-1",
		"apiKey":       "sk-live-DONOTLEAK-5555",
	})
	require.Equal(t, http.StatusOK, r.Status, "admin PUT: %s", string(r.Raw))
	require.Equal(t, true, r.Body["ttsReady"])
	require.Equal(t, true, r.Body["musicReady"])

	// Now save the way the admin console does: enabled + image/text ONLY, with
	// no apiKey and no tts/music fields at all.
	r = ts.Do(http.MethodPut, "/api/v1/admin/ai/config", boss.Access, map[string]any{
		"enabled":      true,
		"imageBaseUrl": "https://api.example.com/v2",
		"imageModel":   "img-2",
		"textBaseUrl":  "https://api.example.com/v2",
		"textModel":    "txt-2",
	})
	require.Equal(t, http.StatusOK, r.Status, "admin PUT: %s", string(r.Raw))

	// The fields that WERE sent changed…
	assert.Equal(t, "img-2", r.Body["imageModel"])
	assert.Equal(t, "https://api.example.com/v2", r.Body["textBaseUrl"])
	// …and every omitted field survived, capabilities included.
	assert.Equal(t, true, r.Body["ttsReady"], "an omitted TTS config must not be blanked")
	assert.Equal(t, true, r.Body["musicReady"], "an omitted music config must not be blanked")
	assert.Equal(t, "tts-1", r.Body["ttsModel"])
	assert.Equal(t, "shimmer", r.Body["ttsVoice"])
	assert.Equal(t, "music-1", r.Body["musicModel"])
	assert.Equal(t, true, r.Body["hasKey"], "an omitted key keeps the stored secret")
	assert.NotContains(t, string(r.Raw), "DONOTLEAK")

	// Omitting `enabled` likewise keeps it — a partial save cannot disable AI.
	r = ts.Do(http.MethodPut, "/api/v1/admin/ai/config", boss.Access, map[string]any{"imageModel": "img-3"})
	require.Equal(t, http.StatusOK, r.Status, "admin PUT: %s", string(r.Raw))
	assert.Equal(t, true, r.Body["enabled"], "an omitted enabled flag keeps the stored value")

	// Clearing is still possible — but only by SENDING the empty value.
	r = ts.Do(http.MethodPut, "/api/v1/admin/ai/config", boss.Access, map[string]any{
		"ttsBaseUrl": "", "ttsModel": "", "ttsVoice": "",
	})
	require.Equal(t, http.StatusOK, r.Status, "admin PUT: %s", string(r.Raw))
	assert.Equal(t, false, r.Body["ttsReady"], "an explicitly emptied endpoint clears → stub mode")
	assert.Equal(t, "", r.Body["ttsModel"])
	assert.Equal(t, true, r.Body["musicReady"], "…without touching the other capabilities")
	assert.Equal(t, true, r.Body["imageReady"])
}

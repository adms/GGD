// Package testutil boots the fully-wired platform against in-process
// dependencies (miniredis + t.TempDir + fake game server), so every test runs
// with no external services.
package testutil

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/alexedwards/argon2id"
	"github.com/alicebob/miniredis/v2"
	"github.com/coder/websocket"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/gamelink/gamelinktest"
	"github.com/ggd/platform/internal/server"
)

// LightArgon2 keeps hashing honest but fast in tests.
var LightArgon2 = &argon2id.Params{
	Memory: 8 * 1024, Iterations: 1, Parallelism: 1, SaltLength: 16, KeyLength: 32,
}

// Secrets used across tests.
const (
	JWTSecret  = "test-jwt-signing-secret"
	GameSecret = "test-platform-game-shared-secret"
)

// TS is one fully-wired test platform.
type TS struct {
	T    *testing.T
	Srv  *server.Server
	Mini *miniredis.Miniredis
	HTTP *httptest.Server
	Node *gamelinktest.FakeNode
	Cfg  config.Config
}

// WriteContentFixture materializes a minimal read-only content/ tree for the
// store catalog: two free starter champions (sela, thorne), one priced
// champion (vex, 900), two 750-M-COIN skins and the placement reward table —
// mirroring the real content/config/store.json + content/skins docs.
//
// The champions/_index.json is what makes sela/thorne/vex CHAMPIONS at all
// (2026-07-30). Under the flat-price model the store doc no longer enumerates
// champions — it carries one price and a free list — so the roster comes from
// the champions collection index, exactly as it does in the real tree. Without
// this file the fixture catalog would have zero champions and every wallet
// test would 404.
func WriteContentFixture(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	files := map[string]string{
		"config/store.json": `{
  "id": "store",
  "schema": "config.store@1",
  "championUnlockCost": 900,
  "freeChampionIds": ["sela", "thorne"],
  "mcoinRewards": { "placement1": 200, "placement2": 120, "placement3": 80, "placement4": 50 }
}`,
		"champions/_index.json": `{
  "collection": "champions",
  "hash": "000000000000",
  "entries": [
    { "id": "sela", "path": "champions/sela.json", "hash": "0", "size": 0 },
    { "id": "thorne", "path": "champions/thorne.json", "hash": "0", "size": 0 },
    { "id": "vex", "path": "champions/vex.json", "hash": "0", "size": 0 }
  ]
}`,
		"skins/skin.thorne.barbarian.json": `{
  "id": "skin.thorne.barbarian",
  "schema": "skin@1",
  "championId": "thorne",
  "name": "Warbringer Thorne",
  "mcoinPrice": 750,
  "modelKey": "champ.skin.barbarian"
}`,
		"skins/skin.sela.rogue.json": `{
  "id": "skin.sela.rogue",
  "schema": "skin@1",
  "championId": "sela",
  "name": "Nightblade Sela",
  "mcoinPrice": 750,
  "modelKey": "champ.skin.rogue"
}`,
		"skins/_index.json": `{
  "collection": "skins",
  "hash": "000000000000",
  "entries": [
    { "id": "skin.sela.rogue", "path": "skins/skin.sela.rogue.json", "hash": "0", "size": 0 },
    { "id": "skin.thorne.barbarian", "path": "skins/skin.thorne.barbarian.json", "hash": "0", "size": 0 }
  ]
}`,
	}
	for rel, body := range files {
		full := filepath.Join(dir, filepath.FromSlash(rel))
		// 0o750 / 0o600: these live inside t.TempDir() (already 0700) and are read
		// only by the test process itself, so nothing is locked out.
		require.NoError(t, os.MkdirAll(filepath.Dir(full), 0o750))
		require.NoError(t, os.WriteFile(full, []byte(body), 0o600))
	}
	return dir
}

// New boots the platform as an ESTABLISHED deploy: the first-account owner
// bootstrap is OFF, so ts.Register(...) creates an ordinary player exactly as it
// did before the bootstrap existed. That is what almost every test means by "a
// user", and it keeps a suite from silently minting an admin as its first
// account. Nothing is written to the store, so account counts, leaderboards and
// search totals are untouched.
//
// It is switched off at the composition root (server.Options) rather than
// faked with a Redis key, because the bootstrap's real gate is the durable
// "does this deploy have an admin?" question — a key alone would not answer it,
// and pretending otherwise would make these fixtures lie about the mechanism.
//
// Use NewFreshDeploy to exercise the bootstrap itself.
func New(t *testing.T, mutate ...func(*config.Config)) *TS {
	t.Helper()
	return newTS(t, false, false, mutate...)
}

// NewInviteGated boots the platform with the #174 registration invite-code gate
// ON. freshDeploy chooses which side of the first-account interaction is under
// test: false = an ESTABLISHED deploy (an admin exists, so EVERY registration
// needs a code — the family-build posture), true = a BRAND-NEW deploy (no
// admin, so the first registration is invite-exempt and claims ownership).
//
// The gate is switched on at the composition root (server.Options) rather than
// through the environment, so a gated test cannot leak the setting into a
// parallel one.
func NewInviteGated(t *testing.T, freshDeploy bool, mutate ...func(*config.Config)) *TS {
	t.Helper()
	return newTS(t, freshDeploy, true, mutate...)
}

// NewFreshDeploy boots the platform as a BRAND-NEW deploy: no account carries
// the admin role, so the first registration claims ownership (admin role +
// approved status). See internal/auth/bootstrap.go.
func NewFreshDeploy(t *testing.T, mutate ...func(*config.Config)) *TS {
	t.Helper()
	return newTS(t, true, false, mutate...)
}

func newTS(t *testing.T, ownerBootstrap, requireInvite bool, mutate ...func(*config.Config)) *TS {
	t.Helper()
	mr := miniredis.RunT(t)
	node := gamelinktest.New(GameSecret)
	t.Cleanup(node.Close)

	cfg := config.Config{
		Addr:             ":0",
		RedisAddr:        mr.Addr(),
		DataDir:          t.TempDir(),
		ContentDir:       WriteContentFixture(t),
		JWTSecret:        JWTSecret,
		GameSharedSecret: GameSecret,
		GameServerAddr:   node.URL(),
		InternalURL:      "http://platform.test",
		Season:           "s1",
		AccessTokenTTL:   15 * time.Minute,
		RefreshTokenTTL:  30 * 24 * time.Hour,
		PresenceTTL:      60 * time.Second,
		InviteTTL:        10 * time.Minute,
		MatchPendingTTL:  30 * time.Minute,
		HMACSkew:         30 * time.Second,
		// #724/F-21 — the SHIPPING default, spelled out here on purpose. A
		// fixture that quietly leaves a new knob at its zero value tests a
		// configuration nobody runs (failure mode ⑤: the thing under test is
		// not the thing we ship). Flip it in a `mutate` to exercise rollback.
		AuthRefreshCookie: true,
	}
	for _, fn := range mutate {
		fn(&cfg)
	}
	srv, err := server.New(cfg, server.Options{
		Argon2Params:          LightArgon2,
		DisableOwnerBootstrap: !ownerBootstrap,
		RequireInvite:         requireInvite,
	})
	require.NoError(t, err)
	srv.Start(context.Background())
	t.Cleanup(srv.Close)

	ts := httptest.NewServer(srv.Router())
	t.Cleanup(ts.Close)
	return &TS{T: t, Srv: srv, Mini: mr, HTTP: ts, Node: node, Cfg: cfg}
}

// Resp is a decoded API response.
type Resp struct {
	Status int
	Body   map[string]any
	Raw    []byte
}

// Do performs a JSON request. token may be empty.
func (ts *TS) Do(method, path, token string, body any) Resp {
	ts.T.Helper()
	var rd io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		require.NoError(ts.T, err)
		rd = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, ts.HTTP.URL+path, rd)
	require.NoError(ts.T, err)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := ts.HTTP.Client().Do(req)
	require.NoError(ts.T, err)
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	require.NoError(ts.T, err)
	out := Resp{Status: resp.StatusCode, Raw: raw}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out.Body)
	}
	return out
}

// ErrCode digs the error code out of the envelope.
func (r Resp) ErrCode() string {
	if e, ok := r.Body["error"].(map[string]any); ok {
		if c, ok := e["code"].(string); ok {
			return c
		}
	}
	return ""
}

// User is a registered test account.
type User struct {
	ID       string
	Username string
	Access   string
	Refresh  string
}

// RegisterRaw POSTs a registration with the standard credentials for u plus any
// extra body fields (inviteCode, bootstrapToken) and returns the RAW response,
// so a test can assert a rejection instead of requiring success.
func (ts *TS) RegisterRaw(u string, extra map[string]string) Resp {
	ts.T.Helper()
	body := map[string]string{
		"username": u, "email": u + "@example.com", "password": "correct-horse-" + u,
	}
	for k, v := range extra {
		body[k] = v
	}
	return ts.Do(http.MethodPost, "/api/v1/auth/register", "", body)
}

// RegisterWithCode registers u presenting an invite code, and requires success.
func (ts *TS) RegisterWithCode(u, code string) User {
	ts.T.Helper()
	return ts.userFrom(u, ts.RegisterRaw(u, map[string]string{"inviteCode": code}))
}

// Register creates an account named u (password derived) and returns tokens.
func (ts *TS) Register(u string) User {
	ts.T.Helper()
	return ts.userFrom(u, ts.RegisterRaw(u, nil))
}

func (ts *TS) userFrom(u string, r Resp) User {
	ts.T.Helper()
	require.Equal(ts.T, http.StatusCreated, r.Status, "register %s: %s", u, string(r.Raw))
	acc := r.Body["account"].(map[string]any)
	tok := r.Body["tokens"].(map[string]any)
	return User{
		ID:       acc["id"].(string),
		Username: u,
		Access:   tok["accessToken"].(string),
		Refresh:  tok["refreshToken"].(string),
	}
}

// WS is a connected lobby websocket.
type WS struct {
	t    *testing.T
	Conn *websocket.Conn
	ctx  context.Context
}

// DialWS connects the lobby WebSocket with the given access token appended as
// ?token=. Empty token dials without one.
func (ts *TS) DialWS(token string) (*WS, *http.Response, error) {
	ts.T.Helper()
	url := strings.Replace(ts.HTTP.URL, "http", "ws", 1) + "/api/v1/lobby/ws"
	if token != "" {
		url += "?token=" + token
	}
	// ⛔⛔ GH#979 —— **撥號的期限不可以變成整條連線的期限。**
	//
	// 在此之前這裡只有一個 `10*time.Second` 的 context，而它被原封不動地存進
	// `WS{ctx: ctx}` ⇒ 後面每一次 `Read` 都是 `WithTimeout(w.ctx, …)`，
	// ⭐ 而**子 context 繼承父的截止時間** ⇒ 不管呼叫端傳多久，
	// **每一次讀最多只能等到「撥號後第 10 秒」**。
	//
	// ⚠️ ⭐ 於是 `WSWait = 30s` 那一次修法**根本用不到**：2026-09-05 CI 上
	// `TestPresencePushToFriends` 在 **10.13s** 死於 `context deadline exceeded`,
	// 而它那一行傳的是 `wsWait`（30 秒）。
	// ⭐ 症狀讀起來像「訊息沒送到」，⛔ 而真相是「這條連線的鬧鐘早就響了」。
	//
	// ⇒ 兩個期限分開：**撥號**用短的（握手該快），**連線**用不帶期限的，
	//   每一次讀自己決定要等多久（`Read` 的 `WithTimeout(w.ctx, timeout)`）。
	dialCtx, dialCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer dialCancel()
	connCtx, connCancel := context.WithCancel(context.Background())
	ts.T.Cleanup(connCancel)
	conn, resp, err := websocket.Dial(dialCtx, url, nil)
	if err != nil {
		connCancel()
		return nil, resp, err
	}
	ws := &WS{t: ts.T, Conn: conn, ctx: connCtx}
	ts.T.Cleanup(func() { _ = conn.CloseNow() })
	return ws, resp, nil
}

// MustDialWS fails the test if the handshake fails.
func (ts *TS) MustDialWS(token string) *WS {
	ts.T.Helper()
	ws, _, err := ts.DialWS(token)
	require.NoError(ts.T, err)
	return ws
}

// Send writes a JSON message.
func (w *WS) Send(v any) {
	w.t.Helper()
	data, err := json.Marshal(v)
	require.NoError(w.t, err)
	require.NoError(w.t, w.Conn.Write(w.ctx, websocket.MessageText, data))
}

// Read reads the next message within timeout, decoded into a generic map.
func (w *WS) Read(timeout time.Duration) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(w.ctx, timeout)
	defer cancel()
	_, data, err := w.Conn.Read(ctx)
	if err != nil {
		return nil, err
	}
	var out map[string]any
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// WSWait 是**所有** WebSocket 等待的上限 —— ⭐ 一個住處（CLAUDE.md 第〇·四守則）。
//
// ⛔⛔ GH#979 —— 在此之前 12+ 個呼叫點各自寫死 `5*time.Second`，而 GitHub runner
// 在負載下**擠不進 5 秒**：2026-09-05 連續四輪 CI，每一輪紅**不同的一支**
// （`TestInvitePush` · `TestConcurrentFirstRegistrationsProduceOneOwner` ·
//  `TestChatBroadcast` · 又一次 `TestInvitePush`），
// ⭐ 每一支的失敗時間都是 **5.1x 秒**，錯誤都是 `context deadline exceeded`
// ⇒ 那是**同一個時鐘**，⛔ 不是四個缺陷（本機 `-count=1` 全綠）。
//
// ⚠️ ⭐ 而它最貴的地方是**看起來像併發缺陷**：
// `TestConcurrentFirstRegistrations…` 報「should have 1 item(s), but has 2」
// ⇒ 讀的人會去查鎖，⛔ 而真相是第二個 reader 根本沒等到訊息。
//
// ⭐ 這是放寬**時鐘**，⛔ 不是放寬斷言 —— 一則永遠不會到的訊息仍然會讓測試紅。
const WSWait = 30 * time.Second

// ReadUntil reads messages until pred matches or timeout elapses.
func (w *WS) ReadUntil(timeout time.Duration, pred func(map[string]any) bool) (map[string]any, error) {
	w.t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		remain := time.Until(deadline)
		if remain <= 0 {
			return nil, context.DeadlineExceeded
		}
		msg, err := w.Read(remain)
		if err != nil {
			return nil, err
		}
		if pred(msg) {
			return msg, nil
		}
	}
}

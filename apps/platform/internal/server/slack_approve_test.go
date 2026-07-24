// slack_approve_test.go is the end-to-end proof of #209: a pending registration
// on a gated deploy fires a Slack webhook carrying a signed approve link, and
// that link — clicked while NOT logged into /admin — approves the account
// through the SAME audited seam the console uses, exactly once, and only on the
// POST (never on the prefetch GET a link unfurler performs).
package server_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

// fakeSlack is a stand-in incoming webhook: it records every posted message text
// and answers with a settable status so the failure path is testable.
type fakeSlack struct {
	srv    *httptest.Server
	mu     sync.Mutex
	texts  []string
	status int
}

func newFakeSlack(t *testing.T) *fakeSlack {
	t.Helper()
	f := &fakeSlack{status: http.StatusOK}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		var m struct {
			Text string `json:"text"`
		}
		_ = json.Unmarshal(body, &m)
		f.mu.Lock()
		f.texts = append(f.texts, m.Text)
		st := f.status
		f.mu.Unlock()
		w.WriteHeader(st)
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeSlack) setStatus(s int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.status = s
}

func (f *fakeSlack) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.texts)
}

// waitForText polls until a posted message contains `substr` (the notifier is
// fired fire-and-forget on its own goroutine, so the send is asynchronous).
func (f *fakeSlack) waitForText(t *testing.T, substr string, timeout time.Duration) string {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		f.mu.Lock()
		for _, tx := range f.texts {
			if strings.Contains(tx, substr) {
				f.mu.Unlock()
				return tx
			}
		}
		f.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("slack never received a message containing %q", substr)
	return ""
}

// waitForCount polls until at least n messages have been posted.
func (f *fakeSlack) waitForCount(t *testing.T, n int, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if f.count() >= n {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("slack received %d messages, expected at least %d", f.count(), n)
}

var (
	approveTokenRe = regexp.MustCompile(`✅[^\n]*token=([A-Za-z0-9._~-]+)`)
	rejectTokenRe  = regexp.MustCompile(`🚫[^\n]*token=([A-Za-z0-9._~-]+)`)
)

// gatedSlackDeploy boots an approval-gated platform WITH #209 slack notify wired
// (env-style config via the cfg mutator), registers `owner` and makes it a
// usable admin out of band, and returns the deploy, the owner token, and the
// fake slack. The owner's own pending registration also notifies, so callers
// key off the username in the message.
func gatedSlackDeploy(t *testing.T) (*testutil.TS, *fakeSlack, string) {
	t.Helper()
	slack := newFakeSlack(t)
	ts := testutil.New(t, func(c *config.Config) {
		c.RequireApproval = true
		c.PublicURL = "https://ggd.example"
		c.SlackWebhookURL = slack.srv.URL
		c.SlackNotifyEnabled = true
	})

	r := registerRaw(ts, "owner")
	require.Equal(t, http.StatusCreated, r.Status, string(r.Raw))
	ownerID := r.Body["account"].(map[string]any)["id"].(string)
	grantAdminRole(t, ts, ownerID)
	_, err := ts.Srv.Accounts.SetStatus(context.Background(), ownerID, account.StatusApproved)
	require.NoError(t, err)

	login := loginRaw(ts, "owner")
	require.Equal(t, http.StatusOK, login.Status, string(login.Raw))
	return ts, slack, login.Body["tokens"].(map[string]any)["accessToken"].(string)
}

// sec-infra-slack-approve-link: the whole #209 happy path, end to end.
func TestSlackApproveLinkEndToEnd(t *testing.T) {
	testkit.Cover(t, "sec-infra-approval-gate")
	ts, slack, ownerTok := gatedSlackDeploy(t)
	ctx := context.Background()

	// A relative registers → lands pending → the owner gets a Slack alert.
	reg := registerRaw(ts, "cousin")
	require.Equal(t, http.StatusCreated, reg.Status, string(reg.Raw))
	cousinID := reg.Body["account"].(map[string]any)["id"].(string)
	require.Equal(t, account.StatusPending, reg.Body["account"].(map[string]any)["status"])

	msg := slack.waitForText(t, "cousin", 3*time.Second)
	// The message carries every #209-required field.
	assert.Contains(t, msg, cousinID, "the message must carry the USER ID")
	assert.Contains(t, msg, "cousin@example.com", "the message must carry the email")
	assert.Contains(t, msg, "https://ggd.example", "the message must carry the deploy URL")
	m := approveTokenRe.FindStringSubmatch(msg)
	require.Len(t, m, 2, "the message must carry an approve link with a token: %s", msg)
	token := m[1]

	// --- prefetch: a bot/unfurler GETs the link. It must NOT approve anyone. ---
	get := ts.Do(http.MethodGet, "/api/v1/approve?token="+token, "", nil)
	require.Equal(t, http.StatusOK, get.Status, "the confirm page must render")
	assert.Contains(t, string(get.Raw), "cousin", "the confirm page names the account")
	assert.Contains(t, string(get.Raw), "核准", "the confirm page is an approve confirm")
	assert.Contains(t, strings.ToLower(string(get.Raw)), `method="post"`, "the confirm page must POST to act")

	after, err := ts.Srv.Accounts.GetByID(ctx, cousinID)
	require.NoError(t, err)
	assert.Equal(t, account.StatusPending, after.Status, "a GET must have NO side effect — still pending")

	// --- the human POSTs the confirm button. NOW it approves. ---
	post := ts.Do(http.MethodPost, "/api/v1/approve?token="+token, "", nil)
	require.Equal(t, http.StatusOK, post.Status, string(post.Raw))
	assert.Contains(t, string(post.Raw), "已核准", "the POST result confirms approval")

	approved, err := ts.Srv.Accounts.GetByID(ctx, cousinID)
	require.NoError(t, err)
	assert.Equal(t, account.StatusApproved, approved.Status, "the POST approved the account")

	// The approved cousin can now log in and play.
	cousinLogin := loginRaw(ts, "cousin")
	require.Equal(t, http.StatusOK, cousinLogin.Status, "an approved account can log in: %s", string(cousinLogin.Raw))

	// --- single-use: replaying the same link is refused, and does NOT flip state ---
	replay := ts.Do(http.MethodPost, "/api/v1/approve?token="+token, "", nil)
	assert.Equal(t, http.StatusConflict, replay.Status, "a used token must be refused: %s", string(replay.Raw))
	still, err := ts.Srv.Accounts.GetByID(ctx, cousinID)
	require.NoError(t, err)
	assert.Equal(t, account.StatusApproved, still.Status, "the refused replay must not have changed anything")

	// --- audited like /admin, with source=slack-link ---
	acts := auditActions(t, ts, ownerTok, cousinID)
	var approval map[string]any
	for _, a := range acts {
		if a["action"] == "approval_approved" {
			approval = a
		}
	}
	require.NotNil(t, approval, "the link approval must be audited: %+v", acts)
	assert.Equal(t, "slack-link", approval["adminId"], "the audit names the source actor")
	detail := approval["detail"].(map[string]any)
	assert.Equal(t, "slack-link", detail["source"], "the audit records source=slack-link")
}

// The reject link uses the same token model and denies through the same seam.
func TestSlackRejectLink(t *testing.T) {
	ts, slack, _ := gatedSlackDeploy(t)
	ctx := context.Background()

	reg := registerRaw(ts, "stranger")
	require.Equal(t, http.StatusCreated, reg.Status, string(reg.Raw))
	strangerID := reg.Body["account"].(map[string]any)["id"].(string)

	msg := slack.waitForText(t, "stranger", 3*time.Second)
	m := rejectTokenRe.FindStringSubmatch(msg)
	require.Len(t, m, 2, "the message must carry a reject link: %s", msg)
	token := m[1]

	// GET confirm renders the REJECT variant, no side effect.
	get := ts.Do(http.MethodGet, "/api/v1/approve?token="+token, "", nil)
	require.Equal(t, http.StatusOK, get.Status)
	assert.Contains(t, string(get.Raw), "拒絕")
	mid, err := ts.Srv.Accounts.GetByID(ctx, strangerID)
	require.NoError(t, err)
	assert.Equal(t, account.StatusPending, mid.Status, "GET must not deny")

	// POST denies.
	post := ts.Do(http.MethodPost, "/api/v1/approve?token="+token, "", nil)
	require.Equal(t, http.StatusOK, post.Status, string(post.Raw))
	denied, err := ts.Srv.Accounts.GetByID(ctx, strangerID)
	require.NoError(t, err)
	assert.Equal(t, account.StatusDenied, denied.Status)
}

// sec-infra-slack-failure-safe: a Slack outage must NEVER turn a successful
// registration into a failed one. With the webhook answering 500, registration
// still lands the pending account (201), and the webhook was still attempted.
func TestSlackFailureDoesNotBreakRegistration(t *testing.T) {
	testkit.Cover(t, "sec-infra-approval-gate")
	ts, slack, _ := gatedSlackDeploy(t)
	slack.setStatus(http.StatusInternalServerError)
	before := slack.count()

	reg := registerRaw(ts, "resilient")
	require.Equal(t, http.StatusCreated, reg.Status,
		"a slack failure must not fail registration: %s", string(reg.Raw))
	assert.Equal(t, account.StatusPending, reg.Body["account"].(map[string]any)["status"])

	// The account really landed.
	_, err := ts.Srv.Accounts.GetByUsername(context.Background(), "resilient")
	require.NoError(t, err, "the pending account must exist despite the slack outage")

	// And the notification WAS attempted (fire-and-forget, so poll for it).
	slack.waitForCount(t, before+1, 3*time.Second)
}

// An unconfigured deploy (no webhook / disabled) simply sends nothing, and
// registration is unaffected — the feature is off by default.
func TestSlackNotifyOffByDefault(t *testing.T) {
	slack := newFakeSlack(t)
	// Gate on, but slack notify NOT enabled and no webhook wired.
	ts := testutil.New(t, func(c *config.Config) { c.RequireApproval = true })

	reg := registerRaw(ts, "quiet")
	require.Equal(t, http.StatusCreated, reg.Status, string(reg.Raw))

	// Give any (non-existent) goroutine a chance, then assert silence.
	time.Sleep(200 * time.Millisecond)
	assert.Zero(t, slack.count(), "no webhook is configured, so nothing must be sent")
}

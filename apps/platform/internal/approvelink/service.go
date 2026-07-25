package approvelink

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
)

// slackTimeout bounds one outbound webhook POST. It is generous but finite: the
// notification runs on its own goroutine (auth fires it fire-and-forget), so
// this only bounds how long that goroutine lives, never the registration.
const slackTimeout = 8 * time.Second

// ErrTokenUsed is returned by Act when the token was already consumed (a replay
// or a double-submit). It is distinct from an expired/forged token so the POST
// handler can say "already used" rather than "invalid".
var ErrTokenUsed = errors.New("approvelink: token already used")

// Approver is the "set approved" seam — the SAME one the admin console uses,
// reached here after the signed token has authorized the decision. Implemented
// by admin.Service.SetApprovalFromLink, which audits the decision (source
// slack-link), revokes live sessions on a deny and honours the last-admin
// guard. Declared as a local interface so this package need not import
// internal/admin (which imports internal/auth, which the composition root wires
// this service INTO as a notifier — importing admin here would not cycle, but
// the narrow interface keeps the dependency to exactly what is used).
type Approver interface {
	SetApprovalFromLink(ctx context.Context, targetID, status, reason string) error
}

// accountReader is the read side this service needs: the confirm page and the
// message show a username, so the token's account id is resolved to an account.
// *account.Repo satisfies it.
type accountReader interface {
	GetByID(ctx context.Context, id string) (account.Account, error)
}

// Options carries the composition-root configuration that does not belong in the
// durable slack document: the env-provided secret/toggle and the public URL.
type Options struct {
	// PublicURL is the deploy's external base URL (config.PublicURL). Required to
	// build an absolute approve link; empty disables notification (with a warn).
	PublicURL string
	// EnvWebhookURL is GGD_SLACK_WEBHOOK_URL. When set it OVERRIDES the stored
	// webhook (env wins, like every other secret this platform reads).
	EnvWebhookURL string
	// EnvEnabled is GGD_SLACK_NOTIFY_ENABLED, OR-ed with the stored enable flag.
	EnvEnabled bool
	// TokenTTL overrides the approve-link validity window (0 => DefaultTokenTTL).
	TokenTTL time.Duration
}

// Service is the #209 unit: it signs/verifies approve links, sends the Slack
// notification, and applies the decision through the Approver seam. It
// implements auth.PendingNotifier (NotifyPending), which the composition root
// injects into the auth service.
type Service struct {
	signer   *Signer
	consumer Consumer
	approver Approver
	accounts accountReader
	slack    *slackRepo

	publicURL  string
	envWebhook string
	envEnabled bool

	http *http.Client
	now  func() time.Time
}

// New builds the service. secret is the HMAC key for the token (the platform's
// JWT signing secret); rdb backs the single-use consumer; approver is the
// admin "set approved" seam; accounts is the read side.
func New(store *jsonstore.Store, rdb *redisx.Client, secret []byte, approver Approver, accounts accountReader, opt Options) *Service {
	return &Service{
		signer:     NewSigner(secret, opt.TokenTTL),
		consumer:   redisConsumer{rdb: rdb},
		approver:   approver,
		accounts:   accounts,
		slack:      newSlackRepo(store),
		publicURL:  strings.TrimRight(strings.TrimSpace(opt.PublicURL), "/"),
		envWebhook: strings.TrimSpace(opt.EnvWebhookURL),
		envEnabled: opt.EnvEnabled,
		http:       &http.Client{Timeout: slackTimeout},
		now:        time.Now,
	}
}

// SetHTTPClient overrides the outbound webhook client (tests point it at a fake
// Slack server).
func (s *Service) SetHTTPClient(c *http.Client) { s.http = c }

// SetNow overrides the clock seam for BOTH the service and its signer, so a test
// can mint a token and then advance time to prove expiry deterministically.
func (s *Service) SetNow(fn func() time.Time) {
	s.now = fn
	s.signer.now = fn
}

// SetConsumer overrides the single-use store (tests use an in-memory one).
func (s *Service) SetConsumer(c Consumer) { s.consumer = c }

// ---- config (admin-gated) ---------------------------------------------------

// GetConfig returns the current slack config as the masked Public view, folding
// in the env-derived state the console needs to explain the effective setting.
func (s *Service) GetConfig() (SlackPublic, error) {
	cfg, err := s.slack.Load()
	if err != nil {
		return SlackPublic{}, err
	}
	eff := s.effective(cfg)
	return SlackPublic{
		Version:       cfg.Version,
		UpdatedAt:     cfg.UpdatedAt,
		Enabled:       cfg.Enabled,
		WebhookMasked: maskWebhook(cfg.WebhookURL),
		HasWebhook:    cfg.WebhookURL != "",
		EnvWebhook:    s.envWebhook != "",
		Ready:         eff.enabled && eff.webhook != "" && s.publicURL != "",
	}, nil
}

// SaveConfig validates and persists a PARTIAL update (omitted fields survive),
// returning the masked view. version/updatedAt are server-owned.
func (s *Service) SaveConfig(in SlackUpdate) (SlackPublic, error) {
	if in.WebhookURL != nil {
		if err := validWebhook(*in.WebhookURL); err != nil {
			return SlackPublic{}, err
		}
	}
	cur, err := s.slack.Load()
	if err != nil {
		return SlackPublic{}, err
	}
	next := cur
	next.Version = slackSchemaVersion
	next.UpdatedAt = s.now().UTC()
	if in.Enabled != nil {
		next.Enabled = *in.Enabled
	}
	if in.WebhookURL != nil {
		next.WebhookURL = strings.TrimSpace(*in.WebhookURL)
	}
	if err := s.slack.Save(next); err != nil {
		return SlackPublic{}, err
	}
	return s.GetConfig()
}

// effective merges the durable config with the environment overrides.
type effectiveCfg struct {
	enabled bool
	webhook string
}

func (s *Service) effective(cfg SlackConfig) effectiveCfg {
	webhook := s.envWebhook
	if webhook == "" {
		webhook = cfg.WebhookURL
	}
	return effectiveCfg{enabled: s.envEnabled || cfg.Enabled, webhook: webhook}
}

// ---- notification (auth.PendingNotifier) ------------------------------------

// NotifyPending sends the Slack alert for a freshly-pending account. It is
// called from auth.Register's own fire-and-forget goroutine, so it runs
// synchronously here on its own background context and NEVER returns an error to
// the caller: every failure path logs and returns, because a Slack outage must
// not turn a successful registration into a failed one.
func (s *Service) NotifyPending(a account.Account) {
	ctx, cancel := context.WithTimeout(context.Background(), slackTimeout+2*time.Second)
	defer cancel()

	cfg, err := s.slack.Load()
	if err != nil {
		slog.Error("approvelink: could not load slack config; skipping notification", "err", err, "accountId", a.ID)
		return
	}
	eff := s.effective(cfg)
	if !eff.enabled || eff.webhook == "" {
		slog.Debug("approvelink: slack notification disabled or unconfigured; skipping", "accountId", a.ID)
		return
	}
	if s.publicURL == "" {
		slog.Warn("approvelink: GGD_PUBLIC_URL is unset — cannot build an approve link; skipping slack notification",
			"accountId", a.ID, "fix", "set GGD_PUBLIC_URL to the deploy's external URL, e.g. https://ggd.adms.ai")
		return
	}

	approveTok, err := s.signer.Sign(a.ID, ActionApprove)
	if err != nil {
		slog.Error("approvelink: could not sign approve token; skipping notification", "err", err, "accountId", a.ID)
		return
	}
	rejectTok, err := s.signer.Sign(a.ID, ActionReject)
	if err != nil {
		slog.Error("approvelink: could not sign reject token; skipping notification", "err", err, "accountId", a.ID)
		return
	}

	if err := s.postSlack(ctx, eff.webhook, s.buildMessage(a, approveTok, rejectTok)); err != nil {
		slog.Error("approvelink: slack notification failed; the registration was unaffected", "err", err, "accountId", a.ID)
		return
	}
	slog.Info("approvelink: sent pending-registration slack notification", "accountId", a.ID, "username", a.Username)
}

// linkURL builds the absolute approve endpoint for a token.
func (s *Service) linkURL(token string) string {
	return s.publicURL + "/api/v1/approve?token=" + url.QueryEscape(token)
}

// slackMessage is the incoming-webhook payload shape (a plain-text message).
type slackMessage struct {
	Text string `json:"text"`
}

// buildMessage assembles the notification. It carries every field #209 asks for:
// username, USER ID, email, an ABSOLUTE timestamp (the registration time), the
// deploy URL and the approve link (plus a reject link).
func (s *Service) buildMessage(a account.Account, approveTok, rejectTok string) slackMessage {
	// Absolute, unambiguous timestamp (RFC3339 UTC) of when they registered.
	ts := a.CreatedAt.UTC().Format(time.RFC3339)
	if a.CreatedAt.IsZero() {
		ts = s.now().UTC().Format(time.RFC3339)
	}
	text := fmt.Sprintf(
		"🕹️ *GGD 新註冊待審核 / pending registration*\n"+
			"• 使用者 / username: %s\n"+
			"• 帳號 ID / user id: `%s`\n"+
			"• Email: %s\n"+
			"• 註冊時間 / at: %s\n"+
			"• 部署 / deploy: %s\n\n"+
			"✅ 核准 approve: %s\n"+
			"🚫 拒絕 reject: %s\n"+
			"_點連結會先開啟確認頁，需要再按一次按鈕才生效（避免預覽機器人誤觸）。_",
		a.Username, a.ID, a.Email, ts, s.publicURL,
		s.linkURL(approveTok), s.linkURL(rejectTok),
	)
	return slackMessage{Text: text}
}

// postSlack POSTs the message JSON to the webhook. A non-2xx or transport error
// is returned (and logged by the caller); the body is drained and capped.
func (s *Service) postSlack(ctx context.Context, webhook string, msg slackMessage) error {
	body, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhook, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("approvelink: slack webhook returned %d", resp.StatusCode)
	}
	return nil
}

// ---- confirm (GET, read-only) / act (POST, mutating) ------------------------

// ConfirmView is what the GET confirm page renders. It is produced WITHOUT any
// side effect (no consumption, no approval) — the whole reason the endpoint is
// split GET/POST is that Slack and link scanners prefetch the GET.
type ConfirmView struct {
	Token     string
	Action    string // ActionApprove | ActionReject
	AccountID string
	Username  string
	Status    string // the account's CURRENT status
	// Done is true when there is nothing left to do: the token was already used,
	// or the account is already in the action's target state. The page then shows
	// a status message instead of a confirm button.
	Done    bool
	DoneMsg string
}

// Confirm validates the token and returns the confirm view. Side-effect-free.
func (s *Service) Confirm(ctx context.Context, token string) (ConfirmView, error) {
	claims, err := s.signer.Verify(token)
	if err != nil {
		return ConfirmView{}, err
	}
	a, err := s.accounts.GetByID(ctx, claims.AccountID)
	if err != nil {
		return ConfirmView{}, err
	}
	v := ConfirmView{
		Token: token, Action: claims.Action,
		AccountID: a.ID, Username: a.Username, Status: a.Status,
	}
	used, err := s.consumer.Consumed(ctx, claims.consumeKey)
	if err != nil {
		return ConfirmView{}, err
	}
	switch {
	case used:
		v.Done, v.DoneMsg = true, "這個連結已使用過 / already used"
	case claims.Action == ActionApprove && a.Status == account.StatusApproved:
		v.Done, v.DoneMsg = true, "此帳號已核准 / already approved"
	case claims.Action == ActionReject && a.Status == account.StatusDenied:
		v.Done, v.DoneMsg = true, "此帳號已拒絕 / already rejected"
	}
	return v, nil
}

// ActResult is what the POST returns on success.
type ActResult struct {
	Action    string
	AccountID string
	Username  string
	Status    string // the NEW status (or the CURRENT status when NoChange)
	NoChange  bool   // #209: the account was already decided; the link changed nothing
}

// Act re-validates the token, consumes it (single-use), and applies the
// decision through the Approver seam. This is the ONLY mutating path; it is
// reached only from the POST handler, never a GET.
func (s *Service) Act(ctx context.Context, token string) (ActResult, error) {
	claims, err := s.signer.Verify(token)
	if err != nil {
		return ActResult{}, err
	}
	a, err := s.accounts.GetByID(ctx, claims.AccountID)
	if err != nil {
		return ActResult{}, err
	}
	// Single-use: claim the token BEFORE applying. A replay (or a double-tap)
	// finds it already claimed and is refused, so the decision runs at most once.
	firstUse, err := s.consumer.Consume(ctx, claims.consumeKey, s.signer.TTL()+consumeGrace)
	if err != nil {
		return ActResult{}, err
	}
	if !firstUse {
		return ActResult{}, ErrTokenUsed
	}
	// #209 security fix: the FIRST decision wins. Reached only on a token's FIRST
	// use (a replay is already refused above), so the account was pending when the
	// link was minted — but an admin may have DENIED it in the console meanwhile.
	// Act ONLY while still pending, so a stale approve link can never resurrect a
	// denied account (nor override an approval); anything else is a no-op that
	// reports the current status. The admin's console veto always stands.
	if a.Status != account.StatusPending {
		return ActResult{Action: claims.Action, AccountID: a.ID, Username: a.Username, Status: a.Status, NoChange: true}, nil
	}
	status, reason := account.StatusApproved, "approved via Slack 一鍵核准連結 (#209)"
	if claims.Action == ActionReject {
		status, reason = account.StatusDenied, "rejected via Slack 一鍵連結 (#209)"
	}
	if err := s.approver.SetApprovalFromLink(ctx, a.ID, status, reason); err != nil {
		return ActResult{}, err
	}
	return ActResult{Action: claims.Action, AccountID: a.ID, Username: a.Username, Status: status}, nil
}

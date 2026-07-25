package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/redisx"
)

// Device Authorization Grant (RFC 8628), adapted for a QR + a trusted phone
// (#197/#199). The keyboard-less handheld calls DeviceStart, renders the QR
// (which carries ONLY the short public user-code — never the secret device-code,
// never a token), and polls DevicePoll. A phone that is ALREADY authenticated
// scans the QR and calls DeviceApprove; its existing session is the trust
// anchor, and the session the handheld receives is minted for THAT phone's
// account through the unchanged issueTokens path. A photographed QR is inert: it
// can only ASK an authenticated phone to approve, and approving links the
// handheld to whoever approved — never the other way round.

const (
	// deviceGrantTTL is short by design: a QR on a screen is broadcast, so the
	// window in which anything tied to it is live must be small. RFC 8628's
	// expires_in.
	deviceGrantTTL = 5 * time.Minute
	// devicePollInterval is the minimum client poll gap (RFC 8628 `interval`).
	devicePollInterval = 5
	// devicePollBackoff is the interval a client must adopt after a slow_down.
	devicePollBackoff = 10

	// devicePollBurst / devicePollWindow throttle the handheld's own polling:
	// more than this many polls inside the window trips slow_down. The limit is
	// a small burst (clock jitter, a retried request) above the one-per-interval
	// the client is meant to keep.
	devicePollBurst  = 3
	devicePollWindow = time.Duration(devicePollInterval) * time.Second

	// deviceApproveLimit / deviceApproveWindow lock out an authenticated phone
	// that sprays user-codes: approval is attributable to the account, so a
	// brute-force is throttled AND bannable. Keyed by accountID.
	deviceApproveLimit  = 10
	deviceApproveWindow = time.Minute

	// userCodeLen is the number of Crockford base32 chars in the public code,
	// grouped XXXX-XXXX. ~2^40 space; treated as LOW entropy and defended in
	// depth (short TTL, single device binding, approve lockout), never as the
	// thing standing between an attacker and an account.
	userCodeLen = 8

	// defaultVerificationURI is where the phone goes to approve. The QR encodes
	// this plus ?code=<userCode> and NOTHING else.
	defaultVerificationURI = "https://ggd.adms.ai/link"
)

// crockford is the Crockford base32 alphabet (no I, L, O, U — the characters a
// human misreads). Used for the human-facing user-code only.
const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// DeviceGrant is the /auth/device/start result handed to the handheld.
type DeviceGrant struct {
	DeviceCode              string `json:"deviceCode"`              // SECRET, handheld-only, never rendered
	UserCode                string `json:"userCode"`                // public, grouped XXXX-XXXX, goes in the QR
	VerificationURI         string `json:"verificationUri"`         // where the phone approves
	VerificationURIComplete string `json:"verificationUriComplete"` // URI + ?code=<userCode>; the QR payload
	ExpiresIn               int    `json:"expiresIn"`               // seconds
	PollInterval            int    `json:"pollInterval"`            // seconds, RFC 8628 minimum gap
}

// deviceState is the JSON stored under devauth:code:<deviceCode>. It holds NO
// address: this platform's authorization layer never reads a caller IP (see
// internal/server/devsurface_test.go), and the human's real confirmation anchor
// is matching the user-code on the phone against the one on the handheld screen,
// not an IP string. The User-Agent is kept for audit/telemetry only.
type deviceState struct {
	Status    string `json:"status"`              // pending | approved | denied
	UserCode  string `json:"userCode"`            // so consume can clear the paired public key
	AccountID string `json:"accountId,omitempty"` // set at approve; the account the session is minted for
	UA        string `json:"ua,omitempty"`        // handheld User-Agent, audit only
	CreatedAt int64  `json:"createdAt"`           // unix seconds
}

// Device poll status strings — the discriminated union the handheld polls on.
const (
	devStatusPending  = "authorization_pending"
	devStatusSlowDown = "slow_down"
	devStatusExpired  = "expired"
	devStatusDenied   = "denied"
	devStatusApproved = "approved"

	// grant-state values stored in Redis (distinct from the poll wire strings).
	grantPending  = "pending"
	grantApproved = "approved"
	grantDenied   = "denied"
)

// SetDeviceVerificationURI overrides where the phone approves (composition root
// only). Empty keeps the default. Kept a setter, like SetAuditor /
// SetInviteGate, so New's signature does not grow another argument.
func (s *Service) SetDeviceVerificationURI(uri string) {
	s.deviceVerificationURI = strings.TrimSpace(uri)
}

func (s *Service) verificationURI() string {
	if s.deviceVerificationURI != "" {
		return s.deviceVerificationURI
	}
	return defaultVerificationURI
}

// RateLimiter exposes the throttle backend so handlers.go can hang an IP
// rate-limit MIDDLEWARE (httpx.IPRateLimit) on /auth/device/start without the
// auth package itself ever reading a caller address.
func (s *Service) RateLimiter() *redisx.Client { return s.rdb }

// randUserCode returns a Crockford base32 code of userCodeLen chars, unbiased
// (rejection-free: 32 is a power of two, so masking a random byte to 5 bits is
// uniform).
func randUserCode() (string, error) {
	raw := make([]byte, userCodeLen)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	var b strings.Builder
	for _, r := range raw {
		b.WriteByte(crockford[r&0x1f])
	}
	return b.String(), nil
}

// groupUserCode formats a raw code as XXXX-XXXX for display and the QR. The
// grouping is cosmetic; normalizeUserCode strips it on the way back in.
func groupUserCode(code string) string {
	if len(code) != 8 {
		return code
	}
	return code[:4] + "-" + code[4:]
}

// normalizeUserCode collapses whatever the phone sent (hyphenated, spaced,
// lower-case) back to the canonical uppercase Crockford key. Non-alphabet
// characters are dropped, so "wxyz-2345", "WXYZ 2345" and "WXYZ2345" all resolve
// to the same grant.
func normalizeUserCode(code string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(code) {
		if strings.ContainsRune(crockford, r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// DeviceStart mints a fresh grant: a 32-byte secret device-code, a short public
// user-code, and the QR payload. ua is the handheld's User-Agent (audit only).
func (s *Service) DeviceStart(ctx context.Context, ua string) (DeviceGrant, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return DeviceGrant{}, err
	}
	deviceCode := hex.EncodeToString(raw) // 64 hex chars, the handheld-only secret

	// One retry covers the (vanishingly small) chance of a user-code collision
	// with a live grant; a second collision is a signal something is very wrong.
	for attempt := 0; attempt < 2; attempt++ {
		userCode, err := randUserCode()
		if err != nil {
			return DeviceGrant{}, err
		}
		st := deviceState{
			Status:    grantPending,
			UserCode:  userCode,
			UA:        ua,
			CreatedAt: time.Now().Unix(),
		}
		blob, err := json.Marshal(st)
		if err != nil {
			return DeviceGrant{}, err
		}
		ok, err := s.rdb.StartDevice(ctx, userCode, deviceCode, string(blob), deviceGrantTTL)
		if err != nil {
			return DeviceGrant{}, err
		}
		if !ok {
			continue // collision — regenerate the user-code and retry once
		}
		grouped := groupUserCode(userCode)
		return DeviceGrant{
			DeviceCode:              deviceCode,
			UserCode:                grouped,
			VerificationURI:         s.verificationURI(),
			VerificationURIComplete: s.verificationURI() + "?code=" + grouped,
			ExpiresIn:               int(deviceGrantTTL / time.Second),
			PollInterval:            devicePollInterval,
		}, nil
	}
	return DeviceGrant{}, errors.New("auth: could not allocate a device grant")
}

// DevicePollResult is the discriminated union DevicePoll returns; Status selects
// the branch and the remaining fields are only meaningful for that branch.
type DevicePollResult struct {
	Status       string          // one of the devStatus* constants
	PollInterval int             // slow_down only
	Account      account.Account // approved only
	Tokens       TokenPair       // approved only
}

// DevicePoll advances the handheld's side of the grant. It rate-limits per
// device-code first (over-limit → slow_down), then reads the state WITHOUT
// consuming for the pending/denied/expired branches. Only the approved branch
// consumes — atomically, via GetDel — so exactly one poll can ever redeem the
// approval and receive tokens.
func (s *Service) DevicePoll(ctx context.Context, deviceCode string) (DevicePollResult, error) {
	if deviceCode == "" {
		return DevicePollResult{Status: devStatusExpired}, nil
	}
	// Throttle before touching the code key: a flood of polls must cost a
	// counter increment, not a state read + the account load below.
	ok, err := s.rdb.RateAllow(ctx, "devpoll", deviceCode, devicePollBurst, devicePollWindow)
	if err != nil {
		return DevicePollResult{}, err
	}
	if !ok {
		return DevicePollResult{Status: devStatusSlowDown, PollInterval: devicePollBackoff}, nil
	}

	raw, err := s.rdb.PollDevice(ctx, deviceCode)
	if err != nil {
		return DevicePollResult{}, err
	}
	if raw == "" {
		// Unknown or expired — the two are indistinguishable ON PURPOSE, so a
		// probe cannot tell a live-but-unknown code from a dead one.
		return DevicePollResult{Status: devStatusExpired}, nil
	}
	var st deviceState
	if err := json.Unmarshal([]byte(raw), &st); err != nil {
		return DevicePollResult{}, err
	}

	switch st.Status {
	case grantPending:
		return DevicePollResult{Status: devStatusPending}, nil
	case grantDenied:
		// Terminal — clear the grant so a retry starts clean.
		_, _ = s.rdb.ConsumeDevice(ctx, deviceCode, st.UserCode)
		return DevicePollResult{Status: devStatusDenied}, nil
	case grantApproved:
		// Single-use redemption. Two concurrent polls race the GetDel: the loser
		// gets "" and is told "expired". The winner alone proceeds to tokens.
		consumed, err := s.rdb.ConsumeDevice(ctx, deviceCode, st.UserCode)
		if err != nil {
			return DevicePollResult{}, err
		}
		if consumed == "" {
			return DevicePollResult{Status: devStatusExpired}, nil
		}
		// GATE INTEGRITY. Re-read the durable account and run the SAME guard a
		// login/refresh runs, so a ban or approval-revocation that landed
		// between /start and here is honored — a pending or banned account can
		// never be handed a session at the poll. issueTokens is the UNCHANGED
		// path a typed login takes, so a device-granted session is identical to
		// a typed one.
		if err := s.AuthorizePlay(ctx, st.AccountID); err != nil {
			return DevicePollResult{}, err
		}
		a, err := s.accounts.GetByID(ctx, st.AccountID)
		if err != nil {
			return DevicePollResult{}, err
		}
		pair, err := s.issueTokens(ctx, a)
		if err != nil {
			return DevicePollResult{}, err
		}
		return DevicePollResult{Status: devStatusApproved, Account: a, Tokens: pair}, nil
	default:
		return DevicePollResult{Status: devStatusExpired}, nil
	}
}

// DeviceApprove records the phone's decision for a user-code. accountID is the
// AUTHENTICATED approver (from MustIdentity, never the request body) — the trust
// anchor and the account any resulting session is minted for. approve=false
// denies. Unknown/expired/already-decided all return redisx.ErrDeviceUnknown so
// an approver cannot distinguish them.
func (s *Service) DeviceApprove(ctx context.Context, userCode, accountID string, approve bool) error {
	// Lockout a phone spraying user-codes: keyed by the approver's account, so
	// the throttle is attributable and the account is bannable.
	ok, err := s.rdb.RateAllow(ctx, "devapprove", accountID, deviceApproveLimit, deviceApproveWindow)
	if err != nil {
		return err
	}
	if !ok {
		return redisx.ErrDeviceUnknown
	}
	code := normalizeUserCode(userCode)
	if code == "" {
		return redisx.ErrDeviceUnknown
	}
	status := grantApproved
	if !approve {
		status = grantDenied
	}
	return s.rdb.ApproveDevice(ctx, code, status, accountID)
}

// Package approvelink implements the #209 Slack pending-registration notifier
// and its click-to-approve link: a signed, single-use, expiring token that lets
// the owner approve (or reject) a pending account from their phone WITHOUT being
// logged into /admin.
//
// The token is the ONLY gate on the approve endpoints, so its properties are the
// security of the feature:
//
//   - SIGNED. token = base64url(payload) + "." + base64url(HMAC-SHA256(secret,
//     domain || payload)). The secret is the platform's JWT signing secret (a
//     server-side value already required to be strong on any networked deploy —
//     see config.checkDeploySecrets), domain-separated so an approve token can
//     never be confused with an access JWT. A tampered payload or a forged
//     signature fails hmac.Equal.
//   - BOUND TO ONE ACCOUNT AND ONE ACTION. Both are inside the signed payload,
//     so the endpoint reads WHO and WHAT from the token itself, never from a
//     query parameter an attacker could swap.
//   - EXPIRING. The issue time is signed; Verify refuses a token older than the
//     TTL (~48h) or one dated in the future beyond a small skew.
//   - SINGLE-USE. The POST that actually applies the decision atomically claims
//     the token's consume key (the HMAC, hex) via a Consumer before applying; a
//     replay finds it claimed and is refused. See service.go.
//
// The GET/POST split (handlers.go) is what makes single-use MEANINGFUL against
// link unfurlers: Slack and every link scanner PREFETCH a URL with GET, so if a
// GET approved, a preview bot would auto-approve everyone. Verify is read-only;
// only the human POST consumes and applies.
package approvelink

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// DefaultTokenTTL is how long an approve link stays valid: long enough that the
// owner can act on it after a night's sleep, short enough that a link that
// leaks (a forwarded Slack message) stops working within days.
const DefaultTokenTTL = 48 * time.Hour

// clockSkew tolerates a small forward clock difference so a token minted on a
// host a few seconds ahead of the verifier is not rejected as "future-dated".
const clockSkew = 2 * time.Minute

// tokenDomain domain-separates the approve-link HMAC from every other use of the
// signing secret (notably the access JWT), so the two can never be interchanged.
//
// #nosec G101 -- 這是**領域分隔標籤**，不是密鑰：它被當成 HMAC 的輸入前綴，
// 公開、固定、且刻意寫死在版控裡（換掉它等同於讓所有既發出的連結失效）。真正的
// 密鑰是傳進 sign/verify 的 signing secret，永遠來自環境變數。gosec 只是看到
// 常數名含 "token" 又指向字串字面量，Confidence 也標 LOW。
const tokenDomain = "ggd:approve:v1"

// Actions the token may authorize.
const (
	ActionApprove = "approve"
	ActionReject  = "reject"
)

// fieldSep separates the payload fields. It is the ASCII unit separator, which
// cannot appear in any field: account ids are ULIDs (Crockford base32), the
// action is a fixed word, issuedAt is decimal and the nonce is hex.
const fieldSep = "\x1f"

// Verification failure surfaces. They are distinct so a handler can tell an
// expired token (offer to ask the owner again) from a garbage/forged one.
var (
	ErrMalformedToken = errors.New("approvelink: malformed token")
	ErrBadSignature   = errors.New("approvelink: bad signature")
	ErrExpiredToken   = errors.New("approvelink: token expired")
)

func validAction(a string) bool { return a == ActionApprove || a == ActionReject }

// Signer mints and verifies approve-link tokens. now is a clock seam so tests
// can mint a token "in the past" and prove expiry deterministically.
type Signer struct {
	secret []byte
	ttl    time.Duration
	now    func() time.Time
}

// NewSigner builds a signer. A non-positive ttl falls back to DefaultTokenTTL.
func NewSigner(secret []byte, ttl time.Duration) *Signer {
	if ttl <= 0 {
		ttl = DefaultTokenTTL
	}
	return &Signer{secret: secret, ttl: ttl, now: time.Now}
}

// TTL is the configured validity window (used to size the single-use marker so
// it always outlives the token it guards).
func (s *Signer) TTL() time.Duration { return s.ttl }

// mac computes the domain-separated HMAC over the payload.
func (s *Signer) mac(payload string) []byte {
	h := hmac.New(sha256.New, s.secret)
	h.Write([]byte(tokenDomain))
	h.Write([]byte(fieldSep))
	h.Write([]byte(payload))
	return h.Sum(nil)
}

// Sign mints a token authorizing action on accountID, issued now.
func (s *Signer) Sign(accountID, action string) (string, error) {
	if !validAction(action) {
		return "", fmt.Errorf("approvelink: invalid action %q", action)
	}
	if accountID == "" || strings.Contains(accountID, fieldSep) {
		return "", fmt.Errorf("approvelink: invalid account id")
	}
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	payload := strings.Join([]string{
		accountID, action, strconv.FormatInt(s.now().Unix(), 10), hex.EncodeToString(nonce),
	}, fieldSep)
	mac := s.mac(payload)
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." +
		base64.RawURLEncoding.EncodeToString(mac), nil
}

// Claims is the verified content of a token.
type Claims struct {
	AccountID string
	Action    string
	IssuedAt  time.Time
	Nonce     string
	// consumeKey is the stable single-use identity of this exact token (the hex
	// HMAC). Unexported: only the service, in this package, consumes it.
	consumeKey string
}

// Verify checks signature and expiry and returns the claims. It performs NO
// consumption and NO account lookup — it is pure and side-effect-free, which is
// what lets the prefetch-safe GET call it.
func (s *Signer) Verify(token string) (Claims, error) {
	dot := strings.IndexByte(token, '.')
	if dot <= 0 || dot == len(token)-1 {
		return Claims{}, ErrMalformedToken
	}
	payloadBytes, err := base64.RawURLEncoding.Strict().DecodeString(token[:dot])
	if err != nil {
		return Claims{}, ErrMalformedToken
	}
	sigBytes, err := base64.RawURLEncoding.Strict().DecodeString(token[dot+1:])
	if err != nil {
		return Claims{}, ErrMalformedToken
	}
	want := s.mac(string(payloadBytes))
	// Constant-time; also guards the length so hmac.Equal is meaningful.
	if !hmac.Equal(want, sigBytes) {
		return Claims{}, ErrBadSignature
	}
	fields := strings.Split(string(payloadBytes), fieldSep)
	if len(fields) != 4 || !validAction(fields[1]) {
		return Claims{}, ErrMalformedToken
	}
	issuedUnix, err := strconv.ParseInt(fields[2], 10, 64)
	if err != nil {
		return Claims{}, ErrMalformedToken
	}
	issued := time.Unix(issuedUnix, 0)
	now := s.now()
	if now.Sub(issued) > s.ttl || issued.After(now.Add(clockSkew)) {
		return Claims{}, ErrExpiredToken
	}
	return Claims{
		AccountID:  fields[0],
		Action:     fields[1],
		IssuedAt:   issued,
		Nonce:      fields[3],
		consumeKey: hex.EncodeToString(want),
	}, nil
}

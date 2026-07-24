// Package invite owns the REGISTRATION INVITE CODES (task #174): the admin
// console mints single-use codes, and on a gated deploy a registration that
// does not burn one is refused server-side.
//
// This is the ONLY thing keeping strangers out of the owner's family build, so
// three properties are load-bearing and everything else in this file follows
// from them:
//
//  1. THE CHECK LIVES IN THE REGISTRATION HANDLER, not in a form. auth.Service
//     .Register calls Redeem before it writes an account; there is no other
//     path to a stored account, so the React field is UX and this is the gate.
//     auth cannot import this package (import cycle: invite → admin → auth), so
//     auth declares a tiny InviteGate interface and the composition root injects
//     this service, exactly like SetAuditor / SetOwnerBootstrap.
//
//  2. THE TRUTH IS DURABLE AND ONLY DURABLE. One JSON document per code under
//     DATA_DIR/invites/, through the jsonstore (atomic tmp+rename). This package
//     adds NO Redis key at all. Redis is by design a rebuildable cache
//     (internal/data/redisx's package header) — if "has this code been spent"
//     lived there, a FLUSHALL would resurrect every spent code and hand out free
//     registrations, and an orphaned Redis on the LAN (#117) would become an
//     un-authenticated way to reopen the gate.
//
//  3. REDEMPTION IS ATOMIC WITH ACCOUNT CREATION, in the burn-first direction.
//     See the Redeem/Release pair below and the call site in auth/service.go.
//
// Shape mirrors internal/combatenv / internal/opsenv — durable JSON truth,
// admin-gated strictly-validated writes, audit lines into the shared
// admin-audit log — with two DELIBERATE departures from that precedent:
//
//   - NO public/unauthenticated read. combat-env and server-ops publish a public
//     GET because the game-server needs them without a token. An invite code is
//     a credential; listing them is admin-only, full stop.
//   - NO "is this code valid?" endpoint. That would be a free guessing oracle
//     an attacker could run flat out. The ONLY way to test a code is to attempt
//     a registration, which sits behind the global register throttle
//     (GGD_REGISTER_RATE_LIMIT) and burns the code on success.
package invite

import (
	"context"
	"crypto/rand"
	"errors"
	"log/slog"
	"math/big"
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/keyedmutex"
	"github.com/ggd/platform/internal/httpx"
)

// Collection is the jsonstore collection (a directory under DATA_DIR): one
// document per code at data/invites/<NORMALISED>.json.
const Collection = "invites"

// SchemaVersion is the doc version written by this build.
const SchemaVersion = 1

// Lifecycle states of a stored code. A code is minted active, becomes redeemed
// when a registration burns it, or revoked when an operator kills it. "expired"
// is NOT stored — it is derived from ExpiresAt at read time (see
// Doc.EffectiveStatus), so there is no sweeper job and no clock to run.
const (
	StatusActive   = "active"
	StatusRedeemed = "redeemed"
	StatusRevoked  = "revoked"
	// StatusExpired is only ever a DERIVED value (EffectiveStatus / the console).
	StatusExpired = "expired"
)

// Mint limits.
const (
	// MaxNoteRunes bounds the 備註. The note is what makes a list of twelve
	// random strings usable ("媽媽", "大表哥"), so it is REQUIRED at mint.
	MaxNoteRunes = 40
	// MaxBatch is how many codes one mint may produce. Twelve relatives in one
	// action, with headroom; a bound exists so a fat-fingered count cannot
	// write ten thousand files.
	MaxBatch = 50
	// MinTTLDays / MaxTTLDays / DefaultTTLDays bound the validity window. The
	// console offers 7 / 14 / 30; the server accepts anything in range.
	MinTTLDays     = 1
	MaxTTLDays     = 365
	DefaultTTLDays = 14

	// PersonalReferralTTLDays is the validity window of an auto-minted personal
	// referral code (task #203). It is the ceiling (MaxTTLDays) rather than
	// unbounded because EffectiveStatus FAILS CLOSED on a missing/zero expiry —
	// a referral code must carry a real ExpiresAt or it reads as expired — and
	// the ceiling is the longest one the store already accepts. A year is long
	// enough that a family member's own code is effectively always live while
	// the deploy is; if it ever lapses, the next registration mints a fresh one.
	PersonalReferralTTLDays = MaxTTLDays
)

// codeAlphabet is Crockford base32 minus I, L, O and U, and minus 0 and 1 as
// well. 30 symbols, none of which can be confused with another when a code is
// read aloud over the phone to a parent or retyped from a screenshot — which is
// exactly how these codes travel.
const codeAlphabet = "23456789ABCDEFGHJKMNPQRSTVWXYZ"

// codeBodyLen is how many random symbols each code carries (rendered as two
// groups of four). 30^8 ≈ 6.6e11 ≈ 39 bits: a dozen live codes against that
// space, behind the global register throttle, is not guessable, while eight
// characters stay short enough to dictate over the phone.
const codeBodyLen = 8

// codePrefix brands the code so a family member forwarding a screenshot can
// tell what it is. It is part of the stored id, not decoration.
const codePrefix = "GGD"

// ------------------------------------------------------------------ errors ---

// The three failure surfaces a registration can hit, and the reasoning behind
// exactly this much distinguishability:
//
// Telling "unknown code" apart from "already used" DOES admit that a code
// exists — but it is the one distinction a family member on the phone actually
// needs ("did I mistype it?" vs "someone already used mine"), and the task
// scopes the gate to that ceiling. Everything else is folded together:
// unknown, expired and revoked all return the SAME invite_invalid body, so
// probing cannot map the code space beyond "this exact string was spent".
var (
	// ErrRequired is returned when no code was presented at all on a gated
	// deploy. Distinct from invite_invalid because "you forgot the field" and
	// "your code is wrong" need different words on the client.
	ErrRequired = httpx.Err(http.StatusForbidden, "invite_required",
		"這是私人測試版，註冊需要邀請碼 — 請向管理員索取")

	// ErrInvalid covers unknown / expired / revoked, deliberately as ONE body.
	ErrInvalid = httpx.Err(http.StatusForbidden, "invite_invalid",
		"邀請碼無效或已過期，請確認輸入是否正確，或向管理員索取新的邀請碼")

	// ErrUsed is the one extra distinction: this exact code existed and was
	// already burned by somebody.
	ErrUsed = httpx.Err(http.StatusForbidden, "invite_used",
		"這組邀請碼已經被使用過了，請向管理員索取新的一組")
)

// ------------------------------------------------------------------- model ---

// Doc is one invite code as stored. Field names are the wire shape too — the
// admin console reads this document directly.
type Doc struct {
	Version int `json:"version"`
	// Code is the DISPLAY form, GGD-XXXX-XXXX. The document id is the
	// normalised form (Normalize) with the hyphens removed.
	Code string `json:"code"`
	// Note is the operator's 備註 — who this code is for.
	Note   string `json:"note"`
	Status string `json:"status"`

	CreatedBy string    `json:"createdBy"`
	CreatedAt time.Time `json:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt"`

	// ReferrerID marks a PERSONAL REFERRAL code (task #203): the account this
	// code was auto-minted for at its own registration. Empty on an ordinary
	// admin-minted invite. A referral code is a normal single-use invite in
	// every other respect (it burns the same way and satisfies the same gate) —
	// the only added behaviour is that burning it fast-tracks this referrer from
	// pending → approved. The admin console's List() hides these; they are the
	// USER'S code, surfaced to that user, not an operator artefact.
	ReferrerID string `json:"referrerId,omitempty"`

	RedeemedBy       string    `json:"redeemedBy,omitempty"`
	RedeemedUsername string    `json:"redeemedUsername,omitempty"`
	RedeemedAt       time.Time `json:"redeemedAt,omitempty"`

	RevokedBy string    `json:"revokedBy,omitempty"`
	RevokedAt time.Time `json:"revokedAt,omitempty"`
}

// EffectiveStatus is the status a reader should act on: the stored status,
// except that an unredeemed code past its expiry reads as expired. Expiry is
// evaluated here and nowhere else, so the console and the gate can never
// disagree about whether a code is live.
//
// FAIL CLOSED ON A MISSING EXPIRY. Every code Mint produces carries an
// ExpiresAt, so a stored-active doc with the zero time is not a legitimately
// minted code — it is a truncated/tampered/forward-migrated document. Treating
// it as never-expiring would make it a code that lives forever and grants a
// registration, so an active doc without an expiry reads as EXPIRED (i.e.
// unusable), the same safe direction Redeem takes when it cannot read the store.
func (d Doc) EffectiveStatus(now time.Time) string {
	if d.Status == StatusActive && (d.ExpiresAt.IsZero() || now.After(d.ExpiresAt)) {
		return StatusExpired
	}
	return d.Status
}

// Row is a Doc as the admin console consumes it: the document plus the derived
// status, so the client never re-implements the expiry rule.
type Row struct {
	Doc
	EffectiveStatus string `json:"effectiveStatus"`
}

// ------------------------------------------------------------ normalisation ---

// Normalize maps whatever a human typed onto the document id.
//
// It uppercases, folds the full-width forms a mobile IME emits, and then LOCATES
// the branded code inside the input rather than requiring the whole string to be
// nothing but the code. So "ggd 7k2m 9qxa", "GGD-7K2M-9QXA" and "ggd7k2m9qxa"
// are the same code — and so is the whole LINE message the console's
// 複製邀請訊息 button produces ("邀請碼：GGD-7K2M-9QXA\n有效期限…"), because a
// family member who pastes that entire message into the code box was, before
// this scan, told their perfectly good code was invalid. That "correct-but-
// untidy code rejected" case is the single most likely support call, so it is
// handled here.
//
// The permissiveness is BOUNDED so it never guesses. A match requires all of:
//   - the literal prefix "GGD" preceded by a boundary (start of input, or any
//     non-alphanumeric — a colon, a space, a CJK character), so an embedded
//     "MYGGDACCOUNT" is not read as a code;
//   - exactly codeBodyLen symbols from codeAlphabet, where only spaces and
//     hyphen/dash forms may sit BETWEEN them (a stray alphabet-adjacent
//     character mid-body is a mistype, not formatting — it rejects, so an
//     ambiguous I/O/L/U/0/1 in the body is never silently skipped);
//   - a boundary AFTER the eighth symbol: the code cannot be glued to more
//     alphanumerics ("GGD…B2BNX" stays invalid), only followed by a separator,
//     other text, or end of input.
//
// Anything that does not match normalises to "" (which the caller treats as
// invalid without ever touching the store). The normalised form is a legal
// jsonstore id — uppercase alphanumerics only — so it names a file with no
// escaping.
func Normalize(raw string) string {
	runes := []rune(strings.ToUpper(strings.TrimSpace(raw)))
	for i := range runes {
		runes[i] = foldFullWidth(runes[i])
	}
	for i := 0; i+len(codePrefix) <= len(runes); i++ {
		if !hasPrefixAt(runes, i) {
			continue
		}
		// A "GGD" glued to the tail of an alphanumeric run (…5GGD…) is not a
		// code boundary — skip it.
		if i > 0 && isAlnum(runes[i-1]) {
			continue
		}
		body, end, ok := readCodeBody(runes, i+len(codePrefix))
		if !ok {
			continue
		}
		// The body cannot be immediately followed by another alphanumeric, or
		// the caller typed a longer string than a code (…B2BNX). A separator,
		// other text or end-of-input is fine.
		if end < len(runes) && isAlnum(runes[end]) {
			continue
		}
		return codePrefix + body
	}
	return ""
}

// foldFullWidth maps the full-width ASCII letters/digits a mobile IME can emit
// back onto their ASCII forms; everything else passes through.
func foldFullWidth(r rune) rune {
	if (r >= 0xFF21 && r <= 0xFF3A) || (r >= 0xFF10 && r <= 0xFF19) {
		return r - 0xFEE0
	}
	return r
}

// hasPrefixAt reports whether codePrefix begins at runes[i].
func hasPrefixAt(runes []rune, i int) bool {
	if i+len(codePrefix) > len(runes) {
		return false
	}
	for j := 0; j < len(codePrefix); j++ {
		if runes[i+j] != rune(codePrefix[j]) {
			return false
		}
	}
	return true
}

// isAlnum reports whether r is an ASCII letter or digit — the set that, glued to
// the code, means "this is a longer string than a code" rather than formatting.
func isAlnum(r rune) bool {
	return (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
}

// isCodeSeparator reports whether r is a formatting character allowed to sit
// between the body symbols: spaces and every hyphen/dash/zero-width form a copy
// or a mobile keyboard can slip in.
func isCodeSeparator(r rune) bool {
	if unicode.IsSpace(r) {
		return true
	}
	switch r {
	case '-', // ASCII hyphen-minus
		0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, // hyphen, non-breaking hyphen, figure/en/em dashes, horizontal bar
		0x2212,                         // minus sign
		0xFF0D,                         // full-width hyphen-minus
		0x200B, 0x200C, 0x200D, 0xFEFF: // zero-width space / non-joiner / joiner / BOM
		return true
	}
	return false
}

// readCodeBody reads exactly codeBodyLen alphabet symbols starting at runes[start],
// skipping separators between them. It returns the body, the index just past the
// last symbol read, and whether a full body was collected. A significant
// non-alphabet character before the body is complete (a mistyped ambiguous
// character, a CJK glyph) fails the read rather than being skipped.
func readCodeBody(runes []rune, start int) (string, int, bool) {
	body := make([]rune, 0, codeBodyLen)
	i := start
	for i < len(runes) && len(body) < codeBodyLen {
		r := runes[i]
		switch {
		case strings.ContainsRune(codeAlphabet, r):
			body = append(body, r)
		case isCodeSeparator(r):
			// formatting between groups — ignore
		default:
			return "", i, false
		}
		i++
	}
	if len(body) < codeBodyLen {
		return "", i, false
	}
	return string(body), i, true
}

// display renders a normalised id back as GGD-XXXX-XXXX.
func display(normalised string) string {
	body := normalised[len(codePrefix):]
	return codePrefix + "-" + body[:4] + "-" + body[4:]
}

// newCode mints one cryptographically random normalised code. Rejection-free:
// crypto/rand.Int over len(codeAlphabet) is already uniform.
func newCode() (string, error) {
	var b strings.Builder
	b.WriteString(codePrefix)
	max := big.NewInt(int64(len(codeAlphabet)))
	for i := 0; i < codeBodyLen; i++ {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		b.WriteByte(codeAlphabet[n.Int64()])
	}
	return b.String(), nil
}

// ----------------------------------------------------------------- service ---

// Service is the invite store. The document set is tiny and the process is a
// single writer, so a sharded keyed mutex around each code's read-modify-write
// is the whole concurrency control — the same model account.Repo uses for its
// index files. jsonstore has its own internal lock per Put/Get, which protects
// a single write but NOT a check-then-write, which is precisely what burning a
// single-use code is.
type Service struct {
	store *jsonstore.Store
	locks *keyedmutex.M
	now   func() time.Time
}

// New builds the service over the durable store.
func New(store *jsonstore.Store) *Service {
	return &Service{store: store, locks: keyedmutex.New(), now: time.Now}
}

// SetNow overrides the clock seam (tests pin expiry deterministically).
func (s *Service) SetNow(fn func() time.Time) { s.now = fn }

// Mint creates count codes for one note. Returns them newest-first; the caller
// (the admin handler) shows the full codes.
func (s *Service) Mint(ctx context.Context, adminID, note string, count, ttlDays int) ([]Row, error) {
	note = strings.TrimSpace(note)
	if note == "" {
		return nil, httpx.BadRequest("備註為必填：請寫下這組邀請碼要給誰")
	}
	for _, r := range note {
		if unicode.IsControl(r) {
			return nil, httpx.BadRequest("備註不可包含控制字元")
		}
	}
	if len([]rune(note)) > MaxNoteRunes {
		return nil, httpx.BadRequest("備註最多 40 個字")
	}
	if count <= 0 {
		count = 1
	}
	if count > MaxBatch {
		return nil, httpx.BadRequest("一次最多產生 50 組邀請碼")
	}
	if ttlDays <= 0 {
		ttlDays = DefaultTTLDays
	}
	if ttlDays < MinTTLDays || ttlDays > MaxTTLDays {
		return nil, httpx.BadRequest("有效天數必須介於 1 到 365 天")
	}

	now := s.now().UTC()
	expires := now.AddDate(0, 0, ttlDays)
	out := make([]Row, 0, count)
	for i := 0; i < count; i++ {
		id, err := s.mintOne(adminID, note, "", now, expires)
		if err != nil {
			return nil, err
		}
		doc, err := s.get(id)
		if err != nil {
			return nil, err
		}
		out = append(out, Row{Doc: doc, EffectiveStatus: doc.EffectiveStatus(now)})
	}
	return out, nil
}

// MintPersonalReferral mints ONE single-use referral code owned by referrerID
// (task #203) and returns its DISPLAY form. It is called from the registration
// path for every new account on a gated deploy, so referrerID is the freshly
// created account and username is only for the operator-facing note.
//
// The code is an ordinary invite in every mechanical respect — same alphabet,
// same single-use burn, same durable store — so it satisfies the #174 gate
// exactly like an admin code and does NOT open a code-free registration path.
// The ONLY difference is the stored referrerId, which Redeem reports so the
// caller can approve this referrer when someone else burns the code. It is
// therefore SAFE to hand a family member: giving it away lets a friend register
// (spending it once) and, as a side effect, approves the giver if still
// pending — it can never be spent twice, and it grants the holder nothing but
// one registration they already needed a code for.
func (s *Service) MintPersonalReferral(ctx context.Context, referrerID, username string) (string, error) {
	referrerID = strings.TrimSpace(referrerID)
	if referrerID == "" {
		return "", httpx.BadRequest("referrerId is required")
	}
	note := "個人推薦碼"
	if u := strings.TrimSpace(username); u != "" {
		note = "個人推薦碼 · " + u
		if len([]rune(note)) > MaxNoteRunes {
			note = "個人推薦碼"
		}
	}
	now := s.now().UTC()
	expires := now.AddDate(0, 0, PersonalReferralTTLDays)
	id, err := s.mintOne(referrerID, note, referrerID, now, expires)
	if err != nil {
		return "", err
	}
	s.Audit(referrerID, "invite.mint_personal", display(id), map[string]any{"username": username})
	return display(id), nil
}

// ReferrerOf returns the referrerId stored on a code (task #203), or "" when the
// code is unknown, malformed, or an ordinary admin-minted invite. It is read
// AFTER Redeem has burned the code, so the lookup never races the burn: the
// referrer id is written at mint time and Redeem never clears it. A read error
// is surfaced so the caller can log it and simply not approve anyone (fail
// closed — the inviter stays pending, which an admin can still resolve).
func (s *Service) ReferrerOf(ctx context.Context, rawCode string) (string, error) {
	id := Normalize(rawCode)
	if id == "" {
		return "", nil
	}
	doc, err := s.get(id)
	if err != nil {
		if errors.Is(err, jsonstore.ErrNotFound) {
			return "", nil
		}
		return "", err
	}
	return doc.ReferrerID, nil
}

// mintOne writes a single code, retrying on the (astronomically unlikely)
// collision with an existing document rather than overwriting it — overwriting
// would silently destroy the record of who redeemed the colliding code.
// referrerID is empty for an admin-minted invite and the owning account for a
// personal referral code.
func (s *Service) mintOne(createdBy, note, referrerID string, now, expires time.Time) (string, error) {
	for attempt := 0; attempt < 8; attempt++ {
		id, err := newCode()
		if err != nil {
			return "", err
		}
		unlock := s.locks.Lock(id)
		exists, err := s.store.Exists(Collection, id)
		if err != nil {
			unlock()
			return "", err
		}
		if exists {
			unlock()
			continue
		}
		doc := Doc{
			Version:    SchemaVersion,
			Code:       display(id),
			Note:       note,
			Status:     StatusActive,
			ReferrerID: referrerID,
			CreatedBy:  createdBy,
			CreatedAt:  now,
			ExpiresAt:  expires,
		}
		err = s.store.Put(Collection, id, doc)
		unlock()
		if err != nil {
			return "", err
		}
		return id, nil
	}
	return "", httpx.Internal("could not mint a unique invite code")
}

// List returns every ADMIN-MINTED code, newest first, with the derived status.
//
// Personal referral codes (task #203, ReferrerID != "") are DELIBERATELY hidden:
// the admin console's 邀請碼 page is for the codes an operator mints for the
// family, whereas a referral code is the individual player's own — auto-minted,
// single-use, surfaced to that player in the lobby. Listing one per account here
// would bury the operator's own codes in machine-generated noise and invite a
// revoke that does nothing useful. The gate (Redeem) still burns them exactly
// the same; only this display view filters them.
func (s *Service) List(ctx context.Context) ([]Row, error) {
	// Scan (a directory listing), not List (_index.json): the index is derived
	// state that reads as empty when its file is missing, and an operator must
	// never be shown "no codes exist" because of a lost index file.
	ids, err := s.store.Scan(Collection)
	if err != nil {
		return nil, err
	}
	now := s.now().UTC()
	rows := make([]Row, 0, len(ids))
	for _, id := range ids {
		doc, err := s.get(id)
		if err != nil {
			if errors.Is(err, jsonstore.ErrNotFound) {
				continue // raced with a delete
			}
			return nil, err
		}
		if doc.ReferrerID != "" {
			continue // a personal referral code — not an operator artefact
		}
		rows = append(rows, Row{Doc: doc, EffectiveStatus: doc.EffectiveStatus(now)})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].CreatedAt.Equal(rows[j].CreatedAt) {
			return rows[i].Code > rows[j].Code
		}
		return rows[i].CreatedAt.After(rows[j].CreatedAt)
	})
	return rows, nil
}

// Revoke kills an unredeemed code. Irreversible on purpose: "un-revoking" would
// be a second way to make a code live, and minting a fresh one is one click.
// A REDEEMED code can never be revoked — that document is the durable record of
// who got in, and deleting it would erase the audit trail the console shows.
func (s *Service) Revoke(ctx context.Context, adminID, rawCode string) (Row, error) {
	id := Normalize(rawCode)
	if id == "" {
		return Row{}, httpx.NotFound("查無此邀請碼")
	}
	unlock := s.locks.Lock(id)
	defer unlock()

	doc, err := s.get(id)
	if err != nil {
		if errors.Is(err, jsonstore.ErrNotFound) {
			return Row{}, httpx.NotFound("查無此邀請碼")
		}
		return Row{}, err
	}
	if doc.Status == StatusRedeemed {
		return Row{}, httpx.Conflict("已被使用的邀請碼無法撤銷")
	}
	if doc.Status == StatusRevoked {
		return Row{}, httpx.Conflict("這組邀請碼已經撤銷過了")
	}
	now := s.now().UTC()
	doc.Status = StatusRevoked
	doc.RevokedBy = adminID
	doc.RevokedAt = now
	if err := s.store.Put(Collection, id, doc); err != nil {
		return Row{}, err
	}
	s.Audit(adminID, "invite.revoke", doc.Code, map[string]any{"note": doc.Note})
	return Row{Doc: doc, EffectiveStatus: doc.EffectiveStatus(now)}, nil
}

// Redeem BURNS a code on behalf of the account that is about to be created.
//
// It is the whole gate, and it is deliberately the check-and-burn in ONE
// critical section: read, verify, write, all under the code's keyed mutex. Two
// family members pasting the same code at the same instant therefore serialise,
// and the loser sees the same "already used" answer as somebody arriving an
// hour late. There is no window in which two registrations both observe an
// active code.
//
// ORDERING WITH ACCOUNT CREATION — burn first, create second, release on
// failure (see auth/service.go). The other order is not survivable: if the
// account were created first and the burn then failed or the process died in
// between, a LIVE code would already have produced an account and the gate
// would silently have leaked an extra registration. Burning first fails the
// other way — a spent code with no account — which costs one LINE message
// ("mint me another") and is additionally rolled back by Release on every
// failure path that is reachable in-process.
func (s *Service) Redeem(ctx context.Context, rawCode, accountID, username string) error {
	if strings.TrimSpace(rawCode) == "" {
		return ErrRequired
	}
	id := Normalize(rawCode)
	if id == "" {
		// Not even the right SHAPE — answered without touching the store, so a
		// malformed guess costs an attacker a request and tells them nothing.
		return ErrInvalid
	}
	unlock := s.locks.Lock(id)
	defer unlock()

	doc, err := s.get(id)
	if err != nil {
		if errors.Is(err, jsonstore.ErrNotFound) {
			return ErrInvalid
		}
		// An unreadable store must never read as "code is fine": fail CLOSED.
		slog.Error("invite: could not read the invite code; refusing the registration", "err", err)
		return ErrInvalid
	}
	now := s.now().UTC()
	switch doc.EffectiveStatus(now) {
	case StatusRedeemed:
		return ErrUsed
	case StatusActive:
		// fall through and burn
	default: // revoked, expired — same body as unknown
		return ErrInvalid
	}

	doc.Status = StatusRedeemed
	doc.RedeemedBy = accountID
	doc.RedeemedUsername = username
	doc.RedeemedAt = now
	if err := s.store.Put(Collection, id, doc); err != nil {
		// The burn did not land, so nothing was consumed — refuse rather than
		// let the registration through un-gated.
		slog.Error("invite: could not burn the invite code; refusing the registration", "err", err)
		return ErrInvalid
	}
	s.Audit(accountID, "invite.redeem", doc.Code, map[string]any{
		"note": doc.Note, "username": username,
	})
	return nil
}

// Release un-burns a code that THIS registration burned and then failed to turn
// into an account (a create conflict, a store error).
//
// Compare-and-set on redeemedBy: it can only ever revert a burn made for the
// same account id, so a late/duplicated rollback can never resurrect somebody
// else's spent code. A failed release is logged loudly and is otherwise
// harmless — the operator mints a new code — which is the same discipline
// account.Repo applies to its own rollback writes.
func (s *Service) Release(ctx context.Context, rawCode, accountID string) error {
	id := Normalize(rawCode)
	if id == "" {
		return nil
	}
	unlock := s.locks.Lock(id)
	defer unlock()

	doc, err := s.get(id)
	if err != nil {
		return err
	}
	if doc.Status != StatusRedeemed || doc.RedeemedBy != accountID {
		return nil // not ours to give back
	}
	doc.Status = StatusActive
	doc.RedeemedBy = ""
	doc.RedeemedUsername = ""
	doc.RedeemedAt = time.Time{}
	return s.store.Put(Collection, id, doc)
}

func (s *Service) get(id string) (Doc, error) {
	var d Doc
	if err := s.store.Get(Collection, id, &d); err != nil {
		return Doc{}, err
	}
	if d.Version == 0 {
		d.Version = SchemaVersion
	}
	if d.Status == "" {
		d.Status = StatusActive
	}
	return d, nil
}

// Audit appends one line to the shared admin audit log so minting, revoking and
// REDEEMING all show up on the console's 稽核 page next to every other operator
// action. Best-effort: a failed audit write never fails the mutation.
func (s *Service) Audit(actorID, action, target string, detail map[string]any) {
	entry := admin.AuditEntry{
		AdminID:  actorID,
		Action:   action,
		TargetID: Collection + "/" + target,
		Detail:   detail,
		TS:       s.now().UTC(),
	}
	if err := s.store.AppendLine(admin.ColAudit, entry.TS.Format("2006-01-02"), entry); err != nil {
		slog.Warn("invite: audit append failed", "action", action, "err", err)
	}
}

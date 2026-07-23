package invite

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestNormalizeRecoversCodeFromUntidyPaste is the "correct-but-untidy code
// rejected" support call the task flags as the single most likely one: a family
// member pastes the WHOLE LINE message (the console's 複製邀請訊息 button
// deliberately produces it) into the code box, or types a label in front of the
// code. Every one of these carries exactly one real code and must redeem it.
func TestNormalizeRecoversCodeFromUntidyPaste(t *testing.T) {
	s := newSvc(t)
	code := mintOne(t, s, "媽媽") // GGD-XXXX-XXXX
	canonical := Normalize(code)
	require.Len(t, canonical, 11)
	body := canonical[3:]

	// The exact shape apps/admin/src/invites.ts:inviteMessage produces, pasted whole.
	lineMessage := "【去死團的逆襲】內測邀請\n" +
		"註冊網址：https://ggd.example.com/register\n" +
		"邀請碼：" + code + "\n" +
		"有效期限：2026-08-06（一組只能用一次）\n" +
		"註冊時把邀請碼填進「邀請碼」欄位就可以了。"

	for _, variant := range []string{
		lineMessage,
		"邀請碼：" + code,                 // just the code line, CJK label + full-width colon
		"Code: " + code,               // latin label with a space boundary
		"code " + code,                // lowercased latin label
		code + " 到期7天",                // trailing words after a space
		code + "\n",                   // trailing newline
		"你的邀請碼是 " + code + "，記得七天內用", // code embedded in a CJK sentence
		"ggd " + body[:4] + " " + body[4:] + " ← 這組", // lowercased, spaced, trailing arrow+CJK
	} {
		assert.Equal(t, canonical, Normalize(variant), "should recover the code from %q", variant)
	}
}

// TestNormalizeStaysStrictOnGluedAndAmbiguousInput proves the recovery scan did
// not become a loose guesser: a code glued to more alphanumerics, an ambiguous
// character in the body, and a "GGD" embedded in a word all still reject.
func TestNormalizeStaysStrictOnGluedAndAmbiguousInput(t *testing.T) {
	s := newSvc(t)
	code := mintOne(t, s, "媽媽")
	canonical := Normalize(code)
	body := canonical[3:]

	for _, bad := range []string{
		"",
		"GGD",
		canonical + "X",                    // glued trailing letter — a longer string, not a code
		canonical + "0",                    // glued trailing digit
		"X" + canonical,                    // glued leading letter
		"MYGGDACCOUNT",                     // GGD embedded in an alphanumeric run
		"GGD-1234-5678",                    // 0/1 are not in the alphabet
		"GGD-" + "O" + body[1:4] + "-" + body[4:], // an ambiguous O mid-body is a mistype, never skipped
		"ABC-7K2M-9QXA",                    // wrong brand
	} {
		assert.Equal(t, "", Normalize(bad), "should reject %q", bad)
	}
}

// TestEffectiveStatusFailsClosedOnMissingExpiry: a stored-active doc with no
// ExpiresAt is not something Mint can produce (it always sets one), so it is a
// truncated/tampered/forward-migrated document and must read as unusable rather
// than as a code that lives forever.
func TestEffectiveStatusFailsClosedOnMissingExpiry(t *testing.T) {
	now := time.Now().UTC()

	live := Doc{Status: StatusActive, ExpiresAt: now.Add(time.Hour)}
	assert.Equal(t, StatusActive, live.EffectiveStatus(now))

	expired := Doc{Status: StatusActive, ExpiresAt: now.Add(-time.Hour)}
	assert.Equal(t, StatusExpired, expired.EffectiveStatus(now))

	// The new guard: zero ExpiresAt on an active doc is treated as expired.
	noExpiry := Doc{Status: StatusActive}
	assert.Equal(t, StatusExpired, noExpiry.EffectiveStatus(now),
		"an active code with no expiry must fail closed, not live forever")

	// A redeemed doc is the durable record of who got in; its status is never
	// overridden by the expiry rule even with a zero ExpiresAt.
	redeemed := Doc{Status: StatusRedeemed}
	assert.Equal(t, StatusRedeemed, redeemed.EffectiveStatus(now))
}

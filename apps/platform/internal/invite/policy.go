package invite

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/httpx"
)

// REGISTRATION POLICY (GH#1274) — 「註冊要不要邀請碼」的唯一住處。
//
// owner 2026-09-15:
//
//	「推薦碼變成選項不需讓玩家也可以直接註冊，但是後台還是要批核
//	 (但新帳號使用推薦碼後還是可以讓介紹人自動審批過) 這個變成後台選項可以切換」
//
// WHY IT LIVES HERE AND NOT IN internal/opsenv. opsenv's package header draws a
// boundary that must not move: its public read is UNAUTHENTICATED because the
// game-server consumes that table as truth without a token, so the moment a
// security posture flag enters its Keys, an unauthenticated GET becomes the
// thing that decides the posture. This document is never consumed that way —
// auth.Service reads it IN PROCESS, through the InviteGate interface, at the
// moment of each registration. The public read added alongside it (see
// auth.Service.RegistrationInviteState) is a REPORT of what the server will do,
// never the input to it.
//
// TWO HOMES WOULD BE ONE TOO MANY. Before this document, "does registration
// need a code" lived in GGD_REQUIRE_INVITE, and changing it meant editing
// docker/compose.family.yaml and redeploying. That environment variable now
// answers a NARROWER question — "is the invite-code system installed at all"
// (mint/list/revoke, personal referral codes, the gate object itself) — and
// says nothing about 必填/選填. One question, one 住處.
//
// THREE STATES, AND THE MIDDLE ONE IS THE ONE THAT USUALLY GETS LOST:
//
//	never configured  → DefaultCodeMode (the shipped default; see below)
//	configured        → exactly what the operator saved
//	UNREADABLE        → ModeRequired, loudly. An unreadable store must never
//	                    read as "anyone may register" — it is the same
//	                    fail-closed direction Redeem takes (see its comment),
//	                    and the opposite of what a zero value would give you.
//
// It is deliberately NOT cached. A registration is rate-limited and rare, the
// document is a few dozen bytes, and the acceptance criterion is「後台存檔即
// 生效，不必重啟」— a TTL cache would buy nothing and would put a window
// between the operator's save and the behaviour they just chose.
const (
	// PolicyCollection is the jsonstore collection (a directory under DATA_DIR).
	// The same "config" directory combat-env and server-ops use.
	PolicyCollection = "config"
	// PolicyDocID is the single document id inside it:
	// DATA_DIR/config/registration.json.
	//
	// ⚠️ NOT in Collection ("invites"): that directory is one document per CODE
	// and List() walks it, so a policy file there would be rendered as an invite
	// code on the console's 邀請碼 page.
	PolicyDocID = "registration"
	// PolicySchemaVersion is the doc version written by this build.
	PolicySchemaVersion = 1
)

// The two invite-code modes. These strings are the wire shape (the admin
// console and the register UI both branch on them), so they are values, not
// booleans — a third mode (e.g. "required-for-strangers") would otherwise have
// to break the field's type.
const (
	// ModeRequired is the pre-GH#1274 behaviour: no code, no account.
	ModeRequired = "required"
	// ModeOptional lets a registration through WITHOUT a code. It does NOT
	// weaken the approval gate: the account still lands 待審 and still gets no
	// session until an admin approves it (owner:「後台還是要批核」).
	ModeOptional = "optional"
)

// DefaultCodeMode is what a deploy that has never saved this setting uses.
//
// It is ModeOptional because 第〇·六守則 says the higher-precedence update ships
// DEFAULT-ON: owner's 2026-09-15 instruction IS the new design, and the switch
// exists so he can go BACK (one dropdown, no deploy), not so he can opt in.
//
// ⚠️ THE COST, STATED PLAINLY, because the console has to show it and this is
// the only place it is derived: the invite gate is also the first thing that
// stops a stranger probing whether a username or email is registered (GH#179 —
// see the Register comment). In ModeOptional an un-invited caller reaches the
// uniqueness reservation and can read 201-vs-409. What bounds that is
// GGD_MAX_PENDING (the pending-queue cap) and GGD_REGISTER_RATE_LIMIT, not this
// setting. An operator who needs the probe surface closed sets ModeRequired.
const DefaultCodeMode = ModeOptional

// Policy is the stored document. Field names are the wire shape too — the admin
// console reads this back verbatim.
type Policy struct {
	Version int `json:"version"`
	// CodeMode is ModeRequired or ModeOptional. Named inviteCode on the wire
	// because that is the question it answers ("邀請碼：必填還是選填").
	CodeMode  string    `json:"inviteCode"`
	UpdatedBy string    `json:"updatedBy"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ValidCodeMode reports whether m is one of the two modes. Exported so the
// handler and the drift guard share one definition instead of two lists.
func ValidCodeMode(m string) bool {
	return m == ModeRequired || m == ModeOptional
}

// PolicyStored reads the saved policy and reports whether it has EVER been
// saved.
//
// "Never saved" is kept distinguishable from "saved to the default" for the
// same reason combat-env and server-ops keep it: the console renders
// 「尚未設定（使用內建預設值）」 rather than implying the operator chose this,
// and a future migration can tell the two apart. The returned Policy always
// carries a usable CodeMode — the compiled default when nothing is stored, and
// the compiled default again when a stored document somehow holds a mode this
// build does not recognise (a hand-edited file, a downgrade).
func (s *Service) PolicyStored() (Policy, bool, error) {
	var p Policy
	err := s.store.Get(PolicyCollection, PolicyDocID, &p)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return Policy{Version: PolicySchemaVersion, CodeMode: DefaultCodeMode}, false, nil
	}
	if err != nil {
		return Policy{}, false, err
	}
	if p.Version == 0 {
		p.Version = PolicySchemaVersion
	}
	if !ValidCodeMode(p.CodeMode) {
		slog.Error("invite: the stored registration policy holds an unknown invite-code mode; using the compiled default",
			"stored", p.CodeMode, "using", DefaultCodeMode)
		p.CodeMode = DefaultCodeMode
	}
	return p, true, nil
}

// SetCodeMode replaces the policy. Strictly validated: an unknown mode is a 400,
// never a silent fallback, because a console that could save a typo would let
// the gate be turned off by accident.
func (s *Service) SetCodeMode(ctx context.Context, adminID, mode string) (Policy, error) {
	mode = strings.TrimSpace(strings.ToLower(mode))
	if !ValidCodeMode(mode) {
		return Policy{}, httpx.BadRequest("邀請碼模式只能是 required（必填）或 optional（選填）")
	}
	unlock := s.locks.Lock(PolicyCollection + "/" + PolicyDocID)
	defer unlock()

	p := Policy{
		Version:   PolicySchemaVersion,
		CodeMode:  mode,
		UpdatedBy: adminID,
		UpdatedAt: s.now().UTC(),
	}
	if err := s.store.Put(PolicyCollection, PolicyDocID, p); err != nil {
		return Policy{}, err
	}
	s.Audit(adminID, "invite.policy", "policy", map[string]any{"inviteCode": mode})
	// Logged as well as audited: this line is half the answer to「誰能註冊」on a
	// family deploy, and the boot log already shouts the other half. An operator
	// reading the journal after the fact must not have to open the console to
	// find out when the gate was opened.
	slog.Warn("invite: the registration invite-code policy changed",
		"inviteCode", mode, "by", adminID,
		"meaning", map[string]string{
			ModeRequired: "一定要填邀請碼才能註冊",
			ModeOptional: "沒填邀請碼也能註冊（仍需後台批核）",
		}[mode])
	return p, nil
}

// RegistrationRequiresCode is the CONSUMER-FACING answer, and the only one
// auth.Service.Register asks. It collapses the three states above onto the one
// boolean the gate needs, failing CLOSED on a read error.
//
// ctx is accepted for interface symmetry with the rest of InviteGate; the
// jsonstore takes no context (see auth.Register's CONTEXT NOTE for why that is
// deliberate on this path).
func (s *Service) RegistrationRequiresCode(ctx context.Context) bool {
	p, _, err := s.PolicyStored()
	if err != nil {
		slog.Error("invite: could not read the registration policy; requiring an invite code",
			"err", err, "mode", ModeRequired)
		return true
	}
	return p.CodeMode == ModeRequired
}

package friend

import (
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
	"github.com/ggd/platform/internal/presence"
)

// ---- GET /lobby/online — 大廳線上玩家列表 -------------------------------------
//
// owner 2026-08-03:「大廳 FRIEND 跟排位榜 中間，多出一個區域顯示所有大廳正在線上
// 的玩家列表，並且名字旁邊有按鈕可以一鍵加入朋友」.
//
// ---- WHY IT IS NOT ON THE PLAIN AUTHED ROUTER --------------------------------
// This is the first endpoint that hands ONE caller the names of EVERY other
// player on the deploy. `auth.Middleware` alone only proves the bearer token
// parses — task #210 is the recorded case of exactly that not being enough: a
// REJECTED account still holding a valid access token walked into the lobby WS.
// So this route is mounted behind `auth.PlayableOnly` (see MountPlayable), the
// same durable ban/#126-approval read the lobby handshake and the room routes
// use. A pending or rejected account gets the same 403 here as it does when it
// tries to play, instead of a full roster to harvest.
//
// ---- WHY RELATION IS COMPUTED HERE, NOT IN THE BROWSER -----------------------
// The panel has to render 「加為好友」 vs 「已加入」 per row. Deriving that in the
// client from a separately-fetched friends list means two responses that can
// disagree for a poll interval — and the visible symptom of the disagreement is
// an ENABLED add button on somebody who is already a friend. One response, one
// snapshot, one truth.
//
// ---- FAIL LOUD ---------------------------------------------------------------
// If presence cannot be read the handler returns an error instead of an empty
// list. "Nobody is online" and "I could not find out who is online" look
// identical in the UI and only one of them is a reason to stop waiting for a
// game, so the distinction is on the wire.

// Relation values reported per row (from the CALLER's point of view).
const (
	RelationNone     = "none"     // no edge at all — the add button is live
	RelationFriend   = "friend"   // already friends — button is inert
	RelationOutgoing = "outgoing" // I already asked — button is inert
	RelationIncoming = "incoming" // they asked me — the friends panel answers it
)

// maxOnlinePlayers bounds the response. It is a transport guard, not a policy
// knob: the list is naturally bounded by the number of registered accounts
// (147 on the family deploy). If a deploy ever grows past this the panel needs
// paging or search, and silently truncating a roster of thousands would be a
// worse answer than the explicit `truncated` flag below.
const maxOnlinePlayers = 300

// OnlinePlayer is one row of the lobby's 線上玩家 list.
type OnlinePlayer struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	// State is the LIVE presence state: "online" | "in-lobby" | "in-match".
	// Never "offline" — offline accounts are not rows.
	State string `json:"state"`
	// Relation is this row's edge to the CALLER: none | friend | outgoing |
	// incoming. It is what decides whether the add button does anything.
	Relation string `json:"relation"`
}

// OnlineResp is the GET /lobby/online body.
type OnlineResp struct {
	Players []OnlinePlayer `json:"players"`
	// Total is how many accounts were online BEFORE the cap, so a truncated
	// list can say so instead of quietly being short.
	Total     int  `json:"total"`
	Truncated bool `json:"truncated"`
}

// MountPlayable registers the routes that require a PLAYABLE account (not just
// a parseable token). Mount it on the same subrouter the room routes use.
func (h *Handlers) MountPlayable(r chi.Router) {
	r.Get("/lobby/online", h.online)
}

func (h *Handlers) online(w http.ResponseWriter, r *http.Request) {
	me := auth.MustIdentity(r.Context())

	ids, err := h.accounts.List(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	// Deterministic input order → deterministic output for equal usernames.
	sort.Strings(ids)

	states, err := h.presence.GetMany(r.Context(), ids)
	if err != nil {
		// Fail LOUD: an empty list would be indistinguishable from "nobody is
		// playing right now".
		httpx.WriteError(w, httpx.Internal("presence unavailable"))
		return
	}

	// My own social doc decides each row's relation. An unreadable doc is an
	// error rather than "everyone is a stranger", because the visible cost of
	// guessing wrong is an enabled add button on an existing friend.
	doc, err := h.svc.Get(r.Context(), me.AccountID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}

	rows := make([]OnlinePlayer, 0, 16)
	for i, id := range ids {
		if id == me.AccountID {
			continue // the viewer is not somebody to befriend
		}
		if states[i] == presence.StateOffline || states[i] == "" {
			continue
		}
		if _, blocked := doc.Blocked[id]; blocked {
			continue // I blocked them; they are not on my list
		}
		a, err := h.accounts.GetByID(r.Context(), id)
		if err != nil {
			continue // a presence key with no account file — nothing to show
		}
		// #126: a banned or not-yet-approved account is not a lobby player, so
		// it is not on anybody's roster even if a stale presence key survives.
		if a.Banned || !a.IsApproved() {
			continue
		}
		rows = append(rows, OnlinePlayer{
			ID:       id,
			Username: a.Username,
			State:    states[i],
			Relation: relationOf(doc, id),
		})
	}

	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Username != rows[j].Username {
			return rows[i].Username < rows[j].Username
		}
		return rows[i].ID < rows[j].ID
	})

	total := len(rows)
	truncated := false
	if len(rows) > maxOnlinePlayers {
		rows = rows[:maxOnlinePlayers]
		truncated = true
	}
	httpx.WriteJSON(w, http.StatusOK, OnlineResp{Players: rows, Total: total, Truncated: truncated})
}

// relationOf reports the caller's edge to other, read off the caller's own
// social doc. Friendship wins over a stale pending edge in either direction.
func relationOf(doc Doc, other string) string {
	if _, ok := doc.Friends[other]; ok {
		return RelationFriend
	}
	if _, ok := doc.Outgoing[other]; ok {
		return RelationOutgoing
	}
	if _, ok := doc.Incoming[other]; ok {
		return RelationIncoming
	}
	return RelationNone
}

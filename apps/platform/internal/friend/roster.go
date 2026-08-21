package friend

import (
	"context"
	"sort"

	"github.com/ggd/platform/internal/presence"
)

// ---- 大廳名冊 (GH#492) --------------------------------------------------------
//
// owner 2026-08-21:「創建房間最重要的就是拉人進來，請你將**所有線上在大廳的人都
// 跳出確認視窗**是否進入房間一起開始」.
//
// ---- WHY THIS IS A SEPARATE ENUMERATION FROM `online()` ----------------------
// GET /lobby/online answers 「誰在線上，我跟他是什麼關係」 — a SOCIAL question, so
// its rows carry `relation` and drop the accounts the caller has blocked. The
// rally broadcast asks a different one: 「這一則邀請該送給誰」. Two filters differ
// and both are load-bearing:
//
//   - IN-MATCH ACCOUNTS ARE NOT INVITED. owner's rule is 「所有線上**在大廳**的人」,
//     and a confirm dialog thrown over a live match is the one outcome that makes
//     this feature worse than not having it. `presence.StateInMatch` is exactly
//     the fact that distinguishes them, and it is already tracked (room.Start
//     sets it for every member) — so this is a filter, not new bookkeeping.
//   - MMR RIDES ALONG. owner asked for 「明顯提示姓名與**積分**」, and the invite
//     push is the first place a name+rating pair is needed. Reading it here costs
//     nothing: the account file is already being loaded for the username.
//
// The shared half — walk every account, read presence in ONE round trip, drop
// banned/unapproved (#126) — is `livePlayable` below, used by BOTH, so the two
// lists can never disagree about who is a lobby player.

// LiveAccount is one account that is currently reachable in the lobby layer.
type LiveAccount struct {
	ID       string
	Username string
	// State is the live presence state: "online" | "in-lobby" | "in-match".
	State string
	// MMR is the ladder rating shown beside the name (owner: 姓名與積分).
	MMR int
}

// InLobby reports every PLAYABLE account currently sitting in the lobby —
// deliberately EXCLUDING accounts in a match (owner: ⛔ 不可以打斷正在比賽中的人).
//
// It is the seam `room.Service` calls to decide who a rally broadcast reaches;
// declared on Handlers because that is where the accounts repo and the presence
// service already live.
func (h *Handlers) InLobby(ctx context.Context) ([]LiveAccount, error) {
	live, err := h.livePlayable(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]LiveAccount, 0, len(live))
	for _, a := range live {
		if a.State == presence.StateInMatch {
			continue
		}
		out = append(out, a)
	}
	return out, nil
}

// Lookup resolves ONE account into the same shape, regardless of presence.
//
// ⚠️ It exists because the RALLY HOST is not guaranteed to be on his own lobby
// roster: presence is a TTL key written by the lobby WS handshake, so a host
// whose socket is reconnecting (or a caller driving the REST API directly) is
// absent from `InLobby` for a few seconds. Deriving his name from that list
// therefore yields "" exactly when the confirm dialog needs it, and the dialog
// falls back to printing a raw 26-character ULID at every recipient — which is
// a visible failure of owner's 「明顯提示**姓名**與積分」, measured 2026-08-21 in
// the browser before this function existed.
//
// A missing/unreadable account is an empty LiveAccount and NO error: the rally
// must still go out. Losing the host's name degrades one line of a dialog;
// refusing the broadcast loses the whole feature.
func (h *Handlers) Lookup(ctx context.Context, accountID string) (LiveAccount, error) {
	a, err := h.accounts.GetByID(ctx, accountID)
	if err != nil {
		return LiveAccount{}, nil
	}
	state, err := h.presence.Get(ctx, accountID)
	if err != nil {
		state = presence.StateOffline
	}
	return LiveAccount{ID: a.ID, Username: a.Username, State: state, MMR: a.MMR}, nil
}

// livePlayable walks every account, reads presence in one round trip, and keeps
// the ones that are both ONLINE and allowed to play. Sorted by username (then id)
// so callers get a stable order without re-sorting.
//
// A presence read failure is an ERROR, never an empty list: 「沒有人在線上」 and
// 「我讀不到誰在線上」 look identical to every caller and only one of them is a
// reason to stop waiting for a game. Same call as online() has always made.
func (h *Handlers) livePlayable(ctx context.Context) ([]LiveAccount, error) {
	ids, err := h.accounts.List(ctx)
	if err != nil {
		return nil, err
	}
	sort.Strings(ids) // deterministic input → deterministic output for equal names

	states, err := h.presence.GetMany(ctx, ids)
	if err != nil {
		return nil, errPresenceUnavailable
	}

	out := make([]LiveAccount, 0, 16)
	for i, id := range ids {
		if states[i] == presence.StateOffline || states[i] == "" {
			continue
		}
		a, err := h.accounts.GetByID(ctx, id)
		if err != nil {
			continue // a presence key with no account file — nothing to show
		}
		// #126: a banned or not-yet-approved account is not a lobby player, so it
		// is on nobody's roster even if a stale presence key survives.
		if a.Banned || !a.IsApproved() {
			continue
		}
		out = append(out, LiveAccount{ID: id, Username: a.Username, State: states[i], MMR: a.MMR})
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].Username != out[j].Username {
			return out[i].Username < out[j].Username
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}

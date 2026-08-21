// Package friend implements the social graph: request/accept/decline/remove/
// block. Durable truth is data/friends/<accountID>.json; every mutation
// write-throughs BOTH sides' files while holding both account locks in ULID
// (lexicographic) order.
package friend

import (
	"context"
	"errors"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/keyedmutex"
	"github.com/ggd/platform/internal/httpx"
)

// ColFriends is the jsonstore collection.
const ColFriends = "friends"

// Edge annotates one relation entry.
type Edge struct {
	At time.Time `json:"at"`
}

// Doc is one account's social file.
type Doc struct {
	AccountID string          `json:"accountId"`
	Friends   map[string]Edge `json:"friends"`
	Incoming  map[string]Edge `json:"incoming"`
	Outgoing  map[string]Edge `json:"outgoing"`
	Blocked   map[string]Edge `json:"blocked"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

func emptyDoc(id string) Doc {
	return Doc{
		AccountID: id,
		Friends:   map[string]Edge{},
		Incoming:  map[string]Edge{},
		Outgoing:  map[string]Edge{},
		Blocked:   map[string]Edge{},
	}
}

// Service mutates the social graph. The acting account ALWAYS comes from the
// authenticated context (IDOR-proof by construction).
type Service struct {
	store *jsonstore.Store
	locks *keyedmutex.M

	// autoAdmin is 管理員預設好友 (GH#499). nil = not wired (every unit test, and
	// any deploy that never called EnableAdminAutoFriend). See adminfriend.go.
	autoAdmin *AutoAdmin
}

// New builds the friend service.
func New(store *jsonstore.Store) *Service {
	return &Service{store: store, locks: keyedmutex.New()}
}

func (s *Service) load(id string) (Doc, error) {
	var d Doc
	err := s.store.Get(ColFriends, id, &d)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return emptyDoc(id), nil
	}
	if err != nil {
		return d, err
	}
	// Backfill nil maps from hand-edited files.
	e := emptyDoc(id)
	if d.Friends == nil {
		d.Friends = e.Friends
	}
	if d.Incoming == nil {
		d.Incoming = e.Incoming
	}
	if d.Outgoing == nil {
		d.Outgoing = e.Outgoing
	}
	if d.Blocked == nil {
		d.Blocked = e.Blocked
	}
	return d, nil
}

// withBoth locks actor+other in deterministic order, loads both docs, applies
// fn, then write-throughs both files.
func (s *Service) withBoth(actor, other string, fn func(a, b *Doc) error) error {
	if actor == other {
		return httpx.BadRequest("cannot befriend yourself")
	}
	unlock := s.locks.LockMany(actor, other) // deduped + ordered shards (ULID-order equivalent)
	defer unlock()
	a, err := s.load(actor)
	if err != nil {
		return err
	}
	b, err := s.load(other)
	if err != nil {
		return err
	}
	if err := fn(&a, &b); err != nil {
		return err
	}
	now := time.Now()
	a.UpdatedAt, b.UpdatedAt = now, now
	// Write in ULID order so partial failure is deterministic.
	first, firstDoc, second, secondDoc := actor, a, other, b
	if other < actor {
		first, firstDoc, second, secondDoc = other, b, actor, a
	}
	if err := s.store.Put(ColFriends, first, firstDoc); err != nil {
		return err
	}
	return s.store.Put(ColFriends, second, secondDoc)
}

// Request sends a friend request from actor to target. Idempotent: an already
// pending request or existing friendship is a no-op success.
func (s *Service) Request(ctx context.Context, actor, target string) error {
	return s.withBoth(actor, target, func(a, b *Doc) error {
		if _, blocked := b.Blocked[actor]; blocked {
			return httpx.Forbidden("cannot send a friend request to this account")
		}
		if _, blocked := a.Blocked[target]; blocked {
			return httpx.Forbidden("unblock this account first")
		}
		if _, already := a.Friends[target]; already {
			return nil // idempotent
		}
		// Crossing requests auto-accept.
		if _, crossing := a.Incoming[target]; crossing {
			now := Edge{At: time.Now()}
			delete(a.Incoming, target)
			delete(b.Outgoing, actor)
			a.Friends[target] = now
			b.Friends[actor] = now
			return nil
		}
		e := Edge{At: time.Now()}
		a.Outgoing[target] = e
		b.Incoming[actor] = e
		return nil
	})
}

// ForceFriend makes a and b friends WITHOUT a request/accept round trip
// (GH#499). owner 2026-08-21:「**管理員是強制雙向 不必請求**」.
//
// ⛔ It is deliberately NOT Request(): Request sends a pending edge that the
// other side has to accept, so running it for every account would have turned
// 198 accounts into 198 pending requests nobody would ever press — the feature
// would look done and be zero. This writes BOTH Friends edges in the one
// two-sided transaction withBoth already provides, so「只有一邊看得到對方」
// is not a reachable state.
//
// Idempotent: already-friends is a no-op that reports changed=false, so a
// backfill can run on every boot without rewriting 198 files.
//
// Any pending request between the two (in either direction) is CONSUMED rather
// than left behind — a stale「等待對方接受」row pointing at somebody who is
// already your friend is the same lie in a different table.
//
// overrideBlocked decides the one case owner did not rule on: b has BLOCKED a
// (or vice versa). Blocking is an explicit player action, so the shipped
// default respects it and reports changed=false; the admin knob flips it for a
// deploy that wants「強制」to mean strictly forced.
func (s *Service) ForceFriend(ctx context.Context, a, b string, overrideBlocked bool) (bool, error) {
	changed := false
	err := s.withBoth(a, b, func(x, y *Doc) error {
		if _, ok := x.Friends[b]; ok {
			if _, ok := y.Friends[a]; ok {
				return nil // already both ways — nothing to write
			}
		}
		_, blockedByOther := y.Blocked[a]
		_, blockedByMe := x.Blocked[b]
		if (blockedByOther || blockedByMe) && !overrideBlocked {
			return nil
		}
		if overrideBlocked {
			delete(x.Blocked, b)
			delete(y.Blocked, a)
		}
		now := Edge{At: time.Now()}
		delete(x.Incoming, b)
		delete(x.Outgoing, b)
		delete(y.Incoming, a)
		delete(y.Outgoing, a)
		x.Friends[b] = now
		y.Friends[a] = now
		changed = true
		return nil
	})
	return changed, err
}

// Accept accepts a pending request that was sent BY requester TO actor.
func (s *Service) Accept(ctx context.Context, actor, requester string) error {
	return s.withBoth(actor, requester, func(a, b *Doc) error {
		if _, ok := a.Incoming[requester]; !ok {
			return httpx.NotFound("no pending request from this account")
		}
		now := Edge{At: time.Now()}
		delete(a.Incoming, requester)
		delete(b.Outgoing, actor)
		a.Friends[requester] = now
		b.Friends[actor] = now
		return nil
	})
}

// Decline removes a pending request addressed to actor.
func (s *Service) Decline(ctx context.Context, actor, requester string) error {
	return s.withBoth(actor, requester, func(a, b *Doc) error {
		if _, ok := a.Incoming[requester]; !ok {
			return httpx.NotFound("no pending request from this account")
		}
		delete(a.Incoming, requester)
		delete(b.Outgoing, actor)
		return nil
	})
}

// Remove deletes a friendship from both sides.
func (s *Service) Remove(ctx context.Context, actor, other string) error {
	return s.withBoth(actor, other, func(a, b *Doc) error {
		if _, ok := a.Friends[other]; !ok {
			return httpx.NotFound("not friends with this account")
		}
		delete(a.Friends, other)
		delete(b.Friends, actor)
		return nil
	})
}

// Block blocks other: removes any friendship/pending requests and prevents
// new requests from other.
func (s *Service) Block(ctx context.Context, actor, other string) error {
	return s.withBoth(actor, other, func(a, b *Doc) error {
		delete(a.Friends, other)
		delete(b.Friends, actor)
		delete(a.Incoming, other)
		delete(b.Outgoing, actor)
		delete(a.Outgoing, other)
		delete(b.Incoming, actor)
		a.Blocked[other] = Edge{At: time.Now()}
		return nil
	})
}

// Get returns the social doc for one account (empty doc when absent).
func (s *Service) Get(ctx context.Context, accountID string) (Doc, error) {
	unlock := s.locks.Lock(accountID)
	defer unlock()
	return s.load(accountID)
}

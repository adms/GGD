// Package redisx wraps go-redis/v9 with the platform's hot-layer helpers:
// sessions (opaque refresh tokens), presence, rooms, invites, leaderboard
// ZSETs, rate-limit counters and pub/sub. Everything here is rebuildable from
// the JSON truth — Redis is never authoritative.
package redisx

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

// Client wraps a go-redis client with platform key conventions.
type Client struct {
	R *redis.Client
}

// New connects a client (lazily; commands fail if Redis is down).
func New(addr, password string) *Client {
	return &Client{R: redis.NewClient(&redis.Options{Addr: addr, Password: password})}
}

// Close releases the underlying connection pool.
func (c *Client) Close() error { return c.R.Close() }

// ---- key builders -----------------------------------------------------------

func KeyIdxUsername(u string) string            { return "idx:username:" + u }
func KeyIdxEmail(e string) string               { return "idx:email:" + e }
func KeyRefresh(tok string) string              { return "refresh:" + tok }
func KeyRefreshUsed(tok string) string          { return "refresh:used:" + tok }
func KeyRefreshSet(aid string) string           { return "refresh:acct:" + aid }
func KeyPresence(aid string) string             { return "presence:" + aid }
func KeyRoom(rid string) string                 { return "room:" + rid }
func KeyRoomMembers(rid string) string          { return "room:" + rid + ":members" }
func KeyRoomReady(rid string) string            { return "room:" + rid + ":ready" }
func KeyRoomChampions(rid string) string        { return "room:" + rid + ":champions" }
func KeyRoomLocal(rid string) string            { return "room:" + rid + ":local" }

// KeyRoomSide holds each member's 陣營意向 (GH#655): accountId -> "ally"|"enemy".
// Written only by AcceptInvite, so a member who walked in from the room list
// simply has no entry and is packed exactly as they were before that ticket.
func KeyRoomSide(rid string) string { return "room:" + rid + ":side" }
func KeyWallet(aid string) string               { return "wallet:" + aid }
func KeyRoomChat(rid string) string             { return "room:" + rid + ":chat" }
func KeyRoomsOpen() string                      { return "rooms:open" }
func KeyInvite(tok string) string               { return "invite:" + tok }
func KeyLeaderboard(season, mode string) string { return "lb:" + season + ":" + mode }
func KeyRate(scope, key string) string          { return "rl:" + scope + ":" + key }
func KeyMatchDone(mid string) string            { return "match:result:done:" + mid }
func KeyMatchPending(mid string) string         { return "match:pending:" + mid }
func KeyMatchesPending() string                 { return "matches:pending" }

// KeySeenGate is the #246 last-seen COALESCING GATE: a SetNX marker with a
// one-minute TTL that lets exactly one authenticated request per account per
// window perform the durable LastSeenAt write.
//
// It is a throttle, not state. Losing it (a Redis flush) costs at most one
// extra account-file write; the truth stays in data/accounts/<id>.json.
func KeySeenGate(aid string) string { return "seen:gate:" + aid }

// KeyBootstrapOwner is the short-lived MUTEX that serialises simultaneous
// first-owner registrations: a SETNX with a TTL, released as soon as the
// registration finishes either way.
//
// It is deliberately NOT the gate. Whether a deploy may still mint an owner is
// decided from the account files on disk ("does any account carry the admin
// role?"), because Redis is a rebuildable cache: a permanent claim here would
// be lost by a flush and outlive a crash, so it could both hand out a second
// ownership and block the first one forever. See internal/auth/bootstrap.go.
func KeyBootstrapOwner() string { return "bootstrap:owner" }

func ChanPresence() string        { return "chan:presence" }
func ChanLobby(aid string) string { return "chan:lobby:" + aid }
func ChanRoom(rid string) string  { return "chan:room:" + rid }

// ---- generic helpers --------------------------------------------------------

// SetNX sets key=val with ttl only if absent; reports whether it was set.
func (c *Client) SetNX(ctx context.Context, key, val string, ttl time.Duration) (bool, error) {
	return c.R.SetNX(ctx, key, val, ttl).Result()
}

// GetDel atomically reads and deletes a key. Returns ("", nil) when missing.
func (c *Client) GetDel(ctx context.Context, key string) (string, error) {
	v, err := c.R.GetDel(ctx, key).Result()
	if errors.Is(err, redis.Nil) {
		return "", nil
	}
	return v, err
}

// Exists reports whether key is present. It is the read-only companion to
// SetNX: a caller that has already "claimed" a one-shot marker with SetNX can
// ask, without side effect, whether it was claimed — which is exactly what a
// prefetch-safe GET needs (see internal/approvelink: the confirm page must be
// able to say "already used" without consuming the token).
func (c *Client) Exists(ctx context.Context, key string) (bool, error) {
	n, err := c.R.Exists(ctx, key).Result()
	return n > 0, err
}

// PublishJSON marshals v and publishes it on channel.
func (c *Client) PublishJSON(ctx context.Context, channel string, v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return c.R.Publish(ctx, channel, data).Err()
}

// RateAllow increments the counter rl:<scope>:<key> inside a fixed window and
// reports whether the caller is still within limit.
func (c *Client) RateAllow(ctx context.Context, scope, key string, limit int64, window time.Duration) (bool, error) {
	k := KeyRate(scope, key)
	n, err := c.R.Incr(ctx, k).Result()
	if err != nil {
		return false, err
	}
	if n == 1 {
		if err := c.R.Expire(ctx, k, window).Err(); err != nil {
			return false, err
		}
	}
	return n <= limit, nil
}

// ---- sessions (opaque refresh tokens) ----------------------------------------

// ErrRefreshReuse signals a rotated (already-used) refresh token was replayed;
// the whole account session family gets revoked by RotateRefresh.
var ErrRefreshReuse = errors.New("redisx: refresh token reuse detected")

// ErrRefreshUnknown signals an unknown/expired refresh token.
var ErrRefreshUnknown = errors.New("redisx: unknown refresh token")

// StoreRefresh registers a fresh refresh token for the account.
func (c *Client) StoreRefresh(ctx context.Context, token, accountID string, ttl time.Duration) error {
	pipe := c.R.TxPipeline()
	pipe.Set(ctx, KeyRefresh(token), accountID, ttl)
	pipe.SAdd(ctx, KeyRefreshSet(accountID), token)
	pipe.Expire(ctx, KeyRefreshSet(accountID), ttl)
	_, err := pipe.Exec(ctx)
	return err
}

// ConsumeRefresh redeems a refresh token for rotation. On success the token is
// atomically retired (marked used) and the owning accountID is returned. If
// the token was already used, every live token of that account is revoked and
// ErrRefreshReuse is returned.
func (c *Client) ConsumeRefresh(ctx context.Context, token string, usedTTL time.Duration) (string, error) {
	aid, err := c.GetDel(ctx, KeyRefresh(token))
	if err != nil {
		return "", err
	}
	if aid != "" {
		pipe := c.R.TxPipeline()
		pipe.Set(ctx, KeyRefreshUsed(token), aid, usedTTL)
		pipe.SRem(ctx, KeyRefreshSet(aid), token)
		_, err := pipe.Exec(ctx)
		return aid, err
	}
	// Not live: was it already used? That's a replay — revoke the family.
	usedBy, err := c.R.Get(ctx, KeyRefreshUsed(token)).Result()
	if errors.Is(err, redis.Nil) {
		return "", ErrRefreshUnknown
	}
	if err != nil {
		return "", err
	}
	if err := c.RevokeAllRefresh(ctx, usedBy); err != nil {
		return "", err
	}
	return "", ErrRefreshReuse
}

// RevokeRefresh deletes one refresh token.
func (c *Client) RevokeRefresh(ctx context.Context, token string) error {
	aid, err := c.GetDel(ctx, KeyRefresh(token))
	if err != nil || aid == "" {
		return err
	}
	return c.R.SRem(ctx, KeyRefreshSet(aid), token).Err()
}

// RevokeAllRefresh deletes every live refresh token of an account.
func (c *Client) RevokeAllRefresh(ctx context.Context, accountID string) error {
	toks, err := c.R.SMembers(ctx, KeyRefreshSet(accountID)).Result()
	if err != nil {
		return err
	}
	pipe := c.R.TxPipeline()
	for _, t := range toks {
		pipe.Del(ctx, KeyRefresh(t))
	}
	pipe.Del(ctx, KeyRefreshSet(accountID))
	_, err = pipe.Exec(ctx)
	return err
}

// CountLiveRefresh returns how many refresh tokens the account still has.
// Used to REPORT a revocation ("3 sessions were killed") rather than to decide
// anything — the revocation itself is unconditional.
func (c *Client) CountLiveRefresh(ctx context.Context, accountID string) (int64, error) {
	return c.R.SCard(ctx, KeyRefreshSet(accountID)).Result()
}

// HasLiveRefresh reports whether the account still has live refresh tokens.
func (c *Client) HasLiveRefresh(ctx context.Context, accountID string) (bool, error) {
	n, err := c.CountLiveRefresh(ctx, accountID)
	return n > 0, err
}

// ---- presence -----------------------------------------------------------------

// PresenceDelta is published on chan:presence whenever presence changes.
type PresenceDelta struct {
	AccountID string `json:"accountId"`
	State     string `json:"state"` // online | in-lobby | in-match | offline
}

// SetPresence writes presence:<id> with a heartbeat TTL and publishes a delta.
func (c *Client) SetPresence(ctx context.Context, accountID, state string, ttl time.Duration) error {
	if err := c.R.Set(ctx, KeyPresence(accountID), state, ttl).Err(); err != nil {
		return err
	}
	return c.PublishJSON(ctx, ChanPresence(), PresenceDelta{AccountID: accountID, State: state})
}

// HeartbeatPresence refreshes the TTL without republishing.
func (c *Client) HeartbeatPresence(ctx context.Context, accountID string, ttl time.Duration) error {
	return c.R.Expire(ctx, KeyPresence(accountID), ttl).Err()
}

// GetPresence returns the current state, or "offline" when absent/expired.
func (c *Client) GetPresence(ctx context.Context, accountID string) (string, error) {
	v, err := c.R.Get(ctx, KeyPresence(accountID)).Result()
	if errors.Is(err, redis.Nil) {
		return "offline", nil
	}
	return v, err
}

// GetPresenceMany returns the state of every listed account IN ORDER, in ONE
// round trip (MGET). A missing/expired key maps to "offline", exactly as
// GetPresence does for a single id.
//
// It exists because the lobby's 線上玩家 list asks the same question about
// EVERY account on the deploy, on a poll: doing that with GetPresence is one
// round trip per account per poll per viewer, which is O(accounts × viewers)
// network hops for a list that fits in one command. The per-id call is kept for
// the callers that genuinely want one id (friends list, admin players page).
//
// A transport failure is returned, NOT swallowed into "everybody offline" — a
// lobby that silently shows nobody online while everybody is online is the
// fail-open-in-silence shape CLAUDE.md calls out. The caller decides.
func (c *Client) GetPresenceMany(ctx context.Context, accountIDs []string) ([]string, error) {
	out := make([]string, len(accountIDs))
	if len(accountIDs) == 0 {
		return out, nil
	}
	keys := make([]string, len(accountIDs))
	for i, id := range accountIDs {
		keys[i] = KeyPresence(id)
	}
	vals, err := c.R.MGet(ctx, keys...).Result()
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i] = "offline"
		if i < len(vals) {
			if s, ok := vals[i].(string); ok && s != "" {
				out[i] = s
			}
		}
	}
	return out, nil
}

// ClearPresence deletes the key and publishes an offline delta.
func (c *Client) ClearPresence(ctx context.Context, accountID string) error {
	if err := c.R.Del(ctx, KeyPresence(accountID)).Err(); err != nil {
		return err
	}
	return c.PublishJSON(ctx, ChanPresence(), PresenceDelta{AccountID: accountID, State: "offline"})
}

// ---- leaderboard ----------------------------------------------------------------

// LBAdd upserts an absolute MMR score.
func (c *Client) LBAdd(ctx context.Context, season, mode, accountID string, mmr float64) error {
	return c.R.ZAdd(ctx, KeyLeaderboard(season, mode), redis.Z{Score: mmr, Member: accountID}).Err()
}

// LBEntry is one member+score of a leaderboard ZSET.
type LBEntry struct {
	AccountID string
	MMR       int
}

// LBRange returns members by descending score in [start,stop] (inclusive
// zero-based rank window).
func (c *Client) LBRange(ctx context.Context, season, mode string, start, stop int64) ([]LBEntry, error) {
	zs, err := c.R.ZRevRangeWithScores(ctx, KeyLeaderboard(season, mode), start, stop).Result()
	if err != nil {
		return nil, err
	}
	out := make([]LBEntry, 0, len(zs))
	for _, z := range zs {
		out = append(out, LBEntry{AccountID: z.Member.(string), MMR: int(z.Score)})
	}
	return out, nil
}

// LBRank returns the zero-based descending rank, MMR and presence of a member.
func (c *Client) LBRank(ctx context.Context, season, mode, accountID string) (rank int64, mmr int, found bool, err error) {
	rank, err = c.R.ZRevRank(ctx, KeyLeaderboard(season, mode), accountID).Result()
	if errors.Is(err, redis.Nil) {
		return 0, 0, false, nil
	}
	if err != nil {
		return 0, 0, false, err
	}
	score, err := c.R.ZScore(ctx, KeyLeaderboard(season, mode), accountID).Result()
	if err != nil {
		return 0, 0, false, err
	}
	return rank, int(score), true, nil
}

// LBCard returns the ZSET cardinality.
func (c *Client) LBCard(ctx context.Context, season, mode string) (int64, error) {
	return c.R.ZCard(ctx, KeyLeaderboard(season, mode)).Result()
}

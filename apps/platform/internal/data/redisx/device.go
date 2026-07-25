package redisx

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

// Device-authorization grant (RFC 8628 adapted for QR + a trusted phone,
// #197/#199). Two keys per grant plus the shared rate limiter:
//
//	devauth:user:<userCode>   -> "<deviceCode>"   public→secret lookup, the QR ticket
//	devauth:code:<deviceCode> -> JSON state       the state machine, handheld-only secret
//
// Both carry the SAME short TTL and are written with SetNX so a half-written
// grant can never exist. The secret deviceCode is consumed with the same atomic
// GetDel primitive ConsumeRefresh uses, so exactly one poll can ever redeem an
// approval — see the auth service for the state machine that drives these.

// KeyDeviceUser maps the PUBLIC user-code (the only thing the QR carries) to the
// secret device-code. It is a claim ticket, not a credential: knowing it lets a
// phone ASK to approve a device, nothing more.
func KeyDeviceUser(userCode string) string { return "devauth:user:" + userCode }

// KeyDeviceCode maps the SECRET device-code (handheld-only, never displayed) to
// the grant's JSON state. This is the value the handheld polls for and the one
// GetDel single-uses on redemption.
func KeyDeviceCode(deviceCode string) string { return "devauth:code:" + deviceCode }

// ErrDeviceUnknown is returned by ApproveDevice when the user-code resolves to
// nothing, or to a grant that is no longer PENDING (already approved, denied or
// consumed). The two fail identically on purpose: an approver must not be able
// to tell a live-but-already-decided code from a never-existed one.
var ErrDeviceUnknown = errors.New("redisx: unknown or expired device code")

// StartDevice reserves both grant keys atomically with one shared TTL. Either
// SetNX losing (an astronomically unlikely code collision) rolls the other back
// and reports ok=false, so the caller can regenerate rather than leak a
// dangling half-grant. Mirrors the two-SETNX username/email reservation in
// account registration.
func (c *Client) StartDevice(ctx context.Context, userCode, deviceCode, stateJSON string, ttl time.Duration) (bool, error) {
	okUser, err := c.SetNX(ctx, KeyDeviceUser(userCode), deviceCode, ttl)
	if err != nil || !okUser {
		return false, err
	}
	okCode, err := c.SetNX(ctx, KeyDeviceCode(deviceCode), stateJSON, ttl)
	if err != nil || !okCode {
		// Roll the user-code reservation back so the pair is all-or-nothing.
		c.R.Del(ctx, KeyDeviceUser(userCode))
		return false, err
	}
	return true, nil
}

// PollDevice reads the grant state WITHOUT consuming it. The pending/denied
// paths must be repeatable — a handheld polls every few seconds — so the read
// here is a plain GET; only the approved path consumes, and it does so with the
// atomic GetDel below so exactly one poll wins. Returns ("", nil) when the key
// is gone (expired or already consumed), which the caller reports as "expired".
func (c *Client) PollDevice(ctx context.Context, deviceCode string) (string, error) {
	v, err := c.R.Get(ctx, KeyDeviceCode(deviceCode)).Result()
	if errors.Is(err, redis.Nil) {
		return "", nil
	}
	return v, err
}

// ConsumeDevice atomically reads AND deletes the grant (single-use), and then
// clears the paired user-code lookup. Two concurrent polls of an approved grant
// race here: GetDel is atomic, so exactly one sees the JSON and the other sees
// "" → the caller turns that into "expired". Reuses the same GetDel primitive as
// ConsumeRefresh. userCode is taken from the state the caller already decoded,
// so the public ticket cannot outlive the secret it pointed at.
func (c *Client) ConsumeDevice(ctx context.Context, deviceCode, userCode string) (string, error) {
	raw, err := c.GetDel(ctx, KeyDeviceCode(deviceCode))
	if err != nil || raw == "" {
		return raw, err
	}
	if userCode != "" {
		c.R.Del(ctx, KeyDeviceUser(userCode))
	}
	return raw, nil
}

// ApproveDevice transitions a grant from pending → approved/denied, keyed by the
// public user-code, and stamps the approving accountID into the state. It is a
// WATCH/Tx compare-and-set: the rewrite lands ONLY if the current status is
// still "pending", so a second approve, a re-approve after consume, or an
// approve racing a deny all fail with ErrDeviceUnknown instead of clobbering a
// decided grant. The remaining TTL is preserved (Set with the read-back TTL) so
// approval cannot silently extend the grant's life.
func (c *Client) ApproveDevice(ctx context.Context, userCode, newStatus, accountID string) error {
	deviceCode, err := c.R.Get(ctx, KeyDeviceUser(userCode)).Result()
	if errors.Is(err, redis.Nil) {
		return ErrDeviceUnknown
	}
	if err != nil {
		return err
	}
	key := KeyDeviceCode(deviceCode)

	txf := func(tx *redis.Tx) error {
		raw, err := tx.Get(ctx, key).Result()
		if errors.Is(err, redis.Nil) {
			return ErrDeviceUnknown
		}
		if err != nil {
			return err
		}
		var st map[string]any
		if err := json.Unmarshal([]byte(raw), &st); err != nil {
			return err
		}
		if s, _ := st["status"].(string); s != "pending" {
			// Already approved / denied / (about to be) consumed — refuse.
			return ErrDeviceUnknown
		}
		ttl, err := tx.TTL(ctx, key).Result()
		if err != nil {
			return err
		}
		if ttl <= 0 {
			// No positive TTL left to preserve — treat as expired.
			return ErrDeviceUnknown
		}
		st["status"] = newStatus
		st["accountId"] = accountID
		next, err := json.Marshal(st)
		if err != nil {
			return err
		}
		_, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
			pipe.Set(ctx, key, next, ttl)
			return nil
		})
		return err
	}

	err = c.R.Watch(ctx, txf, key)
	if errors.Is(err, redis.TxFailedErr) {
		// The key changed under us (a concurrent approve won the race). From
		// this caller's perspective the grant is no longer pending → refuse.
		return ErrDeviceUnknown
	}
	return err
}

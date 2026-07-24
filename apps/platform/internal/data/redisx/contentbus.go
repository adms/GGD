package redisx

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"
)

// ---- the content-invalidation bus -------------------------------------------
//
// THE BUG THIS EXISTS TO KILL. The game-server reads three operator-editable
// documents out of the platform over plain HTTP — the curation whitelist, the
// combat-env multiplier table and the server-ops knobs. Each read is cached in
// the shard process, and until this bus existed the ONLY thing that ever
// dislodged a cached value was a match creation (a short TTL) or a restart. So
// the owner would change something in the 後台 console, alt-tab back into the
// game, and the running shard would keep serving the old document — silently,
// because every one of those fetches also fails SAFE. #48 made a FAILED fetch
// loud; this makes a SUCCESSFUL admin edit actually travel.
//
// WHAT TRAVELS IS A POINTER, NOT THE DOCUMENT. The payload carries the kind and
// a short content etag — never the document body. Two reasons, both load-
// bearing:
//
//   1. The platform's JSON file stays the single source of truth. A shard that
//      trusted a broadcast blob would have a SECOND ingestion path with its own
//      parsing, its own validation and its own bugs, and the two would drift.
//      Announcing "curation changed, it is now etag 9f2c…" forces the shard back
//      through the exact HTTP fetch it already uses, degradation reporting and
//      all.
//   2. Pub/sub is fire-and-forget. A dropped message must cost at most a
//      slightly-late refresh, never a wrong document: a subscriber that missed
//      an announcement still re-reads the authoritative doc on its next TTL
//      expiry, and one that receives a duplicate just re-fetches. Idempotent
//      either way.
//
// REDIS IS NOT THE TRUTH AND MUST NOT BECOME IT. Publishing is best-effort:
// every caller here already wrote the JSON file before it got this far, so a
// publish failure is logged by the caller and the system degrades to exactly
// the pre-bus behaviour (TTL-driven pickup). Nothing in the write path may fail
// because the bus is down.

// ChanContent is the single channel every content-invalidation announcement is
// published on. ONE channel, not one per kind: a subscriber wants all three
// documents, the volume is a handful of messages per operator session, and a
// single subscription means a single reconnect path in the shard.
func ChanContent() string { return "chan:content" }

// Content kinds carried in ContentInvalidation.Kind. These strings are a WIRE
// CONTRACT with apps/game-server/src/config/contentBus.ts — the TypeScript
// side switches on exactly these values, so they are frozen.
const (
	ContentKindCuration  = "curation"
	ContentKindCombatEnv = "combat-env"
	ContentKindServerOps = "server-ops"
)

// ContentInvalidation announces that one operator-editable document changed.
//
// Deliberately tiny. Kind tells the subscriber WHICH fetch to re-run; Version
// is an opaque etag it can echo back on /healthz so "did my change land on the
// shard?" is answerable by comparing two strings instead of guessing; UpdatedAt
// is for humans reading a log line.
type ContentInvalidation struct {
	Kind      string    `json:"kind"`
	Version   string    `json:"version"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ContentETag is a short, stable fingerprint of a marshalled document.
//
// It is NOT a monotonic counter on purpose. A counter would have to live
// somewhere durable, and the only durable thing here is the JSON file — adding
// a counter field to it would mean a schema migration and a value that a
// hand-edit or a restore-from-backup silently rewinds. A content hash needs no
// storage, survives a restore, and answers the only question anyone asks of it:
// "is what the shard fetched the same bytes the platform last wrote?"
//
// 12 hex chars (48 bits) is plenty: this is a change DETECTOR for a document a
// human edits a few times a day, not a security primitive.
func ContentETag(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])[:12]
}

// ContentETagOf marshals v and fingerprints it. Returns "" if v cannot be
// marshalled — callers treat that as "no etag", never as an error worth
// failing a write over.
func ContentETagOf(v any) string {
	data, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return ContentETag(data)
}

// PublishContentInvalidation announces a change on ChanContent().
//
// Best-effort by contract: the caller has ALREADY committed the durable JSON
// write, so an error here means "the shards will pick this up on their next TTL
// instead of instantly", not "the edit was lost". Callers log and continue.
func (c *Client) PublishContentInvalidation(ctx context.Context, kind, version string, updatedAt time.Time) error {
	return c.PublishJSON(ctx, ChanContent(), ContentInvalidation{
		Kind:      kind,
		Version:   version,
		UpdatedAt: updatedAt.UTC(),
	})
}

// Package gamelink is the Go⇄Colyseus seam: the outbound HMAC-signed seat
// reservation request, the inbound HMAC-verified result callback, match
// settlement (WAL → JSON truth → history → MMR → leaderboard → presence) and
// the stuck-match reaper.
package gamelink

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"time"
)

// Header names of the internal HMAC scheme (identical in both directions).
const (
	HeaderTimestamp = "X-Internal-Timestamp"
	HeaderAuth      = "X-Internal-Auth"
)

// Sign computes hex(HMAC_SHA256(secret, ts + "." + body)).
func Sign(secret, ts string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts))
	mac.Write([]byte("."))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// Verify checks the signature (constant-time) and the timestamp skew guard.
func Verify(secret, ts, sig string, body []byte, now time.Time, maxSkew time.Duration) bool {
	if ts == "" || sig == "" {
		return false
	}
	sec, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return false
	}
	at := time.Unix(sec, 0)
	skew := now.Sub(at)
	if skew < 0 {
		skew = -skew
	}
	if skew > maxSkew {
		return false
	}
	expect := Sign(secret, ts, body)
	return hmac.Equal([]byte(expect), []byte(sig))
}

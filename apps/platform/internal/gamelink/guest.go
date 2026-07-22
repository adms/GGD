package gamelink

import (
	"strconv"
	"strings"
)

// Couch-play guest pseudo-ids: local players 2..4 on one member's machine get
// the seat accountId "{accountId}:p2".."{accountId}:p4". Guests have no
// account of their own — settlement (MMR, M COIN, history, presence) skips
// them; the game server just sees distinct accountIds and reserves a seat per
// entry.

// GuestID builds the pseudo account id of couch player n (2..4) of base.
func GuestID(base string, n int) string {
	return base + ":p" + strconv.Itoa(n)
}

// SplitGuestID returns (baseAccountID, playerIndex): playerIndex is 1 for the
// owner id itself and n for a ":pn" guest pseudo-id.
func SplitGuestID(id string) (string, int) {
	i := strings.LastIndex(id, ":p")
	if i <= 0 {
		return id, 1
	}
	n, err := strconv.Atoi(id[i+2:])
	if err != nil || n < 2 {
		return id, 1
	}
	return id[:i], n
}

// IsGuestID reports whether id is a ":pN" couch-guest pseudo-id (a legacy
// bare ":p" suffix also counts, matching older records).
func IsGuestID(id string) bool {
	if strings.HasSuffix(id, ":p") {
		return true
	}
	_, n := SplitGuestID(id)
	return n > 1
}

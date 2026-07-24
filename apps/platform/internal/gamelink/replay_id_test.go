package gamelink

import "testing"

// TestValidReplayID pins the bound on the ONE attacker-influenced component of
// the proxied game-server URL. url.PathEscape confines the id to a single path
// segment (it escapes "/", "?" and "#"), which is what makes the G704 SSRF
// finding a false positive — but PathEscape does NOT escape dots, so a bare ".."
// still addressed one segment upward on the game server's private /_internal
// API. The game side normalises that away; this keeps the platform's own input
// contract local and verifiable rather than borrowed from another service.
func TestValidReplayID(t *testing.T) {
	ok := []string{
		"rec-2026-07-24T12-00-00", "abc123", "a.b.c", "A_-.9", "x",
	}
	for _, id := range ok {
		if !validReplayID(id) {
			t.Errorf("validReplayID(%q) = false, want true", id)
		}
	}

	bad := []string{
		"",                       // empty
		"..",                     // one segment upward — PathEscape does NOT escape dots
		"../etc/passwd",          // classic traversal
		"a/../b",                 // traversal mid-id
		"foo/bar",                // separator
		"foo\\bar",               // windows separator
		"foo?x=1",                // query injection attempt
		"foo#frag",               // fragment
		"@evil.com",              // authority confusion attempt
		"http://evil.com/x",      // absolute URL
		"foo bar",                // space
		"foo\x00bar",             // NUL
		"ok\n",                   // trailing newline (Go's $ is \z, but be explicit)
		"日本語",                    // non-ASCII
		string(make([]byte, 97)), // over the 96-char cap
	}
	for _, id := range bad {
		if validReplayID(id) {
			t.Errorf("validReplayID(%q) = true, want false", id)
		}
	}
}

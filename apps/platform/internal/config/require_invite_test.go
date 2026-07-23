package config

import "testing"

// The invite gate's DEFAULT is the whole point of this function: a deploy that
// configures nothing must still be gated. Every case below that is not an
// explicit loopback bind, and every unset/garbage value of the env var, has to
// come out true.
func TestResolveRequireInviteDefaultsOn(t *testing.T) {
	cases := []struct {
		name, env, addr string
		want            bool
	}{
		// Unset env → derived from the LISTEN address.
		{"built-in wildcard default", "", ":8080", true},
		{"explicit wildcard", "", "0.0.0.0:8080", true},
		{"ipv6 wildcard", "", "[::]:8080", true},
		{"a real interface", "", "192.168.1.20:8080", true},
		{"a hostname", "", "ggd.example.com:8080", true},
		{"empty address", "", "", true},
		{"garbage address", "", "not an address", true},
		{"garbage env value is not an opt-out", "maybe", ":8080", true},

		// The ONE automatic off: an explicit loopback-only bind, which cannot
		// receive a packet from another machine. This is .claude/launch.json's
		// local development configuration.
		{"loopback v4", "", "127.0.0.1:8080", false},
		{"loopback v6", "", "[::1]:8080", false},
		{"localhost", "", "localhost:8080", false},
		{"loopback alias", "", "127.0.0.53:8080", false},

		// Explicit env wins in both directions — including turning the gate ON
		// for the nginx-in-front topology the address alone cannot see.
		{"explicit on over loopback", "1", "127.0.0.1:8080", true},
		{"explicit on, worded", "true", "127.0.0.1:8080", true},
		{"explicit off over a public bind", "0", "0.0.0.0:8080", false},
		{"explicit off, worded", "false", ":8080", false},
		{"explicit off, spaced/cased", "  OFF  ", ":8080", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := resolveRequireInvite(c.env, c.addr); got != c.want {
				t.Fatalf("resolveRequireInvite(%q, %q) = %v, want %v", c.env, c.addr, got, c.want)
			}
		})
	}
}

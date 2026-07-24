package config

import "testing"

// The approval gate's DEFAULT is the point of the function, exactly as it is
// for the invite gate: a deploy that configures nothing must still put new
// accounts in front of the owner. Every case that is not an explicit loopback
// bind, and every unset/garbage value of the env var, has to come out true.
//
// This table is deliberately the SAME table as TestResolveRequireInviteDefaultsOn.
// The two gates share one predicate (loopbackOnlyAddr), and the day someone
// "optimises" one of the resolvers into something subtly different, having the
// expectations written out twice is what turns that into a red test rather than
// a deploy where the invite gate is on and the approval gate quietly is not.
func TestResolveRequireApprovalDefaultsOn(t *testing.T) {
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
		// local development configuration — the owner must not have to approve
		// his own throwaway dev accounts.
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
			if got := resolveRequireApproval(c.env, c.addr); got != c.want {
				t.Fatalf("resolveRequireApproval(%q, %q) = %v, want %v", c.env, c.addr, got, c.want)
			}
		})
	}
}

// The two registration gates must resolve IDENTICALLY from the same inputs.
// They are separate switches an operator can set independently, but their
// DEFAULTS are one decision — "is this deploy networked?" — and a deploy that
// came up gated for invites but open for approval (or vice versa) would be a
// silent half-configuration nobody would notice until a stranger was in the
// lobby.
func TestBothRegistrationGatesShareOneDefault(t *testing.T) {
	addrs := []string{":8080", "0.0.0.0:8080", "[::]:8080", "192.168.1.20:8080",
		"ggd.example.com:8080", "", "garbage", "127.0.0.1:8080", "[::1]:8080", "localhost:8080"}
	for _, addr := range addrs {
		inv, appr := resolveRequireInvite("", addr), resolveRequireApproval("", addr)
		if inv != appr {
			t.Errorf("addr %q: invite gate = %v but approval gate = %v — the two defaults must agree", addr, inv, appr)
		}
	}
}

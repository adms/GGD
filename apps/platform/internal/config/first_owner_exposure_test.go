package config

import "testing"

// The first-owner claim window is the ONE place a no-code admin account is
// created. On a networked deploy with the invite gate on, leaving that window
// open (GGD_OWNER_BOOTSTRAP_TOKEN off) lets a stranger seize admin, so the
// platform must refuse to boot. On a loopback dev bind, or with the token on, it
// boots. This mirrors checkDeploySecrets' fail-closed-on-a-networked-bind rule.
func TestFirstOwnerExposureError(t *testing.T) {
	cases := []struct {
		name               string
		addr               string
		requireInvite      bool
		ownerTokenRequired bool
		wantErr            bool
	}{
		// The dangerous posture: networked + gated + no token.
		{"networked gated no token — wildcard", ":8080", true, false, true},
		{"networked gated no token — explicit iface", "192.168.1.20:8080", true, false, true},
		{"networked gated no token — hostname", "ggd.example.com:8080", true, false, true},
		{"networked gated no token — empty addr", "", true, false, true},
		{"networked gated no token — garbage addr", "not an address", true, false, true},

		// Any one of the three conditions absent → safe → boots.
		{"networked gated WITH token", ":8080", true, true, false},
		{"networked but gate OFF", ":8080", false, false, false},
		{"loopback gated no token — dev is fine", "127.0.0.1:8080", true, false, false},
		{"loopback v6 gated no token", "[::1]:8080", true, false, false},
		{"localhost gated no token", "localhost:8080", true, false, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := FirstOwnerExposureError(c.addr, c.requireInvite, c.ownerTokenRequired)
			if c.wantErr && err == nil {
				t.Fatalf("expected a boot-refusal error for addr=%q gate=%v token=%v", c.addr, c.requireInvite, c.ownerTokenRequired)
			}
			if !c.wantErr && err != nil {
				t.Fatalf("expected no error for addr=%q gate=%v token=%v, got %v", c.addr, c.requireInvite, c.ownerTokenRequired, err)
			}
		})
	}
}

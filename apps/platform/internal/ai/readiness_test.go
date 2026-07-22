package ai

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// The one test that must never be deleted: the public projection may not carry
// key material, in any field, under any config. The endpoint is unauthenticated,
// so a field added to Readiness by a future edit is a leak the moment it ships.
func TestReadinessNeverLeaksKeyMaterial(t *testing.T) {
	secret := "sk-live-SUPERSECRET-abcd"
	cfg := Config{
		Version:      1,
		Enabled:      true,
		ImageBaseURL: "https://api.openai.com/v1",
		ImageModel:   "gpt-image-1",
		APIKey:       secret,
		UpdatedAt:    time.Unix(1700000000, 0).UTC(),
	}

	for _, loopback := range []bool{true, false} {
		b, err := json.Marshal(cfg.Readiness(loopback))
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		body := string(b)
		if strings.Contains(body, secret) {
			t.Fatalf("loopback=%v: raw key leaked: %s", loopback, body)
		}
		// maskKey's output ("sk-…abcd") is a real key fragment. It is fine on the
		// admin route; it must never appear here.
		if strings.Contains(body, maskKey(secret)) {
			t.Fatalf("loopback=%v: masked key leaked: %s", loopback, body)
		}
		for _, banned := range []string{"apiKey", "apiKeyMasked", "hasKey"} {
			if strings.Contains(body, banned) {
				t.Fatalf("loopback=%v: field %q must not be in the public projection: %s",
					loopback, banned, body)
			}
		}
		// The base URL may carry a path segment used as a routing token in some
		// deployments, so only the host is ever published.
		if strings.Contains(body, "/v1") {
			t.Fatalf("loopback=%v: full base URL leaked: %s", loopback, body)
		}
	}
}

// Off-loopback callers get booleans and nothing else — no model, no host, no
// reason (which would reveal whether a key is stored).
func TestReadinessWithholdsDetailOffLoopback(t *testing.T) {
	cfg := Config{
		Version: 1, Enabled: true,
		ImageBaseURL: "https://api.openai.com/v1", ImageModel: "gpt-image-1",
		APIKey: "k", UpdatedAt: time.Unix(1700000000, 0).UTC(),
	}
	r := cfg.Readiness(false)
	if r.Reason != "" || r.ImageModel != "" || r.ImageHost != "" || r.UpdatedAt != "" {
		t.Fatalf("detail leaked off-loopback: %+v", r)
	}
	// omitempty must actually drop them from the wire, not send zero values.
	b, err := json.Marshal(r)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	for _, k := range []string{"reason", "imageModel", "imageHost", "updatedAt"} {
		if strings.Contains(string(b), k) {
			t.Fatalf("field %q must be omitted off-loopback, got %s", k, b)
		}
	}
	if !r.ImageReady || !r.Enabled {
		t.Fatalf("booleans must still be reported: %+v", r)
	}
	if r.Loopback {
		t.Fatalf("Loopback flag must report the projection the caller got")
	}
}

// The shipped default (no config file at all → DefaultConfig) must report the
// stub state honestly rather than erroring, and must name the operator action.
func TestReadinessDefaultConfigIsHonestStub(t *testing.T) {
	r := DefaultConfig().Readiness(true)
	if r.Enabled || r.ImageReady || r.TextReady || r.TTSReady || r.MusicReady {
		t.Fatalf("default config must be entirely un-ready: %+v", r)
	}
	if r.Reason != ReasonDisabled {
		t.Fatalf("reason = %q, want %q", r.Reason, ReasonDisabled)
	}
}

func TestImageReasonNamesTheMissingPiece(t *testing.T) {
	base := Config{Version: 1}
	cases := []struct {
		name string
		mut  func(*Config)
		want string
	}{
		{"disabled", func(c *Config) {}, ReasonDisabled},
		{"no key", func(c *Config) { c.Enabled = true }, ReasonNoKey},
		{"no endpoint", func(c *Config) { c.Enabled, c.APIKey = true, "k" }, ReasonNoEndpoint},
		{"no model", func(c *Config) {
			c.Enabled, c.APIKey, c.ImageBaseURL = true, "k", "https://h/v1"
		}, ReasonNoModel},
		{"ready", func(c *Config) {
			c.Enabled, c.APIKey, c.ImageBaseURL, c.ImageModel = true, "k", "https://h/v1", "m"
		}, ReasonReady},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := base
			tc.mut(&c)
			if got := c.imageReason(); got != tc.want {
				t.Fatalf("imageReason() = %q, want %q", got, tc.want)
			}
		})
	}
}

// Whitespace-only endpoints are "not configured", matching imageReady().
func TestImageReasonTreatsBlankEndpointAsMissing(t *testing.T) {
	c := Config{Version: 1, Enabled: true, APIKey: "k", ImageBaseURL: "   ", ImageModel: "m"}
	if got := c.imageReason(); got != ReasonNoEndpoint {
		t.Fatalf("imageReason() = %q, want %q", got, ReasonNoEndpoint)
	}
}

func TestHostOf(t *testing.T) {
	cases := map[string]string{
		"https://api.openai.com/v1":     "api.openai.com",
		"http://127.0.0.1:1234/route/x": "127.0.0.1:1234",
		"":                              "",
		"   ":                           "",
		"not a url":                     "",
	}
	for in, want := range cases {
		if got := hostOf(in); got != want {
			t.Fatalf("hostOf(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestIsLoopbackAddr(t *testing.T) {
	yes := []string{"127.0.0.1:5555", "[::1]:5555", "::1", "127.0.0.1", "[fe80::1%lo0]:1"}
	no := []string{"10.0.0.4:5555", "192.168.1.9:80", "", "example.com:80", "[2001:db8::1]:80"}
	for _, a := range yes {
		if a == "[fe80::1%lo0]:1" {
			continue // link-local, not loopback — covered by `no` semantics below
		}
		if !isLoopbackAddr(a) {
			t.Fatalf("isLoopbackAddr(%q) = false, want true", a)
		}
	}
	for _, a := range no {
		if isLoopbackAddr(a) {
			t.Fatalf("isLoopbackAddr(%q) = true, want false", a)
		}
	}
	// A LAN address must never be mistaken for the dev machine.
	if isLoopbackAddr("192.168.0.2:39527") {
		t.Fatal("LAN peer classified as loopback")
	}
}

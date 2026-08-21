package ai_test

// F-08 / GH#86 —— a provider does not get to choose where we go, or who gets
// the key.
//
// The load-bearing line under test is guardProviderURL, called from getRaw /
// fetchAudioBytes / fetchImageBytes. It is exercised HERE THROUGH THE PUBLIC
// API (GenerateMusic), not by calling the unexported function, because the
// defect this guards was never "the check is wrong" — it was "there is no check
// on the path that actually runs" (失敗形態 ⑤). Delete the guard call from
// getRaw and the first subtest goes red on a real, recorded request to the
// metadata address carrying the API key.
//
// Everything is addressed with the RFC 5737 documentation ranges (203.0.113.0/24
// = the "provider", 198.51.100.0/24 = its "CDN") so the guard's zone check sees
// public IP LITERALS with no DNS lookup at all: the test is offline and fast,
// and it is a real public-provider configuration rather than the loopback one
// every other test here uses (loopback is exempt by design — a self-hosted
// provider on the LAN is allowed to hand back LAN URLs).

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/ai"
)

// routeAll sends every outbound request to one fake server while leaving the
// request URL (the thing the guard inspects) untouched.
type routeAll struct{ addr string }

func (r routeAll) RoundTrip(req *http.Request) (*http.Response, error) {
	c := req.Clone(req.Context())
	c.URL.Scheme = "http"
	c.URL.Host = r.addr
	return http.DefaultTransport.RoundTrip(c)
}

func TestMusicProviderCannotRedirectUsInward(t *testing.T) {
	fakeMP3 := []byte("ID3fake-track-bytes")

	// pollTarget is what the fake provider puts in `urls.get`; the subtests swap
	// it. hits records every path the fake server was asked for, with the auth
	// header that arrived — that is where a leaked key would show up.
	var pollTarget string
	hits := map[string]string{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits[r.URL.Path] = r.Header.Get("Authorization")
		switch {
		case strings.HasSuffix(r.URL.Path, "/predictions"):
			_, _ = w.Write([]byte(`{"id":"pred-1","status":"starting","urls":{"get":"` + pollTarget + `"}}`))
		case strings.Contains(r.URL.Path, "/predictions/pred-1"):
			_, _ = w.Write([]byte(`{"status":"succeeded","output":"http://198.51.100.7/files/track.mp3"}`))
		case strings.HasSuffix(r.URL.Path, "/files/track.mp3"):
			_, _ = w.Write(fakeMP3)
		default:
			http.Error(w, "not found", http.StatusNotFound)
		}
	}))
	t.Cleanup(srv.Close)

	newConfigured := func(t *testing.T) *ai.Service {
		t.Helper()
		svc, _, _ := newSvc(t)
		svc.SetMusicPollInterval(time.Millisecond)
		svc.SetHTTPClient(&http.Client{Transport: routeAll{addr: srv.Listener.Addr().String()}})
		_, err := svc.SaveConfig(ai.Update{
			Enabled:      ptr(true),
			MusicBaseURL: ptr("http://203.0.113.10/replicate"),
			MusicModel:   ptr("stability-ai/stable-audio:abc"),
			APIKey:       ptr(testKey),
		})
		require.NoError(t, err)
		return svc
	}
	gen := func(svc *ai.Service, acct string) (ai.MusicResult, error) {
		return svc.GenerateMusic(context.Background(), acct, ai.MusicRequest{
			Prompt: "arena combat theme", DurationSec: 30, Instrumental: true,
		})
	}

	t.Run("a poll URL pointing at cloud metadata is refused, key never sent", func(t *testing.T) {
		pollTarget = "http://169.254.169.254/latest/meta-data/iam/security-credentials/"
		clear(hits)
		_, err := gen(newConfigured(t), "acct-meta")
		require.Error(t, err, "following the provider inward must fail the generation")
		assert.NotContains(t, err.Error(), testKey)
		_, reached := hits["/latest/meta-data/iam/security-credentials/"]
		assert.False(t, reached, "the metadata endpoint must never be requested at all")
	})

	t.Run("a poll URL on somebody else's domain is refused before the key moves", func(t *testing.T) {
		pollTarget = "http://attacker.example.net/collect"
		clear(hits)
		_, err := gen(newConfigured(t), "acct-evil")
		require.Error(t, err)
		_, reached := hits["/collect"]
		assert.False(t, reached, "the API key must not follow the provider off its own domain")
	})

	t.Run("the ordinary flow still works: same-domain poll, different-host CDN", func(t *testing.T) {
		pollTarget = "http://203.0.113.10/replicate/predictions/pred-1"
		clear(hits)
		res, err := gen(newConfigured(t), "acct-ok")
		require.NoError(t, err)
		assert.Equal(t, fakeMP3, res.Audio)
		assert.Equal(t, "Bearer "+testKey, hits["/replicate/predictions/pred-1"],
			"the key still rides the poll on the provider's own domain")
		assert.Empty(t, hits["/files/track.mp3"],
			"and still never reaches the delivery host, which is a different host on purpose")
	})
}

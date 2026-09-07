package gamelink

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type replayBudgetTransport func(*http.Request) (*http.Response, error)

func (f replayBudgetTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestReplayBudgetCoversColdRosterWithoutChangingOtherRPCs(t *testing.T) {
	for _, callerLimit := range []time.Duration{0, 2 * time.Second} {
		ctx := context.Background()
		cancel := func() {}
		if callerLimit > 0 {
			ctx, cancel = context.WithTimeout(ctx, callerLimit)
		}
		client := &http.Client{Timeout: 10 * time.Second, Transport: replayBudgetTransport(func(r *http.Request) (*http.Response, error) {
			deadline, ok := r.Context().Deadline()
			if !ok {
				t.Fatal("replay HTTP must remain bounded")
			}
			left := time.Until(deadline)
			if callerLimit == 0 && (left < 80*time.Second || left > 90*time.Second) {
				t.Fatalf("cold roster has an 80-second download budget, got %v", left)
			}
			if callerLimit > 0 && left > callerLimit {
				t.Fatalf("replay extended its caller's deadline: %v", left)
			}
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"compatible":true}`)), Header: make(http.Header)}, nil
		})}
		svc := &Service{http: client, gameAddr: "http://game.invalid", now: time.Now}
		_, err := svc.GetReplay(ctx, "recorded-match")
		cancel()
		if err != nil {
			t.Fatal(err)
		}
		if client.Timeout != 10*time.Second {
			t.Fatal("replay changed the shared client's timeout")
		}
	}
}

package auth

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
)

// panicNotifier signals it was called, then panics — the worst case a broken
// #209 Slack notifier could produce.
type panicNotifier struct{ called chan struct{} }

func (p *panicNotifier) NotifyPending(a account.Account) {
	close(p.called)
	panic("notifier boom: a bad webhook, a nil map, anything")
}

// TestNotifyPendingNeverBreaksRegistration proves the fire-and-forget contract:
// notifyPending must (1) run the notifier, (2) recover a panic so it can never
// crash the caller, and (3) return without blocking. This is the unit-level
// guarantee behind "a Slack failure must NOT break registration" — Register
// calls exactly this helper on the pending path.
func TestNotifyPendingNeverBreaksRegistration(t *testing.T) {
	n := &panicNotifier{called: make(chan struct{})}
	s := &Service{}
	s.SetPendingNotifier(n)

	// If notifyPending ran the notifier inline, this panic would crash the test.
	// It runs it on a goroutine with a recover, so this returns cleanly.
	s.notifyPending(account.Account{ID: "acct-1", Username: "cousin", Status: account.StatusPending})

	select {
	case <-n.called:
		// The notifier ran (and panicked); the recover in notifyPending swallowed
		// it. Give that goroutine a moment to finish its deferred recover so the
		// race detector sees a clean shutdown.
		time.Sleep(20 * time.Millisecond)
	case <-time.After(2 * time.Second):
		t.Fatal("the notifier was never invoked")
	}
}

// TestNotifyPendingNoNotifierIsNoop proves the default (no notifier wired, which
// is every existing test and the dev/CI default) does nothing and cannot panic.
func TestNotifyPendingNoNotifierIsNoop(t *testing.T) {
	s := &Service{} // no notifier
	require.NotPanics(t, func() {
		s.notifyPending(account.Account{ID: "acct-1", Status: account.StatusPending})
	})
}

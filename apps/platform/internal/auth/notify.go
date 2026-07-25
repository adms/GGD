package auth

import (
	"log/slog"

	"github.com/ggd/platform/internal/account"
)

// notifyPending hands a freshly-pending account to the injected notifier (#209)
// WITHOUT ever letting it affect the registration that already succeeded.
//
// Three deliberate properties:
//
//   - It is a NO-OP when no notifier is wired (the dev/CI default and every
//     existing test), so nothing new runs unless the composition root asked for
//     it.
//   - It runs the notifier on ITS OWN goroutine. The account file has already
//     landed by the time we get here; the caller is about to return success, and
//     an out-of-band alert (an HTTP POST to Slack) must not add its latency to
//     the registration response nor hold the request's detached context open.
//   - It RECOVERS from a panic. "A Slack failure must not break registration" is
//     the whole point of the fire-and-forget design, and a nil-map deref or a
//     bad template in a notifier implementation must degrade to a logged error,
//     never to a crashed registration.
func (s *Service) notifyPending(a account.Account) {
	if s.notifier == nil {
		return
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("auth: pending-notifier panicked; the registration was unaffected",
					"recover", r, "accountId", a.ID)
			}
		}()
		s.notifier.NotifyPending(a)
	}()
}

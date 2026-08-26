package httpx

import (
	"net/http"
	"time"
)

// ClearDeadlines removes the http.Server-wide Read/Write deadlines from ONE
// request, for the handlers whose work legitimately outlives them.
//
// WHY IT EXISTS. #724/F-09 asks the platform's http.Server for the four
// timeouts it was missing. Server-wide ReadTimeout/WriteTimeout are absolute:
// Go arms them on the underlying connection BEFORE the handler runs, and they
// survive a Hijack — so switching them on without this would sever the lobby
// WebSocket (hours) and cut a platform-archive upload/download (minutes) at the
// deadline, with no error a player or operator could act on. A security patch
// that logs people out is worse than the hole it closes.
//
// The exemption is per-route and explicit rather than "set the timeout high
// enough for the longest thing" — a number chosen to cover a WebSocket is not a
// timeout, it is an absence pretending to be one, and it would go on covering
// slowloris against every ordinary JSON route too.
//
// Deliberately best-effort: on a ResponseWriter that cannot control deadlines
// (a test recorder, a wrapped writer) there is nothing to clear and nothing to
// report, because the deadlines being cleared were never armed either.
func ClearDeadlines(w http.ResponseWriter) {
	rc := http.NewResponseController(w)
	_ = rc.SetReadDeadline(time.Time{})
	_ = rc.SetWriteDeadline(time.Time{})
}

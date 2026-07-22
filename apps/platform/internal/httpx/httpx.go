// Package httpx contains shared HTTP plumbing: JSON responses, the consistent
// error envelope {"error":{"code","message"}}, and common middleware.
package httpx

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
)

// E is a domain error that maps onto an HTTP status + stable error code.
type E struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Error implements the error interface.
func (e *E) Error() string { return e.Code + ": " + e.Message }

// Err builds a new *E.
func Err(status int, code, message string) *E {
	return &E{Status: status, Code: code, Message: message}
}

// Common error constructors.
func BadRequest(msg string) *E   { return Err(http.StatusBadRequest, "bad_request", msg) }
func Unauthorized(msg string) *E { return Err(http.StatusUnauthorized, "unauthorized", msg) }
func Forbidden(msg string) *E    { return Err(http.StatusForbidden, "forbidden", msg) }
func NotFound(msg string) *E     { return Err(http.StatusNotFound, "not_found", msg) }
func Conflict(msg string) *E     { return Err(http.StatusConflict, "conflict", msg) }
func RateLimited(msg string) *E  { return Err(http.StatusTooManyRequests, "rate_limited", msg) }
func Internal(msg string) *E     { return Err(http.StatusInternalServerError, "internal", msg) }

type errEnvelope struct {
	Error *E `json:"error"`
}

// WriteJSON writes v as a JSON response with the given status.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

// WriteError maps err onto the error envelope. Unknown errors become 500
// without leaking internals.
func WriteError(w http.ResponseWriter, err error) {
	var e *E
	if !errors.As(err, &e) {
		slog.Error("internal error", "err", err)
		e = Internal("internal server error")
	}
	WriteJSON(w, e.Status, errEnvelope{Error: e})
}

// DecodeJSON decodes a request body into v with a size cap, rejecting unknown
// junk gracefully.
func DecodeJSON(r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil {
		return BadRequest("invalid JSON body")
	}
	return nil
}

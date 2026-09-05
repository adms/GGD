package auth

import "context"

// ScriptAdminsGate replaces the durable-gate read inside claimOwnership for the
// lifetime of s (GH#1006). Test binaries only: this file is `_test.go`, so
// `go build` never compiles it and a shipped platform has no way to reach the
// seam. Install it BEFORE the server starts serving (testutil.NewFreshDeployWith)
// so the write happens-before every handler goroutine that reads it.
func ScriptAdminsGate(s *Service, fn func(ctx context.Context) ([]string, error)) {
	s.ownerBootstrap.adminsGate = fn
}

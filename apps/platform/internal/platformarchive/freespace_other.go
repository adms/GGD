//go:build !linux && !darwin

package platformarchive

// FreeBytes has no portable implementation here, so it reports "unknown" and
// every caller FAILS CLOSED: an import that cannot prove there is room for the
// automatic pre-write backup is refused rather than attempted. A half-written
// backup is worse than no import.
func FreeBytes(path string) (int64, bool) { return 0, false }

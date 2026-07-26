//go:build linux || darwin

package platformarchive

import "golang.org/x/sys/unix"

// FreeBytes reports the bytes available to an unprivileged writer at path.
//
// Bavail (not Bfree) is the right field: Bfree includes the root-reserved
// blocks, and this binary runs as uid 65532 in a distroless image, so counting
// them would let the pre-flight approve a backup that then fails at 95 % full —
// and a HALF-WRITTEN BACKUP is the worst state this feature can produce.
//
// Bsize is int64 on linux and uint32 on darwin, hence the untyped conversion.
func FreeBytes(path string) (int64, bool) {
	var st unix.Statfs_t
	if err := unix.Statfs(path, &st); err != nil {
		return 0, false
	}
	return int64(st.Bavail) * int64(st.Bsize), true
}

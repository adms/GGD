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
//
// #nosec G115 -- 兩個值都來自核心的 statfs，不是攻擊者可控的輸入，而且要讓
// Bavail*Bsize 溢位 int64 需要 9.2 EB 的可用空間。真正的風險反而在反方向：
// 若把它改成無號數，磁碟滿到 Bavail 為 0 時的行為不變，但一個負值會被讀成
// 天文數字並讓 pre-flight 放行 —— 所以這裡刻意留在 int64。
func FreeBytes(path string) (int64, bool) {
	var st unix.Statfs_t
	if err := unix.Statfs(path, &st); err != nil {
		return 0, false
	}
	return int64(st.Bavail) * int64(st.Bsize), true
}

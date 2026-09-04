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
	// #nosec G115 -- ⛔ 誤報。這兩個值來自 statfs(2) 的**核心回報**，⛔ 不是攻擊者
	// 填的欄位：Bavail 是可用區塊數、Bsize 是區塊大小。要讓 int64 溢位需要
	// Bavail×Bsize ≥ 2^63 bytes ＝ **8 EiB 以上的檔案系統** —— 而這支二進位跑在
	// distroless 容器裡，量的是掛載進來的 DATA_DIR。
	// ⭐ 而且失效方向是安全的：真的溢位成負數，呼叫端的 pre-flight
	//「剩餘空間 ≥ 需要的量」會是 false ⇒ **拒絕備份**（fail-closed），
	// ⛔ 不會核准一個寫到一半的備份（見上面 Bavail vs Bfree 那段的理由）。
	//
	// ⚠️ 它變回真缺陷的條件（可反駁）：呼叫端改成「負數＝無限空間」之類的
	// fail-open 讀法，或這個回傳值被拿去當長度／索引而不是拿去比大小。
	return int64(st.Bavail) * int64(st.Bsize), true
}

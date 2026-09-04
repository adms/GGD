package platformarchive

import (
	"math"
	"strings"
	"testing"
)

// TestRatioGuardDoesNotFailOpenOnOverflow —— ⭐ 那個洞的守衛。
//
// ⛔⛔ 在修好之前，`ratioGuard` 的算式是 `declared / int64(compressed)`，
// 而 `int64` 對 uint64 的溢位是**環繞**：`int64(1<<63) = −9223372036854775808`
// ⇒ ratio 變成 0 或負數 ⇒ `ratio > MaxCompressionRatio` 為 **false**
// ⇒ ⛔⛔ **zip bomb 防線放行**（fail-OPEN）。
//
// ⭐ 對照組在同一支 `Inspect` 裡、只隔四行：`int64(f.UncompressedSize64) != declared`
// 溢位之後仍然 **reject**（fail-closed）。⇒ ⛔ 同一份檔裡兩個相反的失效方向。
//
// ⚠️ ⭐ 為什麼不用封包夾具驗：`archive/zip` 的 Writer **寫不出**
// `CompressedSize64 > MaxInt64` 的中央目錄 ⇒ 這條路從封包那一端**造不出來**。
// ⇒ 直接餵標頭原值給**出貨的那一支**（`Inspect` 的唯一呼叫者），
// ⛔ 而不是在測試裡自己抄一份算式（那是失敗形態⑤）。
//
// MUTATION LOG：把 `compressed > math.MaxInt64` 那一段拿掉 ⇒ 第一條當場紅。
func TestRatioGuardDoesNotFailOpenOnOverflow(t *testing.T) {
	const name = "accounts/bomb.json"

	t.Run("溢位的壓縮長度必須被擋下（⛔ 不是放行）", func(t *testing.T) {
		// ⭐ 一個宣告 1 TiB、而標頭說壓縮後有 2^63 bytes 的項目 —— 完全是偽造的。
		got := ratioGuard(name, 1<<40, 1<<63)
		if got == "" {
			t.Fatalf("⛔⛔ ratioGuard 放行了一個溢位的壓縮長度 —— zip bomb 防線是 fail-OPEN 的。\n" +
				"  int64(1<<63) = -9223372036854775808 ⇒ ratio ≤ 0 ⇒ `ratio > MaxCompressionRatio` 為 false。\n" +
				"  ⭐ 對照：同一支 Inspect 上面四行的標頭長度檢查溢位之後仍然 reject。")
		}
		if !strings.Contains(got, "畸形標頭") {
			t.Fatalf("擋下來了，⛔ 但理由不是畸形標頭：%s", got)
		}
	})

	t.Run("剛好在界線上：MaxInt64 放行、MaxInt64+1 擋下", func(t *testing.T) {
		// ⭐ 兩個方向都驗（⛔ 只驗「擋得到」證明不了它沒有擋過頭）
		if got := ratioGuard(name, MinRatioCheckBytes, math.MaxInt64); got != "" {
			t.Fatalf("⛔ MaxInt64 是合法的（雖然荒謬），⛔ 不該被畸形標頭那一條擋：%s", got)
		}
		if got := ratioGuard(name, 1<<40, math.MaxInt64+1); got == "" {
			t.Fatal("⛔ MaxInt64+1 溢位，必須擋")
		}
	})

	t.Run("⭐ 原本的功能一位都沒變", func(t *testing.T) {
		// 1 MiB 壓成 1 KiB ＝ 1024:1，超過上限 ⇒ 擋
		if got := ratioGuard(name, 1<<20, 1<<10); !strings.Contains(got, "壓縮比") {
			t.Fatalf("⛔ 正常的 zip bomb 沒有被擋：%q", got)
		}
		// 小於 MinRatioCheckBytes ⇒ 不看比例（原本的行為）
		if got := ratioGuard(name, MinRatioCheckBytes-1, 1); got != "" {
			t.Fatalf("⛔ 小項目不該套比例防線：%s", got)
		}
		// compressed == 0（stored 空檔）⇒ 不除以零（原本的行為）
		if got := ratioGuard(name, 1<<20, 0); got != "" {
			t.Fatalf("⛔ compressed=0 不該進除法：%s", got)
		}
		// 正常比例 ⇒ 放行
		if got := ratioGuard(name, 1<<20, 1<<19); got != "" {
			t.Fatalf("⛔ 2:1 的正常項目被擋了：%s", got)
		}
	})
}

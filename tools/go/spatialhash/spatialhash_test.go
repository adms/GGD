package spatialhash

import (
	"fmt"
	"testing"
)

// testdata 的兩份 trace 都是從**出貨的** SimWorld 上錄下來的（12 位英雄 +
// 真的 mobWaves 規則，warm 200 tick 之後錄 5 tick）：
//
//	trace-n100.jsonl.gz  —  100 個實體（≈ 出貨尖峰 112 的量級）
//	trace-n1000.jsonl.gz — 1000 個實體（owner 問的「1000 隻殭屍」）
const (
	traceSmall = "testdata/trace-n100.jsonl.gz"
	traceBig   = "testdata/trace-n1000.jsonl.gz"
)

func load(t testing.TB, path string) *Trace {
	t.Helper()
	tr, err := LoadTrace(path)
	if err != nil {
		t.Fatalf("LoadTrace(%s): %v", path, err)
	}
	if tr.Ticks == 0 || len(tr.Ops) == 0 {
		t.Fatalf("%s: empty trace", path)
	}
	return tr
}

// ⭐ 這是整包唯一承重的守衛：兩個 Go 實作都必須逐位元組重現**出貨 TS 實作
// 當場回傳的 id 陣列**（順序、長度、每一個值）。
// ⛔ 一個比較快但答案不一樣的實作，benchmark 的數字沒有意義。
//
// 突變驗過（兩條，都真的跑過）：
//   - Fast.QueryAABB 拿掉精確 AABB 過濾 → 紅：`op 103: got 24 ids, want 22`
//   - Fast.QueryAABB 拿掉插入排序       → 紅：`op 101 idx 0: got 89, want 1`
//
// ⚠️ ⛔ 而改 key() 是**綠**的（insert 與 query 共用它）——
// 那是這條守衛**看不到**的一類改動，理由寫在 spatialhash.go 的 key() 上方。
func TestBothImplsReproduceShippedResults(t *testing.T) {
	for _, path := range []string{traceSmall, traceBig} {
		tr := load(t, path)
		for _, impl := range []struct {
			name string
			h    Impl
		}{
			{"port", New(4)},
			{"fast", NewFast(4)},
		} {
			t.Run(fmt.Sprintf("%s/%s", path, impl.name), func(t *testing.T) {
				n, err := Replay(impl.h, tr, true)
				if err != nil {
					t.Fatalf("%v", err)
				}
				if n == 0 {
					t.Fatal("trace contained no queries")
				}
				t.Logf("%d queries reproduced exactly", n)
			})
		}
	}
}

func benchTrace(b *testing.B, path string, mk func() Impl) {
	tr := load(b, path)
	// 先驗一次答案，⛔ 不要 benchmark 一個錯的實作。
	if _, err := Replay(mk(), tr, true); err != nil {
		b.Fatalf("%v", err)
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		h := mk()
		if _, err := Replay(h, tr, false); err != nil {
			b.Fatal(err)
		}
	}
	b.StopTimer()
	// ⭐ 真正要看的數字：**每 tick 幾毫秒**（tick 預算 33.3 ms @ 30 Hz）。
	b.ReportMetric(float64(b.Elapsed().Nanoseconds())/float64(b.N)/float64(tr.Ticks)/1e6, "ms/tick")
}

func BenchmarkPortN100(b *testing.B)  { benchTrace(b, traceSmall, func() Impl { return New(4) }) }
func BenchmarkFastN100(b *testing.B)  { benchTrace(b, traceSmall, func() Impl { return NewFast(4) }) }
func BenchmarkPortN1000(b *testing.B) { benchTrace(b, traceBig, func() Impl { return New(4) }) }
func BenchmarkFastN1000(b *testing.B) { benchTrace(b, traceBig, func() Impl { return NewFast(4) }) }

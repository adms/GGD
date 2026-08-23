package spatialhash

import (
	"fmt"
	"testing"
)

// ⭐ 換資料結構不可以換答案：兩支必須逐筆給出同一個目標 id。
// 突變驗過：把 ScanIndexed 的 `c.Zone != m.Zone` 拿掉 → 紅（選中誘餌）。
// ⚠️ 這條**第一次跑是綠的** —— 見 BuildScanWorld 上方為什麼要有誘餌。
func TestScanIndexedMatchesScanAll(t *testing.T) {
	for _, n := range []int{100, 1000} {
		mobs, team, hostiles := BuildScanWorld(n, 12)
		a := ScanAll(mobs, team, nil)
		b := ScanIndexed(mobs, hostiles, nil)
		if len(a) != len(b) {
			t.Fatalf("n=%d: %d vs %d results", n, len(a), len(b))
		}
		hit := 0
		for i := range a {
			if a[i] != b[i] {
				t.Fatalf("n=%d mob %d: all=%d indexed=%d", n, i, a[i], b[i])
			}
			if a[i] >= 0 {
				hit++
			}
		}
		if hit == 0 {
			t.Fatalf("n=%d: every mob found nothing — the fixture is not exercising the scan", n)
		}
	}
}

func benchScan(b *testing.B, n int, indexed bool) {
	mobs, team, hostiles := BuildScanWorld(n, 12)
	out := make([]int32, 0, len(mobs))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if indexed {
			out = ScanIndexed(mobs, hostiles, out)
		} else {
			out = ScanAll(mobs, team, out)
		}
	}
	b.StopTimer()
	b.ReportMetric(float64(b.Elapsed().Nanoseconds())/float64(b.N)/1e6, "ms/tick")
}

func BenchmarkScanAllN1000(b *testing.B)     { benchScan(b, 1000, false) }
func BenchmarkScanIndexedN1000(b *testing.B) { benchScan(b, 1000, true) }
func BenchmarkScanAllN100(b *testing.B)      { benchScan(b, 100, false) }
func BenchmarkScanIndexedN100(b *testing.B)  { benchScan(b, 100, true) }

// Example 只是讓 `go test` 的輸出帶上一行人看得懂的規模說明。
func ExampleBuildScanWorld() {
	mobs, team, hostiles := BuildScanWorld(1000, 12)
	fmt.Printf("mobs=%d team=%d hostiles=%d comparisons: all=%d indexed=%d\n",
		len(mobs), len(team), len(hostiles), len(mobs)*len(team), len(mobs)*len(hostiles))
	// Output: mobs=1000 team=1024 hostiles=24 comparisons: all=1024000 indexed=24000
}

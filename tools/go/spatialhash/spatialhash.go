// Package spatialhash 是 packages/shared/src/sim/collision/spatialHash.ts 的 Go
// 逐條移植（票 E4）。
//
// ⭐ 這一支存在的唯一理由是**量一個數字**：owner 2026-08-23 逐字問
// 「四閘 wall 297.8 秒⋯不是很久嗎？用 GO 寫跑 benchmark 看看會不會比較好？
//
//	包括後端處理地圖物件的時候，避免像是有 1000 個殭屍在地圖上，後端來不及計算的問題」。
//
// ⚠️⚠️ 讀這支之前請先讀 docs/_reports/E4_temp_20260823d.md 的結論。
// ⛔ 這支**沒有**被接到任何出貨路徑上，出貨的 sim 仍然是 TS。
//
// ⭐ 為什麼是這一支而不是整個 sim：1000 隻殭屍的 CPU profile 裡
// `spatialHash` 家族佔 **39.4%** self-time（queryAABB 27.6 · queryCircle 10.3
// · insert 0.5 · 匿名 1.0），是單一最大的熱點。⛔ 移植整個 sim 不是這張票的問題。
//
// ⭐ 這裡刻意放**兩種**實作，因為要回答的是**兩個**問題：
//
//	Hash — 逐條照抄 TS 的資料結構（map + set + sort）⇒ 回答「換語言值多少」
//	Fast — 換掉資料佈局（flat slice + generation stamp）⇒ 回答「換演算法值多少」
//
// ⚠️ 兩者都必須對**真實錄下來的 op-trace** 產出**逐位元組相同**的結果
// （testdata/*.jsonl.gz 是從出貨 SimWorld 錄的，⛔ 不是我編的）——
// 一個比較快但答案不一樣的實作，量到的數字沒有意義。
package spatialhash

import (
	"math"
	"sort"
)

// AABB 對應 TS 的 collision/shapes.ts 的 AABB（只有 min/max，kind 在 Go 這邊
// 沒有用到 —— 那個欄位在 TS 只是 discriminated union 的標籤）。
type AABB struct {
	MinX, MinZ float64
	MaxX, MaxZ float64
}

// key 逐條對照 TS：`((cx & 0xffff) << 16) | (cz & 0xffff)`。
// ⚠️ JS 的位元運算子一律在 **int32** 上做，所以這裡用 int32 才與 TS 分到
// **同一組桶**（＝同樣的碰撞分布，benchmark 才是在比同一件事）。
//
// ⚠️⚠️ ⛔ 但**不要**在這裡寫「突變驗過」—— 實際跑過，把它改壞是**綠的**：
// insert 與 query **共用這一支**，所以 key 怎麼算兩邊都一起變，
// 精確 AABB 過濾照樣把答案修正回來。⇒ 改壞它只會讓格子退化（**變慢**），
// ⛔ 不會讓答案錯，而**正確性測試對它結構性失明**。
// 真的會紅的突變是精確過濾與排序那兩條（見 spatialhash_test.go）。
func key(cx, cz int32) int32 {
	return ((cx & 0xffff) << 16) | (cz & 0xffff)
}

// ───────────────────────────── 逐條移植 ─────────────────────────────

// Hash 是 TS SpatialHash 的逐條移植：同樣的 map-of-slices、同樣的 set 去重、
// 同樣的最後排序。⛔ 一個「順手改好一點」都沒有 —— 這一支的用途是量語言差。
type Hash struct {
	cellSize     float64
	cells        map[int32][]int32
	entityBounds map[int32]AABB
}

func New(cellSize float64) *Hash {
	return &Hash{
		cellSize:     cellSize,
		cells:        make(map[int32][]int32),
		entityBounds: make(map[int32]AABB),
	}
}

// cellOf 對應 TS 的 `Math.floor(x / this.cellSize)`。
func (h *Hash) cellOf(x float64) int32 {
	return int32(math.Floor(x / h.cellSize))
}

func (h *Hash) Clear() {
	h.cells = make(map[int32][]int32)
	h.entityBounds = make(map[int32]AABB)
}

func (h *Hash) Insert(id int32, b AABB) {
	h.entityBounds[id] = b
	x0, x1 := h.cellOf(b.MinX), h.cellOf(b.MaxX)
	z0, z1 := h.cellOf(b.MinZ), h.cellOf(b.MaxZ)
	for cx := x0; cx <= x1; cx++ {
		for cz := z0; cz <= z1; cz++ {
			k := key(cx, cz)
			h.cells[k] = append(h.cells[k], id)
		}
	}
}

func (h *Hash) InsertCircle(id int32, x, z, r float64) {
	h.Insert(id, AABB{MinX: x - r, MinZ: z - r, MaxX: x + r, MaxZ: z + r})
}

// QueryAABB 回傳所有 bounds 與查詢框相交的實體 id，**升冪、去重**
// （TS 那邊是 `[...seen].sort((a, b) => a - b)`）。
func (h *Hash) QueryAABB(minX, minZ, maxX, maxZ float64) []int32 {
	x0, x1 := h.cellOf(minX), h.cellOf(maxX)
	z0, z1 := h.cellOf(minZ), h.cellOf(maxZ)
	seen := make(map[int32]struct{})
	for cx := x0; cx <= x1; cx++ {
		for cz := z0; cz <= z1; cz++ {
			arr, ok := h.cells[key(cx, cz)]
			if !ok {
				continue
			}
			for _, id := range arr {
				b := h.entityBounds[id]
				if b.MinX <= maxX && b.MaxX >= minX && b.MinZ <= maxZ && b.MaxZ >= minZ {
					seen[id] = struct{}{}
				}
			}
		}
	}
	out := make([]int32, 0, len(seen))
	for id := range seen {
		out = append(out, id)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

func (h *Hash) QueryCircle(x, z, r float64) []int32 {
	return h.QueryAABB(x-r, z-r, x+r, z+r)
}

// ───────────────────────── 換資料佈局的版本 ─────────────────────────

// Fast 是**同一個演算法**（均勻格 · 精確 AABB 過濾 · 升冪唯一）配上不同的
// 資料佈局。⭐ 它與 Hash 的差別，逐條就是 TS 側 FastHash 的那幾條 ——
// 這樣「語言」與「演算法」兩個軸才是正交的，⛔ 不會混在一起量。
//
//	· bounds 住一條扁平 slice，用 id 索引     ⇒ ⛔ 每格不再是一次 map 查詢
//	· 用 generation stamp 去重                ⇒ ⛔ 不配 set、不配結果 slice
//	· 輸出緩衝重用 + 插入排序（k 中位數 24）  ⇒ ⛔ 不呼叫 sort.Slice（有反射開銷）
//	· clear 只清用過的格子，⛔ 不重建整張 map
type Fast struct {
	cellSize float64
	cells    map[int32][]int32
	used     []int32
	bounds   []float64 // 4 個一組：minx, minz, maxx, maxz
	stamp    []int32
	gen      int32
	out      []int32
}

func NewFast(cellSize float64) *Fast {
	return &Fast{
		cellSize: cellSize,
		cells:    make(map[int32][]int32),
		bounds:   make([]float64, 4096*4),
		stamp:    make([]int32, 4096),
		out:      make([]int32, 0, 256),
	}
}

func (f *Fast) grow(id int32) {
	if int(id) < len(f.stamp) {
		return
	}
	n := len(f.stamp)
	for n <= int(id) {
		n *= 2
	}
	b := make([]float64, n*4)
	copy(b, f.bounds)
	f.bounds = b
	s := make([]int32, n)
	copy(s, f.stamp)
	f.stamp = s
}

func (f *Fast) cellOf(x float64) int32 {
	return int32(math.Floor(x / f.cellSize))
}

func (f *Fast) Clear() {
	for _, k := range f.used {
		if arr, ok := f.cells[k]; ok {
			f.cells[k] = arr[:0]
		}
	}
	f.used = f.used[:0]
}

func (f *Fast) Insert(id int32, b AABB) {
	f.grow(id)
	o := int(id) * 4
	f.bounds[o] = b.MinX
	f.bounds[o+1] = b.MinZ
	f.bounds[o+2] = b.MaxX
	f.bounds[o+3] = b.MaxZ
	x0, x1 := f.cellOf(b.MinX), f.cellOf(b.MaxX)
	z0, z1 := f.cellOf(b.MinZ), f.cellOf(b.MaxZ)
	for cx := x0; cx <= x1; cx++ {
		for cz := z0; cz <= z1; cz++ {
			k := key(cx, cz)
			arr, ok := f.cells[k]
			if !ok || len(arr) == 0 {
				f.used = append(f.used, k)
			}
			f.cells[k] = append(arr, id)
		}
	}
}

func (f *Fast) InsertCircle(id int32, x, z, r float64) {
	f.Insert(id, AABB{MinX: x - r, MinZ: z - r, MaxX: x + r, MaxZ: z + r})
}

// QueryAABB 的回傳值是**內部緩衝**的視圖 —— 呼叫端在下一次查詢之前必須用完。
// ⚠️ 這正是它比 Hash 快的原因之一，也是它**不能**無腦換進 sim 的原因：
// sim 有幾處把 queryAABB 的結果留到迴圈之後才用。
func (f *Fast) QueryAABB(minX, minZ, maxX, maxZ float64) []int32 {
	x0, x1 := f.cellOf(minX), f.cellOf(maxX)
	z0, z1 := f.cellOf(minZ), f.cellOf(maxZ)
	f.gen++
	g := f.gen
	out := f.out[:0]
	for cx := x0; cx <= x1; cx++ {
		for cz := z0; cz <= z1; cz++ {
			arr, ok := f.cells[key(cx, cz)]
			if !ok {
				continue
			}
			for _, id := range arr {
				if f.stamp[id] == g {
					continue
				}
				o := int(id) * 4
				if f.bounds[o] <= maxX && f.bounds[o+2] >= minX &&
					f.bounds[o+1] <= maxZ && f.bounds[o+3] >= minZ {
					f.stamp[id] = g
					// 插入排序：k 實測中位數 24，⛔ 不值得叫 sort。
					out = append(out, id)
					j := len(out) - 1
					for j > 0 && out[j-1] > id {
						out[j] = out[j-1]
						j--
					}
					out[j] = id
				}
			}
		}
	}
	f.out = out
	return out
}

func (f *Fast) QueryCircle(x, z, r float64) []int32 {
	return f.QueryAABB(x-r, z-r, x+r, z+r)
}

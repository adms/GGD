package spatialhash

import (
	"bufio"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"os"
)

// OpKind 是錄下來的 trace 裡的四種操作。
type OpKind uint8

const (
	OpClear OpKind = iota
	OpInsertCircle
	OpInsertAABB
	OpQuery
)

// Op 是一筆錄下來的呼叫。Want 只有 OpQuery 有 —— 那是**出貨的 TS 實作
// 當場回傳的答案**，Go 這邊必須逐位元組重現它。
type Op struct {
	Kind       OpKind
	ID         int32
	X, Z, R    float64
	MinX, MinZ float64
	MaxX, MaxZ float64
	Want       []int32
}

// Trace 是一段真實 tick 的 SpatialHash 呼叫序列。
type Trace struct {
	Ops   []Op
	Ticks int // Clear 的次數 = 重建格子的次數
}

// LoadTrace 讀一份 `.jsonl` 或 `.jsonl.gz` 的 op-trace。
// 格式（一行一個 op，出自 SimWorld 上的實例包裹，⛔ 不是手寫的）：
//
//	["c"]                                  clear()
//	["i", id, x, z, r]                     insertCircle()
//	["b", id, minx, minz, maxx, maxz]      insert()
//	["q", minx, minz, maxx, maxz, [ids…]]  queryAABB() -> ids
func LoadTrace(path string) (*Trace, error) {
	fh, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer fh.Close()

	var r = bufio.NewReaderSize(fh, 1<<20)
	var src interface{ Read([]byte) (int, error) } = r
	if len(path) > 3 && path[len(path)-3:] == ".gz" {
		gz, gerr := gzip.NewReader(r)
		if gerr != nil {
			return nil, gerr
		}
		defer gz.Close()
		src = gz
	}

	tr := &Trace{}
	sc := bufio.NewScanner(src)
	sc.Buffer(make([]byte, 1<<20), 1<<24)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var raw []json.RawMessage
		if err := json.Unmarshal(line, &raw); err != nil {
			return nil, fmt.Errorf("bad trace line: %w", err)
		}
		var tag string
		if err := json.Unmarshal(raw[0], &tag); err != nil {
			return nil, err
		}
		num := func(i int) float64 {
			var v float64
			_ = json.Unmarshal(raw[i], &v)
			return v
		}
		switch tag {
		case "c":
			tr.Ops = append(tr.Ops, Op{Kind: OpClear})
			tr.Ticks++
		case "i":
			tr.Ops = append(tr.Ops, Op{
				Kind: OpInsertCircle, ID: int32(num(1)), X: num(2), Z: num(3), R: num(4),
			})
		case "b":
			tr.Ops = append(tr.Ops, Op{
				Kind: OpInsertAABB, ID: int32(num(1)),
				MinX: num(2), MinZ: num(3), MaxX: num(4), MaxZ: num(5),
			})
		case "q":
			var want []int32
			if err := json.Unmarshal(raw[5], &want); err != nil {
				return nil, err
			}
			tr.Ops = append(tr.Ops, Op{
				Kind: OpQuery, MinX: num(1), MinZ: num(2), MaxX: num(3), MaxZ: num(4), Want: want,
			})
		default:
			return nil, fmt.Errorf("unknown op %q", tag)
		}
	}
	return tr, sc.Err()
}

// Impl 是兩種實作共用的介面，讓 replay 只寫一次。
type Impl interface {
	Clear()
	Insert(id int32, b AABB)
	InsertCircle(id int32, x, z, r float64)
	QueryAABB(minX, minZ, maxX, maxZ float64) []int32
}

// Replay 把整段 trace 打進一個實作。check 為 true 時逐筆比對錄下來的答案，
// 不同就回傳錯誤（⛔ 這是這整張票的前提：快而答案不同沒有意義）。
func Replay(h Impl, tr *Trace, check bool) (queries int, err error) {
	for i := range tr.Ops {
		op := &tr.Ops[i]
		switch op.Kind {
		case OpClear:
			h.Clear()
		case OpInsertCircle:
			h.InsertCircle(op.ID, op.X, op.Z, op.R)
		case OpInsertAABB:
			h.Insert(op.ID, AABB{MinX: op.MinX, MinZ: op.MinZ, MaxX: op.MaxX, MaxZ: op.MaxZ})
		case OpQuery:
			got := h.QueryAABB(op.MinX, op.MinZ, op.MaxX, op.MaxZ)
			queries++
			if !check {
				continue
			}
			if len(got) != len(op.Want) {
				return queries, fmt.Errorf("op %d: got %d ids, want %d", i, len(got), len(op.Want))
			}
			for j := range op.Want {
				if got[j] != op.Want[j] {
					return queries, fmt.Errorf("op %d idx %d: got %d, want %d", i, j, got[j], op.Want[j])
				}
			}
		}
	}
	return queries, nil
}

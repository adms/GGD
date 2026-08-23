// jassdump —— 把 war3map.j 的機械事實傾印成 JSON，並可做 benchmark。
//
// ⭐ 它的用途**只有一個**：讓 Go 版與 Python 版跑**同一份輸入**、比**同一份輸出**
// （票 A3 的第③步「同一組 test case 比對兩邊的輸出」）。
//
//	go run ./cmd/jassdump -in <war3map.j>            # 傾印 JSON 到 stdout
//	go run ./cmd/jassdump -in <war3map.j> -bench 5   # 跑 5 次,中位數印到 stderr
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"
	"time"

	"github.com/ggd/tools/jassfacts"
)

// row 的欄位順序＝Python `JassGroup.as_dict()` 的鍵順序（⛔ 不要重排）。
type row struct {
	Base          string         `json:"base"`
	Line          int            `json:"line"`
	Rawcodes      []string       `json:"rawcodes"`
	Sfx           map[string]int `json:"sfx"`
	DamageCalls   int            `json:"damageCalls"`
	WaitBeats     int            `json:"waitBeats"`
	WaitValues    []float64      `json:"waitValues"`
	AnimCalls     int            `json:"animCalls"`
	MoveCalls     int            `json:"moveCalls"`
	UnboundedLoop bool           `json:"unboundedLoop"`
	Enables       []string       `json:"enables"`
	Periodic      *float64       `json:"periodic"`
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func main() {
	in := flag.String("in", "", "path to war3map.j")
	bench := flag.Int("bench", 0, "run Parse N times and report the median to stderr")
	flag.Parse()
	if *in == "" {
		fmt.Fprintln(os.Stderr, "usage: jassdump -in <war3map.j> [-bench N]")
		os.Exit(2)
	}

	if *bench > 0 {
		durs := make([]time.Duration, 0, *bench)
		for i := 0; i < *bench; i++ {
			t := time.Now()
			if _, err := jassfacts.Parse(*in); err != nil {
				fmt.Fprintln(os.Stderr, "error:", err)
				os.Exit(1)
			}
			durs = append(durs, time.Since(t))
		}
		sort.Slice(durs, func(i, j int) bool { return durs[i] < durs[j] })
		fmt.Fprintf(os.Stderr, "go Parse median %.4fs over %d runs\n",
			durs[len(durs)/2].Seconds(), *bench)
		return
	}

	groups, err := jassfacts.Parse(*in)
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}

	bases := make([]string, 0, len(groups))
	for b := range groups {
		bases = append(bases, b)
	}
	sort.Strings(bases)

	rows := make([]row, 0, len(bases))
	for _, b := range bases {
		g := groups[b]
		wv := g.WaitValues
		if wv == nil {
			wv = []float64{} // ⛔ nil slice 會變成 null,而 Python 給的是 []
		}
		rows = append(rows, row{
			Base: g.Base, Line: g.Line,
			Rawcodes: sortedKeys(g.Rawcodes), Sfx: g.Sfx,
			DamageCalls: g.DamageCalls, WaitBeats: g.WaitBeats, WaitValues: wv,
			AnimCalls: g.AnimCalls, MoveCalls: g.MoveCalls,
			UnboundedLoop: g.UnboundedLoop, Enables: sortedKeys(g.Enables),
			Periodic: g.Periodic,
		})
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", " ")
	if err := enc.Encode(rows); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

// Package jassfacts 是 tools/skill-audit/jassfacts.py 的 Go 逐條移植（票 A3）。
//
// ⭐ 這一支存在的唯一理由是**量一個數字**：owner 2026-08-23 逐字要求
// 「把花最多時間幾支 python 備份後，改用 go 重寫（保留 Python 測試當 reference
// implementation），最後跑相同 test cases 比結果和 benchmark」。
//
// ⚠️⚠️ 讀這支之前請先讀 docs/_reports/A3_temp_20260823b.md 的結論：
// `audit:check` 的 13.98s **不是 Python 慢**，是 jassfacts.py 裡一行
// `src.count("\n", 0, pos)` 的 O(F×N) 二次方掃描（4,719 支函式各自從第 0 位元組
// 重數一次換行 ≈ 6.4 GB）。把它改成增量游標之後 Python 自己就快 11.4×，
// 而**輸出逐位元組相同**。⇒ ⛔ 這支 Go 沒有被接到 package.json 上。
//
// ⛔ 所以這裡的 line_no 用的是**修好之後**的增量算法，⛔ 不是二次方版本 ——
// 拿 Go 去對一個有 bug 的 Python 會把「演算法的勝利」記到「語言」頭上，
// 而那正是這張票要避免的錯誤結論。
package jassfacts

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// 正則：⛔ 逐條對照 Python 版，一個都不可以「順手改好一點」。
// ⚠️ Go 的 RE2 沒有 backreference，這裡本來就沒用到；但 \b 與 \w 在 Go 是
// **ASCII** 語意，Python 的 str 正則是 **unicode** 語意 —— 兩者只有在
// 「中文字緊貼著 UnitDamage( 這種呼叫」時才會分岔。實測 war3map.j 沒有這種寫法
// （兩邊輸出逐位元組相同），但移植到別份 .j 時這是第一個要重驗的點。
var (
	reFunc       = regexp.MustCompile(`(?m)^function\s+(\w+)\s+takes\b`)
	reEndFunc    = regexp.MustCompile(`(?m)^endfunction\b`)
	reRawcode    = regexp.MustCompile(`'([A-Za-z0-9_]{4})'`)
	reSfx        = regexp.MustCompile(`AddSpecialEffect\w*\s*\(`)
	reStrLit     = regexp.MustCompile(`"((?:[^"\\]|\\.)*)"`)
	reDamage     = regexp.MustCompile(`\bUnitDamage\w*\s*\(`)
	reWait       = regexp.MustCompile(`\b(?:TriggerSleepAction|PolledWait)\s*\(\s*\(?\s*(-?[\d.]+)`)
	reWaitAny    = regexp.MustCompile(`\b(?:TriggerSleepAction|PolledWait)\s*\(`)
	reExitwhen   = regexp.MustCompile(`^\s*exitwhen\s+(\S+)\s*>\s*([\w.]+)`)
	reSetVar     = regexp.MustCompile(`^\s*set\s+(\w+)\s*=\s*(-?[\d.]+)\s*$`)
	reInitTrig   = regexp.MustCompile(`(?m)^function\s+InitTrig_(\w+)\s+takes\b`)
	reInitTrig1  = regexp.MustCompile(`^InitTrig_(\w+)$`)
	rePeriodic   = regexp.MustCompile(`TriggerRegisterTimerEventPeriodic\s*\(\s*\w+\s*,\s*([\d.]+)`)
	reAnim       = regexp.MustCompile(`\bSetUnitAnimation\w*\s*\(`)
	reMove       = regexp.MustCompile(`\b(?:SetUnitPosition|SetUnitX|SetUnitY)\w*\s*\(`)
	reEnable     = regexp.MustCompile(`\bEnableTrigger\s*\(\s*gg_trg_(\w+)\s*\)`)
)

// Group 對應 Python 的 JassGroup。欄位順序＝as_dict() 的鍵順序。
type Group struct {
	Base         string
	Line         int
	Rawcodes     map[string]bool
	Sfx          map[string]int
	DamageCalls  int
	WaitBeats    int
	WaitValues   []float64
	AnimCalls    int
	MoveCalls    int
	UnboundedLoop bool
	Enables      map[string]bool
	Periodic     *float64
}

// HasFacts 對應 Python 的 has_facts()：一個字都沒演出的群組不算演出。
func (g *Group) HasFacts() bool {
	return len(g.Sfx) > 0 || g.DamageCalls > 0 || g.WaitBeats > 0 ||
		g.AnimCalls > 0 || g.MoveCalls > 0
}

// stem 對應 Python 的 _stem()：路徑 → 小寫無副檔名的檔名。
func stem(path string) string {
	p := strings.ReplaceAll(path, `\\`, `\`)
	p = strings.ReplaceAll(p, "/", `\`)
	parts := strings.Split(p, `\`)
	base := parts[len(parts)-1]
	base = strings.TrimSuffix(base, filepath.Ext(base))
	return strings.ToLower(strings.TrimSpace(base))
}

// loopMultipliers 對應 Python 的 _loop_multipliers()。
// ⚠️ 承重點：七連斬寫成 loop … exitwhen i > 7 … endloop，不展開就只有 2 拍。
func loopMultipliers(lines []string) ([]int, bool) {
	mult := make([]int, len(lines))
	for i := range mult {
		mult[i] = 1
	}

	// 「變數 → 最近一次被指派的字面值」逐行快照（供 exitwhen 的第②段用）。
	// ⚠️ Python 每行 dict(literal_of) 複製一份；這裡只在**有變動時**才複製，
	//    語意相同而配置量少一個數量級。
	literalOf := map[string]float64{}
	assignAt := make([]map[string]float64, len(lines))
	for i, ln := range lines {
		if m := reSetVar.FindStringSubmatch(ln); m != nil {
			if v, err := strconv.ParseFloat(m[2], 64); err == nil {
				cp := make(map[string]float64, len(literalOf)+1)
				for k, vv := range literalOf {
					cp[k] = vv
				}
				cp[m[1]] = v
				literalOf = cp
			}
		}
		assignAt[i] = literalOf
	}

	stack := []int{}
	bounds := map[int]int{}
	unbounded := false
	for i, ln := range lines {
		s := strings.TrimSpace(ln)
		switch {
		case s == "loop":
			stack = append(stack, i)
			bounds[i] = 1
		case s == "endloop":
			if len(stack) > 0 {
				stack = stack[:len(stack)-1]
			}
		case len(stack) > 0:
			m := reExitwhen.FindStringSubmatch(ln)
			if m != nil && bounds[stack[len(stack)-1]] == 1 {
				raw := m[2]
				if f, err := strconv.ParseFloat(raw, 64); err == nil {
					bounds[stack[len(stack)-1]] = maxInt(1, int(f))
				} else if val, ok := assignAt[i][raw]; ok {
					bounds[stack[len(stack)-1]] = maxInt(1, int(val))
				} else {
					unbounded = true
				}
			}
		}
	}

	stack = stack[:0]
	for i, ln := range lines {
		s := strings.TrimSpace(ln)
		if s == "loop" {
			stack = append(stack, i)
			continue
		}
		if s == "endloop" {
			if len(stack) > 0 {
				stack = stack[:len(stack)-1]
			}
			continue
		}
		m := 1
		for _, start := range stack {
			if b, ok := bounds[start]; ok {
				m *= b
			}
		}
		mult[i] = m
	}
	return mult, unbounded
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

type fn struct {
	name string
	line int
	body string
}

// Parse 對應 Python 的 parse_jass()。
func Parse(path string) (map[string]*Group, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	src := string(raw)

	// ① trigger 群組註冊表，長度由大到小（⭐ 最長匹配）。
	baseSet := map[string]bool{}
	for _, m := range reInitTrig.FindAllStringSubmatch(src, -1) {
		baseSet[m[1]] = true
	}
	bases := make([]string, 0, len(baseSet))
	for b := range baseSet {
		bases = append(bases, b)
	}
	sort.Slice(bases, func(i, j int) bool {
		if len(bases[i]) != len(bases[j]) {
			return len(bases[i]) > len(bases[j])
		}
		return bases[i] < bases[j] // 同長度不可能同時匹配,排序只為決定論
	})

	// ② 切函式。⭐ line_no 用增量游標（O(N) 全檔一次），⛔ 不是每支從 0 重數。
	locs := reFunc.FindAllStringSubmatchIndex(src, -1)
	funcs := make([]fn, 0, len(locs))
	prevPos, lineNo := 0, 1
	for idx, loc := range locs {
		pos := loc[0]
		name := src[loc[2]:loc[3]]
		stop := len(src)
		if e := reEndFunc.FindStringIndex(src[pos:]); e != nil {
			stop = pos + e[1]
		} else if idx+1 < len(locs) {
			stop = locs[idx+1][0]
		}
		lineNo += strings.Count(src[prevPos:pos], "\n")
		prevPos = pos
		funcs = append(funcs, fn{name: name, line: lineNo, body: src[pos:stop]})
	}

	groups := map[string]*Group{}
	groupFor := func(base string, lineNo int) *Group {
		g, ok := groups[base]
		if !ok {
			g = &Group{
				Base: base, Line: lineNo,
				Rawcodes: map[string]bool{}, Sfx: map[string]int{},
				Enables: map[string]bool{},
			}
			groups[base] = g
		}
		if lineNo < g.Line {
			g.Line = lineNo
		}
		return g
	}

	// ③ 先掃 InitTrig_*（週期 timer 只住在這裡，⛔ 不在 Actions 裡）。
	for _, f := range funcs {
		m := reInitTrig1.FindStringSubmatch(f.name)
		if m == nil {
			continue
		}
		g := groupFor(m[1], f.line)
		if p := rePeriodic.FindStringSubmatch(f.body); p != nil {
			if v, err := strconv.ParseFloat(p[1], 64); err == nil {
				g.Periodic = &v
			}
		}
	}

	// ④ Trig_* 的可數事實。
	for _, f := range funcs {
		if !strings.HasPrefix(f.name, "Trig_") {
			continue
		}
		base := ""
		for _, b := range bases {
			if strings.HasPrefix(f.name, "Trig_"+b+"_") || f.name == "Trig_"+b {
				base = b
				break
			}
		}
		if base == "" {
			continue
		}
		g := groupFor(base, f.line)

		blines := strings.Split(f.body, "\n")
		mult, unbounded := loopMultipliers(blines)
		g.UnboundedLoop = g.UnboundedLoop || unbounded

		for i, ln := range blines {
			k := mult[i]
			for _, m := range reRawcode.FindAllStringSubmatch(ln, -1) {
				g.Rawcodes[m[1]] = true
			}
			for _, m := range reSfx.FindAllStringIndex(ln, -1) {
				strs := reStrLit.FindAllStringSubmatch(ln[m[1]:], -1)
				if len(strs) > 0 {
					if st := stem(strs[len(strs)-1][1]); st != "" {
						g.Sfx[st] += k
					}
				}
			}
			g.DamageCalls += len(reDamage.FindAllStringIndex(ln, -1)) * k
			g.AnimCalls += len(reAnim.FindAllStringIndex(ln, -1)) * k
			g.MoveCalls += len(reMove.FindAllStringIndex(ln, -1)) * k
			for _, m := range reEnable.FindAllStringSubmatch(ln, -1) {
				if m[1] != base {
					g.Enables[m[1]] = true
				}
			}
			nWait := len(reWaitAny.FindAllStringIndex(ln, -1))
			if nWait > 0 {
				g.WaitBeats += nWait * k
				for _, m := range reWait.FindAllStringSubmatch(ln, -1) {
					if v, err := strconv.ParseFloat(m[1], 64); err == nil {
						for j := 0; j < k; j++ {
							g.WaitValues = append(g.WaitValues, v)
						}
					}
				}
			}
		}
	}
	return groups, nil
}

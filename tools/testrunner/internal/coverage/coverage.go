// Package coverage builds the TODO↔test matrix for the dashboard's Coverage
// tab (GET /api/coverage).
//
// It parses docs/todo/*.md with the exact table conventions of
// tools/todo-check (header row containing a "Test ID" column; `_`-prefixed
// files ignored) and joins the items with the covered test ids of the latest
// finished run's NDJSON coverage file ({"cover":"<test_id>"} per line).
package coverage

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Item is one TODO row.
type Item struct {
	ID       string `json:"id"`
	Item     string `json:"item"`
	TestID   string `json:"testId"`
	Category string `json:"category"`
	Status   string `json:"status"`
	File     string `json:"file"`
	Line     int    `json:"line"`
	Covered  bool   `json:"covered"`
}

// Matrix is the /api/coverage payload.
type Matrix struct {
	RunID  string         `json:"runId,omitempty"` // run whose beacons are joined ("" = none yet)
	Items  []Item         `json:"items"`
	Counts map[string]int `json:"counts"` // total, done, covered, doneUncovered
}

var sepRe = regexp.MustCompile(`^:?-{2,}:?$`)

// ParseTodoMarkdown extracts items from one TODO markdown file (mirrors
// tools/todo-check/src/parse.ts).
func ParseTodoMarkdown(file, content string) []Item {
	var items []Item
	var header []string
	col := map[string]int{}

	lines := strings.Split(content, "\n")
	for i, raw := range lines {
		line := strings.TrimRight(raw, "\r")
		if !strings.HasPrefix(strings.TrimSpace(line), "|") {
			header = nil
			continue
		}
		cells := splitRow(line)
		if header == nil {
			lower := make([]string, len(cells))
			for j, c := range cells {
				lower[j] = strings.ToLower(c)
			}
			if indexOf(lower, "test id") >= 0 {
				header = lower
				col = map[string]int{
					"id":       indexOf(lower, "id"),
					"item":     indexOf(lower, "item"),
					"testId":   indexOf(lower, "test id"),
					"category": indexOf(lower, "category"),
					"status":   indexOf(lower, "status"),
				}
			}
			continue
		}
		if isSeparator(cells) {
			continue
		}
		get := func(k string) string {
			idx := col[k]
			if idx < 0 || idx >= len(cells) {
				return ""
			}
			return cells[idx]
		}
		items = append(items, Item{
			ID:       get("id"),
			Item:     get("item"),
			TestID:   get("testId"),
			Category: strings.ToLower(get("category")),
			Status:   strings.ToLower(get("status")),
			File:     file,
			Line:     i + 1,
		})
	}
	return items
}

// LoadTodoDir parses every non-underscore .md in dir (sorted by filename).
func LoadTodoDir(dir string) ([]Item, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, e := range entries {
		n := e.Name()
		if e.IsDir() || !strings.HasSuffix(n, ".md") || strings.HasPrefix(n, "_") {
			continue
		}
		names = append(names, n)
	}
	sort.Strings(names)
	var items []Item
	for _, n := range names {
		data, err := os.ReadFile(filepath.Join(dir, n))
		if err != nil {
			return nil, err
		}
		items = append(items, ParseTodoMarkdown("docs/todo/"+n, string(data))...)
	}
	return items, nil
}

// ReadCovered parses an NDJSON coverage file into the set of covered test ids.
// A missing file yields an empty set (not an error).
func ReadCovered(path string) map[string]bool {
	out := map[string]bool{}
	f, err := os.Open(path)
	if err != nil {
		return out
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		var obj struct {
			Cover string `json:"cover"`
		}
		if err := json.Unmarshal(sc.Bytes(), &obj); err == nil && obj.Cover != "" {
			out[obj.Cover] = true
		}
	}
	return out
}

// Build joins TODO items with covered ids.
func Build(items []Item, covered map[string]bool, runID string) Matrix {
	out := Matrix{RunID: runID, Items: make([]Item, len(items)), Counts: map[string]int{}}
	copy(out.Items, items)
	for i := range out.Items {
		it := &out.Items[i]
		it.Covered = covered[it.TestID]
		out.Counts["total"]++
		if it.Status == "done" {
			out.Counts["done"]++
			if !it.Covered {
				out.Counts["doneUncovered"]++
			}
		}
		if it.Covered {
			out.Counts["covered"]++
		}
	}
	return out
}

func splitRow(line string) []string {
	t := strings.TrimSpace(line)
	t = strings.TrimPrefix(t, "|")
	t = strings.TrimSuffix(t, "|")
	parts := strings.Split(t, "|")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	return parts
}

func isSeparator(cells []string) bool {
	for _, c := range cells {
		if !sepRe.MatchString(c) {
			return false
		}
	}
	return true
}

func indexOf(ss []string, want string) int {
	for i, s := range ss {
		if s == want {
			return i
		}
	}
	return -1
}

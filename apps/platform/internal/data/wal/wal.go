// Package wal is a tiny write-ahead journal used ONLY for match settlement —
// the single multi-file write in the platform. The flow is: append an intent
// (carrying the full settlement payload with ABSOLUTE post-match MMR) → apply
// all writes → append a commit marker. On boot, intents without a commit are
// replayed; absolute MMR makes replay idempotent.
package wal

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Entry is one NDJSON journal line.
type Entry struct {
	Stage   string          `json:"stage"` // intent | commit
	MatchID string          `json:"matchId"`
	At      time.Time       `json:"at"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// WAL appends to data/journal/<date>.log.
type WAL struct {
	dir string
	mu  sync.Mutex
}

// Open ensures the journal directory exists under dataDir.
func Open(dataDir string) (*WAL, error) {
	dir := filepath.Join(dataDir, "journal")
	// 0o750 (was 0o755): the journal carries full settlement payloads including
	// absolute post-match MMR. The platform process is its only reader, at boot.
	// On the Linux family host that means a post-mortem `cat data/journal/*.log`
	// from a plain ssh session now needs `sudo` or `docker compose exec` — which
	// is the journal's single most likely human use, so it is called out here
	// rather than discovered mid-incident.
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, err
	}
	return &WAL{dir: dir}, nil
}

func (w *WAL) append(e Entry) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	name := filepath.Join(w.dir, e.At.UTC().Format("2006-01-02")+".log")
	// #nosec G304 -- `name` has no caller-supplied component: w.dir is
	// <dataDir>/journal fixed at Open, and the only variable is a time.Time
	// rendered through the fixed layout "2006-01-02", which cannot emit a path
	// separator. 0o600 (was 0o644) for the MMR payloads; note O_CREATE applies
	// the mode only to a file it creates, so journals written before this sweep
	// keep 0644 until the next UTC day rolls over.
	f, err := os.OpenFile(name, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()
	data, err := json.Marshal(e)
	if err != nil {
		return err
	}
	if _, err := f.Write(append(data, '\n')); err != nil {
		return err
	}
	return f.Sync()
}

// AppendIntent journals the settlement payload before any file is touched.
func (w *WAL) AppendIntent(matchID string, payload any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return w.append(Entry{Stage: "intent", MatchID: matchID, At: time.Now(), Payload: raw})
}

// AppendCommit journals that the settlement fully applied.
func (w *WAL) AppendCommit(matchID string) error {
	return w.append(Entry{Stage: "commit", MatchID: matchID, At: time.Now()})
}

// PendingIntents scans every journal file and returns the intents that never
// got a commit marker, in journal order.
func (w *WAL) PendingIntents() ([]Entry, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	files, err := filepath.Glob(filepath.Join(w.dir, "*.log"))
	if err != nil {
		return nil, err
	}
	sort.Strings(files)
	intents := map[string]Entry{}
	var order []string
	for _, file := range files {
		// #nosec G304 -- `file` is an element of the filepath.Glob result three
		// lines up, bounded to <dataDir>/journal/*.log; it is not caller input.
		f, err := os.Open(file)
		if err != nil {
			return nil, err
		}
		sc := bufio.NewScanner(f)
		sc.Buffer(make([]byte, 0, 1<<20), 1<<20)
		for sc.Scan() {
			line := strings.TrimSpace(sc.Text())
			if line == "" {
				continue
			}
			var e Entry
			if err := json.Unmarshal([]byte(line), &e); err != nil {
				continue // tolerate a torn tail line
			}
			switch e.Stage {
			case "intent":
				if _, seen := intents[e.MatchID]; !seen {
					order = append(order, e.MatchID)
				}
				intents[e.MatchID] = e
			case "commit":
				delete(intents, e.MatchID)
			}
		}
		// Read-only handle: a Close error carries no data loss, and this is
		// sequenced BEFORE the sc.Err() check so a scan error is still reported.
		_ = f.Close()
		if err := sc.Err(); err != nil {
			return nil, err
		}
	}
	var out []Entry
	for _, mid := range order {
		if e, ok := intents[mid]; ok {
			out = append(out, e)
		}
	}
	return out, nil
}

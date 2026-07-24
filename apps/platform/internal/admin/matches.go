package admin

import (
	"context"
	"encoding/json"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/httpx"
)

// Match is the admin view of a settled match record (the durable truth written
// by the settlement path at data/matches/YYYY/MM/<id>.json).
type Match = gamelink.Settlement

// readContained reads one root-relative path through an *os.Root, so the open
// cannot traverse a symlink out of that root.
func readContained(root *os.Root, rel string) ([]byte, error) {
	f, err := root.Open(rel)
	if err != nil {
		return nil, err
	}
	defer func() { _ = f.Close() }()
	return io.ReadAll(f)
}

// walkMatches reads every match record under data/matches, newest (by end
// time) first. A missing directory reads as empty.
//
// Reads go through os.OpenRoot rather than os.ReadFile(p). WalkDir lstats, so it
// will not DESCEND a symlink, but os.ReadFile FOLLOWS one — a link planted at
// data/matches/2026/07/x.json -> /etc/shadow would have been read and echoed to
// an admin (gosec G122, the symlink TOCTOU). Planting it requires filesystem
// write inside the platform container, since the only writer of this tree is the
// settlement path (gamelink/settle.go) through jsonstore.resolve, which pins the
// directory to fmt.Sprintf("matches/%04d/%02d", ...) of the clock and validates
// the id — no request can choose a name here, let alone create a link. The guard
// is cheap and unconditional, so it is taken rather than annotated.
func (s *Service) walkMatches() ([]Match, error) {
	root := filepath.Join(s.store.Root(), "matches")
	out := []Match{}
	// Confines every Open below to `root` at the syscall level: a symlink cannot
	// escape the tree even if it is swapped in mid-walk.
	rootDir, err := os.OpenRoot(root)
	if err != nil {
		if os.IsNotExist(err) {
			return out, nil // no matches yet
		}
		return nil, err
	}
	defer func() { _ = rootDir.Close() }()

	err = filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			if os.IsNotExist(err) {
				return nil // no matches yet
			}
			return nil // tolerate a partial/racing tree
		}
		if d.IsDir() {
			return nil
		}
		// Skips symlinks, devices and sockets: only a real file is a match record.
		if !d.Type().IsRegular() {
			return nil
		}
		name := d.Name()
		if !strings.HasSuffix(name, ".json") || name == "_index.json" {
			return nil
		}
		rel, relErr := filepath.Rel(root, p)
		if relErr != nil {
			return nil
		}
		data, readErr := readContained(rootDir, rel)
		if readErr != nil {
			return nil
		}
		var m Match
		if json.Unmarshal(data, &m) == nil && m.MatchID != "" {
			out = append(out, m)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool { return out[i].EndedAt.After(out[j].EndedAt) })
	return out, nil
}

// ListMatches returns a page of match records, optionally filtered to those a
// given account played in. total is the pre-pagination count.
func (s *Service) ListMatches(ctx context.Context, accountID string, page, pageSize int) (matches []Match, total int, err error) {
	page, pageSize = normalizePage(page, pageSize)
	all, err := s.walkMatches()
	if err != nil {
		return nil, 0, err
	}
	if accountID != "" {
		filtered := all[:0:0]
		for _, m := range all {
			for _, seat := range m.Seats {
				if seat.AccountID == accountID {
					filtered = append(filtered, m)
					break
				}
			}
		}
		all = filtered
	}
	total = len(all)
	matches = paginate(all, page, pageSize)
	if matches == nil {
		matches = []Match{}
	}
	return matches, total, nil
}

// GetMatch loads one match record by id (404 when absent).
func (s *Service) GetMatch(ctx context.Context, id string) (Match, error) {
	all, err := s.walkMatches()
	if err != nil {
		return Match{}, err
	}
	for _, m := range all {
		if m.MatchID == id {
			return m, nil
		}
	}
	return Match{}, httpx.NotFound("match not found")
}

package admin

import (
	"context"
	"encoding/json"
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

// walkMatches reads every match record under data/matches, newest (by end
// time) first. A missing directory reads as empty.
func (s *Service) walkMatches() ([]Match, error) {
	root := filepath.Join(s.store.Root(), "matches")
	out := []Match{}
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			if os.IsNotExist(err) {
				return nil // no matches yet
			}
			return nil // tolerate a partial/racing tree
		}
		if d.IsDir() {
			return nil
		}
		name := d.Name()
		if !strings.HasSuffix(name, ".json") || name == "_index.json" {
			return nil
		}
		data, readErr := os.ReadFile(p)
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

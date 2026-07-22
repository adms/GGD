// Package scheduler decides WHAT runs and in WHICH order.
//
// Invariant (enforced here and unit-tested): categories execute in the fixed
// order config.Categories, and REGRESSION ALWAYS RUNS LAST — hard-coded, not
// data-driven. Within a category, suites keep their suites.yaml order.
package scheduler

import (
	"fmt"
	"sort"

	"github.com/ggd/testrunner/internal/config"
)

// Mode selects how a run is scoped.
const (
	ModeAll      = "all"
	ModeCategory = "category"
	ModeSuite    = "suite"
	ModeIDs      = "ids" // internal: rerun-failed
)

// Request describes a run to plan.
type Request struct {
	Mode     string   `json:"mode"`
	Category string   `json:"category,omitempty"`
	SuiteID  string   `json:"suiteId,omitempty"`
	IDs      []string `json:"ids,omitempty"`
}

// Plan resolves a Request against the registry (allow-list) and returns the
// ordered suites to execute. Only enabled suites are ever returned, except
// that explicitly requesting a disabled suite is an error (not a silent skip).
func Plan(reg *config.Registry, req Request) ([]config.Suite, error) {
	var picked []config.Suite
	switch req.Mode {
	case ModeAll:
		for _, s := range reg.Suites {
			if s.Enabled {
				picked = append(picked, s)
			}
		}
	case ModeCategory:
		if !config.IsValidCategory(req.Category) {
			return nil, fmt.Errorf("unknown category %q", req.Category)
		}
		for _, s := range reg.Suites {
			if s.Enabled && s.Category == req.Category {
				picked = append(picked, s)
			}
		}
	case ModeSuite:
		s, ok := reg.ByID(req.SuiteID)
		if !ok {
			return nil, fmt.Errorf("unknown suite %q: not in suites.yaml (allow-list)", req.SuiteID)
		}
		if !s.Enabled {
			return nil, fmt.Errorf("suite %q is disabled in suites.yaml%s", req.SuiteID, note(s))
		}
		picked = append(picked, s)
	case ModeIDs:
		for _, id := range req.IDs {
			s, ok := reg.ByID(id)
			if !ok {
				return nil, fmt.Errorf("unknown suite %q: not in suites.yaml (allow-list)", id)
			}
			if !s.Enabled {
				return nil, fmt.Errorf("suite %q is disabled in suites.yaml%s", id, note(s))
			}
			picked = append(picked, s)
		}
	default:
		return nil, fmt.Errorf("unknown mode %q (want all|category|suite)", req.Mode)
	}

	ordered := Order(picked)
	if err := assertRegressionLast(ordered); err != nil {
		// Defensive: Order can't produce this, but the invariant is important
		// enough to double-check at every planning step.
		return nil, err
	}
	return ordered, nil
}

// Order sorts suites by category rank (regression pinned last via
// config.CategoryRank), stable within a category.
func Order(suites []config.Suite) []config.Suite {
	out := make([]config.Suite, len(suites))
	copy(out, suites)
	sort.SliceStable(out, func(i, j int) bool {
		return config.CategoryRank(out[i].Category) < config.CategoryRank(out[j].Category)
	})
	return out
}

func assertRegressionLast(suites []config.Suite) error {
	seenRegression := false
	for _, s := range suites {
		if s.Category == "regression" {
			seenRegression = true
		} else if seenRegression {
			return fmt.Errorf("scheduler invariant violated: %q (%s) ordered after a regression suite", s.ID, s.Category)
		}
	}
	return nil
}

func note(s config.Suite) string {
	if s.Comment == "" {
		return ""
	}
	return " — " + s.Comment
}

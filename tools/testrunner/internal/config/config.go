// Package config loads and validates the suites.yaml registry.
//
// suites.yaml is one of the two sources of truth of the test harness (the
// other is docs/todo/*.md). It declares every runnable suite; the runner is an
// ALLOW-LIST executor — it refuses to run any command that is not declared
// here, and the HTTP API only ever accepts suite/category IDs, never commands.
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

// Categories is the fixed execution order for run-all. Regression is ALWAYS
// last; the scheduler additionally hard-codes that invariant even if this
// slice is ever edited (see scheduler.Plan and its tests).
var Categories = []string{
	"unit",
	"integration",
	"e2e",
	"exception",
	"injection",
	"security",
	"vuln",
	"determinism",
	"regression",
}

// IsValidCategory reports whether c is one of the known suite categories.
func IsValidCategory(c string) bool {
	for _, k := range Categories {
		if k == c {
			return true
		}
	}
	return false
}

// CategoryRank returns the execution rank of a category. Regression is forced
// to the maximal rank regardless of its position in Categories.
func CategoryRank(c string) int {
	if c == "regression" {
		return 1 << 30 // hard-coded final phase
	}
	for i, k := range Categories {
		if k == c {
			return i
		}
	}
	return 1<<30 - 1 // unknown categories sort just before regression; Validate rejects them anyway
}

// Suite is one runnable entry of suites.yaml.
type Suite struct {
	ID   string `yaml:"id" json:"id"`
	Name string `yaml:"name" json:"name"`
	// Category is one of Categories (unit|integration|e2e|exception|injection|
	// security|vuln|determinism|regression).
	Category string `yaml:"category" json:"category"`
	// Cwd is relative to the repo root. "." (default) = repo root.
	Cwd string `yaml:"cwd" json:"cwd"`
	// Cmd is an argv array — executed directly via os/exec, NEVER through a shell.
	Cmd []string `yaml:"cmd" json:"cmd"`
	// Env is extra environment for the suite process (merged over os.Environ).
	Env map[string]string `yaml:"env" json:"env,omitempty"`
	// ParallelSafe marks suites that could run concurrently. The current
	// scheduler is deliberately sequential (deterministic logs/ordering);
	// this flag is metadata reserved for a future parallel phase runner.
	ParallelSafe bool `yaml:"parallelSafe" json:"parallelSafe"`
	Enabled      bool `yaml:"enabled" json:"enabled"`
	// Comment is a free-form note (e.g. why a placeholder is disabled).
	Comment string `yaml:"comment" json:"comment,omitempty"`
}

// Registry is the parsed suites.yaml.
type Registry struct {
	Suites []Suite `yaml:"suites" json:"suites"`
}

var idRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

// Parse parses and validates a suites.yaml payload. Unknown fields are
// rejected so typos cannot silently disable safety-relevant settings.
func Parse(data []byte) (*Registry, error) {
	dec := yaml.NewDecoder(strings.NewReader(string(data)))
	dec.KnownFields(true)
	var reg Registry
	if err := dec.Decode(&reg); err != nil {
		return nil, fmt.Errorf("suites.yaml: %w", err)
	}
	if err := reg.Validate(); err != nil {
		return nil, err
	}
	return &reg, nil
}

// Load reads and parses a suites.yaml file.
func Load(path string) (*Registry, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return Parse(data)
}

// Validate enforces registry invariants (unique ids, valid category, non-empty
// argv, cwd confined to the repo).
func (r *Registry) Validate() error {
	if len(r.Suites) == 0 {
		return fmt.Errorf("suites.yaml: no suites declared")
	}
	seen := map[string]bool{}
	for i := range r.Suites {
		s := &r.Suites[i]
		at := fmt.Sprintf("suite[%d] (%q)", i, s.ID)
		if !idRe.MatchString(s.ID) {
			return fmt.Errorf("%s: invalid id (want ^[a-z0-9][a-z0-9-]*$)", at)
		}
		if seen[s.ID] {
			return fmt.Errorf("%s: duplicate id", at)
		}
		seen[s.ID] = true
		if s.Name == "" {
			s.Name = s.ID
		}
		if !IsValidCategory(s.Category) {
			return fmt.Errorf("%s: invalid category %q (want one of %s)", at, s.Category, strings.Join(Categories, "|"))
		}
		if len(s.Cmd) == 0 || strings.TrimSpace(s.Cmd[0]) == "" {
			return fmt.Errorf("%s: cmd must be a non-empty argv array", at)
		}
		if s.Cwd == "" {
			s.Cwd = "."
		}
		if filepath.IsAbs(s.Cwd) {
			return fmt.Errorf("%s: cwd must be relative to the repo root, got absolute %q", at, s.Cwd)
		}
		clean := filepath.Clean(s.Cwd)
		if clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
			return fmt.Errorf("%s: cwd %q escapes the repo root", at, s.Cwd)
		}
		s.Cwd = clean
	}
	return nil
}

// ByID looks a suite up by id (the only way the API selects work — allow-list).
func (r *Registry) ByID(id string) (Suite, bool) {
	for _, s := range r.Suites {
		if s.ID == id {
			return s, true
		}
	}
	return Suite{}, false
}

// RefuseProduction returns an error when the environment looks like
// production. The runner executes repo commands and MUST never ship enabled.
func RefuseProduction(getenv func(string) string) error {
	if v := getenv("APP_ENV"); strings.EqualFold(v, "production") || strings.EqualFold(v, "prod") {
		return fmt.Errorf("testrunner refuses to start: APP_ENV=%s (dev/CI only)", v)
	}
	return nil
}

// FindRepoRoot walks upward from dir until it finds pnpm-workspace.yaml.
func FindRepoRoot(dir string) (string, error) {
	d, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(d, "pnpm-workspace.yaml")); err == nil {
			return d, nil
		}
		parent := filepath.Dir(d)
		if parent == d {
			return "", fmt.Errorf("repo root not found (no pnpm-workspace.yaml above %s)", dir)
		}
		d = parent
	}
}

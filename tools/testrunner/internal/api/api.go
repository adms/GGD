// Package api exposes the testrunner HTTP + SSE surface.
//
//	GET  /healthz                    liveness
//	GET  /api/suites                 registry + fixed category order
//	GET  /api/runs                   run list (newest first)
//	POST /api/runs                   {"mode":"all|category|suite","category"?,"suiteId"?,"stepped":bool}
//	GET  /api/runs/{id}              snapshot
//	GET  /api/runs/{id}/events       SSE stream (replays from the start; `Last-Event-ID` resumes)
//	POST /api/runs/{id}/next         advance a stepped run
//	POST /api/runs/{id}/cancel       cancel a run
//	POST /api/runs/{id}/rerun-failed new run from the failed suites
//	GET  /api/coverage               TODO↔test matrix joined with the latest finished run
//
// The API never accepts commands — only suite/category ids resolved against
// suites.yaml (allow-list). CORS is restricted to loopback origins (the Vite
// dev server of apps/test-dashboard).
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/ggd/testrunner/internal/config"
	"github.com/ggd/testrunner/internal/coverage"
	"github.com/ggd/testrunner/internal/runner"
	"github.com/ggd/testrunner/internal/scheduler"
)

// Server wires the manager into an http.Handler.
type Server struct {
	mgr      *runner.Manager
	repoRoot string
	mux      *http.ServeMux
}

// NewServer builds the handler.
func NewServer(mgr *runner.Manager, repoRoot string) *Server {
	s := &Server{mgr: mgr, repoRoot: repoRoot, mux: http.NewServeMux()}
	s.mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	s.mux.HandleFunc("GET /api/suites", s.handleSuites)
	s.mux.HandleFunc("GET /api/runs", s.handleRunList)
	s.mux.HandleFunc("POST /api/runs", s.handleRunCreate)
	s.mux.HandleFunc("GET /api/runs/{id}", s.handleRunGet)
	s.mux.HandleFunc("GET /api/runs/{id}/events", s.handleRunEvents)
	s.mux.HandleFunc("POST /api/runs/{id}/next", s.handleRunNext)
	s.mux.HandleFunc("POST /api/runs/{id}/cancel", s.handleRunCancel)
	s.mux.HandleFunc("POST /api/runs/{id}/rerun-failed", s.handleRerunFailed)
	s.mux.HandleFunc("GET /api/coverage", s.handleCoverage)
	return s
}

// ServeHTTP applies loopback-only CORS then dispatches.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if origin := r.Header.Get("Origin"); origin != "" && isLoopbackOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Last-Event-ID")
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	s.mux.ServeHTTP(w, r)
}

func (s *Server) handleSuites(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"categoryOrder": config.Categories,
		"suites":        s.mgr.Registry().Suites,
	})
}

func (s *Server) handleRunList(w http.ResponseWriter, _ *http.Request) {
	runs := s.mgr.List()
	out := make([]runner.Snapshot, len(runs))
	for i, r := range runs {
		out[i] = r.Snapshot()
	}
	writeJSON(w, http.StatusOK, map[string]any{"runs": out})
}

type runRequest struct {
	Mode     string `json:"mode"`
	Category string `json:"category"`
	SuiteID  string `json:"suiteId"`
	Stepped  bool   `json:"stepped"`
}

func (s *Server) handleRunCreate(w http.ResponseWriter, r *http.Request) {
	var req runRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024)).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("invalid JSON body: %w", err))
		return
	}
	if req.Mode == "" {
		req.Mode = scheduler.ModeAll
	}
	run, err := s.mgr.Start(scheduler.Request{Mode: req.Mode, Category: req.Category, SuiteID: req.SuiteID}, req.Stepped)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, run.Snapshot())
}

func (s *Server) handleRunGet(w http.ResponseWriter, r *http.Request) {
	run, ok := s.mgr.Get(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, fmt.Errorf("unknown run"))
		return
	}
	writeJSON(w, http.StatusOK, run.Snapshot())
}

func (s *Server) handleRunNext(w http.ResponseWriter, r *http.Request) {
	run, ok := s.mgr.Get(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, fmt.Errorf("unknown run"))
		return
	}
	run.Next()
	writeJSON(w, http.StatusOK, map[string]string{"status": "advanced"})
}

func (s *Server) handleRunCancel(w http.ResponseWriter, r *http.Request) {
	run, ok := s.mgr.Get(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, fmt.Errorf("unknown run"))
		return
	}
	run.Cancel()
	writeJSON(w, http.StatusOK, map[string]string{"status": "cancelling"})
}

func (s *Server) handleRerunFailed(w http.ResponseWriter, r *http.Request) {
	run, err := s.mgr.RerunFailed(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, run.Snapshot())
}

func (s *Server) handleCoverage(w http.ResponseWriter, _ *http.Request) {
	items, err := coverage.LoadTodoDir(filepath.Join(s.repoRoot, "docs", "todo"))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	covered := map[string]bool{}
	runID := ""
	if last, ok := s.mgr.LatestFinished(); ok {
		covered = coverage.ReadCovered(last.CoverageFile)
		runID = last.ID
	}
	writeJSON(w, http.StatusOK, coverage.Build(items, covered, runID))
}

// handleRunEvents streams a run's events as SSE, replaying the buffer first.
func (s *Server) handleRunEvents(w http.ResponseWriter, r *http.Request) {
	run, ok := s.mgr.Get(r.PathValue("id"))
	if !ok {
		writeErr(w, http.StatusNotFound, fmt.Errorf("unknown run"))
		return
	}
	fl, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, http.StatusInternalServerError, fmt.Errorf("streaming unsupported"))
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	from := 0
	if v := r.Header.Get("Last-Event-ID"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			from = n // seq == buffer index + 1
		}
	}
	for {
		evs, changed, finished := run.Events(from)
		for _, ev := range evs {
			if _, err := w.Write(EncodeSSE(ev)); err != nil {
				return
			}
		}
		if len(evs) > 0 {
			fl.Flush()
			from += len(evs)
		}
		if finished {
			// The run-end event is always the final one; drain then close.
			if evs, _, _ := run.Events(from); len(evs) == 0 {
				return
			}
			continue
		}
		select {
		case <-r.Context().Done():
			return
		case <-changed:
		}
	}
}

// EncodeSSE renders one event in text/event-stream framing:
//
//	id: <seq>\nevent: <type>\ndata: <json>\n\n
func EncodeSSE(ev runner.Event) []byte {
	data, err := json.Marshal(ev)
	if err != nil {
		data = []byte(`{"type":"error","text":"event marshal failure"}`)
	}
	var b strings.Builder
	fmt.Fprintf(&b, "id: %d\n", ev.Seq)
	fmt.Fprintf(&b, "event: %s\n", ev.Type)
	fmt.Fprintf(&b, "data: %s\n\n", data)
	return []byte(b.String())
}

func isLoopbackOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	h := u.Hostname()
	return h == "localhost" || h == "127.0.0.1" || h == "::1"
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, err error) {
	writeJSON(w, code, map[string]string{"error": err.Error()})
}

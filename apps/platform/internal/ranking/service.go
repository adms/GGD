package ranking

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/keyedmutex"
	"github.com/ggd/platform/internal/data/redisx"
)

// Mode is the hidden Elo/MMR matchmaking ladder's ZSET mode
// (lb:<season>:pairedduels). It stays exactly as before.
const Mode = "pairedduels"

// ModePlayer is the visible cumulative-points PLAYER board's ZSET mode
// (lb:<season>:player). Score = the account's total season points.
const ModePlayer = "player"

// ModeChampion is the visible per-champion board's ZSET mode
// (lb:<season>:champ:<championId>). Score = the account's points ON that
// champion. Every champion an account plays gets its own independent track.
func ModeChampion(championID string) string { return "champ:" + championID }

// Snapshot is the durable leaderboard fallback at
// data/rankings/<season>/snapshot.json.
type Snapshot struct {
	Season    string          `json:"season"`
	UpdatedAt time.Time       `json:"updatedAt"`
	Entries   []SnapshotEntry `json:"entries"`
}

// SnapshotEntry is one snapshot row.
type SnapshotEntry struct {
	AccountID string `json:"accountId"`
	MMR       int    `json:"mmr"`
}

// Entry is one API leaderboard row.
type Entry struct {
	Rank      int    `json:"rank"`
	AccountID string `json:"accountId"`
	Username  string `json:"username"`
	MMR       int    `json:"mmr"`
}

// Service owns the hidden MMR ZSET plus the visible points boards (player +
// per-champion) and their durable snapshots.
type Service struct {
	rdb      *redisx.Client
	store    *jsonstore.Store
	accounts *account.Repo
	season   string
	ladder   LadderConfig

	mu       sync.Mutex
	dirty    bool            // MMR snapshot dirty
	pDirty   bool            // player-points snapshot dirty
	cDirty   map[string]bool // per-champion snapshot dirty set
	champIDs map[string]bool // every champion board this process has touched
	debounce *time.Timer
	wait     time.Duration

	// Cached apex (菁英/宗師) passes, one per board, keyed "<season>|<mode>".
	// Every points write drops the affected board's entry, so the TTL only
	// bounds staleness from writes this process did not make.
	apexMu    sync.Mutex
	apexCache map[string]apexEntry
	apexTTL   time.Duration

	// h2hLocks 守 head-to-head 的 read-modify-write。那一列是**累加**的（不像
	// MMR/積分寫絕對值），所以兩場同時結算的同一對帳號會掉一筆 —— jsonstore 自己
	// 的鎖只保護單次讀或單次寫，蓋不住中間那段。見 headtohead.go。
	h2hLocks *keyedmutex.M
}

// New builds the ranking service. An optional LadderConfig tunes the visible
// tier thresholds and apex slots; omitted, DefaultLadderConfig() is used.
func New(rdb *redisx.Client, store *jsonstore.Store, accounts *account.Repo, season string, ladder ...LadderConfig) *Service {
	cfg := DefaultLadderConfig()
	if len(ladder) > 0 {
		cfg = ladder[0]
	}
	return &Service{
		rdb: rdb, store: store, accounts: accounts, season: season, ladder: cfg,
		cDirty: map[string]bool{}, champIDs: map[string]bool{}, wait: 2 * time.Second,
		apexCache: map[string]apexEntry{}, apexTTL: 2 * time.Second,
		h2hLocks: keyedmutex.New(),
	}
}

// Season returns the active season id.
func (s *Service) Season() string { return s.season }

// Ladder returns the active tier/division configuration.
func (s *Service) Ladder() LadderConfig { return s.ladder }

// seasonOr returns the given season, or the active season when empty.
func (s *Service) seasonOr(season string) string {
	if season == "" {
		return s.season
	}
	return season
}

func (s *Service) snapshotCollection() string { return "rankings/" + s.season }

// Add upserts an absolute MMR onto the ladder and marks the snapshot dirty.
func (s *Service) Add(ctx context.Context, accountID string, mmr int) error {
	if err := s.rdb.LBAdd(ctx, s.season, Mode, accountID, float64(mmr)); err != nil {
		return err
	}
	s.MarkDirty()
	return nil
}

// MarkDirty schedules a debounced snapshot write of the MMR ladder.
func (s *Service) MarkDirty() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.dirty = true
	s.scheduleLocked()
}

// scheduleLocked (re)arms the shared debounce timer. Caller holds s.mu.
func (s *Service) scheduleLocked() {
	if s.debounce != nil {
		s.debounce.Stop()
	}
	s.debounce = time.AfterFunc(s.wait, func() {
		_ = s.SnapshotNow(context.Background())
	})
}

// SnapshotNow writes every durable snapshot immediately: the MMR ladder, the
// player-points board, each touched champion board and the ladder meta.
func (s *Service) SnapshotNow(ctx context.Context) error {
	entries, err := s.rdb.LBRange(ctx, s.season, Mode, 0, -1)
	if err != nil {
		return err
	}
	snap := Snapshot{Season: s.season, UpdatedAt: time.Now()}
	for _, e := range entries {
		snap.Entries = append(snap.Entries, SnapshotEntry{AccountID: e.AccountID, MMR: e.MMR})
	}
	s.mu.Lock()
	s.dirty = false
	s.pDirty = false
	champs := make([]string, 0, len(s.champIDs))
	for id := range s.champIDs {
		champs = append(champs, id)
	}
	s.cDirty = map[string]bool{}
	s.mu.Unlock()

	if err := s.store.Put(s.snapshotCollection(), "snapshot", snap); err != nil {
		return err
	}
	return s.snapshotPoints(ctx, champs)
}

// ensureLoaded rehydrates the ZSET from the snapshot when Redis is cold.
func (s *Service) ensureLoaded(ctx context.Context) error {
	n, err := s.rdb.LBCard(ctx, s.season, Mode)
	if err != nil || n > 0 {
		return err
	}
	var snap Snapshot
	err = s.store.Get(s.snapshotCollection(), "snapshot", &snap)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	pipe := s.rdb.R.Pipeline()
	for _, e := range snap.Entries {
		pipe.ZAdd(ctx, redisx.KeyLeaderboard(s.season, Mode), redis.Z{Score: float64(e.MMR), Member: e.AccountID})
	}
	_, err = pipe.Exec(ctx)
	return err
}

func (s *Service) decorate(ctx context.Context, raw []redisx.LBEntry, startRank int) []Entry {
	// Deterministic tie-break: MMR desc, then accountID (ULID) desc — the
	// same order ZREVRANGE uses for equal scores, so page slices stay
	// consistent across page boundaries.
	sortBoard(raw)
	out := make([]Entry, 0, len(raw))
	for i, e := range raw {
		en := Entry{Rank: startRank + i + 1, AccountID: e.AccountID, MMR: e.MMR}
		if a, err := s.accounts.GetByID(ctx, e.AccountID); err == nil {
			en.Username = a.Username
		}
		out = append(out, en)
	}
	return out
}

// Page returns one leaderboard page (1-based page index).
func (s *Service) Page(ctx context.Context, page, pageSize int) ([]Entry, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	if err := s.ensureLoaded(ctx); err != nil {
		return nil, 0, err
	}
	start := int64((page - 1) * pageSize)
	raw, err := s.rdb.LBRange(ctx, s.season, Mode, start, start+int64(pageSize)-1)
	if err != nil {
		return nil, 0, err
	}
	total, err := s.rdb.LBCard(ctx, s.season, Mode)
	if err != nil {
		return nil, 0, err
	}
	return s.decorate(ctx, raw, int(start)), total, nil
}

// Me returns the caller's rank/MMR (found=false when unranked).
func (s *Service) Me(ctx context.Context, accountID string) (rank int64, mmr int, found bool, err error) {
	if err := s.ensureLoaded(ctx); err != nil {
		return 0, 0, false, err
	}
	return s.rdb.LBRank(ctx, s.season, Mode, accountID)
}

// AroundMe returns a window of entries centered on the caller.
func (s *Service) AroundMe(ctx context.Context, accountID string, window int) ([]Entry, error) {
	if window < 1 || window > 25 {
		window = 5
	}
	rank, _, found, err := s.Me(ctx, accountID)
	if err != nil || !found {
		return nil, err
	}
	start := rank - int64(window)
	if start < 0 {
		start = 0
	}
	raw, err := s.rdb.LBRange(ctx, s.season, Mode, start, rank+int64(window))
	if err != nil {
		return nil, err
	}
	return s.decorate(ctx, raw, int(start)), nil
}

// Flush stops the debounce timer and snapshots synchronously (SIGTERM path).
func (s *Service) Flush(ctx context.Context) error {
	s.mu.Lock()
	if s.debounce != nil {
		s.debounce.Stop()
	}
	dirty := s.dirty || s.pDirty || len(s.cDirty) > 0
	s.mu.Unlock()
	if !dirty {
		return nil
	}
	return s.SnapshotNow(ctx)
}

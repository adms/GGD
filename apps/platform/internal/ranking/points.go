package ranking

import (
	"context"
	"errors"
	"regexp"
	"sort"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
)

// This file implements the VISIBLE cumulative-points ladder: the player board
// (one entry per account = total season points) and the per-champion boards
// (one entry per account per champion). Both live in Redis ZSETs keyed off
// season points and are backed by durable JSON snapshots under
// data/rankings/<season>/. Points are cumulative (not zero-sum) and floor at 0.

// PointsSnapshot is the durable player-board fallback at
// data/rankings/<season>/player-snapshot.json.
type PointsSnapshot struct {
	Season    string        `json:"season"`
	UpdatedAt time.Time     `json:"updatedAt"`
	Entries   []PointsEntry `json:"entries"`
}

// ChampionSnapshot is the durable per-champion fallback at
// data/rankings/<season>/champions/<championId>.json.
type ChampionSnapshot struct {
	Season     string        `json:"season"`
	ChampionID string        `json:"championId"`
	UpdatedAt  time.Time     `json:"updatedAt"`
	Entries    []PointsEntry `json:"entries"`
}

// PointsEntry is one snapshot row: an account's absolute cumulative points.
type PointsEntry struct {
	AccountID string `json:"accountId"`
	Points    int    `json:"points"`
}

// LadderMeta lists every champion board known to the season so a cold rebuild
// can discover them without scanning Redis keys.
type LadderMeta struct {
	Season      string    `json:"season"`
	UpdatedAt   time.Time `json:"updatedAt"`
	ChampionIDs []string  `json:"championIds"`
}

// PointsRow is one API row of a visible board.
type PointsRow struct {
	Rank      int    `json:"rank"`
	AccountID string `json:"accountId"`
	Username  string `json:"username"`
	Points    int    `json:"points"`
	Tier      string `json:"tier"`
	Division  string `json:"division"`
}

// PointsMe is the caller's own standing on the player board.
type PointsMe struct {
	Points     int     `json:"points"`
	Tier       string  `json:"tier"`
	Division   string  `json:"division"`
	Rank       int     `json:"rank"`       // 1-based
	Percentile float64 `json:"percentile"` // percent of the field ranked below the caller
}

// ChampionRow is one entry of the caller's per-champion standings.
type ChampionRow struct {
	ChampionID string `json:"championId"`
	Points     int    `json:"points"`
	Tier       string `json:"tier"`
	Division   string `json:"division"`
	Rank       int    `json:"rank"` // 1-based
}

func (s *Service) champCollection(season string) string {
	return "rankings/" + season + "/champions"
}

// championIDRe bounds the ids that may address a champion board: the id becomes
// a Redis key suffix AND a snapshot filename (data/rankings/<season>/champions/
// <championId>.json), so it is held to the content-id alphabet — the public
// board endpoint takes it straight from the URL.
var championIDRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`)

// ValidChampionID reports whether id may address a champion board.
func ValidChampionID(id string) bool { return championIDRe.MatchString(id) }

// Award is the absolute post-award standing produced by AwardPlacement.
type Award struct {
	AccountID string `json:"accountId"`
	Place     int    `json:"place"`
	// Delta is the placement award applied before the 0 floor.
	Delta int `json:"delta"`
	// Points is the absolute cumulative PLAYER-board total after the award.
	Points     int    `json:"points"`
	ChampionID string `json:"championId,omitempty"`
	// ChampionPoints is the absolute cumulative total on ChampionID (0 when the
	// champion is unknown).
	ChampionPoints int `json:"championPoints,omitempty"`
}

// AwardPlacement applies one ranked match's placement award to an account: it
// reads the durable account record, adds the placement delta (floored at 0) to
// BOTH the player total and that champion's track, persists the record and
// upserts both ZSETs. Returns the absolute post-award values.
//
// This is the delta-driven entry point (tools, admin, tests). The match
// settlement path does NOT call it: gamelink precomputes the same absolute
// values into the WAL settlement record (via LadderConfig.AwardPoints) and
// applies them through AddPoints/AddChampionPoints, so a replayed or
// duplicated callback converges instead of double-counting.
func (s *Service) AwardPlacement(ctx context.Context, accountID, championID string, place int) (Award, error) {
	a, err := s.accounts.GetByID(ctx, accountID)
	if err != nil {
		return Award{}, err
	}
	aw := Award{
		AccountID: accountID, Place: place, Delta: s.ladder.PlacementDelta(place),
		Points: s.ladder.AwardPoints(a.SeasonPoints, place), ChampionID: championID,
	}
	if championID != "" {
		aw.ChampionPoints = s.ladder.AwardPoints(a.ChampionPoints[championID], place)
	}
	// Account JSON is the durable truth (a Redis wipe rebuilds both boards from
	// it); the ZSETs mirror the same absolute values.
	if err := s.accounts.SetSeasonPoints(ctx, accountID, aw.Points, championID, aw.ChampionPoints); err != nil {
		return aw, err
	}
	if err := s.AddPoints(ctx, accountID, aw.Points); err != nil {
		return aw, err
	}
	if championID != "" {
		if err := s.AddChampionPoints(ctx, accountID, championID, aw.ChampionPoints); err != nil {
			return aw, err
		}
	}
	return aw, nil
}

// AddPoints upserts an absolute cumulative points score onto the player board
// and marks the player snapshot dirty. Scores are floored at 0 by the caller.
func (s *Service) AddPoints(ctx context.Context, accountID string, points int) error {
	if err := s.rdb.LBAdd(ctx, s.season, ModePlayer, accountID, float64(FloorPoints(points))); err != nil {
		return err
	}
	s.invalidateApex(s.season, ModePlayer)
	s.markPlayerDirty()
	return nil
}

// AddChampionPoints upserts an absolute cumulative points score onto one
// champion board and marks that champion's snapshot dirty.
func (s *Service) AddChampionPoints(ctx context.Context, accountID, championID string, points int) error {
	if !ValidChampionID(championID) {
		return nil // unknown/malformed champion: the player total still counts
	}
	if err := s.rdb.LBAdd(ctx, s.season, ModeChampion(championID), accountID, float64(FloorPoints(points))); err != nil {
		return err
	}
	s.invalidateApex(s.season, ModeChampion(championID))
	s.markChampDirty(championID)
	return nil
}

func (s *Service) markPlayerDirty() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pDirty = true
	s.scheduleLocked()
}

func (s *Service) markChampDirty(championID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cDirty[championID] = true
	s.champIDs[championID] = true
	s.scheduleLocked()
}

// snapshotPoints writes the player board, every given champion board and the
// meta index to durable JSON. Called with the timer held clear of s.mu.
func (s *Service) snapshotPoints(ctx context.Context, champs []string) error {
	if err := s.snapshotPlayer(ctx); err != nil {
		return err
	}
	sort.Strings(champs)
	for _, id := range champs {
		if err := s.snapshotChampion(ctx, id); err != nil {
			return err
		}
	}
	return s.snapshotMeta(ctx, champs)
}

func (s *Service) snapshotPlayer(ctx context.Context) error {
	entries, err := s.rdb.LBRange(ctx, s.season, ModePlayer, 0, -1)
	if err != nil {
		return err
	}
	snap := PointsSnapshot{Season: s.season, UpdatedAt: time.Now()}
	for _, e := range entries {
		snap.Entries = append(snap.Entries, PointsEntry{AccountID: e.AccountID, Points: e.MMR})
	}
	return s.store.Put(s.snapshotCollection(), "player-snapshot", snap)
}

func (s *Service) snapshotChampion(ctx context.Context, championID string) error {
	entries, err := s.rdb.LBRange(ctx, s.season, ModeChampion(championID), 0, -1)
	if err != nil {
		return err
	}
	snap := ChampionSnapshot{Season: s.season, ChampionID: championID, UpdatedAt: time.Now()}
	for _, e := range entries {
		snap.Entries = append(snap.Entries, PointsEntry{AccountID: e.AccountID, Points: e.MMR})
	}
	return s.store.Put(s.champCollection(s.season), championID, snap)
}

func (s *Service) snapshotMeta(ctx context.Context, champs []string) error {
	return s.store.Put(s.snapshotCollection(), "meta", LadderMeta{
		Season: s.season, UpdatedAt: time.Now(), ChampionIDs: champs,
	})
}

// ensureLoadedPlayer rehydrates the player ZSET from its snapshot when Redis is
// cold (mirrors the MMR ensureLoaded fallback).
func (s *Service) ensureLoadedPlayer(ctx context.Context, season string) error {
	n, err := s.rdb.LBCard(ctx, season, ModePlayer)
	if err != nil || n > 0 {
		return err
	}
	var snap PointsSnapshot
	err = s.store.Get("rankings/"+season, "player-snapshot", &snap)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	pipe := s.rdb.R.Pipeline()
	for _, e := range snap.Entries {
		pipe.ZAdd(ctx, redisx.KeyLeaderboard(season, ModePlayer),
			redis.Z{Score: float64(e.Points), Member: e.AccountID})
	}
	_, err = pipe.Exec(ctx)
	return err
}

// ensureLoadedChampion rehydrates one champion ZSET from its snapshot when
// Redis is cold.
func (s *Service) ensureLoadedChampion(ctx context.Context, season, championID string) error {
	n, err := s.rdb.LBCard(ctx, season, ModeChampion(championID))
	if err != nil || n > 0 {
		return err
	}
	var snap ChampionSnapshot
	err = s.store.Get(s.champCollection(season), championID, &snap)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	pipe := s.rdb.R.Pipeline()
	for _, e := range snap.Entries {
		pipe.ZAdd(ctx, redisx.KeyLeaderboard(season, ModeChampion(championID)),
			redis.Z{Score: float64(e.Points), Member: e.AccountID})
	}
	_, err = pipe.Exec(ctx)
	return err
}

// sortBoard orders a raw ZSET slice deterministically: score desc, then
// accountID desc — exactly the order ZREVRANGE uses for equal scores, so page
// slices stay consistent across page boundaries.
func sortBoard(raw []redisx.LBEntry) {
	sort.SliceStable(raw, func(i, j int) bool {
		if raw[i].MMR != raw[j].MMR {
			return raw[i].MMR > raw[j].MMR
		}
		return raw[i].AccountID > raw[j].AccountID
	})
}

// apexEntry is one cached apex pass.
type apexEntry struct {
	at    time.Time
	tiers map[string]string
}

func apexKey(season, mode string) string { return season + "|" + mode }

// invalidateApex drops one board's cached apex pass (called on every points
// write so a fresh award is reflected immediately).
func (s *Service) invalidateApex(season, mode string) {
	s.apexMu.Lock()
	defer s.apexMu.Unlock()
	delete(s.apexCache, apexKey(season, mode))
}

// InvalidateApex drops every cached apex pass. The boot rebuild writes the
// ZSETs behind the service's back, so it calls this once it is done.
func (s *Service) InvalidateApex() {
	s.apexMu.Lock()
	defer s.apexMu.Unlock()
	s.apexCache = map[string]apexEntry{}
}

// apexTiers returns accountID → apex tier (菁英/宗師) for one board, computed by
// a cached TOP-OF-BOARD pass: only the first ChallengerFrac+GrandmasterFrac of
// the ladder can be apex, so the scan reads a small window instead of the whole
// board. Apex-ineligible accounts (fewer than MinApexGames settled matches) are
// skipped, so the window grows until every place is filled or the board runs
// out.
func (s *Service) apexTiers(ctx context.Context, season, mode string) (map[string]string, error) {
	key := apexKey(season, mode)
	s.apexMu.Lock()
	if e, ok := s.apexCache[key]; ok && time.Since(e.at) < s.apexTTL {
		s.apexMu.Unlock()
		return e.tiers, nil
	}
	s.apexMu.Unlock()

	total, err := s.rdb.LBCard(ctx, season, mode)
	if err != nil {
		return nil, err
	}
	challenger, grandmaster := s.ladder.ApexCounts(int(total))
	places := challenger + grandmaster
	tiers := map[string]string{}
	for window := int64(places*2 + 16); places > 0; window *= 2 {
		if window > total {
			window = total
		}
		raw, err := s.rdb.LBRange(ctx, season, mode, 0, window-1)
		if err != nil {
			return nil, err
		}
		sortBoard(raw)
		rows := make([]ApexCandidate, 0, len(raw))
		for _, e := range raw {
			cand := ApexCandidate{AccountID: e.AccountID, Points: e.MMR}
			if a, err := s.accounts.GetByID(ctx, e.AccountID); err == nil {
				cand.Games = a.Games
			}
			rows = append(rows, cand)
		}
		tiers = s.ladder.AssignApex(rows, int(total))
		if len(tiers) >= places || window >= total {
			break
		}
	}
	s.apexMu.Lock()
	s.apexCache[key] = apexEntry{at: time.Now(), tiers: tiers}
	s.apexMu.Unlock()
	return tiers, nil
}

// decoratePoints sorts a raw ZSET slice deterministically, resolves each row's
// tier/division (apex tiers from the board-wide pass, everything else from the
// points thresholds) and hydrates usernames from the account repo.
func (s *Service) decoratePoints(ctx context.Context, raw []redisx.LBEntry, startRank int, apex map[string]string) []PointsRow {
	sortBoard(raw)
	out := make([]PointsRow, 0, len(raw))
	for i, e := range raw {
		tier, div := s.ladder.Resolve(e.MMR, apex[e.AccountID])
		row := PointsRow{
			Rank: startRank + i + 1, AccountID: e.AccountID, Points: e.MMR,
			Tier: tier, Division: div,
		}
		if a, err := s.accounts.GetByID(ctx, e.AccountID); err == nil {
			row.Username = a.Username
		}
		out = append(out, row)
	}
	return out
}

// PlayerPage returns one page of the player board (limit/offset), the total
// board size, and per-row tier/division (apex tiers resolved by rank).
func (s *Service) PlayerPage(ctx context.Context, season string, limit, offset int) ([]PointsRow, int64, error) {
	season = s.seasonOr(season)
	limit, offset = clampWindow(limit, offset)
	if err := s.ensureLoadedPlayer(ctx, season); err != nil {
		return nil, 0, err
	}
	raw, err := s.rdb.LBRange(ctx, season, ModePlayer, int64(offset), int64(offset+limit-1))
	if err != nil {
		return nil, 0, err
	}
	total, err := s.rdb.LBCard(ctx, season, ModePlayer)
	if err != nil {
		return nil, 0, err
	}
	apex, err := s.apexTiers(ctx, season, ModePlayer)
	if err != nil {
		return nil, 0, err
	}
	return s.decoratePoints(ctx, raw, offset, apex), total, nil
}

// PlayerMe returns the caller's standing on the player board (found=false when
// the caller has no ranked points yet).
func (s *Service) PlayerMe(ctx context.Context, season, accountID string) (PointsMe, bool, error) {
	season = s.seasonOr(season)
	if err := s.ensureLoadedPlayer(ctx, season); err != nil {
		return PointsMe{}, false, err
	}
	rank, points, found, err := s.rdb.LBRank(ctx, season, ModePlayer, accountID)
	if err != nil || !found {
		return PointsMe{}, false, err
	}
	total, err := s.rdb.LBCard(ctx, season, ModePlayer)
	if err != nil {
		return PointsMe{}, false, err
	}
	apex, err := s.apexTiers(ctx, season, ModePlayer)
	if err != nil {
		return PointsMe{}, false, err
	}
	tier, div := s.ladder.Resolve(points, apex[accountID])
	return PointsMe{
		Points: points, Tier: tier, Division: div,
		Rank: int(rank) + 1, Percentile: percentile(rank, total),
	}, true, nil
}

// ChampionPage returns one page of a champion board. An id outside the
// content-id alphabet can address no board and answers empty.
func (s *Service) ChampionPage(ctx context.Context, championID string, limit, offset int) ([]PointsRow, int64, error) {
	limit, offset = clampWindow(limit, offset)
	if !ValidChampionID(championID) {
		return nil, 0, nil
	}
	if err := s.ensureLoadedChampion(ctx, s.season, championID); err != nil {
		return nil, 0, err
	}
	raw, err := s.rdb.LBRange(ctx, s.season, ModeChampion(championID), int64(offset), int64(offset+limit-1))
	if err != nil {
		return nil, 0, err
	}
	total, err := s.rdb.LBCard(ctx, s.season, ModeChampion(championID))
	if err != nil {
		return nil, 0, err
	}
	apex, err := s.apexTiers(ctx, s.season, ModeChampion(championID))
	if err != nil {
		return nil, 0, err
	}
	return s.decoratePoints(ctx, raw, offset, apex), total, nil
}

// MyChampions returns the caller's per-champion standings, one row per champion
// the account has ever played (sorted by championId). Champions the account
// has played are read from the durable account record so the list survives a
// cold Redis; the rank/tier are resolved against each champion board.
func (s *Service) MyChampions(ctx context.Context, accountID string) ([]ChampionRow, error) {
	a, err := s.accounts.GetByID(ctx, accountID)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(a.ChampionPoints))
	for id := range a.ChampionPoints {
		if !ValidChampionID(id) {
			continue // no board can exist under a malformed id
		}
		ids = append(ids, id)
	}
	sort.Strings(ids)
	rows := make([]ChampionRow, 0, len(ids))
	for _, id := range ids {
		if err := s.ensureLoadedChampion(ctx, s.season, id); err != nil {
			return nil, err
		}
		rank, points, found, err := s.rdb.LBRank(ctx, s.season, ModeChampion(id), accountID)
		if err != nil {
			return nil, err
		}
		var tier, div string
		var rankOut int
		if found {
			apex, err := s.apexTiers(ctx, s.season, ModeChampion(id))
			if err != nil {
				return nil, err
			}
			tier, div = s.ladder.Resolve(points, apex[accountID])
			rankOut = int(rank) + 1
		} else {
			// Defensive: board unavailable — fall back to the record's points
			// without an apex-by-rank claim.
			points = a.ChampionPoints[id]
			tier, div = s.ladder.BaseTier(points)
		}
		rows = append(rows, ChampionRow{
			ChampionID: id, Points: points, Tier: tier, Division: div, Rank: rankOut,
		})
	}
	return rows, nil
}

// clampWindow normalizes limit/offset to sane bounds.
func clampWindow(limit, offset int) (int, int) {
	if limit < 1 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

// percentile is the percent of the field ranked strictly below the caller:
// the best player (rank 0) is 100, the last is 0.
func percentile(rank, total int64) float64 {
	if total <= 1 {
		return 100
	}
	return float64(total-rank-1) / float64(total-1) * 100
}

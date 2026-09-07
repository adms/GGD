package gamelink_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ggd/platform/internal/community"
	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/gamelink"
	"github.com/ggd/platform/internal/server"
	"github.com/ggd/platform/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestPublishedHeroReservationUsesOfficialSettlement(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		t.Run(fmt.Sprintf("legacy=%v", legacy), func(t *testing.T) { publishedHeroSettlement(t, legacy) })
	}
}

func publishedHeroSettlement(t *testing.T, legacy bool) {
	requests := make(chan gamelink.MatchRequest, 1)
	// Only the game reservation response is a transport fixture. Room ownership,
	// pending metadata, signed result, WAL and account settlement are real.
	game := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if !gamelink.Verify(testutil.GameSecret, r.Header.Get(gamelink.HeaderTimestamp), r.Header.Get(gamelink.HeaderAuth), raw, time.Now(), 30*time.Second) {
			w.WriteHeader(401)
			return
		}
		var input gamelink.MatchRequest
		if json.Unmarshal(raw, &input) != nil || len(input.CommunityHeroes) != 1 {
			w.WriteHeader(400)
			return
		}
		requests <- input
		output := gamelink.MatchResponse{MatchID: input.MatchID, ColyseusRoomID: "community-room", Endpoint: "ws://fixture", CommunityContent: json.RawMessage(`{"digest":"transport-fixture"}`)}
		for _, seat := range input.Seats {
			if !seat.IsBot {
				output.Reservations = append(output.Reservations, gamelink.Reservation{AccountID: seat.AccountID, SeatToken: "token"})
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(output)
	}))
	defer game.Close()
	pin := community.HeroPin{WorkID: "hero-proof", SubmissionID: "submission", AuthorID: "author", AuthorName: "作者", Name: "英雄", PackageDigest: "sha256:" + strings.Repeat("a", 64), SnapshotDigest: "sha256:" + strings.Repeat("b", 64)}
	ts := testutil.NewFreshDeployWith(t, func(s *server.Server) {
		s.Gamelink.SetCommunityResolver(func(_ context.Context, ids []string) ([]community.HeroPin, error) {
			require.Empty(t, ids, "room settings must not select the official roster")
			return []community.HeroPin{pin}, nil
		})
	}, func(c *config.Config) { c.GameServerAddr = game.URL })
	host, guest := ts.Register("communityhost"), ts.Register("communityguest")
	r := ts.Do("POST", "/api/v1/rooms", host.Access, map[string]any{"name": "正式英雄驗證"})
	require.Equal(t, 200, r.Status, string(r.Raw))
	rid := r.Body["room"].(map[string]any)["id"].(string)
	require.Equal(t, 200, ts.Do("POST", "/api/v1/rooms/"+rid+"/join", guest.Access, nil).Status)
	require.Equal(t, 200, ts.Do("POST", "/api/v1/rooms/"+rid+"/ready", guest.Access, map[string]bool{"ready": true}).Status)
	r = ts.Do("POST", "/api/v1/rooms/"+rid+"/start", host.Access, nil)
	require.Equal(t, 200, r.Status, string(r.Raw))
	mid := r.Body["matchId"].(string)
	request := <-requests
	require.Equal(t, []community.HeroPin{pin}, request.CommunityHeroes)
	for _, seat := range request.Seats {
		if !seat.IsBot {
			require.Contains(t, seat.Owned, pin.WorkID)
		}
	}
	require.Empty(t, ts.Mini.HGet(redisx.KeyMatchPending(mid), "community"))
	require.NotEmpty(t, ts.Mini.HGet(redisx.KeyMatchPending(mid), "communityContent"))
	if legacy {
		ts.Mini.HSet(redisx.KeyMatchPending(mid), "community", "1")
	}
	before, err := ts.Srv.Accounts.GetByID(t.Context(), host.ID)
	require.NoError(t, err)
	walletBefore, err := ts.Srv.Wallet.Get(t.Context(), host.ID)
	require.NoError(t, err)
	code, ack := postResult(t, ts.HTTP.URL, mid, gameServerBody(t, mid, host.ID, guest.ID))
	require.Equal(t, 200, code)
	if legacy {
		require.EqualValues(t, 0, ack["settled"])
	} else {
		require.EqualValues(t, 2, ack["settled"])
	}
	after, err := ts.Srv.Accounts.GetByID(t.Context(), host.ID)
	require.NoError(t, err)
	if legacy {
		require.Equal(t, before.MMR, after.MMR)
		require.Equal(t, before.Games, after.Games)
		require.Equal(t, before.Wins, after.Wins)
	} else {
		require.Equal(t, before.Games+1, after.Games)
		require.Equal(t, before.Wins+1, after.Wins)
	}
	walletAfter, err := ts.Srv.Wallet.Get(t.Context(), host.ID)
	require.NoError(t, err)
	if legacy {
		require.Equal(t, walletBefore, walletAfter)
	} else {
		require.NotEqual(t, walletBefore, walletAfter)
	}
	var record gamelink.Settlement
	require.NoError(t, ts.Srv.Store.Get(gamelink.MatchCollection(time.Now()), mid, &record))
	require.Equal(t, legacy, record.Community)
	require.NotEmpty(t, record.CommunityContent)
	if legacy {
		require.Empty(t, record.Ratings)
	} else {
		require.Len(t, record.Ratings, 2)
	}
	require.False(t, ts.Mini.Exists(redisx.KeyMatchPending(mid)))
	// WAL replay preserves both old eligibility and the immutable content pins.
	settler := gamelink.NewSettler(ts.Srv.Store, ts.Srv.Rdb, ts.Srv.Accounts, ts.Srv.Presence, ts.Srv.Ranking, ts.Srv.Rooms, ts.Srv.Wallet)
	require.NoError(t, settler.Apply(t.Context(), record))
	after, err = ts.Srv.Accounts.GetByID(t.Context(), host.ID)
	require.NoError(t, err)
	if legacy {
		require.Equal(t, before.Games, after.Games)
	} else {
		require.Equal(t, before.Games+1, after.Games)
	}
}

func TestCommunityContentProxyBindsIdentityAndTicket(t *testing.T) {
	requests := make(chan map[string]string, 8)
	game := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if r.URL.Path != "/_internal/community-content" || !gamelink.Verify(testutil.GameSecret, r.Header.Get(gamelink.HeaderTimestamp), r.Header.Get(gamelink.HeaderAuth), raw, time.Now(), 30*time.Second) {
			w.WriteHeader(401)
			return
		}
		var input map[string]string
		_ = json.Unmarshal(raw, &input)
		requests <- input
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"communityContent":null}`))
	}))
	defer game.Close()
	ts := testutil.New(t, func(c *config.Config) { c.GameServerAddr = game.URL })
	u := ts.Register("contentreader")
	require.Equal(t, 401, ts.Do("GET", "/api/v1/community-matches/game", "", nil).Status)
	require.Empty(t, requests)
	require.Equal(t, 200, ts.Do("GET", "/api/v1/community-matches/game", u.Access, nil).Status)
	got := <-requests
	require.Equal(t, u.ID, got["accountId"])
	require.Equal(t, "game", got["matchId"])
	digest := "sha256:" + strings.Repeat("c", 64)
	require.Equal(t, 200, ts.Do("POST", "/api/v1/community-matches/game/ready", u.Access, map[string]string{"digest": digest}).Status)
	require.Equal(t, digest, (<-requests)["readyDigest"])
	require.Equal(t, 401, ts.Do("POST", "/api/v1/replay-content/game", "", map[string]string{"ticket": ""}).Status)
	require.Equal(t, 200, ts.Do("POST", "/api/v1/replay-content/game", "", map[string]string{"ticket": "short-lived-ticket"}).Status)
	got = <-requests
	require.Equal(t, "game", got["replayId"])
	require.Equal(t, "short-lived-ticket", got["ticket"])
	require.Empty(t, got["accountId"])
}

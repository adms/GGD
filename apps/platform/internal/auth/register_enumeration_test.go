package auth_test

// GH#179 — the SHAPE of /auth/register's conflict answer.
//
// ⚠️ THIS FILE USED TO CLAIM SOMETHING FALSE. Its header said "/auth/register
// must not answer 'does this person have an account here?', in words or in
// milliseconds", and all three guards below were green while it answered
// exactly that. They still are, because none of them can see it: an attacker
// pairs the value under test with a counterpart they KNOW is fresh and reads
// the STATUS CODE (409 = taken, 201 = free). Merging the two 409s removes only
// information that attacker already had; equalising their latency hides nothing
// a status code already announces.
//
// So: what this file guards is the shape of the 409 itself. What guards the
// ORACLE is register_oracle_residual_test.go — the #174 invite gate, plus an
// honest, measured account of the channel that is still open. Read that one
// before believing anything here closes enumeration.
//
// What these three DO pin, and it is worth pinning:
//
//   - TestRegisterConflictNeverNamesTheField compares response BYTES, so a
//     conflict cannot report WHICH of two submitted values was taken (the case
//     where the caller submitted two values they both care about), and the
//     cached and durable code paths cannot drift into two different answers.
//   - TestRegisterConflictPaysTheHash compares TIME. It is a statistic, so it
//     carries its own calibration probe: if the harness cannot resolve the cost
//     of one hash, the test says so instead of passing. It catches the argon2
//     ordering and nothing smaller.
//   - TestRegisterConflictCostsTheSameRoundTrips COUNTS Redis commands, which
//     is how the sub-millisecond half of that channel — the one the timing test
//     provably cannot resolve — is pinned exactly.
//   - TestReleaseReservationsKeepsOtherAccountsReservations reads the Redis
//     KEYSPACE, because the rollback's ownership discipline is invisible in
//     every response body (which is how it went untested until 2026-07-30).

import (
	"fmt"
	"math"
	"net/http"
	"slices"
	"testing"
	"time"

	"github.com/alexedwards/argon2id"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/data/redisx"
	"github.com/ggd/platform/internal/testutil"
	"github.com/ggd/platform/pkg/testkit"
)

const registerPath = "/api/v1/auth/register"

// TestRegisterConflictNeverNamesTheField pins the response half.
//
// All FOUR ways a registration can collide must produce byte-identical
// responses. The last two matter as much as the first two: uniqueness is
// enforced twice — once by the Redis reservation and once, after a cache wipe,
// by the durable store — and only fixing the first would leave the oracle one
// `FLUSHALL` away from coming back (failure ⑤: the branch under test was not
// the branch that answers).
func TestRegisterConflictNeverNamesTheField(t *testing.T) {
	testkit.Cover(t, "auth-register-conflict-indistinguishable")
	ts := testutil.New(t)
	ts.Register("victim") // victim / victim@example.com

	probe := func(username, email string) testutil.Resp {
		return ts.Do(http.MethodPost, registerPath, "", map[string]string{
			"username": username, "email": email, "password": "hunter2hunter2",
		})
	}

	byUsername := probe("victim", "stranger@example.com")
	byEmail := probe("stranger", "victim@example.com")
	byBoth := probe("victim", "victim@example.com")

	for name, r := range map[string]testutil.Resp{
		"username collision": byUsername,
		"email collision":    byEmail,
		"both collide":       byBoth,
	} {
		require.Equal(t, http.StatusConflict, r.Status, "%s: %s", name, string(r.Raw))
		assert.NotContains(t, string(r.Raw), "victim",
			"%s: the response echoed the value that collided", name)
	}
	assert.Equal(t, string(byUsername.Raw), string(byEmail.Raw),
		"a taken username and a taken email must be the same answer")
	assert.Equal(t, string(byUsername.Raw), string(byBoth.Raw))

	// Now the DURABLE half. With the Redis index wiped, the reservation above
	// succeeds and it is account.Create that refuses — a different code path,
	// which used to have its own copy of the two distinguishable messages.
	ts.Mini.FlushAll()
	durableUsername := probe("victim", "stranger2@example.com")
	durableEmail := probe("stranger2", "victim@example.com")

	require.Equal(t, http.StatusConflict, durableUsername.Status, string(durableUsername.Raw))
	require.Equal(t, http.StatusConflict, durableEmail.Status, string(durableEmail.Raw))
	assert.Equal(t, string(durableUsername.Raw), string(durableEmail.Raw),
		"the durable-store conflict must not name the field either")
	assert.Equal(t, string(byUsername.Raw), string(durableUsername.Raw),
		"the cached and durable conflicts must be the same answer, or the cache state is the oracle")
}

// TestRegisterConflictPaysTheHash pins the timing half: a registration that
// ends in 409 must have done the same argon2id work as one that ends in 201, so
// a stopwatch cannot read the answer the message refuses to give.
//
// HOW IT AVOIDS BEING A FAKE GUARD. A lower bound on a latency is trivially
// satisfiable by an unrelated slow step, so the test first MEASURES its own
// resolution: `noHash` times a registration rejected before any hashing (an
// invalid password), and the test refuses to conclude anything unless that
// baseline sits well under one hash. The margin between the two is then what
// the conflict probes have to clear.
//
// Verified by mutation: with HashPassword moved back below the uniqueness
// reservation, the conflict medians collapse onto `noHash` and both bounds
// fail.
func TestRegisterConflictPaysTheHash(t *testing.T) {
	testkit.Cover(t, "auth-register-conflict-constant-time")
	if testing.Short() {
		t.Skip("timing measurement")
	}
	ts := testutil.New(t)
	ts.Register("victim")

	// The unit everything below is expressed in: one argon2id at exactly the
	// parameters this deploy hashes with. Read from the same params the service
	// was built with, so raising the cost cannot silently rescale the guard.
	hashCost := medianOf(t, 7, func(int) time.Duration {
		start := time.Now()
		_, err := argon2id.CreateHash("timing-probe-password", testutil.LightArgon2)
		require.NoError(t, err)
		return time.Since(start)
	})

	const samples = 15
	post := func(body map[string]string, wantStatus int) time.Duration {
		start := time.Now()
		r := ts.Do(http.MethodPost, registerPath, "", body)
		d := time.Since(start)
		require.Equal(t, wantStatus, r.Status, string(r.Raw))
		return d
	}

	probeTakenUser := func(i int) time.Duration {
		return post(map[string]string{
			"username": "victim", // the taken one
			"email":    fmt.Sprintf("probeu%d@example.com", i),
			"password": "hunter2hunter2",
		}, http.StatusConflict)
	}
	probeTakenMail := func(i int) time.Duration {
		return post(map[string]string{
			"username": fmt.Sprintf("probem%d", i),
			"email":    "victim@example.com", // the taken one
			"password": "hunter2hunter2",
		}, http.StatusConflict)
	}

	// Interleaved, so a machine that gets busy halfway through skews every
	// series equally instead of manufacturing a difference between them — AND
	// order-balanced, because it turned out position matters: whichever conflict
	// probe ran second in an iteration came back a reproducible ~0.4 ms faster
	// (measured; swapping the two swapped the sign). Fixing the order would have
	// made this test report a 0.4 ms "leak" that has nothing to do with which
	// field collided — failure ④, an assertion pointed at the wrong thing.
	noHash := make([]time.Duration, 0, samples)
	takenUser := make([]time.Duration, 0, samples)
	takenMail := make([]time.Duration, 0, samples)
	for i := range samples {
		noHash = append(noHash, post(map[string]string{
			"username": fmt.Sprintf("nohash%d", i),
			"email":    fmt.Sprintf("nohash%d@example.com", i),
			"password": "short", // refused by ValidateRegistration, before any hash
		}, http.StatusBadRequest))
		if i%2 == 0 {
			takenUser = append(takenUser, probeTakenUser(i))
			takenMail = append(takenMail, probeTakenMail(i))
		} else {
			takenMail = append(takenMail, probeTakenMail(i))
			takenUser = append(takenUser, probeTakenUser(i))
		}
	}

	medNoHash, medUser, medMail := median(noHash), median(takenUser), median(takenMail)
	t.Logf("one argon2id = %v | no-hash rejection = %v | username taken = %v | email taken = %v",
		hashCost, medNoHash, medUser, medMail)

	// (0) Resolution check. If a request that skips hashing already costs as
	// much as a hash, this harness cannot see the thing being asserted and a
	// green result would mean nothing.
	require.Less(t, medNoHash, hashCost/2,
		"inconclusive: the harness cannot resolve one argon2id (%v) against its own overhead (%v)",
		hashCost, medNoHash)

	// (1) Both conflict answers really pay the hash.
	floor := medNoHash + hashCost/2
	assert.Greater(t, medUser, floor, "a taken username short-circuits the hash")
	assert.Greater(t, medMail, floor, "a taken email short-circuits the hash")

	// (2) And they pay the SAME amount: whichever value collided, the two
	// distributions have to sit on top of each other. Half a hash is the
	// tolerance because half a hash is the smallest signal that would be worth
	// anything to an attacker here.
	assert.Less(t, absDur(medUser-medMail), hashCost/2,
		"which field collided is readable from the response time")
}

// TestRegisterConflictCostsTheSameRoundTrips is the EXACT half of the timing
// story, and it exists because the timing test above cannot see this.
//
// Before GH#179 a taken username short-circuited after ONE Redis command while
// a taken email cost three (two SETNX plus the rollback DELETE). That is the
// same enumeration answer measured in round trips instead of milliseconds. It
// is also far too small to show up next to an argon2id — verified: with the
// asymmetric shape restored, TestRegisterConflictPaysTheHash stays GREEN. So it
// is counted rather than timed.
//
// Counting is not a proxy for the behaviour here; the number of round trips IS
// the channel. The MINIMUM over repeats is used because a background sweeper
// can only ever ADD commands, never remove them.
func TestRegisterConflictCostsTheSameRoundTrips(t *testing.T) {
	testkit.Cover(t, "auth-register-conflict-roundtrips")
	ts := testutil.New(t)
	ts.Register("victim")

	commandsFor := func(body map[string]string) int {
		before := ts.Mini.CommandCount()
		r := ts.Do(http.MethodPost, registerPath, "", body)
		require.Equal(t, http.StatusConflict, r.Status, string(r.Raw))
		return ts.Mini.CommandCount() - before
	}

	const repeats = 5
	minUser, minMail, minBoth := math.MaxInt, math.MaxInt, math.MaxInt
	for i := range repeats {
		minUser = min(minUser, commandsFor(map[string]string{
			"username": "victim",
			"email":    fmt.Sprintf("rtu%d@example.com", i),
			"password": "hunter2hunter2",
		}))
		minMail = min(minMail, commandsFor(map[string]string{
			"username": fmt.Sprintf("rtm%d", i),
			"email":    "victim@example.com",
			"password": "hunter2hunter2",
		}))
		// Both taken — the case in which the rollback owns NEITHER key, so it is
		// the padding in releaseReservations that keeps the count level.
		minBoth = min(minBoth, commandsFor(map[string]string{
			"username": "victim",
			"email":    "victim@example.com",
			"password": "hunter2hunter2",
		}))
	}
	t.Logf("redis commands: username taken = %d | email taken = %d | both taken = %d",
		minUser, minMail, minBoth)
	assert.Equal(t, minUser, minMail,
		"which field collided is readable from the number of Redis round trips")
	assert.Equal(t, minUser, minBoth,
		"whether BOTH collided is readable from the number of Redis round trips")
}

// TestReleaseReservationsKeepsOtherAccountsReservations guards the ownership
// discipline in Service.releaseReservations, which had NO guard at all: swap
// the padded, ownership-aware DELETE for an unconditional
// `Del(KeyIdxUsername, KeyIdxEmail)` and `go test ./internal/auth/...` stays
// entirely green (verified 2026-07-30, before this test existed).
//
// IT READS REDIS, NOT A RESPONSE BODY, and it has to. Every response is
// identical either way: measured under the unconditional-DELETE mutation, the
// follow-up "thief" registration still comes back 409 on both fields, because
// account.Repo.Create re-checks uniqueness against the DURABLE store. That is
// also why the old comment on releaseReservations — "would let the next
// registration take that account's username" — was false, and why the second
// half of this test pins the TRUE statement in its place: even with the
// reservation deliberately wiped, the value is not stealable.
//
// So the assertion is on the mechanism: a registration must not delete an index
// key it does not own. What that buys is defence in depth and cost, both of
// which are real and neither of which shows up in a status code.
func TestReleaseReservationsKeepsOtherAccountsReservations(t *testing.T) {
	testkit.Cover(t, "auth-register-rollback-owns-only-its-own-keys")
	ts := testutil.New(t)
	ts.Register("victim") // victim / victim@example.com

	victimUser := redisx.KeyIdxUsername("victim")
	victimMail := redisx.KeyIdxEmail("victim@example.com")
	require.True(t, ts.Mini.Exists(victimUser), "fixture: the victim's username reservation should exist")
	require.True(t, ts.Mini.Exists(victimMail), "fixture: the victim's email reservation should exist")

	probe := func(username, email string) testutil.Resp {
		return ts.Do(http.MethodPost, registerPath, "", map[string]string{
			"username": username, "email": email, "password": "hunter2hunter2",
		})
	}

	// Collide on the EMAIL only. The caller OWNS idx:username:stranger (its own
	// fresh SETNX) and does NOT own idx:email:victim@example.com.
	require.Equal(t, http.StatusConflict, probe("stranger", "victim@example.com").Status)
	assert.True(t, ts.Mini.Exists(victimMail),
		"the rollback deleted the victim's EMAIL reservation — it only owned the username it reserved")
	assert.False(t, ts.Mini.Exists(redisx.KeyIdxUsername("stranger")),
		"the rollback kept its OWN username reservation, so a retry of that name would wrongly conflict")

	// Mirror case: collide on the USERNAME only.
	require.Equal(t, http.StatusConflict, probe("victim", "stranger@example.com").Status)
	assert.True(t, ts.Mini.Exists(victimUser),
		"the rollback deleted the victim's USERNAME reservation — it only owned the email it reserved")
	assert.False(t, ts.Mini.Exists(redisx.KeyIdxEmail("stranger@example.com")),
		"the rollback kept its OWN email reservation")

	// Both collide: the rollback owns NEITHER key, so it must delete neither.
	require.Equal(t, http.StatusConflict, probe("victim", "victim@example.com").Status)
	assert.True(t, ts.Mini.Exists(victimUser), "both-collide rollback deleted the victim's username reservation")
	assert.True(t, ts.Mini.Exists(victimMail), "both-collide rollback deleted the victim's email reservation")

	// ---- and now the claim that REPLACED the false one -----------------------
	//
	// Wipe the reservations by hand — the exact state the unconditional DELETE
	// would leave behind — and show the account is STILL not stealable, because
	// account.Repo.Create verifies uniqueness against the durable store under a
	// per-index-key mutex. If this half ever goes red, losing a reservation has
	// become a real account takeover and the padding above stops being defence
	// in depth and becomes the only defence.
	ts.Mini.Del(victimUser)
	ts.Mini.Del(victimMail)
	stealName := probe("victim", "thief1@example.com")
	stealMail := probe("thief2", "victim@example.com")
	assert.Equal(t, http.StatusConflict, stealName.Status,
		"with the Redis reservation gone a thief TOOK the username: %s", string(stealName.Raw))
	assert.Equal(t, http.StatusConflict, stealMail.Status,
		"with the Redis reservation gone a thief TOOK the email: %s", string(stealMail.Raw))
}

func absDur(d time.Duration) time.Duration {
	if d < 0 {
		return -d
	}
	return d
}

func median(xs []time.Duration) time.Duration {
	sorted := slices.Clone(xs)
	slices.Sort(sorted)
	return sorted[len(sorted)/2]
}

func medianOf(t *testing.T, n int, sample func(i int) time.Duration) time.Duration {
	t.Helper()
	xs := make([]time.Duration, 0, n)
	for i := range n {
		xs = append(xs, sample(i))
	}
	return median(xs)
}

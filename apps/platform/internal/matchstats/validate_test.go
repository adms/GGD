package matchstats_test

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/matchstats"
)

// ---------------------------------------------------------------------------
// THE ALLOWLIST. A section name this build does not know reads back as "that
// match had none of those" — a wrong answer, not a missing one.
// ---------------------------------------------------------------------------

func TestUnknownSectionIsRefusedByName(t *testing.T) {
	body := []byte(`{"matchId":"m_1","cast":[{"castId":0,"seatId":0,"abilityId":"a"}]}`)
	_, _, err := matchstats.Sanitize("m_1", body)
	require.Error(t, err, `"cast" (missing the s) must be refused, not stored`)
	assert.Contains(t, err.Error(), "cast",
		"the refusal must NAME the offending section — 'invalid ledger' is not an error message")
	assert.Contains(t, err.Error(), "casts", "…and list what was expected")
}

func TestEverySectionInTheAllowlistIsAccepted(t *testing.T) {
	clean, dropped, err := matchstats.Sanitize("m_1", ledger("m_1"))
	require.NoError(t, err)
	assert.Empty(t, dropped)
	var got map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(clean, &got))
	for _, s := range matchstats.Sections {
		assert.Contains(t, got, s, "the fixture must exercise every allowlisted section")
		assert.True(t, matchstats.IsKnownSection(s))
	}
}

func TestASectionThatIsNotAnArrayIsRefused(t *testing.T) {
	_, _, err := matchstats.Sanitize("m_1", []byte(`{"matchId":"m_1","casts":{"castId":0}}`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "casts")
}

// ---------------------------------------------------------------------------
// THE ID COMPARISON. Both halves are individually valid, which is why nothing
// else catches it.
// ---------------------------------------------------------------------------

func TestLedgerIdMustMatchTheKeyItIsFiledUnder(t *testing.T) {
	_, _, err := matchstats.Sanitize("m_0001", ledger("m_0002"))
	require.Error(t, err, "a ledger filed under another match must be refused")
	assert.Contains(t, err.Error(), "m_0002")
	assert.Contains(t, err.Error(), "m_0001")
}

func TestAMissingMatchIdIsRefused(t *testing.T) {
	_, _, err := matchstats.Sanitize("m_1", []byte(`{"casts":[]}`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "matchId")
}

// ---------------------------------------------------------------------------
// ONE BAD ELEMENT MAY NEVER COST THE MATCH.
// ---------------------------------------------------------------------------

func TestOneMalformedCastDoesNotCostTheOtherThreeThousand(t *testing.T) {
	var casts []string
	for i := range 300 {
		casts = append(casts, `{"castId":`+strconv.Itoa(i)+`,"seatId":0,"abilityId":"godie-a001-01"}`)
	}
	// element 150 has no abilityId: it cannot be attributed to a skill.
	casts[150] = `{"castId":150,"seatId":0}`
	body := []byte(`{"matchId":"m_1","casts":[` + strings.Join(casts, ",") + `]}`)

	clean, dropped, err := matchstats.Sanitize("m_1", body)
	require.NoError(t, err, "a bad element must NOT reject the submission")
	require.Len(t, dropped, 1)
	assert.Equal(t, "casts[150]", dropped[0].Path)
	assert.Contains(t, dropped[0].Reason, "abilityId")

	var got struct {
		Casts []map[string]any `json:"casts"`
	}
	require.NoError(t, json.Unmarshal(clean, &got))
	assert.Len(t, got.Casts, 299, "the other 299 casts must survive")
	for _, c := range got.Casts {
		assert.NotEqual(t, float64(150), c["castId"], "the refused element must be gone")
	}
}

func TestANonObjectElementIsDroppedNotFatal(t *testing.T) {
	body := []byte(`{"matchId":"m_1","picks":[{"seatId":0,"championId":"a"},"nonsense",{"seatId":1,"championId":"b"}]}`)
	clean, dropped, err := matchstats.Sanitize("m_1", body)
	require.NoError(t, err)
	require.Len(t, dropped, 1)
	assert.Equal(t, "picks[1]", dropped[0].Path)
	var got struct {
		Picks []map[string]any `json:"picks"`
	}
	require.NoError(t, json.Unmarshal(clean, &got))
	assert.Len(t, got.Picks, 2)
}

func TestAWrongTypedIndexKeyIsDropped(t *testing.T) {
	// seatId as a string is the shape a hand-rolled sender produces, and it
	// makes the row unjoinable to a seat.
	body := []byte(`{"matchId":"m_1","rounds":[{"round":1,"seatId":"0"}]}`)
	_, dropped, err := matchstats.Sanitize("m_1", body)
	require.NoError(t, err)
	require.Len(t, dropped, 1)
	assert.Contains(t, dropped[0].Reason, "seatId")
}

func TestDropsAreReportedInAStableOrder(t *testing.T) {
	body := []byte(`{"matchId":"m_1","teams":[{"teamId":0}],"casts":[{"castId":0}],"picks":[{"seatId":0}]}`)
	first, _, err := matchstats.Sanitize("m_1", body)
	require.NoError(t, err)
	_ = first
	var paths []string
	for range 20 {
		_, dropped, err := matchstats.Sanitize("m_1", body)
		require.NoError(t, err)
		var got []string
		for _, d := range dropped {
			got = append(got, d.Path)
		}
		if paths == nil {
			paths = got
			continue
		}
		require.Equal(t, paths, got,
			"Go randomises map iteration; an operator fixing what the message named "+
				"must not be chasing a moving target")
	}
	assert.Equal(t, []string{"casts[0]", "picks[0]", "teams[0]"}, paths,
		"sections are reported in Sections order, elements in array order")
}

// ---------------------------------------------------------------------------
// BYTE STABILITY. Without this the archive round-trip stops being a copy.
// ---------------------------------------------------------------------------

func TestCleanLedgerIsStoredByteIdentically(t *testing.T) {
	in := ledger("m_1")
	clean, dropped, err := matchstats.Sanitize("m_1", in)
	require.NoError(t, err)
	require.Empty(t, dropped)
	assert.True(t, bytes.Equal(in, clean),
		"a clean ledger must be the SAME slice — otherwise every no-op re-import "+
			"shows up as a rewrite and the migration dry run stops being a contract")
}

// ---------------------------------------------------------------------------
// THE TWO ENVELOPE RULES INHERITED FROM #283.
// ---------------------------------------------------------------------------

func TestNonFiniteNumberIsRefusedAndNamed(t *testing.T) {
	body := []byte(`{"matchId":"m_1","casts":[{"castId":0,"seatId":0,"abilityId":"a","damageToHeroes":1e400}]}`)
	_, _, err := matchstats.Sanitize("m_1", body)
	require.Error(t, err, "1e400 is legal JSON and becomes Infinity in JavaScript")
	assert.Contains(t, err.Error(), "damageToHeroes",
		"the field must be named — 'somewhere in your ledger' is not an error message")
}

func TestTooDeepIsRefused(t *testing.T) {
	deep := `{"matchId":"m_1","teams":[` + strings.Repeat(`{"teamId":0,"seatIds":[`, 30)
	deep += `0` + strings.Repeat(`]}`, 30) + `]}`
	// The nesting above is not valid ledger shape; it only has to be valid JSON.
	if !json.Valid([]byte(deep)) {
		t.Skipf("fixture is not valid JSON, rewrite it")
	}
	_, _, err := matchstats.Sanitize("m_1", []byte(deep))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "巢狀")
}

func TestOversizeLedgerIsRefusedWithTheArchiveReason(t *testing.T) {
	big := make([]byte, matchstats.MaxRecordBytes+1)
	_, _, err := matchstats.Sanitize("m_1", big)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "匯不出去",
		"the cap exists because an oversize record cannot travel in the #243 archive; say so")
}

func TestNotAnObjectIsRefused(t *testing.T) {
	_, _, err := matchstats.Sanitize("m_1", []byte(`[1,2,3]`))
	require.Error(t, err)
	_, _, err = matchstats.Sanitize("m_1", []byte(`{ oops`))
	require.Error(t, err)
}

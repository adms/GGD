// Package server_test — archive_recovery_runbook_test.go drives the SENTENCE
// the recovery runbook prints at 1am, through the real HTTP surface (task
// #243).
//
// WHY THIS FILE EXISTS. The migration feature never deletes, so its honest
// disclosure is: "the restore puts back what the import overwrote; what it
// ADDED is still here, and here is the list — 多出來的帳號到「玩家」頁按
// 「婉拒」，多出來的邀請碼到「邀請碼」頁撤銷". That sentence makes two claims
// about OTHER features, and neither had ever been driven end to end for a
// document that arrived by IMPORT rather than by registration:
//
//  1. 婉拒 on an imported account actually stops it logging in. It could
//     plausibly not: the Players list reads the derived per-collection
//     _index.json, and an account file dropped in by an importer that never
//     touched that index would be invisible to the console — an account nobody
//     can see is an account nobody can deny.
//  2. 撤銷 on an imported invite code actually burns it. Same shape of doubt.
//
// So this test performs the whole operator story against two fully-wired
// platforms (miniredis + t.TempDir, no external services, no live host):
// export from an "old host", import into a "new host" through
// stage → plan → commit, then act on the residue exactly as the runbook says
// and assert the door really closed.
//
// Owner directive 2026-07-26: nothing in this feature ever contacts the live
// deploy. Both platforms here are in-process.
package server_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/platformarchive"
	"github.com/ggd/platform/internal/testutil"
)

// exportFrom produces a real archive of a running platform's DATA_DIR.
func exportFrom(t *testing.T, ts *testutil.TS) []byte {
	t.Helper()
	var buf bytes.Buffer
	_, err := platformarchive.Export(&buf, platformarchive.ExportOptions{
		DataDir:  ts.Cfg.DataDir,
		Groups:   []string{"core"},
		Hostname: "ggd-old-host",
		Now:      func() time.Time { return time.Now().UTC() },
	})
	require.NoError(t, err, "export the old host")
	return buf.Bytes()
}

// importInto drives stage → plan → commit through the REAL routes, as the
// console does, and returns the decoded commit response.
func importInto(t *testing.T, ts *testutil.TS, adminToken, adminPassword string, zip []byte) map[string]any {
	t.Helper()

	req := httptest.NewRequest(http.MethodPost, platformarchive.StagePath, bytes.NewReader(zip))
	req.Header.Set("Content-Type", "application/zip")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec := httptest.NewRecorder()
	ts.Srv.Router().ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, "stage: %s", rec.Body.String())
	var staged struct {
		Stage struct {
			ID string `json:"id"`
		} `json:"stage"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &staged))
	require.NotEmpty(t, staged.Stage.ID)

	planResp := ts.Do(http.MethodPost, "/api/v1/admin/platform-archive/plan", adminToken,
		map[string]any{"stageId": staged.Stage.ID})
	require.Equal(t, http.StatusOK, planResp.Status, "plan: %s", string(planResp.Raw))
	digest, _ := planResp.Body["digest"].(string)
	require.NotEmpty(t, digest)

	commitResp := ts.Do(http.MethodPost, "/api/v1/admin/platform-archive/commit", adminToken,
		map[string]any{
			"stageId": staged.Stage.ID, "planDigest": digest, "confirmPassword": adminPassword,
		})
	require.Equal(t, http.StatusOK, commitResp.Status, "commit: %s", string(commitResp.Raw))
	return commitResp.Body
}

// addedIDs pulls the collection's entries out of the commit response's
// addedDocs — the operator-facing list this whole test is about.
func addedIDs(t *testing.T, body map[string]any, collection string) []string {
	t.Helper()
	raw, ok := body["addedDocs"]
	require.True(t, ok, "the commit response must always carry addedDocs (`[]` when it added nothing)")
	list, _ := raw.([]any)
	out := []string{}
	for _, item := range list {
		m, _ := item.(map[string]any)
		if m["collection"] == collection {
			out = append(out, m["id"].(string))
		}
	}
	return out
}

// TestTheRunbooksResidueInstructionActuallyWorks is the whole story.
func TestTheRunbooksResidueInstructionActuallyWorks(t *testing.T) {
	// ---- the OLD host: one player, one unredeemed invite code -------------
	old := testutil.NewInviteGated(t, true)
	oldBoss := old.Register("runbookoldboss") // fresh deploy → claims ownership
	minted := old.Do(http.MethodPost, "/api/v1/admin/invites", oldBoss.Access,
		map[string]any{"count": 2, "note": "runbook fixture"})
	require.Equal(t, http.StatusCreated, minted.Status, "mint: %s", string(minted.Raw))
	codes := []string{}
	for _, c := range minted.Body["minted"].([]any) {
		codes = append(codes, c.(map[string]any)["code"].(string))
	}
	require.Len(t, codes, 2)
	// One code is SPENT on the old host, one stays live. Both travel in the
	// archive, and the runbook makes a different claim about each.
	migrant := old.RegisterWithCode("runbookmigrant", codes[0])
	liveCode := codes[1]

	zip := exportFrom(t, old)

	// ---- the NEW host: its own owner, then the import ---------------------
	fresh := testutil.NewInviteGated(t, true)
	newBoss := fresh.Register("runbooknewboss")
	commit := importInto(t, fresh, newBoss.Access, "correct-horse-runbooknewboss", zip)

	// The import really did add the migrant's account and the live code…
	require.Contains(t, addedIDs(t, commit, "accounts"), migrant.ID,
		"the import must have added the old host's player, or the rest of this test is vacuous")

	// …and it did NOT name the new host's OWN owner. That account exists only
	// on the target, so it cannot be an addition — and naming it would tell the
	// operator to deny themselves.
	assert.NotContains(t, addedIDs(t, commit, "accounts"), newBoss.ID,
		"the addedDocs list named the host's own owner — this is the refuted bug")

	// ======================================================================
	// CLAIM 1: 多出來的帳號到「玩家」頁按「婉拒」.
	// ======================================================================

	// (a) The imported account is VISIBLE on the Players page. Without this the
	//     instruction is unfollowable: nobody can click a row that is not there.
	list := fresh.Do(http.MethodGet, "/api/v1/admin/accounts?q=runbookmigrant", newBoss.Access, nil)
	require.Equal(t, http.StatusOK, list.Status, "%s", string(list.Raw))
	found := false
	for _, row := range list.Body["accounts"].([]any) {
		if row.(map[string]any)["id"] == migrant.ID {
			found = true
		}
	}
	require.True(t, found,
		"an account that arrived by IMPORT must appear on the Players page — "+
			"the search reads the derived _index.json, so this is the assertion that "+
			"catches an importer which writes files without maintaining it")

	// (b) The imported account can log in BEFORE 婉拒 — otherwise (c) proves
	//     nothing (it could be failing for an unrelated reason).
	before := fresh.Do(http.MethodPost, "/api/v1/auth/login", "",
		map[string]string{"username": "runbookmigrant", "password": "correct-horse-runbookmigrant"})
	require.Equal(t, http.StatusOK, before.Status,
		"the imported account must be able to log in with its OLD password before we deny it: %s",
		string(before.Raw))

	// (c) 婉拒 — the exact button the runbook names.
	deny := fresh.Do(http.MethodPost, "/api/v1/admin/accounts/"+migrant.ID+"/deny", newBoss.Access,
		map[string]string{"reason": "bad import residue"})
	require.Equal(t, http.StatusOK, deny.Status, "deny: %s", string(deny.Raw))

	// (d) …and the door is shut.
	after := fresh.Do(http.MethodPost, "/api/v1/auth/login", "",
		map[string]string{"username": "runbookmigrant", "password": "correct-horse-runbookmigrant"})
	assert.Equal(t, http.StatusForbidden, after.Status,
		"after 婉拒 the imported account must not be able to log in: %s", string(after.Raw))
	assert.Equal(t, "account_denied", after.ErrCode())

	// ======================================================================
	// CLAIM 2: 多出來的邀請碼到「邀請碼」頁撤銷.
	// ======================================================================

	// (a) The imported codes are visible on the 邀請碼 page.
	invites := fresh.Do(http.MethodGet, "/api/v1/admin/invites", newBoss.Access, nil)
	require.Equal(t, http.StatusOK, invites.Status, "%s", string(invites.Raw))
	statusOf := map[string]string{}
	for _, row := range invites.Body["invites"].([]any) {
		m := row.(map[string]any)
		st, _ := m["effectiveStatus"].(string)
		statusOf[m["code"].(string)] = st
	}
	require.Contains(t, statusOf, liveCode, "the imported invite code must be listed on the target")
	require.Equal(t, "active", statusOf[liveCode],
		"the imported code must arrive LIVE — that is exactly why it is residue")

	// (b) 撤銷 works on a code that arrived by import…
	revoke := fresh.Do(http.MethodPost, "/api/v1/admin/invites/"+liveCode+"/revoke", newBoss.Access, nil)
	require.Equal(t, http.StatusOK, revoke.Status, "revoke: %s", string(revoke.Raw))

	// (c) …and the revoked code no longer lets anybody register.
	reg := fresh.RegisterRaw("runbookintruder", map[string]string{"inviteCode": liveCode})
	assert.NotEqual(t, http.StatusCreated, reg.Status,
		"a revoked imported code must not admit a registration: %s", string(reg.Raw))

	// (d) THE HONEST CAVEAT, pinned rather than glossed. A code that was
	//     already SPENT on the old host arrives spent, and Revoke refuses it
	//     (409) because that document is the durable record of who got in. The
	//     runbook says so in RestoreLimits; this asserts the behaviour it
	//     describes, so the two cannot drift.
	spent := fresh.Do(http.MethodPost, "/api/v1/admin/invites/"+codes[0]+"/revoke", newBoss.Access, nil)
	assert.Equal(t, http.StatusConflict, spent.Status,
		"an already-redeemed imported code is refused by 撤銷 — RestoreLimits must keep saying so: %s",
		string(spent.Raw))
	assert.Equal(t, "redeemed", statusOf[codes[0]],
		"the spent code must arrive already marked redeemed, so it can admit nobody")
}

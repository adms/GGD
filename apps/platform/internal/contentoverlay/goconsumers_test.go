package contentoverlay_test

// goconsumers_test.go — THE PAIRING GUARD FOR TASK #241's LONG HALF.
//
// #241 的短期缺陷（商店經濟 write-only）已經修好，守衛在
// wallet/economy_api_test.go。這一支守的是**類別**：
//
//	Go 這一側從出貨的 content/ 樹讀 config 的每一份文件，
//	後台在覆蓋層存一次之後，Go 讀到的到底變不變？
//
// ⚠️ 它刻意不去驗「後台存得進去」（那是 contentoverlay_test.go 的事），也不去驗
// 「Go 讀得到某個值」（那是各套件自己的事）。**這兩個名詞分開驗都會綠，而 #241
// 就活在它們中間。** 所以下面每一條都是：用後台那條真的 HTTP 路由存一次 →
// 去讀 Go 這一側的即時答案 → 跟 goconsumers.go 宣告的 Liveness 對。
//
// 兩個方向都會紅：
//   - 宣告 ReadsOverlay 但量到沒動 → 覆蓋層讀壞了（就是 #241 本體的形狀）。
//   - 宣告 ShippedOnly 但量到動了  → 有人把它修好了而登記表沒更新；登記表是
//     下一個人唯一會讀的東西，讓它腐爛等於把陷阱重新裝回去。

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/admin"
	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/contentoverlay"
	"github.com/ggd/platform/internal/testutil"
)

// ─────────────────────────────────────────────────────────────────────────────
// The fixture content tree. Every doc the census names must exist here, with a
// value the probe below can distinguish from the override.

const (
	shippedUnlockCost  = 900
	shippedDamageDealt = 0.5
	shippedCombatMax   = 180.0

	overrideUnlockCost  = 4242
	overrideDamageDealt = 0.25
	overrideCombatMax   = 42.0
)

// censusContentDir extends testutil's store fixture with the two other docs the
// census names, so all three Go readers have a shipped value to move away from.
func censusContentDir(t *testing.T) string {
	t.Helper()
	dir := testutil.WriteContentFixture(t)
	extra := map[string]string{
		"config/combat-env.json": `{
  "id": "combat-env",
  "schema": "config.combat-env@1",
  "version": 4,
  "multipliers": { "damageDealt": 0.5, "cooldown": 1.0 }
}`,
		// ⭐ 出貨兩格都是**關**的（對外開放的東西不預設開）——
		//   探針就是把 `discover` 從 false 翻成 true。
		"config/ui-cues.json": `{
    "id": "ui-cues",
    "schema": "config.ui-cues@1",
    "playerContent": { "submit": false, "discover": false }
  }`,
		"config/config.match.json": `{
  "id": "config.match",
  "schema": "config@1",
  "match": { "teamCount": 4, "teamSize": 3, "combatMaxSec": 180, "intermissionSec": 25 }
}`,
	}
	for rel, body := range extra {
		full := filepath.Join(dir, filepath.FromSlash(rel))
		require.NoError(t, os.MkdirAll(filepath.Dir(full), 0o750))
		require.NoError(t, os.WriteFile(full, []byte(body), 0o600))
	}
	return dir
}

func newCensusPlatform(t *testing.T) *testutil.TS {
	t.Helper()
	dir := censusContentDir(t)
	return testutil.New(t, func(c *config.Config) { c.ContentDir = dir })
}

// adminToken registers an account, gives it the admin role, and returns its
// access token — the console's own credential shape.
func adminToken(t *testing.T, ts *testutil.TS) string {
	t.Helper()
	boss := ts.Register("boss")
	_, err := ts.Srv.Accounts.Update(t.Context(), boss.ID, func(a *account.Account) error {
		if !a.HasRole(admin.RoleAdmin) {
			a.Roles = append(a.Roles, admin.RoleAdmin)
		}
		return nil
	})
	require.NoError(t, err)
	return boss.Access
}

// saveOverlayDoc performs the operator's save exactly as 後台 does:
// PUT /api/v1/content-overlay/docs/{collection}/{id} (apps/admin/src/api.ts
// putOverlayDoc). Nothing here hand-builds a service — "被測的不是出貨的那個"
// is how #241 shipped in the first place.
func saveOverlayDoc(t *testing.T, ts *testutil.TS, token, key string, doc map[string]any) {
	t.Helper()
	r := ts.Do(http.MethodPut, "/api/v1/content-overlay/docs/"+key, token, doc)
	require.Equal(t, http.StatusOK, r.Status, "console save of %s rejected: %s", key, string(r.Raw))
}

// ─────────────────────────────────────────────────────────────────────────────
// The probes: for each census entry, the doc the console would save and the
// number Go answers with RIGHT NOW.

type probe struct {
	// override is the whole doc the console PUTs.
	override map[string]any
	// read is the Go-side live answer, read the same way the platform serves it.
	// token is an admin access token (some probes read an admin-gated route).
	read func(t *testing.T, ts *testutil.TS, token string) float64
	// shipped is what read() must return before any save.
	shipped float64
	// overridden is what read() returns after the save IF the reader is
	// overlay-aware. Must differ from shipped or the probe proves nothing.
	overridden float64
}

func probes() map[string]probe {
	return map[string]probe{
		"config/store": {
			override: map[string]any{
				"id": "store", "schema": "config.store@1",
				"championUnlockCost": overrideUnlockCost,
				"freeChampionIds":    []string{"sela", "thorne"},
				"mcoinRewards": map[string]any{
					"placement1": 200, "placement2": 120, "placement3": 80, "placement4": 50,
				},
			},
			// What the player is charged and told (GET /wallet crystalUnlockCost
			// rides on this same number).
			read: func(t *testing.T, ts *testutil.TS, token string) float64 {
				return float64(ts.Srv.Wallet.UnlockCost())
			},
			shipped:    shippedUnlockCost,
			overridden: overrideUnlockCost,
		},
		"config/combat-env": {
			override: map[string]any{
				"id": "combat-env", "schema": "config.combat-env@1", "version": 4,
				"multipliers": map[string]any{"damageDealt": overrideDamageDealt, "cooldown": 1.0},
			},
			// The table the 戰鬥系統 page opens on — GET /api/v1/admin/combat-env
			// with nothing stored is the content-authored base.
			read: func(t *testing.T, ts *testutil.TS, token string) float64 {
				r := ts.Do(http.MethodGet, "/api/v1/admin/combat-env", token, nil)
				require.Equal(t, http.StatusOK, r.Status, "%s", string(r.Raw))
				m, ok := r.Body["multipliers"].(map[string]any)
				require.True(t, ok, "multipliers missing: %s", string(r.Raw))
				v, ok := m["damageDealt"].(float64)
				require.True(t, ok, "damageDealt missing: %s", string(r.Raw))
				return v
			},
			shipped:    shippedDamageDealt,
			overridden: overrideDamageDealt,
		},
		"config/ui-cues": {
			override: map[string]any{
				"id": "ui-cues", "schema": "config.ui-cues@1",
				"playerContent": map[string]any{"submit": true, "discover": true},
			},
			// ⭐ 讀的是**玩家真的走的那條路**：公開的 discoverable 清單。
			//   關著 ⇒ 它回空清單（⛔ 不是 404）；開了 ⇒ 它真的去查投稿。
			//   ⚠️ 兩種情況都回 200，所以探針量的是**回應的形狀**，
			//   ⛔ 不是狀態碼 —— 200/200 分不出開關有沒有生效。
			read: func(t *testing.T, ts *testutil.TS, token string) float64 {
				submit, discover := ts.Srv.PlayerContentFlagsForTest()
				if submit != discover {
					t.Fatalf("兩格開關是全有或全無的：submit=%v discover=%v", submit, discover)
				}
				if discover {
					return 1
				}
				return 0
			},
			shipped:    0,
			overridden: 1,
		},
		"config/config.match": {
			override: map[string]any{
				"id": "config.match", "schema": "config@1",
				"match": map[string]any{
					"teamCount": 4, "teamSize": 3,
					"combatMaxSec": overrideCombatMax, "intermissionSec": 25,
				},
			},
			// The shape the 系統運維 page derives 「一場對戰實際多長」 from.
			read: func(t *testing.T, ts *testutil.TS, token string) float64 {
				return ts.Srv.OpsEnv.MatchShape().CombatMaxSec
			},
			shipped:    shippedCombatMax,
			overridden: overrideCombatMax,
		},
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// THE GUARD.
//
// MUTATION 1 (「請求時讀覆寫」→「用開機時載的」): in wallet/economy.go make
// Service.effective() `return s.cat` unconditionally. The config/store subtest
// fails with 4242 != 900 — the #241 defect reproduced through the census
// instead of through the wallet's own suite.
//
// MUTATION 2 (登記表腐爛): flip config/combat-env's Liveness to ReadsOverlay in
// goconsumers.go and its subtest fails, naming the doc — a declaration nobody
// measures is exactly the "已修好" claim that #241 was.
func TestOverlaySaveReachesTheDeclaredGoReader(t *testing.T) {
	p := probes()
	for _, entry := range contentoverlay.GoConsumedConfigs {
		t.Run(entry.Key, func(t *testing.T) {
			pr, ok := p[entry.Key]
			require.True(t, ok,
				"census entry %q has no probe. A census row with nothing measuring it is a comment, "+
					"and #241 was caused by exactly that kind of comment — add a probe in probes().",
				entry.Key)
			require.NotEqual(t, pr.shipped, pr.overridden,
				"probe for %s cannot tell shipped from overridden", entry.Key)

			ts := newCensusPlatform(t)
			token := adminToken(t, ts)
			require.Equal(t, pr.shipped, pr.read(t, ts, token),
				"%s: the shipped fixture value is not what %s reads — the probe is aimed at the wrong "+
					"number and would pass no matter what the overlay did", entry.Key, entry.GoReader)

			saveOverlayDoc(t, ts, token, entry.Key, pr.override)

			got := pr.read(t, ts, token)
			switch entry.Liveness {
			case contentoverlay.ReadsOverlay:
				assert.Equal(t, pr.overridden, got,
					"%s is declared %s, but the operator's save did NOT reach %s (still %v). This is "+
						"the #241 defect: the console answers ✓ 已寫入 and the platform goes on serving "+
						"the boot-time content value.",
					entry.Key, entry.Liveness, entry.GoReader, got)
			case contentoverlay.ShippedOnly:
				assert.Equal(t, pr.shipped, got,
					"%s is declared %s, but the save DID reach %s. Someone made this reader "+
						"overlay-aware without updating the census in goconsumers.go — flip its Liveness "+
						"to %s. The census is the only place the next author will look.",
					entry.Key, entry.Liveness, entry.GoReader, contentoverlay.ReadsOverlay)
			default:
				t.Fatalf("%s: unknown Liveness %q", entry.Key, entry.Liveness)
			}
		})
	}
}

// A ShippedOnly row is only tolerable because something ELSE is live. If that
// field is empty the row is a write-only admin page waiting to happen, which is
// the sentence #241 asked to be enforced:
//
//	一份 config doc 如果沒有 TS runtime 消費者，就不可以只靠 overlay 當作「可調」。
//
// MUTATION: blank LiveConsumer on any row → red, naming the row.
func TestEveryCensusRowNamesWhoSeesTheOperatorsEdit(t *testing.T) {
	for _, e := range contentoverlay.GoConsumedConfigs {
		assert.NotEmpty(t, strings.TrimSpace(e.LiveConsumer),
			"%s (%s) reads the SHIPPED tree and nothing says who does see an operator's edit. "+
				"If the answer is 'nobody', the console page for this doc is write-only — that is #241, "+
				"and the fix is to make the Go reader overlay-aware, not to fill this string in.", e.Key, e.GoReader)
		if e.Liveness == contentoverlay.ShippedOnly {
			assert.NotContains(t, e.LiveConsumer, "internal/",
				"%s is ShippedOnly, so its live consumer cannot be a Go package inside this binary — "+
					"a Go package that reads content/ is exactly the thing that does NOT see the overlay",
				e.Key)
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// COVERAGE: a NEW Go reader of a content config doc must join the census.
//
// This is the half a behavioural probe cannot cover — a reader nobody registered
// has no probe, so nothing above would ever look at it. It scans for the one
// shape every such read has: filepath.Join(<contentDir>, "config", "<x>.json").
//
// MUTATION: add `_ = filepath.Join(contentDir, "config", "arena-rules.json")` to
// any non-test file under internal/ and this fails, naming config/arena-rules.
var contentConfigRead = regexp.MustCompile(`filepath\.Join\([^)]*"config",\s*"([^"]+)\.json"`)

func TestEveryGoContentConfigReadIsRegistered(t *testing.T) {
	registered := map[string]bool{}
	for _, e := range contentoverlay.GoConsumedConfigs {
		registered[e.Key] = true
	}

	found := map[string][]string{} // key -> files
	root := filepath.Join("..")    // apps/platform/internal
	require.NoError(t, filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		raw, err := os.ReadFile(path) // #nosec G304 -- walking this repo's own source tree
		if err != nil {
			return err
		}
		for _, m := range contentConfigRead.FindAllStringSubmatch(string(raw), -1) {
			key := "config/" + m[1]
			found[key] = append(found[key], path)
		}
		return nil
	}))
	require.NotEmpty(t, found,
		"the scan found no content config reads at all — the regex stopped matching and this guard "+
			"has been passing vacuously")

	var missing []string
	for key, files := range found {
		if !registered[key] {
			missing = append(missing, key+" (read by "+strings.Join(files, ", ")+")")
		}
	}
	sort.Strings(missing)
	assert.Empty(t, missing,
		"these content config docs are read by Go out of the SHIPPED tree but are not in the #241 "+
			"census (contentoverlay/goconsumers.go): %s\n\nAdd a row and a probe. A Go reader of "+
			"content/ does NOT see 後台 → 內容管理 edits, so shipping an admin page for it without "+
			"checking is how 商店經濟 became write-only.", strings.Join(missing, ", "))
}

// A census row joins TWO names — the overlay key the console writes and the
// file under CONTENT_DIR the Go reader opens — and a row whose halves do not
// refer to the same document measures nothing while looking complete.
//
// Both halves are checked against reality, not against each other: the Key is
// round-tripped through the real PUT route and read back out of the durable
// file, and the File must exist in the content tree the probes boot against.
//
// MUTATION A: change any Key in goconsumers.go (e.g. "config/store" ->
// "configs/store") — the read-back fails naming the keys actually present,
// instead of that row silently never matching anything again.
// MUTATION B: change any File (e.g. "config/store.json" -> "config/prices.json")
// — the existence check fails, instead of the census quietly citing a file
// nobody ships.
func TestCensusRowsNameARealOverlayKeyAndARealShippedFile(t *testing.T) {
	contentDir := censusContentDir(t)
	ts := testutil.New(t, func(c *config.Config) { c.ContentDir = contentDir })
	token := adminToken(t, ts)
	p := probes()

	for _, e := range contentoverlay.GoConsumedConfigs {
		saveOverlayDoc(t, ts, token, e.Key, p[e.Key].override)
	}

	var o contentoverlay.Overlay
	require.NoError(t, ts.Srv.Store.Get(contentoverlay.Collection, contentoverlay.DocID, &o))
	for _, e := range contentoverlay.GoConsumedConfigs {
		raw, ok := o.Docs[e.Key]
		require.True(t, ok,
			"the console wrote %s but that is not the key contentoverlay stored it under. Keys present: %v",
			e.Key, o.Keys())
		var doc map[string]any
		require.NoError(t, json.Unmarshal(raw, &doc))

		_, err := os.Stat(filepath.Join(contentDir, filepath.FromSlash(e.File)))
		assert.NoError(t, err,
			"%s: File %q does not exist in the content tree the probes run against, so the "+
				"「shipped value」 half of this row is not being measured at all", e.Key, e.File)
	}
}

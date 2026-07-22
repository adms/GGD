package curation_test

// Champion IDENTITY for the curation starter gate — a deliberately small Go
// port of the ONE rule that lives in
// `packages/shared/src/content/championIdentity.ts` (read that file first; it
// carries the full policy, the evidence and the rationale).
//
// WHY A PORT AT ALL. The starter bundle is a hand-curated static list in
// starter.go; nothing in the Go service computes identity at runtime, so this
// is test-only enforcement — the gate that keeps a human from picking the same
// character twice (or from dropping a real one as an imagined "twin") when the
// bundle is next edited. Keeping it in _test.go means no dead production code.
//
// WHY IT CANNOT DRIFT UNNOTICED. Both this file and championIdentity.test.ts
// assert the SAME named outcomes over the SAME content tree — 黑化Saber stays
// separate from Saber, the known duplicate pairs still fold, champions sharing
// a CC0 stand-in mesh stay distinct. If the TS rule is loosened or tightened
// and this port is not, one of the two suites fails on those pins.
//
// GOVERNING POLICY (user, 2026-07-22)「遇到疑慮一律判斷寬鬆為多英雄」— when in
// doubt, SEPARATE heroes. Merging requires positive evidence, because a
// wrongly-merged champion disappears from the game with its bespoke kit while a
// wrongly-kept duplicate is merely cosmetic.

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/pkg/testkit"
)

// heroNumberRe pulls the task #11 prefix off an ability name: "22-01 鬼隱之擊"
// → 22, "22-002 …" → 22 (EX). RE2 has no lookahead, so the trailing class does
// the "no fourth digit" job; some imported names have NO space after the
// prefix ("61-01惡魔球"), so a separator must not be required.
var heroNumberRe = regexp.MustCompile(`^(\d{2})-(\d{2,3})([^0-9]|$)`)

// heroNumberOfName returns the hero 編號 encoded in an ability name, or "".
func heroNumberOfName(name string) string {
	m := heroNumberRe.FindStringSubmatch(strings.TrimSpace(name))
	if m == nil {
		return ""
	}
	return m[1]
}

// heroNumberOf resolves a champion's 編號 from its embedded kit. Returns "" when
// nothing parses OR when the abilities disagree — ambiguity is NOT evidence of
// sameness, so an unresolved champion can never be merged into anything.
func heroNumberOf(c championDoc) string {
	num := ""
	for _, ab := range c.Abilities {
		n := heroNumberOfName(ab.Name)
		if n == "" {
			continue
		}
		if num != "" && num != n {
			return ""
		}
		num = n
	}
	return num
}

// nameComponents splits the map's `稱號 - 角色名` on the SPACE-DELIMITED dash
// only, so an unspaced hyphen stays part of its token
// ("英靈-亞瑟王 - 黑化Saber" → "英靈-亞瑟王", "黑化Saber").
var nameSepRe = regexp.MustCompile(`\s+[-–—]\s+`)

func nameComponents(name string) []string {
	out := []string{}
	for _, part := range nameSepRe.Split(strings.Join(strings.Fields(name), " "), -1) {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func sharesNameComponent(a, b string) bool {
	left := map[string]struct{}{}
	for _, p := range nameComponents(a) {
		left[p] = struct{}{}
	}
	for _, p := range nameComponents(b) {
		if _, ok := left[p]; ok {
			return true
		}
	}
	return false
}

// sameCharacter is the identity rule: true ONLY on positive, strong evidence.
//
//  1. no parseable hero number on either side ⇒ DISTINCT (never "both unknown,
//     so probably the same");
//  2. different numbers ⇒ DISTINCT — this is the 黑化Saber guard (69 vs 20),
//     which no shared mesh or shared portrait may override;
//  3. identical display name ⇒ SAME, even across meshes (one entry got the real
//     import, its twin a CC0 stand-in);
//  4. a shared name component AND the same mesh ⇒ SAME (re-worded twins such as
//     超級賽亞人-悟空 / 賽亞人-悟空). Both halves are required: a shared component
//     alone is a franchise relation (拳四郎, 皮卡丘 each exist as two heroes),
//     and a shared mesh alone just means the art is missing — champ.sela is
//     worn by 18 unrelated champions;
//  5. otherwise DISTINCT (same number, nothing else in common = a source-data
//     collision to report, not to resolve: 05, 53, 61, 91).
func sameCharacter(a, b championDoc) bool {
	if a.ID == b.ID {
		return true
	}
	na, nb := heroNumberOf(a), heroNumberOf(b)
	if na == "" || nb == "" || na != nb {
		return false
	}
	if strings.Join(strings.Fields(a.Name), " ") == strings.Join(strings.Fields(b.Name), " ") {
		return true
	}
	return a.ModelKey != "" && a.ModelKey == b.ModelKey && sharesNameComponent(a.Name, b.Name)
}

// loadRoster reads every champion@1 doc in the content tree, keyed by id.
func loadRoster(t *testing.T, root string) map[string]championDoc {
	t.Helper()
	dir := filepath.Join(root, "champions")
	entries, err := os.ReadDir(dir)
	require.NoErrorf(t, err, "read %s", dir)
	out := map[string]championDoc{}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".json") || strings.HasPrefix(name, "_") {
			continue
		}
		doc := readJSON[championDoc](t, filepath.Join(dir, name))
		if doc.ID == "" {
			continue
		}
		out[doc.ID] = doc
	}
	return out
}

// whitelist-champion-identity: the identity rule the curation bundle is curated
// against, pinned on the real content tree. Mirrors the headline cases in
// packages/shared/src/content/championIdentity.test.ts.
func TestChampionIdentityRule(t *testing.T) {
	testkit.Cover(t, "whitelist-champion-identity")
	root := contentRoot()
	if _, err := os.Stat(filepath.Join(root, "champions")); err != nil {
		t.Skipf("content tree not present at %s — skipping identity pins", root)
	}
	roster := loadRoster(t, root)
	require.GreaterOrEqual(t, len(roster), 100, "content tree looks truncated")

	get := func(id string) championDoc {
		doc, ok := roster[id]
		require.Truef(t, ok, "champion %q missing from the content tree", id)
		return doc
	}

	// 黑化Saber: same mesh, same extracted portrait, near-identical name —
	// but hero 69, not 20. It is its OWN character and must never fold.
	saber, saberTwin, alter := get("godie-e002"), get("godie-e00l"), get("godie-e00q")
	require.Equal(t, saber.ModelKey, alter.ModelKey, "the premise: e002 and e00q share a mesh")
	assert.Equal(t, "20", heroNumberOf(saber))
	assert.Equal(t, "69", heroNumberOf(alter))
	assert.False(t, sameCharacter(alter, saber), "黑化Saber must not fold into Saber")
	assert.False(t, sameCharacter(alter, saberTwin), "黑化Saber must not fold into Saber's twin")
	assert.True(t, sameCharacter(saber, saberTwin), "e002/e00l ARE one character")

	// Known duplicate ENTRIES still fold (canonical id first).
	for _, pair := range [][2]string{
		{"godie-hgam", "godie-h02r"}, {"godie-ogrh", "godie-o00x"},
		{"godie-uvng", "godie-u010"}, {"godie-h01n", "godie-h01o"},
		{"godie-e00k", "godie-e00z"}, {"godie-ewar", "godie-e007"},
		{"godie-h02v", "godie-h02u"}, {"godie-hjai", "godie-h020"},
		{"godie-n003", "godie-n01g"}, {"godie-u00n", "godie-u00o"},
		{"godie-e00w", "godie-e00x"}, {"godie-o01z", "godie-o02v"},
		{"godie-e001", "godie-e00n"}, {"godie-nbbc", "godie-n01c"},
		{"godie-ucrl", "godie-u034"}, {"godie-nsjs", "godie-n00p"},
	} {
		assert.Truef(t, sameCharacter(get(pair[0]), get(pair[1])),
			"%s and %s are the same character", pair[0], pair[1])
	}

	// Champions sharing a CC0 stand-in mesh are NOT duplicates of each other.
	for _, mesh := range []string{"champ.sela", "champ.thorne", "champ.skin.barbarian", "champ.skin.rogue"} {
		wearers := []championDoc{}
		for _, doc := range roster {
			if doc.ModelKey == mesh {
				wearers = append(wearers, doc)
			}
		}
		require.Greaterf(t, len(wearers), 1, "%s should be worn by several champions", mesh)
		for _, a := range wearers {
			for _, b := range wearers {
				if a.ID == b.ID {
					continue
				}
				assert.Falsef(t, sameCharacter(a, b),
					"%s (%s) and %s (%s) share the stand-in mesh %s but are different characters",
					a.ID, a.Name, b.ID, b.Name, mesh)
			}
		}
	}

	// Hero-number COLLISIONS resolve to separate heroes by default (both stay
	// curatable); skin/variant pairs on different meshes likewise.
	for _, pair := range [][2]string{
		{"godie-hblm", "godie-h021"}, // 05 賈修貝爾 / 阿強一號
		{"godie-o00l", "godie-o02s"}, // 53 傑洛士 / 涼宮八ㄦ匕
		{"godie-u012", "godie-u011"}, // 61 克勞薩II世 / 克勞薩先生
		{"godie-h02s", "godie-h02z"}, // 91 死亡騎士 / 不良少年
		{"godie-umal", "godie-u00l"}, // 25 拳四郎 ×2 (different meshes)
		{"godie-ofar", "godie-o02l"}, // 58 皮卡丘 ×2 (different meshes)
	} {
		a, b := get(pair[0]), get(pair[1])
		require.Equalf(t, heroNumberOf(a), heroNumberOf(b), "%s/%s premise: same 編號", pair[0], pair[1])
		assert.Falsef(t, sameCharacter(a, b),
			"%s (%s) and %s (%s) share hero number %s but must stay two heroes",
			a.ID, a.Name, b.ID, b.Name, heroNumberOf(a))
	}

	// Numberless champions each keep their own identity — including the test
	// hero, which shares BOTH its mesh and a name component with hero 11.
	for _, id := range []string{"godie-e00u", "godie-u01f", "godie-h02n", "godie-u01q", "sela", "thorne"} {
		doc := get(id)
		assert.Emptyf(t, heroNumberOf(doc), "%s (%s) should have no parseable hero number", id, doc.Name)
		for other, otherDoc := range roster {
			if other == id {
				continue
			}
			assert.Falsef(t, sameCharacter(doc, otherDoc),
				"numberless champion %s must not merge into %s", id, other)
		}
	}
}

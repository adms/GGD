package platformarchive

// overlaygate.go — the ZIP import's half of the #283 content write gate.
//
// ── THE BYPASS THIS CLOSES ──────────────────────────────────────────────────
// #283 put a write gate in front of PUT /api/v1/content-overlay/docs/{c}/{id}
// (internal/contentoverlay/validate.go). The ZIP import did not go through it:
// doc.go carries `content-overlay` on purpose, and apply.go wrote the whole
// overlay.json with one verbatim `Store.Put`. So an archive taken off an older
// host — or off a host that predates the gate — could land documents the gate
// refuses, and ONE such document drops THE ENTIRE OVERLAY LAYER at content-load
// time (loader.ts collects every error and throws once; both consumers then
// retry with the shipped tree and no overlay). The destination host would come
// up serving shipped defaults for EVERYTHING, silently.
//
// ── QUARANTINE, NOT REFUSAL: WHY THE IMPORT STILL SUCCEEDS ──────────────────
// The obvious gate — block the import — is the wrong one here, and the plan has
// no override for a blocked entry ("a blocked plan cannot be committed"). The
// archive is a FAITHFUL COPY of what the old host really had; refusing it means
// "you cannot move off that machine", which is the exact loss #243 exists to
// prevent. Two bad docs must not cost the operator the other three hundred.
//
// So the import proceeds and the refused docs are QUARANTINED instead:
//
//	live   content-overlay/overlay                   ← every doc that passes
//	kept   content-overlay/overlay.rejected-<hash>   ← the archive's copy, verbatim
//
// The live layer is therefore loadable by construction, the other docs survive
// the move, and nothing is destroyed — the rejected ones are on disk under a
// quarantine id (the same convention contentoverlay.go already uses for a
// corrupt durable file, and one `inspectArchivedOverlay` skips, so a re-export
// of this host does not re-flag them).
//
// ⚠️ THE BYTES ARE UNTOUCHED WHEN NOTHING IS REFUSED. sanitizeArchivedOverlay
// returns the ORIGINAL slice unless it actually drops something, so a clean
// archive is still written byte-identically and a no-op re-import still plans
// as `unchanged`. That property is what keeps this from being a migration
// regression, and TestCleanOverlayIsWrittenByteIdentically pins it.
//
// ── WHAT IT CAN AND CANNOT CHECK ────────────────────────────────────────────
// Envelope rules only: no CONTENT_DIR is in scope here, so ValidateDoc's
// per-field comparison against the shipped doc is unavailable. Unknown
// collection, id/key mismatch, missing `schema`, non-finite numbers and the
// base-bonus bounds are all still caught. A doc that passes here may still be
// refused by a later console save; that is the honest ordering, not a promise.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/ggd/platform/internal/contentoverlay"
)

// maxNamedOverlayProblems bounds the warning text. A migration off a badly
// broken host should produce a readable sentence, not a wall.
const maxNamedOverlayProblems = 8

// overlayProblem is one archived doc the content gate would refuse.
type overlayProblem struct {
	Key    string
	Reason string
}

// inspectArchivedOverlay parses the archive's overlay document and returns the
// docs inside it that the #283 gate would refuse. A missing/unparseable overlay
// entry is NOT a problem here — apply.go writes it verbatim either way, and
// contentoverlay's own degradation contract covers an unreadable file.
func inspectArchivedOverlay(a *Archive) []overlayProblem {
	entries, ok := a.ByCollection[contentoverlay.Collection]
	if !ok {
		return nil
	}
	var out []overlayProblem
	for _, e := range entries {
		if e.ID != contentoverlay.DocID {
			continue // quarantined copies (overlay.corrupt-*) are not live content
		}
		raw, err := a.ReadEntry(e)
		if err != nil {
			continue
		}
		var o struct {
			Docs map[string]json.RawMessage `json:"docs"`
		}
		if err := json.Unmarshal(raw, &o); err != nil {
			continue
		}
		out = append(out, refusedOverlayDocs(o.Docs)...)
	}
	return out
}

// refusedOverlayDocs is the ONE place a doc's verdict is decided, so the dry
// run's warning and the write's quarantine can never disagree about which
// documents are bad. Key-sorted, because Go randomises map iteration and an
// operator re-running a dry run must not get a different list each time.
func refusedOverlayDocs(docs map[string]json.RawMessage) []overlayProblem {
	keys := make([]string, 0, len(docs))
	for k := range docs {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var out []overlayProblem
	for _, k := range keys {
		collection, id, found := strings.Cut(k, "/")
		if !found {
			out = append(out, overlayProblem{Key: k, Reason: "不是 collection/id 形式的 key"})
			continue
		}
		if err := contentoverlay.ValidateDoc(collection, id, docs[k], nil); err != nil {
			out = append(out, overlayProblem{Key: k, Reason: messageOf(err)})
		}
	}
	return out
}

// sanitizeArchivedOverlay strips the docs the #283 gate refuses out of an
// archived overlay document, so what lands on the target is loadable.
//
// ⚠️ RETURNS THE ORIGINAL SLICE UNLESS SOMETHING IS ACTUALLY DROPPED. A clean
// archive — the overwhelmingly common case — must be written byte for byte, or
// every no-op re-import would show up as a rewrite and the migration contract
// ("the dry run is the contract, not an estimate") would quietly rot.
//
// Unparseable input is NOT an error here: it is returned untouched. apply.go's
// job is to move the archive's bytes, and contentoverlay's own degradation path
// (quarantine + fall back to shipped) already covers a durable file it cannot
// read. Refusing the import over it would strand the operator for a file the
// destination host knows how to survive.
func sanitizeArchivedOverlay(raw []byte) (clean []byte, refused []overlayProblem) {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(raw, &top); err != nil {
		return raw, nil
	}
	rawDocs, ok := top["docs"]
	if !ok {
		return raw, nil
	}
	var docs map[string]json.RawMessage
	if err := json.Unmarshal(rawDocs, &docs); err != nil {
		return raw, nil
	}
	refused = refusedOverlayDocs(docs)
	if len(refused) == 0 {
		return raw, nil
	}

	for _, p := range refused {
		delete(docs, p.Key)
	}
	// `bases` is a PARALLEL map keyed the same way (the three-way-merge base for
	// each entry). Leaving a base behind for a doc that is no longer there would
	// make the precedence view claim provenance for content the overlay does not
	// hold.
	if rawBases, ok := top["bases"]; ok {
		var bases map[string]json.RawMessage
		if err := json.Unmarshal(rawBases, &bases); err == nil {
			for _, p := range refused {
				delete(bases, p.Key)
			}
			if next, err := json.Marshal(bases); err == nil {
				top["bases"] = next
			}
		}
	}
	nextDocs, err := json.Marshal(docs)
	if err != nil {
		return raw, nil
	}
	top["docs"] = nextDocs
	out, err := json.Marshal(top)
	if err != nil {
		return raw, nil
	}
	return out, refused
}

// messageOf strips httpx's "bad_request: " prefix so the warning reads as one
// sentence rather than as a leaked HTTP code.
func messageOf(err error) string {
	s := err.Error()
	if _, msg, found := strings.Cut(s, ": "); found {
		return msg
	}
	return s
}

// warnAboutArchivedOverlay appends the operator-facing warning, if any.
func (p *Plan) warnAboutArchivedOverlay(a *Archive) {
	problems := inspectArchivedOverlay(a)
	if len(problems) == 0 {
		return
	}
	named := problems
	suffix := ""
	if len(named) > maxNamedOverlayProblems {
		named = named[:maxNamedOverlayProblems]
		suffix = fmt.Sprintf("（另有 %d 筆）", len(problems)-maxNamedOverlayProblems)
	}
	lines := make([]string, 0, len(named))
	for _, pr := range named {
		lines = append(lines, fmt.Sprintf("%s —— %s", pr.Key, pr.Reason))
	}
	p.warn("這包的內容覆蓋層有 %d 筆文件是寫入閘會擋下的（#283），匯入時會被**隔離**、不會寫進生效的那一份 —— "+
		"因為只要有一筆讀不起來，**整層 overlay 都會被丟掉**，玩家會拿到出貨預設而畫面上不會有任何提示。"+
		"其餘文件照常匯入；被隔離的原封不動留在 %s/%s.rejected-* ，確認後可自行刪除：%s%s",
		len(problems), contentoverlay.Collection, contentoverlay.DocID,
		strings.Join(lines, "；"), suffix)
}

// quarantineIDFor names the doc that keeps the archive's ORIGINAL overlay bytes.
//
// Keyed by a hash OF THOSE BYTES, matching contentoverlay's own
// `overlay.corrupt-<hash>` convention, and for the same two reasons: importing
// two DIFFERENT bad archives keeps both copies rather than the second silently
// overwriting the first, and re-importing the SAME archive re-uses one id
// instead of littering the collection. A counter would have collided on the
// common case of two archives that happen to carry the same number of bad docs.
func quarantineIDFor(raw []byte) string {
	sum := sha256.Sum256(raw)
	return fmt.Sprintf("%s.rejected-%s", contentoverlay.DocID, hex.EncodeToString(sum[:])[:12])
}

// isLiveContentOverlay reports whether an archive entry is THE overlay document
// the game actually loads — not one of the `overlay.corrupt-*` /
// `overlay.rejected-*` quarantine copies, which are inert by construction and
// must be moved verbatim.
func isLiveContentOverlay(e Entry) bool {
	return e.Collection == contentoverlay.Collection && e.ID == contentoverlay.DocID
}

// writeContentOverlay is the ZIP import's write gate (#283).
//
// The refused docs are lifted out of the document that goes live and the
// archive's ORIGINAL bytes are kept alongside, so the migration neither carries
// poison forward nor loses anything. Quarantine is written FIRST: if that write
// fails the import stops with the target still untouched, rather than dropping
// documents whose only other copy was the one we were about to discard.
func writeContentOverlay(t *Target, e Entry, data []byte, res *ApplyResult) error {
	clean, refused := sanitizeArchivedOverlay(data)
	if len(refused) == 0 {
		return t.Store.Put(e.Collection, e.ID, json.RawMessage(data))
	}
	quarantine := quarantineIDFor(data)
	if err := t.Store.Put(e.Collection, quarantine, json.RawMessage(data)); err != nil {
		return fmt.Errorf("隔離被擋下的內容覆蓋文件失敗：%w", err)
	}
	if err := t.Store.Put(e.Collection, e.ID, json.RawMessage(clean)); err != nil {
		return err
	}
	if res != nil {
		keys := make([]string, 0, len(refused))
		for _, p := range refused {
			keys = append(keys, p.Key)
		}
		res.warn("內容覆蓋層有 %d 筆文件沒通過寫入閘（#283），已原封不動隔離到 %s/%s，沒有寫進生效的覆蓋層："+
			"%s。其餘覆蓋設定都照常匯入了；若把它們照原樣寫進去，**整層 overlay 會在載入時被丟掉**，"+
			"玩家會拿到出貨預設而畫面上不會有任何提示。",
			len(refused), e.Collection, quarantine, strings.Join(keys, "、"))
	}
	return nil
}

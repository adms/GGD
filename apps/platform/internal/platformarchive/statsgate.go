package platformarchive

// statsgate.go — the ZIP import's half of the #207 match-stats write gate.
//
// ── THE SAME BYPASS overlaygate.go CLOSED, ONE COLLECTION OVER ──────────────
// #207 put a write gate in front of POST /api/v1/internal/match-stats
// (internal/matchstats/validate.go). The ZIP import would not have gone through
// it: scope.go carries `match-stats/<YYYY>/<MM>` on purpose, and apply.go writes
// a KindDoc entry with one verbatim `Store.Put`. An archive taken off a host
// that predates the gate — or off a build whose ledger shape has since changed —
// could therefore land documents this build cannot read back.
//
// ── WHY THE BLAST RADIUS IS SMALLER HERE, AND WHY THE GATE STILL EXISTS ─────
// Be precise about the difference, because it changes what the gate is FOR.
// The content overlay is ONE file holding every doc, so one bad doc discarded
// the WHOLE layer at load time. Match stats are one file PER MATCH, so a bad
// record can only ever ruin its own row.
//
// The gate is therefore not protecting the other records from this one. It is
// protecting the READER from a record that is silently wrong: a ledger whose
// `matchId` disagrees with the file it sits in attributes one match's play to
// another, and a section this build does not know reads back as "that match had
// none of those". Both are wrong ANSWERS rather than missing ones, and a wrong
// answer on a review screen is worse than a gap — nobody questions it.
//
// ── QUARANTINE, NOT REFUSAL — AND STRICTLY PER RECORD ───────────────────────
// Refusing the import is the wrong lever for the reason doc.go already gives:
// the archive is a faithful copy of what the old host had, and "you cannot move
// off that machine" is the loss #243 exists to prevent. So, exactly as
// overlaygate.go does:
//
//	live   match-stats/YYYY/MM/<matchId>                     ← everything that passes
//	kept   match-stats/YYYY/MM/<matchId>.rejected-<hash>     ← the archive's copy, verbatim
//
// ⚠️ THE FAILURE UNIT IS ONE RECORD. A refused record does not stop the write
// loop, does not fail the import, and does not touch the next match. That is
// the v0.9.13 overlay lesson stated as a property, and TestOneBadStatsRecord-
// DoesNotCostTheBatch is the guard.
//
// ⚠️ AND A CLEAN RECORD IS WRITTEN BYTE-IDENTICALLY. sanitizeArchivedStats
// returns the ORIGINAL slice unless it actually drops something, so a no-op
// re-import still plans as `unchanged` and the round-trip is meaning-for-
// meaning AND byte-for-byte. TestCleanStatsRecordIsWrittenByteIdentically pins
// it — without that property this file would be a migration regression rather
// than a guard.

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/ggd/platform/internal/matchstats"
)

// truncateText bounds one interpolated value inside a warning. Rune-based, so a
// cut never lands in the middle of a Chinese character and produces mojibake in
// the console.
func truncateText(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

// maxNamedStatsProblems bounds the warning text, like its overlay counterpart.
const maxNamedStatsProblems = 8

// statsProblem is one archived record the #207 gate would refuse, or one that
// survives with elements removed.
type statsProblem struct {
	// Collection/ID name the record as the archive holds it.
	Collection string
	ID         string
	// Reason is the operator-facing sentence. For an envelope failure it is the
	// gate's message; for a partial one it names the dropped elements.
	Reason string
	// Fatal distinguishes "the whole record is quarantined" from "the record is
	// imported with N elements removed".
	Fatal bool
}

func (p statsProblem) key() string { return p.Collection + "/" + p.ID }

// isMatchStatsEntry reports whether an archive entry is a LIVE match-stats
// record — not one of the `.rejected-*` quarantine copies, which are inert by
// construction and must be moved verbatim (re-judging them would produce a
// quarantine of a quarantine on every hop).
func isMatchStatsEntry(e Entry) bool {
	return strings.HasPrefix(e.Collection, matchstats.CollectionPrefix+"/") &&
		!matchstats.IsQuarantineID(e.ID)
}

// inspectArchivedStats returns the records the gate would act on, so the DRY
// RUN's warning and the WRITE's behaviour are decided by one function and can
// never disagree. Entries are visited in archive order, which apply.go has
// already sorted.
func inspectArchivedStats(a *Archive) []statsProblem {
	var out []statsProblem
	for _, col := range sortedCollections(a) {
		if !strings.HasPrefix(col, matchstats.CollectionPrefix+"/") {
			continue
		}
		for _, e := range a.ByCollection[col] {
			if matchstats.IsQuarantineID(e.ID) {
				continue
			}
			raw, err := a.ReadEntry(e)
			if err != nil {
				continue
			}
			if p, bad := judgeStatsRecord(e.Collection, e.ID, raw); bad {
				out = append(out, p)
			}
		}
	}
	return out
}

// sortedCollections lists the archive's collections in a stable order. Go
// randomises map iteration and an operator re-running a dry run must not get a
// different list each time.
func sortedCollections(a *Archive) []string {
	out := make([]string, 0, len(a.ByCollection))
	for col := range a.ByCollection {
		out = append(out, col)
	}
	sort.Strings(out)
	return out
}

// judgeStatsRecord is THE verdict function: it decodes the record envelope,
// re-runs the #207 ledger gate on its `ledger`, and reports what should happen.
//
// The envelope is judged by ID COMPARISON (`matchId` == the file it sits in),
// the same check the ingest route makes, because it is the one that produces a
// wrong answer rather than a missing one.
func judgeStatsRecord(col, id string, raw []byte) (statsProblem, bool) {
	var rec struct {
		MatchID string          `json:"matchId"`
		Ledger  json.RawMessage `json:"ledger"`
	}
	if err := json.Unmarshal(raw, &rec); err != nil {
		return statsProblem{Collection: col, ID: id, Fatal: true,
			Reason: "不是合法的 JSON 物件：" + truncateText(err.Error(), 80)}, true
	}
	if rec.MatchID == "" {
		return statsProblem{Collection: col, ID: id, Fatal: true,
			Reason: "缺少 matchId —— 沒有它就無法確認這份帳本屬於哪一場"}, true
	}
	if rec.MatchID != id {
		return statsProblem{Collection: col, ID: id, Fatal: true,
			Reason: fmt.Sprintf("帳本自稱是「%s」卻存在「%s」底下 —— 匯入後覆盤會把這場的資料算到另一場頭上",
				truncateText(rec.MatchID, 64), truncateText(id, 64))}, true
	}
	if len(rec.Ledger) == 0 {
		// An envelope with no ledger is useless but harmless: it says nothing
		// false. It travels as-is rather than being quarantined for being empty.
		return statsProblem{}, false
	}
	_, dropped, err := matchstats.Sanitize(rec.MatchID, rec.Ledger)
	if err != nil {
		return statsProblem{Collection: col, ID: id, Fatal: true,
			Reason: messageOf(err)}, true
	}
	if len(dropped) > 0 {
		return statsProblem{Collection: col, ID: id, Fatal: false,
			Reason: fmt.Sprintf("有 %d 筆明細讀不回來，匯入時會拿掉：%s",
				len(dropped), matchstats.DropSummary(dropped))}, true
	}
	return statsProblem{}, false
}

// sanitizeArchivedStats strips the ledger elements the #207 gate refuses out of
// an archived record.
//
// ⚠️ RETURNS THE ORIGINAL SLICE UNLESS SOMETHING IS ACTUALLY DROPPED — the
// property that keeps a clean migration byte-stable. An envelope failure
// returns ok=false and the caller quarantines the whole record.
func sanitizeArchivedStats(id string, raw []byte) (clean []byte, dropped []matchstats.Dropped, ok bool) {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(raw, &top); err != nil {
		return nil, nil, false
	}
	rawID, has := top["matchId"]
	if !has {
		return nil, nil, false
	}
	var matchID string
	if err := json.Unmarshal(rawID, &matchID); err != nil || matchID == "" || matchID != id {
		return nil, nil, false
	}
	rawLedger, has := top["ledger"]
	if !has || len(rawLedger) == 0 {
		return raw, nil, true
	}
	cleanLedger, dropped, err := matchstats.Sanitize(matchID, rawLedger)
	if err != nil {
		return nil, nil, false
	}
	if len(dropped) == 0 {
		return raw, nil, true
	}
	top["ledger"] = cleanLedger
	// `dropped` is part of the record's own contract (matchstats.Record): the
	// loss must be readable ON the record, not only in an import log the
	// operator will never open again. The archive's list is REPLACED, not
	// appended to — this import's verdict is the one that matches the bytes now
	// on disk, and merging two lists would double-count a record that was
	// already partially dropped at ingest.
	if next, err := json.Marshal(dropped); err == nil {
		top["dropped"] = next
	}
	out, err := json.Marshal(top)
	if err != nil {
		return raw, nil, true
	}
	return out, dropped, true
}

// writeMatchStats is the ZIP import's write gate for one record.
//
// Quarantine is written FIRST, for the same reason as the overlay's: if that
// write fails the import stops with the target untouched, rather than having
// discarded the only other copy of the data.
func writeMatchStats(t *Target, e Entry, data []byte, res *ApplyResult) error {
	clean, dropped, ok := sanitizeArchivedStats(e.ID, data)
	if ok && len(dropped) == 0 {
		return t.Store.Put(e.Collection, e.ID, json.RawMessage(data))
	}
	quarantine := matchstats.QuarantineIDFor(e.ID, data)
	if err := t.Store.Put(e.Collection, quarantine, json.RawMessage(data)); err != nil {
		return fmt.Errorf("隔離被擋下的覆盤帳本失敗：%w", err)
	}
	if !ok {
		// The envelope itself is wrong: nothing safe to make live. The verbatim
		// copy is on disk under the quarantine id and the import CONTINUES —
		// one bad record may never cost the batch.
		if res != nil {
			res.warn("覆盤帳本 %s/%s 沒通過寫入閘（#207），已原封不動隔離到 %s，沒有寫成生效的紀錄。"+
				"其餘場次照常匯入。", e.Collection, e.ID, quarantine)
		}
		return nil
	}
	if err := t.Store.Put(e.Collection, e.ID, json.RawMessage(clean)); err != nil {
		return err
	}
	if res != nil {
		res.warn("覆盤帳本 %s/%s 有 %d 筆明細沒通過寫入閘（#207），已從生效的紀錄中移除並記在該筆的 dropped 欄位；"+
			"原始內容原封不動留在 %s。", e.Collection, e.ID, len(dropped), quarantine)
	}
	return nil
}

// warnAboutArchivedStats appends the operator-facing dry-run warning, if any.
func (p *Plan) warnAboutArchivedStats(a *Archive) {
	problems := inspectArchivedStats(a)
	if len(problems) == 0 {
		return
	}
	fatal := 0
	for _, pr := range problems {
		if pr.Fatal {
			fatal++
		}
	}
	named := problems
	suffix := ""
	if len(named) > maxNamedStatsProblems {
		named = named[:maxNamedStatsProblems]
		suffix = fmt.Sprintf("（另有 %d 筆）", len(problems)-maxNamedStatsProblems)
	}
	lines := make([]string, 0, len(named))
	for _, pr := range named {
		lines = append(lines, fmt.Sprintf("%s —— %s", pr.key(), pr.Reason))
	}
	p.warn("這包有 %d 場的覆盤帳本是寫入閘會處理的（#207，其中 %d 場整份隔離）—— "+
		"帳本裡自稱的場次 id 跟檔名不一致、或帶著這個 build 讀不回來的區段，"+
		"照原樣寫進去會讓覆盤畫面把一場的資料算到另一場頭上。"+
		"**其餘場次一律照常匯入**，被處理的原始內容原封不動留在同一個 collection 的 *.rejected-* 底下：%s%s",
		len(problems), fatal, strings.Join(lines, "；"), suffix)
}

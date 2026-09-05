package platformarchive

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"sort"
	"strings"
)

// ErrRejected is the sentinel for "this archive was refused". Every refusal is
// TOTAL: an archive is either fully acceptable or not imported at all, because
// a half-imported account store is worse than a failed import.
var ErrRejected = errors.New("platformarchive: archive rejected")

func reject(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrRejected, fmt.Sprintf(format, args...))
}

// Entry is one verified archive member.
type Entry struct {
	Name       string
	Collection string
	// ID is the jsonstore id for doc/jsonl entries and the full file name for
	// opaque ones.
	ID       string
	Kind     EntryKind
	Declared int64

	file *zip.File
}

// Archive is a fully verified archive: manifest decoded, every entry name
// checked against the scope allowlist, every collection digest recomputed.
//
// Constructing one WRITES NOTHING. That is the whole point — the operator must
// be able to see what an archive would do before any byte of it lands.
type Archive struct {
	Manifest *Manifest
	// Entries grouped by collection, each list sorted by ID.
	ByCollection map[string][]Entry
	// Warnings are non-fatal observations (a missing checksum, most of all).
	Warnings []string
	// ChecksumVerified is false when the archive carries no checksum at all.
	ChecksumVerified bool

	closer io.Closer
}

// Close releases the underlying file, when Open owned one.
func (a *Archive) Close() error {
	if a.closer == nil {
		return nil
	}
	return a.closer.Close()
}

// Collections returns the collection names in sorted order.
func (a *Archive) Collections() []string {
	out := make([]string, 0, len(a.ByCollection))
	for col := range a.ByCollection {
		out = append(out, col)
	}
	sort.Strings(out)
	return out
}

// Open reads and fully verifies an archive from a file.
func Open(path string) (*Archive, error) {
	f, err := os.Open(path) // #nosec G304 -- operator-supplied path; this is a CLI/service input by design.
	if err != nil {
		return nil, err
	}
	st, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, err
	}
	a, err := OpenReaderAt(f, st.Size())
	if err != nil {
		_ = f.Close()
		return nil, err
	}
	a.closer = f
	return a, nil
}

// OpenReaderAt reads and fully verifies an archive from memory or a file.
//
// THE ORDER OF THE CHECKS IS LOAD-BEARING. Cheap structural refusals first
// (entry count, declared totals), then the manifest, then the exact
// declared-vs-actual set comparison, then per-entry hygiene, and only then any
// decompression — each stage bounded by what the previous one proved.
func OpenReaderAt(r io.ReaderAt, size int64) (*Archive, error) {
	zr, err := zip.NewReader(r, size)
	if err != nil {
		return nil, reject("不是有效的 ZIP：%v", err)
	}

	// 1. Central-directory ceilings. The header can lie about a single entry's
	//    size (guarded per-entry below), but it cannot lie about how many
	//    entries there are.
	if len(zr.File) > MaxEntries {
		return nil, reject("項目數 %d 超過上限 %d", len(zr.File), MaxEntries)
	}
	var declaredTotal uint64
	for _, f := range zr.File {
		declaredTotal += f.UncompressedSize64
		if declaredTotal > uint64(MaxTotalUncompressed) {
			return nil, reject("解壓後總量宣告超過上限 %d bytes", int64(MaxTotalUncompressed))
		}
	}

	// 2. The manifest. Everything after this point is judged against it.
	var mfFile *zip.File
	seen := map[string]bool{}
	for _, f := range zr.File {
		if seen[f.Name] {
			return nil, reject("項目名稱重複：%q", f.Name)
		}
		seen[f.Name] = true
		if f.Name == ManifestName {
			mfFile = f
		}
	}
	if mfFile == nil {
		return nil, reject("找不到 %s —— 這不是一個 %s", ManifestName, Kind)
	}
	manRaw, err := readEntry(mfFile, MaxManifestBytes)
	if err != nil {
		return nil, reject("讀取 %s 失敗：%v", ManifestName, err)
	}
	var man Manifest
	if err := json.Unmarshal(manRaw, &man); err != nil {
		return nil, reject("%s 不是有效的 JSON：%v", ManifestName, err)
	}
	if err := man.Validate(); err != nil {
		return nil, fmt.Errorf("%w: %s", ErrRejected, err.Error())
	}
	a := &Archive{Manifest: &man, ByCollection: map[string][]Entry{}}
	ok, err := man.VerifyChecksum()
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrRejected, err.Error())
	}
	a.ChecksumVerified = ok
	if !ok {
		a.Warnings = append(a.Warnings, "這包沒有 checksum —— 完整性未經驗證（手工組出來的封存是合法的，只是不能宣稱完整）。")
	}

	// 3. DECLARED SET == ACTUAL SET, exactly. One extra or one missing entry
	//    refuses the whole archive; a manifest that does not describe the file
	//    it ships with cannot be reasoned about at all.
	actual := map[string]*zip.File{}
	for _, f := range zr.File {
		if f.Name == ManifestName {
			continue
		}
		actual[f.Name] = f
	}
	for name := range man.Entries {
		if _, ok := actual[name]; !ok {
			return nil, reject("manifest 宣告了 %q，但 ZIP 裡沒有這個項目", name)
		}
	}
	for name := range actual {
		if _, ok := man.Entries[name]; !ok {
			return nil, reject("ZIP 裡有 %q，但 manifest 沒有宣告它", name)
		}
	}

	// 4. Per-entry hygiene + scope. Refusals name the entry AND the rule.
	declaredCols := map[string]bool{}
	for _, c := range man.Collections {
		declaredCols[c.Name] = true
	}
	for name, f := range actual {
		if err := checkEntryHygiene(name, f); err != nil {
			return nil, err
		}
		col, base, err := splitEntryName(name)
		if err != nil {
			return nil, err
		}
		rule := RuleFor(col)
		if rule == nil {
			return nil, reject("項目 %q 的集合 %q 不在允許清單內", name, col)
		}
		kind := rule.Kind
		id, err := entryID(rule, name, base)
		if err != nil {
			return nil, err
		}
		if rule.AllowID != nil && !rule.AllowID(id) {
			return nil, reject("項目 %q 不被允許：集合 %q 只接受特定文件（其餘是密鑰或不該搬遷）", name, col)
		}
		if !declaredCols[col] {
			return nil, reject("項目 %q 屬於集合 %q，但 manifest 的 collections 沒有列出它", name, col)
		}
		declared := man.Entries[name]
		limit := int64(MaxDocEntryBytes)
		if kind == KindOpaque {
			limit = MaxOpaqueEntryBytes
		}
		if declared > limit {
			return nil, reject("項目 %q 宣告 %d bytes，超過該種類上限 %d", name, declared, limit)
		}
		if int64(f.UncompressedSize64) != declared {
			return nil, reject("項目 %q 的 ZIP 標頭說 %d bytes，manifest 說 %d bytes",
				name, f.UncompressedSize64, declared)
		}
		// ⛔⛔ ZIP 標頭的 CompressedSize64 是 uint64 而且**由攻擊者填**。
		//
		// ⚠️ ⭐ 在這一段出現以前，下一行是 `declared / int64(f.CompressedSize64)` ——
		//   而 `int64(2^63)` 是 **−9223372036854775808** ⇒ ratio 變成 0 或負數
		//   ⇒ `ratio > MaxCompressionRatio` 為 **false** ⇒ ⛔⛔ **zip bomb 防線被繞過**。
		//   （實測：`int64(1<<63) = -9223372036854775808 · ratio = 0 · > 100 ? false`）
		//
		// ⭐⭐ 而它與上面 `:210` 那一行**方向相反**，兩行只隔四行：
		//   那一行溢位之後 `int64(...) != declared` 仍然成立 ⇒ **reject（fail-closed）**；
		//   這一行溢位之後**放行（fail-OPEN）**。⇒ ⛔ 同一份檔裡兩個相反的失效方向。
		//
		// ⇒ ⭐ 修法是**先把它擋成畸形標頭**，⛔ 不是加 `#nosec` 讓掃描器閉嘴：
		//   `declared` 在 `:207` 已經被 `limit` 夾住，所以一個大於 MaxInt64 的
		//   壓縮長度**在任何合法封包裡都不可能出現** —— 它只可能是偽造的。
		if msg := ratioGuard(name, declared, f.CompressedSize64); msg != "" {
			return nil, reject("%s", msg)
		}
		a.ByCollection[col] = append(a.ByCollection[col], Entry{
			Name: name, Collection: col, ID: id, Kind: kind, Declared: declared, file: f,
		})
	}
	for col := range a.ByCollection {
		list := a.ByCollection[col]
		sort.Slice(list, func(i, j int) bool { return list[i].ID < list[j].ID })
		a.ByCollection[col] = list
	}
	for _, c := range man.Collections {
		if len(a.ByCollection[c.Name]) != c.Entries {
			return nil, reject("集合 %q 宣告 %d 個項目，實際有 %d 個",
				c.Name, c.Entries, len(a.ByCollection[c.Name]))
		}
	}

	// 5. Decompress everything and re-derive every collection digest. This is
	//    the step that makes "verified before written" real: nothing below has
	//    a write path, and apply refuses to start without it.
	if err := a.verifyDigests(); err != nil {
		return nil, err
	}
	return a, nil
}

// verifyDigests recomputes every collection hash and re-checks each entry's
// real (not header-claimed) length.
func (a *Archive) verifyDigests() error {
	want := map[string]CollectionInfo{}
	for _, c := range a.Manifest.Collections {
		want[c.Name] = c
	}
	var total int64
	for _, col := range a.Collections() {
		hasher := newCollectionHasher()
		for _, e := range a.ByCollection[col] {
			if err := hasher.addEntry(e.ID, e.Declared); err != nil {
				return err
			}
			// THE HEADER CAN LIE. Read at most declared+1 bytes: one extra byte
			// arriving is itself the refusal, so a lying header cannot make us
			// decompress an unbounded stream.
			rc, err := e.file.Open()
			if err != nil {
				return reject("項目 %q 解壓失敗：%v", e.Name, err)
			}
			buf := &lengthWriter{limit: e.Declared}
			n, err := io.Copy(io.MultiWriter(hasher, buf), io.LimitReader(rc, e.Declared+1))
			closeErr := rc.Close() // Close is where archive/zip reports a CRC32 mismatch.
			if err != nil {
				return reject("項目 %q 讀取失敗：%v", e.Name, err)
			}
			if closeErr != nil {
				return reject("項目 %q 的 CRC 校驗失敗：%v", e.Name, closeErr)
			}
			if n != e.Declared {
				return reject("項目 %q 實際 %d bytes，宣告 %d bytes", e.Name, n, e.Declared)
			}
			if e.Kind == KindDoc && !json.Valid(buf.head) {
				return reject("項目 %q 不是有效的 JSON", e.Name)
			}
			total += n
			if total > MaxTotalUncompressed {
				return reject("解壓總量超過上限 %d bytes", int64(MaxTotalUncompressed))
			}
		}
		digest, count, bytes := hasher.sum()
		info := want[col]
		if info.SHA256 != "" && info.SHA256 != digest {
			return reject("集合 %q 的內容雜湊與 manifest 不符（封存在匯出後被改過或損毀）", col)
		}
		if info.Bytes != bytes || info.Entries != count {
			return reject("集合 %q 宣告 %d 個項目 / %d bytes，實際 %d / %d",
				col, info.Entries, info.Bytes, count, bytes)
		}
	}
	return nil
}

// lengthWriter keeps the first MaxDocEntryBytes of a doc so json.Valid can run
// without a second decompression pass. Opaque entries are never retained.
type lengthWriter struct {
	limit int64
	head  []byte
}

func (w *lengthWriter) Write(p []byte) (int, error) {
	if w.limit <= MaxDocEntryBytes {
		w.head = append(w.head, p...)
	}
	return len(p), nil
}

// ReadEntry returns one entry's bytes, re-checking its length.
func (a *Archive) ReadEntry(e Entry) ([]byte, error) {
	return readEntry(e.file, e.Declared)
}

func readEntry(f *zip.File, limit int64) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer func() { _ = rc.Close() }()
	data, err := io.ReadAll(io.LimitReader(rc, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("entry %q exceeds %d bytes", f.Name, limit)
	}
	return data, nil
}

// checkEntryHygiene refuses the WHOLE archive for any of the ZIP-format tricks.
// Every one of these is a total refusal rather than "skip that entry": an
// archive containing one of them is not an archive this tool produced, so
// nothing else in it can be trusted either.
func checkEntryHygiene(name string, f *zip.File) error {
	switch {
	case name == "":
		return reject("有一個空的項目名稱")
	case strings.HasPrefix(name, "/"), len(name) > 1 && name[1] == ':':
		return reject("項目 %q 是絕對路徑", name)
	case strings.Contains(name, ".."):
		return reject("項目 %q 含有 `..`（路徑穿越）", name)
	case strings.Contains(name, `\`):
		return reject("項目 %q 含有反斜線", name)
	case strings.ContainsRune(name, 0):
		return reject("項目 %q 含有 NUL", name)
	case strings.HasSuffix(name, "/"):
		return reject("項目 %q 是目錄項目（本封存格式沒有目錄項目）", name)
	case !strings.Contains(name, "/"):
		return reject("項目 %q 在根目錄 —— 根目錄只允許 %s", name, ManifestName)
	}
	// NEVER apply the archive's own mode. Writes go through jsonstore.Put
	// (0640 files / 0750 dirs) or renameio.WithStaticPermissions(0640).
	// A non-regular member (symlink, device, or anything carrying an execute
	// bit) has no legitimate reason to exist here.
	mode := f.FileInfo().Mode()
	if !mode.IsRegular() {
		return reject("項目 %q 不是一般檔案（mode %v）", name, mode)
	}
	if mode.Perm()&0o111 != 0 {
		return reject("項目 %q 帶有執行位元（mode %v）", name, mode.Perm())
	}
	return nil
}

// splitEntryName turns "accounts/by-email/a@b.com.json" into
// ("accounts/by-email", "a@b.com.json"). Everything before the LAST slash is
// the collection; every segment of it must satisfy jsonstore's own segmentRe.
func splitEntryName(name string) (col, base string, err error) {
	i := strings.LastIndex(name, "/")
	col, base = name[:i], name[i+1:]
	for _, seg := range strings.Split(col, "/") {
		if !segmentRe.MatchString(seg) {
			return "", "", reject("項目 %q 的集合路徑片段 %q 不是合法的 jsonstore collection", name, seg)
		}
	}
	if base == "" {
		return "", "", reject("項目 %q 沒有檔名", name)
	}
	return col, base, nil
}

// entryID derives the archive id from the file name, USING THE RULE'S KIND
// rather than guessing from the extension.
//
// Guessing was the first draft and it was wrong: a replay recorded as
// `<match>.jsonl` would have been classified KindJSONL and then rejected for
// disagreeing with the `replays` rule, i.e. a legitimate archive refused on a
// naming coincidence. The rule table owns the kind; the file name only has to
// be consistent with it.
//
// The id shape is jsonstore's own idRe, unchanged — see entryIDRe's comment for
// why tightening it would break login on the target host.
func entryID(rule *Rule, name, base string) (string, error) {
	var id string
	switch rule.Kind {
	case KindDoc:
		if !strings.HasSuffix(base, ".json") || strings.HasSuffix(base, ".jsonl") {
			return "", reject("項目 %q 屬於文件集合 %q，檔名必須以 .json 結尾", name, rule.Name)
		}
		id = strings.TrimSuffix(base, ".json")
	case KindJSONL:
		if !strings.HasSuffix(base, ".jsonl") {
			return "", reject("項目 %q 屬於 append-only 集合 %q，檔名必須以 .jsonl 結尾", name, rule.Name)
		}
		id = strings.TrimSuffix(base, ".jsonl")
	default:
		// Opaque members keep their whole file name as the id (a replay is
		// `<match>.jsonl.gz`, which has no single unambiguous extension).
		id = base
	}
	if id == "_index" {
		return "", reject("項目 %q 是衍生索引 —— 封存永遠不帶 _index.json，匯入由 jsonstore.Put 自己重建", name)
	}
	if !entryIDRe.MatchString(id) {
		return "", reject("項目 %q 的 id %q 不符合 jsonstore 的命名規則", name, id)
	}
	return id, nil
}

// ratioGuard 是 zip bomb 的壓縮比防線 —— ⭐ **出貨那一支**（`Inspect` 的唯一呼叫者）。
//
// ⛔⛔ 抽出來是因為它原本**溢位就放行**，⭐ 而那個情境用 `archive/zip` 的 Writer
// **造不出夾具**（它寫不出 CompressedSize64 > MaxInt64 的中央目錄）
// ⇒ ⛔ 沒有辦法從封包那一端驗它。⇒ 抽成一支吃**標頭原值**的函式，
// ⭐ 讓守衛餵得到那個值，⛔ 而 `Inspect` 仍然是唯一呼叫者（同一份程式，⛔ 不是第二條路）。
//
// ── ⛔ 它修的那個洞 ──────────────────────────────────────────────────────
// `compressed` 是 ZIP 標頭的 `CompressedSize64`（uint64，**由攻擊者填**）。
// 在此之前這裡是 `declared / int64(compressed)` ——
// 而 `int64(1<<63)` 是 **−9223372036854775808** ⇒ ratio 變成 0 或負數
// ⇒ `ratio > MaxCompressionRatio` 為 **false** ⇒ ⛔⛔ **防線被繞過**。
//
// ⭐⭐ 而 `Inspect` 上面四行的標頭長度檢查（`int64(f.UncompressedSize64) != declared`）
// 溢位之後仍然 **reject** —— ⇒ ⛔ 同一份檔裡兩行相鄰、**失效方向相反**。
//
// ⇒ ⭐ 判準：一個溢位會**放行**的檢查，比沒有檢查更糟 —— 它讓人以為那條線守著。
//
// 回傳空字串 = 通過。⛔ 非空 = 那一句就是 reject 的理由。
func ratioGuard(name string, declared int64, compressed uint64) string {
	// ⭐ 先擋畸形標頭。`declared` 在呼叫端已經被 `limit` 夾住，所以一個大於
	//    MaxInt64 的壓縮長度**在任何合法封包裡都不可能出現** —— 它只可能是偽造的。
	if compressed > math.MaxInt64 {
		return fmt.Sprintf(
			"項目 %q 的 ZIP 標頭宣告壓縮長度 %d bytes（超過 int64 上限）—— 畸形標頭，"+
				"⛔ 而它會讓壓縮比防線溢位成負數而被繞過", name, compressed)
	}
	if declared < MinRatioCheckBytes || compressed == 0 {
		return ""
	}
	// #nosec G115 -- bounded by the MaxInt64 guard above.
	if ratio := declared / int64(compressed); ratio > MaxCompressionRatio {
		return fmt.Sprintf("項目 %q 的壓縮比 %d:1 超過上限 %d:1（zip bomb 防線）",
			name, ratio, MaxCompressionRatio)
	}
	return ""
}

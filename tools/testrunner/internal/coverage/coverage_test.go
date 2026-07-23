package coverage

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const todoMD = `# Auth — TODO

Some prose that must be ignored.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| auth-01 | Register unique | auth-register-unique | unit | done |
| auth-02 | Reject dup username | auth-register-dup | exception | pending |

More prose.

| Feature | File |
| --- | --- |
| not a todo table | ignored.md |
`

func TestParseTodoMarkdownMatchesTodoCheckFormat(t *testing.T) {
	items := ParseTodoMarkdown("docs/todo/auth.md", todoMD)
	require.Len(t, items, 2, "the second table has no 'Test ID' column and must be ignored")
	assert.Equal(t, Item{
		ID: "auth-01", Item: "Register unique", TestID: "auth-register-unique",
		Category: "unit", Status: "done", File: "docs/todo/auth.md", Line: 7,
	}, items[0])
	assert.Equal(t, "auth-register-dup", items[1].TestID)
	assert.Equal(t, "pending", items[1].Status)
}

func TestLoadTodoDirSkipsUnderscoreFiles(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "auth.md"), []byte(todoMD), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "_index.md"), []byte(todoMD), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("x"), 0o644))

	items, err := LoadTodoDir(dir)
	require.NoError(t, err)
	assert.Len(t, items, 2)
}

func TestReadCoveredParsesNDJSONAndIgnoresGarbage(t *testing.T) {
	f := filepath.Join(t.TempDir(), "cov.ndjson")
	require.NoError(t, os.WriteFile(f, []byte(`{"cover":"a"}
not json at all
{"cover":"b"}
{"other":"c"}

{"cover":"a"}
`), 0o644))
	got := ReadCovered(f)
	assert.Equal(t, map[string]bool{"a": true, "b": true}, got)

	// Missing file → empty set, no error.
	assert.Empty(t, ReadCovered(filepath.Join(t.TempDir(), "nope.ndjson")))
}

func TestBuildJoinsAndCounts(t *testing.T) {
	items := ParseTodoMarkdown("docs/todo/auth.md", todoMD)
	m := Build(items, map[string]bool{"auth-register-unique": true}, "run-1")
	assert.Equal(t, "run-1", m.RunID)
	assert.True(t, m.Items[0].Covered)
	assert.False(t, m.Items[1].Covered)
	assert.Equal(t, 2, m.Counts["total"])
	assert.Equal(t, 1, m.Counts["done"])
	assert.Equal(t, 1, m.Counts["covered"])
	assert.Equal(t, 0, m.Counts["doneUncovered"])

	m2 := Build(items, map[string]bool{}, "")
	assert.Equal(t, 1, m2.Counts["doneUncovered"], "a done item without coverage must be counted")
}

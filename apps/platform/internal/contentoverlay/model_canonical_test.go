package contentoverlay

import (
	"encoding/json"
	"github.com/stretchr/testify/require"
	"os"
	"path/filepath"
	"testing"
)

func TestModelCanonicalMatchesSharedNumberAndUnicodeSpelling(t *testing.T) {
	got, err := canonicalModelJSON([]byte(`{"b":1.0,"a":[-0,0.000001,0.0000001,1e20,1e21,"<>&\u2028", "literal\\u2028"]}`))
	require.NoError(t, err)
	require.Equal(t, "{\"a\":[0,0.000001,1e-7,100000000000000000000,1e+21,\"<>&\u2028\",\"literal\\\\u2028\"],\"b\":1}", string(got))
}

// Optional release check reads real shared/TS-written frozen documents, not fixture hashes.
func TestModelReleaseHashesMatchShared(t *testing.T) {
	root := os.Getenv("GGD_MODEL_RELEASE_CONTENT")
	if root == "" {
		t.Skip("set GGD_MODEL_RELEASE_CONTENT to verify a prepared release")
	}
	paths, err := filepath.Glob(filepath.Join(root, "champions", "*.json"))
	require.NoError(t, err)
	count := 0
	for _, path := range paths {
		raw, err := os.ReadFile(path)
		require.NoError(t, err)
		var hero struct {
			Versions []retainedModel `json:"modelVersions"`
		}
		require.NoError(t, json.Unmarshal(raw, &hero))
		for _, v := range hero.Versions {
			model, err := os.ReadFile(filepath.Join(root, "models", v.ModelKey+".json"))
			require.NoError(t, err)
			canonical, err := canonicalModelJSON(model)
			require.NoError(t, err)
			require.Equal(t, v.ModelSHA256, modelDigest(canonical), v.ModelKey)
			count++
		}
	}
	require.Positive(t, count)
}

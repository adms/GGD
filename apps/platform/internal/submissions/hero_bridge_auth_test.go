package submissions

import (
	"github.com/stretchr/testify/require"
	"net/http"
	"testing"
)

func TestHeroImportBinarySignatureMatchesMain(t *testing.T) {
	req, err := http.NewRequest(http.MethodPost, "http://main.invalid/api/v1/content-import/prepare-work", nil)
	require.NoError(t, err)
	req.Header.Set("x-ggd-work-id", "work-proof")
	req.Header.Set("x-ggd-operation-id", "operation-proof")
	signHeroImport(req, []byte{80, 75, 3, 4}, "private-hero-import-fixture-20260906", 1788680000)
	require.Equal(t, "d718c9d0922b4af0b92c4a80de7daa6aff2197a9671acc5eedeb4542c5efa1a2", req.Header.Get("x-ggd-import-auth"))
}

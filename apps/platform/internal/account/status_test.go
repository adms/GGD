package account

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
)

// TestIsApproved covers the private-deploy gate's grandfather rule (#126): only
// an explicit pending/denied stamp blocks play; "" and "approved" are playable.
func TestIsApproved(t *testing.T) {
	cases := map[string]bool{
		"":             true, // grandfathered (legacy / gate disabled)
		StatusApproved: true,
		StatusPending:  false,
		StatusDenied:   false,
	}
	for status, want := range cases {
		require.Equal(t, want, Account{Status: status}.IsApproved(), "status %q", status)
	}
}

// TestPublicCarriesStatus asserts the API projection surfaces the approval
// state so the client can render a "pending review" screen.
func TestPublicCarriesStatus(t *testing.T) {
	require.Equal(t, StatusPending, Account{Status: StatusPending}.Public().Status)
	// A grandfathered account omits it (json omitempty keeps the wire clean).
	require.Equal(t, "", Account{}.Public().Status)
}

// TestSetStatusRejectsUnknown asserts SetStatus validates the value before any
// store write (the guard returns ErrInvalidStatus without touching Redis/JSON).
func TestSetStatusRejectsUnknown(t *testing.T) {
	store, err := jsonstore.New(t.TempDir())
	require.NoError(t, err)
	repo := NewRepo(store, redisx.New("127.0.0.1:0", ""))

	_, err = repo.SetStatus(context.Background(), "whoever", "banned-ish")
	require.ErrorIs(t, err, ErrInvalidStatus)
}

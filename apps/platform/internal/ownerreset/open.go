package ownerreset

import (
	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/internal/config"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/data/redisx"
)

// Open builds Deps against a real DATA_DIR + Redis.
//
// It uses config.LoadStorage rather than config.Load ON PURPOSE: Load demands
// JWT_SIGNING_SECRET and PLATFORM_GAME_SHARED_SECRET, which a command that
// mints no tokens does not need — and requiring them would mean an operator
// recovering a locked-out deploy has to reconstruct the platform's signing
// secrets before they may change their own password. The store path and Redis
// address still come from the same env vars with the same defaults, so this
// opens the SAME state the platform serves rather than a lookalike beside it.
//
// The caller must Close the returned handle.
func Open(st config.Storage) (Deps, func(), error) {
	store, err := jsonstore.New(st.DataDir)
	if err != nil {
		return Deps{}, func() {}, err
	}
	rdb := redisx.New(st.RedisAddr, st.RedisPassword)
	return Deps{
		Accounts: account.NewRepo(store, rdb),
		Rdb:      rdb,
		Store:    store,
	}, func() { _ = rdb.Close() }, nil
}

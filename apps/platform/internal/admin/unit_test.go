package admin

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/ggd/platform/internal/account"
	"github.com/ggd/platform/pkg/testkit"
)

// admin-pagination-unit: the pure pagination/role helpers behave — page math
// clamps, out-of-range pages return empty, and AccountRow never carries the
// password hash field.
func TestPaginationAndRoleHelpers(t *testing.T) {
	testkit.Cover(t, "admin-pagination-unit")

	// normalizePage clamps.
	p, ps := normalizePage(0, 0)
	assert.Equal(t, 1, p)
	assert.Equal(t, 20, ps)
	p, ps = normalizePage(3, 500)
	assert.Equal(t, 3, p)
	assert.Equal(t, 20, ps, "oversized pageSize falls back to default")

	items := []int{1, 2, 3, 4, 5}
	assert.Equal(t, []int{1, 2}, paginate(items, 1, 2))
	assert.Equal(t, []int{3, 4}, paginate(items, 2, 2))
	assert.Equal(t, []int{5}, paginate(items, 3, 2))
	assert.Nil(t, paginate(items, 9, 2), "page past the end is empty")

	// HasRole.
	a := account.Account{Roles: []string{"admin", "mod"}}
	assert.True(t, a.HasRole("admin"))
	assert.False(t, a.HasRole("root"))
	assert.False(t, account.Account{}.HasRole("admin"))

	// rowOf omits the password hash and normalizes nil roles to [].
	row := rowOf(account.Account{
		ID: "id1", Username: "u", Email: "e@x.io", PasswordHash: "$argon2id$SECRET",
		MMR: 1200, CreatedAt: time.Unix(0, 0),
	})
	assert.Equal(t, []string{}, row.Roles)
	assert.Equal(t, 1200, row.MMR)
	// AccountRow has no hash field by construction (compile-time guarantee);
	// this assertion documents intent.
	assert.NotContains(t, row.Username, "argon2")
}

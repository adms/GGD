// Package platformarchive moves the WHOLE platform data tree between hosts as
// one ZIP: export on the old machine, import on a new one, log in with the same
// passwords. Task #243 ("後台一鍵 ZIP 匯出/匯入平台資料，無痛移機").
//
// THE PRIMARY SCENARIO IS MIGRATION. Old host → NEW host with an empty data/.
// Everything here is optimised for that direction: the plan is pure addition,
// the automatic pre-write backup of an empty target costs nothing, and the
// documented first-import path is the CLI (a virgin host has no account, so
// nobody can log into the console to press the button). Overwriting a POPULATED
// host is the secondary, dangerous scenario; it needs explicit opt-in flags and
// the UI says so in red.
//
// WHY THIS IS NOT opstate v2. internal/opstate carries OPERATOR CHOICES
// (whitelist + combat-env + server-ops) and deliberately refuses credentials.
// This package carries the OPPOSITE: password hashes, unredeemed invite codes,
// wallets, the whole account store. Same repo, inverted threat model — so it is
// a NEW Kind (`ggd-platform-archive`) rather than a BundleVersion bump, per the
// rule laid down in docs/design/content-sync.md: when the SEMANTICS change, open
// a new Kind. `ggd-operator-state` v1 is untouched and `make family-restore`
// keeps pointing at it; that stays the whitelist-only path.
//
// # The two facts that shape every decision
//
//  1. ONE EXPORT = EVERY CREDENTIAL ON THE DEPLOY. Password hashes plus live
//     invite codes plus the admin role. That is why export is a POST (not a
//     GET that lands in browser history, access logs and bookmarks), why it
//     demands the caller's OWN password again on top of the admin session (the
//     /account/password precedent: a session alone is not authorisation for a
//     credential action), and why every call writes an audit line.
//
//  2. A HALF-IMPORTED ACCOUNT STORE IS WORSE THAN A FAILED IMPORT. jsonstore
//     gives single-object atomicity only — the one multi-file write in the
//     platform (settlement) had to grow a WAL for exactly this reason. There is
//     no transaction to borrow, so "never partially written" is bought the only
//     other way: decode, verify, resolve every name, verify every checksum,
//     compute the whole plan, re-compare it against the digest the operator
//     approved, and take the backup — ALL of it before the first Put. Any
//     failure before that point is a guaranteed zero-write.
//
// # Bytes are not round-trip stable; MEANING is
//
// Import writes through jsonstore.Put, which re-indents with MarshalIndent. So
// a re-export of an imported archive does NOT reproduce the original collection
// sha256, and nobody may use "the hashes match" as a success check. Every
// same/different decision in this package is therefore a CANONICAL comparison
// (json.Unmarshal into any, reflect.DeepEqual) — the same reasoning as
// opstate/restore.go's sameConfigDoc, minus the updatedAt stripping, because
// account documents have no server-rewritten timestamp field.
//
// # Scope is an ALLOWLIST, and export never walks DATA_DIR
//
// Export never calls filepath.WalkDir(dataDir). It iterates a fixed rule table
// (scope.go); each rule is either an exact collection name or a depth-bounded
// enumeration under one prefix. That is a structural property, not a filter:
// data/owner-setup-token (the 0600 single-use file whose holder can claim
// ownership of a fresh deploy — auth/bootstrap.go) and data/journal/ are
// UNREACHABLE, not denied. A denylist would be bypassed by the next collection
// somebody adds; an allowlist refuses it by default and says so.
//
// Symmetrically, import refuses the WHOLE archive when it carries a collection
// the rule table does not know. A hand-inserted journal/2026-07-26.log is named
// in the refusal instead of being silently skipped.
//
// # Why content-overlay IS carried
//
// On a host where content/ is a read-only git mount — which is every deployed
// host — data/content-overlay/overlay.json is the ONLY durable landing spot for
// content edits made in the admin console (#189). Leaving it out would silently
// drop every content edit the owner ever made on the old machine: precisely the
// class of loss this feature exists to prevent. It is also small (MaxDocs 5000,
// MaxDocBytes 512 KiB).
//
// # What is deliberately NOT carried, and why (also listed in the manifest)
//
//   - config/ai-provider — a PLAINTEXT provider API key (internal/ai). #179
//     refused to move it and said so; same call here.
//   - config/slack-notify — the webhook URL is a secret; the admin GET returns
//     it masked, and a ZIP would hand over the unmasked value.
//   - journal/ — settlement WAL. boot.Rebuild replays any intent without a
//     commit marker. Absolute-MMR replay is idempotent against THE SAME data,
//     never against another host's.
//   - owner-setup-token — one-time ownership claim. Never travels with files.
//   - blizzard-overlay/ — 84 MB of ASSETS that travel with the deploy image
//     (#177), not platform data. A fresh host looking bare is expected, and the
//     UI says so out loud.
//   - content-backups/ and icon-src-original/ — dev-workstation artefacts.
//   - _index.json — DERIVED state. Never exported, never trusted, never
//     written: jsonstore.Put rebuilds it from the files it actually wrote.
//   - _migration/ — this feature's own staging + backup area. The leading
//     underscore makes it structurally impossible for jsonstore's segmentRe to
//     accept it as a collection, so export cannot read it and no archive entry
//     can point into it.
//   - Redis — a rebuildable mirror, but NOT via boot.Rebuild. See reindex.go.
package platformarchive

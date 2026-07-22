# Content pipeline — TODO

`packages/shared/src/content`. JSON-per-object under `content/`, Zod single source of truth,
content-hash caching, referential integrity, `contentVersion` gate.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| content-01 | Zod schema round-trips a valid ability doc | content-ability-schema | unit | done |
| content-02 | Invalid doc is rejected with field errors | content-invalid-reject | exception | done |
| content-03 | Object hash is stable across key order | content-hash-stable | unit | done |
| content-04 | contentVersion is a pure function of content | content-version-pure | unit | done |
| content-05 | ContentLoader loads + registers all collections | content-loader-register | integration | done |
| content-06 | Dangling ref (ability→missing vfx) errors | content-dangling-ref | unit | done |
| content-07 | Client join rejected on contentVersion mismatch | content-version-gate | integration | pending |
| content-08 | content-api PUT validates before atomic write | content-api-validate-write | integration | done |
| content-09 | content-api path traversal is blocked | content-api-path-traversal | injection | done |
| content-10 | `?h=` immutable cache header on hashed requests | content-cache-immutable | integration | pending |
| content-11 | Editor preview casts via real driver, not mock | content-preview-real-engine | integration | pending |
| content-12 | Item modifier outside the per-stat sane range is rejected | content-item-modifier-range | exception | done |

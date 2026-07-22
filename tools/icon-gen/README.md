# icon-gen — the content icon batch

Decides which content entries need a generated icon, what to prompt for each,
what that would cost, and then — only when explicitly authorised — generates
them idempotently and resumably.

```sh
python3 tools/icon-gen/src/plan.py                  # classify; print the plan
python3 tools/icon-gen/src/plan.py --write          # ... and publish it for the UI
python3 tools/icon-gen/src/generate.py --dry-run    # what it would do + the bill
python3 tools/icon-gen/src/generate.py --dry-run --tier 1
```

| file | what it is |
| --- | --- |
| `src/prompt.py` | the PINNED image prompt, the lexicons, and doc → subject derivation. **Read this first.** |
| `src/plan.py` | the classifier. Live tree + live surfaces → `content/config/icon-plan.json`. |
| `src/generate.py` | the batch runner: sidecars, rate pacing, spend ceiling, dry run. |
| `src/pricing.json` | per-image rates. **A quote, not a contract** — confirm before spending. |
| `out/` | `raw/` full-size images, `subjects.json` text-mode cache, `ledger.jsonl` receipts. |

---

## 1. Extraction came first, and it is finished

The map author's own art is free, original and better than anything a model
will paint. `tools/w3x-import/extract_icons.py` pulls it out, and **it has
already pulled out all of it**: 113 PNGs, wired into 113 docs, 0 conversion
failures, and a re-run patches 0 files.

That number was independently re-derived, not trusted. Every one of the 584
entries the importer classified as Blizzard *stock* was re-tested against the
map archive with a wider candidate set than the importer itself uses — `.blp`,
`.tga`, `.dds`, `.png`, `.jpg`, `.bmp`, plus a `war3mapImported\` re-path —
and **0 new hits** came back. There is no more map art to find.

The register in `docs/asset-debt.md` used to say "695 stock / 2 map-custom".
Both were wrong: **111 of that 695 were the author's own art hiding at
stock-looking `ReplaceableTextures\CommandButtons\` paths**. Archive
MEMBERSHIP is the test, never the path prefix.

| resolution | count |
| --- | --- |
| `archive` — map-custom, extracted, on disk | **113** |
| `stock` — Blizzard, cannot ship | **584** |
| `no-art-field` — the w3x object never overrode its base | 152 |
| `no-wc3-source` | 16 |

---

## 2. The plan: have / drop / blocked / generate

`plan.py` re-evaluates every rule against the docs on disk each run. There is
no hard-coded id list anywhere in it, so an entry another task renames or
rewrites is re-classified automatically instead of keeping a stale verdict.

**have** — art already exists.

**drop** — deliberately never generated. Six rules, each carrying the standing
decision that justifies it:

| rule | why |
| --- | --- |
| `recipe-book` | `製作書` in the name. 「理論上競技場上的所有道具跟武器都不需要合成」 — there is no combine step, the sim never had one, and task #70's gates make these permanently unreachable. An icon on a recipe book advertises a crafting UI that does not exist. |
| `name-equals-id` | the w3x string table never resolved a display name, so there is no subject to paint. |
| `inert-and-undescribed` | no description AND no modifiers/passive/hooks — nothing to prompt from and nothing it can do. |
| `empty-imported-champion` | an imported hero with an empty description is not meant for use. |
| `placeholder-ability` | the name is literally `"none"`. |
| `kit-of-dropped-champion` | a dropped champion's Q/W/E/R/EX never render either. |

**blocked** — must not be generated *yet*, pending a human decision. Today that
is `third-party-ip`: champions whose name or description carries `(出自:…)`
naming a real property. The roster includes Bulbasaur, Doraemon, Winnie the
Pooh, Sadako and the Xenomorph. A model either refuses them or returns a
knock-off, which recreates exactly the exposure this work exists to retire.

**generate** — split into **tier 1** (something in the live game offers it
today) and **tier 2** (real content, but no surface currently reaches it), so a
first spend can be small and still visibly change the game.

### The veto runs before every drop rule

Every id named by a live surface is collected first and made **undroppable**:

```
apps/platform/internal/curation/starter.go
content/loot-tables/{legendary-weapons,quest-rewards,round-reward}.json
content/config/{store,arena-rules}.json
packages/shared/src/sim/content/skeleton.ts
data/curation/whitelist.json
```

The scrape is deliberately over-inclusive — every id-shaped token in those
files, not just the ones in the list that matters. A veto that is too broad
costs a few dollars; a veto that is too narrow ships a live shop row with no
picture.

**The operator whitelist is read as a veto ONLY, never as a filter.** It ships
default-empty and is union-only — "a SUGGESTION, not a floor" — so an id being
absent from it means nothing. Using it as a drop axis would delete art for
everything the moment an operator enabled one champion.

---

## 3. The prompt

Derived from the 28 item + ability icons the map author drew — **not** from the
85 champion portraits, which are cropped anime screenshots and are not a style
anyone can follow. See the header of `src/prompt.py`: every prefix clause is
annotated with the specific failure it prevents, and the negative list forbids a
baked-in bevel because the extracted icons have one and it makes rarity
recolouring impossible.

Two subject modes:

- `--subject=rules` (default, free, offline). A lexicon over the doc's **name**.
  Its ceiling is measured and stated: 529 abilities collapse to 192 distinct
  fingerprints, and 邪王炎殺劍 vs 陽光烈焰 differ only by the name inside the
  quotes, so they will probably paint the same picture.
- `--subject=text`. One cheap `/ai/text` call per doc writes the subject line,
  cached in `out/subjects.json` and hash-sidecar'd like everything else. The
  prefix and negative are never delegated — the invariants that make the set
  cohere stay in code where they can be diffed.

---

## 4. Resumability, and why it is the point

Every icon gets a `<out>.png.hash` sidecar over the template version, the full
prompt, the family, the model, the quality and the shipped edge. A run skips
anything whose PNG exists with a matching sidecar. **The sidecar is written
last**, after the PNG lands, so a kill between the two costs one re-render and
never a false "done".

TTS re-renders cost seconds. These cost money. A 400-image run that dies at 250
must resume at 251.

The full-size provider image is kept in `out/raw/` by default: if the shipped
size turns out wrong we re-derive from raw instead of paying twice for the same
picture. `out/ledger.jsonl` gets one line per billed call — the receipt.

---

## 5. The money gates

All four must pass before one cent is spent.

1. `--dry-run` calls nothing at all, and is what every example above uses.
2. `--i-have-confirmed-pricing` is **mandatory** for a live run. `pricing.json`
   is a quote from a language model's training data, not a live feed.
3. A `stub:true` response **aborts the run on the first image**. Stub mode means
   no provider is configured; without this gate the run would paper the content
   tree with hundreds of deterministic gradients and mark them all done.
4. `--max-spend` (default **$5.00**) is re-checked before every single call and
   stops the run mid-flight rather than exceed it.

The runner also refuses to overwrite any id the importer resolved as `archive`.

### It never holds a key

There is no way to give this tool a provider key and it has no field to store
one. It calls the platform's `/api/v1/ai/icon`, which attaches the key the
operator saved in the admin console. All it needs is a normal platform access
token in `$GGD_PLATFORM_TOKEN`, which is never written to disk and never logged.

---

## 6. Before the first real run

`apps/platform/internal/ai/provider.go` used to send the DALL·E request shape
unconditionally — `response_format: "b64_json"` plus a size off a 16..1024
clamp. Against the current image models both are hard 400s: the parameter is
rejected outright and 256×256 is not a size they offer. **Every icon generation
failed, and configuring a key would not have fixed it.** That is repaired and
pinned by `ai-image-dialect` in `docs/todo/ai.md`.

Still required from the operator:

1. Configure an image provider in the admin console (endpoint, model, key).
   `data/config/ai-provider.json` does not exist on this machine — the config
   has never been saved, and `/ai/icon` returns the placeholder.
2. Check `src/pricing.json` against the provider's published rates.
3. Generate a small contact sheet first and **look at it**. Ability slots
   09/10 in a mixed sheet should be twins and 11/12 should not; if that is
   inverted, the template is not ready and a full run will produce 600 images
   of the same three pictures.

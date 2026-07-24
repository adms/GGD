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

`src/` is the CLOUD generation (a paid provider through the platform). `local/`
is the on-device one, and it is what actually drew the shipped set:

| file | what it is |
| --- | --- |
| `local/pipeline.py` | the ONE place a Stable-Diffusion checkpoint is loaded (MPS → CPU). |
| `local/keywords.py` | doc → subject/hue lexicon + `pass1_prompt` / `pass2_prompt`. **The prompts live here and nowhere else.** |
| `local/batch.py` | the resumable two-pass driver: worklist, `.method` sidecars, `set_icon_field`. |
| `local/daemon.py` | **§7** — the loopback job queue the admin console calls when content is created. |
| `local/server.py` | an OpenAI-`/v1/images/generations` shim, so the cloud path can run against the local GPU with no Go change. |
| `local/gen.py`, `local/wire_icon_fields.py` | one-off helpers. |

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

**That repair has landed** (`isLegacyImageModel` / `imageRequestSize` in
`provider.go`, covered by `ai_test.go`). The residual on task #112 is therefore
*configuration*, not code — see item 1. And note the cloud path is not on the
critical path at all any more: §7's daemon renders locally, so nothing about
icon generation waits on a provider or a key.

Still required from the operator:

1. Configure an image provider in the admin console (endpoint, model, key).
   `data/config/ai-provider.json` does not exist on this machine — the config
   has never been saved, and `/ai/icon` returns the placeholder. This is the
   **only** live part of #112; the dialect bug above is fixed.
2. Check `src/pricing.json` against the provider's published rates.
3. Generate a small contact sheet first and **look at it**. Ability slots
   09/10 in a mixed sheet should be twins and 11/12 should not; if that is
   inverted, the template is not ready and a full run will produce 600 images
   of the same three pictures.

---

## 7. Icons on create — the admin console hook (#186)

> 「後台新增英雄、技能、武器、道具…這些時，也自動動態生成適合的 icon」

A document with no icon renders as a GlyphTile **letter tile** (「鐵」「疾」「B」).
That is not a cosmetic gap: it is this project's most-repeated complaint,
「根本不知道哪招是哪招」, arriving through a side door — #110 made card icons
mandatory on the draft screen for exactly that reason. So every un-iconed doc
the console creates walks that regression back in, and the fix belongs at the
**create seam**, not in a batch somebody has to remember to start.

```sh
# start it once; leave it running while you author
.venv/bin/python local/daemon.py --warm       # 127.0.0.1:8789, warm checkpoint
```

The admin vite server proxies `/icon-api` → `127.0.0.1:8789`
(`apps/admin/vite.config.ts`). 內容管理 then:

* **creates the document first, and asks for art second.** `gen.request` is
  fire-and-forget by contract (`IconGen.request` returns `void`), so a
  seconds-to-minutes render can never delay ＋新增. A failed or skipped
  generation leaves a perfectly valid document — never a half-created one.
* **polls `/icon-api/jobs` every 4 s**, the same cadence #97's live coverage bar
  recomputes at, and only while something is in flight.
* **re-reads the list when a job finishes**, so the art actually appears instead
  of a success line sitting next to a letter tile.

### It reuses the batch, it does not reimplement it

`daemon.py` imports `keywords.pass1_prompt` / `pass2_prompt`,
`batch.render_two_pass`, `batch._save`, `batch._is_done` and
`batch.set_icon_field`. It contains **no prompt text of its own** — which is how
the emblem/crest framing that `keywords.py` A/B-tested and *rejected* (it pulled
every picture toward a medallion and away from the subject) stays rejected here
too. A console-created doc gets byte-identically what a batch-created one gets:
same lexicon, same two passes, same `METHOD_VERSION`, same 128 px WebP.

### A new augment must not land on the generic sigil

`augment_keywords` tries three sources in order: a **curated** entry in
`AUGMENT_SUBJECT`, then a **name** substring from `AUG_NAME_HINT`, then a **tag**,
then the fallback `"a glowing heraldic power sigil"`.

All 21 shipped augments are curated, so the name table was only ever exercised
by ids that already had a better answer — and it had gone thin without anyone
noticing. **A card created in the console has no curated entry by definition**,
so it lands on the name table, and a measured probe (`thunder-sigil`) fell
straight through to the generic sigil because `"storm"` was present and
`"thunder"` was not. Unmatched cards all draw the *same* sigil, which is
「根本不知道哪招是哪招」 reproduced on brand-new content.

`AUG_NAME_HINT` is therefore widened (thunder/lightning, poison, shadow/void,
holy/light, crit, pierce, thorn, leech, heal/regen, wind, stone, mana, … plus
the matching 中文 morphemes 毒/影/暗/聖/暴擊/吸血/荊棘/穿透/鐵/岩/速/爆). Two
rules when adding more:

* **Order is load-bearing.** The first substring hit wins, so a longer key must
  precede any key contained in it (`lightning` before `light`).
* **Watch for substring false positives.** Bare `"ice"` is deliberately absent —
  it fires inside *justice* and *sacrifice*. `justice-blade` correctly resolves
  to crossed blades, not an ice crystal.

Verify a change without spending a GPU:

```bash
.venv/bin/python -c "import sys;sys.path[:0]=['src','local'];import keywords,json;\
print(keywords.augment_keywords({'id':'雷霆之怒','name':'雷霆之怒','tags':[]}))"
```

The 21 shipped ids must stay `curated` — that is the regression check.

### The two schema shapes

| collection | what gets written |
| --- | --- |
| champions / abilities / items | the WebP **and** the doc's `icon` field |
| augments | the WebP **only** — `augment@1` is `.strict()` with no `icon` field; art is resolved by convention from `assets/icons/augments/<id>.webp` |
| loot-tables | nothing; a pool has no art of its own |

### Every refusal is a sentence on screen

`POST /icon-api/jobs` answers **409 with a `reason`** rather than failing quietly.

| reason | meaning |
| --- | --- |
| `blocked` | the id is in `icon-plan.json`'s held bucket (today: third-party IP). A held gate is not a coverage gap and is never filled automatically. Re-read whenever the plan file changes. |
| `author-art` | the doc's `icon` points at a file that exists with **no `.method` sidecar** ⇒ w3x or hand-picked art. The map's own art outranks anything we invent, and `force` cannot reach this branch. |
| `already-done` | a current-`METHOD_VERSION` icon is on disk. **Re-saving an entity therefore regenerates nothing.** |
| `placeholder-ability` | the ability's `name` is literally `"none"` and it has no description — a slot the w3x import never filled. See below. |
| `no-icons` / `no-doc` / `bad-id` | asked for something that has no art, or does not exist. |
| `no-engine` | torch/MPS unusable on this machine. The job **fails loudly**; it never writes a placeholder. |

#### Why `placeholder-ability` refuses instead of drawing

These are the **only 16 docs in the whole content tree without an icon**, so
they look like the last coverage gap. They are not one. All 16 are the Q/W/E/R
of four champions — `godie-e00u` (十六夜Sakuya), `godie-h02n` (打我阿笨蛋),
`godie-u01f` (黑化張飛), `godie-u01q` (索隆) — and they are **byte-identical to
each other**: `name: "none"`, no description, and the same cooldown 12 / mana 60
/ range 11 / damage 80–240 / `fx.prim.physical.nova`.

Identical input means an identical prompt, so generating would produce 16
interchangeable pictures and mark four kit-less champions as visually finished —
manufacturing 「根本不知道哪招是哪招」 rather than curing it. None of the four
is in the 48-champion whitelist, so **nothing renders them to a player at all**;
in the console they show the ordinary letter tile. `plan.py` already classifies
them `drop` for exactly this reason (「這是原圖的佔位格，沒有任何可以下筆的內容」);
the daemon now agrees, so the 補圖示 button cannot quietly disagree with the plan.

**The fix for these 16 is authoring the kits, not the art.**

Eligibility is evaluated at enqueue **and again immediately before rendering**,
because a queued job can sit behind a long one while you hand-pick art for the
very doc it was about to overwrite.

### It never writes a placeholder

Two guards, both inherited from `batch.py`: no engine ⇒ fail before any `_save`;
a blank/solid render (channel spread &lt; 30) ⇒ discard and fail. A letter tile
the owner can see is honest. A gradient that looks finished is not — that is the
same reasoning as §5's `stub:true` abort.

### Off the Mac it degrades out loud

`local/models/` is 2 GB and gitignored, `.venv` likewise, and ggd.adms.ai has no
GPU — so **generation is an authoring-time act on the owner's Mac** and the
family host only ever serves the committed WebPs. The console has three states
and all three speak:

* **live** — daemon up on a machine that can render.
* **readonly** — dev build, daemon unreachable *or* reporting no torch/MPS. The
  strip says art is pending and prints the command above. It never spins.
* **off** — not a dev build. 內容管理 is dev-only by construction, so the whole
  chunk (and this client with it) is absent from a production admin build.

Pinned by `apps/admin/src/icons/iconApi.test.ts`.

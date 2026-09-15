# Borrowed / retargeted motion review v1

This workflow builds an owner-facing, per-candidate approval page for native,
borrowed, retargeted, and death-presentation motion candidates. It reuses
`apps/client/public/champion-model-audition.html`; it does not implement another
model player or perform browser-side retargeting.

The review page requests the existing audition with `live=1`, shows an explicit
loading or error overlay, and starts the whole-frame ascend/fade mockup only
after the target model has loaded with visible triangles. Both the embedded
frame and **全頁查看** retain the complete game-camera view.

The source of truth is
`materials/hero-model-library/motion-review/borrowed-motion-candidates.json`.
Only candidates whose target model resolves the declared state to the declared
embedded clip, whose skeleton compatibility is verified, and whose evidence
files exist can enter the playable queue. Unsupported leads stay visible in
`blockedLeads` without approval controls.

Generate and check:

```bash
python3 tools/hero-model-library/source-workflows/borrowed-motion-review-v1/build_review.py
python3 tools/hero-model-library/source-workflows/borrowed-motion-review-v1/build_review.py --check
python3 -m unittest tools/hero-model-library/source-workflows/borrowed-motion-review-v1/test_build_review.py
```

Serve the client dev app, then open
`/borrowed-motion-review.html`. Decisions are a browser-local draft and export
as `ggd.borrowed-motion-review-decisions@1`. They never update model documents,
champion configuration, backend dropdowns, or runtime bindings. A later
integration batch must validate an approved candidate and apply it explicitly.

`hurt-ascend-fade` previews the target's accepted hurt clip and then animates
the whole preview frame upward while fading. This is presentation review only;
it is not proof of world-space runtime behavior. `same-work-borrowed` is a
separate supported provenance tag and still requires a target-side converted
GLB plus skeleton and playback evidence before it can enter the queue.

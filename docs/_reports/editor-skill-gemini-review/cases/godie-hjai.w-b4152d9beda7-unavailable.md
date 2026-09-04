# VFX visual review unavailable: godie-hjai.w

- Classification: **needs-human-review**
- Authority: **advisory-only**
- Reason: **GEMINI_UNAVAILABLE**
- Provider: **Google Gemini**
- Endpoint: `https://generativelanguage.googleapis.com`
- Source digest: `b4152d9beda79c910aea41286b7a15210d7f202f82ec34c84c445d4373832bc8`

Vision inference was unavailable and no AI pass was granted. SimWorld/event-trace checks and human visual acceptance must continue.

Detail: Gemini returned HTTP 429: {
  "error": {
    "code": 429,
    "message": "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_requests_per_model, limit: 25, model: gemini-3.1-pro\nPlease retry in 19.407421339s.",
    "status": "RESOURCE_EXHAUSTED",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.Help",
        "links": [
          {
            "description": "Learn more about Gemini API quotas",
            "url": "https://ai.google.dev/gemini-api/docs/rate-limits"
          }
        ]
      },
      {
        "@type": "type.googl

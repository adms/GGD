# VFX visual review unavailable: godie-e001.r

- Classification: **needs-human-review**
- Authority: **advisory-only**
- Reason: **GEMINI_UNAVAILABLE**
- Provider: **Google Gemini**
- Endpoint: `https://generativelanguage.googleapis.com`
- Source digest: `36e644f7b8d950f1c9575471135763b14bdcc7eeb91699d62c411f10cc1984f4`

Vision inference was unavailable and no AI pass was granted. SimWorld/event-trace checks and human visual acceptance must continue.

Detail: Gemini returned HTTP 429: {
  "error": {
    "code": 429,
    "message": "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_requests_per_model, limit: 25, model: gemini-3.1-pro\nPlease retry in 13.243632708s.",
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

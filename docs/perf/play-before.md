# Play endpoint baseline

Baseline measurements were not available before the route change. The endpoint does not emit `Server-Timing` entries (`auth`, `db`, `sign`, `total`), and no signed-in test credential is available in the permitted local configuration. No benchmark requests were sent, so no timings are inferred or fabricated.

| Caller | State | Requests | p50 total | p95 total | Server-Timing (auth / db / sign / total) |
|---|---|---:|---:|---:|---|
| Guest | Cold | 30 requested | Not measured | Not measured | Not emitted |
| Guest | Warm | 30 requested | Not measured | Not measured | Not emitted |
| Signed-in | Cold | 30 requested | Not run | Not run | Not emitted |
| Signed-in | Warm | 30 requested | Not run | Not run | Not emitted |

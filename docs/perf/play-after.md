# Play endpoint after change

Database region: `ap-northeast-2` (Seoul). Vercel Functions use `icn1` in `api/vercel.json`.

The requested before/after benchmark could not be run: baseline Server-Timing data was not available, this route does not emit `Server-Timing` (`auth`, `db`, `sign`, `total`), and no signed-in test credential was provided. No benchmark requests were sent. Percent changes therefore cannot be calculated.

| Metric | Before guest cold | After guest cold | Change | Before guest warm | After guest warm | Change | Before signed-in cold | After signed-in cold | Change | Before signed-in warm | After signed-in warm | Change |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Requests | 30 requested | Not measured | N/A | 30 requested | Not measured | N/A | 30 requested | Not run | N/A | 30 requested | Not run | N/A |
| p50 total | Not measured | Not measured | N/A | Not measured | Not measured | N/A | Not run | Not run | N/A | Not run | Not run | N/A |
| p95 total | Not measured | Not measured | N/A | Not measured | Not measured | N/A | Not run | Not run | N/A | Not run | Not run | N/A |
| Server-Timing: auth / db / sign / total | Not emitted | Not emitted | N/A | Not emitted | Not emitted | N/A | Not emitted | Not emitted | N/A | Not emitted | Not emitted | N/A |

See [play-before.md](play-before.md) for the baseline limitation.

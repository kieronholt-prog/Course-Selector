# Course Selector — security notes

## Done in the app (v3.54+)

- [x] Admiralty API key removed from the browser (`index.html`)
- [x] Content-Security-Policy meta tag (scripts/styles stay inline; network limited to known hosts)
- [x] Tides only via Cloudflare Worker (`wsc-tidal-proxy.kieronholt.workers.dev`)
- [x] Service worker caches versioned; shell uses network-first when online

## You must still do (Admiralty key)

The old key was in public git history. Treat it as compromised:

1. Log in to the UKHO / Admiralty developer portal
2. **Revoke / rotate** the old API key
3. Store the **new** key only as a Cloudflare Worker secret (e.g. `ADMIRALTY_API_KEY`)
4. Confirm `index.html` / GitHub contain **no** API keys
5. Redeploy the Worker and smoke-test tides online

## Cloudflare Worker rate-limit checklist

Use this when reviewing or updating `wsc-tidal-proxy`:

### Secrets & upstream

- [ ] Admiralty key lives only in Worker secrets — never in client or committed source
- [ ] Worker calls Admiralty server-side; client only hits your Worker URL
- [ ] Upstream responses cached (you already aim for ~6 hours) to cut quota use

### Rate limiting & abuse

- [ ] Limit requests **per client IP** (e.g. 30–60 / hour, burst 5–10)
- [ ] Cap concurrent in-flight Admiralty calls globally
- [ ] Reject unexpected query params; allowlist `station` (e.g. `0062` only) and `duration` (small range)
- [ ] Return `429` with `Retry-After` when limited
- [ ] Optional: require a shared header/token only your app sends (security through obscurity — pair with rate limits, don’t rely on it alone)

### CORS & methods

- [ ] `Access-Control-Allow-Origin` only for your app origin(s), not `*` if practical
- [ ] Allow `GET` (and `OPTIONS` for preflight) only — block `POST`/`PUT`/`DELETE`
- [ ] No `Access-Control-Allow-Credentials` unless you truly need cookies

### Observability

- [ ] Log Worker errors and 429 counts (Cloudflare analytics / Logpush)
- [ ] Alert if Admiralty upstream errors spike (key revoked, quota exhausted)
- [ ] Periodically confirm cache hit rate stays high

### Example Worker guard (sketch)

```js
// Pseudocode — adapt to your Worker
const LIMIT = 40;          // requests per window
const WINDOW_MS = 3600000; // 1 hour
const ALLOWED_STATIONS = new Set(['0062']);

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' && request.method !== 'OPTIONS') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    // ...handle OPTIONS / CORS for your app origin...

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (await overLimit(env, ip, LIMIT, WINDOW_MS)) {
      return new Response('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': '3600' },
      });
    }

    const url = new URL(request.url);
    const station = url.searchParams.get('station') || '';
    if (!ALLOWED_STATIONS.has(station)) {
      return new Response('Bad station', { status: 400 });
    }
    // ...cache lookup, then Admiralty fetch with env.ADMIRALTY_API_KEY...
  }
};
```

Durable Object, KV, or Cloudflare rate-limiting product can back `overLimit`.

## If the site or Worker is compromised

Tell members to:

1. Remove the Home Screen icon  
2. Safari → clear website data for your domain  
3. Re-add only from the official club URL  

## Canonical install URL

Publish one official link (club site / QR). Ask members to ignore unofficial copies.

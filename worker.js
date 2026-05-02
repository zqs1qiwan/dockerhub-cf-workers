// Docker Hub Mirror Worker — Cloudflare Workers
// Open source: https://github.com/zqs1qiwan/dockerhub-cf-workers

const DOCKER_HUB = 'registry-1.docker.io';
const AUTH_URL = 'https://auth.docker.io';
const GITHUB_REPO = 'https://github.com/zqs1qiwan/dockerhub-cf-workers';

const ROUTES = {
  "quay":       "quay.io",
  "gcr":        "gcr.io",
  "k8s-gcr":    "k8s.gcr.io",
  "k8s":        "registry.k8s.io",
  "ghcr":       "ghcr.io",
  "cloudsmith": "docker.cloudsmith.io",
  "nvcr":       "nvcr.io",
};

function resolveUpstream(hostname, nsParam) {
  if (nsParam) return nsParam === 'docker.io' ? DOCKER_HUB : nsParam;
  return ROUTES[hostname.split('.')[0]] || DOCKER_HUB;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ua = (request.headers.get('User-Agent') || '').toLowerCase();
    const workersUrl = `https://${url.hostname}`;

    // Block crawlers
    if (['netcraft'].some(bot => ua.includes(bot))) {
      return new Response('Not Found', { status: 404 });
    }

    const ns = url.searchParams.get('ns');
    const upstream = resolveUpstream(url.hostname, ns);
    const isHub = !ns && !(url.hostname.split('.')[0] in ROUTES);

    // Browser requests → UI
    if (ua.includes('mozilla')) {
      if (!isHub) {
        // fall through to Docker API proxy
      } else if (url.pathname === '/') {
        return searchPage('', null, workersUrl);
      } else if (url.pathname === '/search' || url.pathname === '/v1/search') {
        const q = url.searchParams.get('q') || url.searchParams.get('query') || '';
        const page = parseInt(url.searchParams.get('page') || '1');
        if (!q) return searchPage('', null, workersUrl);
        const apiUrl = `https://index.docker.io/v1/search?q=${encodeURIComponent(q)}&n=25&page=${page}`;
        const apiResp = await fetch(apiUrl, {
          headers: {
            'Host': 'index.docker.io',
            'Accept': 'application/json',
            'User-Agent': 'docker/20.10.0 go/go1.16.0 kernel/5.4.0 os/linux arch/amd64',
          }
        });
        const data = await apiResp.json();
        return searchPage(q, data, workersUrl, page);
      } else {
        const hubUrl = new URL(url.toString());
        hubUrl.hostname = 'hub.docker.com';
        return fetch(new Request(hubUrl, {
          headers: {
            'Host': 'hub.docker.com',
            'Accept': request.headers.get('Accept') || 'text/html,*/*',
            'Accept-Language': request.headers.get('Accept-Language') || 'en-US,en;q=0.9',
            'User-Agent': 'Mozilla/5.0 (compatible; DockerHub-Mirror/2.0)',
          }
        }));
      }
    }

    // v1 API (docker CLI search)
    if (url.pathname.startsWith('/v1/') && !ua.includes('mozilla')) {
      const indexUrl = new URL(url.toString());
      indexUrl.hostname = 'index.docker.io';
      return fetch(new Request(indexUrl, {
        headers: {
          'Host': 'index.docker.io',
          'Accept': 'application/json',
          'User-Agent': 'docker/20.10.0 go/go1.16.0 kernel/5.4.0 os/linux arch/amd64',
        }
      }));
    }

    // ── Docker Registry API proxy ──
    url.hostname = upstream;

    if (url.pathname.includes('/token')) {
      return fetch(new Request(AUTH_URL + url.pathname + url.search, request), {
        headers: filterHeaders(request, 'auth.docker.io'),
      });
    }

    if (upstream === DOCKER_HUB) {
      const m = url.pathname.match(/^\/v2\/([^/]+)\/(manifests|blobs|tags)\/(.+)$/);
      if (m && m[1] !== 'library') {
        url.pathname = `/v2/library/${m[1]}/${m[2]}/${m[3]}`;
      }
    }

    const upResp = await fetch(new Request(url, {
      method: request.method,
      headers: filterHeaders(request, upstream),
      body: request.body,
      redirect: 'manual',
    }));

    const respHeaders = new Headers(upResp.headers);
    const wwwAuth = respHeaders.get('Www-Authenticate');
    if (wwwAuth) {
      respHeaders.set('Www-Authenticate', wwwAuth.replaceAll(AUTH_URL, workersUrl));
    }

    const location = respHeaders.get('Location');
    if (location && upResp.status >= 300 && upResp.status < 400) {
      const cdnResp = await fetch(location, { method: 'GET', redirect: 'follow' });
      const cdnHeaders = new Headers(cdnResp.headers);
      cdnHeaders.set('Access-Control-Allow-Origin', '*');
      cdnHeaders.set('Access-Control-Expose-Headers', '*');
      cdnHeaders.delete('Content-Security-Policy');
      if (url.pathname.includes('/blobs/')) {
        cdnHeaders.set('Cache-Control', 'public, max-age=86400, immutable');
      }
      return new Response(cdnResp.body, { status: cdnResp.status, headers: cdnHeaders });
    }

    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Expose-Headers', '*');
    respHeaders.delete('Content-Security-Policy');
    if (url.pathname.includes('/manifests/') && upResp.status === 200) {
      respHeaders.set('Cache-Control', 'public, max-age=3600');
    }
    return new Response(upResp.body, { status: upResp.status, headers: respHeaders });
  }
};

function filterHeaders(request, host) {
  const h = new Headers();
  h.set('Host', host);
  for (const key of ['User-Agent', 'Accept', 'Accept-Language', 'Accept-Encoding',
                      'Authorization', 'X-Amz-Content-Sha256']) {
    const val = request.headers.get(key);
    if (val) h.set(key, val);
  }
  return h;
}

function fmtNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

const GITHUB_SVG = `<svg viewBox="0 0 16 16" fill="currentColor" width="15" height="15"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

function searchPage(q, data, workersUrl, page = 1) {
  const results = data ? data.results || [] : [];
  const total = data ? data.num_results || 0 : 0;
  const numPages = data ? data.num_pages || 1 : 1;
  const escQ = q.replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const hasResults = results.length > 0;
  const isHome = !q;

  const resultCards = results.map(r => {
    const [owner, repo] = r.name.includes('/') ? r.name.split('/') : ['library', r.name];
    const hubLink = `https://hub.docker.com/${owner === 'library' ? '_' : 'r/' + owner}/${repo}`;
    const pullCmd = owner === 'library' ? `docker pull ${repo}` : `docker pull ${r.name}`;
    const officialBadge = r.is_official ? `<span class="badge">Official</span>` : '';
    const desc = (r.description || '<em style="opacity:.5">No description</em>').replace(/</g, '&lt;');
    return `<div class="card">
      <div class="card-header">
        <div class="card-title">
          <a href="${hubLink}" target="_blank" rel="noopener">${r.name}</a>${officialBadge}
        </div>
        <div class="card-stats">
          <span title="Stars">⭐ ${fmtNum(r.star_count)}</span>
          <span title="Pulls">⬇ ${fmtNum(r.pull_count)}</span>
        </div>
      </div>
      <p class="card-desc">${desc}</p>
      <div class="card-cmd"><code>${pullCmd}</code></div>
    </div>`;
  }).join('');

  const prevPage = page > 1
    ? `<a class="page-btn" href="/search?q=${encodeURIComponent(q)}&page=${page - 1}">← Prev</a>` : '';
  const nextPage = page < numPages
    ? `<a class="page-btn" href="/search?q=${encodeURIComponent(q)}&page=${page + 1}">Next →</a>` : '';
  const pager = hasResults
    ? `<div class="pager">${prevPage}<span class="page-info">Page ${page.toLocaleString()} of ${numPages.toLocaleString()}</span>${nextPage}</div>` : '';

  const tagline = isHome ? `<p class="tagline">Fast, anonymous Docker image proxy for China 🇨🇳</p>` : '';
  const summary = hasResults
    ? `<p class="summary"><strong>${total.toLocaleString()}</strong> results for "<strong>${escQ}</strong>"</p>` : '';
  const emptyMsg = q && !hasResults
    ? `<div class="empty">No results found for "<strong>${escQ}</strong>"</div>` : '';
  const hints = isHome
    ? `<div class="hint">Try: <a href="/search?q=nginx">nginx</a> · <a href="/search?q=redis">redis</a> · <a href="/search?q=postgres">postgres</a> · <a href="/search?q=python">python</a></div>` : '';

  const heroClass = isHome ? 'hero hero-home' : 'hero hero-results';

  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${q ? escQ + ' — Docker Hub Mirror' : 'Docker Hub Mirror'}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%}
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#c9d1d9;display:flex;flex-direction:column;min-height:100vh}

/* ── Top-right nav ── */
.topnav{position:absolute;top:0;right:0;padding:14px 20px;z-index:10}
.topnav a{color:rgba(255,255,255,.65);text-decoration:none;font-size:.82em;display:inline-flex;align-items:center;gap:5px;transition:color .15s}
.topnav a:hover{color:#fff}

/* ── Hero ── */
.hero{width:100%;position:relative;background:linear-gradient(160deg,#0f2460 0%,#1a3a8f 60%,#0e6cc4 100%);display:flex;align-items:center;justify-content:center;padding:20px}
.hero-home{min-height:100vh}
.hero-results{padding-top:36px;padding-bottom:36px}
.hero-inner{width:100%;max-width:640px;text-align:center}
.logo{font-size:2.2em;font-weight:700;color:#fff;margin-bottom:8px;letter-spacing:-.5px}
.logo span{opacity:.85}
.tagline{color:#93c5fd;font-size:.95em;margin-bottom:28px}

/* ── Search ── */
.search-wrap{width:100%;max-width:560px;margin:0 auto}
.search-form{display:flex;height:52px;border-radius:12px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.5);background:#fff}
.search-form input{flex:1;padding:0 20px;border:none;outline:none;font-size:16px;color:#111;background:transparent}
.search-form button{width:64px;background:#2563eb;border:none;cursor:pointer;color:#fff;font-size:22px;transition:background .15s;flex-shrink:0}
.search-form button:hover{background:#1d4ed8}

/* ── Hints ── */
.hint{margin-top:18px;font-size:.85em;color:#93c5fd}
.hint a{color:#bfdbfe;text-decoration:none;margin:0 3px}
.hint a:hover{text-decoration:underline}

/* ── Main ── */
.main{flex:1;max-width:860px;width:100%;margin:0 auto;padding:24px 16px 48px}
.summary{color:#8b949e;font-size:.88em;margin-bottom:16px}
.summary strong{color:#c9d1d9}

/* ── Cards ── */
.card{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:16px 18px;margin-bottom:10px;transition:border-color .15s,transform .1s}
.card:hover{border-color:#388bfd;transform:translateY(-1px)}
.card-header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px}
.card-title{font-size:1em;font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.card-title a{color:#58a6ff;text-decoration:none}
.card-title a:hover{text-decoration:underline}
.badge{font-size:.7em;padding:2px 8px;border-radius:20px;background:#0d419d33;color:#58a6ff;border:1px solid #1f6feb55;font-weight:500;white-space:nowrap}
.card-stats{display:flex;gap:10px;color:#484f58;font-size:.82em;white-space:nowrap;padding-top:2px}
.card-desc{color:#8b949e;font-size:.875em;line-height:1.55;margin-bottom:10px}
.card-cmd{background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:8px 12px}
.card-cmd code{font-size:.82em;color:#7ee787;font-family:'Fira Code',ui-monospace,monospace}

/* ── Pagination ── */
.pager{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:28px}
.page-btn{background:#161b22;border:1px solid #388bfd;color:#58a6ff;padding:8px 20px;border-radius:8px;text-decoration:none;font-size:.88em;transition:background .15s}
.page-btn:hover{background:#1f2937}
.page-info{color:#484f58;font-size:.85em}

/* ── Empty ── */
.empty{text-align:center;padding:64px 20px;color:#484f58;font-size:.95em}
.empty strong{color:#8b949e}

/* ── Footer ── */
.footer{background:#010409;border-top:1px solid #21262d;padding:18px 16px;text-align:center}
.footer a{color:#484f58;text-decoration:none;font-size:.82em;display:inline-flex;align-items:center;gap:6px;transition:color .15s}
.footer a:hover{color:#8b949e}
</style>
</head>
<body>

<div class="${heroClass}">
  <!-- Top-right GitHub link -->
  <nav class="topnav">
    <a href="${GITHUB_REPO}" target="_blank" rel="noopener">${GITHUB_SVG} GitHub</a>
  </nav>
  <div class="hero-inner">
    <div class="logo">🐳 <span>Docker Hub Mirror</span></div>
    ${tagline}
    <div class="search-wrap">
      <form class="search-form" action="/search" method="get">
        <input name="q" value="${escQ}" placeholder="Search images: nginx, redis, postgres..." autocomplete="off" autofocus>
        <button type="submit">→</button>
      </form>
    </div>
    ${hints}
  </div>
</div>

<div class="main">
  ${summary}
  ${emptyMsg}
  ${resultCards}
  ${pager}
</div>

<footer class="footer">
  <a href="${GITHUB_REPO}" target="_blank" rel="noopener">
    ${GITHUB_SVG}&nbsp;Deploy your own → zqs1qiwan/dockerhub-cf-workers
  </a>
</footer>

</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

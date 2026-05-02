# dockerhub-cf-workers

A Cloudflare Workers script that proxies Docker Hub — includes a search UI, image pull proxy, and support for multiple registries.

## Features

- 🔍 **Search UI** — browse Docker Hub images directly in the browser (uses `index.docker.io/v1/search`, no rate limit)
- 🐳 **Pull proxy** — `docker pull` works seamlessly through the Worker
- 🌐 **Multi-registry** — supports Docker Hub, ghcr.io, gcr.io, quay.io, registry.k8s.io, and more via subdomain routing
- ⚡ **No credentials required** — fully anonymous, no config needed
- 🚀 **GFW-friendly** — no redirects to hub.docker.com

## Deploy in 3 steps

### Prerequisites

- A [Cloudflare](https://cloudflare.com) account (free tier works)
- [Node.js](https://nodejs.org) + [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

```bash
npm install -g wrangler
wrangler login
```

### 1. Clone

```bash
git clone https://github.com/zqs1qiwan/dockerhub-cf-workers.git
cd dockerhub-cf-workers
```

### 2. Deploy

```bash
wrangler deploy
```

That's it. Wrangler will output a `*.workers.dev` URL.

### 3. (Optional) Custom domain

In the Cloudflare dashboard, go to **Workers & Pages → your worker → Settings → Domains & Routes**, add a custom domain or route.

Or via CLI:

```bash
wrangler deploy --route "yourdomain.com/*"
```

## Usage

### Docker pull

Configure Docker daemon to use your Worker URL as a registry mirror:

```json
// /etc/docker/daemon.json
{
  "registry-mirrors": ["https://your-worker.workers.dev"]
}
```

Then restart Docker and pull as normal:

```bash
docker pull nginx
docker pull redis:alpine
```

### Multi-registry routing (subdomain)

| Subdomain prefix | Proxied registry |
|---|---|
| `your-worker.workers.dev` | Docker Hub |
| `ghcr.your-worker.workers.dev` | ghcr.io |
| `gcr.your-worker.workers.dev` | gcr.io |
| `k8s.your-worker.workers.dev` | registry.k8s.io |
| `quay.your-worker.workers.dev` | quay.io |
| `nvcr.your-worker.workers.dev` | nvcr.io |

Or use the `?ns=` query parameter:

```bash
docker pull your-worker.workers.dev/myimage?ns=ghcr.io
```

### Search

Open your Worker URL in a browser to search Docker Hub images without a VPN.

## How it works

- Browser requests (`User-Agent: Mozilla`) → renders search UI
- `docker pull` / CLI requests → proxies to the upstream registry API
- Auth tokens are transparently forwarded
- Blob redirects are followed server-side (no client redirect to CDN)
- `index.docker.io/v1/search` is used for search (no IP rate limit vs hub.docker.com API)

## License

MIT

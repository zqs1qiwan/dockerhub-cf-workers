# 🐳 dockerhub-cf-workers

[English](#english) | **中文**

Cloudflare Workers 驱动的 Docker Hub 镜像代理，支持镜像搜索、拉取代理、多仓库路由。

## 核心特性

- 🔍 **搜索无限速** — 直接在浏览器搜索 Docker Hub 镜像，使用 Docker Registry v1 API，无速率限制
- 📡 **全程流式传输** — blob 下载全程在 Worker 内流式转发，客户端只与你的 Worker 通信，无需直连任何 CDN，大镜像拉取稳定不中断
- 🌐 **多仓库支持** — 一个 Worker 同时代理 Docker Hub、ghcr.io、gcr.io、registry.k8s.io、quay.io 等
- ⚡ **零依赖部署** — 无需 KV、R2 或任何额外配置，免费套餐即可使用

## 部署方法

### 方法一：Dashboard 粘贴代码（最简单）

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create**
2. 选择 **Create Worker**，点击 **Deploy**
3. 部署后点击 **Edit Code**，把 [`worker.js`](./worker.js) 的全部内容粘贴进去，**Save and deploy**
4. （可选）在 Worker 设置里绑定自定义域名

### 方法二：Wrangler CLI

```bash
git clone https://github.com/zqs1qiwan/dockerhub-cf-workers.git
cd dockerhub-cf-workers
npx wrangler deploy
```

### 方法三：Fork + CF Git 集成自动部署

1. Fork 本仓库
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Import a repository**
3. 连接 GitHub，选择你 fork 的仓库，branch: `main`，entry point: `worker.js`
4. 之后每次 push 自动部署

## 使用方式

### 配置 Docker daemon 镜像加速

```json
// /etc/docker/daemon.json
{
  "registry-mirrors": ["https://your-worker.your-domain.com"]
}
```

重启 Docker 后正常使用：

```bash
docker pull nginx
docker pull redis:alpine
```

### 多仓库路由

通过子域名前缀路由到不同仓库：

| 访问地址 | 代理目标 |
|---|---|
| `your-worker.com` | Docker Hub |
| `ghcr.your-worker.com` | ghcr.io |
| `gcr.your-worker.com` | gcr.io |
| `k8s.your-worker.com` | registry.k8s.io |
| `quay.your-worker.com` | quay.io |
| `nvcr.your-worker.com` | nvcr.io |

也可以用 `?ns=` 参数指定：

```bash
docker pull your-worker.com/myimage?ns=ghcr.io
```

### 搜索界面

浏览器打开 Worker 地址即可搜索 Docker Hub 镜像。

---

<a name="english"></a>

## English

A Docker Hub mirror proxy built on Cloudflare Workers.

**Key features:**
- 🔍 **Unlimited search** — uses Docker Registry v1 API, no rate limiting
- 📡 **Full streaming** — blobs are streamed through the Worker, no client-side CDN redirects, stable for large images
- 🌐 **Multi-registry** — Docker Hub, ghcr.io, gcr.io, registry.k8s.io, quay.io via subdomain routing
- ⚡ **Zero-config deploy** — no KV, R2, or secrets required, works on free plan

**Quickest deploy (Dashboard):**
1. Cloudflare Dashboard → Workers & Pages → Create Worker → Deploy
2. Edit Code → paste [`worker.js`](./worker.js) contents → Save and deploy

**CLI deploy:**
```bash
git clone https://github.com/zqs1qiwan/dockerhub-cf-workers.git
cd dockerhub-cf-workers
npx wrangler deploy
```

## License

MIT

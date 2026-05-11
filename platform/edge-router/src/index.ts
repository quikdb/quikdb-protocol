/**
 * QuikDB Edge Router — Cloudflare Worker
 *
 * Routes all *.quikdb.net traffic to the correct community node container.
 * Handles deployment status pages (sleeping, waking, building, failed).
 */

interface Env {
  ROUTING_API_URL: string;
  ENVIRONMENT: string;
  CACHE_TTL_SECONDS: string;
}

interface RoutingBackend {
  url: string;
  port: number;
  deviceId: string;
  replicaIndex: number;
  health: string;
}

interface RoutingResponse {
  backends: RoutingBackend[];
  deploymentId: string;
  tier: string;
  status: string;
}

const INFRA_SUBDOMAINS = new Set([
  'device', 'admin', 'nodes', 'compute', 'docs',
  'leaderboard', 'api', 'www', 'proxy',
]);

// Round-robin counters (in-memory, resets on cold start)
const rrCounters = new Map<string, number>();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Extract subdomain from *.quikdb.net
    const subdomain = hostname.split('.')[0];

    // Infrastructure subdomains pass through to origin
    if (INFRA_SUBDOMAINS.has(subdomain)) {
      return fetch(request);
    }

    // Health check
    if (url.pathname === '/__edge/health') {
      return new Response('ok', { status: 200 });
    }

    // Look up deployment routing from orchestrator
    const routingUrl = `${env.ROUTING_API_URL}/api/v1/routing/lookup?hostname=${hostname}`;
    const cacheTtl = parseInt(env.CACHE_TTL_SECONDS || '10');

    const routingRes = await fetch(routingUrl, {
      cf: { cacheTtl, cacheEverything: true },
    });

    if (routingRes.status === 404) {
      return deploymentNotFound(subdomain);
    }

    if (routingRes.status === 503) {
      const data = await routingRes.json() as { status: string; deploymentId?: string };
      return handleUnavailable(data, env, ctx);
    }

    if (!routingRes.ok) {
      return new Response('Routing error', { status: 502 });
    }

    const routing = await routingRes.json() as RoutingResponse;

    if (!routing.backends || routing.backends.length === 0) {
      return new Response('No healthy backends', { status: 503 });
    }

    // Round-robin backend selection
    const backend = selectBackend(routing);

    // Proxy request through community node's Cloudflare tunnel
    const proxyUrl = new URL(request.url);
    proxyUrl.hostname = new URL(backend.url).hostname;
    proxyUrl.port = '';

    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.set('X-Quikdb-Port', backend.port.toString());
    proxyHeaders.set('X-Quikdb-Deployment', routing.deploymentId);
    proxyHeaders.set('X-Quikdb-Tier', routing.tier);
    proxyHeaders.set('X-Quikdb-Replica', backend.replicaIndex.toString());
    proxyHeaders.set('X-Quikdb-Device', backend.deviceId);
    proxyHeaders.set('X-Forwarded-Host', hostname);

    return fetch(proxyUrl.toString(), {
      method: request.method,
      headers: proxyHeaders,
      body: request.body,
    });
  },
};

function selectBackend(routing: RoutingResponse): RoutingBackend {
  const key = routing.deploymentId;
  const current = rrCounters.get(key) || 0;
  const index = current % routing.backends.length;
  rrCounters.set(key, current + 1);
  return routing.backends[index];
}

function handleUnavailable(
  data: { status: string; deploymentId?: string },
  env: Env,
  ctx: ExecutionContext
): Response {
  const { status } = data;

  if (status === 'sleeping' || status === 'waking') {
    if (status === 'sleeping' && data.deploymentId) {
      ctx.waitUntil(
        fetch(`${env.ROUTING_API_URL}/api/v1/deployment/${data.deploymentId}/wake`, {
          method: 'POST',
        })
      );
    }
    return new Response(loadingPage('Your app is waking up...'), {
      status: 503,
      headers: { 'Content-Type': 'text/html', 'Retry-After': '5' },
    });
  }

  if (['pending', 'building', 'deploying'].includes(status)) {
    return new Response(loadingPage('Deployment in progress...'), {
      status: 503,
      headers: { 'Content-Type': 'text/html', 'Retry-After': '10' },
    });
  }

  return new Response(errorPage(status), {
    status: 503,
    headers: { 'Content-Type': 'text/html' },
  });
}

function deploymentNotFound(subdomain: string): Response {
  return new Response(
    `<html><body><h1>Not Found</h1><p>No deployment found for ${subdomain}.quikdb.net</p></body></html>`,
    { status: 404, headers: { 'Content-Type': 'text/html' } }
  );
}

function loadingPage(message: string): string {
  return `<!DOCTYPE html>
<html><head><title>QuikDB</title>
<meta http-equiv="refresh" content="5">
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#fff}
.loader{text-align:center}.spinner{width:40px;height:40px;border:3px solid #333;border-top:3px solid #fff;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px}
@keyframes spin{to{transform:rotate(360deg)}}</style></head>
<body><div class="loader"><div class="spinner"></div><p>${message}</p><p style="color:#666;font-size:14px">Powered by community nodes</p></div></body></html>`;
}

function errorPage(status: string): string {
  return `<!DOCTYPE html>
<html><head><title>QuikDB</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#fff}
.error{text-align:center}h1{color:#ef4444}</style></head>
<body><div class="error"><h1>Deployment ${status}</h1><p>This deployment is not currently running.</p></div></body></html>`;
}

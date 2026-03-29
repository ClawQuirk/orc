import type { IncomingMessage, ServerResponse } from 'node:http';

export type RouteParams = Record<string, string>;
export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: RouteParams
) => void | Promise<void>;

interface Route {
  method: string;
  segments: string[];
  paramNames: string[];
  handler: RouteHandler;
}

// Allowed origins for CORS and Origin validation
const FRONTEND_PORT = process.env.PORT || '5173';
const ALLOWED_ORIGINS = new Set([
  `http://localhost:${FRONTEND_PORT}`,
  `http://127.0.0.1:${FRONTEND_PORT}`,
]);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Same-origin requests (no Origin header)
  return ALLOWED_ORIGINS.has(origin);
}

function setCorsHeaders(res: ServerResponse, origin?: string): void {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : '';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

export class Router {
  private routes: Route[] = [];

  get(path: string, handler: RouteHandler): void {
    this.addRoute('GET', path, handler);
  }

  post(path: string, handler: RouteHandler): void {
    this.addRoute('POST', path, handler);
  }

  put(path: string, handler: RouteHandler): void {
    this.addRoute('PUT', path, handler);
  }

  delete(path: string, handler: RouteHandler): void {
    this.addRoute('DELETE', path, handler);
  }

  private addRoute(method: string, path: string, handler: RouteHandler): void {
    const segments = path.split('/').filter(Boolean);
    const paramNames: string[] = [];
    for (const seg of segments) {
      if (seg.startsWith(':')) {
        paramNames.push(seg.slice(1));
      }
    }
    this.routes.push({ method, segments, paramNames, handler });
  }

  handle(req: IncomingMessage, res: ServerResponse): boolean {
    const method = req.method ?? 'GET';
    const origin = req.headers.origin;

    // CORS headers on every response
    setCorsHeaders(res, origin);

    // Handle preflight
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }

    // Origin validation on state-changing requests
    if (['POST', 'PUT', 'DELETE'].includes(method) && !isAllowedOrigin(origin)) {
      sendJson(res, 403, { error: 'Forbidden: invalid origin' });
      return true;
    }

    const urlPath = (req.url ?? '/').split('?')[0];
    const reqSegments = urlPath.split('/').filter(Boolean);

    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== reqSegments.length) continue;

      const params: RouteParams = {};
      let matched = true;

      for (let i = 0; i < route.segments.length; i++) {
        const routeSeg = route.segments[i];
        const reqSeg = reqSegments[i];
        if (routeSeg.startsWith(':')) {
          params[routeSeg.slice(1)] = decodeURIComponent(reqSeg);
        } else if (routeSeg !== reqSeg) {
          matched = false;
          break;
        }
      }

      if (matched) {
        try {
          const result = route.handler(req, res, params);
          if (result instanceof Promise) {
            result.catch((err) => {
              console.error(`[router] Error in ${method} ${urlPath}:`, err);
              if (!res.headersSent) {
                sendJson(res, 500, { error: 'Internal server error' });
              }
            });
          }
        } catch (err) {
          console.error(`[router] Error in ${method} ${urlPath}:`, err);
          if (!res.headersSent) {
            sendJson(res, 500, { error: 'Internal server error' });
          }
        }
        return true;
      }
    }

    return false;
  }
}

// --- Helpers ---

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

export async function readJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
  const body = await readBody(req);
  return JSON.parse(body) as T;
}

export function getQueryParams(req: IncomingMessage): URLSearchParams {
  const url = req.url ?? '/';
  const qIndex = url.indexOf('?');
  return new URLSearchParams(qIndex >= 0 ? url.slice(qIndex + 1) : '');
}

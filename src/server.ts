import http from "node:http";
import { URL } from "node:url";

import { getManifest } from "./addon/manifest.ts";
import { handleMeta } from "./addon/metaHandler.ts";
import { handleStream } from "./addon/streamHandler.ts";
import { ensureCacheDirs, loadGuide } from "./core/cache.ts";
import { config, resolveBaseUrl } from "./core/config.ts";
import { fetchText } from "./core/http.ts";
import { logger } from "./core/logger.ts";
import { getOrCreateGuide } from "./core/guideBuilder.ts";
import { bestBluraysAdapter } from "./sources/bestBlurays.ts";
import { arrowFilmsAdapter } from "./sources/arrowFilms.ts";
import { secondSightFilmsAdapter } from "./sources/secondSightFilms.ts";
import { bluRayComAdapter } from "./sources/blurayCom.ts";
import { dvdCompareAdapter } from "./sources/dvdCompare.ts";
import { renderGuidePage, renderHomePage } from "./web/guidePage.ts";
import { stylesCss } from "./web/styles.ts";
import type { SourceAdapter, SourceRuntime } from "./types/sources.ts";

const adapters: SourceAdapter[] = [
  bestBluraysAdapter,
  arrowFilmsAdapter,
  secondSightFilmsAdapter,
  bluRayComAdapter,
  dvdCompareAdapter
];

const runtime: SourceRuntime = {
  fetchText
};

function json(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-admin-token"
  });
  response.end(JSON.stringify(body, null, 2));
}

function html(response: http.ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "access-control-allow-origin": "*"
  });
  response.end(body);
}

function css(response: http.ServerResponse, body: string): void {
  response.writeHead(200, {
    "content-type": "text/css; charset=utf-8",
    "cache-control": "public, max-age=86400"
  });
  response.end(body);
}

function notFound(response: http.ServerResponse): void {
  json(response, 404, { error: "Not found" });
}

function requestProto(request: http.IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-proto"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return "http";
}

function requestBaseUrl(request: http.IncomingMessage): string {
  return resolveBaseUrl(request.headers.host, requestProto(request));
}

function decodePathId(rawId: string): string {
  try {
    return decodeURIComponent(rawId);
  } catch {
    return rawId;
  }
}

async function route(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const method = request.method || "GET";
  if (!request.url) return notFound(response);

  if (method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,x-admin-token"
    });
    response.end();
    return;
  }

  const url = new URL(request.url, requestBaseUrl(request));
  const pathname = url.pathname;

  if (pathname === "/") {
    html(response, 200, renderHomePage(requestBaseUrl(request)));
    return;
  }

  if (pathname === "/styles.css") {
    css(response, stylesCss);
    return;
  }

  if (pathname === "/manifest.json") {
    json(response, 200, getManifest());
    return;
  }

  if (pathname === "/health") {
    json(response, 200, {
      status: "ok",
      version: config.version,
      time: new Date().toISOString()
    });
    return;
  }

  const metaMatch = pathname.match(/^\/meta\/([^/]+)\/([^/]+)\.json$/);
  if (metaMatch) {
    const [, type, id] = metaMatch;
    const payload = await handleMeta(type, id, adapters, runtime, request.headers.host, requestProto(request));
    json(response, 200, payload);
    return;
  }

  const streamMatch = pathname.match(/^\/stream\/([^/]+)\/([^/]+)\.json$/);
  if (streamMatch) {
    const [, type, id] = streamMatch;
    const payload = await handleStream(type, id, adapters, runtime, request.headers.host, requestProto(request));
    json(response, 200, payload);
    return;
  }

  const guideJsonMatch = pathname.match(/^\/guide\/([^/]+)\.json$/);
  if (guideJsonMatch) {
    const guideId = decodePathId(guideJsonMatch[1]);
    const guide = await getOrCreateGuide(guideId, adapters, runtime);
    json(response, 200, guide);
    return;
  }

  const guideHtmlMatch = pathname.match(/^\/guide\/([^/]+)$/);
  if (guideHtmlMatch) {
    const guideId = decodePathId(guideHtmlMatch[1]);
    const guide = await getOrCreateGuide(guideId, adapters, runtime);
    html(response, 200, renderGuidePage(guide, requestBaseUrl(request)));
    return;
  }

  const debugMatch = pathname.match(/^\/debug\/([^/]+)$/);
  if (debugMatch) {
    const guide = await loadGuide(decodePathId(debugMatch[1]));
    json(response, 200, guide || { error: "No cached guide found." });
    return;
  }

  const refreshMatch = pathname.match(/^\/admin\/refresh\/([^/]+)$/);
  if (refreshMatch) {
    if (method !== "POST") {
      json(response, 405, { error: "Use POST for refresh." });
      return;
    }

    if (config.adminToken && request.headers["x-admin-token"] !== config.adminToken) {
      json(response, 403, { error: "Invalid admin token." });
      return;
    }

    const guide = await getOrCreateGuide(decodePathId(refreshMatch[1]), adapters, runtime, { forceRefresh: true });
    json(response, 200, guide);
    return;
  }

  notFound(response);
}

async function main(): Promise<void> {
  await ensureCacheDirs();

  const server = http.createServer((request, response) => {
    route(request, response).catch((error) => {
      logger.error("Unhandled request error", {
        url: request.url,
        error: error instanceof Error ? error.message : String(error)
      });
      json(response, 500, {
        error: "Internal server error"
      });
    });
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info("Shutting down DiscGrade", { signal });
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  process.once("SIGTERM", () => {
    shutdown("SIGTERM").catch((error) => {
      logger.error("Graceful shutdown failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      process.exitCode = 1;
    });
  });

  process.once("SIGINT", () => {
    shutdown("SIGINT").catch((error) => {
      logger.error("Graceful shutdown failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      process.exitCode = 1;
    });
  });

  server.listen(config.port, () => {
    logger.info(`DiscGrade listening`, {
      port: config.port,
      baseUrl: resolveBaseUrl(`localhost:${config.port}`, "http")
    });
  });
}

main().catch((error) => {
  logger.error("Startup failed", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
});

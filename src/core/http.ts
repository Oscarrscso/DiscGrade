import { config } from "./config.ts";
import { RequestScheduler } from "./rateLimiter.ts";
import type { SourceRequestInit } from "../types/sources.ts";

const scheduler = new RequestScheduler(
  config.minSourceIntervalMs,
  config.sourceHostConcurrency,
  config.sourceGlobalConcurrency
);

function detectCharset(headers: Headers, buffer: Uint8Array): string {
  const header = headers.get("content-type") || "";
  const charsetMatch = header.match(/charset=([^;]+)/i);
  if (charsetMatch) return charsetMatch[1].trim().toLowerCase();

  const head = Buffer.from(buffer.slice(0, 1024)).toString("latin1");
  const metaMatch = head.match(/charset=([a-zA-Z0-9_-]+)/i);
  if (metaMatch) return metaMatch[1].trim().toLowerCase();

  return "utf-8";
}

function normalizeCharset(charset: string): string {
  if (charset === "iso-8859-1" || charset === "latin1") return "iso-8859-1";
  return "utf-8";
}

export async function fetchText(
  url: string,
  init: SourceRequestInit = {}
): Promise<string> {
  const { value, timing } = await scheduler.schedule(url, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        method: init.method || "GET",
        headers: {
          "user-agent": config.userAgent,
          "accept-language": "en-IE,en-GB;q=0.9,en;q=0.8",
          ...init.headers
        },
        body: init.body,
        signal: controller.signal,
        redirect: "follow"
      });

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status} for ${url}`);
      }

      const buffer = new Uint8Array(await response.arrayBuffer());
      const charset = normalizeCharset(detectCharset(response.headers, buffer));
      return new TextDecoder(charset).decode(buffer);
    } finally {
      clearTimeout(timeout);
    }
  });

  init.onTiming?.(timing);
  return value;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const text = await fetchText(url, {
    headers: {
      accept: "application/json"
    }
  });
  return JSON.parse(text) as T;
}

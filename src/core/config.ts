import path from "node:path";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function envString(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

const rootDir = process.cwd();
const dataDir = process.env.DATA_DIR?.trim() || path.join(rootDir, ".data");

export const config = {
  rootDir,
  port: envNumber("PORT", 7000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL?.trim() || "",
  adminToken: process.env.ADMIN_TOKEN?.trim() || "",
  userAgent: envString("USER_AGENT", "DiscGradeBot/0.1 (contact: you@example.com)"),
  requestTimeoutMs: envNumber("REQUEST_TIMEOUT_MS", 20_000),
  minSourceIntervalMs: envNumber("MIN_SOURCE_INTERVAL_MS", 50),
  sourceHostConcurrency: envNumber("SOURCE_HOST_CONCURRENCY", 2),
  sourceGlobalConcurrency: envNumber("SOURCE_GLOBAL_CONCURRENCY", 6),
  maxFastSourceAdapters: envNumber("MAX_FAST_SOURCE_ADAPTERS", 3),
  commentaryFallbackBudgetMs: envNumber("COMMENTARY_FALLBACK_BUDGET_MS", 4_000),
  streamingRegion: envString("STREAMING_REGION", "US").toUpperCase(),
  cacheTtlDays: envNumber("CACHE_TTL_DAYS", 30),
  manifestId: "com.discgrade.addon",
  version: "0.1.4",
  dataDir,
  guideCacheDir: path.join(dataDir, "guides"),
  preferredRegionCountries: ["Ireland", "United Kingdom", "UK", "France", "Germany", "Europe"],
  preferredRegionCodes: ["B", "Region B", "Region Free", "ABC"],
  cinemetaBases: ["https://v3-cinemeta.strem.io", "https://cinemeta-live.strem.io"]
} as const;

export function resolveBaseUrl(requestHost?: string, forwardedProto?: string): string {
  if (config.publicBaseUrl) return config.publicBaseUrl.replace(/\/$/, "");
  const host = requestHost || `localhost:${config.port}`;
  const proto = forwardedProto || "http";
  return `${proto}://${host}`;
}

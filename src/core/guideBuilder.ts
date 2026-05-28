import { loadFreshGuide, saveGuide } from "./cache.ts";
import { config } from "./config.ts";
import { resolveIdentity } from "./identityResolver.ts";
import { normalizeEditions } from "./editionNormalizer.ts";
import { scoreEditions, rankEditions, summarizeConflictNotes } from "./scoreEngine.ts";
import { scoreConfidence } from "./confidenceEngine.ts";
import { extractWarnings } from "./textSignals.ts";
import type { DiscGuide, GuideDebugEvent, SourceEvidence } from "../types/discGuide.ts";
import type { SourceAdapter, SourceRuntime } from "../types/sources.ts";
import { collectEvidence } from "./sourceRouter.ts";
import { fetchTmdbWatchFallbackEvidence } from "../sources/tmdbWatch.ts";

const inFlightGuides = new Map<string, Promise<DiscGuide>>();
type StreamingFallbackFetcher = typeof fetchTmdbWatchFallbackEvidence;

export function statusFromPhysicalSourceCount(physicalSourceCount: number): DiscGuide["status"] {
  return physicalSourceCount > 0 ? "ok" : "partial";
}

export async function collectSourcesWithStreamingFallback(
  identity: NonNullable<Awaited<ReturnType<typeof resolveIdentity>>>,
  adapters: SourceAdapter[],
  runtime: SourceRuntime,
  options: {
    streamingRegion?: string;
    streamingFallbackFetcher?: StreamingFallbackFetcher;
    debugEvents?: GuideDebugEvent[];
  } = {}
): Promise<{ physicalSources: SourceEvidence[]; sources: SourceEvidence[] }> {
  const physicalSources = await collectEvidence(identity, adapters, runtime, {
    debugEvents: options.debugEvents
  });
  const sources = [...physicalSources];

  if (physicalSources.length === 0) {
    const streamingFallbackFetcher = options.streamingFallbackFetcher || fetchTmdbWatchFallbackEvidence;
    const streamingRegion = options.streamingRegion || config.streamingRegion;
    const started = Date.now();
    try {
      const streamingFallback = await streamingFallbackFetcher(identity, runtime, streamingRegion);
      if (streamingFallback) {
        sources.push(streamingFallback);
        options.debugEvents?.push({
          name: "source:TMDB Watch:streaming availability",
          durationMs: Date.now() - started,
          status: "ok",
          detail: `Region ${streamingRegion}`
        });
      } else {
        options.debugEvents?.push({
          name: "source:TMDB Watch:streaming availability",
          durationMs: Date.now() - started,
          status: "skipped",
          detail: `No providers parsed for ${streamingRegion}`
        });
      }
    } catch (error) {
      options.debugEvents?.push({
        name: "source:TMDB Watch:streaming availability",
        durationMs: Date.now() - started,
        status: "error",
        detail: error instanceof Error ? error.message : String(error)
      });
      // Streaming fallback is best-effort; failures should not block guide generation.
    }
  }

  return {
    physicalSources,
    sources
  };
}

export async function getOrCreateGuide(
  imdbId: string,
  adapters: SourceAdapter[],
  runtime: SourceRuntime,
  options: { forceRefresh?: boolean; typeHint?: DiscGuide["contentType"] } = {}
): Promise<DiscGuide> {
  if (!options.forceRefresh) {
    const existing = inFlightGuides.get(imdbId);
    if (existing) return existing;
  }

  const buildPromise = buildGuide(imdbId, adapters, runtime, options);
  if (!options.forceRefresh) {
    inFlightGuides.set(imdbId, buildPromise);
  }

  try {
    return await buildPromise;
  } finally {
    if (!options.forceRefresh) {
      inFlightGuides.delete(imdbId);
    }
  }
}

async function buildGuide(
  imdbId: string,
  adapters: SourceAdapter[],
  runtime: SourceRuntime,
  options: { forceRefresh?: boolean; typeHint?: DiscGuide["contentType"] } = {}
): Promise<DiscGuide> {
  const buildStarted = Date.now();
  const debugEvents: GuideDebugEvent[] = [];
  const record = (name: string, started: number, status: GuideDebugEvent["status"], detail?: string): void => {
    debugEvents.push({
      name,
      durationMs: Date.now() - started,
      status,
      detail
    });
  };

  if (!options.forceRefresh) {
    const cacheStarted = Date.now();
    const cached = await loadFreshGuide(imdbId);
    if (cached) {
      const cacheEvent: GuideDebugEvent = {
        name: "cache:loadFreshGuide",
        durationMs: Date.now() - cacheStarted,
        status: "cache_hit",
        detail: `Using cached guide from ${cached.lastUpdated}`
      };
      const cachedDebug = cached.debug;
      return {
        ...cached,
        contentType: cached.contentType || options.typeHint || "movie",
        debug: {
          cache: "hit",
          generatedAt: new Date().toISOString(),
          totalMs: cachedDebug?.totalMs ?? Date.now() - buildStarted,
          events: [cacheEvent, ...(cachedDebug?.events || [])]
        }
      };
    }
    record("cache:loadFreshGuide", cacheStarted, "cache_miss", "No fresh cached guide");
  }

  const identityStarted = Date.now();
  const identity = await resolveIdentity(imdbId, {
    typeHint: options.typeHint || undefined
  });
  record("identity:resolve", identityStarted, identity ? "ok" : "error", identity ? `${identity.title} (${identity.year})` : imdbId);
  if (!identity) {
    const emptyGuide: DiscGuide = {
      imdbId,
      contentType: options.typeHint || "movie",
      title: imdbId,
      year: Number.NaN,
      resolvedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      verdict: {
        shortSummary: "DiscGrade could not resolve this IMDb ID through Cinemeta."
      },
      editions: [],
      warnings: [],
      sources: [],
      confidence: {
        score: 0,
        label: "Low",
        reasons: ["Identity resolution failed."]
      },
      status: "not_found",
      debug: {
        cache: "not_found",
        generatedAt: new Date().toISOString(),
        totalMs: Date.now() - buildStarted,
        events: debugEvents
      }
    };
    const saveStarted = Date.now();
    record("cache:saveGuide", saveStarted, "ok", "Saved not_found guide");
    emptyGuide.debug = {
      cache: "not_found",
      generatedAt: new Date().toISOString(),
      totalMs: Date.now() - buildStarted,
      events: debugEvents
    };
    await saveGuide(emptyGuide);
    return emptyGuide;
  }

  const collectStarted = Date.now();
  const { physicalSources, sources } = await collectSourcesWithStreamingFallback(identity, adapters, runtime, {
    debugEvents
  });
  record(
    "sources:collect",
    collectStarted,
    "ok",
    `${physicalSources.length} physical source(s), ${sources.length} total source(s)`
  );

  const normalizeStarted = Date.now();
  const normalizedEditions = normalizeEditions(identity, sources);
  record("editions:normalize", normalizeStarted, "ok", `${normalizedEditions.length} edition(s)`);

  const scoreStarted = Date.now();
  const editions = scoreEditions(normalizedEditions);
  record("editions:score", scoreStarted, "ok", `${editions.length} edition score(s)`);

  const warningsStarted = Date.now();
  const warnings = buildWarnings(editions, sources);
  record("warnings:extract", warningsStarted, "ok", `${warnings.length} internal warning(s)`);

  const verdictStarted = Date.now();
  const verdict = rankEditions(editions, sources, warnings.length);
  record("verdict:rank", verdictStarted, "ok", verdict.bestOverall?.editionTitle || "No best overall pick");

  const conflictsStarted = Date.now();
  const conflictNotes = summarizeConflictNotes(editions, sources);
  record("conflicts:summarize", conflictsStarted, "ok", `${conflictNotes.length} conflict note(s)`);

  const confidenceStarted = Date.now();
  const confidence = scoreConfidence(sources, editions, conflictNotes);
  record("confidence:score", confidenceStarted, "ok", `${confidence.label} (${confidence.score}/100)`);

  const guide: DiscGuide = {
    imdbId: identity.imdbId,
    contentType: identity.contentType,
    tmdbId: identity.tmdbId,
    title: identity.title,
    year: identity.year,
    poster: identity.poster,
    background: identity.background,
    directors: identity.directors,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict,
    editions,
    warnings,
    sources,
    confidence,
    conflictNotes,
    status: statusFromPhysicalSourceCount(physicalSources.length),
    debug: {
      cache: options.forceRefresh ? "refresh" : "miss",
      generatedAt: new Date().toISOString(),
      totalMs: Date.now() - buildStarted,
      events: debugEvents
    }
  };

  const saveStarted = Date.now();
  record("cache:saveGuide", saveStarted, "ok", `Saved ${guide.imdbId}.json`);
  guide.debug = {
    ...guide.debug,
    totalMs: Date.now() - buildStarted,
    events: debugEvents
  };
  await saveGuide(guide);
  return guide;
}

function buildWarnings(editions: DiscGuide["editions"], sources: SourceEvidence[]): DiscGuide["warnings"] {
  const warnings = [...sources.flatMap((source) => source.parsed?.warnings || [])];

  for (const edition of editions) {
    warnings.push(...extractWarnings([...(edition.notes || []), edition.region || ""], edition.sourceUrls[0] || "", edition.id));
  }

  const unique = new Map<string, DiscGuide["warnings"][number]>();
  for (const warning of warnings) {
    const key = `${warning.type}:${warning.message}:${(warning.affectedEditions || []).join(",")}`;
    if (!unique.has(key)) unique.set(key, warning);
  }

  return [...unique.values()];
}

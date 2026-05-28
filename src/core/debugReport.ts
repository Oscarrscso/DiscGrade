import type { DiscGuide, GuideDebugEvent, SourceEvidence } from "../types/discGuide.ts";

interface SourceDebugSummary {
  name: string;
  purpose: string;
  durationMs: number;
  hasWallClockTiming: boolean;
  queueWaitMs: number;
  networkMs: number;
  parseTimeMs: number;
  searchResults?: number;
  fetches: number;
  parses: number;
  evidenceCount: number;
  editionCount: number;
  commentaryCount: number;
  streamingProviderCount: number;
  added: string[];
  scraped: string[];
  status: "used" | "empty" | "skipped" | "error";
  error?: string;
}

export interface ReadableDebugReport {
  summaryLines: string[];
  sourceLines: string[];
  pipelineLines: string[];
  lines: string[];
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
  return `${ms}ms`;
}

function sourcePurpose(sourceName: string): string {
  const purposes: Record<string, string> = {
    "Best Blurays": "checks curated best-edition recommendations",
    "Blu-ray.com": "checks disc release/spec pages for formats, countries, audio, video, and edition pages",
    "Arrow Films": "checks Arrow publisher pages for extras and commentary tracks",
    "Second Sight Films": "checks Second Sight publisher pages for extras and commentary tracks",
    DVDCompare: "checks comparison pages for DVD/Blu-ray releases, cuts, regions, and commentary notes",
    "TMDB Watch": "checks streaming availability providers"
  };

  return purposes[sourceName] || "checks external release evidence";
}

function parseResultCount(detail?: string): number | undefined {
  const match = detail?.match(/(\d+)\s+result/i);
  return match ? Number(match[1]) : undefined;
}

function sourceEventParts(event: GuideDebugEvent): { sourceName: string; step?: string } | null {
  const match = event.name.match(/^source:([^:]+)(?::(.+))?$/);
  if (!match) return null;
  return {
    sourceName: match[1],
    step: match[2]
  };
}

function evidenceAdditions(sources: SourceEvidence[]): {
  editionCount: number;
  commentaryCount: number;
  streamingProviderCount: number;
  added: string[];
  scraped: string[];
} {
  const editionCount = sources.reduce((total, source) => total + (source.parsed?.editions?.length || 0), 0);
  const commentaryCount = sources.reduce(
    (total, source) =>
      total +
      (source.parsed?.editions || []).reduce(
        (editionTotal, edition) => editionTotal + (edition.commentaryTracks?.length || 0),
        0
      ),
    0
  );
  const streamingProviderCount = sources.reduce((total, source) => {
    const availability = source.parsed?.streamingAvailability;
    if (!availability) return total;
    return total + availability.stream.length + availability.rent.length + availability.buy.length;
  }, 0);
  const bestPickCount = sources.reduce(
    (total, source) =>
      total +
      [
        source.parsed?.bestOverall,
        source.parsed?.bestVideo,
        source.parsed?.bestAudio,
        source.parsed?.bestEnglishFriendly,
        source.parsed?.bestExtras,
        source.parsed?.recommendedCut
      ].filter(Boolean).length,
    0
  );
  const claimCount = sources.reduce((total, source) => total + source.extractedClaims.length, 0);
  const formats = new Set<string>();
  const countries = new Set<string>();
  const claimTypes = new Set<string>();
  let videoSpecCount = 0;
  let audioTrackCount = 0;
  let subtitleLineCount = 0;
  let playbackLineCount = 0;
  let extrasLineCount = 0;
  let cutInfoCount = 0;
  let warningCount = 0;
  let reviewMetricCount = 0;
  let streamProviderCount = 0;
  let rentProviderCount = 0;
  let buyProviderCount = 0;

  for (const source of sources) {
    for (const claim of source.extractedClaims) {
      claimTypes.add(claim.claimType);
    }

    warningCount += source.parsed?.warnings?.length || 0;
    const reviewScores = source.parsed?.reviewScores;
    if (reviewScores) {
      reviewMetricCount += Object.values(reviewScores).filter((value) => typeof value === "number" && value > 0).length;
    }

    const availability = source.parsed?.streamingAvailability;
    if (availability) {
      streamProviderCount += availability.stream.length;
      rentProviderCount += availability.rent.length;
      buyProviderCount += availability.buy.length;
    }

    for (const edition of source.parsed?.editions || []) {
      if (edition.format && edition.format !== "Unknown") formats.add(edition.format);
      if (edition.country) countries.add(edition.country);
      if (edition.video) videoSpecCount += 1;
      audioTrackCount += edition.audio?.length || 0;
      extrasLineCount += edition.extras?.length || 0;
      cutInfoCount += edition.cuts?.length || 0;
      for (const note of edition.notes || []) {
        if (/^subtitles:/i.test(note)) subtitleLineCount += 1;
        if (/^playback:/i.test(note)) playbackLineCount += 1;
      }
    }
  }

  const added = [
    bestPickCount ? `${bestPickCount} best-pick claim(s)` : "",
    editionCount ? `${editionCount} release entr${editionCount === 1 ? "y" : "ies"}` : "",
    commentaryCount ? `${commentaryCount} commentary track note(s)` : "",
    streamingProviderCount ? `${streamingProviderCount} streaming provider(s)` : "",
    claimCount && !bestPickCount ? `${claimCount} extracted claim(s)` : ""
  ].filter(Boolean);
  if (sources.length && added.length === 0) {
    added.push(`${sources.length} matched source page(s)`);
  }

  const scraped = [
    editionCount ? `release rows ${editionCount}` : "",
    formats.size ? `formats ${[...formats].sort((a, b) => a.localeCompare(b)).join(", ")}` : "",
    countries.size ? `countries ${countries.size}` : "",
    videoSpecCount ? `video specs ${videoSpecCount}` : "",
    audioTrackCount ? `audio tracks ${audioTrackCount}` : "",
    subtitleLineCount ? `subtitle lines ${subtitleLineCount}` : "",
    playbackLineCount ? `region/playback lines ${playbackLineCount}` : "",
    extrasLineCount ? `extras lines ${extrasLineCount}` : "",
    commentaryCount ? `commentary tracks ${commentaryCount}` : "",
    cutInfoCount ? `cut/version notes ${cutInfoCount}` : "",
    reviewMetricCount ? `review scores ${reviewMetricCount}` : "",
    streamProviderCount ? `stream providers ${streamProviderCount}` : "",
    rentProviderCount ? `rent providers ${rentProviderCount}` : "",
    buyProviderCount ? `buy providers ${buyProviderCount}` : "",
    warningCount ? `warnings ${warningCount}` : "",
    claimTypes.size ? `claim types ${[...claimTypes].sort((a, b) => a.localeCompare(b)).join(", ")}` : ""
  ].filter(Boolean);

  return {
    editionCount,
    commentaryCount,
    streamingProviderCount,
    added,
    scraped
  };
}

function buildSourceSummaries(guide: DiscGuide): SourceDebugSummary[] {
  const bySource = new Map<string, SourceDebugSummary>();
  const evidenceBySource = new Map<string, SourceEvidence[]>();

  for (const source of guide.sources) {
    const list = evidenceBySource.get(source.sourceName) || [];
    list.push(source);
    evidenceBySource.set(source.sourceName, list);
  }

  for (const event of guide.debug?.events || []) {
    const parts = sourceEventParts(event);
    if (!parts) continue;

    const summary =
      bySource.get(parts.sourceName) ||
      ({
        name: parts.sourceName,
        purpose: sourcePurpose(parts.sourceName),
        durationMs: 0,
        hasWallClockTiming: false,
        queueWaitMs: 0,
        networkMs: 0,
        parseTimeMs: 0,
        fetches: 0,
        parses: 0,
        evidenceCount: 0,
        editionCount: 0,
        commentaryCount: 0,
        streamingProviderCount: 0,
        added: [],
        scraped: [],
        status: "empty"
      } satisfies SourceDebugSummary);

    if (parts.step === "timing") {
      // This is the adapter elapsed timing and should be the canonical "Took X" value.
      summary.durationMs = event.durationMs;
      summary.hasWallClockTiming = true;
    } else if (!summary.hasWallClockTiming) {
      // Fallback if a timing event is missing.
      summary.durationMs += event.durationMs;
    }
    if (parts.step === "search") summary.searchResults = parseResultCount(event.detail) ?? summary.searchResults;
    if (parts.step === "fetch") summary.fetches += 1;
    if (parts.step === "parse" && event.status === "ok") {
      summary.parses += 1;
      summary.parseTimeMs += event.durationMs;
    }
    if (parts.step === "timing") {
      const queueMatch = event.detail?.match(/queue\s+(\d+)ms/i);
      const networkMatch = event.detail?.match(/network\s+(\d+)ms/i);
      const parseMatch = event.detail?.match(/parse\s+(\d+)ms/i);
      if (queueMatch) summary.queueWaitMs = Number(queueMatch[1]);
      if (networkMatch) summary.networkMs = Number(networkMatch[1]);
      if (parseMatch) summary.parseTimeMs = Number(parseMatch[1]);
    }
    if (event.status === "error") {
      summary.status = "error";
      summary.error = event.detail;
    }

    bySource.set(parts.sourceName, summary);
  }

  for (const [sourceName, sources] of evidenceBySource) {
    const summary =
      bySource.get(sourceName) ||
      ({
        name: sourceName,
        purpose: sourcePurpose(sourceName),
        durationMs: 0,
        hasWallClockTiming: false,
        queueWaitMs: 0,
        networkMs: 0,
        parseTimeMs: 0,
        fetches: 0,
        parses: sources.length,
        evidenceCount: 0,
        editionCount: 0,
        commentaryCount: 0,
        streamingProviderCount: 0,
        added: [],
        scraped: [],
        status: "empty"
      } satisfies SourceDebugSummary);
    const additions = evidenceAdditions(sources);
    summary.evidenceCount = sources.length;
    summary.parses = Math.max(summary.parses, sources.length);
    summary.editionCount = additions.editionCount;
    summary.commentaryCount = additions.commentaryCount;
    summary.streamingProviderCount = additions.streamingProviderCount;
    summary.added = additions.added;
    summary.scraped = additions.scraped;
    summary.status = "used";
    bySource.set(sourceName, summary);
  }

  return [...bySource.values()].sort((left, right) => {
    if (left.status === "used" && right.status !== "used") return -1;
    if (left.status !== "used" && right.status === "used") return 1;
    return right.durationMs - left.durationMs;
  });
}

function sourceLine(summary: SourceDebugSummary): string {
  const foundParts = [
    typeof summary.searchResults === "number" ? `${summary.searchResults} search result(s)` : "",
    summary.fetches ? `${summary.fetches} page(s) fetched` : "",
    summary.parses ? `${summary.parses} useful page(s)` : ""
  ].filter(Boolean);
  const addedText =
    summary.status === "error"
      ? `error: ${summary.error || "source failed"}`
      : summary.added.length
        ? summary.added.join(", ")
        : "nothing usable this run";
  const scrapedText = summary.scraped.length ? summary.scraped.join("; ") : "none";

  return `${summary.name}: ${summary.purpose}. Took ${formatDuration(summary.durationMs)} total; found ${
    foundParts.join(", ") || "no usable result"
  }; scraped data: ${scrapedText}; timing totals: queue ${formatDuration(summary.queueWaitMs)}, network ${formatDuration(summary.networkMs)}, parse ${formatDuration(summary.parseTimeMs)}; added ${addedText}.`;
}

function eventDuration(guide: DiscGuide, eventName: string): number | undefined {
  return guide.debug?.events.find((event) => event.name === eventName)?.durationMs;
}

function pipelineLines(guide: DiscGuide): string[] {
  const pipelineEvents = [
    ["Identity", "identity:resolve"],
    ["Sources", "sources:collect"],
    ["Normalize releases", "editions:normalize"],
    ["Score releases", "editions:score"],
    ["Rank verdict", "verdict:rank"],
    ["Confidence", "confidence:score"],
    ["Cache save", "cache:saveGuide"]
  ]
    .map(([label, name]) => {
      const duration = eventDuration(guide, name);
      return typeof duration === "number" ? `${label}: ${formatDuration(duration)}` : "";
    })
    .filter(Boolean);

  return pipelineEvents.length ? [`Pipeline timings: ${pipelineEvents.join("; ")}.`] : [];
}

export function buildReadableDebugReport(guide: DiscGuide): ReadableDebugReport | null {
  if (!guide.debug) return null;

  const physicalSourceCount = guide.sources.filter((source) => source.sourceName !== "TMDB Watch").length;
  const streamingSourceCount = guide.sources.length - physicalSourceCount;
  const sourceMix = [
    physicalSourceCount ? `${physicalSourceCount} physical page(s)` : "",
    streamingSourceCount ? `${streamingSourceCount} streaming page(s)` : ""
  ]
    .filter(Boolean)
    .join(", ");
  const summaryLines = [
    `Built in ${formatDuration(guide.debug.totalMs)}. Cache: ${guide.debug.cache}.`,
    `Output: ${guide.editions.length} release entr${guide.editions.length === 1 ? "y" : "ies"} from ${
      sourceMix || "no source pages"
    }.`,
    `Confidence: ${guide.confidence.label} (${guide.confidence.score}/100).`
  ];
  const sourceLines = buildSourceSummaries(guide).map(sourceLine);
  const timingLines = pipelineLines(guide);
  const lines = [...summaryLines, "", "Sources checked:", ...sourceLines, "", ...timingLines].filter(
    (line, index, all) => line || all[index - 1]
  );

  return {
    summaryLines,
    sourceLines,
    pipelineLines: timingLines,
    lines
  };
}

import { resolveBaseUrl } from "../core/config.ts";
import { buildReadableDebugReport } from "../core/debugReport.ts";
import { decodeHtmlEntities, normalizeWhitespace } from "../core/html.ts";
import type {
  CommentaryTrack,
  DiscGuide,
  DiscFormat,
  Edition,
  StreamingAvailability,
  StreamingProviderOption
} from "../types/discGuide.ts";
import type { MetaLink, MetaResponse, StreamResponse, StremioMeta } from "../types/stremio.ts";

function formatConfidence(guide: DiscGuide): string {
  const detail = guide.confidence.reasons.slice(0, 2).join(" ");
  return `${guide.confidence.label}${detail ? ` - ${detail}` : ""}`;
}

function streamingAvailabilityFromGuide(guide: DiscGuide): StreamingAvailability | null {
  for (const source of guide.sources) {
    const availability = source.parsed?.streamingAvailability;
    if (!availability) continue;
    if (availability.stream.length || availability.rent.length || availability.buy.length) {
      return availability;
    }
  }
  return null;
}

function isStreamingFallbackGuide(guide: DiscGuide): boolean {
  const availability = streamingAvailabilityFromGuide(guide);
  if (!availability) return false;
  return guide.sources.length > 0 && guide.sources.every((source) => source.sourceName === "TMDB Watch");
}

function firstCardTitle(guide: DiscGuide): string {
  if (isStreamingFallbackGuide(guide)) {
    return "Streaming Availability";
  }
  return "Recommended Edition";
}

function cleanDisplayText(input?: string | null): string {
  return normalizeWhitespace(decodeHtmlEntities(input || ""));
}

function compactDisplayText(input?: string | null): string {
  const lines = decodeHtmlEntities(input || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  return [...new Set(lines)].join("\n");
}

function normalizedFactKey(input?: string | null): string {
  return compactDisplayText(input).toLowerCase();
}

function firstCardDescription(guide: DiscGuide): string {
  if (isStreamingFallbackGuide(guide)) {
    const availability = streamingAvailabilityFromGuide(guide);
    const topStream = availability?.stream[0] || availability?.rent[0] || availability?.buy[0];
    const topLabel = availability?.stream[0]
      ? "Stream"
      : availability?.rent[0]
        ? "Rent"
        : availability?.buy[0]
          ? "Buy"
          : "Top option";
    const lines = [
      topStream ? `${topLabel}: ${cleanDisplayText(topStream.provider)}` : "No streaming providers were parsed.",
      "Physical-media edition picks are currently unavailable."
    ];
    return lines.filter((line, index, all) => line && all.indexOf(line) === index).join("\n");
  }

  const lines = [
    cleanDisplayText(guide.verdict.bestOverall?.editionTitle) || "No clear winner yet"
  ];
  return lines.filter((line, index, all) => line && all.indexOf(line) === index).join("\n");
}

function providerListDescription(options: StreamingProviderOption[]): string {
  return options.map((item) => cleanDisplayText(item.provider)).filter(Boolean).join("\n");
}

function debugTraceDescription(guide: DiscGuide): string {
  return buildReadableDebugReport(guide)?.lines.join("\n") || "";
}

function sortSupplementalStreams(streams: StreamResponse["streams"]): StreamResponse["streams"] {
  return [...streams].sort((left, right) => {
    const leftIsEvidence = left.title.startsWith("Evidence:");
    const rightIsEvidence = right.title.startsWith("Evidence:");
    if (leftIsEvidence !== rightIsEvidence) return leftIsEvidence ? 1 : -1;

    const leftIsAllReleases = left.title === "All Releases";
    const rightIsAllReleases = right.title === "All Releases";
    if (leftIsAllReleases !== rightIsAllReleases) return leftIsAllReleases ? 1 : -1;

    const rightLength = right.description?.length || 0;
    const leftLength = left.description?.length || 0;
    if (rightLength !== leftLength) return rightLength - leftLength;
    return left.title.localeCompare(right.title);
  });
}

function appendDebugCard(
  streams: StreamResponse["streams"],
  guide: DiscGuide,
  guideUrl: string
): void {
  const description = compactDisplayText(debugTraceDescription(guide));
  if (!description) return;

  streams.push({
    name: "Debug",
    title: "Debug: Build Trace",
    description,
    externalUrl: guideUrl,
    behaviorHints: {
      notWebReady: false
    }
  });
}

export function formatGuideSummary(guide: DiscGuide, baseUrl: string): string {
  if (isStreamingFallbackGuide(guide)) {
    const availability = streamingAvailabilityFromGuide(guide);
    const streamNames = availability?.stream.map((item) => cleanDisplayText(item.provider)).join(", ");
    const rentNames = availability?.rent.map((item) => cleanDisplayText(item.provider)).join(", ");
    const buyNames = availability?.buy.map((item) => cleanDisplayText(item.provider)).join(", ");
    const lines = [
      "📺 Streaming Availability",
      "",
      "Physical-media edition picks are currently unavailable for this title.",
      streamNames ? `Stream: ${streamNames}` : "",
      rentNames ? `Rent: ${rentNames}` : "",
      buyNames ? `Buy: ${buyNames}` : "",
      `Confidence: ${formatConfidence(guide)}`,
      "",
      `Open full guide: ${baseUrl}/guide/${guide.imdbId}`
    ].filter(Boolean);

    return lines.join("\n");
  }

  const lines = [
    "📀 Physical Media Guide",
    "",
    guide.verdict.bestOverall ? `Best overall: ${guide.verdict.bestOverall.editionTitle}` : "Best overall: No strong consensus yet",
    guide.verdict.bestVideo ? `Best video: ${guide.verdict.bestVideo.editionTitle}` : "",
    guide.verdict.bestAudio ? `Best audio: ${guide.verdict.bestAudio.editionTitle}` : "",
    guide.verdict.bestEnglishFriendly ? `Best English-friendly: ${guide.verdict.bestEnglishFriendly.editionTitle}` : "",
    guide.verdict.recommendedCut ? `Recommended cut: ${guide.verdict.recommendedCut}` : "",
    `Confidence: ${formatConfidence(guide)}`,
    "",
    `Open full guide: ${baseUrl}/guide/${guide.imdbId}`
  ].filter(Boolean);

  return lines.join("\n");
}

function pickLink(
  label: string,
  pick: DiscGuide["verdict"]["bestOverall"],
  fallbackUrl: string
): MetaLink | null {
  if (!pick) return null;
  return {
    name: label,
    category: pick.editionTitle,
    url: pick.sourceUrl || fallbackUrl
  };
}

function confidenceLink(guide: DiscGuide, fallbackUrl: string): MetaLink {
  return {
    name: `Confidence: ${guide.confidence.label}`,
    category: guide.confidence.reasons.slice(0, 2).join(" ") || "Open guide for reasoning.",
    url: fallbackUrl
  };
}

function evidenceLinks(guide: DiscGuide): MetaLink[] {
  const bestBySource = new Map<string, DiscGuide["sources"][number]>();
  for (const source of guide.sources) {
    const existing = bestBySource.get(source.sourceName);
    if (!existing || source.confidence > existing.confidence) {
      bestBySource.set(source.sourceName, source);
    }
  }

  return [...bestBySource.values()].slice(0, 4).map((source) => ({
    name: `Evidence: ${source.sourceName}`,
    category: `${Math.round(source.confidence * 100)}% identity match`,
    url: source.url
  }));
}

function bestCommentaryEdition(guide: DiscGuide): Edition | undefined {
  return [...guide.editions]
    .filter((edition) => (edition.commentaryTracks?.length || 0) > 0)
    .sort((left, right) => (right.commentaryTracks?.length || 0) - (left.commentaryTracks?.length || 0))[0];
}

function stripRegionCodePrefix(input: string): string {
  return cleanDisplayText(input).replace(
    /^(?:R\d+|Blu-ray\s+[A-Z0-9]+|DVD\s+[A-Z0-9]+|4K UHD\s+[A-Z0-9]+)\s+(.+?)\s*-\s*/i,
    ""
  );
}

function commentarySourceLabel(edition: Edition): string {
  const regional = parseRegionalReleaseTitle(edition.title);
  if (regional) {
    const suffix = regional.qualifier ? ` (${regional.qualifier})` : "";
    return `${regional.publisher}${suffix} - ${regional.country}`;
  }

  const label = cleanDisplayText(edition.label);
  const country = normalizeReleaseCountry(edition.country);
  if (label && country) return `${label} - ${country}`;
  if (label) return label;
  return stripRegionCodePrefix(edition.title);
}

function commentarySummary(tracks: CommentaryTrack[] = []): string {
  return tracks
    .slice(0, 2)
    .map((track) => stripRegionCodePrefix(track.description))
    .join(" | ");
}

function normalizeReleaseCountry(country?: string | null): string | null {
  const value = cleanDisplayText(country);
  if (!value) return null;

  const replacements: Record<string, string> = {
    America: "United States",
    Holland: "Netherlands",
    UK: "United Kingdom"
  };

  return replacements[value] || value;
}

function splitPublisherQualifier(input: string): { publisher: string; qualifier?: string } {
  const value = cleanDisplayText(input);
  const match = value.match(
    /^(.*?)(?:\s+(Special Edition|Limited Edition|Collector's Edition|Ultimate Edition|Ultimate Rekall Edition|Vintage Classics|Studio Classics|Digital Remastered Uncut|Uncut))$/i
  );

  if (!match) {
    return { publisher: value };
  }

  return {
    publisher: cleanDisplayText(match[1]),
    qualifier: cleanDisplayText(match[2])
  };
}

function detectFormatFromText(input: string): DiscFormat {
  const value = cleanDisplayText(input).toLowerCase();
  if (!value) return "Unknown";
  if (/\b4k\b|\buhd\b/.test(value)) return "4K UHD";
  if (/blu[\s-]?ray|\bbd\b/.test(value)) return "Blu-ray";
  if (/\bdvd\b|^r[0-9]+\b/.test(value)) return "DVD";
  if (/\bdigital\b|itunes|vudu|stream|download/.test(value)) return "Digital";
  return "Unknown";
}

function effectiveEditionFormat(edition: Edition, fallbackText?: string): DiscFormat {
  if (edition.format && edition.format !== "Unknown") return edition.format;
  const detected = detectFormatFromText([edition.title, edition.label, fallbackText].filter(Boolean).join(" "));
  return detected;
}

function parseRegionalReleaseTitle(title: string): { country: string; publisher: string; qualifier?: string; format: DiscFormat } | null {
  const value = cleanDisplayText(title);
  const match = value.match(/^(R\d+|Blu-ray\s+[A-Z0-9]+|DVD\s+[A-Z0-9]+|4K UHD\s+[A-Z0-9]+)\s+(.+?)\s*-\s*(.+)$/i);
  if (!match) return null;

  const country = normalizeReleaseCountry(match[2]);
  if (!country) return null;

  const { publisher, qualifier } = splitPublisherQualifier(match[3]);
  if (!publisher) return null;

  return {
    country,
    publisher,
    qualifier,
    format: detectFormatFromText(match[1])
  };
}

function looksLikeLooseReleaseTitle(title: string): boolean {
  const value = cleanDisplayText(title);
  if (!value) return false;
  if (/[.!?]/.test(value)) return false;
  if (/\b(is|are|has|have|looks|appears|uses)\b/i.test(value)) return false;
  return value.length <= 70;
}

function editionHasStructuredReleaseInfo(edition: Edition): boolean {
  return Boolean(
    normalizeReleaseCountry(edition.country) ||
    parseRegionalReleaseTitle(edition.title) ||
    (cleanDisplayText(edition.label) && edition.format !== "Unknown" && !/[:]/.test(cleanDisplayText(edition.label)))
  );
}

function allReleaseSummary(guide: DiscGuide): string {
  type ReleaseLine = {
    format: DiscFormat;
    publisher: string;
    qualifier?: string;
    country?: string;
  };

  const entries: ReleaseLine[] = [];
  const looseTitles = new Set<string>();

  for (const edition of guide.editions) {
    const regional = parseRegionalReleaseTitle(edition.title);
    if (regional) {
      entries.push({
        format: regional.format,
        publisher: regional.publisher,
        qualifier: regional.qualifier,
        country: regional.country
      });
      continue;
    }

    const country = normalizeReleaseCountry(edition.country);
    const label = cleanDisplayText(edition.label);
    const format = effectiveEditionFormat(edition);
    if (country && label) {
      entries.push({
        format,
        publisher: label,
        country
      });
      continue;
    }

    if (editionHasStructuredReleaseInfo(edition) && label) {
      entries.push({
        format,
        publisher: label
      });
      continue;
    }

    const looseTitle = cleanDisplayText(edition.title);
    if (looksLikeLooseReleaseTitle(looseTitle)) {
      looseTitles.add(looseTitle);
    }
  }

  const formatRank = new Map<DiscFormat, number>([
    ["4K UHD", 0],
    ["Blu-ray", 1],
    ["DVD", 2],
    ["Digital", 3],
    ["Unknown", 4]
  ]);

  const uniqueEntries = new Map<string, ReleaseLine>();
  for (const entry of entries) {
    const key = [
      entry.format,
      normalizeWhitespace(entry.publisher).toLowerCase(),
      normalizeWhitespace(entry.qualifier || "").toLowerCase(),
      normalizeWhitespace(entry.country || "").toLowerCase()
    ].join("|");
    if (!uniqueEntries.has(key)) uniqueEntries.set(key, entry);
  }

  const groupedLines = [...uniqueEntries.values()]
    .sort((left, right) => {
      const formatDiff = (formatRank.get(left.format) ?? 99) - (formatRank.get(right.format) ?? 99);
      if (formatDiff !== 0) return formatDiff;
      const publisherDiff = left.publisher.localeCompare(right.publisher);
      if (publisherDiff !== 0) return publisherDiff;
      const qualifierDiff = (left.qualifier || "").localeCompare(right.qualifier || "");
      if (qualifierDiff !== 0) return qualifierDiff;
      return (left.country || "").localeCompare(right.country || "");
    })
    .map((entry) => {
      const formatLabel = entry.format === "Unknown" ? "Other" : entry.format;
      const publisherText = entry.qualifier ? `${entry.publisher} (${entry.qualifier})` : entry.publisher;
      return entry.country ? `${formatLabel}: ${publisherText} - ${entry.country}` : `${formatLabel}: ${publisherText}`;
    });

  const fallbackLines = [...looseTitles].sort((left, right) => left.localeCompare(right));
  return (groupedLines.length > 0 ? groupedLines : fallbackLines).join("\n");
}

function pushDistinctDetailCard(
  cards: StreamResponse["streams"],
  seenFacts: Set<string>,
  card: StreamResponse["streams"][number]
): void {
  const description = compactDisplayText(card.description);
  if (!description) return;

  const factKey = normalizedFactKey(description);
  if (factKey && seenFacts.has(factKey)) return;
  if (factKey) seenFacts.add(factKey);

  cards.push({
    ...card,
    description
  });
}

function buildMetaLinks(guide: DiscGuide, baseUrl: string): MetaLink[] {
  const guideUrl = `${baseUrl}/guide/${guide.imdbId}`;
  const availability = streamingAvailabilityFromGuide(guide);
  const streamingLinks: Array<MetaLink | null> = availability
    ? [
        availability.stream[0]
          ? {
              name: "Stream (Subscription)",
              category: availability.stream[0].provider,
              url: availability.stream[0].url
            }
          : null,
        availability.rent[0]
          ? {
              name: "Rent",
              category: availability.rent[0].provider,
              url: availability.rent[0].url
            }
          : null,
        availability.buy[0]
          ? {
              name: "Buy",
              category: availability.buy[0].provider,
              url: availability.buy[0].url
            }
          : null
      ]
    : [];

  const links: Array<MetaLink | null> = [
    {
      name: "Open Full DiscGrade Guide",
      category: "Hosted guide page",
      url: guideUrl
    },
    pickLink("Best Overall", guide.verdict.bestOverall, guideUrl),
    pickLink("Best Video", guide.verdict.bestVideo, guideUrl),
    pickLink("Best Audio", guide.verdict.bestAudio, guideUrl),
    pickLink("Best English-Friendly", guide.verdict.bestEnglishFriendly, guideUrl),
    bestCommentaryEdition(guide)
      ? {
          name: "Commentaries",
          category: `${bestCommentaryEdition(guide)!.title} · ${bestCommentaryEdition(guide)!.commentaryTracks!.length} track(s)`,
          url: bestCommentaryEdition(guide)!.sourceUrls[0] || guideUrl
        }
      : null,
    guide.verdict.recommendedCut
      ? {
          name: "Recommended Cut",
          category: guide.verdict.recommendedCut,
          url: guideUrl
        }
      : null,
    confidenceLink(guide, guideUrl),
    ...streamingLinks,
    ...evidenceLinks(guide)
  ];

  return links.filter((link): link is MetaLink => Boolean(link));
}

export function formatGuideAsStremioMeta(guide: DiscGuide, baseUrl: string): StremioMeta {
  const contentType = guide.contentType || "movie";
  return {
    id: guide.imdbId,
    type: contentType,
    name: `${guide.title} - DiscGrade`,
    poster: guide.poster,
    background: guide.background,
    releaseInfo: Number.isFinite(guide.year) ? String(guide.year) : undefined,
    description: formatGuideSummary(guide, baseUrl),
    links: buildMetaLinks(guide, baseUrl),
    behaviorHints: {
      defaultVideoId: guide.imdbId
    }
  };
}

export function metaResponseForGuide(guide: DiscGuide, baseUrl: string): MetaResponse {
  return {
    meta: formatGuideAsStremioMeta(guide, baseUrl)
  };
}

function buildStreamItems(guide: DiscGuide, baseUrl: string): StreamResponse["streams"] {
  const guideUrl = `${baseUrl}/guide/${guide.imdbId}`;
  const primaryCard: StreamResponse["streams"][number] = {
    name: "DiscGrade Top Pick",
    title: firstCardTitle(guide),
    description: firstCardDescription(guide),
    externalUrl: guideUrl,
    behaviorHints: {
      notWebReady: false
    }
  };
  const detailCards: StreamResponse["streams"] = [];
  const seenFacts = new Set<string>([
    normalizedFactKey(cleanDisplayText(guide.verdict.bestOverall?.editionTitle)),
    normalizedFactKey(cleanDisplayText(guide.verdict.recommendedCut))
  ].filter(Boolean));

  const streams: StreamResponse["streams"] = [
    {
      ...primaryCard
    }
  ];

  const streamingAvailability = streamingAvailabilityFromGuide(guide);
  if (isStreamingFallbackGuide(guide) && streamingAvailability) {
    const providerCards: Array<{
      title: string;
      options: StreamingProviderOption[];
    }> = [
      { title: "Stream (Subscription)", options: streamingAvailability.stream },
      { title: "Rent", options: streamingAvailability.rent },
      { title: "Buy", options: streamingAvailability.buy }
    ];

    for (const card of providerCards) {
      if (card.options.length === 0) continue;
      const description = compactDisplayText(providerListDescription(card.options));
      if (!description) continue;
      detailCards.push({
        name: card.title,
        title: card.title,
        description,
        externalUrl: card.options[0]?.url || guideUrl,
        behaviorHints: {
          notWebReady: false
        }
      });
    }

    streams.push(...sortSupplementalStreams(detailCards));
    appendDebugCard(streams, guide, guideUrl);
    return streams;
  }

  const picks: Array<{
    label: string;
    pick?: DiscGuide["verdict"]["bestOverall"];
    fallbackDescription?: string;
  }> = [
    { label: "Best Video", pick: guide.verdict.bestVideo },
    { label: "Best Audio", pick: guide.verdict.bestAudio },
    { label: "Best English-Friendly", pick: guide.verdict.bestEnglishFriendly }
  ];

  for (const item of picks) {
    if (!item.pick) continue;
    pushDistinctDetailCard(detailCards, seenFacts, {
      name: item.label,
      title: item.label,
      description: cleanDisplayText(item.pick.editionTitle),
      externalUrl: item.pick.sourceUrl || guideUrl,
      behaviorHints: {
        notWebReady: false
      }
    });
  }

  if (guide.verdict.recommendedCut) {
    pushDistinctDetailCard(detailCards, seenFacts, {
      name: "Recommended Cut",
      title: "Recommended Cut",
      description: cleanDisplayText(guide.verdict.recommendedCut),
      externalUrl: guideUrl,
      behaviorHints: {
        notWebReady: false
      }
    });
  }

  const commentaryEdition = bestCommentaryEdition(guide);
  if (commentaryEdition?.commentaryTracks?.length) {
    pushDistinctDetailCard(detailCards, seenFacts, {
      name: "Commentary Tracks",
      title: "Commentary Tracks",
      description: `${commentarySourceLabel(commentaryEdition)}: ${commentarySummary(commentaryEdition.commentaryTracks)}`,
      externalUrl: commentaryEdition.sourceUrls[0] || guideUrl,
      behaviorHints: {
        notWebReady: false
      }
    });
  }

  const releaseSummary = allReleaseSummary(guide);
  if (guide.editions.length > 1 && releaseSummary) {
    pushDistinctDetailCard(detailCards, seenFacts, {
      name: "All Releases",
      title: "All Releases",
      description: releaseSummary,
      externalUrl: guideUrl,
      behaviorHints: {
        notWebReady: false
      }
    });
  }

  const bestBySource = new Map<string, DiscGuide["sources"][number]>();
  for (const source of guide.sources) {
    const existing = bestBySource.get(source.sourceName);
    if (!existing || source.confidence > existing.confidence) {
      bestBySource.set(source.sourceName, source);
    }
  }

  for (const source of [...bestBySource.values()].slice(0, 3)) {
    pushDistinctDetailCard(detailCards, seenFacts, {
      name: `Evidence: ${source.sourceName}`,
      title: `Evidence: ${source.sourceName}`,
      description: `${Math.round(source.confidence * 100)}% identity match`,
      externalUrl: source.url,
      behaviorHints: {
        notWebReady: false
      }
    });
  }

  streams.push(...sortSupplementalStreams(detailCards));
  appendDebugCard(streams, guide, guideUrl);
  return streams;
}

export function streamResponseForGuide(guide: DiscGuide, baseUrl: string): StreamResponse {
  if (guide.status === "not_found") {
    const guideUrl = `${baseUrl}/guide/${guide.imdbId}`;
    const typeLabel = (guide.contentType || "movie") === "series" ? "series" : "movie";
    return {
      streams: [
        {
          name: "DiscGrade",
          title: "DiscGrade unavailable for this title",
          description: `Could not resolve a reliable ${typeLabel} identity from this metadata provider.\nOpen guide: ${guideUrl}`,
          externalUrl: guideUrl,
          behaviorHints: {
            notWebReady: false
          }
        }
      ]
    };
  }

  return {
    streams: buildStreamItems(guide, baseUrl)
  };
}

export function placeholderMeta(imdbId: string, baseUrl: string, contentType: "movie" | "series" = "movie"): MetaResponse {
  return {
    meta: {
      id: imdbId,
      type: contentType,
      name: "DiscGrade",
      description: `📀 No reliable physical media guide found yet.\n\nOpen guide: ${baseUrl}/guide/${imdbId}`,
      links: [
        {
          name: "Open DiscGrade guide",
          category: "DiscGrade",
          url: `${baseUrl}/guide/${imdbId}`
        }
      ]
    }
  };
}

export function baseUrlFromRequest(host?: string, proto?: string): string {
  return resolveBaseUrl(host, proto);
}

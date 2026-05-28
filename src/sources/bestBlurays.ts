import type {
  ExtractedClaim,
  Identity,
  PartialEdition,
  SourceEvidence
} from "../types/discGuide.ts";
import type { SourceAdapter, SourceRuntime, SourceSearchResult } from "../types/sources.ts";
import {
  decodeHtmlEntities,
  extractJsonLdObjects,
  matchIdentityTitle,
  normalizeWhitespace,
  stripTags,
  toAbsoluteUrl,
  unique
} from "../core/html.ts";
import { extractBadges, extractWarnings } from "../core/textSignals.ts";
import { buildSearchTerms, findLooseTitleMatch, firstParagraphValue, parseFormat } from "./shared.ts";

const BASE_URL = "https://www.bestblurays.com";

export function parseBestBluraysSearchResults(html: string, identity: Identity): SourceSearchResult[] {
  const matches = [...html.matchAll(/href="(\/film\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const deduped = new Map<string, SourceSearchResult>();

  for (const match of matches) {
    const url = toAbsoluteUrl(match[1], BASE_URL);
    const title = normalizeWhitespace(stripTags(match[2] || ""));
    if (!title) continue;
    const titleMatch = matchIdentityTitle(identity, title);
    const year = Number(title.match(/\((\d{4})\)$/)?.[1]);
    if (titleMatch.confidence < 0.7) {
      const looseConfidence = findLooseTitleMatch(identity, title, Number.isFinite(year) ? year : undefined);
      if (!looseConfidence) continue;

      deduped.set(url, {
        url,
        title,
        year: Number.isFinite(year) ? year : undefined,
        matchedBy: "fuzzy",
        confidence: looseConfidence
      });
      continue;
    }

    deduped.set(url, {
      url,
      title,
      year: Number.isFinite(year) ? year : undefined,
      matchedBy: titleMatch.matchedBy,
      confidence: titleMatch.confidence
    });
  }

  return [...deduped.values()].sort((left, right) => right.confidence - left.confidence);
}

function extractField(html: string, label: string): string | undefined {
  const match = html.match(
    new RegExp(`${label}</p>.*?<span class="generated-tiptap"><p>([\\s\\S]*?)<\\/p>`, "i")
  );
  if (!match?.[1]) return undefined;
  const value = firstParagraphValue(match[1]);
  return value || undefined;
}

function extractBestReleaseFromMeta(html: string): string | undefined {
  const match = html.match(/<meta name="description" content="Best release:\s*([^"]+)"/i)?.[1];
  return match ? decodeHtmlEntities(match).trim() : undefined;
}

function buildClaims(parsed: {
  bestOverall?: string;
  bestVideo?: string;
  bestAudio?: string;
  bestEnglishFriendly?: string;
}): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];

  if (parsed.bestOverall) {
    claims.push({
      claimType: "BEST_OVERALL",
      text: `Best overall: ${parsed.bestOverall}`,
      normalizedValue: parsed.bestOverall,
      editionHint: parsed.bestOverall,
      confidence: 0.95
    });
  }
  if (parsed.bestVideo) {
    claims.push({
      claimType: "BEST_VIDEO",
      text: `Best video: ${parsed.bestVideo}`,
      normalizedValue: parsed.bestVideo,
      editionHint: parsed.bestVideo,
      confidence: 0.9
    });
  }
  if (parsed.bestAudio) {
    claims.push({
      claimType: "BEST_AUDIO",
      text: `Best audio: ${parsed.bestAudio}`,
      normalizedValue: parsed.bestAudio,
      editionHint: parsed.bestAudio,
      confidence: 0.88
    });
  }
  if (parsed.bestEnglishFriendly) {
    claims.push({
      claimType: "BEST_ENGLISH_FRIENDLY",
      text: `Best English-friendly release: ${parsed.bestEnglishFriendly}`,
      normalizedValue: parsed.bestEnglishFriendly,
      editionHint: parsed.bestEnglishFriendly,
      confidence: 0.86
    });
  }

  return claims;
}

function pickEditions(values: string[]): PartialEdition[] {
  return unique(values.filter(Boolean)).map((value) => ({
    title: value,
    label: value.split(/\s+(4K|Blu-ray|DVD)/i)[0]?.trim() || value,
    format: parseFormat(value),
    notes: [value],
    badges: extractBadges([value])
  }));
}

export async function parseBestBluraysPage(
  html: string,
  identity: Identity,
  result: SourceSearchResult
): Promise<SourceEvidence | null> {
  const jsonLd = extractJsonLdObjects(html).find(
    (item): item is { sameAs?: string[] } => !!item && typeof item === "object" && "sameAs" in item
  );
  const sameAs = Array.isArray(jsonLd?.sameAs) ? jsonLd.sameAs : [];
  const imdbLink = sameAs.find((item) => item.includes("imdb.com/title/"));

  const bestOverall = extractBestReleaseFromMeta(html);
  const bestVideo = extractField(html, "Best Video Release");
  const bestAudio = extractField(html, "Best Audio Release");
  const bestEnglishFriendly = extractField(html, "Best English-Friendly Release");
  const format = extractField(html, "Format");

  const notes = [format].filter(Boolean) as string[];
  const warnings = extractWarnings([bestOverall || "", bestVideo || "", bestAudio || "", bestEnglishFriendly || "", ...notes], result.url);

  return {
    sourceName: "Best Blurays",
    url: result.url,
    fetchedAt: new Date().toISOString(),
    matchedBy: imdbLink?.includes(identity.imdbId) ? "imdb" : result.matchedBy,
    confidence: imdbLink?.includes(identity.imdbId) ? 0.96 : result.confidence,
    extractedClaims: buildClaims({ bestOverall, bestVideo, bestAudio, bestEnglishFriendly }),
    parsed: {
      bestOverall,
      bestVideo,
      bestAudio,
      bestEnglishFriendly,
      editions: pickEditions([bestOverall || "", bestVideo || "", bestAudio || "", bestEnglishFriendly || ""]),
      warnings,
      notes,
      rawSummary: bestOverall ? `Best release: ${bestOverall}` : undefined
    }
  };
}

export const bestBluraysAdapter: SourceAdapter = {
  name: "Best Blurays",
  priority: 1,
  maxResults: 1,
  canHandle() {
    return true;
  },
  async search(identity: Identity, runtime: SourceRuntime): Promise<SourceSearchResult[]> {
    const deduped = new Map<string, SourceSearchResult>();

    for (const term of buildSearchTerms(identity)) {
      const html = await runtime.fetchText(`${BASE_URL}/films?title=${encodeURIComponent(term)}`);
      const results = parseBestBluraysSearchResults(html, identity);

      for (const result of results) {
        const existing = deduped.get(result.url);
        if (!existing || result.confidence > existing.confidence) {
          deduped.set(result.url, result);
        }
      }

      if (deduped.size > 0) break;
    }

    return [...deduped.values()].sort((left, right) => right.confidence - left.confidence);
  },
  parse: parseBestBluraysPage
};

import type {
  ExtractedClaim,
  Identity,
  PartialEdition,
  SourceEvidence
} from "../types/discGuide.ts";
import type { SourceAdapter, SourceRuntime, SourceSearchResult } from "../types/sources.ts";
import { matchIdentityTitle, normalizeWhitespace, stripTags, toAbsoluteUrl, unique } from "../core/html.ts";
import { extractBadges } from "../core/textSignals.ts";
import { parseCommentaryTracks, parseFormat } from "./shared.ts";

const BASE_URL = "https://secondsightfilms.co.uk";

interface SecondSightSearchPayload {
  resources?: {
    results?: {
      products?: Array<{
        title?: string;
        url?: string;
      }>;
    };
  };
}

function normalizeProductTitle(title: string): string {
  return normalizeWhitespace(
    title
      .replace(/\b(limited edition|standard edition|4k ultra hd|4k uhd|uhd|blu-ray|dvd|2-disc edition|box set)\b/gi, " ")
      .replace(/\s+/g, " ")
  );
}

export function parseSecondSightSearchResults(payload: string, identity: Identity): SourceSearchResult[] {
  const parsed = JSON.parse(payload) as SecondSightSearchPayload;
  const products = parsed.resources?.results?.products || [];
  const deduped = new Map<string, SourceSearchResult>();

  for (const product of products) {
    const rawTitle = normalizeWhitespace(product.title || "");
    const relativeUrl = product.url || "";
    if (!rawTitle || !relativeUrl) continue;

    const score = matchIdentityTitle(identity, normalizeProductTitle(rawTitle));
    if (score.confidence < 0.72) continue;

    const url = toAbsoluteUrl(relativeUrl, BASE_URL);
    deduped.set(url, {
      url,
      title: rawTitle,
      matchedBy: score.matchedBy,
      confidence: score.confidence
    });
  }

  return [...deduped.values()].sort((left, right) => right.confidence - left.confidence);
}

function extractDescriptionHtml(html: string): string {
  const match = html.match(/<div class="product-single__description rte">\s*([\s\S]*?)\s*<\/div>/i);
  return match?.[1] || "";
}

function extractFeatureLines(descriptionHtml: string): string[] {
  if (!descriptionHtml) return [];

  const normalized = descriptionHtml.replace(/\r/g, "");
  const featureSectionMatch = normalized.match(
    /<p>\s*<strong>\s*(?:Bonus|Special)\s+Features[^<]*<\/strong>\s*<\/p>\s*(<ul>[\s\S]*?<\/ul>)/i
  );
  const listHtml = featureSectionMatch?.[1] || "";
  if (!listHtml) return [];

  return unique(
    [...listHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((match) => normalizeWhitespace(stripTags(match[1])))
      .filter(Boolean)
  );
}

function extractRegion(descriptionHtml: string): string | undefined {
  const text = stripTags(descriptionHtml);
  const regionMatch = text.match(/\bRegion\s*:\s*(Region Free|[A-Z0-9 -]+)$/i);
  return regionMatch?.[1] ? normalizeWhitespace(regionMatch[1]) : undefined;
}

export function buildSecondSightEdition(result: SourceSearchResult, descriptionHtml: string): PartialEdition {
  const extras = extractFeatureLines(descriptionHtml);
  const commentaryTracks = parseCommentaryTracks(extras);

  return {
    title: result.title,
    label: "Second Sight Films",
    format: parseFormat(result.title),
    region: extractRegion(descriptionHtml),
    commentaryTracks,
    extras,
    notes: extras.filter((line) => /restoration|subtitle|audio|region|dolby|atmos/i.test(line)).slice(0, 6),
    badges: extractBadges(extras),
    sourceUrls: [result.url]
  };
}

export async function parseSecondSightPage(
  html: string,
  _identity: Identity,
  result: SourceSearchResult
): Promise<SourceEvidence | null> {
  const descriptionHtml = extractDescriptionHtml(html);
  if (!descriptionHtml) return null;

  const edition = buildSecondSightEdition(result, descriptionHtml);
  if ((edition.commentaryTracks?.length || edition.extras?.length || 0) === 0) return null;

  const claims: ExtractedClaim[] = [];
  if (edition.commentaryTracks?.length) {
    claims.push({
      claimType: "BEST_EXTRAS",
      text: `${edition.title}: ${edition.commentaryTracks.map((track) => track.description).join("; ")}`,
      editionHint: edition.title,
      confidence: 0.92
    });
  }

  return {
    sourceName: "Second Sight Films",
    url: result.url,
    fetchedAt: new Date().toISOString(),
    matchedBy: result.matchedBy,
    confidence: result.confidence,
    extractedClaims: claims,
    parsed: {
      bestExtras: edition.commentaryTracks?.length ? edition.title : undefined,
      editions: [edition],
      notes: edition.commentaryTracks?.map((track) => track.description) || []
    }
  };
}

export const secondSightFilmsAdapter: SourceAdapter = {
  name: "Second Sight Films",
  priority: 3,
  maxResults: 2,
  canHandle() {
    return true;
  },
  async search(identity: Identity, runtime: SourceRuntime): Promise<SourceSearchResult[]> {
    const payload = await runtime.fetchText(
      `${BASE_URL}/search/suggest.json?q=${encodeURIComponent(identity.title)}&resources[type]=product&resources[limit]=10&section_id=predictive-search`
    );
    return parseSecondSightSearchResults(payload, identity);
  },
  parse: parseSecondSightPage
};

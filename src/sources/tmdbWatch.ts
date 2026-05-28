import type {
  Identity,
  SourceEvidence,
  StreamingAvailability,
  StreamingOfferType,
  StreamingProviderOption
} from "../types/discGuide.ts";
import type { SourceRuntime } from "../types/sources.ts";
import { decodeHtmlEntities, normalizeTitle, normalizeWhitespace, toAbsoluteUrl } from "../core/html.ts";

const TMDB_BASE_URL = "https://www.themoviedb.org";

const OFFER_CLASS_TO_TYPE: Record<string, StreamingOfferType> = {
  flatrate: "stream",
  rent: "rent",
  buy: "buy"
};

type ParsedProviderRow = {
  offerType: StreamingOfferType;
  provider: string;
  url: string;
};

function extractMetaDescription(html: string): string | undefined {
  const raw = html.match(/<meta name="description" content="([^"]+)"/i)?.[1];
  if (!raw) return undefined;
  return normalizeWhitespace(decodeHtmlEntities(raw));
}

function providerNameFromTitle(title: string): string | undefined {
  const clean = normalizeWhitespace(decodeHtmlEntities(title));
  if (!clean) return undefined;

  const match = clean.match(/\bon\s+(.+)$/i);
  if (match?.[1]) return normalizeWhitespace(match[1]);
  return clean;
}

function extractProviderRows(html: string): ParsedProviderRow[] {
  const rows: ParsedProviderRow[] = [];
  const deduped = new Set<string>();
  const liBlocks = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];

  for (const blockMatch of liBlocks) {
    const block = blockMatch[1] || "";
    const wrapperClass = block.match(/class="wrapper\s+([^"\s]+)[^"]*"/i)?.[1]?.toLowerCase();
    if (!wrapperClass) continue;

    const offerType = OFFER_CLASS_TO_TYPE[wrapperClass];
    if (!offerType) continue;

    const href = block.match(/<a[^>]*href="([^"]+)"/i)?.[1];
    const title = block.match(/<a[^>]*title="([^"]+)"/i)?.[1];
    if (!href || !title) continue;

    const provider = providerNameFromTitle(title);
    if (!provider) continue;

    const dedupeKey = `${offerType}:${normalizeTitle(provider)}`;
    if (deduped.has(dedupeKey)) continue;
    deduped.add(dedupeKey);

    rows.push({
      offerType,
      provider,
      url: toAbsoluteUrl(decodeHtmlEntities(href), TMDB_BASE_URL)
    });
  }

  return rows;
}

function toStreamingAvailability(rows: ParsedProviderRow[], region: string): StreamingAvailability {
  const stream: StreamingProviderOption[] = [];
  const rent: StreamingProviderOption[] = [];
  const buy: StreamingProviderOption[] = [];

  for (const row of rows) {
    const option = {
      provider: row.provider,
      url: row.url
    };
    if (row.offerType === "stream") stream.push(option);
    if (row.offerType === "rent") rent.push(option);
    if (row.offerType === "buy") buy.push(option);
  }

  return {
    region,
    stream,
    rent,
    buy
  };
}

export function parseTmdbWatchPage(
  html: string,
  identity: Identity,
  watchUrl: string,
  region: string
): SourceEvidence | null {
  const rows = extractProviderRows(html);
  if (rows.length === 0) return null;

  const streamingAvailability = toStreamingAvailability(rows, region);
  const metaDescription = extractMetaDescription(html);
  const claimSummary = [
    streamingAvailability.stream.length ? `Stream: ${streamingAvailability.stream.map((item) => item.provider).join(", ")}` : "",
    streamingAvailability.rent.length ? `Rent: ${streamingAvailability.rent.map((item) => item.provider).join(", ")}` : "",
    streamingAvailability.buy.length ? `Buy: ${streamingAvailability.buy.map((item) => item.provider).join(", ")}` : ""
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    sourceName: "TMDB Watch",
    url: watchUrl,
    fetchedAt: new Date().toISOString(),
    matchedBy: identity.tmdbId ? "tmdb" : "fuzzy",
    confidence: 0.62,
    extractedClaims: [
      {
        claimType: "SPECS",
        text: claimSummary || `Streaming availability data found for region ${region}.`,
        confidence: 0.62
      }
    ],
    parsed: {
      streamingAvailability,
      notes: metaDescription ? [metaDescription] : [],
      rawSummary: metaDescription
    }
  };
}

export async function fetchTmdbWatchFallbackEvidence(
  identity: Identity,
  runtime: SourceRuntime,
  region: string
): Promise<SourceEvidence | null> {
  if (!identity.tmdbId) return null;
  const watchUrl = `${TMDB_BASE_URL}/movie/${identity.tmdbId}/watch?locale=${encodeURIComponent(region)}`;
  const html = await runtime.fetchText(watchUrl);
  return parseTmdbWatchPage(html, identity, watchUrl, region);
}


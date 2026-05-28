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

const BASE_URL = "https://www.arrowfilms.com";

function normalizeProductTitle(title: string): string {
  return normalizeWhitespace(
    title
      .replace(/\b(limited edition|blu-ray|4k ultra hd|4k uhd|uhd|dvd|dual format)\b/gi, " ")
      .replace(/\s+/g, " ")
  );
}

export function parseArrowFilmsSearchResults(html: string, identity: Identity): SourceSearchResult[] {
  const matches = [...html.matchAll(/<a href="(\/p\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const deduped = new Map<string, SourceSearchResult>();

  for (const match of matches) {
    const rawTitle = normalizeWhitespace(stripTags(match[2]));
    if (!rawTitle) continue;

    const title = normalizeProductTitle(rawTitle);
    const score = matchIdentityTitle(identity, title);
    if (score.confidence < 0.72) continue;

    const url = toAbsoluteUrl(match[1], BASE_URL);
    deduped.set(url, {
      url,
      title: rawTitle,
      matchedBy: score.matchedBy,
      confidence: score.confidence
    });
  }

  return [...deduped.values()].sort((left, right) => right.confidence - left.confidence);
}

function extractJsonLdProductGroup(html: string): Record<string, unknown> | null {
  const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed?.["@type"] === "ProductGroup") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function extractFeatureLines(description: string): string[] {
  const normalized = description.replace(/\r/g, "");
  const [, afterHeader = ""] = normalized.split(/Product Features/i);
  if (!afterHeader) return [];

  return unique(
    afterHeader
      .split(/\n+/)
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean)
      .filter((line) => !/^(product details|delivery|returns|brand arrow video)$/i.test(line))
  );
}

function buildArrowEdition(result: SourceSearchResult, product: Record<string, unknown>): PartialEdition {
  const title = String(product.name || result.title);
  const description = typeof product.description === "string" ? product.description : "";
  const extras = extractFeatureLines(description);
  const commentaryTracks = parseCommentaryTracks(extras);

  return {
    title,
    label: "Arrow Video",
    format: parseFormat(title),
    commentaryTracks,
    extras,
    notes: extras.filter((line) => /restoration|subtitle|audio|region/i.test(line)).slice(0, 6),
    badges: extractBadges(extras),
    sourceUrls: [result.url]
  };
}

export async function parseArrowFilmsPage(
  html: string,
  identity: Identity,
  result: SourceSearchResult
): Promise<SourceEvidence | null> {
  const group = extractJsonLdProductGroup(html);
  const variants = Array.isArray(group?.hasVariant) ? (group?.hasVariant as Record<string, unknown>[]) : [];
  const deduped = new Map<string, PartialEdition>();
  for (const edition of variants
    .map((variant) => buildArrowEdition(result, variant))
    .filter((edition) => (edition.commentaryTracks?.length || edition.extras?.length || 0) > 0)) {
    const key = `${edition.title}|${edition.format}|${edition.label || ""}`;
    if (!deduped.has(key)) {
      deduped.set(key, edition);
    }
  }
  const editions = [...deduped.values()];

  if (editions.length === 0) return null;

  const claims: ExtractedClaim[] = [];
  for (const edition of editions) {
    if (edition.commentaryTracks?.length) {
      claims.push({
        claimType: "BEST_EXTRAS",
        text: `${edition.title}: ${edition.commentaryTracks.map((track) => track.description).join("; ")}`,
        editionHint: edition.title,
        confidence: 0.9
      });
    }
  }

  return {
    sourceName: "Arrow Films",
    url: result.url,
    fetchedAt: new Date().toISOString(),
    matchedBy: result.matchedBy,
    confidence: result.confidence,
    extractedClaims: claims,
    parsed: {
      bestExtras: editions.find((edition) => (edition.commentaryTracks?.length || 0) > 0)?.title,
      editions,
      notes: editions.flatMap((edition) => edition.commentaryTracks?.map((track) => track.description) || [])
    }
  };
}

export const arrowFilmsAdapter: SourceAdapter = {
  name: "Arrow Films",
  priority: 3,
  maxResults: 2,
  canHandle() {
    return true;
  },
  async search(identity: Identity, runtime: SourceRuntime): Promise<SourceSearchResult[]> {
    const html = await runtime.fetchText(`${BASE_URL}/search/?q=${encodeURIComponent(identity.title)}`);
    return parseArrowFilmsSearchResults(html, identity);
  },
  parse: parseArrowFilmsPage
};

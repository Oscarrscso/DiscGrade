import type {
  ExtractedClaim,
  Identity,
  PartialEdition,
  SourceEvidence
} from "../types/discGuide.ts";
import type { SourceAdapter, SourceRuntime, SourceSearchResult } from "../types/sources.ts";
import { matchIdentityTitle, normalizeWhitespace, stripTags } from "../core/html.ts";
import { extractBadges, extractWarnings } from "../core/textSignals.ts";
import {
  buildSearchTerms,
  cleanSearchTitle,
  countryCodeToName,
  findLooseTitleMatch,
  linesFromHtml,
  parseAudioList,
  parseCommentaryTracks,
  parseFormat,
  parseQuotedArray,
  parseVideoBlock
} from "./shared.ts";

const SEARCH_URL = "https://www.blu-ray.com/search/quicksearch.php";
const BLURAY_BASE_FETCH_LIMIT = 4;
const BLURAY_HIGH_HIT_FETCH_LIMIT = 8;
const BLURAY_HIGH_HIT_THRESHOLD = 10;

export function parseBluRayQuickSearch(html: string, identity: Identity): SourceSearchResult[] {
  const urls = parseQuotedArray(html, "urls");
  const countryCodes = parseQuotedArray(html, "countrycodes");
  const liMatches = [...html.matchAll(/<li[^>]+id="match(\d+)"[^>]*>[\s\S]*?&nbsp;([\s\S]*?)<\/li>/g)];
  const results: SourceSearchResult[] = [];

  for (const match of liMatches) {
    const index = Number(match[1]);
    const url = urls[index];
    if (!url) continue;

    const title = cleanSearchTitle(match[2]);
    const titleMatch = matchIdentityTitle(identity, title, Number(title.match(/\((\d{4})\)/)?.[1]));
    if (titleMatch.confidence < 0.7) {
      const year = Number(title.match(/\((\d{4})\)/)?.[1]);
      const looseConfidence = findLooseTitleMatch(identity, title, Number.isFinite(year) ? year : undefined);
      if (!looseConfidence) continue;

      results.push({
        url,
        title,
        year: Number.isFinite(year) ? year : undefined,
        country: countryCodeToName(countryCodes[index]),
        matchedBy: "fuzzy",
        confidence: looseConfidence
      });
      continue;
    }

    results.push({
      url,
      title,
      year: Number(title.match(/\((\d{4})\)/)?.[1]),
      country: countryCodeToName(countryCodes[index]),
      matchedBy: titleMatch.matchedBy,
      confidence: titleMatch.confidence
    });
  }

  return results.sort((left, right) => right.confidence - left.confidence);
}

function extractSection(html: string, label: string, nextLabel: string): string {
  const match = html.match(
    new RegExp(`<span class="subheading">${label}<\\/span><br>([\\s\\S]*?)<span class="subheading">${nextLabel}<\\/span>`, "i")
  );
  return match?.[1] || "";
}

function extractRating(html: string, label: string): number | undefined {
  const match = html.match(
    new RegExp(`<td[^>]*>${label}<\\/td>[\\s\\S]*?title="([\\d.]+) of 5"`, "i")
  );
  return match ? Number(match[1]) : undefined;
}

function buildEdition(result: SourceSearchResult, pageTitle: string, html: string): PartialEdition {
  const label =
    html.match(/studioid=\d+[^>]*>([^<]+)<\/a>\s*\|\s*<a class="grey"[^>]*year=/i)?.[1]?.trim() ||
    pageTitle.replace(/\s+(4K\s+)?Blu-ray$/i, "").trim();

  const releaseDate =
    html.match(/Release Date ([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[1] ||
    html.match(/>\s*([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\s*<\/a>/)?.[1];

  const videoBlock = extractSection(html, "Video", "Audio");
  const audioBlock = extractSection(html, "Audio", "Subtitles");
  const subtitlesBlock = extractSection(html, "Subtitles", "Discs");
  const supplementsBlock =
    html.match(/<span class="subheading">(?:Supplements|Extras)<\/span><br>([\s\S]*?)<span class="subheading">/i)?.[1] || "";
  const playbackMatch = html.match(/<span class="subheading">Playback<\/span><br>([\s\S]*?)<\/td>/i)?.[1] || "";
  const extras = linesFromHtml(supplementsBlock);
  const commentaryTracks = parseCommentaryTracks(extras);

  const format = parseFormat(pageTitle);
  const notes = [
    ...linesFromHtml(subtitlesBlock).map((line) => `Subtitles: ${line}`),
    ...linesFromHtml(playbackMatch).map((line) => `Playback: ${line}`)
  ];
  const badges = extractBadges([videoBlock, audioBlock, ...notes]);

  return {
    title: `${label} ${format}${result.country ? ` (${result.country})` : ""}`.trim(),
    label,
    country: result.country,
    region: linesFromHtml(playbackMatch).join(" "),
    format,
    releaseYear: result.year,
    releaseDate,
    video: parseVideoBlock(videoBlock),
    audio: parseAudioList(audioBlock),
    commentaryTracks,
    extras,
    notes,
    badges,
    sourceUrls: [result.url]
  };
}

export async function parseBluRayPage(
  html: string,
  identity: Identity,
  result: SourceSearchResult
): Promise<SourceEvidence | null> {
  const pageTitle = normalizeWhitespace(stripTags(html.match(/<title>([^<]+)<\/title>/i)?.[1] || result.title));
  const edition = buildEdition(result, pageTitle, html);
  const ratings = {
    video: extractRating(html, "Video"),
    audio: extractRating(html, "Audio"),
    extras: extractRating(html, "Extras"),
    overall: extractRating(html, "Overall")
  };

  const claims: ExtractedClaim[] = [
    {
      claimType: "SPECS",
      text: `${edition.title}: ${edition.video?.resolution || "Unknown"} ${edition.video?.codec || ""}, ${edition.region || "region unknown"}`.trim(),
      editionHint: edition.title,
      confidence: 0.88
    }
  ];

  if (ratings.video || ratings.audio || ratings.overall) {
    claims.push({
      claimType: "REVIEW_SCORE",
      text: `Blu-ray.com ratings for ${edition.title}: video ${ratings.video ?? "n/a"}, audio ${ratings.audio ?? "n/a"}, overall ${ratings.overall ?? "n/a"}.`,
      editionHint: edition.title,
      confidence: 0.8
    });
  }

  const warnings = extractWarnings([...(edition.notes || []), ...(edition.badges || []), pageTitle], result.url, edition.title);

  return {
    sourceName: "Blu-ray.com",
    url: result.url,
    fetchedAt: new Date().toISOString(),
    matchedBy: result.matchedBy,
    confidence: result.confidence,
    extractedClaims: claims,
    parsed: {
      editions: [edition],
      reviewScores: ratings,
      warnings,
      notes: edition.notes
    }
  };
}

export const bluRayComAdapter: SourceAdapter = {
  name: "Blu-ray.com",
  priority: 2,
  maxResults: BLURAY_HIGH_HIT_FETCH_LIMIT,
  canHandle() {
    return true;
  },
  async search(identity: Identity, runtime: SourceRuntime): Promise<SourceSearchResult[]> {
    const deduped = new Map<string, SourceSearchResult>();

    for (const term of buildSearchTerms(identity)) {
      const html = await runtime.fetchText(SEARCH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: `section=bluraymovies&userid=-1&country=all&keyword=${encodeURIComponent(term)}`
      });
      const results = parseBluRayQuickSearch(html, identity);

      for (const result of results) {
        const existing = deduped.get(result.url);
        if (!existing || result.confidence > existing.confidence) {
          deduped.set(result.url, result);
        }
      }

      if (deduped.size > 0) break;
    }

    const ranked = [...deduped.values()].sort((left, right) => right.confidence - left.confidence);
    const fetchLimit =
      ranked.length >= BLURAY_HIGH_HIT_THRESHOLD ? BLURAY_HIGH_HIT_FETCH_LIMIT : BLURAY_BASE_FETCH_LIMIT;

    return ranked.slice(0, fetchLimit);
  },
  parse: parseBluRayPage
};

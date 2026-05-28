import type {
  ExtractedClaim,
  Identity,
  PartialEdition,
  SourceEvidence
} from "../types/discGuide.ts";
import type { SourceAdapter, SourceRuntime, SourceSearchResult } from "../types/sources.ts";
import { matchIdentityTitle, normalizeWhitespace, stripTags, toAbsoluteUrl, unique } from "../core/html.ts";
import { extractBadges, extractWarnings } from "../core/textSignals.ts";
import {
  buildSearchTerms,
  cutInfoFromLine,
  findLooseTitleMatch,
  linesFromHtml,
  parseAudioList,
  parseCommentaryTracks,
  parseEditionHeader
} from "./shared.ts";

const BASE_URL = "https://www.dvdcompare.net/comparisons/";

export function parseDvdCompareSearchResults(html: string, identity: Identity): SourceSearchResult[] {
  const matches = [...html.matchAll(/href="film\.php\?fid=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const deduped = new Map<string, SourceSearchResult>();

  for (const match of matches) {
    const title = normalizeWhitespace(stripTags(match[2]));
    const score = matchIdentityTitle(identity, title, Number(title.match(/\((\d{4})\)/)?.[1]));
    if (score.confidence < 0.7) {
      const year = Number(title.match(/\((\d{4})\)/)?.[1]);
      const looseConfidence = findLooseTitleMatch(identity, title, Number.isFinite(year) ? year : undefined);
      if (!looseConfidence) continue;

      const url = toAbsoluteUrl(`film.php?fid=${match[1]}`, BASE_URL);
      deduped.set(url, {
        url,
        title,
        year: Number.isFinite(year) ? year : undefined,
        matchedBy: "fuzzy",
        confidence: looseConfidence
      });
      continue;
    }

    const url = toAbsoluteUrl(`film.php?fid=${match[1]}`, BASE_URL);
    deduped.set(url, {
      url,
      title,
      year: Number(title.match(/\((\d{4})\)/)?.[1]),
      matchedBy: score.matchedBy,
      confidence: score.confidence
    });
  }

  const ranked = [...deduped.values()].sort((left, right) => right.confidence - left.confidence);
  const strong = ranked.filter((result) => result.confidence >= 0.9);
  return strong.length > 0 ? strong : ranked;
}

function extractLabelMap(block: string): Record<string, string> {
  const entries = [...block.matchAll(/<div class="label">([^<]+):<\/div>\s*<div class="description">([\s\S]*?)<\/div>/gi)];
  return Object.fromEntries(entries.map((item) => [normalizeWhitespace(item[1]), item[2]]));
}

function extractEditionBlocks(html: string): PartialEdition[] {
  const anchors = [...html.matchAll(/<a name=(\d+)>/gi)];
  const limitIndex = html.search(/<h3>CUTS:<\/h3>/i);
  const partials: PartialEdition[] = [];

  for (let index = 0; index < anchors.length; index += 1) {
    const start = anchors[index].index || 0;
    const end = anchors[index + 1]?.index || (limitIndex > 0 ? limitIndex : html.length);
    const block = html.slice(start, end);

    const headerHtml = block.match(/<a name=\d+>([\s\S]*?)<\/h3>/i)?.[1];
    if (!headerHtml) continue;

    const partial = parseEditionHeader(headerHtml);
    const fields = extractLabelMap(block);

    partial.audio = fields.Audio ? parseAudioList(fields.Audio) : [];
    partial.extras = fields.Extras ? linesFromHtml(fields.Extras) : [];
    partial.commentaryTracks = parseCommentaryTracks(partial.extras);
    partial.notes = [
      ...(fields.Subtitles ? linesFromHtml(fields.Subtitles).map((line) => `Subtitles: ${line}`) : []),
      ...(fields.Notes ? linesFromHtml(fields.Notes) : [])
    ];
    partial.badges = extractBadges(partial.notes);
    partial.sourceUrls = [];
    partials.push(partial);
  }

  return partials;
}

function applyCutNotes(html: string, editions: PartialEdition[]): void {
  const cutBlock =
    html.match(/<h3>CUTS:<\/h3>([\s\S]*?)(?:<p>|<\/body>|Please ensure)/i)?.[1] ||
    html.match(/<h3>CUTS:<\/h3>([\s\S]*)$/i)?.[1];
  if (!cutBlock) return;

  const lines = [...cutBlock.matchAll(/<li>\s*([\s\S]*?)<\/li>/gi)].map((item) => normalizeWhitespace(stripTags(item[1])));
  for (const line of lines) {
    const cut = cutInfoFromLine(line);
    const matching = editions.find((edition) => line.toLowerCase().includes((edition.label || edition.title).toLowerCase()));
    if (!matching) continue;
    matching.cuts = [...(matching.cuts || []), cut];
    matching.notes = unique([...(matching.notes || []), cut.description || line]);
  }
}

export async function parseDvdComparePage(
  html: string,
  identity: Identity,
  result: SourceSearchResult
): Promise<SourceEvidence | null> {
  const editions = extractEditionBlocks(html);
  applyCutNotes(html, editions);

  const summaryNote = normalizeWhitespace(
    stripTags(html.match(/<p><strong>([\s\S]*?)<\/strong><\/p>/i)?.[1] || "")
  );

  const claims: ExtractedClaim[] = [];
  if (summaryNote) {
    claims.push({
      claimType: "CUT_INFO",
      text: summaryNote,
      confidence: 0.82
    });
  }

  for (const edition of editions) {
    if (edition.cuts?.length) {
      claims.push({
        claimType: "CUT_INFO",
        text: `${edition.title}: ${edition.cuts.map((cut) => cut.description || cut.name).join("; ")}`,
        editionHint: edition.title,
        confidence: 0.84
      });
    }
  }

  const warnings = extractWarnings(
    [summaryNote, ...editions.flatMap((edition) => edition.notes || [])].filter(Boolean),
    result.url
  );

  return {
    sourceName: "DVDCompare",
    url: result.url,
    fetchedAt: new Date().toISOString(),
    matchedBy: result.matchedBy,
    confidence: result.confidence,
    extractedClaims: claims,
    parsed: {
      editions: editions.map((edition) => ({
        ...edition,
        sourceUrls: [result.url]
      })),
      warnings,
      notes: summaryNote ? [summaryNote] : []
    }
  };
}

export const dvdCompareAdapter: SourceAdapter = {
  name: "DVDCompare",
  priority: 3,
  maxResults: 1,
  canHandle() {
    return true;
  },
  async search(identity: Identity, runtime: SourceRuntime): Promise<SourceSearchResult[]> {
    const deduped = new Map<string, SourceSearchResult>();

    for (const term of buildSearchTerms(identity)) {
      const html = await runtime.fetchText(`${BASE_URL}search.php`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: `param=${encodeURIComponent(term)}&searchtype=text`
      });

      const results = parseDvdCompareSearchResults(html, identity);
      for (const result of results) {
        const existing = deduped.get(result.url);
        if (!existing || result.confidence > existing.confidence) {
          deduped.set(result.url, result);
        }
      }

      if ([...deduped.values()].some((result) => result.confidence >= 0.9)) break;
    }

    return [...deduped.values()].sort((left, right) => right.confidence - left.confidence);
  },
  parse: parseDvdComparePage
};

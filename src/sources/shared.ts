import type {
  AudioInfo,
  CommentaryTrack,
  CutInfo,
  DiscFormat,
  Identity,
  PartialEdition,
  Resolution,
  VideoInfo
} from "../types/discGuide.ts";
import { decodeHtmlEntities, extractYear, normalizeTitle, normalizeWhitespace, stripTags, unique } from "../core/html.ts";

const countryCodeMap: Record<string, string> = {
  US: "United States",
  UK: "United Kingdom",
  CA: "Canada",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  JP: "Japan",
  MX: "Mexico"
};

export function countryCodeToName(code?: string): string | undefined {
  if (!code) return undefined;
  return countryCodeMap[code] || code;
}

export function parseQuotedArray(source: string, variableName: string): string[] {
  const match = source.match(new RegExp(`var\\s+${variableName}\\s*=\\s*new Array\\(([^;]*)\\);`, "i"));
  if (!match?.[1]) return [];
  return [...match[1].matchAll(/'((?:\\'|[^'])*)'/g)].map((item) => item[1].replace(/\\'/g, "'"));
}

export function cleanSearchTitle(raw: string): string {
  return normalizeWhitespace(
    stripTags(raw)
      .replace(/\s+\(\d{4}\)\s*$/, (match) => match)
      .replace(/\s+/g, " ")
  );
}

export function buildSearchTerms(identity: Identity): string[] {
  const rawTitles = unique([identity.title, identity.originalTitle || "", ...identity.alternateTitles].filter(Boolean));
  const terms = new Set<string>();

  for (const raw of rawTitles) {
    const cleaned = normalizeWhitespace(raw);
    if (!cleaned) continue;
    terms.add(cleaned);

    const noParens = normalizeWhitespace(cleaned.replace(/\([^)]*\)/g, " "));
    if (noParens && noParens !== cleaned) terms.add(noParens);

    const beforeColon = normalizeWhitespace(cleaned.split(":")[0] || "");
    if (beforeColon && beforeColon !== cleaned) terms.add(beforeColon);

    const afterColon = normalizeWhitespace(cleaned.split(":").slice(1).join(":"));
    if (afterColon && afterColon !== cleaned) terms.add(afterColon);

    const withoutEpisode = normalizeWhitespace(
      cleaned.replace(/\bepisode\s+[ivxlcdm0-9]+\b/gi, " ").replace(/[-:]/g, " ")
    );
    if (withoutEpisode && withoutEpisode !== cleaned) terms.add(withoutEpisode);
  }

  return [...terms].slice(0, 6);
}

function toComparableTitle(input: string): string {
  return normalizeTitle(input).replace(/\b(19|20)\d{2}\b/g, " ").replace(/\s+/g, " ").trim();
}

export function findLooseTitleMatch(identity: Identity, candidateTitle: string, candidateYear?: number): number | undefined {
  const candidate = toComparableTitle(candidateTitle);
  const candidateTokens = candidate.split(" ").filter(Boolean);
  if (candidateTokens.length < 2) return undefined;

  if (identity.year !== undefined && candidateYear !== undefined && Math.abs(identity.year - candidateYear) > 1) {
    return undefined;
  }

  const targets = unique([identity.title, identity.originalTitle || "", ...identity.alternateTitles].filter(Boolean))
    .map(toComparableTitle)
    .filter(Boolean);

  for (const target of targets) {
    const targetTokens = target.split(" ").filter(Boolean);
    const shared = targetTokens.filter((token) => candidateTokens.includes(token)).length;
    if (shared < 2) continue;

    if (target.includes(candidate) || candidate.includes(target)) {
      return 0.74;
    }
  }

  return undefined;
}

export function parseFormat(text: string): DiscFormat {
  if (/4K/i.test(text)) return "4K UHD";
  if (/Blu-ray/i.test(text)) return "Blu-ray";
  if (/DVD/i.test(text)) return "DVD";
  if (/Digital/i.test(text)) return "Digital";
  return "Unknown";
}

export function parseAudioList(block: string): AudioInfo[] {
  const lines = block
    .replace(/&nbsp;/g, " ")
    .split(/<br\s*\/?>|\n/gi)
    .map((line) => normalizeWhitespace(stripTags(line)))
    .filter((line) => Boolean(line) && !/^\(?less\)?$/i.test(line));

  return lines.map((line) => {
    const match = line.match(/^([A-Za-z][A-Za-z\s-]+):\s*(.+)$/);
    const language = match?.[1]?.trim() || "Unknown";
    const formatText = match?.[2]?.trim() || line;
    const channelsMatch = formatText.match(/(\d\.\d|Mono|Stereo)/i);

    return {
      language,
      format: formatText,
      channels: channelsMatch?.[1],
      atmos: /Atmos/i.test(formatText),
      dtsX: /DTS:X/i.test(formatText),
      lossless: /LPCM|DTS-HD|TrueHD|PCM/i.test(formatText)
    };
  });
}

export function parseVideoBlock(block: string): VideoInfo {
  const text = stripTags(block);
  const resolution = (text.match(/Resolution:\s*(2160p|1080p|576p|480p)/i)?.[1] || "Unknown") as Resolution;
  const codecText = text.match(/Codec:\s*([^\n]+)/i)?.[1] || "Unknown";
  const aspectRatio = text.match(/Aspect ratio:\s*([^\n]+)/i)?.[1]?.trim();
  const hdr: VideoInfo["hdr"] = [];

  if (/Dolby Vision/i.test(text)) hdr.push("Dolby Vision");
  if (/HDR10\+/i.test(text)) hdr.push("HDR10+");
  if (/\bHDR10\b/i.test(text)) hdr.push("HDR10");
  if (hdr.length === 0) hdr.push("SDR");

  return {
    resolution,
    hdr,
    codec: /HEVC/i.test(codecText) ? "HEVC" : /AVC/i.test(codecText) ? "AVC" : /MPEG-2/i.test(codecText) ? "MPEG-2" : "Unknown",
    aspectRatio
  };
}

export function linesFromHtml(block: string): string[] {
  return block
    .split(/<br\s*\/?>|\n/gi)
    .map((line) => normalizeWhitespace(stripTags(line)))
    .filter(Boolean);
}

export function parseCommentaryTracks(lines: string[]): CommentaryTrack[] {
  return lines
    .filter((line) => /commentary/i.test(line))
    .map((line) => {
      const cleaned = normalizeWhitespace(line.replace(/^audio commentary[:\s-]*/i, "Audio commentary "));
      const participants = cleaned
        .replace(/^audio commentary(?: with| by)?\s*/i, "")
        .split(/,|\/| and /i)
        .map((part) => normalizeWhitespace(part))
        .filter((part) => part && !/commentary/i.test(part) && part.length > 2);

      return {
        description: cleaned,
        participants: participants.length ? participants : undefined
      };
    });
}

export function parseRuntimeFromCut(line: string): number | undefined {
  const match = line.match(/\((\d+):(\d+)\)/);
  if (!match) return undefined;
  return Number(match[1]) + Math.round(Number(match[2]) / 60);
}

export function parseEditionHeader(headerText: string): PartialEdition {
  const clean = normalizeWhitespace(stripTags(headerText));
  const year = extractYear(clean);
  const format = parseFormat(clean);

  const regionCountryMatch = clean.match(/^(Blu-ray|DVD|4K UHD)\s+([A-Z0-9]+)\s+(.+?)\s+-\s+(.+)$/i);
  if (!regionCountryMatch) {
    return {
      title: clean,
      format,
      releaseYear: year
    };
  }

  const regionToken = regionCountryMatch[2];
  const rest = regionCountryMatch[3];
  const label = regionCountryMatch[4].replace(/\[\d{4}.*?\]/, "").trim();

  return {
    title: clean,
    format,
    region: regionToken,
    country: rest.replace(/\s+\[\d{4}.*?\]/, "").trim().replace(/^America$/i, "United States"),
    label,
    releaseYear: year
  };
}

export function firstParagraphValue(block: string): string {
  const cleaned = decodeHtmlEntities(
    block
      .replace(/<a[^>]*>/gi, "")
      .replace(/<\/a>/gi, "")
      .replace(/<\/p>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
  return normalizeWhitespace(cleaned.split("\n").find((line) => line.trim()) || "");
}

export function cutInfoFromLine(line: string): CutInfo {
  const runtimeMinutes = parseRuntimeFromCut(line);
  const description = line.replace(/\(\d+:\d+\)/, "").replace(/\.$/, "").trim();
  return {
    name: /theatrical/i.test(line)
      ? "Theatrical Cut"
      : /director/i.test(line)
        ? "Director's Cut"
        : "Primary Feature",
    runtimeMinutes,
    description,
    isPreferred: /no cuts|uncut|theatrical/i.test(line)
  };
}
